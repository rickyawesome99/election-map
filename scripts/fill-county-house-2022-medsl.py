#!/usr/bin/env python3
"""
Fills county-level 2022 U.S. House results for every state OpenElections' sparse 2022
coverage didn't already handle (fetch-openelections-house-2022.py covers only
SD/TN/WV/WY - 2022's OE coverage survey found nothing like 2024's GA/MS/CO/MO/NM/UT/OR/
IN/SC tiers), using MIT Election Data and Science Lab's precinct-level House returns
(data-entry/medsl/house_2022_precinct.tab, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/EOKNGW -
downloaded directly without a Guestbook prompt, same as 2024's file). One national file
covers every state, with `county_fips` already attached per row (no name-matching
against the presidential CSV needed) - same schema as 2024's file (party_simplified,
mode, county_fips, etc.), so this script is a near-verbatim port.

Given the file covers the whole country in one shot and 2022's OpenElections coverage
turned out far sparser than 2024's, MEDSL was tried BEFORE Wikipedia this batch (reverses
the project's usual OpenElections -> Wikipedia -> MEDSL order) - Wikipedia scraping is
only worth building for whatever specific gap states remain after this runs, not as a
blanket second stage.

**AK's county_fips in this file is bogus** - checked before writing TARGET_STATES: AK's
rows use jurisdiction "DISTRICT NN" (state house district) with county_fips values like
"02001".."02040", which collide with REAL Alaska borough FIPS codes (02020 = Anchorage,
a real borough, is also "DISTRICT 20") - so AK is excluded here too, consistent with
every other office/source checked across this whole project ("EAVS data are unavailable
for Alaska" per MEDSL's own recurring documentation).

Unlike Senate (one statewide race), House sums votes PER COUNTY ACROSS EVERY DISTRICT
that touches it, matching this project's other House scripts - candidates are matched
against their own district's row in house_past_results.csv (keyed by (state, district
number), parsed from MEDSL's zero-padded `district` field, or district 1 for an
at-large state's "STATEWIDE"/"AT-LARGE" placeholder).

Reuses fill-county-senate-2020-medsl.py's two hard-won lessons directly:
1. TOTAL-vs-sum-of-modes preference must be decided per (county, district, candidate)
   group, not per state - some counties report a clean TOTAL row, others only
   mode-broken-down rows.
2. Candidate matching needs a third tier beyond exact-name/last-name-token: a
   length-guarded prefix match, since some states' precinct files truncate names
   inconsistently (this pipeline's LA and KY precedent).
Also reuses this project's House-specific true_party_bucket() convention (CA's 6
same-party jungle-primary districts in 2022 - see memory/project_county_election_
scrape.md's 2022 same-party-marker recheck) and the NJ FORCE_SUM_MODES municipal-rollup
fix from 2024's script (kept as a mechanism, re-verified per state below since a bug
found in one year's file isn't guaranteed to recur - re-check before assuming).

Writes/merges into data-entry/county_house_results_2022.csv (same columns as this
project's other House scripts). Run from project root:
python3 scripts/fill-county-house-2022-medsl.py
"""
import csv, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/house_2022_precinct.tab")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")
YEAR = 2022

# Every state except AK (permanent structural gap, see docstring), the 4 states
# fetch-openelections-house-2022.py already covers cleanly (SD, TN, WV, WY), and IN -
# excluded entirely, not just flagged per-county: only 38 of IN's 92 counties appear in
# this file AT ALL, and per-district validation showed even the 38 present counties are
# severely undercounted in 8 of IN's 9 districts (IN-05 alone came out ~99% complete;
# every other district landed at 11%-49% of house_past_results.csv's real total, not a
# tolerance-class gap). No OpenElections 2022 folder exists for IN either (checked in
# this session's fresh coverage survey), so this is a genuine, no-source-available gap
# for now, not a bug in this script - documented here rather than publishing badly
# incomplete numbers for most of the state.
TARGET_STATES = [
    "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "TX", "UT", "VT",
    "VA", "WA", "WI",
]

