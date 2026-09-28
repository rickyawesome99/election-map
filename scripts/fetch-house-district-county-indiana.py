#!/usr/bin/env python3
"""
Fetches Indiana's certified U.S. House results BY DISTRICT BY COUNTY, 2016–2024, from the
Secretary of State's election-results archive (the same OffCatC JSON the per-year
scripts/fetch-in-sos-house-{year}.py scripts read — see fetch-in-sos-house-2022.py's docstring
for how the endpoint was found). Each Region is a district, each Race inside it a county the
district touches, with per-candidate TOTAL_VOTES: complete, certified and county-exact.
Writes data-entry/house_district_county_indiana.csv, one row per (year, district, county).
Special elections run alongside a regular race ("District CD2 Special", 2022) are skipped.

Run from project root:  python3 scripts/fetch-house-district-county-indiana.py
"""
import csv, importlib.util, json, os, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/house_district_county_indiana.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
URLS = {
    2016: "https://enr.indianavoters.in.gov/archive/2016General/data/OffCatC_1753_A.json",
    2018: "https://enr.indianavoters.in.gov/archive/2018General/data/OffCatC_2167_A.json",
    2020: "https://enr.indianavoters.in.gov/archive/2020General/data/OffCatC_1005_A.json",
    2022: "https://enr.indianavoters.in.gov/archive/2022General/data/OffCatC_1005_A.json",
    2024: "https://enr.indianavoters.in.gov/archive/2024General/data/OffCatC_1005_A.json",
}

spec = importlib.util.spec_from_file_location("bl", os.path.join(os.path.dirname(__file__), "build-house-district-county-results.py"))
bl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bl)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8-sig"))


def as_list(x):
    return x if isinstance(x, list) else [x]


def main():
    house_past = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state_abbr"] == "IN":
                house_past[(int(row["year"]), int(row["district_name"].split("-")[1]))] = row
    rows = []
    for year, url in URLS.items():
        try:
            data = fetch_json(url)
        except Exception as e:
            print(f"[{year}] FAILED: {e}")
            continue
        n = 0
        for region in as_list(data["Root"]["OfficeCategory"]["Regions"]["Region"]):
            name = str(region["MAP_JURISDICTION_NAME"])
            if "Special" in name or not name.strip().isdigit():
                continue
            dnum = int(name)
            past = house_past.get((year, dnum))
            if not past:
                continue
            for race in as_list(region["Races"]["Race"]):
                fips = str(race["Jurisdiction"]["FIPS"]).zfill(5)
                county = race["Jurisdiction"]["JURISDICTION_NAME"]
                dem = gop = oth = 0
                for cand in as_list(race["Candidates"]["Candidate"]):
                    slot, _ = bl.bucket_for(cand["NAME_ON_BALLOT"], past, {}, "IN")
                    votes = int(cand["TOTAL_VOTES"])
                    if slot == "dem":
                        dem += votes
                    elif slot == "gop":
                        gop += votes
                    else:
                        oth += votes
                rows.append(dict(year=year, state="IN", district=dnum, county_fips=fips, county_name=county.title(),
                                 dem=dem, gop=gop, oth=oth, total=dem + gop + oth))
                n += 1
        print(f"[{year}] {n} district-county rows")
    rows.sort(key=lambda r: (r["year"], r["district"], r["county_fips"]))
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Wrote {len(rows)} rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()
