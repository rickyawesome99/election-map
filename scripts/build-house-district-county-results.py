#!/usr/bin/env python3
"""
Builds data-entry/house_district_county_results.csv: every U.S. House general-election
result 2016–2024 broken down by (district, county) — the dataset behind the per-district
county maps on /house/[id]/[year]. It differs from data-entry/county_house_results_{year}.csv
(the county pages' aggregate, which SUMS every district touching a county) in that a county
split between districts gets one row per district.

Exact counts only — see build_year(). Sources, chosen per DISTRICT (never rescaled):
  * a county that lies in ONE district (the `districts_{year}` column of the county CSV lists
    a single district) is copied straight from the county CSV — that aggregate already went
    through the project's OpenElections / Wikipedia / MEDSL fills and the hand patches, so it
    is the best number we have and needs no split;
  * a county split between districts is rebuilt from MIT Election Data + Science Lab's
    precinct-level returns (data-entry/medsl/house_{year}_precinct.*), grouped by
    (county, district, candidate) and bucketed into the district's dem / rep slots by name-
    matching against house_past_results.csv — the same matching tiers, rollup filters and
    year-specific quirks as scripts/fill-county-house-{year}-medsl.py (see those docstrings;
    the per-year quirk tables below are ported from them). The split rows are then checked
    against the county CSV's aggregate for that county (status `ok` within tolerance,
    `check` otherwise) and every district's rows are summed against house_past_results.csv.

Rows are R-positive nowhere: dem/gop/oth/total are raw vote counts. Not emitted: a split
county with no usable MEDSL rows (reported as `missing`); the map shows those pieces as
"no data" rather than guessing an apportionment.

Run from project root (reads ~870 MB of precinct files, a few minutes):
  python3 scripts/build-house-district-county-results.py            # all years
  python3 scripts/build-house-district-county-results.py 2022 2024  # some years
"""
import csv, os, re, sys, unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/house_district_county_results.csv")

YEARS = [2016, 2018, 2020, 2022, 2024]

# Per-district-by-county sources produced by the sibling fetchers, keyed by the source name the
# output CSV records. Highest priority first.
OFFICIAL_SOURCES = {
    "maine-rcv": "data-entry/house_district_county_maine_rcv.csv",
    "indiana": "data-entry/house_district_county_indiana.csv",
    "louisiana": "data-entry/house_district_county_louisiana.csv",
    "openelections": "data-entry/house_district_county_openelections.csv",
    "wikipedia": "data-entry/house_district_county_wikipedia.csv",
}
OFFICIAL_PRIORITY = ["maine-rcv", "indiana", "louisiana", "openelections", "wikipedia"]
# General elections actually DECIDED by ranked-choice rounds (the certified total is the final
# round). By-county rows for these must be the final round too — a source that only has the
# first round is labelled `first-round`, never passed off as the result. ME-01 and ME-02 2020
# were won outright in round 1, so they are ordinary races here.
RCV_RACES = {("ME", 2, 2018), ("ME", 2, 2022), ("ME", 2, 2024), ("AK", 1, 2022), ("AK", 1, 2024)}
# Which sources carry the FINAL round for those races: Maine's SOS cast-vote-record tabulation
# (scripts/build-house-district-county-maine-rcv.py) and, for Alaska, the borough reconstruction
# in county_house_results_{year}.csv (a full RCV tabulation of the state's CVR). Everything else
# (precinct files, OpenElections, Wikipedia tables) reports the first round.
FINAL_ROUND_SOURCES = {"maine-rcv", "aggregate-ak"}
STATE_TO_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "FL": "12",
    "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22",
    "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40",
    "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50",
    "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}
STATE_ABBR_BY_FIPS = {v: k for k, v in STATE_TO_FIPS.items()}

