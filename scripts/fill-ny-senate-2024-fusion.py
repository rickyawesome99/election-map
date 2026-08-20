"""
Fixes NY's Senate 2024 County AND District data, both of which undercounted
Gillibrand's Democratic vote by not properly combining her cross-endorsed
fusion-party lines (Democrat + Working Families) - the same root-cause pattern
already documented for the House 2020 pipeline
(scripts/fill-county-house-2020-medsl.py's "NY's fusion-voting lines" note).

Found via a State/District/County national-margin cross-check: after the MI/PA
District fix (scripts/fill-house-statewide-senate-2024-mi-pa.py), NY was
responsible for ~97% of the remaining national margin gap between State
(D+2.0) and District/County (D+1.5) - the County file undercounted Gillibrand
by ~540k votes (Wikipedia-scraped, scripts/scrape-county-senate-2024.py, no
fusion-line awareness) and the District file (house_statewide_results.csv)
had a similar ~433k dem undercount PLUS a ~189k rep overcount from its own
prior source.

Both are replaced here from MEDSL's national "U.S. Senate Precinct-Level
Returns 2024" (doi:10.7910/DVN/ZCM3BN, already downloaded for the MI/PA fix -
see data-entry/medsl/senate_2024_precinct.csv), which carries Gillibrand under
both DEMOCRAT and WORKING FAMILIES rows (same candidate string) and
Sapraicone under REPUBLICAN/CONSERVATIVE/"REPUBLICAN/CONSERVATIVE" - grouping
by candidate name naturally combines every fusion line.

Mode handling gotcha found this session, NOT the same as MI/PA: unlike MI/PA
(uniformly mode=="TOTAL" everywhere), NY precincts are a MIX - some report a
pre-summed "TOTAL" row, others only report broken-out modes (ELECTION DAY,
ABSENTEE, AFFIDAVIT, etc., with inconsistent combinations per precinct) and
never a TOTAL row at all. Naively filtering to mode=="TOTAL" only silently
drops every precinct that lacks one (4 of NY's 62 counties, notably big ones,
had ZERO senate rows survive that filter). Fixed by deciding TOTAL-vs-sum-
breakouts per (county_fips, precinct) individually: if that specific precinct
has a TOTAL row, use only it; otherwise sum every mode row it does have.
Reconciles to within 0.02%/0.05% (dem/rep) of senate_past_results.csv's
certified NY state total - an enormous improvement over both prior sources.

County output overwrites NY's 62 rows in data-entry/county_senate_results_2024.csv
(same schema, other states/years untouched) - re-run
scripts/generate-county-senate-data.py after this to regenerate
data/countySenateData.ts.

District output overwrites NY's 26 rows in data-entry/house_statewide_results.csv
and the matching data/forecastData.ts entries, using the same house_2024_precinct.csv
precinct->congressional-district crosswalk as the MI/PA fix (99.97%+ precinct
match rate for NY).
"""
import csv
import re
from collections import defaultdict

DEM_CANDS = {"KIRSTEN E GILLIBRAND"}
REP_CANDS = {"MICHAEL D SAPRAICONE"}
NON_CANDIDATE = {
    "UNDERVOTES", "UNDERVOTES-VOIDS", "VOID", "SCATTER", "WRITE-IN",
    "OVERVOTES", "MISC", "",
}


def bucket(cand):
    if cand in DEM_CANDS:
        return "dem"
    if cand in REP_CANDS:
        return "rep"
    return "oth"


def load_senate_rows():
    """Load NY US SENATE rows, deciding per-precinct whether to use only the
    TOTAL mode row or sum every breakout mode it has."""
    has_total = defaultdict(bool)
    rows = []
    with open("data-entry/medsl/senate_2024_precinct.csv") as f:
        for row in csv.DictReader(f):
            if row["state_po"] != "NY" or row["office"] != "US SENATE":
                continue
            rows.append(row)
            if row["mode"] == "TOTAL":
                has_total[(row["county_fips"], row["precinct"])] = True

    kept = []
    for row in rows:
        key = (row["county_fips"], row["precinct"])
        if has_total[key] and row["mode"] != "TOTAL":
            continue
        kept.append(row)
    return kept


