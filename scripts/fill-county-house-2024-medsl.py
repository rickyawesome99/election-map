#!/usr/bin/env python3
"""
Fills county-level 2024 U.S. House results for the states neither OpenElections
(fetch-openelections-house-2024.py) nor Wikipedia (scrape-county-house-2024.py) could
cover, using MIT Election Data and Science Lab's precinct-level House returns
(data-entry/medsl/house_2024_precinct.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/USBYR4 - this
release downloaded directly without a Guestbook prompt, unlike some of this project's
earlier MEDSL pulls). One national file covers every state, with `county_fips` already
attached per row (no name-matching against the presidential CSV needed) - MEDSL's own
per-state vote-aggregation checks in house_2024_precinct_README.md (comparing this
precinct file's presidential/Senate sums against their own separately-compiled county
files) gave every TARGET_STATE a clean bill of health before this script was written,
except three documented exceptions handled below (LA, ME, NJ).

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
Also reuses this project's House-specific true_party_bucket() convention (CA/WA
same-party jungle-primary races - see scrape-county-house-2024.py's docstring) even
though no TARGET_STATE here hit it in 2024, as a defensive measure.

Three states needed hand-documented exceptions, all noted in house_2024_precinct_
README.md itself:
- **LA**: the source only contains Election Day (in-person) votes - early voting
  (reported only at the parish level, not per precinct) is entirely absent. This
  undercounts LA by roughly a third statewide; included anyway (better than nothing,
  same precedent as this project's other "documented, not chased further" gaps) but
  flagged loudly in the per-state report.
- **ME**: precinct totals are FIRST-ROUND counts; Maine's federal races use ranked-
  choice voting, so these won't match house_past_results.csv's final RCV-redistributed
  totals whenever a race required a second round. Included as first-round data with the
  gap documented, not corrected (no straightforward way to redistribute votes from
  precinct-level first-round data alone).
- **NJ**: Bergen and Gloucester report BOTH a municipal-level rollup row (`precinct`
  is the bare town name, e.g. "Allendale", mode always `TOTAL`) AND separate individual
  election-district rows (`precinct` = "Allendale 1", "Allendale 2", ... - each with
  its own modes plus its own, non-inflated `TOTAL` tag) for the SAME underlying votes -
  summing everything naively double-counts every town. `FORCE_SUM_MODES` handles this
  for just these two counties by keeping only precincts whose name ends in a numeric
  suffix (the individual EDs, dropping the bare-name municipal rollups) and then, within
  those, summing the non-`TOTAL` modes (dropping each ED's own redundant `TOTAL` tag
  too). Small known side effect: a handful of towns report provisional ballots under a
  separate non-numbered "{Town} Provisional" precinct not attributable to any specific
  ED - this heuristic drops those too (a few dozen votes per town at most, negligible
  next to the alternative of guessing which "TOTAL" row is real). Burlington,
  Cumberland, Essex, and Mercer have no `TOTAL` rows at all, so the normal per-group
  logic already does the right thing for them without an override.

Writes/merges into data-entry/county_house_results_2024.csv (same columns as this
project's other House scripts). Run from project root:
python3 scripts/fill-county-house-2024-medsl.py
"""
import csv, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/house_2024_precinct.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2024.csv")
YEAR = 2024

# Every state neither OpenElections nor Wikipedia could cover for 2024 House (AK
# excluded - permanent structural gap, confirmed dead in every source across this
# whole project; DC has no voting House seat at all).
TARGET_STATES = [
    "AZ", "CA", "CT", "FL", "IA", "ID", "IL", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
    "NC", "NE", "NH", "NJ", "NY", "OK", "PA", "RI", "TX", "WI",
]

NON_CANDIDATE_LABELS = {
    "", "BLANK BALLOTS", "BLANKS", "CAST VOTES", "CONTEST TOTAL", "INVALID VOTES",
    "OVER VOTES", "OVERVOTES", "SCATTER", "TOTAL BALLOTS CAST", "TOTAL VOTES CAST",
    "UNDER VOTES", "UNDERVOTE", "UNDERVOTES", "UNDERVOTES-VOIDS", "VOID",
}

