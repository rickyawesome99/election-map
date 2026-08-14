#!/usr/bin/env python3
"""
Patches TX-08's 2016 county-level results into data-entry/county_house_results_2016.csv
- closes this project's last remaining real (non-permanent) House gap. TX-08 (Kevin
Brady, unopposed) was previously documented as a genuine unrecovered gap: MEDSL's file
has zero rows for the entire district, and unlike OK-01/OK-03/LA-04/FL-25's literal 0/0
unopposed races, house_past_results.csv's TX-08 2016 row DOES carry a real vote count
(rep_votes=236,379) - a genuine uncontested-but-counted race, not a "no election held"
case, so this is a real data gap rather than a votesKnown:false coloring fix.

Source: user-supplied official county-level results table (9 counties). Since Brady
ran unopposed (no Democrat on the ballot), every vote is Republican - dem=0 for all 9.

**Validated exactly**: summing all 9 counties' votes gives 236,379 - matching
house_past_results.csv's TX-08 rep_votes column to the exact vote, 0 diff.

7 of the 9 counties (Grimes, Houston, Madison, Montgomery, San Jacinto, Trinity,
Walker) were entirely new rows (previously flagged "missing" by this project's
sweep - TX-08 is their only district). The other 2 (Harris, Leon) already had 2016
rows from other TX districts they also touch (Harris alone spans 8 other Houston-area
districts) - this script ADDS TX-08's contribution on top of those existing rows
rather than overwriting them.

Run from project root: python3 scripts/patch-county-house-2016-tx08.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2016.csv")
YEAR = 2016

# All votes go to Brady (R) - unopposed, no Democrat on the ballot.
COUNTIES = {
    "48185": ("Grimes", 7467), "48201": ("Harris", 22666), "48225": ("Houston", 6314),
    "48289": ("Leon", 3013), "48313": ("Madison", 3446), "48339": ("Montgomery", 165316),
    "48407": ("San Jacinto", 8220), "48455": ("Trinity", 4761), "48471": ("Walker", 15176),
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    by_fips = {r["county_id"]: r for r in rows}

    for fips, (name, gop) in COUNTIES.items():
        if fips in by_fips:
            r = by_fips[fips]
            r[f"gop_{YEAR}"] = str(int(r[f"gop_{YEAR}"]) + gop)
            r[f"total_{YEAR}"] = str(int(r[f"total_{YEAR}"]) + gop)
            existing = [d for d in r[f"districts_{YEAR}"].split(";") if d]
            if "8" not in existing:
                existing.append("8")
            r[f"districts_{YEAR}"] = ";".join(sorted(existing))
        else:
            new_row = {
                "state": "TX", "county_name": name, "county_id": fips,
                f"dem_{YEAR}": 0, f"gop_{YEAR}": gop, f"oth_{YEAR}": 0,
                f"total_{YEAR}": gop, f"districts_{YEAR}": "8",
            }
            rows.append(new_row)
            by_fips[fips] = new_row

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    total = sum(v for _, v in COUNTIES.values())
    print(f"Patched 9 TX counties (7 new, 2 added onto existing rows) into {OUT_CSV}.")
    print(f"Sum: {total} (reference TX-08 rep_votes: 236,379)")


if __name__ == "__main__":
    main()
