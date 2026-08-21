#!/usr/bin/env python3
"""
Fills District-view (house_statewide_results.csv) Senate 2022 gaps for MO/NH/OR/UT
(rows had dem_pct/rep_pct but blank vote counts) and replaces GA's 14 rows (which held
the wrong election - the November general - with the December runoff that actually
decided the seat).

Source: MEDSL "U.S. Senate Precinct-Level Returns 2022" (doi:10.7910/DVN/IAD3XR),
crosswalked to congressional districts via the already-present
data-entry/medsl/house_2022_precinct.tab (same recipe as the 2024 Senate MI/PA fix),
matching on (state_po, county_fips, precinct). GA's runoff-stage precinct names carry an
extra leading "NNN " numeric prefix not present in the House file's precinct names for
the same precinct - stripped as a fallback match. Precincts/write-in buckets with no
match at all fall back to that county's aggregate district-vote-weight split.
"""
import csv, re, os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_FILE = os.path.join(ROOT, "data-entry/medsl/house_2022_precinct.tab")
SENATE_FILE = os.path.join(ROOT, "data-entry/medsl/senate_2022_precinct.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/house_statewide_results.csv")

STATES = ["MO", "NH", "OR", "UT", "GA"]
STAGE = {"MO": "GEN", "NH": "GEN", "OR": "GEN", "UT": "GEN", "GA": "GEN RUNOFF"}
# (dem last name, rep last name) per senate_past_results.csv's 2022 rows
REF = {
    "MO": ("VALENTINE", "SCHMITT"),
    "NH": ("HASSAN", "BOLDUC"),
    "OR": ("WYDEN", "PERKINS"),
    "UT": ("MCMULLIN", "LEE"),
    "GA": ("WARNOCK", "WALKER"),
}
NON_CANDIDATE_LABELS = {
    "OVERVOTES", "UNDERVOTES", "TOTAL VOTES", "TOTAL VOTES CAST", "CONTEST TOTALS",
    "WRITE-IN TOTALS", "NOT ASSIGNED", "SCATTER",
}
PREFIX_RE = re.compile(r"^\d+\s+")


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def last_name_token(cand):
    c = cand.strip()
    if c.startswith("WRITE-IN:"):
        c = c[len("WRITE-IN:"):].strip()
    toks = [t for t in c.split() if t]
    return toks[-1] if toks else ""


