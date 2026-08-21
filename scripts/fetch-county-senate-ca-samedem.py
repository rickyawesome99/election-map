#!/usr/bin/env python3
"""
Fills in California's missing county_senate_results_{2016,2018}.csv rows. CA was
excluded from scrape-county-senate-{2016,2018}.py on purpose (see those scripts'
docstrings): both years' general election was a same-party top-two race (2016: Kamala
Harris vs. Loretta Sanchez; 2018: Dianne Feinstein vs. Kevin de Leon - both Democrats),
which doesn't fit the two-party dem/gop model those scripts' header-parsing was written
around (though the parsing itself, once given CA's flat-header table format, works fine).

Buckets each candidate's REAL per-county vote total into dem_{year}/gop_{year}
separately (dem_candidate=Harris/Feinstein, gop_candidate=Sanchez/de Leon, per
senate_past_results.csv's own convention of marking the second Democrat's column
"(D)" for reference only, not a real Republican) - matching how State
(senate_past_results.csv) and District (house_statewide_results.csv) both already
encode this race, rather than collapsing both candidates into "dem" with gop=0 (an
earlier version of this script did that; it was reverted once it was discovered to
break the County/District/State national-aggregate cross-check - see
[[project_national_geolevel_toggle]] memory, 2026-08-20 audit). The map's "always
render this seat blue" requirement is now handled at the DISPLAY layer instead
(NationalCountyMap.tsx's SAME_PARTY_STATEWIDE_RACES margin flip, applied to County
the same way it already was to District), not by corrupting the raw vote data.

CA's Wikipedia "By county" tables label these columns by bare surname only
("Feinstein"/"de Leon", not "Dianne Feinstein"/"Kevin de Leon (D)"), so exact full-name
matching against senate_past_results.csv's dem_candidate/rep_candidate always misses -
this reuses the scraper's own last-name-token fallback (the same logic every other
state's normal run already falls back to for a truncated/abbreviated ballot name), which
resolves CA's bare surnames correctly.

Reuses fetch()/parse_state()/resolve_fips()/load_pres_fips()/load_senate_year()/
norm_name()/last_name() from the corresponding year's scrape-county-senate-{year}.py
(identical Wikitext-parsing + candidate-matching logic, including the "CA-style flat
header" fallback path in parse_state() that was specifically built for - and already
validated against - this exact page format).

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

    past = mod.load_senate_year()["CA"]
    dem_name = mod.norm_name(past["dem_candidate"])
    rep_name = mod.norm_name(past["rep_candidate"])
    dem_last = mod.last_name(past["dem_candidate"])
    rep_last = mod.last_name(past["rep_candidate"])

    dem_matched = any(mod.norm_name(c["name"]) == dem_name for c in candidates)
    rep_matched = any(mod.norm_name(c["name"]) == rep_name for c in candidates)

    # Same tiered matching every other state's normal scrape run uses (exact name ->
    # last-name-token fallback); CA's bare-surname column headers only ever satisfy the
    # last-name tier, exercised here for the first time as the primary path rather than
    # just a fallback.
    bucket_of = []
    for c in candidates:
        n = mod.norm_name(c["name"])
        if dem_name and n == dem_name:
            bucket_of.append("dem")
        elif rep_name and n == rep_name:
            bucket_of.append("gop")
        elif not dem_matched and dem_last and mod.last_name(c["name"]) == dem_last:
            bucket_of.append("dem")
        elif not rep_matched and rep_last and mod.last_name(c["name"]) == rep_last:
            bucket_of.append("gop")
        else:
            bucket_of.append("oth")
    print(f"CA {year}: bucketed as {list(zip([c['name'] for c in candidates], bucket_of))}")
    if bucket_of.count("dem") != 1 or bucket_of.count("gop") != 1:
        sys.exit(f"CA {year}: expected exactly one dem + one gop candidate, got {bucket_of} - aborting, not writing anything")

    pres_fips = mod.load_pres_fips()
    fips_map = pres_fips.get("CA", {})

    out_rows = []
    sum_dem = sum_gop = sum_oth = sum_total = 0
    unmatched = []
    for row in county_rows:
        fips = mod.resolve_fips(fips_map, row["county"])
        dem = gop = oth = 0
        for bucket, v in zip(bucket_of, row["votes"]):
            v = v or 0
            if bucket == "dem":
                dem += v
            elif bucket == "gop":
                gop += v
            else:
                oth += v
        total = row["total"] if row["total"] is not None else dem + gop + oth
        sum_dem += dem
        sum_gop += gop
        sum_oth += oth
        sum_total += total
        if not fips:
            unmatched.append(row["county"])
            continue
        out_rows.append({
            "state": "CA", "county_name": row["county"], "county_id": fips,
            f"dem_{year}": dem, f"gop_{year}": gop, f"oth_{year}": oth, f"total_{year}": total,
        })

    ref_dem, ref_gop, ref_total = int(past["dem_votes"]), int(past["rep_votes"]), int(past["total_votes"])
    print(f"Parsed: dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}  "
          f"| senate_past_results.csv: dem={ref_dem} gop={ref_gop} total={ref_total}  "
          f"| diff: dem={sum_dem - ref_dem} gop={sum_gop - ref_gop} total={sum_total - ref_total}")
    if unmatched:
        print(f"UNMATCHED COUNTIES (not written): {unmatched}")
    print(f"Counties written: {len(out_rows)}")

    out_csv = os.path.join(ROOT, f"data-entry/county_senate_results_{year}.csv")
    fieldnames = ["state", "county_name", "county_id", f"dem_{year}", f"gop_{year}", f"oth_{year}", f"total_{year}"]

    # Merge with whatever's already on disk rather than overwriting wholesale - drop any
    # existing CA rows for this year (an earlier run of this same script, or a stray
    # scrape-county-senate-{year}.py run) before appending the freshly computed ones, so
    # re-running this script is idempotent instead of accumulating duplicate CA rows.
    existing_rows = []
    if os.path.exists(out_csv):
        with open(out_csv, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "CA"]

    with open(out_csv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)
    print(f"Wrote {len(out_rows)} CA rows -> {out_csv} (file now has {len(kept) + len(out_rows)} total)")


if __name__ == "__main__":
    main()
