#!/usr/bin/env python3
"""
Fetches county-level 2016 Governor results from OpenElections
(github.com/openelections) for the states with no usable "By county" table on
Wikipedia (checked all 10 states with a 2016 race - see
scripts/scrape-county-governor-2016.py for the 5 that DO have one). Cross-validates
each state's summed totals against data-entry/governor_past_results.csv.

Writes/merges into data-entry/county_governor_results_2016.csv (same columns as the
Wikipedia scraper: state,county_name,county_id,dem_2016,gop_2016,oth_2016,total_2016).

Covers MO, MT, ND, NC - all four validated to exact or near-exact matches. OR was
tried and REJECTED: its openelections-data-or precinct file overcounts every
candidate by ~7-8% for reasons not yet diagnosed (no duplicate precinct rows found;
not simply a vote-mode double-count like the "TOTALS"-row issue below) - left as an
unresolved gap rather than publish bad data. See
memory/project_county_election_scrape.md for the investigation notes.

Two source shapes found in practice, handled by STATE_CONFIG below:
- MO/MT/ND: openelections-data-{st}/2016/{date}__{st}__general__county.csv - already
  county-level, one row per (county, office, candidate). MT and ND both have a bogus
  "TOTALS" pseudo-county row (a statewide total disguised as a county row) that must
  be excluded - same idea as Wikipedia's totals-footer-row filtering.
- NC: openelections-results-nc's county-level "raw" file is INCOMPLETE (only captures
  absentee/provisional/curbside categories, ~13k votes total vs the real ~2.3M) - a
  real bug in that particular file, not a scraper issue (confirmed by checking NC's
  own precinct-level "raw" file instead, which has the complete data with a `votes`
  column already inclusive of every mode, and a `jurisdiction` column holding the
  county name in ALL CAPS needing title-casing). Office label is "NC GOVERNOR", not
  the generic "Governor" the data-XX repos use.

Candidate matching reuses the Wikipedia scrapers' name/last-name convention against
governor_past_results.csv's dem_candidate/rep_candidate. ND's candidates are printed
as "Doug Burgum & Brent Sanford" (Governor & Lt. Governor ticket) - stripped at the
" & " separator before matching, same idea as the Wikipedia parser's "/running mate"
strip for MD 2022.

Run from project root: python3 scripts/fetch-openelections-governor-2016.py
"""
import csv, io, os, re, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
GOVERNOR_PAST_CSV = os.path.join(ROOT, "data-entry/governor_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2016.csv")
YEAR = 2016

INDEPENDENT_CITY_OVERRIDES = {
    ("MO", "St. Louis City"): "29510", ("MO", "St. Louis"): "29189",
}

# MO's file reports "Kansas City" as its own line (~128k votes) alongside the four
# real counties it spans (Jackson/Clay/Cass/Platte) - not a real FIPS county. Same
# real-world quirk already hit via MEDSL's MO Senate files (see
# memory/project_county_election_scrape.md's MO_KC_MERGE_TARGET precedent) - merge
# into Jackson County (contains most of KC) as a documented approximation, no better
# fix available without a precinct-to-county crosswalk.
MERGE_COUNTIES = {
    ("MO", "Kansas City"): "Jackson",
}

STATE_CONFIG = {
    "MO": {
        "url": "https://raw.githubusercontent.com/openelections/openelections-data-mo/master/2016/20161108__mo__general__county.csv",
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "exclude_counties": set(), "exclude_candidates": set(), "titlecase_county": False,
    },
    "MT": {
        "url": "https://raw.githubusercontent.com/openelections/openelections-data-mt/master/2016/20161108__mt__general__county.csv",
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "exclude_counties": {"totals"}, "exclude_candidates": set(), "titlecase_county": False,
    },
    "ND": {
        # Besides a bogus "TOTALS" county row (a statewide total disguised as a county),
        # ND *also* has a per-county "TOTALS" pseudo-candidate row (that county's own
        # total, restated as if it were a write-in-style candidate) - both need excluding
        # or the per-county total roughly doubles into the oth bucket.
        "url": "https://raw.githubusercontent.com/openelections/openelections-data-nd/master/2016/20161108__nd__general__county.csv",
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "exclude_counties": {"totals"}, "exclude_candidates": {"totals"},
        "titlecase_county": False,
    },
    "NC": {
        # NC's precinct-level "raw" file uses "jurisdiction" for the precinct code and
        # "parent_jurisdiction" for the county - easy to mix up since the county-level
        # file (which we can't use, see module docstring) calls its county column
        # "jurisdiction" instead.
        "url": "https://raw.githubusercontent.com/openelections/openelections-results-nc/master/raw/20161108__nc__general__precinct__raw.csv",
        "office": "NC GOVERNOR", "county_field": "parent_jurisdiction", "candidate_field": "name_raw",
        "votes_field": "votes", "exclude_counties": set(), "exclude_candidates": set(), "titlecase_county": True,
    },
}


