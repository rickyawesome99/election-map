#!/usr/bin/env python3
"""
Patches LA-05's 2020 December-runoff results into
data-entry/county_house_results_2020.csv, closing this project's last remaining LA
House gap that wasn't already resolved (Ralph Abraham didn't seek reelection; no
candidate cleared 50% in the November jungle primary, so the seat went to a runoff
between two Republicans, Lance Harris vs. Luke Letlow - MEDSL's only source rows are
the November primary, a different contest - same root cause documented throughout this
file for LA's other runoff-year gaps).

Source: user-supplied official parish-by-parish runoff results (same LA SOS ENR-style
report format as the 2016 LA-03/LA-04 patch). Validated by summing every parish and
comparing against house_past_results.csv's LA-05 2020 row (dem_candidate="Lance Harris
(R)" - same-party marker, this was a same-party runoff despite the "dem" column label;
rep_candidate="Luke Letlow"): parish sum = 30,124 Harris / 49,183 Letlow / 79,307 total
vs. reference 30,123 / 49,183 / 79,306 - a 1-vote rounding discrepancy, negligible
(0.001%), same tolerance class as this project's other manual patches; not chased to a
specific parish.

Both candidates are Republican, so every vote here is bucketed as gop (dem=0), matching
this pipeline's same-party convention - needs a SAME_PARTY_NOTES entry in
generate-county-house-data.py for 2020 LA-05, added alongside this patch.

4 of the 24 parishes already had a 2020 row from another district (East Feliciana:
LA-06; St. Helena: LA-06; St. Landry: LA-03/LA-04; Tangipahoa: LA-01) - this script ADDS
LA-05's contribution on top of those existing rows rather than overwriting them, same
approach as the 2016 St. Landry patch.

Run from project root: python3 scripts/patch-county-house-2020-la.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2020.csv")

# LA-05: Lance Harris (R) vs. Luke Letlow (R) - same-party, all votes -> gop
LA05_GOP = {
    "22009": ("Avoyelles", 2061 + 2722), "22021": ("Caldwell", 339 + 1056),
    "22025": ("Catahoula", 322 + 708), "22029": ("Concordia", 423 + 1243),
    "22035": ("East Carroll", 173 + 438), "22037": ("East Feliciana", 489 + 597),
    "22041": ("Franklin", 534 + 1928), "22043": ("Grant", 994 + 1117),
    "22049": ("Jackson", 562 + 1180), "22059": ("LaSalle", 624 + 1629),
    "22061": ("Lincoln", 2107 + 3764), "22065": ("Madison", 334 + 669),
    "22067": ("Morehouse", 692 + 1872), "22073": ("Ouachita", 4328 + 10254),
    "22079": ("Rapides", 9562 + 6717), "22083": ("Richland", 995 + 3022),
    "22091": ("St. Helena", 148 + 224), "22097": ("St. Landry", 1039 + 1588),
    "22105": ("Tangipahoa", 1669 + 2241), "22107": ("Tensas", 339 + 517),
    "22117": ("Washington", 1169 + 2820), "22123": ("West Carroll", 271 + 842),
    "22125": ("West Feliciana", 525 + 959), "22127": ("Winn", 425 + 1076),
}


def main():
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    by_fips = {r["county_id"]: r for r in rows}

    for fips, (name, gop_add) in LA05_GOP.items():
        if fips in by_fips:
            r = by_fips[fips]
            r["gop_2020"] = str(int(r["gop_2020"]) + gop_add)
            r["total_2020"] = str(int(r["total_2020"]) + gop_add)
            existing = [d for d in r["districts_2020"].split(";") if d]
            if "5" not in existing:
                existing.append("5")
            r["districts_2020"] = ";".join(sorted(existing))
        else:
            new_row = {
                "state": "LA", "county_name": name, "county_id": fips,
                "dem_2020": 0, "gop_2020": gop_add, "oth_2020": 0,
                "total_2020": gop_add, "districts_2020": "5",
            }
            rows.append(new_row)
            by_fips[fips] = new_row

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"Patched LA-05 (24 parishes, 4 added onto existing rows) into {OUT_CSV} ({len(rows)} rows total).")


if __name__ == "__main__":
    main()