# ── Per-year MEDSL quirks, ported from scripts/fill-county-house-{year}-medsl.py ─────────
MEDSL = {
    2016: dict(path="data-entry/medsl/house_2016_precinct.csv", delimiter=",", escapechar=None, schema="v2016",
               aliases={("NJ", "Scott Garnett"): "Scott Garrett"},
               exclude_districts={("LA", 3), ("LA", 4)},           # December runoffs; file holds the November primary
               candidate_exclusions={("HI", "OSTROV, SHIRLENE DELACRUZ")},
               dedup_keep_last_states={"HI"}, rollup_re=None, drop_precincts={}, force_sum_modes=set(), unspec_dup=set()),
    2018: dict(path="data-entry/medsl/house_2018_precinct.csv", delimiter=",", escapechar=None, schema="v2",
               aliases={("PA", "MADELEINE DEAN CUNNANE"): "Madeleine Dean"},
               exclude_districts=set(), candidate_exclusions=set(), dedup_keep_last_states=set(),
               rollup_re=None, drop_precincts={}, force_sum_modes=set(), unspec_dup=set()),
    2020: dict(path="data-entry/medsl/house_2020_precinct.csv", delimiter=",", escapechar=None, schema="v2",
               aliases={}, exclude_districts={("LA", 5)},          # December runoff
               candidate_exclusions=set(), dedup_keep_last_states=set(),
               rollup_re=None, drop_precincts={"MI": {"9999"}},    # MI's statewide adjustment pseudo-precinct
               force_sum_modes=set(), unspec_dup=set()),
    2022: dict(path="data-entry/medsl/house_2022_precinct.tab", delimiter="\t", escapechar="\\", schema="v2",
               aliases={("SC", "JEFF DAN"): "Jeff Duncan", ("PA", "MADELEINE D CUNNANE"): "Madeleine Dean"},
               exclude_districts=set(), candidate_exclusions=set(), dedup_keep_last_states=set(),
               rollup_re=re.compile(r"\btotals?\b", re.IGNORECASE),  # "{County} Totals" rollup rows
               drop_precincts={}, force_sum_modes=set(), unspec_dup={("NY", "OTSEGO"), ("NY", "CHENANGO")}),
    2024: dict(path="data-entry/medsl/house_2024_precinct.csv", delimiter=",", escapechar="\\", schema="v2",
               aliases={}, exclude_districts=set(), candidate_exclusions=set(), dedup_keep_last_states=set(),
               rollup_re=re.compile(r"\btotals?\b", re.IGNORECASE), drop_precincts={}, force_sum_modes={("NJ", "BERGEN"), ("NJ", "GLOUCESTER")}, unspec_dup=set(),
               municipal_rollup_states={"NJ"}),
}

NON_CANDIDATE_LABELS = {
    "", "BALLOTS CAST", "BLANK BALLOTS", "BLANKS", "CAST VOTES", "CONTEST TOTAL",
    "CONTEST TOTALS", "INVALID VOTES", "OVER VOTES", "OVERVOTES", "SCATTER", "SCATTERING",
    "TOTAL BALLOTS CAST", "TOTAL VOTES", "TOTAL VOTES CAST", "UNDER VOTES", "UNDERVOTE",
    "UNDERVOTES", "UNDERVOTES-VOIDS", "VOID", "PUBLIC COUNTER", "ABSENTEE / MILITARY",
    "AFFIDAVIT", "BLANK", "BLANK/VOID", "MANUALLY COUNTED EMERGENCY", "SPECIAL PRESIDENTIAL",
}
SUFFIX_TOKENS = {"JR", "SR", "JUNIOR", "SENIOR", "II", "III", "IV"}
MIN_PREFIX_LEN = 4
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")

# A district's county rows are `exact` when they sum to the certified dem and rep totals
# within this (certified totals are Wikipedia's; sub-1% gaps are write-in / rounding noise).
VERIFY_TOLERANCE = 0.005
VERIFY_ABS = 25
# Within this of the certified total the rows are still the official county counts, published
# before late canvass amendments or with write-ins folded differently: status `close`.
CLOSE_TOLERANCE = 0.025


def norm_name(name: str) -> str:
    name = TRUE_PARTY_RE.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r'\s*"[^"]*"\s*', " ", name)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", " ").replace(".", "").replace('"', "").replace("\\", "").replace("-", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def name_tokens(name: str) -> set:
    return {t for t in norm_name(name).split() if t not in SUFFIX_TOKENS}


def last_name_token(full_name: str) -> str:
    # house_past_results.csv names are "First Last[ Jr.]"; MEDSL 2016 sometimes "LAST, FIRST".
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def prefix_matches(last: str, toks: set) -> bool:
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return any(len(t) >= MIN_PREFIX_LEN and (last.startswith(t) or t.startswith(last)) for t in toks)


def compact_matches(last: str, full_name: str) -> bool:
    if not last or len(last) < MIN_PREFIX_LEN:
        return False
    return last in norm_name(full_name).replace(" ", "")