def fetch_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf-8", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def load_pres_fips():
    m = {}
    dupe_names = set()
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            state_map = m.setdefault(row["state"], {})
            if row["county_name"] in state_map:
                dupe_names.add((row["state"], row["county_name"]))
            state_map[row["county_name"]] = row["county_id"]
    for state, name in dupe_names:
        del m[state][name]
    for (state, name), fips in INDEPENDENT_CITY_OVERRIDES.items():
        m.setdefault(state, {})[name] = fips
    return m


def norm_county(name: str) -> str:
    name = name.replace("ʻ", "").replace("’", "").replace("'", "")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"\s*&\s*", " and ", name)  # "Lewis & Clark" vs presidential CSV's "Lewis and Clark"
    return re.sub(r"\s+", " ", name).strip().lower()


def resolve_fips(fips_map: dict, county: str):
    if county in fips_map:
        return fips_map[county]
    target = norm_county(county)
    for name, fips in fips_map.items():
        if norm_county(name) == target:
            return fips
    target_nospace = target.replace(" ", "")
    for name, fips in fips_map.items():
        if norm_county(name).replace(" ", "") == target_nospace:
            return fips
    return None


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)  # strip "(I)" etc.
    name = re.sub(r"\s*&.*$", "", name)  # strip " & Running Mate" (ND ticket format)
    return name.strip().lower()


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


def load_governor_2016():
    m = {}
    with open(GOVERNOR_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == "2016" and row["type"] != "Special":
                m[row["state_abbr"]] = row
    return m


def main():
    pres_fips = load_pres_fips()
    governor_2016 = load_governor_2016()

    out_rows = []
    report = []
    for abbr, cfg in STATE_CONFIG.items():
        rows = fetch_csv(cfg["url"])
        rows = [r for r in rows if r.get("office") == cfg["office"]]

        past = governor_2016[abbr]
        dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
        dem_last, rep_last = last_name(past["dem_candidate"]), last_name(past["rep_candidate"])

        by_county = defaultdict(lambda: defaultdict(int))
        for r in rows:
            county = r[cfg["county_field"]].strip()
            if county.lower() in cfg["exclude_counties"]:
                continue
            if cfg["titlecase_county"]:
                county = county.title()
            county = MERGE_COUNTIES.get((abbr, county), county)
            cand = r[cfg["candidate_field"]].strip()
            if cand.lower() in cfg["exclude_candidates"]:
                continue
            v = r[cfg["votes_field"]].strip()
            votes = int(v) if re.match(r"^-?\d+$", v) else 0
            n = norm_name(cand)
            if n == dem_name or (dem_last and last_name(cand) == dem_last):
                bucket = "dem"
            elif n == rep_name or (rep_last and last_name(cand) == rep_last):
                bucket = "gop"
            else:
                bucket = "oth"
            by_county[county][bucket] += votes

        fips_map = pres_fips.get(abbr, {})
        sum_dem = sum_gop = sum_oth = sum_total = 0
        unmatched = []
        for county, buckets in by_county.items():
            dem, gop, oth = buckets.get("dem", 0), buckets.get("gop", 0), buckets.get("oth", 0)
            total = dem + gop + oth
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            fips = resolve_fips(fips_map, county)
            if not fips:
                unmatched.append(county)
                continue
            out_rows.append({
                "state": abbr, "county_name": county, "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            })

        expected_dem = int(past["dem_votes"].replace(",", ""))
        expected_gop = int(past["rep_votes"].replace(",", ""))
        ddiff, gdiff = sum_dem - expected_dem, sum_gop - expected_gop
        status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} | dem_diff={ddiff} gop_diff={gdiff}"
        if abs(ddiff) > 100 or abs(gdiff) > 100:
            status = "MISMATCH " + status
        if unmatched:
            status += f" | unmatched: {unmatched}"
        report.append((abbr, status))

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    handled_states = set(STATE_CONFIG.keys())
    kept = [r for r in existing_rows if r["state"] not in handled_states]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows for {len(STATE_CONFIG)} states -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
