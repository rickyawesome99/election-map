"""
Derives 2024 presidential results per CURRENT state legislative district by crosswalking
MEDSL's 2024 precinct-level general-election returns (one file per state, all offices
bundled — "Precinct-Level Returns 2024 by Individual State", doi:10.7910/DVN/NYTPDU) —
US PRESIDENT precinct rows are apportioned to STATE HOUSE / STATE SENATE districts using
that SAME precinct's state-legislative race as the join key, since both offices are rows
in the identical file (no cross-file precinct-name matching risk).

Only valid for states/chambers where the CURRENT (2026-effective) map was also in effect
for the Nov 2024 election — see data/stateLegMapInfo.ts's firstCycle field. Exceptions
(map changed after 2024, or no Nov 2024 state-legislative race at all in odd-year states)
need a different method entirely and must not be run through this script — see project
memory for the Tier 1 / Tier 1b / Tier 2 classification.

Gotcha (confirmed via Ohio pilot): several states' raw source data pads every precinct
with a FICTITIOUS zero-vote row for every district in the chamber (not just the precinct's
real district) - e.g. Ohio's STATE HOUSE rows show a precinct in "all 99" districts, 98 of
which report 0 votes. Filtered out here by only keeping districts with nonzero votes for a
given precinct - this simultaneously handles genuinely SPLIT precincts correctly (a real
split shows 2+ districts each with real nonzero votes) without extra logic.

Usage: python3 scripts/crosswalk-state-leg-pres2024.py <abbr> <path-to-precinct-csv> [--house-office STATE HOUSE] [--senate-office STATE SENATE]
Writes data-entry/state-leg-pres2024/{abbr}.json
"""
import csv
import json
import os
import statistics
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")

# Some states name districts instead of numbering them (MA: "1ST BRISTOL"/"FIRST PLYMOUTH &
# NORFOLK" vs. our stored "1st Bristol"/"First Plymouth and Norfolk"; VT/NH: "ADDISON 1" vs.
# "Addison-1", "BELKNAP 001" vs. "BE1"). MEDSL's raw spelling/case/ordinal-word-vs-numeral/
# separator (&, AND, comma, hyphen) convention often doesn't match data/stateLegDistricts.ts's
# stored `number` at all (that field was extracted from the boundary file's NAMELSAD by a
# DIFFERENT process - see BOUNDARY_CODE_OVERRIDES in components/StateLegDistrictMap.tsx). Rather
# than hand-writing a per-state string transform, normalize BOTH sides to an order-preserving,
# ordinal-word/numeral-unified key and match against the canonical list actually used in
# stateLegDistricts.ts - this is the general fix; a plain numeric district needs none of this
# (fast path below) and every state confirmed so far (SD's "26A"/"28A" splits, ND, plain-numeric
# everything else) already round-trips through str(int(raw)) with no override needed.
ORDINAL_WORD_TO_NUM = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7,
    "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13,
    "fourteenth": 14, "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
    "nineteenth": 19, "twentieth": 20,
}
# NH's boundary data (sourced from GRANIT, not TIGER - see project_state_legislature_pages.md)
# uses 2-letter county codes MEDSL's raw county names don't spell out - only place this is
# needed, since VT/MA's canonical numbers already spell the county name out in full.
NH_COUNTY_CODES = {
    "belknap": "BE", "carroll": "CA", "cheshire": "CH", "coos": "CO", "grafton": "GR",
    "hillsborough": "HI", "merrimack": "ME", "rockingham": "RO", "strafford": "ST", "sullivan": "SU",
}
import re as _re