NON_CANDIDATE_LABELS = {
    "", "BALLOTS CAST", "BLANK BALLOTS", "BLANKS", "CAST VOTES", "CONTEST TOTAL",
    "CONTEST TOTALS", "INVALID VOTES", "OVER VOTES", "OVERVOTES", "SCATTER",
    "TOTAL BALLOTS CAST", "TOTAL VOTES", "TOTAL VOTES CAST", "UNDER VOTES", "UNDERVOTE",
    "UNDERVOTES", "UNDERVOTES-VOIDS", "VOID",
    # NY's file reports precinct rows broken down by ballot/machine-reporting type as if
    # each type were its own "candidate" (found via NY's oth bucket coming out ~33% of
    # its state total - "PUBLIC COUNTER" alone was NY's single largest "candidate" by
    # votes in several districts). None of these are real candidates. "WRITE-IN" and
    # "UNQUALIFIED WRITE-IN" are deliberately NOT here - those are real votes for an
    # actual write-in candidate and belong in oth, same convention as this project's
    # other House scripts.
    "PUBLIC COUNTER", "ABSENTEE / MILITARY", "AFFIDAVIT", "BLANK", "BLANK/VOID",
    "MANUALLY COUNTED EMERGENCY", "SCATTERING",
}

# Real candidates whose name in this file is too mangled for the normal exact/token/
# prefix/compact matching tiers to safely catch (both confirmed as the whole district's
# missing dem/rep total, not a coincidence): SC-03's source data truncates Jeff Duncan's
# surname to "Dan" (too short - 3 chars - to pass prefix_matches' length guard without
# risking false positives elsewhere); PA-04's Madeleine Dean is recorded here under a
# maiden/full legal name variant ("Madeleine D Cunnane") with a wholly different surname
# token, not a spelling variant token-matching could ever bridge. Substituted for the
# raw candidate string before normal matching runs, so both still flow through the same
# true_party_bucket/exact-name pipeline as everything else.
CANDIDATE_ALIASES = {
    ("SC", "JEFF DAN"): "Jeff Duncan",
    ("PA", "MADELEINE D CUNNANE"): "Madeleine Dean",
}

# IL-03/04/06/07 are entirely absent from this file (confirmed: only 13 of IL's 17
# districts have any rows at all; the missing 4 districts' combined dem/gop totals from
# house_past_results.csv account for the WHOLE state-level shortfall exactly - 530,946
# dem / 219,698 gop, matching this run's dem_diff/gop_diff to the vote). All 4 districts
# fall entirely within Cook and DuPage counties (confirmed via each county's own
# districts_2022 output: Cook shows 1;2;5;8;9;10;11 - missing exactly 3/4/6/7; DuPage
# shows only 8;11). Every other IL county's districts_2022 excludes 3/4/6/7 too (checked
# Will/Kane/Kankakee specifically, all close to their 2022 Senate total already) - so
# excluding just these two counties, not a broader swath, is correct. No OpenElections or
# Wikipedia 2022 IL House data exists to fill this properly (checked both this session) -
# documented gap, not guessed at.
#
# MI Midland: caught by the per-county sanity-ratio check (audit-house-2022-ratio.py) -
# only 4,293 votes present for its one district (MI-02) vs a ~41-50k expected range
# (2022 Governor total 41,224; 2024 presidential 50,287) - a genuine, severe single-
# county data gap in this file, not a bucketing bug (the 4 candidates present all match
# house_past_results.csv's MI-02 candidates cleanly, there's just hardly any raw data).
#
# FL St. Johns and Duval: also caught by the ratio check (0.13 and 0.42). St. Johns'
# only present district (FL-06) sums to EXACTLY house_past_results.csv's statewide FL-06
# total across all 6 counties that touch it, so FL-06 itself isn't underrepresented -
# St. Johns must actually be split with another FL district (likely FL-04, whose raw
# rows here only cover Nassau/Duval/Clay, not St. Johns) that's silently missing from
# this file entirely, not just underreported. Duval's only present district (FL-04)
# also checks out on its own, but Duval is large enough to plausibly span the
# neighboring FL-05 too - notably FL-05 (John Rutherford, uncontested in 2022) has
# 0/0 in house_past_results.csv itself (no recorded vote data anywhere, same
# unopposed-race gap class as 2024's OK-03/Frank Lucas), so even a complete FL-05
# portion wouldn't close this gap with real numbers. Excluded rather than publishing a
# number known to undercount by a wide margin.
COUNTY_EXCLUSIONS = {
    ("IL", "COOK"), ("IL", "DUPAGE"), ("MI", "MIDLAND"),
    ("FL", "ST. JOHNS"), ("FL", "DUVAL"),
}

