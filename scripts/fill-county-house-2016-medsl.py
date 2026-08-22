#!/usr/bin/env python3
"""
Fills county-level 2016 U.S. House results using MIT Election Data and Science Lab's
national precinct-level House returns (data-entry/medsl/house_2016_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/PSKDUJ -
downloaded directly with no Guestbook prompt, unlike 2018's/2020's files for this same
project). This is the OLDEST MEDSL schema this pipeline has touched (same vintage as the
2016 Senate precinct file documented in this memory file's Senate section) - genuinely
different column names and conventions from every later year's House file, found by
inspecting fresh rather than assumed:

- **`state_postal` not `state_po`; `office` is `"US House"` (mixed case, not `"US HOUSE"`)
  ; `stage` is lowercase `"gen"` not `"GEN"`.**
- **`county_fips` (and `district`) are FLOAT-STRINGS** ("6001.0", "13.0", at-large is
  "0.0") rather than zero-padded integers - `parse_district()` already handles the
  float-string district case (ported unchanged from 2018's NY-specific fix, which turns
  out to be this file's DEFAULT shape, not an exception); county_fips needs the same
  `int(float(x))` treatment before zero-padding, new this year.
- **`mode` is lowercase `"total"`** for the pre-summed per-precinct row (not `"TOTAL"`)-
  the select_votes() TOTAL-preference check is now case-insensitive to be safe rather
  than hardcoding one exact casing, since this file's mode values are wildly
  inconsistent in case elsewhere (`"Election Day"` vs. `"election day"` vs. `"ed"` all
  appear for the same underlying category in different states/counties).
- **A meaningful fraction of candidate names are in "Last, First[, Suffix]" order
  instead of "First Last[, Suffix]"** (confirmed across 16 states: AK, AL, CA, FL, HI,
  KS, MA, ME, MI, MS, NC, NJ, NV, NY, TN, WI - not just one or two states' files) -
  `norm_name()` now detects and strips a suffix (comma-adjacent or not, anywhere in the
  string - handles "ACCAVITTI, JR., FRANK" with the suffix in the MIDDLE, not just at
  the end) FIRST, then swaps a single remaining "Last, First" comma-pair into "First
  Last" order before the usual token-based normalization runs. Confirmed correct against
  "Lindbeck, Steve" (AK) -> "Steve Lindbeck", "Isadore Hall, III" -> "Isadore Hall" (no
  swap needed once the suffix is gone), "ACCAVITTI, JR., FRANK" -> "Frank Accavitti".
- **AK's county_name/county_fips are still both genuinely empty** - same permanent
  structural gap as every later year checked.
- **KY is the only state with any `special=True` rows** in this file (unlike some
  Senate-year files, no equivalent to the AZ 2020 Senate special-only-row situation
  found here) - the existing per-(state,district) "skip special if a regular row
  exists" logic handles this without changes.

Reuses every other established lesson from 2018's/2020's scripts unchanged: per-(county,
district,candidate) TOTAL-vs-sum-of-modes preference, last-token-to-last-token candidate
matching (not the broader "in toks" check - see 2018's PA-10 Scott/Perry collision fix),
end-anchored prefix/compact matching, negative-vote clamping, SUFFIX_TOKENS including
spelled-out "SENIOR"/"JUNIOR".

Writes/merges into data-entry/county_house_results_2016.csv (same columns as this
project's other House scripts). IN is excluded from TARGET_STATES here entirely - see
fetch-in-sos-house-2016.py, run separately. Run from project root:
python3 scripts/fill-county-house-2016-medsl.py
"""
import csv, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/house_2016_precinct.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2016.csv")
YEAR = 2016

