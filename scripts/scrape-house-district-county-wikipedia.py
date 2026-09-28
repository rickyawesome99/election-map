#!/usr/bin/env python3
"""
Scrapes U.S. House results BY DISTRICT BY COUNTY from Wikipedia's per-state House pages
("{year} United States House of Representatives elections in {State}", one "==District N=="
section each with a "By county" table; at-large states use the singular "election in" page)
for 2016–2024, and writes data-entry/house_district_county_wikipedia.csv — one row per
(year, district, county) exactly as the table prints it, no summing across districts and no
rescaling. scripts/build-house-district-county-results.py takes these rows as its first-
priority source when they sum to the certified district total.

Parsing reuses scripts/scrape-county-house-2024.py's wikitext table parser unchanged (it is
imported as a module); only the bucketing differs: here a candidate's votes go to the SLOT
they fill in house_past_results.csv (dem column / rep column / other), so a same-party
top-two contest keeps both candidates apart instead of merging them by true party.

Run from project root:
  python3 scripts/scrape-house-district-county-wikipedia.py 2022            # one year, all states
  python3 scripts/scrape-house-district-county-wikipedia.py 2022 IN IL ME   # some states
  python3 scripts/scrape-house-district-county-wikipedia.py all             # every year
"""
import csv, importlib.util, os, sys, time
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/house_district_county_wikipedia.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
YEARS = [2016, 2018, 2020, 2022, 2024]

spec = importlib.util.spec_from_file_location("wp", os.path.join(os.path.dirname(__file__), "scrape-county-house-2024.py"))
wp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wp)


def load_house_past(year):
    m = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if int(row["year"]) != year:
                continue
            m[(row["state_abbr"], int(row["district_name"].split("-")[1]))] = row
    return m


def slot_buckets(candidates, past):
    """Like wp.bucket_candidates but returns the SLOT ("dem"/"gop"/"oth"), not the true party."""
    dem_name, rep_name = wp.norm_name(past["dem_candidate"]), wp.norm_name(past["rep_candidate"])
    dem_last, rep_last = wp.last_name(past["dem_candidate"]), wp.last_name(past["rep_candidate"])
    dem_matched = bool(dem_name) and any(wp.norm_name(c["name"]) == dem_name for c in candidates)
    rep_matched = bool(rep_name) and any(wp.norm_name(c["name"]) == rep_name for c in candidates)
    distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last
    same_party = bool(wp.TRUE_PARTY_RE.search(past["dem_candidate"])) or bool(wp.TRUE_PARTY_RE.search(past["rep_candidate"]))
    out = []
    for c in candidates:
        n = wp.norm_name(c["name"])
        if dem_name and n == dem_name:
            out.append("dem")
        elif rep_name and n == rep_name:
            out.append("gop")
        elif distinct_last and wp.last_name(c["name"]) == dem_last:
            out.append("dem")
        elif distinct_last and wp.last_name(c["name"]) == rep_last:
            out.append("gop")
        elif not same_party and not dem_matched and c["party"] == "D":
            out.append("dem")
        elif not same_party and not rep_matched and c["party"] == "R":
            out.append("gop")
        else:
            out.append("oth")
    return out


def scrape_year(year, only_states):
    house_past = load_house_past(year)
    pres_fips = wp.load_pres_fips()
    rows, report = [], []
    states = {k: v for k, v in wp.STATE_NAMES.items() if not only_states or k in only_states}
    for abbr, state_name in states.items():
        expected = sorted(d for (s, d) in house_past if s == abbr)
        if not expected:
            continue
        at_large = len(expected) == 1
        try:
            if at_large:
                sections = {1: wp.fetch(f"{year}_United_States_House_of_Representatives_election_in_{state_name}")}
            else:
                sections = wp.split_districts(wp.fetch(f"{year}_United_States_House_of_Representatives_elections_in_{state_name}"))
        except Exception as e:
            report.append(f"{abbr}: FAILED to fetch page: {e}")
            time.sleep(0.3)
            continue
        got = []
        for dnum in expected:
            text = sections.get(dnum)
            if not text:
                continue
            past = house_past[(abbr, dnum)]
            try:
                candidates, county_rows = wp.parse_race(text)
            except Exception as e:
                report.append(f"{abbr}-{dnum:02d}: parse failed: {e}")
                continue
            if not candidates or not county_rows:
                continue
            buckets = slot_buckets(candidates, past)
            n_rows = 0
            for row in county_rows:
                fips = wp.resolve_fips(pres_fips.get(abbr, {}), row["county"])
                if not fips:
                    report.append(f"{abbr}-{dnum:02d}: unmatched county '{row['county']}'")
                    continue
                dem = gop = oth = 0
                for b, v in zip(buckets, row["votes"]):
                    v = v or 0
                    if b == "dem":
                        dem += v
                    elif b == "gop":
                        gop += v
                    else:
                        oth += v
                total = row["total"] if row["total"] is not None else dem + gop + oth
                rows.append(dict(year=year, state=abbr, district=dnum, county_fips=fips, county_name=row["county"],
                                 dem=dem, gop=gop, oth=oth, total=total))
                n_rows += 1
            if n_rows:
                got.append(dnum)
        report.append(f"{abbr}: by-county tables for {len(got)}/{len(expected)} districts")
        time.sleep(0.3)
    return rows, report


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    years = YEARS if args[0] == "all" else [int(args[0])]
    only_states = set(a.upper() for a in args[1:])
    existing = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing = [r for r in csv.DictReader(f)
                        if int(r["year"]) not in years or (only_states and r["state"] not in only_states)]
    all_rows = list(existing)
    for year in years:
        rows, report = scrape_year(year, only_states)
        all_rows.extend(rows)
        print(f"[{year}] {len(rows)} rows")
        for line in report:
            print("   " + line)
    all_rows.sort(key=lambda r: (int(r["year"]), r["state"], int(r["district"]), r["county_fips"]))
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total"])
        w.writeheader()
        for r in all_rows:
            w.writerow(r)
    print(f"Wrote {len(all_rows)} rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()