def _norm_key(s):
    s = s.lower().replace("&", " and ")
    # Vermont: MEDSL's raw "CHITTENDEN SOUTHEAST" vs. our stored "Chittenden South East" -
    # a compass direction glued together on one side and split on the other. Unify by
    # collapsing the split form before tokenizing (order matches how VT's canonical names
    # spell out; safe generally since no county/district name legitimately has "south" and
    # "east" as separate consecutive words otherwise).
    for compass in ("south east", "south west", "north east", "north west"):
        s = s.replace(compass, compass.replace(" ", ""))
    tokens = _re.findall(r"[a-z0-9]+", s)
    ordinal, rest = None, []
    for i, t in enumerate(tokens):
        if i == 0:
            m = _re.match(r"^(\d+)(st|nd|rd|th)$", t)
            if m:
                ordinal = int(m.group(1))
                continue
            if t in ORDINAL_WORD_TO_NUM:
                ordinal = ORDINAL_WORD_TO_NUM[t]
                continue
        if t == "and":
            continue
        rest.append(t)
    return (ordinal, tuple(rest))


_canonical_cache = {}


def _load_canonical_numbers(abbr, chamber):
    """Pulls the real `number` values for abbr/chamber straight out of
    data/stateLegDistricts.ts (regex, not a TS parse - the file is a big flat object literal)."""
    key = (abbr, chamber)
    if key in _canonical_cache:
        return _canonical_cache[key]
    text = open(os.path.join(ROOT, "data", "stateLegDistricts.ts")).read()
    m = _re.search(rf'"{abbr}":\s*{{', text)
    if not m:
        _canonical_cache[key] = []
        return []
    # Slice out this state's block by matching brace depth from the state key's opening brace.
    start = m.end() - 1
    depth = 0
    end = start
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    block = text[start:end]
    cm = _re.search(rf'"{chamber}":\s*\[', block)
    if not cm:
        _canonical_cache[key] = []
        return []
    chamber_start = cm.end()
    # Find the matching closing bracket for this chamber's array the same way.
    depth = 1
    chamber_end = chamber_start
    for i in range(chamber_start, len(block)):
        if block[i] == "[":
            depth += 1
        elif block[i] == "]":
            depth -= 1
            if depth == 0:
                chamber_end = i
                break
    chamber_block = block[chamber_start:chamber_end]
    numbers = _re.findall(r'"number":\s*"([^"]+)"', chamber_block)
    _canonical_cache[key] = numbers
    return numbers


def _fuzzy_match_canonical(abbr, chamber, raw):
    canonical = _load_canonical_numbers(abbr, chamber)
    if not canonical:
        return raw
    target = _norm_key(raw)
    for c in canonical:
        if _norm_key(c) == target:
            return c
    return raw


def _nh_house_code(raw):
    # MEDSL reports "BELKNAP 001"; the NH boundary data (GRANIT, not TIGER) numbers districts
    # like "BE1" - a county-name fuzzy match wouldn't work since NAMELSAD there is already a
    # coded abbreviation, not the spelled-out county name, so translate directly instead.
    m = _re.match(r"^([a-z]+)\s+0*(\d+)$", raw.strip().lower())
    if not m:
        return raw
    county, num = NH_COUNTY_CODES.get(m.group(1), m.group(1)), m.group(2)
    code = f"{county}{num}"
    # Hillsborough's canonical numbers are zero-padded for 03-09 ONLY ("HI03".."HI09", but
    # "HI1"/"HI2" and "HI10"+ are not) - a real GRANIT source inconsistency, not a general NH
    # rule. Every other county is unpadded throughout. Codes above the real max per county
    # (checked once via _load_canonical_numbers by the caller) are NH's 40 excluded floterial
    # districts, numbered as a continuation of each county's base numbering - not a bug, they
    # correctly fail to match anything and get dropped.
    if county == "HI" and len(num) == 1 and num not in ("1", "2"):
        code = f"HI0{num}"
    return code


def _id_house_code(raw):
    # Idaho elects 2 Representatives from each shared boundary; MEDSL reports them as separate
    # "DISTRICT 16 SEAT A"/"SEAT B" precinct rows, but there's only one real boundary ("16") -
    # same mismatch direction already solved for incumbents (PEOPLE_CODE_OVERRIDES in
    # scripts/build-state-leg-incumbents.mjs), just needed again here for MEDSL's own labeling.
    m = _re.match(r"^DISTRICT (\d+) SEAT [AB]$", raw.strip().upper())
    return m.group(1) if m else raw


