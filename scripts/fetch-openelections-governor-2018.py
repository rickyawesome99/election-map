#!/usr/bin/env python3
"""
Fetches county-level 2018 Governor results from OpenElections
(github.com/openelections) for the states with no usable "By county" table on
Wikipedia (FL, IA, ID, IL, KS, MI, MN, OH, SC) plus NE, whose Wikipedia table
technically exists but every cell is an unfilled template placeholder with no real
data (see scripts/scrape-county-governor-2018.py's docstring) - OpenElections turned
out to have real NE data despite that. Cross-validates each state's summed totals
against data-entry/governor_past_results.csv.

Writes/merges into data-entry/county_governor_results_2018.csv (same columns as the
Wikipedia scraper: state,county_name,county_id,dem_2018,gop_2018,oth_2018,total_2018).

All 10 states validated to exact or near-exact matches (largest gap: KS ~0.15%, FL
~0.01%) - see memory/project_county_election_scrape.md for the investigation notes,
including two parsing gotchas that would otherwise have looked like missing data:
- **NE's votes column is float-formatted ("607.0" not "607")** - a naive `int(v)` or
  digit-only regex silently fails and looked like an all-zero/empty file at first,
  reproducing the same "no real data" impression Wikipedia's page gave. Fixed by
  parsing every vote value as `int(float(v))`.
- **SC's office label is "Governor and Lieutenant Governor"**, which a naive
  "'governor' in office and 'lieutenant' not in office" filter (written to exclude
  a separate real Lieutenant-Governor-only race in other states) wrongly excludes.
  Exact per-state office-label matching (STATE_CONFIG below) avoids this.

Governor-ticket (Governor + Lt. Governor combined) candidate name formats vary a lot
here - IA uses "Name / Name" or "Name/Name" inconsistently, MN and NE use " and ",
SC uses " / ", KS's raw names are "Last, First" (comma-reversed) instead of a ticket
at all. All handled by `TICKET_SEP` (a regex stripped before name-matching, reusing
the Wikipedia parser's "/running mate" convention from MD 2022) plus a per-state
`comma_swap` flag for KS.

FL has no single combined file - only 67 separate per-county precinct CSVs (one file
per county under data-fl/2018/counties/) - fetched via a template URL + a hardcoded
county-slug list (extracted once from the repo's file listing) rather than an API
directory listing (avoids GitHub's unauthenticated rate limit for a batch this size).

Run from project root: python3 scripts/fetch-openelections-governor-2018.py
"""
import csv, io, os, re, unicodedata, urllib.request
from collections import defaultdict

# Ballot-accounting rows OpenElections includes alongside real candidates in some states'
# precinct files - these aren't real votes for anyone and must be dropped outright, not
# swept into "oth" (found via FL: UnderVotes+OverVotes were inflating oth_2018 by 76,642
# votes statewide, an ~1% total_diff against governor_past_results.csv).
NON_CANDIDATE_LABELS = {"undervotes", "overvotes"}

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
GOVERNOR_PAST_CSV = os.path.join(ROOT, "data-entry/governor_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2018.csv")
YEAR = 2018

# MI's file abbreviates this one county's name; the presidential FIPS CSV has it in full.
NAME_ALIASES = {
    ("MI", "Gd. Traverse"): "Grand Traverse",
}

FL_COUNTY_SLUGS = [
    "alachua", "baker", "bay", "bradford", "brevard", "broward", "calhoun", "charlotte",
    "citrus", "clay", "collier", "columbia", "desoto", "dixie", "duval", "escambia",
    "flagler", "franklin", "gadsden", "gilchrist", "glades", "gulf", "hamilton", "hardee",
    "hendry", "hernando", "highlands", "hillsborough", "holmes", "indian_river", "jackson",
    "jefferson", "lafayette", "lake", "lee", "leon", "levy", "liberty", "madison",
    "manatee", "marion", "martin", "miami_dade", "monroe", "nassau", "okaloosa",
    "okeechobee", "orange", "osceola", "palm_beach", "pasco", "pinellas", "polk",
    "putnam", "santa_rosa", "sarasota", "seminole", "st_johns", "st_lucie", "sumter",
    "suwannee", "taylor", "union", "volusia", "wakulla", "walton", "washington",
]

