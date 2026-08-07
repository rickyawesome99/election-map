#!/usr/bin/env python3
"""
Patches county-level 2016 Louisiana Senate RUNOFF results (Foster Campbell [D] vs. John
Kennedy [R], December 10, 2016) into data-entry/county_senate_results_2016.csv. Neither
Wikipedia (Runoff section has only the statewide infobox, no by-parish table) nor MEDSL's
precinct file (only has the November jungle-primary vote, a different contest entirely)
nor an archived Politico results page (also frozen on the November primary) could supply
this - see [[project_county_election_scrape]] memory. Data below is user-supplied,
pasted directly from a per-parish runoff results page.

All 64 parishes' Campbell/Kennedy totals sum to 347,816 / 536,191 (grand total 884,007) -
an exact match to senate_past_results.csv's LA 2016 row. No oth_2016 needed since the
runoff was a straight two-candidate race (no minor candidates, unlike the November
primary's 24-candidate field).

Run from project root: python3 scripts/patch-county-senate-2016-la.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2016.csv")
YEAR = 2016

# parish -> (Campbell [D] votes, Kennedy [R] votes), as transcribed from the
# user-supplied December 2016 runoff results page. See module docstring.
LA_2016_RUNOFF_RESULTS = {
    "Acadia": (2753, 9887), "Allen": (931, 2424), "Ascension": (6786, 13950),
    "Assumption": (1608, 2616), "Avoyelles": (2463, 4529), "Beauregard": (1114, 4339),
    "Bienville": (1684, 1856), "Bossier": (5711, 16634), "Caddo": (24675, 24732),
    "Calcasieu": (10263, 19365), "Caldwell": (415, 1723), "Cameron": (273, 1169),
    "Catahoula": (573, 1404), "Claiborne": (1159, 1807), "Concordia": (1318, 2045),
    "De Soto": (2566, 3913), "East Baton Rouge": (59627, 55039), "East Carroll": (717, 496),
    "East Feliciana": (2354, 3052), "Evangeline": (1485, 3460), "Franklin": (995, 3155),
    "Grant": (490, 2823), "Iberia": (3593, 10247), "Iberville": (3579, 3272),
    "Jackson": (1033, 2157), "Jefferson": (28180, 49812), "Jefferson Davis": (1433, 4338),
    "Lafayette": (13102, 31784), "Lafourche": (3098, 13670), "LaSalle": (266, 2456),
    "Lincoln": (2842, 4523), "Livingston": (2652, 17471), "Madison": (967, 762),
    "Morehouse": (2016, 2766), "Natchitoches": (2776, 4203), "Orleans": (64196, 13798),
    "Ouachita": (9383, 15995), "Plaquemines": (1740, 4482), "Pointe Coupee": (2138, 3032),
    "Rapides": (7510, 13966), "Red River": (1049, 1145), "Richland": (1297, 2929),
    "Sabine": (654, 3623), "St. Bernard": (1624, 3388), "St. Charles": (3303, 6934),
    "St. Helena": (1613, 1242), "St. James": (2951, 2631), "St. John the Baptist": (5579, 4087),
    "St. Landry": (6854, 7897), "St. Martin": (3557, 9531), "St. Mary": (2558, 6546),
    "St. Tammany": (11362, 42408), "Tangipahoa": (5855, 13079), "Tensas": (862, 655),
    "Terrebonne": (3315, 12780), "Union": (1314, 3619), "Vermilion": (2104, 9279),
    "Vernon": (960, 4835), "Washington": (1959, 5096), "Webster": (3152, 5220),
    "West Baton Rouge": (3054, 4102), "West Carroll": (382, 2011), "West Feliciana": (1272, 2050),
    "Winn": (722, 1952),
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
    for parish, (campbell, kennedy) in LA_2016_RUNOFF_RESULTS.items():
        match = fips_map.get(parish.lower())
        if not match:
            unmatched.append(parish)
            continue
        canonical_name, fips = match
        sum_dem += campbell
        sum_gop += kennedy
        new_rows.append({
            "state": "LA", "county_name": canonical_name, "county_id": fips,
            f"dem_{YEAR}": campbell, f"gop_{YEAR}": kennedy, f"oth_{YEAR}": 0,
            f"total_{YEAR}": campbell + kennedy,
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
    print(f"LA totals: dem={sum_dem} gop={sum_gop} (senate_past_results.csv expects dem=347816 gop=536191)")


if __name__ == "__main__":
    main()
