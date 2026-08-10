#!/usr/bin/env python3
"""
Fills county-level 2018 U.S. House results for NEW YORK ONLY, from OpenElections'
raw precinct-level general-election file (github.com/openelections/openelections-data-ny,
2018/20181106__ny__general__precinct.csv) rather than MEDSL's national file.

MEDSL's 2018 file (fill-county-house-2018-medsl.py) is ALSO sourced from this exact
OpenElections file per its own README ("The raw data were gathered by OpenElections"),
but MEDSL's cleaning process trimmed it heavily: "Substantial portions of the state-
supplied data had to be removed due to large and irreconcilable discrepancies... in many
cases the discrepancies were so large that we simply omit any reporting from the race."
Confirmed via a missing-county check: MEDSL's file has US HOUSE rows for only 47 of NY's
62 counties; going straight to OpenElections recovers 60/62 (only Orange and Wyoming
remain absent from OpenElections' own file too - genuinely missing at the source, not a
MEDSL-specific trim). Given the scale of NY's gap, this dedicated per-state script fills
ALL of NY 2018 from OpenElections directly (not just the 15 counties MEDSL dropped), to
avoid mixing two differently-cleaned sources for the same state - run this AFTER
fill-county-house-2018-medsl.py; it fully replaces NY's rows in the shared output CSV.

Schema differences from the MEDSL precinct files this project's other fill scripts are
built around, found by inspecting this file fresh:
- **One row per (precinct, candidate) already fully aggregated** - no per-precinct mode
  breakdown to reconcile (no TOTAL-vs-sum-of-modes decision needed at all).
- **`office` has two literal values for the same seat**: "U.S. House" (the regular
  election) and "U.S. House - Unexpired Term" (NY-25's special election, filling Louise
  Slaughter's seat - she died in office in 2018, and the special ran alongside the
  regular race). Only "U.S. House" is kept, per this project's standing "filter to the
  regular row" convention. **The unexpired-term race is ALSO mislabeled under the
  regular "U.S. House" office for some Monroe County precincts, with district value
  "25-Unexpired" instead of "25"** - filtered out via an explicit "Unexpired" substring
  check on the district field, not just the office-label filter, since the office label
  alone doesn't catch every occurrence.
- **Cattaraugus County's entire district value is a data-entry typo: "29" instead of
  "23"** (NY has no district 29; Cattaraugus's candidate there, Tracy Mitrano, is
  confirmed to be NY-23's actual Democratic nominee via house_past_results.csv, and
  Cattaraugus is confirmed to touch NY-23 in this project's later-year data) - remapped
  via a single hardcoded override rather than a general fuzzy-district mechanism, since
  this is the only non-numeric/out-of-range district value found in NY's file.
- **NON_CANDIDATE_LABELS needed a full fresh survey** - this file's placeholder rows use
  Title Case / mixed case ("Blank", "Over Votes", "Scattered", "Total", "Void", etc.)
  rather than MEDSL's ALL-CAPS convention, so matching is done case-insensitively.
  Write-in variants (many spellings: "Write-In", "Write ins", "WRITE IN", "writein", -
  and "Unqualified Write-Ins") are deliberately NOT excluded, same as every other script
  in this pipeline - those are real votes for an actual write-in candidate, routed to oth.
- **~2,400 rows have a blank `votes` field** - all "writein"/zero-vote placeholder rows
  (confirmed via spot check, concentrated in Kings/Nassau/New York/Clinton/Richmond) -
  treated as 0, not skipped, so their (harmless) presence doesn't need a separate filter.
- **Fusion-voting lines share the candidate's name with minor spelling variance**
  ("Sean Patrick Maloney" vs. "Sean Maloney" across different county files, both for the
  same NY-18 candidate) - the existing last-name-token fallback (not just exact-name)
  already handles this the same way it handles any other spelling variant.

Writes/merges into data-entry/county_house_results_2018.csv (only NY's rows). Orange and
Wyoming counties remain a documented gap - genuinely absent from OpenElections' own file,
not recoverable from this source. Run from project root:
python3 scripts/fill-county-house-2018-ny-openelections.py
"""
import csv, io, os, re, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2018.csv")
YEAR = 2018
STATE_ABBR = "NY"

