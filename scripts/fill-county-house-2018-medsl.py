#!/usr/bin/env python3
"""
Fills county-level 2018 U.S. House results using MIT Election Data and Science Lab's
national precinct-level House returns (data-entry/medsl/house_2018_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IVIXLK -
required a Harvard Dataverse Guestbook response, user downloaded manually via browser).
Standard comma-delimited CSV with proper doubled-quote escaping (no escapechar needed),
same as 2020's file. Near-verbatim port of fill-county-house-2020-medsl.py with these
2018-specific differences found by inspecting the file fresh:

- **`special`/`writein` values are inconsistently capitalized within the SAME file**
  (`"True"`/`"False"` mixed with `"TRUE"`/`"FALSE"`) - every comparison against these
  fields uses `.upper()` now, unlike 2020's script which could compare against the
  literal `"TRUE"`/`"FALSE"` strings directly.
- **District field is usually zero-padded numeric ("000" for at-large), but NY's rows
  use a float-string format instead ("23.0", or "" for a few non-candidate rows)** -
  `parse_district()` now parses via `int(float(dfield))` rather than requiring
  `.isdigit()`, so both "023" and "23.0" resolve to district 23 (checked: no other
  state does this, only NY).
- **NON_CANDIDATE_LABELS gained several new literal pseudo-candidate strings** found by
  scanning this file's actual candidate list fresh (TOTAL, CAST VOTES, VOID, VOIDS,
  TIMES BLANK VOTED, BLANK/VOID, SCATTERED VOTES, BLANK BALLOTS, in addition to the
  OVER/UNDER VOTES family already known from 2020's list) - most concentrated in NY,
  which has a `readme_check`-flagged "TOTAL"-as-candidate-name row pattern (Schuyler
  County, district 23) in addition to its OVERVOTES/UNDERVOTES rows.
- **MI's precinct "9999" must be KEPT this year, the OPPOSITE of 2020's script** - this
  file's own README explicitly says "Aggregating to state/county level including these
  9999 precincts leads to the exact official SOS vote totals" (2020's README said the
  reverse). Confirms this is a per-file decision to re-check, not a fixed rule - no
  MI_ADJUSTMENT_PRECINCT exclusion here at all.
- **NM and UT (not NV this time, though NV's file also documents the same pattern) mask
  small precinct vote counts (<10) as literal "-1"** - same clamp-to-0 handling in
  select_votes() as 2020's script, no code change needed, just re-confirmed from this
  file's own README.
- **NY's README documents real, substantial precinct-data-quality problems for 2018**
  ("insufficiently accurate" in districts 18, 20, 21, 25 for Joseph Morelle specifically,
  minor discrepancies in districts 4, 14, 19, 22, 23, 27) - sourced via OpenElections
  rather than a state file directly. Expect NY's state total to need more tolerance or a
  documented gap rather than an exact match; checked via the post-run validation, not
  assumed upfront.
- **AK's county_name/county_fips are still both genuinely empty** - same permanent
  structural gap as every prior year.

Reuses fill-county-house-2020-medsl.py's other established lessons: per-(county,
district,candidate) TOTAL-vs-sum-of-modes preference, three-tier exact/token/prefix
candidate matching, negative-vote clamping.

Writes/merges into data-entry/county_house_results_2018.csv (same columns as this
project's other House scripts). IN is excluded from TARGET_STATES here entirely - see
fetch-in-sos-house-2018.py, run separately (and BEFORE or AFTER this script, order
doesn't matter since each only touches its own state's rows in the shared output CSV).
Run from project root:
python3 scripts/fill-county-house-2018-medsl.py
"""
import csv, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/house_2018_precinct.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2018.csv")
YEAR = 2018

