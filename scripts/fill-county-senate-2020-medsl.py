#!/usr/bin/env python3
"""
Fills county-level 2020 Senate results for the states Wikipedia's "By county" tables
don't cover (see scrape-county-senate-2020.py's FAILED report: AK, IL, KS, KY, LA - AK
excluded, see below) using MIT Election Data and Science Lab's PRECINCT-level returns
(data-entry/medsl/senate_2020_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/ER9XTV).

Unlike 2022 (which had a ready-made county-level file), MEDSL only published 2020 Senate
returns at precinct granularity - this script aggregates precinct rows up to county via
the county_fips column precincts already carry, rather than a separate county-level
source. AK is NOT filled here even though it's in the same FAILED list: the codebook
explicitly notes county_name/county_fips are empty for AK precincts (Alaska reports by
state senate district, not county) - the same structural gap found in every other year
checked so far, not something this source can close either.

Two things this script gets right that a naive per-state port of
fill-county-senate-2022-medsl.py would not:

1. Vote-mode preference (TOTAL row vs. summing ABSENTEE/ELECTION DAY/EARLY/PROVISIONAL
   rows) must be decided PER COUNTY, not per state. Kentucky has a TOTAL row in most
   counties, but 9 counties report only mode-broken-down rows with no TOTAL row at all -
   a blanket "does this state have any TOTAL rows" check (which is what
   fill-county-senate-2022-medsl.py does, safe there because every state it touches
   reports uniformly) would zero out exactly those 9 counties. Confirmed as the cause of
   an initial ~32k dem / ~87k gop KY undercount before this fix.

2. Bucket-matching needs a third priority tier beyond exact-name and last-name-token:
   prefix matching. Louisiana's precinct file truncates some candidate names inconsistently
   per-parish-source ("BILL CASSI" for Bill Cassidy) in a way last-name-token matching
   (which needs the token to equal the CSV's last name, not just start with it) can't
   catch. Added as a same-priority-tier companion to the token check: the CSV's last name
   or the candidate's last token is a prefix of the other (length-guarded at 4+ chars to
   avoid short-name false positives), tried only when the exact/token checks come up
   empty for a given candidate.

Appends its output to the existing data-entry/county_senate_results_2020.csv (adding
rows only for states not already present there, and replacing this script's own prior
output on rerun) rather than writing a separate file, so
generate-county-senate-data.py's glob-by-filename merge doesn't need to change.

Run from project root: python3 scripts/fill-county-senate-2020-medsl.py
"""
import csv, os, re
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/senate_2020_precinct.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2020.csv")
YEAR = 2020

# States scrape-county-senate-2020.py couldn't get a "By county" table for, and that
# MEDSL actually has county-level (via precinct rollup) data for (excludes AK).
GAP_STATES = ["IL", "KS", "KY", "LA"]

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}
NON_CANDIDATE_LABELS = {"UNDERVOTES", "OVERVOTES", "BLANK BALLOTS"}
MIN_PREFIX_LEN = 4


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def name_tokens(name: str) -> set:
    return {t for t in norm_name(name).split() if t not in SUFFIX_TOKENS}


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def prefix_matches(last: str, toks: set) -> bool:
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    for t in toks:
        if len(t) < MIN_PREFIX_LEN:
            continue
        if last.startswith(t) or t.startswith(last):
            return True
    return False


def load_senate_2020():
    # Mirrors scrape-county-senate-2020.py's load_senate_year(): prefer a non-Special row,
    # falling back to a Special one only if that's the only row a state has that year.
    by_state = defaultdict(list)
    with open(SENATE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR):
                by_state[row["state_abbr"]].append(row)
    m = {}
    for state, rows in by_state.items():
        non_special = [r for r in rows if r["type"] != "Special"]
        m[state] = non_special[0] if non_special else rows[0]
    return m


