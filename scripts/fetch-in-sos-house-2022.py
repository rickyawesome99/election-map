#!/usr/bin/env python3
"""
Fetches complete, official county-level 2022 U.S. House results for Indiana from the
Indiana Secretary of State's own ENR (Election Night Reporting) portal - the source
this project's other 3 sources (OpenElections has no 2022 IN folder at all; Wikipedia's
IN 2022 page has no by-county tables; MEDSL's file only has 38 of IN's 92 counties, with
even those severely undercounted) all came up short on.

The live portal (enr.indianavoters.in.gov) is a client-rendered Angular SPA with no
server-side data in the raw HTML, but past general elections are kept at a discoverable
`/archive/{year}General/` path (found via a Wayback Machine CDX search turning up this
exact URL pattern from a live 2016 archive link, then confirmed the same pattern exists
for 2022 directly on the live site - no archive.org fetch needed). The Angular app's own
JS reveals the data-loading scheme: `data/settings.json` (unversioned) gives a
`VersionType` code ("A" for the certified 2022 general); `data/statewideElectionsC_A.json`
lists every office category with its `OFFICECATEGORYID` (1005 = "US Representative");
`data/OffCatC_1005_A.json` has the FULL race data - a `Regions.Region` list (one per
congressional district, MAP_JURISDICTION_NAME = the district number) each containing a
`Races.Race` list (one per COUNTY that district touches, with FIPS + county name +
per-candidate TOTAL_VOTES). This is complete, certified, and county-exact - confirmed
Marion County/IN-07 (André Carson vs. Angela Grabovsky) matches house_past_results.csv's
117,309/53,631 exactly.

One region, "District CD2 Special" (Jackie Walorski died in office in 2022; a special
election to fill her unexpired term ran alongside the regular IN-02 race that November),
is excluded - house_past_results.csv/house_del_history.csv reflect the REGULAR election
only, matching this project's standing "filter to the regular row" convention.

Counties spanning multiple districts (e.g., Cass touches both District 2 and District 4)
are summed across every district's contribution, per this project's House convention.

Writes/merges into data-entry/county_house_results_2022.csv. Run from project root:
python3 scripts/fetch-in-sos-house-2022.py
"""
import csv, json, os, re, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")
YEAR = 2022
STATE_ABBR = "IN"

DATA_URL = "https://enr.indianavoters.in.gov/archive/2022General/data/OffCatC_1005_A.json"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf-8-sig")
    return json.loads(text)


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)  # strip "(W/I)"/"(I)" etc. - space not
    # empty, to avoid gluing a mid-name parenthetical's surrounding words together.
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", "").replace(".", "").replace("-", " ")
    return re.sub(r"\s+", " ", name).strip().lower()


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


def load_house_2022():
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
    house_2022, state_names = load_house_2022()
    house_del = load_house_del_history()

    data = fetch_json(DATA_URL)
    regions = data["Root"]["OfficeCategory"]["Regions"]["Region"]

    by_county = defaultdict(lambda: defaultdict(int))
    by_county_districts = defaultdict(set)
    county_names = {}
    for region in regions:
        if "Special" in region["MAP_JURISDICTION_NAME"]:
            continue  # IN-02 special election - see module docstring
        dnum = int(region["MAP_JURISDICTION_NAME"])
        past = house_2022[dnum]
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
