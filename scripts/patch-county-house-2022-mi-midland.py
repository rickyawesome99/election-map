#!/usr/bin/env python3
"""
Patches Midland County, MI (26111) into data-entry/county_house_results_2022.csv -
the one remaining MI gap, closed via two user-supplied election-night screenshots
(same ">95% Est." partial-reporting format as the OH Trumbull patch).

Root cause finally understood: Midland County isn't just incompletely covered by
OpenElections' 2022 file, as originally assumed (only 6/44 precincts had "U.S. House"
rows) - it's genuinely SPLIT between two districts, MI-02 and MI-08. Those 6 precincts
IS the whole MI-02 portion, not a partial extract - confirmed because the screenshot's
MI-02 numbers (Moolenaar 2,993 / Hilliard 1,211 / Hewer 82) match OpenElections' own
raw MI-02-only rows for Midland EXACTLY (2,993/1,211/82, plus 7 write-in votes the
screenshot doesn't separately display) - independent cross-validation from a completely
different source. The other 38 precincts are MI-08, which the OpenElections file never
had "U.S. House" rows for at all (a separate, still-unexplained gap in that file, not
investigated further since the screenshot supplies real numbers directly).

Candidates match house_past_results.csv's 2022 rows: MI-02 (dem_candidate=Jerry
Hilliard, rep_candidate=John Moolenaar), MI-08 (dem_candidate=Daniel Kildee,
rep_candidate=Paul Junge). Combined: dem (Hilliard+Kildee) = 1,211 + 16,621 = 17,832;
gop (Moolenaar+Junge) = 2,993 + 18,305 = 21,298; oth (Hewer+Goodwin, Libertarian +
Working Class Party) = 82 + 881 = 963; total = 40,093.

Run from project root: python3 scripts/patch-county-house-2022-mi-midland.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")

PATCH_ROW = {
    "state": "MI", "county_name": "Midland", "county_id": "26111",
    "dem_2022": 17832, "gop_2022": 21298, "oth_2022": 963, "total_2022": 40093,
    "districts_2022": "2;8",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "26111" for r in rows):
        print("Midland County (26111) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Midland County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
