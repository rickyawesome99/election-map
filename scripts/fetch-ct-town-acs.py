#!/usr/bin/env python3
"""
Fetches ACS 5-year (2019-23) Data Profile estimates for every Connecticut county
subdivision (town) from the Census API - used to reconstruct CT's 8 legacy counties
(retired in favor of 9 planning regions in 2022; see generate-county-demographics-data.py)
by aggregating town-level data back up via data-entry/ct_town_to_planning_region.csv.

Requires a free Census API key (https://api.census.gov/data/key_signup.html) in
CENSUS_API_KEY, e.g. via a .env.local file (gitignored - never commit the key itself).
Run from project root: python3 scripts/fetch-ct-town-acs.py
"""
import csv, json, os, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/ct_town_acs_2019_23.csv")

VARS = ["NAME", "DP02_0068PE", "DP03_0062E", "DP05_0001E", "DP05_0076PE", "DP05_0082PE", "DP05_0083PE", "DP05_0085PE"]


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


key = load_env_key()
url = (
    "https://api.census.gov/data/2023/acs/acs5/profile"
    f"?get={','.join(VARS)}&for=county%20subdivision:*&in=state:09&key={key}"
)
with urllib.request.urlopen(url) as resp:
    data = json.load(resp)

header, rows = data[0], data[1:]

with open(DST, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(header)
    w.writerows(rows)

print(f"Written {len(rows)} rows -> {DST}")