DISTRICT_CODE_OVERRIDES = {
    ("NH", "house"): _nh_house_code,
    ("ID", "house"): _id_house_code,
}


# Washington's raw `office` field embeds the district number directly in the office NAME instead
# of using a fixed "STATE HOUSE"/"STATE SENATE" string plus a separate `district` column (which
# is blank for every WA row) - e.g. "LEGISLATIVE DISTRICT 1 - STATE REPRESENTATIVE POS. 1" /
# "... POS. 2" (WA elects 2 House members per district, reported as two separate candidate rows -
# both fold into the SAME district, same convention as Idaho's "SEAT A"/"SEAT B") and
# "LEGISLATIVE DISTRICT 1 - STATE SENATOR". This is why WA was previously believed to be a total
# MEDSL data gap (project memory) - it isn't, the office-matching logic just never recognized this
# state's naming convention. Confirmed the CURRENT (2026-effective) WA map was ALSO used for the
# Nov 2024 election (data/stateLegMapInfo.ts: firstCycle 2022, and the 2024-03-15 Yakima Valley
# remedial redraw was already in effect for Nov 2024) - a normal Tier 1 direct-crosswalk state,
# not Tier 2, once this parser exists.
_WA_OFFICE_RE = _re.compile(r"^LEGISLATIVE DISTRICT (\d+) - STATE (REPRESENTATIVE|SENATOR)")


def _wa_office_chamber_district(office):
    m = _WA_OFFICE_RE.match(office.strip().upper())
    if not m:
        return None
    chamber = "house" if m.group(2) == "REPRESENTATIVE" else "senate"
    return chamber, m.group(1)


# Per-state fallback for offices whose chamber/district can't be read from a fixed
# house_office/senate_office string + separate `district` column - parses both directly out of
# the office string instead. Returns (chamber, raw_district) or None if the office isn't a
# state house/senate row at all.
OFFICE_PARSERS = {
    "WA": _wa_office_chamber_district,
}


def normalize_district(abbr, chamber, raw):
    override = DISTRICT_CODE_OVERRIDES.get((abbr, chamber))
    if override:
        return override(raw)
    raw = raw.strip()
    if raw.isdigit():
        return str(int(raw))
    if not raw:
        return raw
    # A zero-padded number with a trailing letter suffix (North Dakota's District 4, split
    # 4A/4B, comes through as "04A" in a state whose other districts are 2 digits) - strip the
    # padding directly rather than relying on fuzzy matching, whose tokenizer doesn't separate
    # digits from a directly-adjacent letter ("04a" vs "4a" don't normalize to the same key).
    m = _re.match(r"^0*(\d+)([A-Za-z]+)$", raw)
    if m:
        return f"{int(m.group(1))}{m.group(2)}"
    return _fuzzy_match_canonical(abbr, chamber, raw)


# Ballot-tabulation bookkeeping rows some states report as fake "candidates" within a real
# office (found across many states' US PRESIDENT rows: OVERVOTES/UNDERVOTES/TOTAL VOTES CAST/
# BLANKS/SPOILED/etc., in varying spelling - "OVER VOTES" vs "OVERVOTES", "UNDERVOTE" singular,
# "UNDERVOTES-VOIDS") - not votes for anyone, must not count toward any bucket or the
# total-votes denominator. Substring match (not exact-set) since new spelling variants keep
# turning up state by state.
NON_CANDIDATE_MARKERS = ("OVERVOTE", "OVER VOTE", "UNDERVOTE", "UNDER VOTE",
                         "TOTAL VOTES CAST", "TOTAL BALLOTS CAST", "REGISTERED VOTERS",
                         "BALLOTS CAST", "CAST VOTES", "BLANKS", "SPOILED", "NO CANDIDATE",
                         "CONTEST TOTAL")  # NJ Camden/Warren report a per-precinct "CONTEST TOTAL" pseudo-candidate


