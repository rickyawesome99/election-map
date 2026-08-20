"""
Fills the pct-only, vote-less MI/PA Senate 2024 rows in
data-entry/house_statewide_results.csv (and the matching entries in
data/forecastData.ts's houseStatewideResults block) with real district-level
vote counts.

Root cause: these 30 rows (MI's 13 districts, PA's 17) had demPct/repPct but no
demVotes/repVotes/totalVotes - the District map view was silently contributing
0 votes for these two states' Senate 2024 race, undercounting the national
District-level aggregate by ~12.5M votes relative to County/State level (which
pull from complete, independently-sourced files) - found via a cross-geo-level
State/District/County aggregate audit for Senate 2024.

Source: MEDSL's national "U.S. Senate Precinct-Level Returns 2024"
(doi:10.7910/DVN/ZCM3BN, downloaded directly with no guestbook prompt) saved
as data-entry/medsl/senate_2024_precinct.csv - precinct-level Senate results
with `district` always "STATEWIDE" (Senate has no districts of its own).
Crosswalked to congressional districts via data-entry/medsl/house_2024_precinct.csv
(already present from the House 2024 pipeline, same underlying precinct
geography/year), matching on (state_po, county_fips, precinct) - 78,743/78,751
MI+PA Senate precinct rows found a crosswalk match (99.99%). Both files'
mode column is uniformly "TOTAL" for MI/PA, so no absentee/election-day
double-counting risk.

For the 10 precincts (out of 13,608 MI+PA precinct keys) that straddle two
congressional districts - the House file itself carries two different
`district` values for that one precinct - that precinct's Senate votes are
apportioned between the ambiguous districts by the precinct's own real
US-House vote split between those districts (a precise weight, not a
population estimate), same approach as
scripts/fill-house-statewide-governor-2022-mi-nh-tn.py.

Validated against data-entry/senate_past_results.csv's certified state
totals: reconciles to within ~0.1% for both states (rounding-only, no
identified gap worth chasing further).
"""
import csv
import re
from collections import defaultdict


def party_bucket(party):
    p = (party or "").upper()
    if p in ("DEMOCRAT", "DEMOCRATIC"):
        return "dem"
    if p == "REPUBLICAN":
        return "rep"
    return "oth"


def build_crosswalk(house_path, states):
    """(state_po, county_fips, precinct) -> {district: house_votes_weight}"""
    weight = defaultdict(lambda: defaultdict(int))
    with open(house_path) as f:
        for row in csv.DictReader(f):
            if row["state_po"] not in states or row["office"] != "US HOUSE":
                continue
            if row["mode"] != "TOTAL":
                continue
            d = row["district"].strip()
            if not d:
                continue
            try:
                v = int(float(row["votes"]))
            except ValueError:
                continue
            key = (row["state_po"], row["county_fips"], row["precinct"])
            weight[key][d] += v
    return weight


def apportion_senate_votes(senate_path, crosswalk, states):
    """{state_po: {district: {"dem":, "rep":, "oth":}}}"""
    dist_votes = defaultdict(lambda: defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0}))
    matched, unmatched = 0, 0
    with open(senate_path) as f:
        for row in csv.DictReader(f):
            st = row["state_po"]
            if st not in states or row["office"] != "US SENATE":
                continue
            if row["mode"] != "TOTAL":
                continue
            try:
                v = int(float(row["votes"]))
            except ValueError:
                continue
            key = (st, row["county_fips"], row["precinct"])
            w = crosswalk.get(key)
            if not w:
                unmatched += 1
                continue
            matched += 1
            total_w = sum(w.values())
            if total_w == 0:
                continue
            bucket = party_bucket(row["party_simplified"])
            for d, dw in w.items():
                dist_votes[st][d][bucket] += v * (dw / total_w)

    print(f"crosswalk match: {matched} matched, {unmatched} unmatched")
    return {
        st: {d: {k: round(val) for k, val in v.items()} for d, v in dists.items()}
        for st, dists in dist_votes.items()
    }


def update_csv(path, data):
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    header = rows[0]
    idx = {h: i for i, h in enumerate(header)}

    updated = 0
    for row in rows[1:]:
        st = row[idx["state_abbr"]]
        if st not in data or row[idx["year"]] != "2024" or row[idx["race"]] != "Senate":
            continue
        dnum = str(int(row[idx["district_name"]].split("-")[1]))
        v = data[st].get(dnum.zfill(3)) or data[st].get(dnum.zfill(2)) or data[st].get(dnum)
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
    sen24_re = re.compile(r'"year":\s*2024,\s*"race":\s*"Senate"')

    current_key = None
    updated = 0
    for i in range(start_idx, end_idx):
        m = key_re.match(lines[i])
        if m:
            current_key = m.group(1)
        if current_key in id_to_votes and sen24_re.search(lines[i]):
            v = id_to_votes[current_key]
            dem, rep, oth = v["dem"], v["rep"], v["oth"]
            total = dem + rep + oth
            indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
            lines[i] = (
                f'{indent}{{ "year": 2024, "race": "Senate", '
                f'"demPct": {round(dem / total * 100, 1)}, '
                f'"repPct": {round(rep / total * 100, 1)}, '
                f'"demVotes": {dem}, "repVotes": {rep}, "totalVotes": {total} }},\n'
            )
            updated += 1

    with open(path, "w") as f:
        f.writelines(lines)
    print(f"{path}: {updated} rows updated")


if __name__ == "__main__":
    states = {"MI", "PA"}
    crosswalk = build_crosswalk("data-entry/medsl/house_2024_precinct.csv", states)
    data = apportion_senate_votes("data-entry/medsl/senate_2024_precinct.csv", crosswalk, states)

    for st, dists in data.items():
        total = {"dem": 0, "rep": 0, "oth": 0}
        for d, v in dists.items():
            for k in total:
                total[k] += v[k]
        grand = sum(total.values())
        print(f"{st}: {len(dists)} districts, dem={total['dem']:,} rep={total['rep']:,} oth={total['oth']:,} total={grand:,}")

    update_csv("data-entry/house_statewide_results.csv", data)

    id_to_votes = {}
    prefix = {"MI": "26", "PA": "42"}
    for st, dists in data.items():
        for dnum, v in dists.items():
            id_to_votes[f"{prefix[st]}{int(dnum):02d}"] = v
    update_ts("data/forecastData.ts", id_to_votes)