# NJ's file initially came out ~3x overcounted (Gottheimer's Bergen County total alone
# exceeded his whole district's real total). Root cause, different from 2024's file:
# EVERY NJ county has a literal precinct row named "{County} Totals" (Union/Passaic/
# Monmouth/Ocean/Gloucester/Sussex/Warren/Salem also have "District N Totals" rows) whose
# vote count is the sum of every real municipality precinct in that county/district -
# confirmed algebraically for Bergen (its 47 real-precinct rows for Gottheimer sum to
# exactly the "Bergen Totals" row's own value, 124,644). Also hit ID ("COUNTY TOTAL",
# explained ID's ~2x doubling) and MI (smaller-magnitude "TOTALS"/"... - Total" rows).
# Filtered by precinct name rather than a per-state override, since the same literal
# "total(s)" rollup-row pattern recurred in unrelated states this file - a real,
# generalizable MEDSL-2022 quirk, not one state's one-off bug.
ROLLUP_PRECINCT_RE = re.compile(r"\btotals?\b", re.IGNORECASE)

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}
MIN_PREFIX_LEN = 4
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")


def norm_name(name: str) -> str:
    name = TRUE_PARTY_RE.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)  # see scrape-county-house-2024.py's
    # docstring for why this must be a space, not "", to avoid gluing a mid-name
    # nickname's surrounding words together.
    name = re.sub(r'\s*"[^"]*"\s*', " ", name)  # strip a quoted nickname, e.g. MEDSL's
    # 'JESUS "CHUY" GARCIA' - same space-not-empty reasoning as the parenthetical above.
    # Diacritics: MEDSL's candidate names are plain ASCII ("GARCIA"), house_past_results.csv
    # keeps accents ("García") - strip combining marks so both compare equal (IL-04 2024).
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    # MEDSL drops hyphens from compound surnames (IA-01 2024: house_past_results.csv's
    # "Mariannette Miller-Meeks" vs. MEDSL's "MARIANNETTE MILLERMEEKS") - strip them
    # (join, not split, since a hyphenated surname is one semantic unit) so both sides
    # normalize to the same joined form instead of comparing "MILLER-MEEKS" against
    # "MILLERMEEKS" as if they were unrelated.
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "").replace("-", "")
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


def compact_matches(last: str, full_name: str) -> bool:
    """Catches a last name MEDSL splits into two tokens with an internal space
    (MA-02 2024: "JAMES P MC GOVERN" vs. house_past_results.csv's "James McGovern" -
    last_name_token/name_tokens split on whitespace, so "MC" and "GOVERN" never join
    back into "MCGOVERN" and the whole candidate's votes fell through to oth). Checks
    whether the reference last name appears as a contiguous substring once every space
    is stripped from the candidate's full name - length-guarded like prefix_matches to
    avoid short-name false positives."""
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return last in norm_name(full_name).replace(" ", "")


# NY's file reports the overwhelming majority of its precincts through a coarse
# "UNSPECIFIED" mode as the ONLY or PRIMARY mode (confirmed against house_past_results.csv
# district-by-district: NY-01 through NY-12's dem/rep totals matched EXACTLY when
# UNSPECIFIED was included, since most of these precincts have no other mode at all -
# treating UNSPECIFIED as exclude-when-any-other-mode-exists, tried first, wrongly
# gutted counties like Herkimer down to ~13% of their real total, since Herkimer's
# UNSPECIFIED IS the real bulk of votes and its small ABSENTEE rows are a genuine
# supplementary category, not a duplicate). Only TWO counties statewide (confirmed by
# checking every NY precinct's mode set) show a DIFFERENT, genuinely duplicative pattern:
# Otsego (all 50 precincts) and Chenango (31 precincts) report UNSPECIFIED
# ALONGSIDE bare ELECTION_DAY+ABSENTEE rows whose sum roughly reconstructs the same
# underlying vote count a second time - summing both inflated Otsego's House total past
# its own 2024 presidential total (a physical impossibility, unlike the ordinary "House
# exceeds a single top-of-ticket race" case a multi-district county can otherwise show).
UNSPEC_DUPLICATE_COUNTIES = {("NY", "OTSEGO"), ("NY", "CHENANGO")}