# 1. House 2022 precinct crosswalk: (state, county_fips, precinct) -> {district: votes}
#    plus a county-level fallback: (state, county_fips) -> {district: votes}
house_xwalk = defaultdict(lambda: defaultdict(int))
county_xwalk = defaultdict(lambda: defaultdict(int))
with open(HOUSE_FILE, encoding="utf-8", errors="replace", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        st = row["state_po"]
        if st not in STATES:
            continue
        v = max(to_int(row["votes"]), 0)
        district = row["district"]
        if not district:
            continue
        house_xwalk[(st, row["county_fips"], row["precinct"])][district] += v
        county_xwalk[(st, row["county_fips"])][district] += v

print(f"house crosswalk: {len(house_xwalk)} precinct keys across {len(county_xwalk)} counties")

# 2. First pass over senate file: decide TOTAL-vs-breakout mode per (state,county,precinct)
precinct_modes = defaultdict(set)
with open(SENATE_FILE, encoding="utf-8", errors="replace", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        st = row["state_po"]
        if st not in STATES or row["stage"] != STAGE[st]:
            continue
        precinct_modes[(st, row["county_fips"], row["precinct"])].add(row["mode"])

# 3. Second pass: accumulate real candidate votes per (state,county,precinct)
raw = defaultdict(lambda: defaultdict(int))
with open(SENATE_FILE, encoding="utf-8", errors="replace", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        st = row["state_po"]
        if st not in STATES or row["stage"] != STAGE[st]:
            continue
        cand = row["candidate"].strip()
        if cand in NON_CANDIDATE_LABELS:
            continue
        key = (st, row["county_fips"], row["precinct"])
        use_total = "TOTAL" in precinct_modes[key]
        if use_total and row["mode"] != "TOTAL":
            continue
        raw[key][cand] += max(to_int(row["votes"]), 0)

# 4. Bucket to dem/rep/oth and apportion to district(s) by house-vote weight
results = defaultdict(lambda: defaultdict(float))  # (state, district) -> {dem,rep,oth}
unresolved_votes = 0
for (st, county, precinct), cand_votes in raw.items():
    dem_last, rep_last = REF[st]
    dem = rep = oth = 0
    for cand, v in cand_votes.items():
        last = last_name_token(cand)
        if last == dem_last:
            dem += v
        elif last == rep_last:
            rep += v
        else:
            oth += v
    total = dem + rep + oth
    if total == 0:
        continue

    key = (st, county, precinct)
    stripped_key = (st, county, PREFIX_RE.sub("", precinct))
    if key in house_xwalk:
        dmap = house_xwalk[key]
    elif stripped_key in house_xwalk:
        dmap = house_xwalk[stripped_key]
    else:
        dmap = county_xwalk.get((st, county))

    if not dmap or sum(dmap.values()) == 0:
        unresolved_votes += total
        continue

    dsum = sum(dmap.values())
    for district, dv in dmap.items():
        w = dv / dsum
        results[(st, district)]["dem"] += dem * w
        results[(st, district)]["rep"] += rep * w
        results[(st, district)]["oth"] += oth * w

print(f"unresolved votes (no county-level fallback either): {unresolved_votes}")

# 5. Round to whole votes, format district_name
final = {}
for (st, district), d in results.items():
    dem, rep, oth = round(d["dem"]), round(d["rep"]), round(d["oth"])
    total = dem + rep + oth
    dist_num = int(district)
    dname = f"{st}-{dist_num:02d}"
    final[dname] = (dem, rep, oth, total)

# sanity check against senate_past_results.csv state totals
for st in STATES:
    sd = sum(v[0] for k, v in final.items() if k.startswith(st + "-"))
    sr = sum(v[1] for k, v in final.items() if k.startswith(st + "-"))
    st_ = sum(v[3] for k, v in final.items() if k.startswith(st + "-"))
    print(f"{st}: computed dem={sd} rep={sr} total={st_}")

# 6. Rewrite house_statewide_results.csv in place, preserving line order/format
with open(OUT_CSV, newline="") as f:
    reader = csv.reader(f)
    header = next(reader)
    rows = list(reader)

idx = {name: i for i, name in enumerate(header)}
updated = 0
id_to_votes = {}
for row in rows:
    if row[idx["year"]] != "2022" or row[idx["race"]] != "Senate":
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


# 7. Update the hand-maintained mirror in data/forecastData.ts (same dual-write pattern
#    as the 2024 Senate MI/PA fix) - top-level keys are district_id, each holding an
#    array of per-year/race records.
TS_PATH = os.path.join(ROOT, "data/forecastData.ts")
with open(TS_PATH) as f:
    lines = f.readlines()

start_idx = next(i for i, l in enumerate(lines) if l.startswith("export const houseStatewideResults"))
end_idx = next(i for i in range(start_idx + 1, len(lines)) if lines[i].startswith("export const electionYear"))

key_re = re.compile(r'^\s*"(\d+)":\s*\[\s*$')
sen22_re = re.compile(r'"year":\s*2022,\s*"race":\s*"Senate"')

current_key = None
ts_updated = 0
for i in range(start_idx, end_idx):
    m = key_re.match(lines[i])
    if m:
        current_key = m.group(1)
    if current_key in id_to_votes and sen22_re.search(lines[i]):
        dem, rep, total, dem_pct, rep_pct = id_to_votes[current_key]
        indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
        trailing_comma = "," if lines[i].rstrip().endswith(",") else ""
        lines[i] = (
            f'{indent}{{ "year": 2022, "race": "Senate", '
            f'"demPct": {dem_pct:g}, "repPct": {rep_pct:g}, '
            f'"demVotes": {dem}, "repVotes": {rep}, "totalVotes": {total} }}{trailing_comma}\n'
        )
        ts_updated += 1
        del id_to_votes[current_key]  # each district's Senate 2022 line only needs one rewrite

with open(TS_PATH, "w") as f:
    f.writelines(lines)

print(f"updated {ts_updated} lines in {TS_PATH}")
if id_to_votes:
    print(f"WARNING: {len(id_to_votes)} district_ids had no existing 2022 Senate line to replace: {sorted(id_to_votes)}")
