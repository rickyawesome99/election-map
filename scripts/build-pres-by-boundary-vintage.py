#!/usr/bin/env python3
"""
Builds data-entry/pres_by_boundary_vintage.csv — one presidential result per congressional
district per BOUNDARY VINTAGE, i.e. the same election measured on each of the district maps
that were actually used between 2016 and 2024.

WHY THIS EXISTS. District TPL is a property of the 2026 map, but a House race is a fact
about the map it was run on, so old races can't be dropped into a 2026-lines average
(NC-14 2022 is a 32-point different district from NC-14 2026). You can't reconstruct the
House race on new lines either — today's NC-14 is built from pieces of three 2022 districts,
each with different candidates, so the summed "result" corresponds to no election anyone
held. The standard move is to relocate the race by the presidential delta:

    adjHouseMargin(Y) = houseMargin(Y) - [ presP(lines used in Y) - presP(2026 lines) ]

Both terms must be the SAME presidential election, measured on the two different maps.
That is what this table supplies (the 2026-lines side is data/districtPresidentialData.ts).

WHICH PRESIDENTIAL ELECTION PER VINTAGE. The one contemporaneous with the House races that
ran on that map — see PRES_YEAR_FOR_VINTAGE. 2016 and 2018 House races are both scored
against 2016; 2020 and 2022 against 2020; 2024 against 2024.

SOURCES. Three of the five cells already exist in the repo and are used in preference to
the Downballot sheets because they carry vote counts rather than rounded percentages:

    vintage  pres  source
    2016     2016  house_statewide_results.csv (President 2016 rows are on 2016 lines)
    2018     2016  same, EXCEPT Pennsylvania — the only state that redrew for 2018 —
                   which comes from the Downballot 2018-lines sheet
    2020     2020  house_statewide_results.csv (President 2020 rows are on 2020 lines)
    2022     2020  Downballot 2022-lines sheet; the 2022 redraw was universal so no
                   in-repo source covers it
    2024     2024  house_statewide_results.csv (President 2024 rows are on 2024 lines)

Those three vintage claims were verified county-by-district on 2026-09-16; see
data-entry/downballot/README.md for the discriminating test.

CONVENTIONS. Percentages are share of the FULL total (third parties included), matching
every other margin in the TPL model; margin is R-positive. Vote columns are blank for the
Pennsylvania 2018-vintage rows because the Downballot sheet publishes percentages only —
nothing reads the votes, the model uses percentages.

DC is carried in every vintage (its delegate district's boundary never changes, so the
2022-vintage row is legitimately the same figure as the 2020-vintage one). It has no House
race, so nothing consumes it; it is here so the table is complete per map.

Usage: python3 scripts/build-pres-by-boundary-vintage.py
"""
import csv, os, re, sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HSR = os.path.join(ROOT, "data-entry/house_statewide_results.csv")
DB18 = os.path.join(ROOT, "data-entry/downballot/pres_2008_2016_by_2018_lines.csv")
DB22 = os.path.join(ROOT, "data-entry/downballot/pres_2020_by_2022_lines.csv")
OUT = os.path.join(ROOT, "data-entry/pres_by_boundary_vintage.csv")

PRES_YEAR_FOR_VINTAGE = {2016: 2016, 2018: 2016, 2020: 2020, 2022: 2020, 2024: 2024}

STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09",
    "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17",
    "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24",
    "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54",
    "WI": "55", "WY": "56",
}


