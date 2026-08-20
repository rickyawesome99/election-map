"""
Fills the pct-only, vote-less MI/NH/TN Governor 2022 rows in
data-entry/house_statewide_results.csv (and the matching entries in
data/forecastData.ts's houseStatewideResults block) with real district-level
vote counts.

Root cause: these 24 rows (MI's 13 districts, NH's 2, TN's 9) had demPct/repPct
but no demVotes/repVotes/totalVotes - the District map view was silently
contributing 0 votes for these three states' Governor 2022 race, undercounting
the national District-level aggregate by ~6.8M votes relative to County/State
level (which pull from complete sources).

Sources (precinct-level, so no county-splits-multiple-CDs approximation
needed):
- MI, NH: MEDSL "Precinct-Level Returns 2022 by Individual State" dataset
  (doi:10.7910/DVN/UYQIEP) - one file per state with ALL offices together
  (President/Senate/Governor/US House/state offices), so the same file's own
  "US HOUSE" rows (which carry a real `district` field) double as a
  precinct -> congressional-district crosswalk for that file's "GOVERNOR" rows.
- TN: this MEDSL dataset has no Governor rows for TN at all (confirmed - only
  State House/Senate/constitutional amendments/US House). Used OpenElections'
  TN 2022 general precinct file instead
  (openelections-data-tn/2022/20221108__tn__general__precinct.csv), same
  crosswalk approach via its own "U.S. House" rows.

For split precincts that straddle two districts (a single precinct label
covers voters in two different CDs - common in TN's gerrymandered map, plus
handful of MI townships), that precinct's Governor votes are apportioned
between the ambiguous districts by the precinct's own real US-House vote split
between those districts (a precise weight, not a population estimate).

Validated against data-entry/governor_past_results.csv's certified state
totals: NH and TN reconcile to within ~0.01% (rounding-only). MI reconciles to
~98% (~2% gap) - Wayne County's Brownstown Township + Grosse Pointe Shores and
Midland County (itself split MI-02/MI-08) have literally zero "US HOUSE" rows
in MEDSL's MI file for those precincts, a confirmed source gap (the same
Midland gap already documented in the House 2022 pipeline, see
scripts/fill-county-house-2022-medsl.py) - not chased further, same tolerance
class as this project's other accepted small residual gaps.

Requires data-entry/medsl/{mi22,nh22,tn22}_governor_precinct.tab (MI/NH from
MEDSL doi:10.7910/DVN/UYQIEP file IDs 13996911/10855179) and
data-entry/medsl/tn22_openelections_precinct.csv (OpenElections, fetched via
raw.githubusercontent.com) to already be present.
"""
import csv
import json
import re
from collections import defaultdict

NON_CANDIDATE_LABELS = {
    "BALLOTS CAST", "CAST VOTES", "TOTAL", "UNDERVOTES", "OVERVOTES",
    "REJECTED WRITE-INS", "REJECTED", "UNRESOLVED WRITE-IN", "UNRESOLVED",
    "UNQUALIFIED WRITE-INS", "UNASSIGNED WRITE-INS", "",
}


def party_bucket(party):
    p = (party or "").upper()
    if p == "DEMOCRAT" or p == "DEMOCRATIC":
        return "dem"
    if p == "REPUBLICAN":
        return "rep"
    return "oth"


def process_medsl_state_file(path):
    """MI/NH MEDSL per-state file: tab-delimited, quoted fields, one file has
    every office. Returns {district_num_str: {"dem":, "rep":, "oth":}}."""
    with open(path, encoding="utf-8") as f:
        r = csv.reader(f, delimiter="\t")
        header = next(r)
        idx = {h.strip('"'): i for i, h in enumerate(header)}
        rows = list(r)

    def g(row, col):
        return row[idx[col]].strip('"')

    # precinct -> district -> weight, built from this file's own US HOUSE rows
    # (mode == TOTAL only, to avoid double-counting precincts that ALSO
    # report separate ABSENTEE/ELECTION DAY breakout rows for the same votes)
    weight = defaultdict(lambda: defaultdict(int))
    for row in rows:
        if g(row, "office") != "US HOUSE" or g(row, "mode") != "TOTAL":
            continue
        d = g(row, "district").strip()
        if not d:
            continue
        try:
            v = int(g(row, "votes"))
        except ValueError:
            continue
        key = (g(row, "county_fips"), g(row, "precinct"))
        weight[key][d] += v

    dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for row in rows:
        if g(row, "office") != "GOVERNOR" or g(row, "mode") != "TOTAL":
            continue
        if g(row, "candidate").upper() in NON_CANDIDATE_LABELS:
            continue
        key = (g(row, "county_fips"), g(row, "precinct"))
        try:
            v = int(g(row, "votes"))
        except ValueError:
            continue
        w = weight.get(key)
        if not w:
            continue  # confirmed source gap for this precinct, see docstring
        total_w = sum(w.values())
        if total_w == 0:
            continue
        bucket = party_bucket(g(row, "party_simplified"))
        for d, dw in w.items():
            dist_votes[d][bucket] += v * (dw / total_w)

    return {
        d: {k: round(val) for k, val in v.items()}
        for d, v in dist_votes.items()
    }