# Every state except AK (permanent structural gap) and IN (fetched separately from its
# own SOS ENR portal - see fetch-in-sos-house-2018.py). Any state that turns out badly
# undercounted after this run gets added to a COUNTY_EXCLUSIONS-style list or dropped
# entirely, same iterative process as prior years - not pre-guessed here.
TARGET_STATES = [
    "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
    "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

NON_CANDIDATE_LABELS = {
    "", "BLANK", "BLANK BALLOTS", "BLANKS", "BLANK/VOID", "INVALID", "OVER",
    "OVER VOTES", "OVERVOTES", "UNDER", "UNDER VOTES", "UNDERVOTES", "ABSTAIN",
    "TOTAL", "CAST VOTES", "VOID", "VOIDS", "TIMES BLANK VOTED", "SCATTERED VOTES",
}

# Real candidates whose name in this file is too mangled for the normal exact/token/
# prefix/compact matching tiers to safely catch. PA-04's Madeleine Dean recurs from
# 2022's script under the same maiden/full legal name variant ("Madeleine D[ean] Cunnane")
# - confirmed her raw per-district vote total (211,524) exactly matches
# house_past_results.csv's PA-04 dem_votes, just under an unmatchable name.
CANDIDATE_ALIASES = {
    ("PA", "MADELEINE DEAN CUNNANE"): "Madeleine Dean",
}

# FIPS overrides for counties MEDSL tags with a stale/mismatched fips vs. the
# presidential reference CSV. Starts with 2020's confirmed SD renumbering (old Shannon
# County fips), re-applied here since it's baked into MEDSL's raw source data, not
# year-specific - re-check the missing-county sweep in case this file uses yet another
# stale value or a new one turns up.
FIPS_OVERRIDES = {("SD", "46113"): "46102"}

# States/counties/districts dropped after inspecting the audit report - starts empty,
# filled in iteratively the same way prior years accumulated their exclusions.
COUNTY_EXCLUSIONS = set()
EXCLUDE_DISTRICTS = set()

# PA-06 2018 spells out "SENIOR" in full ("GREGORY MICHAEL MCCAULEY SENIOR") rather than
# abbreviating "SR" - without it here, last_name_token() returned "SENIOR" itself as the
# last token instead of "MCCAULEY", dropping his entire 124,124 votes into oth.
SUFFIX_TOKENS = {"JR", "SR", "JUNIOR", "SENIOR", "II", "III", "IV"}
MIN_PREFIX_LEN = 4
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")


def norm_name(name: str) -> str:
    name = TRUE_PARTY_RE.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r'\s*"[^"]*"\s*', " ", name)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "").replace("-", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def prefix_matches(last: str, cand_last: str) -> bool:
    """Compares a reference last name against the CANDIDATE'S OWN last-name token only
    (not their full token set) - catches genuine truncation (KY precinct files'
    "BILL CASSI" for "Bill Cassidy") without the collision risk of matching against an
    unrelated first/middle token, e.g. PA-10 2018's Scott (G.) Perry vs. George Scott,
    where "Scott" is simultaneously a first name and the other candidate's whole last
    name (see module docstring)."""
    if not last or len(last) < MIN_PREFIX_LEN or not cand_last or len(cand_last) < MIN_PREFIX_LEN:
        return False
    return last.startswith(cand_last) or cand_last.startswith(last)


def compact_matches(last: str, full_name: str) -> bool:
    """Catches a last name MEDSL splits into two tokens with an internal space
    (MA-02 2024: "JAMES P MC GOVERN" vs. "James McGovern") by checking whether the
    reference last name appears at the END of the candidate's space-stripped full name
    - not merely anywhere within it, which would reopen the same first/last-name
    collision prefix_matches was narrowed to avoid (a first name earlier in the string
    could otherwise satisfy a bare substring check)."""
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return norm_name(full_name).replace(" ", "").endswith(last)


def select_votes(group_rows: list) -> int:
    """Sums a (fips, district, candidate) group's votes, preferring TOTAL rows per
    precinct when present, else summing whatever modes exist. Any negative vote value
    (NM/UT/NV's "-1" small-count masking) is clamped to 0 rather than subtracted."""
    by_precinct = defaultdict(list)
    for r in group_rows:
        by_precinct[r["precinct"]].append(r)
    total = 0
    for precinct_rows in by_precinct.values():
        total_rows = [r for r in precinct_rows if r["mode"] == "TOTAL"]
        use_rows = total_rows if total_rows else precinct_rows
        for r in use_rows:
            if r["votes"] in ("", "*"):
                continue
            v = int(float(r["votes"]))
            total += max(v, 0)
    return total


def true_party_bucket(raw_name: str, default_bucket: str) -> str:
    m = TRUE_PARTY_RE.search(raw_name.strip())
    if m:
        return "dem" if m.group(1) == "D" else "gop"
    return default_bucket


def load_house_past():
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
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[row["county_id"]] = row["county_name"]
    return m


def parse_district(dfield: str):
    dfield = dfield.strip()
    if not dfield:
        return None
    try:
        n = int(float(dfield))
    except ValueError:
        if dfield.upper() in ("STATEWIDE", "AT-LARGE"):
            return 1
        return None
    return 1 if n == 0 else n


def main():
    house_past, state_names = load_house_past()
    house_del = load_house_del_history()
    fips_names = load_fips_names()
    target_set = set(TARGET_STATES)

    print(f"Reading {MEDSL_CSV} (133MB, this takes a bit)...")
    rows_by_state = defaultdict(list)
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
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
            if r["special"].upper() == "FALSE" and parse_district(r["district"]) is not None
        }

        groups = defaultdict(list)
        county_names = {}
        for r in sub:
            if (abbr, r["county_name"]) in COUNTY_EXCLUSIONS:
                continue
            dnum = parse_district(r["district"])
            if dnum is None or (abbr, dnum) not in house_past:
                continue
            if (abbr, dnum) in EXCLUDE_DISTRICTS:
                continue
            if r["special"].upper() == "TRUE" and dnum in districts_with_regular:
                continue
            fips = r["county_fips"].zfill(5)
            if not fips.strip() or fips == "00000":
                continue
            fips = FIPS_OVERRIDES.get((abbr, fips), fips)
            county_names[fips] = fips_names.get(fips, r["county_name"].title())
            groups[(fips, dnum, r["candidate"])].append(r)

        by_county = defaultdict(lambda: defaultdict(int))
        by_county_districts = defaultdict(set)
        for (fips, dnum, cand), group_rows in groups.items():
            votes = select_votes(group_rows)

            past = house_past[(abbr, dnum)]
            dem_col_bucket = true_party_bucket(past["dem_candidate"], "dem")
            rep_col_bucket = true_party_bucket(past["rep_candidate"], "gop")
            dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
            dem_last, rep_last = last_name_token(past["dem_candidate"]), last_name_token(past["rep_candidate"])
            distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last

            match_cand = CANDIDATE_ALIASES.get((abbr, cand), cand)
            n = norm_name(match_cand)
            # cand_last (the candidate's OWN last-name token) is compared against
            # dem_last/rep_last exactly, rather than the looser "dem_last in toks"
            # this project's earlier fill scripts used - that broader check has a real
            # collision bug: PA-10 2018 pit George SCOTT (D) against SCOTT G Perry (R),
            # and "SCOTT" (the Democrat's last name) is also the Republican's FIRST
            # name, so "dem_last in toks" matched Perry's entire vote total into the
            # dem bucket. Comparing last-token-to-last-token instead of last-token-to-
            # any-token avoids this; prefix_matches/compact_matches (for genuine
            # truncation/spacing mismatches, a different failure mode) still use the
            # full token set since they're not vulnerable to this first/last collision.
            cand_last = last_name_token(match_cand)
            if dem_name and n == dem_name:
                bucket = dem_col_bucket
            elif rep_name and n == rep_name:
                bucket = rep_col_bucket
            elif distinct_last and (cand_last == dem_last or prefix_matches(dem_last, cand_last) or compact_matches(dem_last, cand)):
                bucket = dem_col_bucket
            elif distinct_last and (cand_last == rep_last or prefix_matches(rep_last, cand_last) or compact_matches(rep_last, cand)):
                bucket = rep_col_bucket
            elif not distinct_last and dem_last and not rep_name and (cand_last == dem_last or prefix_matches(dem_last, cand_last) or compact_matches(dem_last, cand)):
                bucket = dem_col_bucket
            elif not distinct_last and rep_last and not dem_name and (cand_last == rep_last or prefix_matches(rep_last, cand_last) or compact_matches(rep_last, cand)):
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