def main():
    senate_2020 = load_senate_2020()

    print(f"Reading {MEDSL_CSV} (164MB, this takes a bit)...")
    rows_by_state = defaultdict(list)
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["state_po"] in GAP_STATES and row["stage"] == "GEN" and row["special"] == "FALSE":
                rows_by_state[row["state_po"]].append(row)

    new_rows = []
    report = []
    for abbr in GAP_STATES:
        sub = rows_by_state.get(abbr, [])
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL precinct file"))
            continue

        past = senate_2020.get(abbr)
        dem_name = norm_name(past["dem_candidate"]) if past else None
        rep_name = norm_name(past["rep_candidate"]) if past else None
        dem_last = last_name_token(past["dem_candidate"]) if past else None
        rep_last = last_name_token(past["rep_candidate"]) if past else None

        candidates = sorted({r["candidate"] for r in sub if r["candidate"] not in NON_CANDIDATE_LABELS})
        party_of = {r["candidate"]: r["party_simplified"] for r in sub}

        def is_dem(c):
            toks = name_tokens(c)
            return norm_name(c) == dem_name or (dem_last and dem_last in toks) or (dem_last and prefix_matches(dem_last, toks))

        def is_rep(c):
            toks = name_tokens(c)
            return norm_name(c) == rep_name or (rep_last and rep_last in toks) or (rep_last and prefix_matches(rep_last, toks))

        dem_matched = bool(dem_name) and any(is_dem(c) for c in candidates)
        rep_matched = bool(rep_name) and any(is_rep(c) for c in candidates)

        bucket_of = {}
        for c in candidates:
            if is_dem(c):
                bucket_of[c] = "dem"
            elif is_rep(c):
                bucket_of[c] = "gop"
            elif not dem_matched and party_of[c] == "DEMOCRAT":
                bucket_of[c] = "dem"
            elif not rep_matched and party_of[c] == "REPUBLICAN":
                bucket_of[c] = "gop"
            else:
                bucket_of[c] = "oth"

        # Vote-mode preference must be resolved per (county, candidate), not per state -
        # see module docstring point 1. Collect every row first, then decide per group.
        groups = defaultdict(list)  # (fips, name, candidate) -> [row, ...]
        county_names = {}
        for r in sub:
            cand = r["candidate"]
            if cand in NON_CANDIDATE_LABELS:
                continue
            fips = r["county_fips"].zfill(5)
            name = r["county_name"].title()
            county_names[fips] = name
            groups[(fips, cand)].append(r)

        county_totals = defaultdict(lambda: {"dem": 0, "gop": 0, "oth": 0})
        for (fips, cand), group_rows in groups.items():
            total_rows = [r for r in group_rows if r["mode"] == "TOTAL"]
            use_rows = total_rows if total_rows else group_rows
            votes = sum(int(r["votes"]) for r in use_rows)
            county_totals[fips][bucket_of[cand]] += votes

        sum_dem = sum_gop = sum_oth = sum_total = 0
        for fips, v in county_totals.items():
            dem, gop, oth = v["dem"], v["gop"], v["oth"]
            total = dem + gop + oth
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            new_rows.append({
                "state": abbr, "county_name": county_names[fips], "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            })

        status = f"{len(county_totals)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}"
        if past:
            expected_dem, expected_gop = int(past["dem_votes"]), int(past["rep_votes"])
            ddiff = sum_dem - expected_dem
            gdiff = sum_gop - expected_gop
            status += f" | vs senate_past_results: dem_diff={ddiff} gop_diff={gdiff}"
            if abs(ddiff) > 5000 or abs(gdiff) > 5000:
                status = "MISMATCH " + status
        report.append((abbr, status))

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    # GAP_STATES rows only ever come from this script (Wikipedia's scraper FAILED on all
    # of them), so replacing rather than skip-on-conflict keeps reruns idempotent.
    kept = [r for r in existing_rows if r["state"] not in GAP_STATES]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old GAP_STATES rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