def select_votes(abbr: str, county_name: str, group_rows: list) -> int:
    """Sums a (fips, district, candidate) group's votes, preferring TOTAL rows per
    precinct when present (this project's usual rule) - except in
    UNSPEC_DUPLICATE_COUNTIES, where UNSPECIFIED rows are additionally excluded
    whenever a real ELECTION_DAY row exists for that same precinct (see module-level
    comment above for why this can't be a blanket UNSPECIFIED rule)."""
    by_precinct = defaultdict(list)
    for r in group_rows:
        by_precinct[r["precinct"]].append(r)
    total = 0
    for precinct_rows in by_precinct.values():
        total_rows = [r for r in precinct_rows if r["mode"] == "TOTAL"]
        if total_rows:
            use_rows = total_rows
        elif (abbr, county_name) in UNSPEC_DUPLICATE_COUNTIES and any(
                r["mode"] == "ELECTION_DAY" for r in precinct_rows):
            use_rows = [r for r in precinct_rows if r["mode"] != "UNSPECIFIED"]
        else:
            use_rows = precinct_rows
        total += sum(int(float(r["votes"])) for r in use_rows if r["votes"] not in ("", "*"))
    return total


def true_party_bucket(raw_name: str, default_bucket: str) -> str:
    m = TRUE_PARTY_RE.search(raw_name.strip())
    if m:
        return "dem" if m.group(1) == "D" else "gop"
    return default_bucket


