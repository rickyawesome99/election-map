#!/usr/bin/env python3
"""
Patches AR's Phillips County (fips 05107) into data-entry/county_house_results_2022.csv -
the only one of AR's 75 counties missing from BOTH MEDSL's 2022 House precinct file AND
OpenElections' AR 2022 county-level files (found via a systematic post-batch sweep
comparing every state's output county count against the true count in
data/county_presidential_results_2008_2024.csv - this exact county-level blind spot is
why that sweep is worth running for every future year, not just when something looks
off). Wikipedia had it: AR-01's "By county" table
(https://en.wikipedia.org/wiki/2022_United_States_House_of_Representatives_elections_in_Arkansas)
lists Phillips as Rick Crawford (R) 1,929 (46.45%) / Monte Hodges (D) 2,224 (53.55%),
total 4,153 - matches house_past_results.csv's AR-01 dem_candidate=Monte Hodges,
rep_candidate=Rick Crawford exactly (no oth/write-in votes recorded for this county).

Run from project root: python3 scripts/patch-county-house-2022-ar.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")

PATCH_ROW = {
    "state": "AR", "county_name": "Phillips", "county_id": "05107",
    "dem_2022": 2224, "gop_2022": 1929, "oth_2022": 0, "total_2022": 4153,
    "districts_2022": "1",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "05107" for r in rows):
        print("Phillips County (05107) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Phillips County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