def true_party_bucket(raw_name: str, default_bucket: str) -> str:
    m = TRUE_PARTY_RE.search(raw_name.strip())
    if m:
        return "dem" if m.group(1) == "D" else "gop"
    return default_bucket


def bucket_for(cand: str, past: dict, aliases: dict, abbr: str) -> tuple:
    """Returns (slot, true_party): slot is the house_past_results column the candidate fills
    ("dem" / "gop" / "oth"), true_party the bucket the county aggregate CSV uses. They differ
    only in a same-party contest (CA/WA top-two: "Kevin de León (D)" sits in the rep slot but
    the county CSV counts him as dem) — the district page shows slots, the county check uses
    true parties."""
    slot, true = _slot_for(cand, past, aliases, abbr)
    return slot, true


def _slot_for(cand: str, past: dict, aliases: dict, abbr: str) -> tuple:
    dem_true = true_party_bucket(past["dem_candidate"], "dem")
    rep_true = true_party_bucket(past["rep_candidate"], "gop")
    dem_col, rep_col = ("dem", dem_true), ("gop", rep_true)
    dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
    dem_last, rep_last = last_name_token(past["dem_candidate"]), last_name_token(past["rep_candidate"])
    distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last
    match_cand = aliases.get((abbr, cand), cand)
    n = norm_name(match_cand)
    toks = name_tokens(match_cand)
    if dem_name and n == dem_name:
        return dem_col
    if rep_name and n == rep_name:
        return rep_col
    cand_last = last_name_token(match_cand)
    if distinct_last and cand_last and cand_last == dem_last:
        return dem_col
    if distinct_last and cand_last and cand_last == rep_last:
        return rep_col
    if distinct_last and dem_last != cand_last and rep_last != cand_last:
        # neither last token matches outright: fall back to the looser tiers, but never let a
        # first name that happens to equal the other candidate's surname decide
        dem_hit = dem_last in toks or prefix_matches(dem_last, toks) or compact_matches(dem_last, match_cand)
        rep_hit = rep_last in toks or prefix_matches(rep_last, toks) or compact_matches(rep_last, match_cand)
        if dem_hit and not rep_hit:
            return dem_col
        if rep_hit and not dem_hit:
            return rep_col
    if not distinct_last and dem_last and not rep_name and (dem_last in toks or prefix_matches(dem_last, toks) or compact_matches(dem_last, match_cand)):
        return dem_col
    if not distinct_last and rep_last and not dem_name and (rep_last in toks or prefix_matches(rep_last, toks) or compact_matches(rep_last, match_cand)):
        return rep_col
    return ("oth", "oth")


def is_slot_district(past: dict) -> bool:
    """A same-party contest: the county aggregate's true-party buckets cannot be read back
    into the two slots, so every county of the district is rebuilt from MEDSL."""
    return bool(TRUE_PARTY_RE.search(past["dem_candidate"].strip()) or TRUE_PARTY_RE.search(past["rep_candidate"].strip()))


