#!/usr/bin/env python3
"""
Patches FL's Duval (12031) and St. Johns (12109) counties into
data-entry/county_house_results_2022.csv - both entirely absent from MEDSL's 2022 House
precinct file (confirmed: FL-04's only present counties there were Clay/Nassau, missing
~143k combined votes; FL-06's raw rows never touched St. Johns at all), and never
previously checked against OpenElections directly (earlier investigation compared only
against MEDSL and Wikipedia, which genuinely has no "By county" tables for FL 2022 House
at all - every "by county" hit on the wikitext page is an SVG map filename, not a table).

OpenElections DOES have both counties' 2022 general precinct files
(openelections-data-fl/2022/counties/20221108__fl__general__{duval,st_johns}__precinct.csv).
Duval is entirely within FL-04 (LJ Holloway vs. Aaron Bean, matching
house_past_results.csv's FL-04 2022 row by name) - summed: Holloway (D) 75,485,
Bean (R) 61,692. Validated exactly: Clay + Nassau + Duval = 108,402 dem / 165,696 gop,
matching FL-04's house_past_results.csv row to the vote (0 diff either column).

St. Johns is entirely within FL-06 (Joe Hannoush vs. Michael Waltz) - summed: Hannoush
(D) 4,423, Waltz (R) 14,856. FL-06 can't be isolated the same exact way (Lake/Marion/
Volusia each already blend FL-06 with a second district in this project's compiled
output, so no clean single-district county subset exists to check against), but a
statewide check confirms it: before this patch, FL's whole-state dem/gop sum was
79,908/76,549 under house_past_results.csv's FL total; adding these two counties closes
it to a 0/-1 dem/gop diff (effectively exact - the small residual total-level gap is
UnderVotes/OverVotes/generic WriteinVotes, excluded here as non-candidate rows per this
pipeline's standing convention, same treatment applied to every other MEDSL/OE-sourced
county).

Run from project root: python3 scripts/patch-county-house-2022-fl.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")

PATCH_ROWS = [
    {
        "state": "FL", "county_name": "Duval", "county_id": "12031",
        "dem_2022": 75485, "gop_2022": 61692, "oth_2022": 0, "total_2022": 137177,
        "districts_2022": "4",
    },
    {
        "state": "FL", "county_name": "St. Johns", "county_id": "12109",
        "dem_2022": 4423, "gop_2022": 14856, "oth_2022": 0, "total_2022": 19279,
        "districts_2022": "6",
    },
]


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    existing_ids = {r["county_id"] for r in rows}
    new_rows = [r for r in PATCH_ROWS if r["county_id"] not in existing_ids]
    skipped = [r for r in PATCH_ROWS if r["county_id"] in existing_ids]
    for r in skipped:
        print(f"{r['county_name']} County ({r['county_id']}) already present - skipped.")

    if not new_rows:
        return

    rows.extend(new_rows)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Patched {len(new_rows)} FL counties into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
