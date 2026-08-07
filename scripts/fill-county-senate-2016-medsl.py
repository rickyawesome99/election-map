#!/usr/bin/env python3
"""
Fills county-level 2016 Senate results for the states Wikipedia's "By county" tables
don't cover (see scrape-county-senate-2016.py's FAILED/gap report) using MIT Election
Data and Science Lab's PRECINCT-level returns
(data-entry/medsl/senate_2016_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/NLTQAD).

This file uses an OLDER MEDSL schema than the 2018/2020/2022 files (state_postal not
state_po, office is a real column needing an explicit "US Senate" filter since the file
mixes every office on the ballot, stage/mode/party values are lowercase, party is blank
for most counties rather than populated - see below).

Of the 17 states Wikipedia had no "By county" table for, only 14 are filled here:
- AK: excluded, same as every other year/source - MEDSL's own coverage notes say
  "Because EAVS data are unavailable for Alaska, the county_ identifiers for
  county-equivalents are missing." Structural, not fixable.
- SC: excluded. SC has `office`/`candidate` == "Straight ticket" rows (by party) that per
  MEDSL's coverage notes need adding to each candidate's direct votes to get the true
  total - but no combination of SC's mode labels (`total`, `absentee`) plus straight-ticket
  reconciles cleanly to senate_past_results.csv's certified total (direct-votes-alone
  undercounts by ~34%; direct+straight-ticket overcounts by ~15-30%; several other
  combinations tried, none land within the usual <1% tolerance). Read as inconsistent
  per-county reporting semantics in the source data that can't be resolved with what's in
  this file - left as a gap rather than publish a guessed number.
- LA: excluded. This file's LA rows are the November jungle-primary vote (24 candidates,
  `stage` still says "gen" since Louisiana doesn't have a separate primary stage - it's
  genuinely one combined all-party ballot), not the December runoff between Kennedy and
  Campbell that senate_past_results.csv's dem_votes/rep_votes/margin actually encode -
  confirmed by both candidates' November totals being meaningfully lower than their
  December runoff totals from a smaller field of opponents splitting votes in round one.
  Different contest entirely, not a data-quality gap this file can close.

The remaining 14 (AZ, FL, GA, IA, ID, IL, KS, KY, MO, NC, OH, OK, UT, WI) reuse
fill-county-senate-2020-medsl.py's approach (per-county TOTAL-vs-sum-other-modes
preference, exact-name -> last-name-token -> length-guarded-prefix matching, with the
dem_matched/rep_matched gating fix from that script). One extra wrinkle here: **`party`
is blank for most counties in most states** (only fully populated for a handful, e.g. one
GA county) - candidate-name matching is therefore doing almost all the work, not the
usual name-then-party-fallback split; the party fallback branch will rarely fire for this
file and that's expected, not a bug.

Missouri needs the same Kansas City fix 2018's file needed, but with a DIFFERENT bogus
fips this time - this file tags KC's ~766 precinct rows with county_fips "29380"
(matches MEDSL's own coverage note: "The associated Census Place FIPS is 2938000",
truncated/reformatted to 5 digits here) rather than 2018's "36000". Same treatment: merge
into Jackson County (29095) as a documented approximation, see
fill-county-senate-2018-medsl.py's docstring for the full reasoning (no crosswalk
available to split it correctly across Jackson/Clay/Cass/Platte).

Run from project root: python3 scripts/fill-county-senate-2016-medsl.py
"""
import csv, os, re
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/senate_2016_precinct.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2016.csv")
YEAR = 2016

# States scrape-county-senate-2016.py couldn't get a "By county" table for, minus
# AK/SC/LA (see module docstring for why each is excluded).
GAP_STATES = ["AZ", "FL", "GA", "IA", "ID", "IL", "KS", "KY", "MO", "NC", "OH", "OK", "UT", "WI"]

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}
NON_CANDIDATE_LABELS = {""}  # blank candidate name (undervote-style artifact rows)
MIN_PREFIX_LEN = 4

MO_KC_BOGUS_FIPS = "29380"
MO_KC_MERGE_TARGET = "29095"  # Jackson County


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


def load_senate_2016():
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
    senate_2016 = load_senate_2016()

    print(f"Reading {MEDSL_CSV} (~258MB, this takes a bit)...")
    rows_by_state = defaultdict(list)
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if (
                row["state_postal"] in GAP_STATES
                and row["office"] == "US Senate"
                and row["stage"] == "gen"
                and row["special"] == "FALSE"
            ):
                rows_by_state[row["state_postal"]].append(row)

    new_rows = []
    report = []
    for abbr in GAP_STATES:
        sub = rows_by_state.get(abbr, [])
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL precinct file"))
            continue

        past = senate_2016.get(abbr)
        dem_name = norm_name(past["dem_candidate"]) if past else None
        rep_name = norm_name(past["rep_candidate"]) if past else None
        dem_last = last_name_token(past["dem_candidate"]) if past else None
        rep_last = last_name_token(past["rep_candidate"]) if past else None

        candidates = sorted({r["candidate"] for r in sub if r["candidate"] not in NON_CANDIDATE_LABELS})
        # party is blank for most counties in this file - use whichever non-blank value
        # any row for this candidate happens to carry, if any.
        party_of = {}
        for r in sub:
            if r["party"] and r["candidate"] not in party_of:
                party_of[r["candidate"]] = r["party"]

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
            elif not dem_matched and party_of.get(c, "").lower() == "democratic":
                bucket_of[c] = "dem"
            elif not rep_matched and party_of.get(c, "").lower() == "republican":
                bucket_of[c] = "gop"
            else:
                bucket_of[c] = "oth"

        # Vote-mode preference must be resolved per (county, candidate), not per state.
        groups = defaultdict(list)
        county_names = {}
        for r in sub:
            cand = r["candidate"]
            if cand in NON_CANDIDATE_LABELS:
                continue
            fips = r["county_fips"].zfill(5)
            if abbr == "MO" and fips == MO_KC_BOGUS_FIPS:
                fips = MO_KC_MERGE_TARGET  # see module docstring
            else:
                county_names[fips] = r["county_name"].replace(" County", "").replace(" county", "").title()
            groups[(fips, cand)].append(r)
        if abbr == "MO":
            county_names[MO_KC_MERGE_TARGET] = "Jackson"

        county_totals = defaultdict(lambda: {"dem": 0, "gop": 0, "oth": 0})
        for (fips, cand), group_rows in groups.items():
            total_rows = [r for r in group_rows if r["mode"] == "total"]
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

    print(f"Replaced {dropped} old GAP_STATES rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