def process_tn_openelections(path):
    """TN OpenElections precinct file: plain CSV, its own 'district' column
    covers the 'U.S. House' rows only."""
    with open(path) as f:
        rows = list(csv.DictReader(f))

    weight = defaultdict(lambda: defaultdict(int))
    for row in rows:
        if row["office"] != "U.S. House":
            continue
        d = row["district"].strip()
        if not d or d == "NA":
            continue
        try:
            v = int(row["votes"])
        except ValueError:
            continue
        key = (row["county"], row["precinct"])
        weight[key][d] += v

    dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for row in rows:
        if row["office"] != "Governor":
            continue
        key = (row["county"], row["precinct"])
        try:
            v = int(row["votes"])
        except ValueError:
            continue
        w = weight.get(key)
        if not w:
            continue  # 10 votes total statewide, Montgomery County - trivial gap
        total_w = sum(w.values())
        if total_w == 0:
            continue
        bucket = party_bucket(row["party"])
        for d, dw in w.items():
            dist_votes[d][bucket] += v * (dw / total_w)

    return {
        d: {k: round(val) for k, val in v.items()}
        for d, v in dist_votes.items()
    }


def update_csv(path, data):
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    header = rows[0]
    idx = {h: i for i, h in enumerate(header)}

    updated = 0
    for row in rows[1:]:
        st = row[idx["state_abbr"]]
        if st not in data or row[idx["year"]] != "2022" or row[idx["race"]] != "Governor":
            continue
        dnum = str(int(row[idx["district_name"]].split("-")[1]))
        v = data[st].get(dnum) or data[st].get(dnum.zfill(3)) or data[st].get(dnum.zfill(2))
        if v is None:
            continue
        dem, rep, oth = v["dem"], v["rep"], v["oth"]
        total = dem + rep + oth
        row[idx["dem_pct"]] = f"{round(dem / total * 100, 1)}"
        row[idx["rep_pct"]] = f"{round(rep / total * 100, 1)}"
        row[idx["margin"]] = f"{round(round(rep / total * 100, 1) - round(dem / total * 100, 1), 1)}"
        row[idx["dem_votes"]] = f"{dem:,}"
        row[idx["rep_votes"]] = f"{rep:,}"
        row[idx["vote_margin"]] = f"{rep - dem:,}"
        row[idx["total_votes"]] = f"{total:,}"
        updated += 1

    with open(path, "w", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(rows)
    print(f"{path}: {updated} rows updated")


def update_ts(path, id_to_votes):
    with open(path) as f:
        lines = f.readlines()

    start_idx = next(i for i, l in enumerate(lines) if l.startswith("export const houseStatewideResults"))
    end_idx = next(i for i, l in enumerate(lines) if l.startswith("export const electionYear"))

    key_re = re.compile(r'^\s*"(\d{4})":\s*\[\s*$')
    gov22_re = re.compile(r'"year":\s*2022,\s*"race":\s*"Governor"')

    current_key = None
    updated = 0
    for i in range(start_idx, end_idx):
        m = key_re.match(lines[i])
        if m:
            current_key = m.group(1)
        if current_key in id_to_votes and gov22_re.search(lines[i]):
            v = id_to_votes[current_key]
            dem, rep, oth = v["dem"], v["rep"], v["oth"]
            total = dem + rep + oth
            indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
            lines[i] = (
                f'{indent}{{ "year": 2022, "race": "Governor", '
                f'"demPct": {round(dem / total * 100, 1)}, '
                f'"repPct": {round(rep / total * 100, 1)}, '
                f'"demVotes": {dem}, "repVotes": {rep}, "totalVotes": {total} }},\n'
            )
            updated += 1

    with open(path, "w") as f:
        f.writelines(lines)
    print(f"{path}: {updated} rows updated")


if __name__ == "__main__":
    mi = process_medsl_state_file("data-entry/medsl/mi22_governor_precinct.tab")
    nh = process_medsl_state_file("data-entry/medsl/nh22_governor_precinct.tab")
    tn = process_tn_openelections("data-entry/medsl/tn22_openelections_precinct.csv")

    data = {"MI": mi, "NH": nh, "TN": tn}
    update_csv("data-entry/house_statewide_results.csv", data)

    id_to_votes = {}
    for dnum, v in mi.items():
        id_to_votes[f"26{int(dnum):02d}"] = v
    for dnum, v in nh.items():
        id_to_votes[f"33{int(dnum):02d}"] = v
    for dnum, v in tn.items():
        id_to_votes[f"47{int(dnum):02d}"] = v
    update_ts("data/forecastData.ts", id_to_votes)
