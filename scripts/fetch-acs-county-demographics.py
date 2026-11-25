#!/usr/bin/env python3
"""
Fetches ACS 2020-24 5-year Data Profile demographics for every county, plus Connecticut's towns,
into data-entry/county_acs_2020_24.csv - the same release and the same variables as
fetch-acs-demographics.py (nation, states, districts), so a county and a district are measured
the same way. generate-county-demographics-data.py turns this file into data/countyDemographics.ts.

Connecticut: the ACS reports CT by its 9 planning regions (since 2022), not the 8 legacy counties
the site's maps and results use, so the towns (county subdivisions) are fetched too and the
generator rebuilds each legacy county from its own towns.

Requires a free Census API key in CENSUS_API_KEY (env var or .env.local - never commit it).
Run from project root: python3 scripts/fetch-acs-county-demographics.py
"""
import csv, json, os, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/county_acs_2020_24.csv")
VINTAGE = 2024
BASE = f"https://api.census.gov/data/{VINTAGE}/acs/acs5/profile"

# Identical to fetch-acs-demographics.py's FIELDS (the 2024 profile's codes).
FIELDS = {
    "population": "DP05_0001E",       # total population
    "college_pct": "DP02_0068PE",     # 25+ with a bachelor's degree or higher
    "white_pct": "DP05_0096PE",       # not Hispanic, White alone
    "black_pct": "DP05_0097PE",       # not Hispanic, Black or African American alone
    "hispanic_pct": "DP05_0090PE",    # Hispanic or Latino of any race
    "asian_pct": "DP05_0099PE",       # not Hispanic, Asian alone
    "median_household_income": "DP03_0062E",
}
VARS = ["NAME"] + list(FIELDS.values())
COLUMNS = ["level", "geoid", "name"] + list(FIELDS)
PR = "72"  # Puerto Rico's municipios: the site covers no territories


def load_env_key():
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        return key
    env_path = os.path.join(ROOT, ".env.local")
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("CENSUS_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise SystemExit("CENSUS_API_KEY not set (env var or .env.local)")


KEY = load_env_key()


def fetch(for_clause, in_clause=None):
    params = {"get": ",".join(VARS), "for": for_clause, "key": KEY}
    if in_clause:
        params["in"] = in_clause
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as resp:
                return json.load(resp)
        except (OSError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise SystemExit(f"Census API failed for {for_clause} {in_clause or ''}: {e}")
            time.sleep(2 * (attempt + 1))


def to_rows(level, payload, geoid_of):
    """A value the ACS suppresses comes back negative or empty; those become blanks, never zeros."""
    header = payload[0]
    idx = {name: i for i, name in enumerate(header)}
    out = []
    for row in payload[1:]:
        if row[idx["state"]] == PR:
            continue

        def val(var):
            raw = row[idx[var]]
            try:
                return "" if raw in ("", None) or float(raw) < 0 else raw
            except ValueError:
                return ""

        out.append({"level": level, "geoid": geoid_of(row, idx), "name": row[idx["NAME"]],
                    **{col: val(var) for col, var in FIELDS.items()}})
    return out


rows = []
print("counties ...", end=" ", flush=True)
rows += to_rows("county", fetch("county:*"), lambda r, i: r[i["state"]] + r[i["county"]])
print(len(rows))
print("CT towns ...", end=" ", flush=True)
towns = to_rows("ct_town", fetch("county subdivision:*", "state:09"),
                lambda r, i: r[i["state"]] + r[i["county"]] + r[i["county subdivision"]])
rows += towns
print(len(towns))

with open(DST, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLUMNS)
    w.writeheader()
    w.writerows(rows)
print(f"Written {len(rows)} rows -> {DST}")