def load_house_2024():
    m, names = {}, {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            names[row["state_abbr"]] = row["state_name"]
            if row["year"] != str(YEAR):
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[(row["state_abbr"], dnum)] = row
    return m, names


def load_house_del_history():
    m = {}
    with open(HOUSE_DEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(row["state_name"], int(row["year"]))] = row
    return m


def load_fips_names():
    """{county_fips: canonical_name} from the presidential CSV - MEDSL's own
    county_name is all-caps and Python's .title() mangles names like "MCCLAIN" into
    "Mcclain" instead of "McClain" (caught via a live map screenshot showing the wrong
    casing on OK county labels), so the presidential CSV's already-correct casing is
    used for display instead of re-deriving it from MEDSL's own text."""
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[row["county_id"]] = row["county_name"]
    return m


def parse_district(dfield: str):
    dfield = dfield.strip()
    if dfield.isdigit():
        return int(dfield)
    if dfield.upper() in ("STATEWIDE", "AT-LARGE"):
        return 1
    return None


def main():
    house_2024, state_names = load_house_2024()
    house_del = load_house_del_history()
    fips_names = load_fips_names()
    target_set = set(TARGET_STATES)

    print(f"Reading {MEDSL_CSV} (159MB, this takes a bit)...")
    # Collect BOTH special and non-special rows - a blanket special=="FALSE" filter
    # would silently drop a district whose only 2024 row IS flagged special (TX-18:
    # Sylvester Turner's November ballot filled Sheila Jackson Lee's unexpired term
    # AND served as the regular election, and MEDSL tags the whole race special=TRUE -
    # same "some districts only have a special row" lesson as this project's 2020
    # Senate AZ fix). Decided per (state, district) below, not per state.
    rows_by_state = defaultdict(list)
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        # escapechar="\\" is required, not optional: this file quotes a nickname inside a
        # candidate name with a literal backslash-escaped quote ("EARL L \"BUDDY\" CARTER")
        # instead of standard CSV double-quote doubling. Without it, Python's csv module
        # (which doesn't recognize backslash as an escape by default) ends the quoted field
        # early at the first unescaped ", garbling every affected name into something like
        # 'EARL L \BUDDY\" CARTER"' - silently broke candidate matching in 11 states (AZ,
        # CO, FL, GA, IL, IN, KS, LA, MN, MO, TN), several of which showed up as large
        # dem/gop undercounts (GA/IL/IN/KS/FL) before this was found and fixed.
        for row in csv.DictReader(f, delimiter="\t", escapechar="\\"):
            if (row["office"] == "US HOUSE" and row["state_po"] in target_set
                    and row["stage"] == "GEN" and row["candidate"] not in NON_CANDIDATE_LABELS):
                rows_by_state[row["state_po"]].append(row)

    out_rows = []
    report = []
    for abbr in TARGET_STATES:
        sub = rows_by_state.get(abbr, [])
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL precinct file"))
            continue

        districts_with_regular = {
            parse_district(r["district"]) for r in sub
            if r["special"] == "FALSE" and parse_district(r["district"]) is not None
        }

        # Group raw rows by (fips, district, candidate) first - vote-mode preference
        # (TOTAL vs. sum-of-modes) is decided per group, not per state or even per
        # county (see module docstring).
        groups = defaultdict(list)
        county_names = {}
        raw_county_names = {}
        for r in sub:
            if (abbr, r["county_name"]) in COUNTY_EXCLUSIONS:
                continue
            dnum = parse_district(r["district"])
            if dnum is None or (abbr, dnum) not in house_2024:
                continue
            if r["special"] == "TRUE" and dnum in districts_with_regular:
                continue  # this district already has a regular row elsewhere - skip its special one
            if ROLLUP_PRECINCT_RE.search(r["precinct"]):
                continue  # "{County} Totals"/"District N Totals" row - see ROLLUP_PRECINCT_RE
            fips = r["county_fips"].zfill(5)
            county_names[fips] = fips_names.get(fips, r["county_name"].title())
            raw_county_names[fips] = r["county_name"]
            groups[(fips, dnum, r["candidate"])].append(r)

        by_county = defaultdict(lambda: defaultdict(int))
        by_county_districts = defaultdict(set)
        for (fips, dnum, cand), group_rows in groups.items():
            votes = select_votes(abbr, raw_county_names[fips], group_rows)

            past = house_2024[(abbr, dnum)]
            dem_col_bucket = true_party_bucket(past["dem_candidate"], "dem")
            rep_col_bucket = true_party_bucket(past["rep_candidate"], "gop")
            dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
            dem_last, rep_last = last_name_token(past["dem_candidate"]), last_name_token(past["rep_candidate"])
            distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last

            match_cand = CANDIDATE_ALIASES.get((abbr, cand), cand)
            n = norm_name(match_cand)
            toks = name_tokens(match_cand)
            if dem_name and n == dem_name:
                bucket = dem_col_bucket
            elif rep_name and n == rep_name:
                bucket = rep_col_bucket
            elif distinct_last and (dem_last in toks or prefix_matches(dem_last, toks) or compact_matches(dem_last, cand)):
                bucket = dem_col_bucket
            elif distinct_last and (rep_last in toks or prefix_matches(rep_last, toks) or compact_matches(rep_last, cand)):
                bucket = rep_col_bucket
            elif not distinct_last and dem_last and not rep_name and (dem_last in toks or prefix_matches(dem_last, toks) or compact_matches(dem_last, cand)):
                bucket = dem_col_bucket
            elif not distinct_last and rep_last and not dem_name and (rep_last in toks or prefix_matches(rep_last, toks) or compact_matches(rep_last, cand)):
                bucket = rep_col_bucket
            else:
                bucket = "oth"

            by_county[fips][bucket] += votes
            by_county[fips]["_name"] = county_names[fips]
            by_county_districts[fips].add(dnum)

        sum_dem = sum_gop = sum_oth = sum_total = 0
        for fips, v in by_county.items():
            dem, gop, oth = v.get("dem", 0), v.get("gop", 0), v.get("oth", 0)
            total = dem + gop + oth
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            districts = ";".join(str(d) for d in sorted(by_county_districts[fips]))
            out_rows.append({
                "state": abbr, "county_name": v["_name"], "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
                f"districts_{YEAR}": districts,
            })

        del_row = house_del.get((state_names.get(abbr), YEAR))
        status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}"
        if del_row:
            expected_dem, expected_gop, expected_total = int(del_row["dem_votes"]), int(del_row["rep_votes"]), int(del_row["total_votes"])
            ddiff, gdiff, tdiff = sum_dem - expected_dem, sum_gop - expected_gop, sum_total - expected_total
            status += f" | dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff}"
            if (abs(ddiff) > max(500, expected_dem * 0.01) or abs(gdiff) > max(500, expected_gop * 0.01)
                    or abs(tdiff) > max(500, expected_total * 0.01)):
                status = "MISMATCH " + status
        report.append((abbr, status))

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}", f"districts_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    handled_states = set(TARGET_STATES)
    kept = [r for r in existing_rows if r["state"] not in handled_states]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows for {len(TARGET_STATES)} states -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