SRC_URL = "https://raw.githubusercontent.com/openelections/openelections-data-ny/master/2018/20181106__ny__general__precinct.csv"

NON_CANDIDATE_LABELS = {
    "", "blank", "blank votes", "blank/void", "blanks", "over votes", "overvotes",
    "over", "overvote", "scattered", "scattering", "scatterings", "scatter", "total",
    "total votes", "under votes", "under/over votes", "undervotes", "under", "undervote",
    "void", "voids", "voids/blanks", "special votes",
    # Ballot-type/reporting-method labels that this file records as if they were their
    # own "candidate" row (same root pattern as MEDSL's NY PUBLIC COUNTER bug
    # documented in fill-county-house-2022-medsl.py, recurring here since both sources
    # trace back to the same underlying state-supplied data) - "public counter" alone
    # accounts for 756k statewide votes, easily the single largest false "candidate" by
    # vote count found in this file.
    "public counter", "absentee / military", "affidavit", "federal",
    "manually counted emergency",
}

# Cattaraugus's raw district value is the literal typo "29" - see module docstring.
DISTRICT_OVERRIDES = {("Cattaraugus", "29"): "23"}

# Several counties carry one extra "precinct" row per district that's actually a
# COUNTY- or TOWN-WIDE ROLLUP (its vote total is the sum of every real precinct
# underneath it) rather than a real polling place - left in, these roughly doubled the
# affected district's totals (confirmed algebraically for Kings/district 7: Velazquez's
# normal precinct rows plus the single "KING NY" row summed to almost exactly 2x her
# real total). Two distinct naming conventions found, checked fresh across the whole
# file rather than assumed complete after the first 3 found:
# - "{COUNTY} NY" or the bare county name reused as the precinct value (Kings, Tompkins,
#   New York) - can't be caught by a generic pattern since it's the county's own name,
#   so these 3 are hardcoded explicitly.
# - Any precinct whose name contains the word "total" (Erie's "City of Buffalo Total",
#   Saratoga's "Saratoga Total", Ulster's "Ulster Total", Broome's "Broome TOTAL Town of
#   Sanford") - caught generically via ROLLUP_PRECINCT_RE, the same "\btotals?\b"
#   convention this pipeline's 2022 MEDSL NJ fix (fill-county-house-2022-medsl.py)
#   established for an analogous rollup-row pattern in a different source/year.
# Checked Queens, Bronx, and Richmond for either pattern under a different naming
# convention - none found; only the counties above use a rollup-row shape in this file.
ROLLUP_PRECINCTS = {("Kings", "KING NY"), ("Tompkins", "TOMPKINS NY"), ("New York", "New York")}
ROLLUP_PRECINCT_RE = re.compile(r"\btotals?\b", re.IGNORECASE)

SUFFIX_RE = re.compile(r",?\s*(jr\.?|sr\.?|junior|senior|ii|iii|iv)\s*$", re.IGNORECASE)


def fetch_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf-8", errors="replace")
    text = text.lstrip("﻿")
    return list(csv.DictReader(io.StringIO(text)))


def norm_name(name: str) -> str:
    name = re.sub(r'"[^"]*"', "", name)
    name = re.sub(r"'[^']*'", "", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = SUFFIX_RE.sub("", name)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", name).strip().lower()


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


def compact_matches(last: str, full_name: str) -> bool:
    """Catches a last name this file splits into two tokens with an internal space
    (NY-03 2018: "Dan P De Bono" vs. house_past_results.csv's "Dan DeBono" - last_name()
    alone returns just "bono", losing the "de" prefix) by checking whether the
    reference last name appears at the END of the candidate's space-stripped full name."""
    if not last or len(last) < 4:
        return False
    return norm_name(full_name).replace(" ", "").endswith(last)


def load_pres_fips():
    m = {}
    dupe_names = set()
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] != STATE_ABBR:
                continue
            if row["county_name"] in m:
                dupe_names.add(row["county_name"])
            m[row["county_name"]] = row["county_id"]
    for name in dupe_names:
        del m[name]
    return m


