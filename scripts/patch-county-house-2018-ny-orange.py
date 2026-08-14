#!/usr/bin/env python3
"""
Patches Orange County, NY (36071) into data-entry/county_house_results_2018.csv - the
last remaining NY 2018 gap (Wyoming was already closed earlier this project; Orange was
confirmed genuinely absent from MEDSL, OpenElections, AND Wikipedia during the original
investigation). Closed via a user-supplied election-night screenshot (Sean Patrick
Maloney (D) 65,360/54.33%, James O'Donnell (R) 54,946/45.67%, ">95% Est." reporting).

Candidates match house_past_results.csv's NY-18 2018 row (dem_candidate=Sean Patrick
Maloney, rep_candidate=James O'Donnell) exactly by name. Orange is confirmed
single-district for NY-18 (districts_2020 == "18" only, same pre-2022 map as 2018, no
redistricting occurred between the two years), so no second-district contribution to
account for - unlike the 2016/2020 LA parish patches.

Validated three ways, none contradicted:
1. Scale check: Orange's ~120K House total is a plausible midterm share of its 2016
   presidential turnout (140,753) - about 85%, consistent with normal roll-off.
2. Algebraic check: NY-18's other counties are Putnam (single-district, exact:
   19,002/19,484), Dutchess (also touches NY-19), and Westchester (also touches
   NY-16/17). Reference NY-18 total is 251,599 dem+gop-adjacent... i.e. summed
   dem+gop=251,599. Putnam (38,486) + Orange (120,306) leaves 92,807 needed from
   Dutchess's and Westchester's NY-18 slices - well within their combined multi-district
   totals (378,160), no impossible/negative values.
3. NOT a clean single-source isolatable gap like this session's other patches (LA-04,
   IL Cook/DuPage, MI-02) since Dutchess/Westchester's NY-18 portions can't be
   decomposed from this pipeline's per-county-total data - accepted with the same
   ">95% Est." not-fully-certified caveat as the OH Trumbull/MI Midland patches, not to
   the same to-the-vote confidence as this session's cleaner patches.

Run from project root: python3 scripts/patch-county-house-2018-ny-orange.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2018.csv")

PATCH_ROW = {
    "state": "NY", "county_name": "Orange", "county_id": "36071",
    "dem_2018": 65360, "gop_2018": 54946, "oth_2018": 0, "total_2018": 120306,
    "districts_2018": "18",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "36071" for r in rows):
        print("Orange County (36071) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Orange County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
