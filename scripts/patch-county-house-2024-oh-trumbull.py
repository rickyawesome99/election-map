#!/usr/bin/env python3
"""
Patches Trumbull County, OH (39155) into data-entry/county_house_results_2024.csv -
the one remaining OH-14 gap after this project's usual sources (MEDSL, OpenElections,
Wikipedia) all came up empty for it.

Source: user-supplied election-night results screenshot (David Joyce (R) 54,766/59.69%,
Brian Bob Kenderes (D) 36,991/40.31%, "Nov 3, 5:33 PM, >95% Est." reporting) - NOT fully
certified, unlike this project's other manual patches, so flagged as slightly
approximate rather than exact. Candidates match house_past_results.csv's OH-14 2024 row
(dem_candidate=Brian Bob Kenderes, rep_candidate=David Joyce) by name.

Validated against the district reference the same way as this project's other patches:
summing Trumbull with OH-14's 4 other already-present counties (Portage/Ashtabula/
Geauga/Lake: 104,029 dem / 189,682 gop) gives 141,020 dem / 244,448 gop, vs.
house_past_results.csv's OH-14 total of 140,431 dem / 243,427 gop - within ~0.4% either
column, consistent with the screenshot's own ">95% Est." (not 100%) reporting caveat.
Accepted as the same tolerance-class "good enough, not fully certified" gap this
project has taken before (e.g. MEDSL's own "unofficial": True MO 2022 St. Louis row).

Run from project root: python3 scripts/patch-county-house-2024-oh-trumbull.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2024.csv")

PATCH_ROW = {
    "state": "OH", "county_name": "Trumbull", "county_id": "39155",
    "dem_2024": 36991, "gop_2024": 54766, "oth_2024": 0, "total_2024": 91757,
    "districts_2024": "14",
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    if any(r["county_id"] == "39155" for r in rows):
        print("Trumbull County (39155) already present - no changes made.")
        return

    rows.append(PATCH_ROW)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched Trumbull County into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