def norm_county(name: str) -> str:
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", name).strip().lower()


def resolve_fips(fips_map: dict, county: str):
    if county in fips_map:
        return fips_map[county]
    target = norm_county(county)
    for name, fips in fips_map.items():
        if norm_county(name) == target:
            return fips
    return None


def load_house_past():
    m = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] != str(YEAR) or row["state_abbr"] != STATE_ABBR:
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[dnum] = row
    return m


def load_house_del_history():
    m = {}
    with open(HOUSE_DEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(row["state_name"], int(row["year"]))] = row
    return m


def main():
    fips_map = load_pres_fips()
    fips_to_name = {fips: name for name, fips in fips_map.items()}
    house_past = load_house_past()
    house_del = load_house_del_history()

    print(f"Fetching {SRC_URL} ...")
    rows = fetch_csv(SRC_URL)
    rows = [r for r in rows if r.get("office") == "U.S. House"]

    by_county = defaultdict(lambda: defaultdict(int))
    by_county_districts = defaultdict(set)
    dropped_votes = 0
    for r in rows:
        county = r["county"].strip()
        precinct = r["precinct"].strip()
        if (county, precinct) in ROLLUP_PRECINCTS or ROLLUP_PRECINCT_RE.search(precinct):
            continue
        dfield = r["district"].strip()
        dfield = DISTRICT_OVERRIDES.get((county, dfield), dfield)
        if "unexpired" in dfield.lower():
            continue
        if not dfield.isdigit():
            continue
        dnum = int(dfield)
        if dnum not in house_past:
            continue

        cand = r["candidate"].strip()
        if cand.lower() in NON_CANDIDATE_LABELS:
            continue
        v = (r.get("votes") or "").strip().replace(",", "")
        votes = int(float(v)) if v else 0

        past = house_past[dnum]
        dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
        dem_last, rep_last = last_name(past["dem_candidate"]), last_name(past["rep_candidate"])
        distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last

        n, cl = norm_name(cand), last_name(cand)
        if dem_name and n == dem_name:
            bucket = "dem"
        elif rep_name and n == rep_name:
            bucket = "gop"
        elif distinct_last and (cl == dem_last or compact_matches(dem_last, cand)):
            bucket = "dem"
        elif distinct_last and (cl == rep_last or compact_matches(rep_last, cand)):
            bucket = "gop"
        elif not distinct_last and dem_last and not rep_name and (cl == dem_last or compact_matches(dem_last, cand)):
            bucket = "dem"
        elif not distinct_last and rep_last and not dem_name and (cl == rep_last or compact_matches(rep_last, cand)):
            bucket = "gop"
        else:
            bucket = "oth"

        by_county[county][bucket] += votes
        by_county_districts[county].add(dnum)

    out_rows = []
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
        county_name = fips_to_name.get(fips, county)
        districts = ";".join(str(d) for d in sorted(by_county_districts[county]))
        out_rows.append({
            "state": STATE_ABBR, "county_name": county_name, "county_id": fips,
            f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            f"districts_{YEAR}": districts,
        })

    del_row = house_del.get(("New York", YEAR))
    expected_dem, expected_gop, expected_total = int(del_row["dem_votes"]), int(del_row["rep_votes"]), int(del_row["total_votes"])
    ddiff, gdiff, tdiff = sum_dem - expected_dem, sum_gop - expected_gop, sum_total - expected_total
    status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total} | dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff}"
    if abs(ddiff) > max(500, expected_dem * 0.01) or abs(gdiff) > max(500, expected_gop * 0.01):
        status = "MISMATCH " + status
    if unmatched:
        status += f" | unmatched counties: {unmatched}"

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

    print(f"Wrote {len(out_rows)} NY rows -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)")
    print(f"NY: {status}")


if __name__ == "__main__":
    main()