def num(s):
    """Parse a sheet cell: strips %, thousands separators and stray whitespace."""
    s = (s or "").replace("%", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def normalize_code(code):
    """Downballot writes at-large seats 'AK-AL'; this repo writes them 'AK-01' (DC keeps
    'DC-AL', matching house_statewide_results.csv)."""
    code = code.strip()
    m = re.match(r"^([A-Z]{2})-(AL|\d{1,2})$", code)
    if not m:
        return None
    st, d = m.groups()
    if d == "AL":
        return "DC-AL" if st == "DC" else f"{st}-01"
    return f"{st}-{int(d):02d}"


def district_id(code):
    """Only for Downballot rows — in-repo rows carry their own id. DC's delegate district
    is GEOID 1198 in the congressional geometry this app uses, not 1101."""
    st, d = code.split("-")
    if st == "DC":
        return "1198"
    return str(int(STATE_FIPS[st] + f"{int(d):02d}"))


def sheet_rows(path, skip):
    with open(path, newline="") as f:
        for r in list(csv.reader(f))[skip:]:
            if r and re.match(r"^[A-Z]{2}-", r[0].strip()):
                yield [c.strip() for c in r]


# ── in-repo presidential rows, keyed by (pres year, district code) ───────────────
hsr = {}
with open(HSR, newline="") as f:
    for r in csv.DictReader(f):
        if r["race"] != "President":
            continue
        d, p, t = num(r["dem_votes"]), num(r["rep_votes"]), num(r["total_votes"])
        if not t:
            continue
        hsr[(int(r["year"]), r["district_name"])] = (r["district_id"], d, p, t)

# ── Pennsylvania on 2018 lines (percentages only: Clinton col 3, Trump col 4) ────
pa18 = {}
for r in sheet_rows(DB18, 2):
    code = normalize_code(r[0])
    if code and code.startswith("PA-"):
        pa18[code] = (num(r[3]), num(r[4]))

# ── all 435 on 2022 lines (Biden, Trump, Total as vote counts) ───────────────────
by22 = {}
for r in sheet_rows(DB22, 1):
    code = normalize_code(r[0])
    if code:
        by22[code] = (num(r[3]), num(r[4]), num(r[5]))

rows = []
problems = []


def emit(vintage, code, dem_pct, rep_pct, dv, rv, tv, source, did=None):
    rows.append({
        "boundary_year": vintage,
        "district_id": did or district_id(code),
        "district_name": code,
        "pres_year": PRES_YEAR_FOR_VINTAGE[vintage],
        "dem_pct": round(dem_pct, 2),
        "rep_pct": round(rep_pct, 2),
        "margin": round(rep_pct - dem_pct, 2),
        "dem_votes": int(dv) if dv else "",
        "rep_votes": int(rv) if rv else "",
        "total_votes": int(tv) if tv else "",
        "source": source,
    })


for vintage, pres in PRES_YEAR_FOR_VINTAGE.items():
    if vintage == 2022:
        for code, (dv, rv, tv) in sorted(by22.items()):
            emit(vintage, code, dv / tv * 100, rv / tv * 100, dv, rv, tv,
                 "downballot/pres_2020_by_2022_lines.csv")
        dc = hsr.get((pres, "DC-AL"))
        if dc:
            did, dv, rv, tv = dc
            emit(vintage, "DC-AL", dv / tv * 100, rv / tv * 100, dv, rv, tv,
                 "house_statewide_results.csv (DC boundary is invariant)", did)
        continue

    for (year, code), (did, dv, rv, tv) in sorted(hsr.items()):
        if year != pres:
            continue
        if vintage == 2018 and code.startswith("PA-"):
            continue  # replaced below
        emit(vintage, code, dv / tv * 100, rv / tv * 100, dv, rv, tv,
             "house_statewide_results.csv", did)
    if vintage == 2018:
        for code, (dpct, rpct) in sorted(pa18.items()):
            emit(vintage, code, dpct, rpct, None, None, None,
                 "downballot/pres_2008_2016_by_2018_lines.csv")

# ── validation ───────────────────────────────────────────────────────────────────
per_vintage = defaultdict(set)
for r in rows:
    per_vintage[r["boundary_year"]].add(r["district_name"])
for v, codes in sorted(per_vintage.items()):
    real = {c for c in codes if c != "DC-AL"}
    if len(real) != 435:
        problems.append(f"vintage {v}: {len(real)} districts, expected 435")
if len(pa18) != 18:
    problems.append(f"expected 18 Pennsylvania rows on 2018 lines, got {len(pa18)}")
for r in rows:
    if not (0 <= r["dem_pct"] <= 100 and 0 <= r["rep_pct"] <= 100):
        problems.append(f"{r['boundary_year']} {r['district_name']}: pct out of range")
    if r["dem_pct"] + r["rep_pct"] > 100.5:
        problems.append(f"{r['boundary_year']} {r['district_name']}: shares sum > 100 "
                        f"({r['dem_pct']}+{r['rep_pct']}) — two-party data leaked in?")

# The 2018 vintage must equal the 2016 vintage everywhere EXCEPT Pennsylvania, and the
# 2022 vintage must differ from the 2020 one in every state that redrew (i.e. all of them).
idx = {(r["boundary_year"], r["district_name"]): r["margin"] for r in rows}
changed = {c.split("-")[0] for (v, c), m in idx.items()
           if v == 2018 and abs(m - idx.get((2016, c), m)) > 1.0}
if changed != {"PA"}:
    problems.append(f"2016->2018 vintage differs in {sorted(changed)}, expected only PA")

with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

print(f"Wrote {len(rows)} rows -> {OUT}")
for v, codes in sorted(per_vintage.items()):
    print(f"  {v} lines / {PRES_YEAR_FOR_VINTAGE[v]} pres: {len(codes)} districts")
if problems:
    print("\nPROBLEMS:")
    for p in problems[:20]:
        print("  " + p)
    sys.exit(1)
print("\nAll validation checks passed.")
