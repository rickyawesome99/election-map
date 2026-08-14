#!/usr/bin/env python3
"""
Adds rows for counties whose only House district that cycle was a literal, permanent
0/0 unopposed-race gap (per `data-entry/house_past_results.csv` itself - no source has
ever had real vote data for these races, confirmed across MEDSL/OpenElections/Wikipedia
during the 2026-08-13 missing-county sweep). Per user request, these should show up
colored on the map (100% for the known winner) rather than gray "no data" - but since
there's no real vote count to report, every row here is written as 0/0/0/0
(dem/gop/oth/total), same as `house_past_results.csv`'s own convention for these races.
`generate-county-house-data.py` is responsible for turning a 0-total county whose
district(s) are ALL literal-0/0 unopposed races into a demPct/repPct of 0/100 or 100/0
with `votesKnown: false` (so the county page shows "Uncontested - vote count not
available" instead of a fabricated "0 votes" line, same UI convention this project
already uses for district/state-level uncontested races via `PastResult`'s optional
vote fields) - it does NOT derive that from these 0/0/0/0 rows by the normal two_pct()
math, which would otherwise read as a 0-0 "tie".

Three (state, year) cells, all confirmed via the 2026-08-13 missing-county sweep:
- **OK 2016, OK-01 (Jim Bridenstine, unopposed after his opponent withdrew - no general
  election was actually held)**: Tulsa, Wagoner, Washington - confirmed wholly within
  OK-01 and OK's own state-level total already matches house_past_results.csv exactly
  without them (see county-scrape memory).
- **OK 2024, OK-03 (Frank Lucas, unopposed)**: 28 counties, confirmed the entire
  district via MEDSL/OpenElections/Wikipedia all having zero rows for OK-03 specifically
  under any office (see 2024 House batch 4 above).
- **LA 2022, LA-04 (Mike Johnson, unopposed)**: 15 parishes - resolved this session via
  the Census Bureau's authoritative 118th-Congress parish-to-district relationship file
  (`tab20_cd11820_county20_st22.txt`, the correct vintage for the 2022 election map -
  this project's OWN `public/congressional-districts-2022.json` turned out to actually
  contain the LATER, post-2024-court-order map, confirmed by cross-checking known-good
  LA-05 parishes like Grant/Jackson/Lincoln, which that file mis-locates in LA-04 - a
  real bug in this repo's district geometry worth fixing separately, NOT used here).
  All 15 parishes came back 100% land-area within LA-04, resolving the "6 unresolved
  parishes" ambiguity Wikipedia's prose left open in the original investigation.
- **FL 2020, FL-25 (Mario Diaz-Balart, unopposed)**: Hendry - originally investigated
  and set aside as "not a real gap" without actually being added here; added later at
  user request once the unopposed-race-coloring feature existed. Confirmed via
  districts_2016/2018 both reading "25" only (single-district, no FL map change before
  2020) that Hendry is wholly within FL-25.

Run from project root: python3 scripts/patch-county-house-unopposed.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")

ROWS_BY_YEAR = {
    2016: [
        ("OK", "Tulsa", "40143", "1"), ("OK", "Wagoner", "40145", "1"),
        ("OK", "Washington", "40147", "1"),
    ],
    2020: [
        ("FL", "Hendry", "12051", "25"),
    ],
    2022: [
        ("LA", "Allen", "22003", "4"), ("LA", "Beauregard", "22011", "4"),
        ("LA", "Bienville", "22013", "4"), ("LA", "Bossier", "22015", "4"),
        ("LA", "Caddo", "22017", "4"), ("LA", "Claiborne", "22027", "4"),
        ("LA", "De Soto", "22031", "4"), ("LA", "Evangeline", "22039", "4"),
        ("LA", "Natchitoches", "22069", "4"), ("LA", "Red River", "22081", "4"),
        ("LA", "Sabine", "22085", "4"), ("LA", "St. Landry", "22097", "4"),
        ("LA", "Union", "22111", "4"), ("LA", "Vernon", "22115", "4"),
        ("LA", "Webster", "22119", "4"),
    ],
    2024: [
        ("OK", "Alfalfa", "40003", "3"), ("OK", "Beaver", "40007", "3"),
        ("OK", "Beckham", "40009", "3"), ("OK", "Blaine", "40011", "3"),
        ("OK", "Caddo", "40015", "3"), ("OK", "Cimarron", "40025", "3"),
        ("OK", "Custer", "40039", "3"), ("OK", "Dewey", "40043", "3"),
        ("OK", "Ellis", "40045", "3"), ("OK", "Garfield", "40047", "3"),
        ("OK", "Grant", "40053", "3"), ("OK", "Greer", "40055", "3"),
        ("OK", "Harmon", "40057", "3"), ("OK", "Harper", "40059", "3"),
        ("OK", "Jackson", "40065", "3"), ("OK", "Kay", "40071", "3"),
        ("OK", "Kingfisher", "40073", "3"), ("OK", "Kiowa", "40075", "3"),
        ("OK", "Major", "40093", "3"), ("OK", "Noble", "40103", "3"),
        ("OK", "Osage", "40113", "3"), ("OK", "Pawnee", "40117", "3"),
        ("OK", "Payne", "40119", "3"), ("OK", "Roger Mills", "40129", "3"),
        ("OK", "Texas", "40139", "3"), ("OK", "Washita", "40149", "3"),
        ("OK", "Woods", "40151", "3"), ("OK", "Woodward", "40153", "3"),
    ],
}


def main():
    for year, entries in ROWS_BY_YEAR.items():
        path = os.path.join(ROOT, f"data-entry/county_house_results_{year}.csv")
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            rows = list(reader)

        existing_ids = {r["county_id"] for r in rows}
        added = 0
        for state, name, fips, district in entries:
            if fips in existing_ids:
                print(f"{year} {state} {name} ({fips}) already present - skipped.")
                continue
            rows.append({
                "state": state, "county_name": name, "county_id": fips,
                f"dem_{year}": 0, f"gop_{year}": 0, f"oth_{year}": 0, f"total_{year}": 0,
                f"districts_{year}": district,
            })
            added += 1

        if added:
            with open(path, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                for r in rows:
                    w.writerow(r)
            print(f"{year}: added {added} rows -> {path} ({len(rows)} total).")


if __name__ == "__main__":
    main()
