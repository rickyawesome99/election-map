#!/usr/bin/env python3
"""
Fetches ACS 2020-24 5-year Data Profile demographics for every state, congressional district,
and state legislative district (both chambers) from the Census API into one flat file,
data-entry/demographics.csv.

One source, one vintage, all three levels - so a state, a district and a legislative seat are
always measured the same way. (County demographics are NOT sourced here: they predate this and
come from County Health Rankings + USDA ERS on the 2019-23 vintage, see
generate-county-demographics-data.py.)

Geography vintages in the 2024 ACS 5-year release:
- congressional districts are 119th Congress lines. States that redrew mid-decade for 2026 are
  therefore measured on their PREVIOUS map; generate-demographics-data.py records which.
- state legislative districts are the 2024 lines, matching the boundary files the site ships.

Requires a free Census API key (https://api.census.gov/data/key_signup.html) in CENSUS_API_KEY,
e.g. via a .env.local file (gitignored - never commit the key itself).
Run from project root: python3 scripts/fetch-acs-demographics.py
"""
import csv, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/demographics.csv")
VINTAGE = 2024
BASE = f"https://api.census.gov/data/{VINTAGE}/acs/acs5/profile"

# The 2024 profile renumbered DP05's race section from the 2023 one the CT county work used -
# these are the 2024 codes. White/Black/Asian are the not-Hispanic-alone shares, so the four
# race fields plus "everything else" sum to 100 without double counting Hispanic respondents.
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

# The 50 states + DC. Territories are dropped: the site covers neither, and PR reports no
# congressional or state legislative districts.
STATE_FIPS = [
    "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18",
    "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
    "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49",
    "50", "51", "53", "54", "55", "56",
]

COLUMNS = ["level", "geoid", "state_fips", "code", "name"] + list(FIELDS)


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
    """One API call; returns [header, *rows]. Retries a few times - the Census API drops the
    occasional request under a long per-state loop."""
    params = {"get": ",".join(VARS), "for": for_clause, "key": KEY}
    if in_clause:
        params["in"] = in_clause
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as resp:
                return json.load(resp)
        except (OSError, json.JSONDecodeError) as e:  # URLError, a dropped connection, a timeout
            if attempt == 3:
                raise SystemExit(f"Census API failed for {for_clause} {in_clause or ''}: {e}")
            time.sleep(2 * (attempt + 1))


def to_rows(level, payload, geoid_of):
    """Census rows -> our column order. A value the ACS suppresses or does not compute comes
    back negative (-666666666 and friends) or empty; those become blanks, never zeros."""
    header = payload[0]
    idx = {name: header.index(name) for name in header}
    out = []
    for row in payload[1:]:
        state_fips = row[idx["state"]]
        if state_fips not in STATE_FIPS:
            continue
        code = row[idx[level_geo_col(level)]] if level != "state" else ""
        # "ZZ"/"ZZZ" is the Census's not-defined district - the water and unassigned area a
        # state's districts do not cover. Always zero population; never a district.
        if code.upper().startswith("Z"):
            continue

        def val(var):
            raw = row[idx[var]]
            if raw in ("", None):
                return ""
            try:
                num = float(raw)
            except ValueError:
                return ""
            return "" if num < 0 else raw

        out.append({
            "level": level,
            "geoid": geoid_of(state_fips, code),
            "state_fips": state_fips,
            "code": code,
            "name": row[idx["NAME"]],
            **{col: val(var) for col, var in FIELDS.items()},
        })
    return out


def level_geo_col(level):
    return {
        "cd": "congressional district",
        "sldu": "state legislative district (upper chamber)",
        "sldl": "state legislative district (lower chamber)",
    }[level]


rows = []

# The national row, so a state or district figure can be read against the country's.
print("nation ...", end=" ", flush=True)
us = fetch("us:1")
us_header, us_row = us[0], us[1][:]
rows.append({
    "level": "nation", "geoid": "US", "state_fips": "", "code": "", "name": "United States",
    **{col: (lambda raw: "" if raw in ("", None) or float(raw) < 0 else raw)(us_row[us_header.index(var)])
       for col, var in FIELDS.items()},
})
print("1")

print("states ...", end=" ", flush=True)
before = len(rows)
rows += to_rows("state", fetch("state:*"), lambda st, _code: st)
print(f"{len(rows) - before}")

print("congressional districts ...", end=" ", flush=True)
before = len(rows)
rows += to_rows("cd", fetch("congressional district:*", "state:*"), lambda st, code: st + code)
print(f"{len(rows) - before}")

# SLDU/SLDL reject a wildcard state, so they go state by state. A state with no districts of
# that chamber (NE has no lower chamber; DC has neither) 404s - that is expected, not an error.
for level in ("sldu", "sldl"):
    before = len(rows)
    for st in STATE_FIPS:
        try:
            payload = fetch(f"{level_geo_col(level)}:*", f"state:{st}")
        except SystemExit:
            print(f"  ({level} {st}: no districts reported)", file=sys.stderr)
            continue
        rows += to_rows(level, payload, lambda s, code: s + code)
    print(f"{level}: {len(rows) - before}")

rows.sort(key=lambda r: (["nation", "state", "cd", "sldu", "sldl"].index(r["level"]), r["geoid"]))

with open(DST, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLUMNS)
    w.writeheader()
    w.writerows(rows)

print(f"Written {len(rows)} rows -> {DST}")