def parse_int_field(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def parse_district(dfield: str):
    d = (dfield or "").strip()
    if d.upper() in ("STATEWIDE", "AT-LARGE"):
        return 1
    n = parse_int_field(d)
    if n is None:
        return None
    return 1 if n == 0 else n


def parse_fips(f: str):
    n = parse_int_field(f)
    return None if n in (None, 0) else str(n).zfill(5)


def select_votes(year_cfg: dict, abbr: str, county_name: str, group_rows: list) -> int:
    by_precinct = defaultdict(list)
    for r in group_rows:
        by_precinct[r["precinct"]].append(r)
    force_sum = (abbr, county_name) in year_cfg["force_sum_modes"]
    total = 0
    for precinct_rows in by_precinct.values():
        total_rows = [r for r in precinct_rows if r["mode"].strip().upper() == "TOTAL"]
        if total_rows and not force_sum:
            use_rows = total_rows
        elif (abbr, county_name) in year_cfg["unspec_dup"] and any(r["mode"] == "ELECTION_DAY" for r in precinct_rows):
            use_rows = [r for r in precinct_rows if r["mode"] != "UNSPECIFIED"]
        else:
            use_rows = [r for r in precinct_rows if not (force_sum and r["mode"].strip().upper() == "TOTAL")] or precinct_rows
        for r in use_rows:
            if r["votes"] in ("", "*", None):
                continue
            try:
                v = int(float(r["votes"]))
            except ValueError:
                continue
            total += max(v, 0)
    return total


def load_official_sources(year: int):
    """{source: {(state, district): {fips: {dem, gop, oth}}}} for the year."""
    out = {}
    for name, rel in OFFICIAL_SOURCES.items():
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        by_district = defaultdict(dict)
        with open(path, newline="") as f:
            for r in csv.DictReader(f):
                if int(r["year"]) != year:
                    continue
                by_district[(r["state"], int(r["district"]))][r["county_fips"]] = dict(
                    dem=int(r["dem"] or 0), gop=int(r["gop"] or 0), oth=int(r["oth"] or 0))
        out[name] = by_district
    return out


def load_house_past(year: int):
    m = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if int(row["year"]) != year:
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[(row["state_abbr"], dnum)] = row
    return m


def load_county_csv(year: int):
    path = os.path.join(ROOT, f"data-entry/county_house_results_{year}.csv")
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            districts = [int(d) for d in row[f"districts_{year}"].split(";") if d.strip().isdigit()]
            out[row["county_id"]] = dict(
                state=row["state"], name=row["county_name"], districts=districts,
                dem=int(row[f"dem_{year}"] or 0), gop=int(row[f"gop_{year}"] or 0),
                oth=int(row[f"oth_{year}"] or 0), total=int(row[f"total_{year}"] or 0),
            )
    return out


def load_fips_names():
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[row["county_id"]] = row["county_name"]
    return m


def read_medsl(year: int, cfg: dict, wanted_fips: set, wanted_states: set):
    """Streams the year's precinct file, keeping House general-election rows in split counties.
    Returns {state: [normalized rows]} with keys precinct, mode, votes, county_fips, county_name,
    district, candidate, special."""
    path = os.path.join(ROOT, cfg["path"])
    rows_by_state = defaultdict(list)
    dedup = {st: {} for st in cfg["dedup_keep_last_states"]}
    kwargs = dict(delimiter=cfg["delimiter"])
    if cfg["escapechar"]:
        kwargs["escapechar"] = cfg["escapechar"]
    v2016 = cfg["schema"] == "v2016"
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, **kwargs):
            office = row["office"].strip().upper()
            if office != "US HOUSE":
                continue
            abbr = row["state_postal"] if v2016 else row["state_po"]
            if abbr not in wanted_states:
                continue
            if row["stage"].strip().upper() != "GEN":
                continue
            fips = parse_fips(row["county_fips"])
            if fips == "36000":
                fips = "29095"  # Kansas City, reported apart from Jackson County in MO's canvass and in MEDSL
            if fips is None or fips not in wanted_fips:
                continue
            cand = row["candidate"].strip()
            if cand.upper() in NON_CANDIDATE_LABELS or (abbr, cand.upper()) in cfg["candidate_exclusions"]:
                continue
            precinct = row["precinct"]
            if abbr in cfg["drop_precincts"] and precinct in cfg["drop_precincts"][abbr]:
                continue
            if cfg["rollup_re"] and cfg["rollup_re"].search(precinct or ""):
                continue
            norm = dict(
                precinct=precinct, mode=row["mode"] or "", votes=row["votes"], county_fips=fips,
                county_name=(row["county_name"] or "").upper().replace(" COUNTY", "").replace(" PARISH", ""),
                district=row["district"], candidate=cand, special=str(row["special"]).strip().upper(),
            )
            if abbr in dedup:
                dedup[abbr][(fips, row["district"], precinct, cand, norm["mode"])] = norm
            else:
                rows_by_state[abbr].append(norm)
    for st, kept in dedup.items():
        rows_by_state[st] = list(kept.values())
    return rows_by_state


def load_geometry_pairs(year: int) -> set:
    import glob, json
    pairs = set()
    for path in glob.glob(os.path.join(ROOT, f"public/house-county-pieces/{year}/*.json")):
        with open(path) as f:
            topo = json.load(f)
        for g in topo["objects"]["pieces"]["geometries"]:
            pairs.add((g["properties"]["c"], int(g["properties"]["d"])))
    return pairs


