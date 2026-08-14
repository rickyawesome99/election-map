#!/usr/bin/env python3
"""
Patches NY's Wyoming County (fips 36121) into data-entry/county_house_results_2018.csv.
Wyoming was one of the two counties left absent after fill-county-house-2018-ny-
openelections.py recovered 60/62 NY counties (see county-scrape memory) - OpenElections'
2018 NY precinct file genuinely has no Wyoming rows either, confirmed at the time.

But unlike Orange County (also absent, and genuinely absent from every source checked,
including MEDSL - 47/62 NY counties present there, Orange not one of them), Wyoming DOES
have rows in MEDSL's 2018 House precinct file (data-entry/medsl/house_2018_precinct.csv,
county_fips 36121.0, district 27.0, office "US HOUSE") - it just wasn't used at the time
because NY as a whole was routed entirely through the dedicated OpenElections script that
year (MEDSL's NY coverage was too thin overall to trust for other counties). Summed across
every fusion-voting party line (Collins: Republican/Conservative/Independence; McMurray:
Democrat/Working Families/Women's Equality Party) per this pipeline's standard NY
fusion-voting handling: Chris Collins (R) 8,623, Nathan McMurray (D) 4,895, Reform
Party's Larry Piegza (oth) 356 - matches house_past_results.csv's NY-27 2018 row
(dem_candidate=Nathan McMurray, rep_candidate=Chris Collins) exactly by name.
UNDERVOTES/OVERVOTES/generic WRITE-IN rows (287/2/10) excluded as non-candidate labels,
same convention as every other MEDSL-sourced county in this pipeline.

Run from project root: python3 scripts/patch-county-house-2018-ny-wyoming.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2018.csv")

PATCH_ROW = {
    "state": "NY", "county_name": "Wyoming", "county_id": "36121",
    "dem_2018": 4895, "gop_2018": 8623, "oth_2018": 356, "total_2018": 13874,
    "districts_2018": "27",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "36121" for r in rows):
        print("Wyoming County (36121) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Wyoming County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
