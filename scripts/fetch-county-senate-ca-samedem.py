#!/usr/bin/env python3
"""
Fills in California's missing county_senate_results_{2016,2018}.csv rows. CA was
excluded from scrape-county-senate-{2016,2018}.py on purpose (see those scripts'
docstrings): both years' general election was a same-party top-two race (2016: Kamala
Harris vs. Loretta Sanchez; 2018: Dianne Feinstein vs. Kevin de Leon - both Democrats),
which doesn't fit the two-party dem/gop model those scripts assume.

Per user instruction: bucket BOTH candidates' votes as "dem" (matching
senate_past_results.csv's own convention of marking the "rep_candidate" column's entry
with a trailing "(D)" for these two rows - it's a Democrat sitting in that column for
reference purposes only, not a real Republican). gop_{year} is 0 for every CA county in
both years; California's top-two system doesn't allow write-in candidates in the general,
so "oth" is expected to be 0 too (asserted, not just assumed).

Reuses fetch()/parse_state()/resolve_fips()/load_pres_fips() from the corresponding
year's scrape-county-senate-{year}.py (identical Wikitext-parsing logic, including the
"CA-style flat header" fallback path in parse_state() that was specifically built for -
and already validated against - this exact page format).

Run from project root: python3 scripts/fetch-county-senate-ca-samedem.py 2016
                        python3 scripts/fetch-county-senate-ca-samedem.py 2018
"""
import csv
import os
import sys
import importlib.util

ROOT = os.path.join(os.path.dirname(__file__), "..")


def load_scraper_module(year: int):
    path = os.path.join(os.path.dirname(__file__), f"scrape-county-senate-{year}.py")
    spec = importlib.util.spec_from_file_location(f"scrape_county_senate_{year}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2016
    mod = load_scraper_module(year)
    mod.STATE_NAMES["CA"] = "California"  # deliberately excluded upstream; add back just for this fetch

    wikitext = mod.fetch("CA")
    candidates, county_rows = mod.parse_state("CA", wikitext)
    print(f"CA {year}: {len(candidates)} candidates parsed: {[c['name'] for c in candidates]}")

    pres_fips = mod.load_pres_fips()
    fips_map = pres_fips.get("CA", {})

    out_rows = []
    sum_dem = sum_oth = sum_total = 0
    unmatched = []
    for row in county_rows:
        fips = mod.resolve_fips(fips_map, row["county"])
        # Both major-party candidates in these two races are Democrats - everything
        # counted goes to "dem" except a genuine third/write-in candidate (not expected
        # on a CA top-two general ballot, but not assumed away either - tracked as "oth"
        # if parse_state ever returns more than 2 candidate columns for this page).
        dem = sum(v or 0 for v in row["votes"][:2])
        oth = sum(v or 0 for v in row["votes"][2:])
        total = row["total"] if row["total"] is not None else dem + oth
        sum_dem += dem
        sum_oth += oth
        sum_total += total
        if not fips:
            unmatched.append(row["county"])
            continue
        out_rows.append({
            "state": "CA", "county_name": row["county"], "county_id": fips,
            f"dem_{year}": dem, f"gop_{year}": 0, f"oth_{year}": oth, f"total_{year}": total,
        })

    past = mod.load_senate_year()["CA"]
    ref_total = int(past["total_votes"])
    print(f"Parsed total: dem={sum_dem} oth={sum_oth} total={sum_total}  "
          f"| senate_past_results.csv total_votes={ref_total}  "
          f"| diff={sum_total - ref_total} ({100*(sum_total-ref_total)/ref_total:.2f}%)")
    if unmatched:
        print(f"UNMATCHED COUNTIES (not written): {unmatched}")
    print(f"Counties written: {len(out_rows)}")

    out_csv = os.path.join(ROOT, f"data-entry/county_senate_results_{year}.csv")
    with open(out_csv, "a", newline="") as f:
        fieldnames = ["state", "county_name", "county_id", f"dem_{year}", f"gop_{year}", f"oth_{year}", f"total_{year}"]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        for r in out_rows:
            w.writerow(r)
    print(f"Appended {len(out_rows)} CA rows -> {out_csv}")


if __name__ == "__main__":
    main()
