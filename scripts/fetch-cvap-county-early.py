#!/usr/bin/env python3
"""
County CVAP for the two presidential elections before data-entry/cvap.csv starts (2016), for the
turnout graph on county pages. Same table and formula as scripts/fetch-cvap.py (ACS 5-year B05003):

  CVAP = B05003_008 + B05003_019 − B05003_012 − B05003_023

  2008 → the 2005-09 release (the earliest 5-year release; none ends in 2008)
  2012 → the 2008-12 release

Kept in its own file, data-entry/cvap_county_early.csv, so cvap.csv (the frozen turnout model's
input) is untouched. Requires CENSUS_API_KEY (env or .env.local). Run from project root:
  python3 scripts/fetch-cvap-county-early.py
"""
import csv, json, os, sys, time, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/cvap_county_early.csv")
VARS = ["B05003_008E", "B05003_012E", "B05003_019E", "B05003_023E"]
ELECTIONS = {2008: 2009, 2012: 2012}  # election year → ACS release year


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


def fetch(release, key):
    url = f"https://api.census.gov/data/{release}/acs/acs5?get=NAME,{','.join(VARS)}&for=county:*&key={key}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise
            print(f"  retry {attempt + 1} for {release}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def main():
    key = load_env_key()
    rows = []
    for year, release in ELECTIONS.items():
        data = fetch(release, key)
        idx = {h: i for i, h in enumerate(data[0])}
        n = 0
        for r in data[1:]:
            try:
                m18, m_nc, f18, f_nc = (int(r[idx[v]]) for v in VARS)
            except (TypeError, ValueError):
                continue
            if r[idx["state"]] == "72":  # Puerto Rico
                continue
            rows.append((r[idx["state"]] + r[idx["county"]], year, release, r[idx["NAME"]], m18 + f18, m18 + f18 - m_nc - f_nc))
            n += 1
        print(f"{year} (ACS {release - 4}-{str(release)[2:]}): {n} counties", flush=True)
    rows.sort(key=lambda r: (r[1], r[0]))
    with open(DST, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["geoid", "year", "acs_release", "name", "vap", "cvap"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {DST}")


if __name__ == "__main__":
    main()
