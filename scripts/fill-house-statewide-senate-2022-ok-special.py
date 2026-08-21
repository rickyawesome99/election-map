#!/usr/bin/env python3
"""
Fills District-view (house_statewide_results.csv) Senate 2022 SPECIAL rows for OK
(Mullin vs Kendra Horn, filling McCarthy's... actually Inhofe's early-retirement
vacancy) - same "percent known, votes blank" bug as the regular-race MO/NH/OR/UT fix,
just on OK's *second* 2022 Senate race, which this project's earlier per-state audit
missed because it explicitly excludes type=="Special" rows when comparing against
State reference totals. Found via the user's own State-vs-District national total
comparison surfacing a ~405K/711K vote gap that traced exactly to OK's blank special
race (both District and County already correctly sum regular+special together for
National Results; District's blank votes just contributed 0).

Source: same MEDSL "U.S. Senate Precinct-Level Returns 2022" file already downloaded
for the MO/NH/OR/UT/GA fix, filtered to OK rows with special=="TRUE" (this file
distinguishes OK's two 2022 races via the special flag, not the stage column - both
races share stage=="GEN"). Crosswalked to congressional districts via
house_2022_precinct.tab, same recipe as fill-house-statewide-senate-2022.py.
"""
import csv, os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_FILE = os.path.join(ROOT, "data-entry/medsl/house_2022_precinct.tab")
SENATE_FILE = os.path.join(ROOT, "data-entry/medsl/senate_2022_precinct.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/house_statewide_results.csv")
TS_PATH = os.path.join(ROOT, "data/forecastData.ts")

DEM_LAST, REP_LAST = "HORN", "MULLIN"  # Kendra Horn (D) vs Markwayne Mullin (R)


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def last_name_token(cand):
    toks = [t for t in cand.strip().split() if t]
    return toks[-1] if toks else ""


# 1. House 2022 OK precinct crosswalk: (county_fips, precinct) -> {district: votes}
house_xwalk = defaultdict(lambda: defaultdict(int))
county_xwalk = defaultdict(lambda: defaultdict(int))
with open(HOUSE_FILE, encoding="utf-8", errors="replace", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        if row["state_po"] != "OK":
            continue
        v = max(to_int(row["votes"]), 0)
        district = row["district"]
        if not district:
            continue
        house_xwalk[(row["county_fips"], row["precinct"])][district] += v
        county_xwalk[row["county_fips"]][district] += v

# 2. Senate 2022 OK SPECIAL precinct rows -> bucket dem/rep/oth by candidate last name
raw = defaultdict(lambda: defaultdict(int))
with open(SENATE_FILE, encoding="utf-8", errors="replace", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        if row["state_po"] != "OK" or row["special"] != "TRUE":
            continue
        v = max(to_int(row["votes"]), 0)
        key = (row["county_fips"], row["precinct"])
        raw[key][row["candidate"].strip()] += v

# 3. Bucket to dem/rep/oth and apportion to district(s) by house-vote weight
results = defaultdict(lambda: defaultdict(float))
unresolved_votes = 0
for (county, precinct), cand_votes in raw.items():
    dem = rep = oth = 0
    for cand, v in cand_votes.items():
        last = last_name_token(cand)
        if last == DEM_LAST:
            dem += v
        elif last == REP_LAST:
            rep += v
        else:
            oth += v
    total = dem + rep + oth
    if total == 0:
        continue
    dmap = house_xwalk.get((county, precinct)) or county_xwalk.get(county)
    if not dmap or sum(dmap.values()) == 0:
        unresolved_votes += total
        continue
    dsum = sum(dmap.values())
    for district, dv in dmap.items():
        w = dv / dsum
        results[district]["dem"] += dem * w
        results[district]["rep"] += rep * w
        results[district]["oth"] += oth * w

print(f"unresolved votes: {unresolved_votes}")

final = {}
for district, d in results.items():
    dem, rep, oth = round(d["dem"]), round(d["rep"]), round(d["oth"])
    total = dem + rep + oth
    dname = f"OK-{int(district):02d}"
    final[dname] = (dem, rep, oth, total)

sd = sum(v[0] for v in final.values())
sr = sum(v[1] for v in final.values())
st_ = sum(v[3] for v in final.values())
print(f"OK special computed: dem={sd:,} rep={sr:,} total={st_:,}")
print("reference (senate_past_results.csv OK 2022 Special): dem=405,389 rep=710,643 total=1,150,481")

# 4. Rewrite house_statewide_results.csv in place
with open(OUT_CSV, newline="") as f:
    reader = csv.reader(f)
    header = next(reader)
    rows = list(reader)
idx = {name: i for i, name in enumerate(header)}

updated = 0
id_to_votes = {}
for row in rows:
    if row[idx["year"]] != "2022" or row[idx["race"]] != "Senate Special" or row[idx["state_abbr"]] != "OK":
        continue
    dname = row[idx["district_name"]]
    if dname not in final:
        continue
    dem, rep, oth, total = final[dname]
    if total == 0:
        continue
    dem_pct = round(100 * dem / total, 1)
    rep_pct = round(100 * rep / total, 1)
    margin = round(rep_pct - dem_pct, 1)
    row[idx["dem_pct"]] = f"{dem_pct:g}"
    row[idx["rep_pct"]] = f"{rep_pct:g}"
    row[idx["margin"]] = f"{margin:g}"
    row[idx["dem_votes"]] = f"{dem:,}"
    row[idx["rep_votes"]] = f"{rep:,}"
    row[idx["vote_margin"]] = f"{rep - dem:,}"
    row[idx["total_votes"]] = f"{total:,}"
    updated += 1
    id_to_votes[row[idx["district_id"]]] = (dem, rep, total, dem_pct, rep_pct)

print(f"updated {updated} rows in {OUT_CSV}")

with open(OUT_CSV, "w", newline="") as f:
    writer = csv.writer(f, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)

# 5. Update the hand-maintained mirror in data/forecastData.ts
with open(TS_PATH) as f:
    lines = f.readlines()

start_idx = next(i for i, l in enumerate(lines) if l.startswith("export const houseStatewideResults"))
end_idx = next(i for i in range(start_idx + 1, len(lines)) if lines[i].startswith("export const electionYear"))

import re
key_re = re.compile(r'^\s*"(\d+)":\s*\[\s*$')
race_re = re.compile(r'"year":\s*2022,\s*"race":\s*"Senate Special"')

current_key = None
ts_updated = 0
for i in range(start_idx, end_idx):
    m = key_re.match(lines[i])
    if m:
        current_key = m.group(1)
    if current_key in id_to_votes and race_re.search(lines[i]):
        dem, rep, total, dem_pct, rep_pct = id_to_votes[current_key]
        indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
        trailing_comma = "," if lines[i].rstrip().endswith(",") else ""
        lines[i] = (
            f'{indent}{{ "year": 2022, "race": "Senate Special", '
            f'"demPct": {dem_pct:g}, "repPct": {rep_pct:g}, '
            f'"demVotes": {dem}, "repVotes": {rep}, "totalVotes": {total} }}{trailing_comma}\n'
        )
        ts_updated += 1
        del id_to_votes[current_key]

with open(TS_PATH, "w") as f:
    f.writelines(lines)

print(f"updated {ts_updated} lines in {TS_PATH}")
if id_to_votes:
    print(f"WARNING: unmatched district_ids: {sorted(id_to_votes)}")
