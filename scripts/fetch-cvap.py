#!/usr/bin/env python3
"""
Fetches citizen voting-age population (CVAP) — the turnout denominator on /analysis/turnout — from
the ACS 5-year table B05003 (Sex by Age by Nativity and Citizenship Status) for every state, county
and congressional district, one vintage per election year, into data-entry/cvap.csv.

  CVAP = (male 18+) + (female 18+) − (male 18+ non-citizen) − (female 18+ non-citizen)
       = B05003_008 + B05003_019 − B05003_012 − B05003_023
  VAP  = B05003_008 + B05003_019   (kept for reference)

Vintages: each election year is measured with the 5-year release ENDING that year (2016 → 2012-16,
…, 2024 → 2020-24), the closest the ACS gets to the electorate that voted. Odd years (off-year
governors) get their own vintage too. 2025 has no release yet (ACS 2021-25 ships Dec 2026), so
2025 rows reuse 2024.

Congressional districts come on the Congress the release reports — 115th for 2016, 116th for
2018 and 2020, 118th for 2022, 119th for 2024 — which matches the map each election was run on
(NC's 2019 redraw is in the 2020 release, as it is in the site's pre2022 boundary file). No
district rows are fetched for odd years.

Connecticut: the 2022+ releases report planning regions instead of the eight counties the county
results use, so CT county rows for 2022–2025 are the 2021 release's county figures scaled by the
state's CVAP growth since then (CT's population is nearly flat; the scale is ~1.00–1.01).

Requires CENSUS_API_KEY (env or .env.local). Run from project root:
  python3 scripts/fetch-cvap.py
"""
import csv, json, os, sys, time, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/cvap.csv")
VARS = ["B05003_008E", "B05003_012E", "B05003_019E", "B05003_023E"]
YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
DISTRICT_YEARS = [2016, 2018, 2020, 2022, 2024]
STATE_FIPS = ["01","02","04","05","06","08","09","10","11","12","13","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","44","45","46","47","48","49","50","51","53","54","55","56"]


def load_env_key():
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        return key
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if line.startswith("CENSUS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("CENSUS_API_KEY not set")


KEY = load_env_key()


def fetch(year, geo_for, geo_in=None):
    url = f"https://api.census.gov/data/{year}/acs/acs5?get=NAME,{','.join(VARS)}&for={geo_for}"
    if geo_in:
        url += f"&in={geo_in}"
    url += f"&key={KEY}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                data = json.load(r)
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise
            print(f"  retry {attempt + 1} for {geo_for} {year}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    head, rows = data[0], data[1:]
    idx = {h: i for i, h in enumerate(head)}
    out = []
    for r in rows:
        try:
            vals = [int(r[idx[v]]) for v in VARS]
        except (TypeError, ValueError):
            continue
        m18, m_nc, f18, f_nc = vals
        geo = r[len(VARS) + 1:]
        out.append((r[idx["NAME"]], geo, m18 + f18, m18 + f18 - m_nc - f_nc))
    return out


def main():
    rows = []
    for year in YEARS:
        print(f"{year}: states", flush=True)
        for name, geo, vap, cvap in fetch(year, "state:*"):
            if geo[0] in STATE_FIPS:
                rows.append(("state", geo[0], year, name, vap, cvap))
        print(f"{year}: counties", flush=True)
        for name, geo, vap, cvap in fetch(year, "county:*"):
            if geo[0] in STATE_FIPS:
                rows.append(("county", geo[0] + geo[1], year, name, vap, cvap))
        if year in DISTRICT_YEARS:
            print(f"{year}: districts", flush=True)
            for name, geo, vap, cvap in fetch(year, "congressional%20district:*"):
                if geo[0] in STATE_FIPS and geo[1] not in ("ZZ", "98"):
                    rows.append(("district", geo[0] + geo[1], year, name, vap, cvap))

    # Connecticut counties after the planning-region switch: scale the 2021 county figures.
    ct_state = {y: c for lvl, g, y, _, _, c in rows if lvl == "state" and g == "09"}
    ct_2021 = [(g, n, v, c) for lvl, g, y, n, v, c in rows if lvl == "county" and g.startswith("09") and y == 2021]
    rows = [r for r in rows if not (r[0] == "county" and r[1].startswith("09") and r[2] >= 2022)]
    for year in [y for y in YEARS if y >= 2022]:
        scale = ct_state[year] / ct_state[2021]
        for g, n, v, c in ct_2021:
            rows.append(("county", g, year, n + " (scaled from 2021)", round(v * scale), round(c * scale)))

    # 2025: reuse 2024 for states and counties.
    for lvl, g, y, n, v, c in [r for r in rows if r[2] == 2024 and r[0] != "district"]:
        rows.append((lvl, g, 2025, n + " (2024 release)", v, c))

    rows.sort(key=lambda r: (r[0], r[2], r[1]))
    with open(DST, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["level", "geoid", "year", "name", "vap", "cvap"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {DST}")


if __name__ == "__main__":
    main()
