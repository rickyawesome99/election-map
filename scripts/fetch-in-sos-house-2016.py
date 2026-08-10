#!/usr/bin/env python3
"""
Fetches complete, official county-level 2016 U.S. House results for Indiana from the
Indiana Secretary of State's own ENR portal - same source and reasoning as
fetch-in-sos-house-2018.py/2020.py/2022.py (see fetch-in-sos-house-2022.py's docstring
for the full reverse-engineering narrative). Tried proactively this year (before even
running the MEDSL fill script) since this portal has now beaten or matched MEDSL for IN
three years running (2020, 2022, 2018).

**2016's OFFICECATEGORYID is 1753** - yet a THIRD distinct value across the 4 years
checked so far (1005 for 2020/2022, 2167 for 2018, 1753 for 2016) - confirms this ID is
genuinely not stable across years and must be looked up fresh every time, not assumed
from any prior year. Same `List`/`Heading`/`Items` category structure as 2018's site
version (not the flatter list 2020/2022 use) and the same `OffCatC_{id}_A.json` URL
template/Region/Race/Candidate JSON shape once past that.

No special-election region to exclude (only 9 plain-numbered regions in this year's
JSON, no "District CDx Special" entry).

Writes/merges into data-entry/county_house_results_2016.csv. Run from project root:
python3 scripts/fetch-in-sos-house-2016.py
"""
import csv, json, os, re, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2016.csv")
YEAR = 2016
STATE_ABBR = "IN"

DATA_URL = "https://enr.indianavoters.in.gov/archive/2016General/data/OffCatC_1753_A.json"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf-8-sig")
    return json.loads(text)


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", "").replace(".", "").replace("-", " ")
    return re.sub(r"\s+", " ", name).strip().lower()


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


def load_house_past():
    m = {}
    names = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            names[row["state_abbr"]] = row["state_name"]
            if row["year"] != str(YEAR) or row["state_abbr"] != STATE_ABBR:
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[dnum] = row
    return m, names


def load_house_del_history():
    m = {}
    with open(HOUSE_DEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(row["state_name"], int(row["year"]))] = row
    return m


def main():
    house_past, state_names = load_house_past()
    house_del = load_house_del_history()

    data = fetch_json(DATA_URL)
    regions = data["Root"]["OfficeCategory"]["Regions"]["Region"]

    by_county = defaultdict(lambda: defaultdict(int))
    by_county_districts = defaultdict(set)
    county_names = {}
    for region in regions:
        if "Special" in region["MAP_JURISDICTION_NAME"]:
            continue
        dnum = int(region["MAP_JURISDICTION_NAME"])
        past = house_past[dnum]
        dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
        dem_last, rep_last = last_name(past["dem_candidate"]), last_name(past["rep_candidate"])

        races = region["Races"]["Race"]
        if not isinstance(races, list):
            races = [races]
        for race in races:
            fips = race["Jurisdiction"]["FIPS"]
            county_names[fips] = race["Jurisdiction"]["JURISDICTION_NAME"]
            candidates = race["Candidates"]["Candidate"]
            if not isinstance(candidates, list):
                candidates = [candidates]
            for cand in candidates:
                n = norm_name(cand["NAME_ON_BALLOT"])
                cl = last_name(cand["NAME_ON_BALLOT"])
                votes = int(cand["TOTAL_VOTES"])
                if n == dem_name or cl == dem_last:
                    bucket = "dem"
                elif n == rep_name or cl == rep_last:
                    bucket = "gop"
                else:
                    bucket = "oth"
                by_county[fips][bucket] += votes
            by_county_districts[fips].add(dnum)

    out_rows = []
    sum_dem = sum_gop = sum_oth = sum_total = 0
    for fips, buckets in by_county.items():
        dem, gop, oth = buckets.get("dem", 0), buckets.get("gop", 0), buckets.get("oth", 0)
        total = dem + gop + oth
        sum_dem += dem
        sum_gop += gop
        sum_oth += oth
        sum_total += total
        districts = ";".join(str(d) for d in sorted(by_county_districts[fips]))
        out_rows.append({
            "state": STATE_ABBR, "county_name": county_names[fips], "county_id": fips,
            f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            f"districts_{YEAR}": districts,
        })

    del_row = house_del.get((state_names[STATE_ABBR], YEAR))
    expected_dem, expected_gop, expected_total = int(del_row["dem_votes"]), int(del_row["rep_votes"]), int(del_row["total_votes"])
    ddiff, gdiff, tdiff = sum_dem - expected_dem, sum_gop - expected_gop, sum_total - expected_total
    status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total} | dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff}"
    if abs(ddiff) > max(500, expected_dem * 0.005) or abs(gdiff) > max(500, expected_gop * 0.005):
        status = "MISMATCH " + status

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}", f"districts_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != STATE_ABBR]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} IN rows -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)")
    print(f"IN: {status}")


if __name__ == "__main__":
    main()
