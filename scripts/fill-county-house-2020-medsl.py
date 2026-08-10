#!/usr/bin/env python3
"""
Fills county-level 2020 U.S. House results using MIT Election Data and Science Lab's
national precinct-level House returns (data-entry/medsl/house_2020_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/VLGF2M -
required a Harvard Dataverse Guestbook response, user downloaded manually via browser).
Tried first (before OpenElections/Wikipedia), per this project's usual lesson that a
national MEDSL file, when one exists, is far more efficient than a per-state survey.

Unlike 2022's/2024's .tab files, this file is a standard comma-delimited CSV with proper
doubled-quote escaping (no backslash-escaped quotes, no escapechar needed). Same core
schema as those files (party_simplified, mode, county_fips, candidate, district, etc.)
so the matching/bucketing logic is a near-verbatim port of
fill-county-house-2022-medsl.py, with these 2020-specific differences:

- **District field is zero-padded numeric, "000" for at-large** (not the "STATEWIDE"/
  "AT-LARGE" text tokens 2022's/2024's files used) - parse_district() handles both forms
  so this doesn't actually need to diverge from the shared convention, just confirmed
  fresh for this file rather than assumed.
- **AK's county_name/county_fips are both genuinely empty** (not populated with a bogus
  overlapping fips like some other MEDSL files/years) - codebook explicitly documents
  this. Excluded, consistent with every other office/year in this pipeline.
- **NM and NV mask small precinct vote counts (<10) as literal "-1"** to protect voter
  privacy (both states' README sections instruct dropping these when aggregating) -
  select_votes() clamps any negative vote value to 0 rather than literally subtracting a
  masked "-1" from the county total.
- **MI's precinct "9999" is a synthetic "statistical adjustment" row**, not a real
  precinct (confirmed: 56 rows netting -3,017 votes for US HOUSE) - MEDSL's own README
  says county totals land closer to official when these are dropped. Excluded via
  MI_ADJUSTMENT_PRECINCT, the same mechanism as 2022's ROLLUP_PRECINCT_RE but scoped to
  an exact precinct-id match rather than a name pattern (2020's file has no "{County}
  Totals"-style rollup rows at all - checked every state, none found).
- **NY's fusion-voting lines (Democratic/Working Families/Independence/etc.) already
  share the identical candidate string per party line** (confirmed: "SEAN PATRICK
  MALONEY" appears under DEMOCRAT, WORKING FAMILIES, and INDEPENDENCE as three separate
  party_detailed rows, same spelling every time) - grouping by (fips, district,
  candidate) as this script already does sums all three automatically. This is expected
  to finally close the ~540k Gillibrand-style fusion undercount that's dogged this
  project's Wikipedia-sourced NY Senate scrapes; worth checking whether NY's House
  totals land clean here as informal confirmation.

Reuses fill-county-senate-2020-medsl.py's/2022's House script's established lessons:
per-(county,district,candidate) TOTAL-vs-sum-of-modes preference, and the three-tier
exact/token/prefix candidate name matching (CANDIDATE_ALIASES starts empty - add entries
here if the post-run mismatch report surfaces a mangled name the matching tiers can't
bridge, same iterative process 2022's SC/PA aliases were found through).

Writes/merges into data-entry/county_house_results_2020.csv (same columns as this
project's other House scripts). Run from project root:
python3 scripts/fill-county-house-2020-medsl.py
"""
import csv, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/house_2020_precinct.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2020.csv")
YEAR = 2020

# Every state except AK (permanent structural gap - empty county_name/county_fips in
# this file, see docstring). Any state that turns out badly undercounted after this run
# gets added to a COUNTY_EXCLUSIONS-style list or dropped from TARGET_STATES entirely,
# same iterative process as 2022's IL/MI/FL exclusions - not pre-guessed here.
TARGET_STATES = [
    "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IA",
    "IN", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
    "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
    "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

NON_CANDIDATE_LABELS = {
    "", "BLANK", "BLANK BALLOTS", "BLANKS", "INVALID", "OVER", "OVERVOTES",
    "UNDERVOTES", "ABSTAIN",
}

# Real candidates whose name in this file is too mangled for the normal exact/token/
# prefix/compact matching tiers to safely catch. Starts empty - fill in per the module
# docstring if the post-run report surfaces one.
CANDIDATE_ALIASES = {}

# MI's precinct "9999" - synthetic statistical-adjustment row, not a real precinct (see
# module docstring).
MI_ADJUSTMENT_PRECINCT = "9999"

# SD's Shannon County was renamed Oglala Lakota County in 2015 AND got a new FIPS code
# (46102, replacing the old 46113) - this file still tags all of its rows with the old
# 46113, which doesn't match anything in the presidential reference CSV (which, like the
# rest of this project's data, uses the current 46102), so every Oglala Lakota row was
# silently dropped by the (abbr, dnum) not in house_past-independent fips lookup until
# caught by the missing-county sweep. Confirmed no collision: no other county anywhere
# in the presidential CSV uses either fips.
FIPS_OVERRIDES = {("SD", "46113"): "46102"}

# States/counties dropped after inspecting the audit report - starts empty, filled in
# iteratively the same way 2022's script accumulated its IL/MI/FL entries.
COUNTY_EXCLUSIONS = set()

# LA-05 2020: this file's only "GEN" stage rows for LA-05 are the November jungle
# primary (9 candidates, ~310k total votes) - Ralph Abraham didn't seek reelection, and
# since no candidate cleared 50%, the seat went to a December runoff between two
# Republicans (Luke Letlow/Lance Harris), which is what house_past_results.csv's
# dem_votes/rep_votes/total_votes actually encode (79,306 total). Confirmed by isolating
# LA's state-level mismatch entirely to district 5 (jungle-primary Harris+Letlow both
# read as "gop" via true_party_bucket, since Harris's runoff-reference name carries the
# "(R)" reverse-shape marker - so his primary votes land in the wrong bucket on top of
# being the wrong contest entirely). Same root cause and same "different contest, not a
# scraping bug" resolution as this pipeline's 2016 LA Senate runoff gap (see memory) -
# excluded here rather than publishing jungle-primary numbers under a runoff's totals.
EXCLUDE_DISTRICTS = {("LA", 5)}

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}
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
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return last in norm_name(full_name).replace(" ", "")


def select_votes(group_rows: list) -> int:
    """Sums a (fips, district, candidate) group's votes, preferring TOTAL rows per
    precinct when present, else summing whatever modes exist. Any negative vote value
    (NM/NV's "-1" small-count masking, see module docstring) is clamped to 0 rather than
    subtracted."""
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
    if dfield.isdigit():
        n = int(dfield)
        return 1 if n == 0 else n
    if dfield.upper() in ("STATEWIDE", "AT-LARGE"):
        return 1
    return None


def main():
    house_past, state_names = load_house_past()
    house_del = load_house_del_history()
    fips_names = load_fips_names()
    target_set = set(TARGET_STATES)

    print(f"Reading {MEDSL_CSV} (127MB, this takes a bit)...")
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
            if r["special"] == "FALSE" and parse_district(r["district"]) is not None
        }

        groups = defaultdict(list)
        county_names = {}
        for r in sub:
            if (abbr, r["county_name"]) in COUNTY_EXCLUSIONS:
                continue
            if abbr == "MI" and r["precinct"] == MI_ADJUSTMENT_PRECINCT:
                continue
            dnum = parse_district(r["district"])
            if dnum is None or (abbr, dnum) not in house_past:
                continue
            if (abbr, dnum) in EXCLUDE_DISTRICTS:
                continue
            if r["special"] == "TRUE" and dnum in districts_with_regular:
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
