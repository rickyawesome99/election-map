#!/usr/bin/env python3
"""
Patches county-level 2020 Missouri Governor results (Mike Parson [R] vs. Nicole
Galloway [D]) into data-entry/county_governor_results_2020.csv.

MO's 2020 gubernatorial Wikipedia page has no "By county" table at all (confirmed by
inspection - only a "Results" section with the statewide box), and the only MEDSL file
that would cover it ("State Precinct-Level Returns 2020", 1.17GB, all offices mixed) was
skipped as overkill for a single state - see [[project_county_election_scrape]] memory.
User pasted a rendered per-county results table instead.

All 115 MO counties (114 counties + St. Louis City) sum to gop=1,720,202 / dem=1,225,771,
an exact match to governor_past_results.csv's MO 2020 row. Source only reports the top
two candidates (no minor-party breakdown, despite Parson%+Galloway% not summing to 100%
in every county) - oth_2020 is 0 for every county and total_2020 is just gop+dem, same
convention used for every other county-level source in this pipeline that lacks a
minor-party split (e.g. SC's 2016 Senate patch).

St. Louis City/County share the bare name "St. Louis" in the presidential FIPS CSV (no
built-in disambiguation there, unlike VA's independent cities) - resolved via the same
MO_INDEPENDENT_CITY_OVERRIDES convention already used by the main scraper scripts.

Run from project root: python3 scripts/patch-county-governor-2020-mo.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2020.csv")
YEAR = 2020

MO_INDEPENDENT_CITY_OVERRIDES = {
    "St. Louis City": "29510", "St. Louis County": "29189",
}

# county -> (Parson [R] votes, Galloway [D] votes), as transcribed from the
# user-supplied per-county results table. See module docstring.
MO_2020_RESULTS = {
    "Adair": (6597, 3546), "Andrew": (7195, 2356), "Atchison": (2171, 533), "Audrain": (7643, 2663),
    "Barry": (12356, 2841), "Barton": (5114, 816), "Bates": (6410, 1762), "Benton": (8017, 2179),
    "Bollinger": (5063, 773), "Boone": (40478, 48056), "Buchanan": (22147, 13225), "Butler": (14337, 3349),
    "Caldwell": (3603, 916), "Callaway": (14950, 5611), "Camden": (18837, 5461), "Cape Girardeau": (29127, 10272),
    "Carroll": (3671, 770), "Carter": (2412, 401), "Cass": (37025, 18770), "Cedar": (5771, 1104),
    "Chariton": (3100, 910), "Christian": (34827, 10863), "Clark": (2667, 648), "Clay": (64682, 58224),
    "Clinton": (7518, 3001), "Cole": (26886, 11726), "Cooper": (6224, 2162), "Crawford": (8480, 2230),
    "Dade": (3348, 668), "Dallas": (6646, 1294), "Daviess": (2997, 783), "DeKalb": (3763, 930),
    "Dent": (5768, 1141), "Douglas": (5773, 1046), "Dunklin": (7880, 2281), "Franklin": (37136, 14957),
    "Gasconade": (6192, 1537), "Gentry": (2539, 631), "Greene": (84582, 53519), "Grundy": (3537, 821),
    "Harrison": (3139, 602), "Henry": (7928, 2574), "Hickory": (4037, 929), "Holt": (1928, 361),
    "Howard": (3525, 1387), "Howell": (14947, 3210), "Iron": (3266, 1105), "Jasper": (37714, 13204),
    "Jefferson": (73942, 38866), "Johnson": (15321, 6895), "Knox": (1516, 294), "Laclede": (13681, 2747),
    "Lafayette": (12238, 4451), "Lawrence": (14176, 3185), "Lewis": (3638, 880), "Lincoln": (21014, 7116),
    "Linn": (4275, 1308), "Livingston": (5258, 1332), "McDonald": (7325, 1438), "Macon": (6096, 1575),
    "Madison": (4362, 1126), "Maries": (3875, 815), "Marion": (10082, 3015), "Mercer": (1533, 204),
    "Miller": (10213, 1888), "Mississippi": (3521, 1106), "Moniteau": (5784, 1237), "Monroe": (3472, 900),
    "Montgomery": (4416, 1239), "Morgan": (7372, 1880), "New Madrid": (5338, 1723), "Newton": (22031, 5692),
    "Nodaway": (6900, 2759), "Oregon": (3770, 840), "Osage": (6512, 927), "Ozark": (3963, 769),
    "Pemiscot": (4030, 1490), "Perry": (7595, 1630), "Pettis": (13645, 4876), "Phelps": (13408, 5621),
    "Pike": (5727, 1810), "Platte": (29616, 26293), "Polk": (12319, 2475), "Pulaski": (10261, 3599),
    "Putnam": (1984, 323), "Ralls": (4351, 1216), "Randolph": (7842, 2532), "Ray": (7964, 3279),
    "Reynolds": (2501, 633), "Ripley": (4629, 899), "St. Francois": (19258, 7682), "Ste. Genevieve": (6180, 3011),
    "Saline": (6443, 2832), "Schuyler": (1577, 360), "Scotland": (1584, 342), "Scott": (13535, 3794),
    "Shannon": (3013, 758), "Shelby": (2698, 576), "Stoddard": (11269, 1855), "Stone": (14704, 3399),
    "Sullivan": (1985, 441), "Taney": (20221, 5323), "Texas": (9239, 1795), "Vernon": (7022, 1889),
    "Warren": (12892, 4920), "Washington": (7442, 2121), "Wayne": (4801, 900), "Webster": (14715, 3577),
    "Worth": (869, 205), "Wright": (7343, 1181),
    "St. Louis County": (207535, 317327), "St. Louis City": (23380, 107296),
    "St. Charles": (128230, 87888), "Jackson": (128938, 194273), "St. Clair": (3880, 995),
}


def load_mo_fips():
    m = {}
    dupe_names = set()
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] != "MO":
                continue
            if row["county_name"] in m:
                dupe_names.add(row["county_name"])
            m[row["county_name"]] = row["county_id"]
    for name in dupe_names:
        del m[name]
    m.update(MO_INDEPENDENT_CITY_OVERRIDES)
    return {name.lower(): (name, fips) for name, fips in m.items()}


def main():
    fips_map = load_mo_fips()

    new_rows = []
    unmatched = []
    sum_dem = sum_gop = 0
    for county, (parson, galloway) in MO_2020_RESULTS.items():
        match = fips_map.get(county.lower())
        if not match:
            unmatched.append(county)
            continue
        canonical_name, fips = match
        sum_dem += galloway
        sum_gop += parson
        new_rows.append({
            "state": "MO", "county_name": canonical_name, "county_id": fips,
            f"dem_{YEAR}": galloway, f"gop_{YEAR}": parson, f"oth_{YEAR}": 0,
            f"total_{YEAR}": parson + galloway,
        })

    if unmatched:
        print(f"WARNING: unmatched counties (not written): {unmatched}")

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "MO"]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old MO rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)")
    print(f"MO totals: dem={sum_dem} gop={sum_gop}")
    print("governor_past_results.csv expects: dem=1225771 gop=1720202")


if __name__ == "__main__":
    main()
