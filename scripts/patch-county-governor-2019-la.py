#!/usr/bin/env python3
"""
Patches county-level 2019 Louisiana Governor RUNOFF results (John Bel Edwards [D] vs.
Eddie Rispone [R], November 16, 2019) into data-entry/county_governor_results_2019.csv.

LA's 2019 governor race went to a runoff (unlike 2023's outright first-round win), but
Wikipedia's page has no by-parish table for either round (only "Parishes that flipped
from Democratic to Republican" and "By congressional district" sections) - same
structural dead end as LA's 2023 governor race and 2016 Senate runoff - see
[[project_county_election_scrape]] memory. User pasted per-parish results instead.

All 64 parishes sum to dem=774,498 (exact match to governor_past_results.csv) /
gop=734,286 (18 votes over the CSV's 734,268 - negligible rounding noise). Source only
reports the top two candidates (no minor-party breakdown, matching the runoff's
head-to-head format) - oth_2019 is 0 for every parish and total_2019 is just dem+gop,
same convention as LA's 2016/2023 patches.

Run from project root: python3 scripts/patch-county-governor-2019-la.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2019.csv")
YEAR = 2019

# parish -> (Edwards [D] votes, Rispone [R] votes), as transcribed from the
# user-supplied per-parish runoff results. See module docstring.
LA_2019_RESULTS = {
    "Acadia": (5555, 14189), "Allen": (2332, 3911), "Ascension": (19444, 21295), "Assumption": (4583, 4089),
    "Avoyelles": (6009, 7460), "Beauregard": (3189, 8327), "Bienville": (2856, 2667), "Bossier": (12296, 24059),
    "Caddo": (44687, 31946), "Calcasieu": (26949, 29023), "Caldwell": (886, 2644), "Cameron": (624, 1901),
    "Catahoula": (1490, 2838), "Claiborne": (2659, 2987), "Concordia": (3027, 3633), "De Soto": (4827, 5753),
    "East Baton Rouge": (104022, 53419), "East Carroll": (1886, 818), "East Feliciana": (4733, 3608),
    "Evangeline": (4753, 7513), "Franklin": (2775, 4812), "Grant": (1625, 4751), "Iberia": (9226, 14783),
    "Iberville": (8787, 4337), "Jackson": (2093, 3561), "Jefferson": (72192, 54536), "Jefferson Davis": (3493, 6341),
    "Lafayette": (31534, 46643), "Lafourche": (10651, 19104), "LaSalle": (1056, 4897), "Lincoln": (6473, 6791),
    "Livingston": (11790, 28017), "Madison": (2593, 1396), "Morehouse": (4369, 4135), "Natchitoches": (6341, 6002),
    "Orleans": (114812, 13041), "Ouachita": (22994, 27531), "Plaquemines": (3428, 3802), "Pointe Coupee": (5740, 4234),
    "Rapides": (18835, 24611), "Red River": (1827, 1760), "Richland": (3201, 4225), "Sabine": (1668, 6217),
    "St. Bernard": (5585, 4700), "St. Charles": (9389, 9136), "St. Helena": (3801, 1471), "St. James": (6554, 3199),
    "St. John the Baptist": (11357, 3979), "St. Landry": (15644, 14622), "St. Martin": (7781, 12309),
    "St. Mary": (7258, 9046), "St. Tammany": (36337, 54293), "Tangipahoa": (20589, 18444), "Tensas": (1301, 784),
    "Terrebonne": (11029, 19297), "Union": (2493, 5512), "Vermilion": (4721, 14096), "Vernon": (2590, 8454),
    "Washington": (6214, 6678), "Webster": (5666, 7762), "West Baton Rouge": (6501, 4823), "West Carroll": (1085, 3061),
    "West Feliciana": (2785, 2134), "Winn": (1508, 2879),
}


def load_la_fips():
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] == "LA":
                m[row["county_name"].lower()] = (row["county_name"], row["county_id"])
    return m


def main():
    fips_map = load_la_fips()

    new_rows = []
    unmatched = []
    sum_dem = sum_gop = 0
    for parish, (edwards, rispone) in LA_2019_RESULTS.items():
        match = fips_map.get(parish.lower())
        if not match:
            unmatched.append(parish)
            continue
        canonical_name, fips = match
        sum_dem += edwards
        sum_gop += rispone
        new_rows.append({
            "state": "LA", "county_name": canonical_name, "county_id": fips,
            f"dem_{YEAR}": edwards, f"gop_{YEAR}": rispone, f"oth_{YEAR}": 0,
            f"total_{YEAR}": edwards + rispone,
        })

    if unmatched:
        print(f"WARNING: unmatched parishes (not written): {unmatched}")

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "LA"]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old LA rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)")
    print(f"LA totals: dem={sum_dem} gop={sum_gop}")
    print("governor_past_results.csv expects: dem=774498 gop=734268")


if __name__ == "__main__":
    main()
