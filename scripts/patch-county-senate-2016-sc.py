#!/usr/bin/env python3
"""
Patches county-level 2016 South Carolina Senate results (Tim Scott vs. Thomas Dixon)
into data-entry/county_senate_results_2016.csv. Neither Wikipedia (no "By county" table
on the 2016 SC Senate page) nor MEDSL's precinct file (has `Straight ticket` rows that
per-county mode/absentee reporting made impossible to reconcile to the certified total
within the usual <1% tolerance - see [[project_county_election_scrape]] memory) could
supply this state. Data below is user-supplied, transcribed from a per-county results
breakdown (originally sourced from a CNN 2016 election results page,
https://www.cnn.com/election/2016/results/states/south-carolina/senate, pasted directly
into chat rather than scraped - CNN's page is a client-rendered SPA with no server-side
county data in any archived snapshot, so this had to come from the user directly).

All 46 counties' Scott+Dixon totals sum to 1,241,609 / 757,022 - an exact match to
senate_past_results.csv's SC 2016 row. oth_2016 is 0 for every county since this source
only reports the top two candidates, not the small write-in/minor-party share
senate_past_results.csv's total_votes implies (~51k statewide, ~2.5%) - same convention
already used elsewhere in this pipeline when a source only has the two major-party lines
(e.g. several Wikipedia-scraped states in other years).

Run from project root: python3 scripts/patch-county-senate-2016-sc.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2016.csv")
YEAR = 2016

# county -> (Scott [R] votes, Dixon [D] votes), as transcribed from the user-supplied
# CNN county breakdown. See module docstring.
SC_2016_RESULTS = {
    "Abbeville": (6669, 3570), "Aiken": (47318, 23681), "Allendale": (796, 2544),
    "Anderson": (57675, 18648), "Bamberg": (2159, 3825), "Barnwell": (4793, 4228),
    "Beaufort": (48125, 26619), "Berkeley": (50423, 25435), "Calhoun": (3834, 3365),
    "Charleston": (97219, 71631), "Cherokee": (14565, 5901), "Chester": (6649, 6578),
    "Chesterfield": (8895, 6783), "Clarendon": (7477, 7214), "Colleton": (9427, 6710),
    "Darlington": (15261, 13066), "Dillon": (5743, 4969), "Dorchester": (39918, 20009),
    "Edgefield": (6662, 4320), "Fairfield": (4265, 6342), "Florence": (31449, 24330),
    "Georgetown": (18737, 11882), "Greenville": (141731, 63441), "Greenwood": (17568, 9797),
    "Hampton": (3265, 4831), "Horry": (90641, 35038), "Jasper": (5152, 5201),
    "Kershaw": (17949, 9486), "Lancaster": (23199, 13350), "Laurens": (17051, 7793),
    "Lee": (2727, 4998), "Lexington": (85385, 29995), "Marion": (5500, 7915),
    "Marlboro": (4132, 5717), "McCormick": (2699, 2241), "Newberry": (10048, 5772),
    "Oconee": (25248, 6722), "Orangeburg": (12256, 25384), "Pickens": (37726, 8858),
    "Richland": (66736, 95045), "Saluda": (5443, 2691), "Spartanburg": (79487, 35239),
    "Sumter": (19462, 22916), "Union": (6727, 4514), "Williamsburg": (5138, 9179),
    "York": (68280, 39249),
}


def load_sc_fips():
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] == "SC":
                m[row["county_name"]] = row["county_id"]
    return m


def main():
    fips_map = load_sc_fips()

    new_rows = []
    unmatched = []
    sum_dem = sum_gop = 0
    for county, (scott, dixon) in SC_2016_RESULTS.items():
        fips = fips_map.get(county)
        if not fips:
            unmatched.append(county)
            continue
        sum_dem += dixon
        sum_gop += scott
        new_rows.append({
            "state": "SC", "county_name": county, "county_id": fips,
            f"dem_{YEAR}": dixon, f"gop_{YEAR}": scott, f"oth_{YEAR}": 0,
            f"total_{YEAR}": scott + dixon,
        })

    if unmatched:
        print(f"WARNING: unmatched counties (not written): {unmatched}")

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "SC"]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old SC rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)")
    print(f"SC totals: dem={sum_dem} gop={sum_gop} (senate_past_results.csv expects dem=757022 gop=1241609)")


if __name__ == "__main__":
    main()
