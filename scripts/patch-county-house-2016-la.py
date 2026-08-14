#!/usr/bin/env python3
"""
Patches LA-03 and LA-04's 2016 December-runoff results into
data-entry/county_house_results_2016.csv, closing this project's last remaining LA 2016
House gap (23 parishes, documented as a "confirmed dead end" after MEDSL/OpenElections/
Wikipedia all came up empty - MEDSL's only rows for both districts are the November
jungle primary, a different contest from the runoff that actually elected each seat).

Source: user-supplied official parish-by-parish runoff results (Louisiana SOS ENR-style
report, "Early & Absentee"/"Election Day Reporting" format), pasted directly into this
session. Validated by summing every parish and comparing against
`house_past_results.csv`'s own LA-03/LA-04 2016 rows before writing anything - both
matched EXACTLY, to the vote:
- LA-04 (Marshall Jones (D) vs. Mike Johnson (R)): parish sum = 46,579 dem / 87,370 gop,
  matching house_past_results.csv's LA-04 2016 row (46579/87370) with 0 diff.
- LA-03 (Scott Angelle vs. Clay Higgins - BOTH REPUBLICAN, a same-party runoff; Angelle
  sits in the CSV's "dem_candidate" column but is marked "(R)" per this pipeline's
  true_party_bucket convention): parish sum = 60,762 (Angelle) / 77,671 (Higgins),
  matching house_past_results.csv's LA-03 2016 row (60762/77671) with 0 diff. Since both
  candidates are Republican, every LA-03 vote here is bucketed as gop (dem=0), matching
  how CA/WA jungle-primary same-party races are always bucketed in this pipeline -
  needs a SAME_PARTY_NOTES entry in generate-county-house-data.py for 2016 LA-03,
  added alongside this patch.

St. Landry Parish is the one parish touched by BOTH districts (48 LA-04 precincts + 4
LA-03 precincts) - it already had a 2016 row for its third district, LA-05 (dem=0,
gop=8731, oth=4022, total=12753), from the existing MEDSL-sourced data. This script ADDS
LA-04's and LA-03's contributions on top of that existing row (not a fresh row),
bringing St. Landry to dem=2906, gop=13607, oth=4022, total=20535, districts="3;4;5".

Run from project root: python3 scripts/patch-county-house-2016-la.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2016.csv")

# LA-04: Marshall Jones (D) vs. Mike Johnson (R) -> (dem, gop)
LA04 = {
    "22003": ("Allen", 750, 2511), "22011": ("Beauregard", 930, 4469),
    "22013": ("Bienville", 1278, 2001), "22015": ("Bossier", 4860, 17034),
    "22017": ("Caddo", 23073, 24726), "22027": ("Claiborne", 897, 1878),
    "22031": ("De Soto", 2272, 3964), "22039": ("Evangeline", 1224, 3536),
    "22069": ("Natchitoches", 2443, 4310), "22081": ("Red River", 891, 1234),
    "22085": ("Sabine", 556, 3642), "22097": ("St. Landry", 2906, 4208),
    "22111": ("Union", 1070, 3558), "22115": ("Vernon", 825, 4864),
    "22119": ("Webster", 2604, 5435),
}

# LA-03: Scott Angelle (R) vs. Clay Higgins (R) - same-party, all votes -> gop
LA03_GOP = {
    "22001": ("Acadia", 3724 + 8760), "22019": ("Calcasieu", 17009 + 11382),
    "22023": ("Cameron", 743 + 683), "22045": ("Iberia", 4129 + 9304),
    "22053": ("Jefferson Davis", 2634 + 3022), "22055": ("Lafayette", 19059 + 24670),
    "22097": ("St. Landry", 214 + 454), "22099": ("St. Martin", 6528 + 6419),
    "22101": ("St. Mary", 3063 + 5314), "22113": ("Vermilion", 3659 + 7663),
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    by_fips = {r["county_id"]: r for r in rows}

    def add_district(fips, dem_add, gop_add, district):
        if fips in by_fips:
            r = by_fips[fips]
            r["dem_2016"] = str(int(r["dem_2016"]) + dem_add)
            r["gop_2016"] = str(int(r["gop_2016"]) + gop_add)
            r["total_2016"] = str(int(r["total_2016"]) + dem_add + gop_add)
            existing = [d for d in r["districts_2016"].split(";") if d]
            if district not in existing:
                existing.append(district)
            r["districts_2016"] = ";".join(sorted(existing))
        else:
            name = LA04.get(fips, LA03_GOP.get(fips))[0]
            new_row = {
                "state": "LA", "county_name": name, "county_id": fips,
                "dem_2016": dem_add, "gop_2016": gop_add, "oth_2016": 0,
                "total_2016": dem_add + gop_add, "districts_2016": district,
            }
            rows.append(new_row)
            by_fips[fips] = new_row

    for fips, (name, dem, gop) in LA04.items():
        add_district(fips, dem, gop, "4")
    for fips, (name, gop) in LA03_GOP.items():
        add_district(fips, 0, gop, "3")

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"Patched LA-03 (10 parishes) + LA-04 (15 parishes, 1 overlap) into {OUT_CSV} ({len(rows)} rows total).")
    print("St. Landry (22097):", by_fips["22097"])


if __name__ == "__main__":
    main()