# Every state except AK (permanent structural gap) and IN (fetched separately from its
# own SOS ENR portal - see fetch-in-sos-house-2016.py). Any state that turns out badly
# undercounted after this run gets added to a COUNTY_EXCLUSIONS-style list or dropped
# entirely, same iterative process as prior years - not pre-guessed here.
TARGET_STATES = [
    "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
    "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

NON_CANDIDATE_LABELS = {
    "", "SCATTER", "SCATTERING",
    # NY-specific ballot-accounting pseudo-candidate rows (found via a state/district
    # County-vs-District national-aggregate audit: NY's county total ran ~217K votes
    # ABOVE house_past_results.csv's district-level total, all landing in "oth" - these 6
    # labels sum to 212,446 raw votes, accounting for nearly the entire gap). Same root
    # cause/pattern as 2018's dedicated NY OpenElections script's own ballot-accounting
    # label list (that file's "Public Counter" etc.) and 2018's MEDSL fill script's
    # TOTAL/VOID/BLANK labels - this file just uses NY's own different label wording.
    "ABSENTEE/MILITARY", "AFFIDAVIT", "FEDERAL", "SPECIAL VOTES",
    "MANUALLY COUNTED EMERGENCY", "SPECIAL PRESIDENTIAL",
}

# HI-01 2016's Shirl Ostrov appears under TWO different full-name spellings in this
# file - "OSTROV, Shirlene D. (Shirl)" (45,958 votes, matches house_past_results.csv's
# HI-01 rep_votes exactly) and "OSTROV, Shirlene DelaCruz" (44,090 votes, a near-
# duplicate of her true total under an alternate legal-name spelling) - both survive the
# per-(precinct,mode,candidate) DEDUP_KEEP_LAST_STATES dedup unscathed since they're
# literally different candidate strings, then both independently match "OSTROV" via
# last-name and get double-counted. The duplicate spelling is excluded outright here
# rather than generalizing a fuzzy-duplicate-candidate mechanism, since this is the only
# instance of this exact failure mode found in this file.
STATE_CANDIDATE_EXCLUSIONS = {("HI", "OSTROV, SHIRLENE DELACRUZ")}

# Real candidates whose name in this file is too mangled for the normal exact/token/
# prefix/compact matching tiers to safely catch. NJ-05's Scott Garrett is misspelled
# "Scott Garnett" in some NJ county source files (101,859 of his 148,204 raw votes) -
# "Garrett" vs "Garnett" differ in the middle two letters, too different for the
# prefix/compact end-anchored matching tiers (neither is a prefix of the other, and the
# compacted full name doesn't end with the correct spelling either).
CANDIDATE_ALIASES = {
    ("NJ", "Scott Garnett"): "Scott Garrett",
}

# FIPS overrides for counties MEDSL tags with a stale/mismatched fips vs. the
# presidential reference CSV. Starts with the SD renumbering confirmed in 2020's/2018's
# scripts (old Shannon County fips), re-applied since it's baked into MEDSL's raw source
# data, not year-specific. NY's "36122" entry is this file's own data-entry typo (there
# is no such NY county fips) - confirmed via the row's `jurisdiction` field reading
# "Yates" and `district` reading 23 (matches Ontario/Seneca/Schuyler/Steuben, Yates's
# real NY-23 neighbors) even though `county_name` itself is blank on every one of these
# rows; real NY fips for Yates is 36123 (36121 is Wyoming, its actual neighbor in the
# fips sequence - a plausible off-by-one).
FIPS_OVERRIDES = {("SD", "46113"): "46102", ("NY", "36122"): "36123"}

# NH's `county_fips` is blank for every one of its 13 INCORPORATED CITIES (as opposed to
# towns) - confirmed these 12 cities never carry a populated county_fips anywhere in the
# file, for any office, not just US House (MEDSL's town-to-county crosswalk apparently
# only covers NH's towns). Left unfixed, this silently dropped ~300 rows worth of votes
# (Manchester and Nashua alone are NH's two largest cities) even though the raw
# candidate-level totals matched house_past_results.csv exactly - the bug was entirely
# in this fips lookup, not candidate matching. Filled in via `jurisdiction` name using
# standard NH city-to-county geography (Berlin isn't in this list - it's not a district
# with a blank-fips row in this particular file, not because it's exempt from the bug).
NH_JURISDICTION_FIPS = {
    "Claremont": "33019", "Concord": "33013", "Dover": "33017", "Franklin": "33013",
    "Keene": "33005", "Laconia": "33001", "Lebanon": "33009", "Manchester": "33011",
    "Nashua": "33011", "Portsmouth": "33015", "Rochester": "33017", "Somersworth": "33017",
}

# States/counties/districts dropped after inspecting the audit report - starts empty,
# filled in iteratively the same way prior years accumulated their exclusions.
COUNTY_EXCLUSIONS = set()
# LA-03 and LA-04 2016 both went to December runoffs (8 jungle-primary candidates each,
# no majority winner in November) - same root cause and same "different contest, not a
# scraping bug" resolution as 2020's LA-05 exclusion and 2016's own LA Senate runoff gap
# (see memory). This file's only "gen" stage rows for LA are the November primary
# (confirmed: Angelle/Higgins's primary totals of 91,532/84,912 are HIGHER than their
# runoff totals of 60,762/77,671 per house_past_results.csv - lower turnout in the
# lower-salience runoff, the opposite direction from a missing-votes bug). LA-01/02/05/06
# didn't need a runoff (majority winner or unopposed) and all match exactly.
EXCLUDE_DISTRICTS = {("LA", 3), ("LA", 4)}

# This file has widespread duplicate (county_fips, district, precinct, candidate, mode)
# rows across MANY states (checked broadly: AK/AR/CT/DC/HI/IN/KS/KY/ME/MD/MA/NH/NJ/NY/
# UT/VT/WA all have some), but the CORRECT resolution is opposite depending on the
# state - not a single universal rule:
# - CT's "duplicate" pairs are actually two genuinely different, non-overlapping vote
#   subsets that happen to share the same mode label "total" (confirmed: summing BOTH
#   matches house_past_results.csv exactly for all 5 CT districts) - the default
#   select_votes() behavior (sum every row sharing a precinct+mode) already handles this
#   correctly with no state-specific code.
# - HI's duplicate pairs are a genuine stale-data artifact: an early/incorrect count
#   left in the file alongside a later, correct one for the SAME precinct+mode+candidate
#   (confirmed for HI-01: summing both roughly doubles Hanabusa's and Ostrov's true
#   totals; keeping only the row that appears LAST in file order for each duplicate key
#   reconciles to within 31 votes of the true total, while keeping only the FIRST
#   undercounts by ~16k). Only HI needs this dedup - checked KY (the next-largest dupe
#   count after NY) and it validates cleanly with the sum-everything default, so this is
#   NOT applied blanket to every state with duplicate keys, only ones confirmed to need it.
DEDUP_KEEP_LAST_STATES = {"HI"}

SUFFIX_TOKENS = {"JR", "SR", "JUNIOR", "SENIOR", "II", "III", "IV"}
MIN_PREFIX_LEN = 4
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")
SUFFIX_COMMA_RE = re.compile(r",?\s*(jr\.?|sr\.?|junior|senior|ii|iii|iv)\.?\s*(?=,|$)", re.IGNORECASE)


def norm_name(name: str) -> str:
    name = TRUE_PARTY_RE.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r'\s*"[^"]*"\s*', " ", name)
    name = name.replace("*", "")
    # Strip a suffix wherever it sits (handles "ACCAVITTI, JR., FRANK" - suffix in the
    # MIDDLE - not just "NAME, JR." at the end) before deciding whether a "Last, First"
    # swap is needed, so the suffix's own comma doesn't get mistaken for the name-order
    # comma.
    name = SUFFIX_COMMA_RE.sub("", name)
    name = name.strip().strip(",").strip()
    # Exactly one comma left after suffix removal means "Last, First[ Middle]" order
    # (confirmed across 16 states - see module docstring) - swap to "First Last".
    parts = [p.strip() for p in name.split(",")]
    if len(parts) == 2 and parts[0] and parts[1]:
        name = f"{parts[1]} {parts[0]}"
    elif len(parts) > 2:
        name = " ".join(p for p in parts if p)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "").replace("-", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    # DE 2016's raw candidate strings are "LASTNAME F" (surname + a single trailing
    # first-initial, no comma) - e.g. "REIGLE H" for Hans Reigle. A naive last-token
    # read picks up "H" as the surname instead of "REIGLE", dropping his entire vote
    # total to oth (confirmed: DE showed gop=0 before this fix, with his 172,301 votes
    # sitting in oth). If the trailing token is a single letter and more than one token
    # remains, drop it and use the true last token instead. Checked: only DE's file uses
    # this exact 2-token "Last Initial" shape, but the rule is written generally (any
    # trailing single-letter token, not a DE-specific string match) since a genuine
    # human last name is never one character.
    if len(toks) > 1 and len(toks[-1]) == 1:
        toks = toks[:-1]
    return toks[-1] if toks else ""


def prefix_matches(last: str, cand_last: str) -> bool:
    if not last or len(last) < MIN_PREFIX_LEN or not cand_last or len(cand_last) < MIN_PREFIX_LEN:
        return False
    return last.startswith(cand_last) or cand_last.startswith(last)


def compact_matches(last: str, full_name: str) -> bool:
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return norm_name(full_name).replace(" ", "").endswith(last)


def select_votes(group_rows: list) -> int:
    """Sums a (fips, district, candidate) group's votes, preferring TOTAL rows per
    precinct when present (case-insensitive "total" match - this file's mode casing is
    inconsistent, see module docstring), else summing whatever modes exist. Any negative
    vote value is clamped to 0 rather than subtracted."""
    by_precinct = defaultdict(list)
    for r in group_rows:
        by_precinct[r["precinct"]].append(r)
    total = 0
    for precinct_rows in by_precinct.values():
        total_rows = [r for r in precinct_rows if r["mode"].strip().lower() == "total"]
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


def parse_fips(fips_field: str):
    fips_field = fips_field.strip()
    if not fips_field:
        return None
    try:
        n = int(float(fips_field))
    except ValueError:
        return None
    if n == 0:
        return None
    return str(n).zfill(5)


def main():
    house_past, state_names = load_house_past()
    house_del = load_house_del_history()
    fips_names = load_fips_names()
    target_set = set(TARGET_STATES)

    print(f"Reading {MEDSL_CSV} (242MB, this takes a bit)...")
    rows_by_state = defaultdict(list)
    dedup_last = {}  # state -> {(fips,district,precinct,candidate,mode): row}, only for DEDUP_KEEP_LAST_STATES
    for st in DEDUP_KEEP_LAST_STATES:
        dedup_last[st] = {}
    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cand = row["candidate"].strip()
            abbr = row["state_postal"]
            if not (row["office"] == "US House" and abbr in target_set
                    and row["stage"] == "gen" and cand.upper() not in NON_CANDIDATE_LABELS
                    and (abbr, cand.upper()) not in STATE_CANDIDATE_EXCLUSIONS):
                continue
            if abbr in DEDUP_KEEP_LAST_STATES:
                key = (row["county_fips"], row["district"], row["precinct"], cand, row["mode"])
                dedup_last[abbr][key] = row  # later occurrence overwrites earlier - see DEDUP_KEEP_LAST_STATES docstring
            else:
                rows_by_state[abbr].append(row)
    for st, kept in dedup_last.items():
        rows_by_state[st] = list(kept.values())

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
            fips = parse_fips(r["county_fips"])
            if fips is None and abbr == "NH":
                fips = NH_JURISDICTION_FIPS.get(r["jurisdiction"].strip())
            if fips is None:
                continue
            fips = FIPS_OVERRIDES.get((abbr, fips), fips)
            county_names[fips] = fips_names.get(fips, r["county_name"].replace(" County", "").title())
            groups[(fips, dnum, r["candidate"].strip())].append(r)

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
