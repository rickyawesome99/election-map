#!/usr/bin/env python3
"""
Patches Power County, ID (16077) into data-entry/county_house_results_2022.csv - the
last of this project's 3 remaining "confirmed dead end" House gaps, closed via a
user-supplied election-night screenshot (same ">95% Est." partial-reporting format as
the OH Trumbull and MI Midland patches). Absent from MEDSL, OpenElections (ID has no
2022 folder at all), and Wikipedia (ID's 2022 House page has zero "By county" tables) -
confirmed exhaustively during the 2026-08-13 missing-county sweep before this screenshot
closed it directly.

Candidates match house_past_results.csv's ID-02 2022 row (dem_candidate=Wendy Norman,
rep_candidate=Michael Simpson) by name: Simpson (R) 1,477/76.45%, Norman (D) 455/23.55%.

Run from project root: python3 scripts/patch-county-house-2022-id-power.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")

PATCH_ROW = {
    "state": "ID", "county_name": "Power", "county_id": "16077",
    "dem_2022": 455, "gop_2022": 1477, "oth_2022": 0, "total_2022": 1932,
    "districts_2022": "2",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "16077" for r in rows):
        print("Power County (16077) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Power County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