def _is_non_candidate_row(candidate):
    c = (candidate or "").strip().upper()
    return any(marker in c for marker in NON_CANDIDATE_MARKERS)


def party_bucket(party_simplified, party_detailed="", candidate=""):
    # Nebraska's US PRESIDENT rows report party_simplified="NONPARTISAN" for every candidate
    # (a Nebraska-specific MEDSL quirk - party_detailed still carries the real party) - check
    # both fields rather than assuming party_simplified is always the reliable one.
    for p in (party_simplified, party_detailed):
        pu = (p or "").upper()
        if pu == "DEMOCRAT":
            return "dem"
        if pu == "REPUBLICAN":
            return "rep"
    # Oregon: some counties' rows for the exact same candidate leave BOTH party fields blank
    # (confirmed: OR's raw HARRIS/TRUMP vote totals were split almost 60/40 between
    # correctly-tagged and blank-party rows - the blank ones landed entirely in "oth" until this
    # fallback was added, understating dem/rep by ~35% each). Safe to match by name since no
    # minor candidate's name contains "HARRIS" or "TRUMP".
    cu = (candidate or "").upper()
    if "HARRIS" in cu:
        return "dem"
    if "TRUMP" in cu:
        return "rep"
    return "oth"


def _collapse_modes(by_mode):
    """MEDSL sometimes reports a `TOTAL` mode row ALONGSIDE separate per-mode rows (e.g.
    ELECTION DAY/MAIL/EARLY VOTING) for the exact same precinct+candidate - summing every row
    naively double-counts (confirmed via DE/RI: raw sums came out at exactly 2x the certified
    state total). Prefer TOTAL alone when present; otherwise sum the (mutually exclusive) modes."""
    if "TOTAL" in by_mode:
        return by_mode["TOTAL"]
    return sum(by_mode.values())


# WA's House and Senate districts are the IDENTICAL boundary (2 House members + 1 Senator
# elected from each of the 49 legislative districts) - a district missing one chamber's real
# data (e.g. Senate's odd-cycle half never had a 2024 race; House lost 13 districts entirely to
# King County's not-precinct-resolved MEDSL data, see MAX_SPLIT_DISTRICTS above) can be filled
# EXACTLY, not an area-weighted estimate, by copying the sibling chamber's already-crosswalked
# result for the same district number. This was identified but not implemented in an earlier
# session (see project memory's "AZ/WA shared-boundary copy-across-chambers optimization") - AZ's
# House/Senate boundaries are also identical and are a candidate to add here later, not yet done.
SHARED_BOUNDARY_STATES = {"WA"}


def _fill_shared_boundary_gaps(abbr, result):
    if abbr not in SHARED_BOUNDARY_STATES or "house" not in result or "senate" not in result:
        return
    filled = 0
    for d, v in list(result["house"].items()):
        if d not in result["senate"]:
            result["senate"][d] = dict(v)
            filled += 1
    for d, v in list(result["senate"].items()):
        if d not in result["house"]:
            result["house"][d] = dict(v)
            filled += 1
    if filled:
        print(f"{abbr}: filled {filled} chamber gap(s) via exact same-boundary copy (House/Senate share districts)")