STATE_CONFIG = {
    "FL": {
        "urls": [
            f"https://raw.githubusercontent.com/openelections/openelections-data-fl/master/2018/counties/20181106__fl__general__{slug}__precinct.csv"
            for slug in FL_COUNTY_SLUGS
        ],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": r"\s*/\s*", "comma_swap": False,
    },
    "IA": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-ia/master/2018/20181106__ia__general__county.csv"],
        "office": "Governor / Lt Gov", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": r"\s*/\s*", "comma_swap": False,
    },
    "ID": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-id/master/2018/20181106__id__general__county.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": None, "comma_swap": False,
    },
    "IL": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-il/master/2018/20181106__il__general__county.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": None, "comma_swap": False,
    },
    "KS": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-ks/master/2018/20181106__ks__general__precinct.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": None, "comma_swap": True,
    },
    "MI": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-mi/master/2018/20181106__mi__general__precinct.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": None, "comma_swap": False,
    },
    "MN": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-mn/master/2018/20181106__mn__general__county.csv"],
        "office": "Governor & Lt Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": r"\s+and\s+", "comma_swap": False,
    },
    "NE": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-ne/master/2018/20181106__ne__general__precinct.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": r"\s+and\s+", "comma_swap": False,
    },
    "OH": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-oh/master/2018/20181106__oh__general__precinct.csv"],
        "office": "Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": None, "comma_swap": False,
    },
    "SC": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-sc/master/2018/20181106__sc__general__precinct.csv"],
        "office": "Governor and Lieutenant Governor", "county_field": "county", "candidate_field": "candidate",
        "votes_field": "votes", "ticket_sep": r"\s*/\s*", "comma_swap": False,
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
    return m


def norm_county(name: str) -> str:
    name = name.replace("ʻ", "").replace("’", "").replace("'", "")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"\s*&\s*", " and ", name)
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


def norm_name(name: str, ticket_sep) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)  # strip "(I)" etc.
    if ticket_sep:
        name = re.split(ticket_sep, name)[0]  # keep only the governor half of a ticket
    return name.strip().lower()


def last_name(full_name: str, ticket_sep) -> str:
    n = norm_name(full_name, ticket_sep)
    return n.split()[-1] if n.strip() else ""


def load_governor_2018():
    m = {}
    with open(GOVERNOR_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == "2018" and row["type"] != "Special":
                m[row["state_abbr"]] = row
    return m


def main():
    pres_fips = load_pres_fips()
    governor_2018 = load_governor_2018()

    out_rows = []
    report = []
    for abbr, cfg in STATE_CONFIG.items():
        rows = []
        for url in cfg["urls"]:
            rows.extend(fetch_csv(url))
        rows = [r for r in rows if r.get("office") == cfg["office"]]

        past = governor_2018[abbr]
        ts = cfg["ticket_sep"]
        dem_name, rep_name = norm_name(past["dem_candidate"], None), norm_name(past["rep_candidate"], None)
        dem_last, rep_last = last_name(past["dem_candidate"], None), last_name(past["rep_candidate"], None)

        by_county = defaultdict(lambda: defaultdict(int))
        for r in rows:
            county = r[cfg["county_field"]].strip()
            county = NAME_ALIASES.get((abbr, county), county)
            cand = r[cfg["candidate_field"]].strip()
            if cand.lower() in NON_CANDIDATE_LABELS:
                continue
            if cfg["comma_swap"] and "," in cand:
                last, first = [p.strip() for p in cand.split(",", 1)]
                cand = f"{first} {last}"
            v = r[cfg["votes_field"]].strip()
            try:
                votes = int(float(v))
            except ValueError:
                votes = 0
            n = norm_name(cand, ts)
            if n == dem_name or (dem_last and last_name(cand, ts) == dem_last):
                bucket = "dem"
            elif n == rep_name or (rep_last and last_name(cand, ts) == rep_last):
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
        if abs(ddiff) > max(500, expected_dem * 0.005) or abs(gdiff) > max(500, expected_gop * 0.005):
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
