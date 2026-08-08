#!/usr/bin/env python3
"""
Patches county-level 2020 North Carolina Governor results (Roy Cooper [D] vs. Dan
Forest [R]) into data-entry/county_governor_results_2020.csv.

NC's 2020 gubernatorial Wikipedia page has no "By county" table at all (confirmed by
inspection - only a "Results" section with the statewide box), same structural gap as
MO 2020 - see [[project_county_election_scrape]] memory. User pasted a rendered
per-county results table instead.

All 100 NC counties sum to dem=2,834,790 (exact match to governor_past_results.csv) /
gop=2,586,604 (1 vote under the CSV's 2,586,605 - negligible rounding noise). Source
only reports the top two candidates - oth_2020 is 0 for every county and total_2020 is
just dem+gop, same convention used for MO's 2020 patch and every other county-level
source in this pipeline that lacks a minor-party breakdown.

Run from project root: python3 scripts/patch-county-governor-2020-nc.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2020.csv")
YEAR = 2020

# county -> (Cooper [D] votes, Forest [R] votes), as transcribed from the
# user-supplied per-county results table. See module docstring.
NC_2020_RESULTS = {
    "Alamance": (41979, 42918), "Alexander": (4980, 14980), "Alleghany": (1929, 4085), "Anson": (6116, 4977),
    "Ashe": (4967, 10622), "Avery": (2407, 6894), "Beaufort": (10291, 15710), "Bertie": (6080, 3654),
    "Bladen": (7784, 9096), "Brunswick": (36818, 51703), "Buncombe": (99395, 58153), "Burke": (15028, 28898),
    "Cabarrus": (54665, 59682), "Caldwell": (11926, 30234), "Camden": (1600, 4200), "Carteret": (13293, 28689),
    "Caswell": (5285, 6634), "Catawba": (28267, 53802), "Chatham": (28128, 19937), "Cherokee": (3772, 12349),
    "Chowan": (3399, 4308), "Clay": (1761, 4994), "Cleveland": (18549, 32031), "Columbus": (10309, 15713),
    "Craven": (22436, 29614), "Cumberland": (88278, 55197), "Currituck": (4382, 11293), "Dare": (10485, 13151),
    "Davidson": (26598, 60771), "Davie": (7904, 17104), "Duplin": (9164, 13295), "Durham": (147110, 29989),
    "Edgecombe": (16786, 8487), "Forsyth": (118663, 78475), "Franklin": (17427, 19400), "Gaston": (44074, 69158),
    "Gates": (2679, 3163), "Graham": (1104, 3489), "Granville": (15756, 15411), "Greene": (3991, 4678),
    "Guilford": (180160, 97973), "Halifax": (16098, 9403), "Harnett": (23987, 33049), "Haywood": (14779, 21185),
    "Henderson": (29144, 38028), "Hertford": (7212, 3282), "Hoke": (12597, 8475), "Hyde": (1111, 1351),
    "Iredell": (36375, 63962), "Jackson": (10406, 10519), "Johnston": (45165, 64310), "Jones": (2333, 3128),
    "Lee": (13522, 14937), "Lenoir": (14208, 13906), "Lincoln": (14730, 34711), "McDowell": (6851, 15761),
    "Macon": (7062, 13333), "Madison": (5489, 7352), "Martin": (6277, 6154), "Mecklenburg": (382726, 171123),
    "Mitchell": (2090, 6827), "Montgomery": (5069, 7622), "Moore": (22974, 34311), "Nash": (27692, 24062),
    "New Hanover": (69554, 59305), "Northampton": (6313, 3689), "Onslow": (25653, 43838), "Orange": (65042, 18810),
    "Pamlico": (2881, 4672), "Pasquotank": (10061, 9449), "Pender": (12599, 20854), "Perquimans": (2637, 4756),
    "Person": (9301, 12296), "Pitt": (48995, 37210), "Polk": (4863, 7280), "Randolph": (18929, 53176),
    "Richmond": (9622, 10740), "Robeson": (22281, 23888), "Rockingham": (18197, 28891), "Rowan": (25473, 46676),
    "Rutherford": (10469, 23437), "Sampson": (11890, 16404), "Scotland": (7671, 6821), "Stanly": (9413, 24022),
    "Stokes": (6567, 18849), "Surry": (10872, 25366), "Swain": (3043, 3847), "Transylvania": (9226, 10800),
    "Tyrrell": (811, 975), "Union": (51306, 77305), "Vance": (13160, 7608), "Wake": (410386, 209183),
    "Warren": (6716, 3497), "Washington": (3531, 2623), "Watauga": (17642, 13790), "Wayne": (25589, 29056),
    "Wilkes": (9537, 25469), "Wilson": (22014, 18305), "Yadkin": (4777, 14910), "Yancey": (4147, 7105),
}


def load_nc_fips():
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] == "NC":
                m[row["county_name"].lower()] = (row["county_name"], row["county_id"])
    return m


def main():
    fips_map = load_nc_fips()

    new_rows = []
    unmatched = []
    sum_dem = sum_gop = 0
    for county, (cooper, forest) in NC_2020_RESULTS.items():
        match = fips_map.get(county.lower())
        if not match:
            unmatched.append(county)
            continue
        canonical_name, fips = match
        sum_dem += cooper
        sum_gop += forest
        new_rows.append({
            "state": "NC", "county_name": canonical_name, "county_id": fips,
            f"dem_{YEAR}": cooper, f"gop_{YEAR}": forest, f"oth_{YEAR}": 0,
            f"total_{YEAR}": cooper + forest,
        })

    if unmatched:
        print(f"WARNING: unmatched counties (not written): {unmatched}")

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "NC"]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old NC rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)")
    print(f"NC totals: dem={sum_dem} gop={sum_gop}")
    print("governor_past_results.csv expects: dem=2834790 gop=2586605")


if __name__ == "__main__":
    main()
