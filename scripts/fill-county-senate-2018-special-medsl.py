#!/usr/bin/env python3
"""
Fills county-level 2018 Senate SPECIAL election results for Minnesota (Smith vs.
Housley, filling Al Franken's vacancy) using MIT Election Data and Science Lab's
precinct-level returns (data-entry/medsl/senate_2018_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/DGNAFS) - the
same file this project's fill-county-senate-2018-medsl.py already used to fill MN's
REGULAR 2018 race (Wikipedia's "By county" table doesn't exist for MN either race that
year), just filtered to special=="TRUE" instead of "FALSE".

Mississippi's 2018 special (Hyde-Smith vs. Espy) is NOT included here - Wikipedia's
"By county" table for that race scraped cleanly (see
scripts/scrape-county-senate-2018-special.py), an exact match against
senate_past_results.csv, so no MEDSL fill is needed for it.

Writes data-entry/county_senate_special_results_2018.csv (creating/appending, same
convention as the regular fill scripts) with the SAME column shape as the regular file
(state,county_name,county_id,dem_2018,gop_2018,oth_2018,total_2018).

Run from project root: python3 scripts/fill-county-senate-2018-special-medsl.py
"""
import csv, os, re
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/senate_2018_precinct.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_special_results_2018.csv")
YEAR = 2018

GAP_STATES = ["MN"]

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}
NON_CANDIDATE_LABELS = {"UNDERVOTES", "OVERVOTES", "TIMES BLANK VOTED"}
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


def load_senate_special_2018():
    m = {}
    with open(SENATE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR) and row["type"] == "Special":
                m[row["state_abbr"]] = row
    return m


def main():
    senate_special = load_senate_special_2018()

    print(f"Reading {MEDSL_CSV} (~130MB, this takes a bit)...")
    rows_by_state = defaultdict(list)
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["state_po"] in GAP_STATES and row["stage"] == "GEN" and row["special"] == "TRUE":
                rows_by_state[row["state_po"]].append(row)

    new_rows = []
    report = []
    for abbr in GAP_STATES:
        sub = rows_by_state.get(abbr, [])
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL precinct file"))
            continue

        past = senate_special.get(abbr)
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
        # some counties have no TOTAL row and need their other mode rows summed.
        groups = defaultdict(list)
        county_names = {}
        for r in sub:
            cand = r["candidate"]
            if cand in NON_CANDIDATE_LABELS:
                continue
            fips = r["county_fips"].zfill(5)
            county_names[fips] = r["county_name"].title()
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
    kept = [r for r in existing_rows if r["state"] not in GAP_STATES]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Wrote {len(new_rows)} rows ({dropped} old rows replaced) -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