def crosswalk(abbr, csv_path, house_office="STATE HOUSE", senate_office="STATE SENATE"):
    # (county_fips, precinct) -> district -> mode -> votes
    leg_raw = {"house": defaultdict(lambda: defaultdict(lambda: defaultdict(int))),
               "senate": defaultdict(lambda: defaultdict(lambda: defaultdict(int)))}
    # (county_fips, precinct) -> bucket -> mode -> votes
    pres_raw = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    office_for = {house_office: "house", senate_office: "senate"}
    canonical_sets = {ch: set(_load_canonical_numbers(abbr, ch)) for ch in ("house", "senate")}
    dropped_noncanonical = defaultdict(int)

    delimiter = "\t" if csv_path.endswith(".tab") else ","
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=delimiter):
            office = row["office"]
            if _is_non_candidate_row(row["candidate"]):
                continue
            v = row["votes"]
            try:
                votes = int(float(v))
            except (ValueError, TypeError):
                continue
            # Case-insensitive: Maine's STATE HOUSE rows report precinct names in a different
            # case convention (all-caps) than its US PRESIDENT/STATE SENATE rows (title case),
            # which zeroed out every House match until this was normalized.
            key = (row["county_fips"], row["precinct"].strip().upper())
            mode = row["mode"] or "TOTAL"
            if office == "US PRESIDENT":
                bucket = party_bucket(row["party_simplified"], row["party_detailed"], row["candidate"])
                pres_raw[key][bucket][mode] += votes
            else:
                parsed = None
                if office in office_for:
                    parsed = (office_for[office], row["district"])
                else:
                    parser = OFFICE_PARSERS.get(abbr)
                    if parser:
                        parsed = parser(office)
                if parsed is None:
                    continue
                chamber, raw_district = parsed
                d = normalize_district(abbr, chamber, raw_district)
                # A blank/unresolvable district isn't a real district - counting it would create
                # a bogus "" entry (confirmed in AZ/NY: hundreds of thousands of real votes from
                # precincts the source simply never tagged with a district, most likely a dense
                # urban-county reporting gap) instead of correctly leaving those precincts
                # unmatched (which is what should happen - no fabricated aggregate).
                if not d:
                    continue
                # Drop any code that isn't one of the state's REAL boundaries (confirmed cases:
                # NH's ~40 excluded floterial districts numbered as a continuation of each
                # county's base numbering; RI/AK stray "STATEWIDE"/"0" tags on a handful of
                # rows) - counting these would create phantom output keys the map can never look
                # up, and worse, silently siphon some of a real district's weight away from it
                # for any precinct that also happens to report one of these bogus codes.
                if canonical_sets[chamber] and d not in canonical_sets[chamber]:
                    dropped_noncanonical[d] += votes
                    continue
                leg_raw[chamber][key][d][mode] += votes

    pres_party = {key: {b: _collapse_modes(m) for b, m in buckets.items()} for key, buckets in pres_raw.items()}
    # A real split precinct (annexation edge case etc.) touches at most a handful of districts -
    # confirmed cases elsewhere in this project involve 2, rarely 3. A key mapping to FAR more
    # than that means the source isn't precinct-resolved there at all, not a genuine geographic
    # split - confirmed on Washington's King County, whose entire ~1.1M votes (29% of the state)
    # come through this file under a single placeholder "precinct" code shared across all 17
    # legislative districts King touches. Splitting that by each district's own down-ballot vote
    # COUNT (the only signal available) doesn't recover any real geographic split - it just smears
    # King's single countywide dem/rep ratio onto every district weighted by size, producing an
    # implausible near-identical margin (73.6-73.7%) across 13 wholly-King districts that in
    # reality range from swing to safe-blue. Drop any such key entirely (both here and, as a
    # side effect of no longer appearing in leg_weight, from the president crosswalk match below -
    # its votes become honestly "unmatched" rather than falsely attributed) - same "no data over
    # misleading data" principle used for LA/NJ's deletion and the low-coverage-district filter.
    MAX_SPLIT_DISTRICTS = 4
    dropped_blob_votes = defaultdict(int)
    leg_weight = {}
    for chamber, raw in leg_raw.items():
        weight = {}
        for key, dists in raw.items():
            filtered = {d: w for d, by_mode in dists.items() if (w := _collapse_modes(by_mode)) > 0}
            if len(filtered) > MAX_SPLIT_DISTRICTS:
                dropped_blob_votes[chamber] += sum(filtered.values())
                continue
            if filtered:
                weight[key] = filtered
        leg_weight[chamber] = weight
        if dropped_blob_votes[chamber]:
            print(f"{abbr} {chamber}: dropped {dropped_blob_votes[chamber]:,} votes from precinct "
                  f"key(s) spanning >{MAX_SPLIT_DISTRICTS} districts (not real precinct-level data)")

    result = {}
    for chamber in ("house", "senate"):
        weight = leg_weight[chamber]
        if not weight:
            continue
        dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
        matched, unmatched, split = 0, 0, 0
        for key, pv in pres_party.items():
            w = weight.get(key)
            if not w:
                unmatched += 1
                continue
            matched += 1
            if len(w) > 1:
                split += 1
            total_w = sum(w.values())
            for d, dw in w.items():
                frac = dw / total_w
                for b in ("dem", "rep", "oth"):
                    dist_votes[d][b] += pv.get(b, 0) * frac
        print(f"{abbr} {chamber}: {len(dist_votes)} districts, {matched} matched precincts, "
              f"{unmatched} unmatched, {split} split-precinct apportionments")
        out = {}
        for d, v in dist_votes.items():
            dem, rep, oth = v["dem"], v["rep"], v["oth"]
            total = dem + rep + oth
            if total <= 0:
                continue
            dem_pct = round(dem / total * 100, 1)
            rep_pct = round(rep / total * 100, 1)
            out[d] = {
                "demPct": dem_pct,
                "repPct": rep_pct,
                "margin": round(rep_pct - dem_pct, 1),
                "demVotes": round(dem),
                "repVotes": round(rep),
                "totalVotes": round(total),
            }
        # Only when this chamber actually dropped a not-really-precinct-level blob (see
        # MAX_SPLIT_DISTRICTS above) is there a real risk that some OTHER, MIXED district
        # (touching the dropped county but not wholly within it) now carries real votes from
        # only its remaining, non-blob county - a small unrepresentative remainder, not an
        # honest full-district total. Every other state/chamber already shipped without this
        # filter and doesn't need it applied retroactively - confirmed WA's own mixed districts
        # fall well below a typical district's total once King County is excluded (LD1 kept only
        # 42% of the chamber's median). Same threshold/rationale as the spatial-join script's
        # low-coverage filter.
        if dropped_blob_votes[chamber] and out:
            floor = statistics.median(v["totalVotes"] for v in out.values()) * 0.4
            before = len(out)
            out = {d: v for d, v in out.items() if v["totalVotes"] >= floor}
            if len(out) < before:
                print(f"{abbr} {chamber}: dropped {before - len(out)} low-coverage district(s) "
                      f"(< 40% of median total votes - a mixed district whose other county was "
                      f"excluded above)")
        result[chamber] = out

    _fill_shared_boundary_gaps(abbr, result)

    tot = defaultdict(float)
    for pv in pres_party.values():
        for b, v in pv.items():
            tot[b] += v
    grand = sum(tot.values())
    print(f"{abbr} statewide president totals from this file: dem={tot['dem']:,.0f} "
          f"rep={tot['rep']:,.0f} oth={tot['oth']:,.0f} total={grand:,.0f}")
    if dropped_noncanonical:
        print(f"{abbr}: dropped {len(dropped_noncanonical)} non-canonical district code(s) "
              f"(weight only, e.g. {sorted(dropped_noncanonical)[:5]})")

    return result


if __name__ == "__main__":
    abbr = sys.argv[1].upper()
    csv_path = sys.argv[2]
    kwargs = {}
    if "--house-office" in sys.argv:
        kwargs["house_office"] = sys.argv[sys.argv.index("--house-office") + 1]
    if "--senate-office" in sys.argv:
        kwargs["senate_office"] = sys.argv[sys.argv.index("--senate-office") + 1]

    data = crosswalk(abbr, csv_path, **kwargs)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{abbr}.json")
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    print(f"wrote {out_path}")