def build_year(year: int, fips_names: dict):
    """One row per (district, county), exact counts only.

    Sources, per district, in priority order — the first whose county rows sum to the
    certified district total (house_past_results.csv) within VERIFY_TOLERANCE wins:
      district   the district lies wholly inside one county → its row IS the certified total
      aggregate  single-district counties from county_house_results_{year}.csv (each such row
                 is that district's county result, already vetted by the county pipeline) plus
                 MEDSL precinct roll-ups for the counties the district shares
      medsl      MEDSL precinct roll-ups for every county of the district
    A district no source verifies keeps its closest variant, status `unverified`, so the page
    can say so. Nothing is ever rescaled or apportioned.
    """
    cfg = MEDSL[year]
    house_past = load_house_past(year)
    counties = load_county_csv(year)
    report = defaultdict(int)
    official = load_official_sources(year)

    kc = counties.pop("36000", None)
    if kc and "29095" in counties:
        j = counties["29095"]
        for k in ("dem", "gop", "oth", "total"):
            j[k] += kc[k]
        j["districts"] = sorted(set(j["districts"]) | set(kc["districts"]))
    for fips in list(counties):
        if fips not in fips_names:
            report["skipped_non_county_row"] += 1
            del counties[fips]

    geo = load_geometry_pairs(year)
    geo_county_districts = defaultdict(set)
    geo_district_counties = defaultdict(set)
    for (fips, d) in geo:
        geo_county_districts[fips].add(d)
        geo_district_counties[(fips[:2], d)].add(fips)

    states = sorted({abbr for (abbr, _) in house_past})
    print(f"[{year}] reading MEDSL for {len(states)} states…", flush=True)
    state_counties = defaultdict(set)
    for fips in fips_names:
        st = STATE_ABBR_BY_FIPS.get(fips[:2])
        if st:
            state_counties[st].add(fips)
    rows_by_state = read_medsl(year, cfg, set(fips_names), set(states))

    # ── MEDSL roll-up: (fips, district) → slot buckets ─────────────────────────────
    medsl = {}
    for abbr in states:
        sub = rows_by_state.get(abbr, [])
        regular_districts = {parse_district(r["district"]) for r in sub if r["special"] == "FALSE"}
        # New Jersey 2024 files a bare municipal rollup row ("Maywood", TOTAL only) next to its
        # numbered election districts ("Maywood 4"); summing both doubles the town. Drop a
        # TOTAL-only precinct whenever numbered siblings sharing its base name exist (ported from
        # scripts/fill-county-house-2024-medsl.py, including its Gloucester guard).
        bare_rollups = set()
        if abbr in cfg.get("municipal_rollup_states", set()):
            # Only in the counties the fill script established do this (Bergen, Gloucester):
            # elsewhere in NJ the bare-named row is the only complete count for its town.
            force_counties = {c for (st, c) in cfg["force_sum_modes"] if st == abbr}
            precinct_modes = defaultdict(set)
            base_siblings = defaultdict(set)
            for r in sub:
                if r["county_name"] not in force_counties:
                    continue
                precinct_modes[(r["county_fips"], r["precinct"])].add(r["mode"].strip().upper())
                base = re.sub(r"\s+\d+$", "", (r["precinct"] or "").strip())
                base_siblings[(r["county_fips"], base)].add((r["precinct"] or "").strip())
            for (fips, precinct), modes in precinct_modes.items():
                if modes == {"TOTAL"} and len(base_siblings[(fips, re.sub(r"\s+\d+$", "", (precinct or "").strip()))]) > 1:
                    bare_rollups.add((fips, precinct))
        groups = defaultdict(list)
        raw_names = {}
        for r in sub:
            dnum = parse_district(r["district"])
            if dnum is None or (abbr, dnum) not in house_past or (abbr, dnum) in cfg["exclude_districts"]:
                continue
            if r["special"] == "TRUE" and dnum in regular_districts:
                continue
            if (r["county_fips"], r["precinct"]) in bare_rollups:
                continue
            raw_names[r["county_fips"]] = r["county_name"]
            groups[(r["county_fips"], dnum, r["candidate"])].append(r)
        pieces = defaultdict(lambda: defaultdict(int))
        for (fips, dnum, cand), grp in groups.items():
            votes = select_votes(cfg, abbr, raw_names[fips], grp)
            slot, _true = bucket_for(cand, house_past[(abbr, dnum)], cfg["aliases"], abbr)
            pieces[(fips, dnum)][slot] += votes
        for (fips, dnum), v in pieces.items():
            medsl[(abbr, dnum, fips)] = dict(dem=v.get("dem", 0), gop=v.get("gop", 0), oth=v.get("oth", 0))

    # Stray MEDSL rows: a (county, district) pair with no map piece and under 1% of the district
    # is a mislabeled precinct (Ohio 2016 tags every district in every county), not a result.
    district_medsl_total = defaultdict(int)
    for (abbr, dnum, fips), v in medsl.items():
        district_medsl_total[(abbr, dnum)] += v["dem"] + v["gop"] + v["oth"]
    for key in list(medsl):
        abbr, dnum, fips = key
        if (fips, dnum) in geo:
            continue
        tot = district_medsl_total[(abbr, dnum)]
        share = (sum(medsl[key].values()) / tot) if tot else 0
        if share < 0.01:
            del medsl[key]
            report["stray_rows_dropped"] += 1

    def certified(abbr, dnum):
        past = house_past[(abbr, dnum)]
        return int(past["dem_votes"] or 0), int(past["rep_votes"] or 0), int(past["total_votes"] or 0)

    def error(rows, abbr, dnum):
        ed, eg, _ = certified(abbr, dnum)
        sd = sum(r["dem"] for r in rows.values())
        sg = sum(r["gop"] for r in rows.values())
        return abs(sd - ed) + abs(sg - eg), ed + eg

    def verified(rows, abbr, dnum):
        ed, eg, _ = certified(abbr, dnum)
        sd = sum(r["dem"] for r in rows.values())
        sg = sum(r["gop"] for r in rows.values())
        return (abs(sd - ed) <= max(VERIFY_ABS, ed * VERIFY_TOLERANCE)
                and abs(sg - eg) <= max(VERIFY_ABS, eg * VERIFY_TOLERANCE))

    out = []
    exact_rows = {}
    order = sorted(house_past.items())
    # Two passes: the first records every district verified from its own sources, the second lets
    # the remainder rule use them for the districts that were not.
    for pass_no in (1, 2):
      out = []
      for (abbr, dnum), past in order:
        ed, eg, et = certified(abbr, dnum)
        stfips = STATE_TO_FIPS.get(abbr)
        variants = []  # (source, {fips: {dem,gop,oth}})

        # official per-district-by-county sources first: state canvasses (Indiana portal, the
        # Louisiana SOS workbook), then OpenElections county files, then Wikipedia's By-county tables
        for source in OFFICIAL_PRIORITY:
            rows_src = official.get(source, {}).get((abbr, dnum))
            if rows_src:
                variants.append((source, rows_src))

        # district: wholly inside one county on this year's map
        geo_c = geo_district_counties.get((stfips, dnum), set())
        if len(geo_c) == 1 and ed + eg > 0:
            fips = next(iter(geo_c))
            variants.append(("district", {fips: dict(dem=ed, gop=eg, oth=max(0, et - ed - eg))}))

        medsl_rows = {fips: v for (a, d, fips), v in medsl.items() if a == abbr and d == dnum}

        # aggregate: single-district counties from the county CSV + MEDSL for shared counties
        hybrid = {}
        complete = True
        member_counties = set(medsl_rows) | {f for f, c in counties.items() if c["state"] == abbr and dnum in c["districts"]}
        for fips in member_counties:
            c = counties.get(fips)
            n_geo = len(geo_county_districts.get(fips, ()))
            single = c is not None and (n_geo == 1 if n_geo else len(c["districts"]) == 1) and dnum in c["districts"]
            if single:
                hybrid[fips] = dict(dem=c["dem"], gop=c["gop"], oth=c["oth"])
            elif fips in medsl_rows:
                hybrid[fips] = medsl_rows[fips]
            else:
                complete = False
        if hybrid:
            variants.append(("aggregate", hybrid))
        if medsl_rows:
            variants.append(("medsl", medsl_rows))

        if not variants:
            if pass_no == 2:
                report["districts_without_any_source"] += 1
            continue
        chosen = None
        if (abbr, dnum, year) in RCV_RACES:
            # A ranked-choice race must show the round that decided it: keep only final-round
            # sources. With none, the best first-round variant is kept and labelled as such.
            final = [(src, rows) for (src, rows) in variants
                     if src in FINAL_ROUND_SOURCES or (src == "aggregate" and abbr == "AK")]
            if final:
                variants = final
            else:
                source, rows = min(variants, key=lambda sv: error(sv[1], abbr, dnum)[0])
                chosen = (source, rows, "first-round")
        # remainder: for a county shared with districts whose rows are already exact, this
        # district's share is the county's official total minus theirs — official arithmetic, not
        # an estimate. Applied to the best variant's missing or unverified counties.
        for source, rows in list(variants):
            if chosen is not None or verified(rows, abbr, dnum):
                break
        else:
            best_source, best_rows = min(variants, key=lambda sv: error(sv[1], abbr, dnum)[0])
            patched = dict(best_rows)
            changed = False
            for fips, c in counties.items():
                if c["state"] != abbr or dnum not in c["districts"] or len(c["districts"]) < 2:
                    continue
                others = [d for d in c["districts"] if d != dnum]
                if not all((abbr, d) in exact_rows and fips in exact_rows[(abbr, d)] for d in others):
                    continue
                od = sum(exact_rows[(abbr, d)][fips]["dem"] for d in others)
                og = sum(exact_rows[(abbr, d)][fips]["gop"] for d in others)
                oo = sum(exact_rows[(abbr, d)][fips]["oth"] for d in others)
                rem = dict(dem=c["dem"] - od, gop=c["gop"] - og, oth=max(0, c["oth"] - oo))
                if rem["dem"] < 0 or rem["gop"] < 0:
                    continue
                if patched.get(fips) != rem:
                    patched[fips] = rem
                    changed = True
            if changed:
                variants.insert(0, ("remainder", patched))
        for source, rows in variants:
            if verified(rows, abbr, dnum):
                chosen = (source, rows, "exact")
                break
        if chosen is None:
            source, rows = min(variants, key=lambda sv: error(sv[1], abbr, dnum)[0])
            if (abbr, dnum, year) in RCV_RACES:
                # Final-round rows that miss the certified total only by the ballots no county can
                # claim (overseas/UOCAVA, unorganized townships the crosswalk cannot place).
                status = "final-round"
            else:
                sd = sum(r["dem"] for r in rows.values()); sg = sum(r["gop"] for r in rows.values())
                close = (abs(sd - ed) <= max(VERIFY_ABS, ed * CLOSE_TOLERANCE) and abs(sg - eg) <= max(VERIFY_ABS, eg * CLOSE_TOLERANCE))
                status = "close" if close else "unverified"
            chosen = (source, rows, status)
        source, rows, status = chosen
        if status == "exact":
            exact_rows[(abbr, dnum)] = rows
        if pass_no == 1:
            continue
        report[f"district_{status}"] += 1
        report[f"source_{source}"] += 1
        for fips, v in sorted(rows.items()):
            n_geo = len(geo_county_districts.get(fips, ()))
            n_data = len(counties.get(fips, {}).get("districts", []))
            out.append(dict(
                year=year, state=abbr, district=dnum, county_fips=fips,
                county_name=fips_names.get(fips, counties.get(fips, {}).get("name", fips)),
                dem=v["dem"], gop=v["gop"], oth=v["oth"], total=v["dem"] + v["gop"] + v["oth"],
                source=source, status=status,
                geometry="yes" if (fips, dnum) in geo else "no",
                split="yes" if (n_geo if n_geo else n_data) > 1 else "no",
            ))

    # Counties the map shows in a district but no chosen source has a row for.
    have = {(r["state"], r["district"], r["county_fips"]) for r in out}
    for (stfips, dnum), fset in geo_district_counties.items():
        abbr = STATE_ABBR_BY_FIPS.get(stfips)
        if not abbr or (abbr, dnum) not in house_past:
            continue
        for fips in fset:
            if (abbr, dnum, fips) not in have:
                report["map_pieces_without_a_row"] += 1

    print(f"[{year}] " + ", ".join(f"{k}={v}" for k, v in sorted(report.items())), flush=True)
    bad = [f"{r[0]}-{r[1]:02d}" for r in sorted({(o["state"], o["district"]) for o in out if o["status"] == "unverified"})]
    if bad:
        print(f"[{year}] unverified districts ({len(bad)}): " + " ".join(bad), flush=True)
    return out


def fips_names_state(fips, fips_names):
    return STATE_ABBR_BY_FIPS.get(fips[:2])


def main():
    years = [int(a) for a in sys.argv[1:]] or YEARS
    fips_names = load_fips_names()
    existing = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing = [r for r in csv.DictReader(f) if int(r["year"]) not in years]
    rows = list(existing)
    for y in years:
        rows.extend(build_year(y, fips_names))
    rows.sort(key=lambda r: (int(r["year"]), r["state"], int(r["district"] or 0), r["county_fips"]))
    fields = ["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total",
              "source", "status", "geometry", "split"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"Wrote {len(rows)} rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()