# NJ's TOTAL-mode rows double-count in these two counties specifically (see module
# docstring) - always sum the non-TOTAL modes for them instead of preferring TOTAL.
FORCE_SUM_MODES = {("NJ", "BERGEN"), ("NJ", "GLOUCESTER")}

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

    print(f"Reading {MEDSL_CSV} (185MB, this takes a bit)...")
    # Collect BOTH special and non-special rows - a blanket special=="FALSE" filter
    # would silently drop a district whose only 2024 row IS flagged special (TX-18:
    # Sylvester Turner's November ballot filled Sheila Jackson Lee's unexpired term
    # AND served as the regular election, and MEDSL tags the whole race special=TRUE -
    # same "some districts only have a special row" lesson as this project's 2020
    # Senate AZ fix). Decided per (state, district) below, not per state.
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

        # For FORCE_SUM_MODES counties, identify the bare-town-name municipal rollup
        # precincts (see module docstring's NJ section) by their signature: EVERY row
        # ever seen for that (county, precinct) reports mode "TOTAL" and nothing else -
        # a real election district always has at least one non-TOTAL mode row somewhere
        # across its candidates. Checked per (county, precinct) across the whole state's
        # rows, not per district/candidate, since the same rollup row structure repeats
        # for every race on the ballot.
        #
        # Only actually EXCLUDE a bare-mode precinct if a numbered sibling sharing its
        # base name also exists (e.g. "Allendale" is excludable because "Allendale 1",
        # "Allendale 2", ... exist and already cover the same votes in more detail).
        # Gloucester County has bare TOTAL-only rows for EVERY precinct with no numbered
        # siblings at all - there the bare row IS the only data available, and excluding
        # it would silently zero out the entire county (caught by a real run: Gloucester
        # disappeared from the output entirely before this guard was added).
        precinct_modes = defaultdict(set)
        base_siblings = defaultdict(set)
        for r in sub:
            if (abbr, r["county_name"]) in FORCE_SUM_MODES:
                precinct_modes[(r["county_name"], r["precinct"])].add(r["mode"])
                base = re.sub(r"\s+\d+$", "", r["precinct"].strip())
                base_siblings[(r["county_name"], base)].add(r["precinct"].strip())
        bare_rollup_precincts = set()
        for (county, precinct), modes in precinct_modes.items():
            if modes != {"TOTAL"}:
                continue
            base = re.sub(r"\s+\d+$", "", precinct.strip())
            if len(base_siblings[(county, base)]) > 1:
                bare_rollup_precincts.add((county, precinct))

        # Group raw rows by (fips, district, candidate) first - vote-mode preference
        # (TOTAL vs. sum-of-modes) is decided per group, not per state or even per
        # county (see module docstring).
        groups = defaultdict(list)
        county_names = {}
        for r in sub:
            dnum = parse_district(r["district"])
            if dnum is None or (abbr, dnum) not in house_2024:
                continue
            if r["special"] == "TRUE" and dnum in districts_with_regular:
                continue  # this district already has a regular row elsewhere - skip its special one
            if (r["county_name"], r["precinct"]) in bare_rollup_precincts:
                continue  # NJ municipal rollup row - would double-count its own numbered EDs
            fips = r["county_fips"].zfill(5)
            county_names[fips] = fips_names.get(fips, r["county_name"].title())
            groups[(fips, dnum, r["candidate"])].append(r)

        by_county = defaultdict(lambda: defaultdict(int))
        by_county_districts = defaultdict(set)
        for (fips, dnum, cand), group_rows in groups.items():
            total_rows = [r for r in group_rows if r["mode"] == "TOTAL"]
            use_rows = total_rows if total_rows else group_rows
            votes = sum(int(float(r["votes"])) for r in use_rows if r["votes"] not in ("", "*"))

            past = house_2024[(abbr, dnum)]
            dem_col_bucket = true_party_bucket(past["dem_candidate"], "dem")
            rep_col_bucket = true_party_bucket(past["rep_candidate"], "gop")
            dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
            dem_last, rep_last = last_name_token(past["dem_candidate"]), last_name_token(past["rep_candidate"])
            distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last

            n = norm_name(cand)
            toks = name_tokens(cand)
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