def fix_county(rows):
    county_totals = defaultdict(lambda: {"dem": 0, "rep": 0, "oth": 0})
    for row in rows:
        cand = row["candidate"]
        if cand in NON_CANDIDATE:
            continue
        try:
            v = int(float(row["votes"]))
        except ValueError:
            continue
        county_totals[row["county_fips"]][bucket(cand)] += v

    with open("data-entry/county_senate_results_2024.csv", newline="") as f:
        rdr = list(csv.DictReader(f))
        fieldnames = rdr[0].keys()

    updated = 0
    for r in rdr:
        if r["state"] != "NY":
            continue
        v = county_totals.get(r["county_id"])
        if not v:
            continue
        r["dem_2024"] = str(v["dem"])
        r["gop_2024"] = str(v["rep"])
        r["oth_2024"] = str(v["oth"])
        r["total_2024"] = str(v["dem"] + v["rep"] + v["oth"])
        updated += 1

    with open("data-entry/county_senate_results_2024.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rdr)
    print(f"county_senate_results_2024.csv: {updated} NY rows updated")

    D = sum(v["dem"] for v in county_totals.values())
    R = sum(v["rep"] for v in county_totals.values())
    O = sum(v["oth"] for v in county_totals.values())
    print(f"  NY county totals: dem={D:,} rep={R:,} oth={O:,} total={D+R+O:,}")


def build_crosswalk(house_path):
    """Same per-precinct TOTAL-vs-sum-breakouts logic as load_senate_rows() -
    a handful of NY counties (Schenectady/Cattaraugus/Otsego/Monroe/Clinton)
    never report a TOTAL row in the House file either, only mode breakouts."""
    has_total = defaultdict(bool)
    rows = []
    with open(house_path) as f:
        for row in csv.DictReader(f):
            if row["state_po"] != "NY" or row["office"] != "US HOUSE":
                continue
            rows.append(row)
            if row["mode"] == "TOTAL":
                has_total[(row["county_fips"], row["precinct"])] = True

    weight = defaultdict(lambda: defaultdict(int))
    for row in rows:
        key = (row["county_fips"], row["precinct"])
        if has_total[key] and row["mode"] != "TOTAL":
            continue
        d = row["district"].strip()
        if not d:
            continue
        try:
            v = int(float(row["votes"]))
        except ValueError:
            continue
        weight[key][d] += v
    return weight


def fix_district(rows, crosswalk):
    dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    matched, unmatched = 0, 0
    for row in rows:
        cand = row["candidate"]
        if cand in NON_CANDIDATE:
            continue
        try:
            v = int(float(row["votes"]))
        except ValueError:
            continue
        key = (row["county_fips"], row["precinct"])
        w = crosswalk.get(key)
        if not w:
            unmatched += 1
            continue
        matched += 1
        total_w = sum(w.values())
        if total_w == 0:
            continue
        b = bucket(cand)
        for d, dw in w.items():
            dist_votes[d][b] += v * (dw / total_w)

    print(f"district crosswalk match: {matched} matched, {unmatched} unmatched")
    data = {d: {k: round(val) for k, val in v.items()} for d, v in dist_votes.items()}

    with open("data-entry/house_statewide_results.csv", newline="") as f:
        rows2 = list(csv.reader(f))
    header = rows2[0]
    idx = {h: i for i, h in enumerate(header)}

    updated = 0
    for row in rows2[1:]:
        if row[idx["state_abbr"]] != "NY" or row[idx["year"]] != "2024" or row[idx["race"]] != "Senate":
            continue
        dnum = str(int(row[idx["district_name"]].split("-")[1]))
        v = data.get(dnum.zfill(3)) or data.get(dnum.zfill(2)) or data.get(dnum)
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

    with open("data-entry/house_statewide_results.csv", "w", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(rows2)
    print(f"house_statewide_results.csv: {updated} NY rows updated")

    D = sum(v["dem"] for v in data.values())
    R = sum(v["rep"] for v in data.values())
    O = sum(v["oth"] for v in data.values())
    print(f"  NY district totals: dem={D:,} rep={R:,} oth={O:,} total={D+R+O:,}")

    id_to_votes = {f"36{int(dnum):02d}": v for dnum, v in data.items()}
    update_ts("data/forecastData.ts", id_to_votes)


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
    print(f"  forecastData.ts: {updated} rows updated")


if __name__ == "__main__":
    rows = load_senate_rows()
    fix_county(rows)
    crosswalk = build_crosswalk("data-entry/medsl/house_2024_precinct.csv")
    fix_district(rows, crosswalk)
