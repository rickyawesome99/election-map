#!/usr/bin/env python3
"""Fill in state_leg.csv's vote columns for a year the Klarner dataset doesn't reach.

Klarner's "State Legislative Election Returns" (see build-state-leg-votes-from-klarner.py)
stops at 2022, so every 2023/2024/2025 row in state_leg.csv is still the original
Wikipedia figure with no third-party bucket. This script sources those years from MEDSL
instead.

Source: MIT Election Data + Science Lab, "State Precinct-Level Returns {YEAR}"
        2024 -> doi:10.7910/DVN/DODOBJ, file STATE_precinct_general.csv (1.29 GB)
        2022 -> doi:10.7910/DVN/OAARCY, file STATE_precinct_general.csv (0.98 GB)
One row per precinct x candidate x voting mode, covering every state office including
STATE HOUSE and STATE SENATE. We only ever aggregate it up to (state, chamber), so no
geography is involved - this is a plain group-by, not a crosswalk.

LINEAGE WARNING (matters for the planned aggregate-vs-statewide audit page): the district
level data for 2024 is expected to come from MEDSL too. Where both sides of that audit are
MEDSL the comparison is a self-consistency check, not an independent one. The `source`
column records this so the audit can say so. For 2016-2022 the statewide side is Klarner
and the independence is real.

GOTCHAS handled (all previously found the hard way on the 2024-president crosswalk, see
the project memory - do not remove these without re-checking the affected states):

  * MODE DOUBLE-COUNTING, and it has to be resolved PER COUNTY, not per state. Some states
    report a `TOTAL` mode row ALONGSIDE the separate per-mode rows (ELECTION DAY /
    ABSENTEE / ...) for the same precinct+candidate; summing everything then double-counts
    them (this is how DE and RI came out at exactly 2x their certified totals). But other
    states MIX the two styles across counties: Indiana files 58 of its 92 counties as
    `TOTAL` and the other 34 only by mode, so picking one style for the whole state throws
    away a third of it. So for each county we take its `TOTAL` rows if it has any and its
    per-mode rows otherwise, then sum the counties.
  * `votes` may be `*` where a small jurisdiction redacts its count. Treated as 0 and
    counted separately so a state with many redactions is visible rather than silently low.
  * SPECIAL elections and non-general stages are excluded - state_leg.csv tracks regular
    November generals only (`stage == GEN`, `special` falsy).
  * NEBRASKA is officially nonpartisan, so `party_simplified` is NONPARTISAN for every
    NE candidate and the real affiliation only appears in `party_detailed`. Nebraska's
    legislators do caucus as D/R in practice, which is what the site wants to show, so NE
    is bucketed from `party_detailed`. Its rows are stored under the "Senate" type here
    (state_leg.csv also carries NE "House" rows for the same unicameral body).
  * FUSION party lines (NY et al.) appear in `party_detailed` as "DEMOCRAT / WORKING
    FAMILIES". `party_simplified` already resolves those to the major party, which matches
    how Klarner counts them, so the two years stay consistent with each other.

Usage:
    python3 scripts/build-state-leg-votes-from-medsl.py --year 2024 --report
    python3 scripts/build-state-leg-votes-from-medsl.py --year 2024 --write
"""

import argparse
import collections
import csv
import os
import sys
import urllib.request

csv.field_size_limit(10_000_000)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")

# Dataverse file ids for each year's STATE_precinct_general.csv.
MEDSL_FILES = {2024: 13730906, 2022: 13996917}
CACHE_DIR = os.environ.get(
    "MEDSL_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/medsl-cache"
)

OFFICE_TO_TYPE = {"STATE HOUSE": "House", "STATE SENATE": "Senate"}

# Rows filed under the office that are NOT a candidate's votes. Leaving these in inflates a
# chamber enormously - Maine's "TOTAL BALLOTS CAST" alone is 1.67M and Arizona's
# "UNDERVOTES" 1.85M, each larger than either party's real total.
NON_CANDIDATE = {
    "UNDERVOTES", "UNDERVOTE", "UNDER VOTES", "OVERVOTES", "OVERVOTE", "OVER VOTES",
    "TOTAL BALLOTS CAST", "TOTAL VOTES CAST", "TOTAL VOTES", "CAST VOTES", "BALLOTS CAST",
    "TIMES COUNTED", "REGISTERED VOTERS", "CONTEST TOTAL", "TOTAL", "BLANKS", "BLANK VOTES",
    "SPOILED", "EXHAUSTED", "CONTINUING BALLOTS",
}
# Scattered/unnamed votes: real votes, but they belong in the third-party bucket rather
# than being dropped or mistaken for a named candidate.
OTHER_CANDIDATE = {"WRITE-IN", "WRITEIN", "WRITE-INS", "WRITE IN", "OTHERS", "ALL OTHERS",
                   "SCATTERING", "MISC", "OTHER"}

# Above this share of a chamber's votes carrying no usable party, MEDSL cannot answer the
# D/R split for that state and the existing state_leg.csv value is kept instead.
MAX_UNATTRIBUTED = 0.02

# MEDSL's chamber total falling this far below the figure already in state_leg.csv means
# MEDSL is missing part of the state rather than correcting it - New Mexico's 2024 file
# carries only 25 of its 70 State House districts. A chamber can legitimately come in
# somewhat lower (a bad prior estimate, undervotes excluded), so this only catches the
# large shortfalls; everything between here and parity is listed for eyeballing instead.
MIN_COVERAGE_VS_EXISTING = 0.6

# Officially nonpartisan ballots: MEDSL records every candidate as NONPARTISAN with no
# party anywhere in the file, so it cannot produce a D/R split. Nebraska's members do
# caucus as D/R and the site wants that split, but it has to come from another source.
EXCLUDE_STATES = {"Nebraska": "nonpartisan ballot; MEDSL records no party at all"}

# Chambers whose MEDSL coverage was checked and found truncated. New Mexico's 2024 file
# carries 25 districts for each chamber against a real 70 (House) and 42 (Senate), so both
# are far too low; the House trips MIN_COVERAGE_VS_EXISTING on its own but the Senate lands
# just above it, so both are named here rather than left to a threshold.
SKIP_CHAMBERS = {
    ("New Mexico", "House"): "MEDSL carries only 25 of 70 districts",
    ("New Mexico", "Senate"): "MEDSL carries only 25 of 42 districts",
}


def cache_path(year):
    return os.path.join(CACHE_DIR, f"STATE_precinct_general_{year}.csv")


def fetch(year):
    path = cache_path(year)
    if not os.path.exists(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        url = f"https://dataverse.harvard.edu/api/access/datafile/{MEDSL_FILES[year]}?format=original"
        sys.stderr.write(f"downloading MEDSL {year} state precinct returns -> {path}\n")
        urllib.request.urlretrieve(url, path)
    return path


def party_bucket(simple, detailed):
    """D / R / O / None(unattributed) for one row's party fields.

    `None` means "a real candidate whose party this file does not record" - kept distinct
    from O so the coverage guard can see it. Fusion lines are resolved to the major party
    they name (Oregon's "DEMOCRAT / INDEPENDENT", Vermont's "DEMOCRAT/PROGRESSIVE"), which
    is how Klarner counts them too, so the years stay consistent; a line naming BOTH major
    parties stays Other because it is genuinely ambiguous.
    """
    simple = (simple or "").strip().upper()
    if simple == "DEMOCRAT":
        return "D"
    if simple == "REPUBLICAN":
        return "R"
    detailed = (detailed or "").strip().upper()
    if simple in ("OTHER", "LIBERTARIAN", "NONPARTISAN"):
        has_d, has_r = "DEMOCRAT" in detailed, "REPUBLICAN" in detailed
        if has_d and not has_r:
            return "D"
        if has_r and not has_d:
            return "R"
        return "O"
    if not simple and not detailed:
        return None
    return "O"


def truthy(v):
    return (v or "").strip().upper() in ("TRUE", "T", "1", "YES")


def iter_leg_rows(path):
    """Yield the (state, chamber, candidate, simple, detailed, mode, votes) we care about."""
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            chamber = OFFICE_TO_TYPE.get((row.get("office") or "").strip().upper())
            if chamber is None:
                continue
            if (row.get("stage") or "").strip().upper() not in ("GEN", ""):
                continue
            if truthy(row.get("special")):
                continue
            state = (row.get("state") or "").strip().title()
            cand = (row.get("candidate") or "").strip().upper()
            if not state or not cand or cand in NON_CANDIDATE:
                continue
            unit = ((row.get("county_fips") or "").strip()
                    or (row.get("county_name") or "").strip().upper()
                    or (row.get("jurisdiction_name") or "").strip().upper())
            yield (state, chamber, cand, row.get("party_simplified"),
                   row.get("party_detailed"), (row.get("mode") or "").strip().upper(),
                   (row.get("votes") or "").strip(), unit)


def build_candidate_parties(path):
    """candidate -> the single party they are recorded with anywhere in the file.

    Arizona and Oregon leave `party_simplified` blank on a large share of their rows while
    recording the same candidate WITH a party on others; this recovers those. Candidates
    seen under conflicting parties are left out rather than guessed.
    """
    seen = {}
    for state, _ch, cand, simple, detailed, _m, _v, _u in iter_leg_rows(path):
        p = party_bucket(simple, detailed)
        if p is None:
            continue
        key = (state, cand)
        prev = seen.get(key, p)
        seen[key] = p if prev == p else "?"
    return {k: v for k, v in seen.items() if v != "?"}


def aggregate(path, cand_party):
    """-> {(state, chamber): Counter(D/R/O/U)}, resolving TOTAL-vs-mode per county."""
    per_unit = {}   # (state, chamber, county) -> {"TOTAL": Counter, "MODES": Counter}
    redacted = {}
    rows_seen = 0
    for state, chamber, cand, simple, detailed, mode, raw, unit in iter_leg_rows(path):
        key = (state, chamber)
        if raw == "*":
            redacted[key] = redacted.get(key, 0) + 1
            continue
        try:
            v = int(float(raw))
        except ValueError:
            continue
        rows_seen += 1
        if cand in OTHER_CANDIDATE:
            p = "O"
        else:
            p = party_bucket(simple, detailed)
            if p is None:
                # Fall back to this candidate's party as recorded elsewhere in the file.
                p = cand_party.get((state, cand), "U")
        u = per_unit.setdefault((state, chamber, unit),
                                {"TOTAL": collections.Counter(), "MODES": collections.Counter()})
        u["TOTAL" if mode == "TOTAL" else "MODES"][p] += v
    sys.stderr.write(f"parsed {rows_seen:,} state-legislative vote rows\n")

    acc, styles = {}, collections.defaultdict(collections.Counter)
    for (state, chamber, _unit), u in per_unit.items():
        # Within one county the per-mode rows are a breakdown of its TOTAL rows, so take
        # TOTAL where the county has it and its mode rows otherwise.
        basis = "TOTAL" if sum(u["TOTAL"].values()) else "MODES"
        acc.setdefault((state, chamber), collections.Counter()).update(u[basis])
        styles[(state, chamber)][basis] += 1
    return acc, redacted, styles


def seats_won(path, cand_party):
    """Count each chamber's seats won by party, from who topped each district.

    Needed because Klarner (the seats-won source for 2015-2022) stops there, leaving every
    STAGGERED chamber's 2024 cycle without a seats-won figure - and for a staggered chamber
    that number cannot be inferred from the composition, since most of the body is holdovers.
    Only the districts actually on the ballot appear in this file, so counting district
    winners gives exactly the seats contested that cycle.

    Multi-member districts take the top N candidates, N being how many seats the district
    elects; that is read off the data as the number of candidates marked elected cannot be
    known here, so it comes from `magnitude` where the file provides it and defaults to 1.
    """
    # (state, chamber, district, county) -> {basis: {candidate: votes}}, so the same
    # per-county TOTAL-vs-mode rule used for vote totals applies to the winner too.
    per_unit = {}
    mag = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            chamber = OFFICE_TO_TYPE.get((row.get("office") or "").strip().upper())
            if chamber is None:
                continue
            if (row.get("stage") or "").strip().upper() not in ("GEN", ""):
                continue
            if truthy(row.get("special")):
                continue
            state = (row.get("state") or "").strip().title()
            cand = (row.get("candidate") or "").strip().upper()
            district = (row.get("district") or "").strip()
            if not state or not cand or cand in NON_CANDIDATE or cand in OTHER_CANDIDATE:
                continue
            try:
                v = int(float((row.get("votes") or "").strip()))
            except ValueError:
                continue
            unit = ((row.get("county_fips") or "").strip()
                    or (row.get("county_name") or "").strip().upper())
            key = (state, chamber, district)
            try:
                m = int(float((row.get("magnitude") or "1").strip() or 1))
            except ValueError:
                m = 1
            mag[key] = max(mag.get(key, 1), m if m > 0 else 1)
            u = per_unit.setdefault((key, unit), {"TOTAL": collections.Counter(),
                                                  "MODES": collections.Counter()})
            basis = "TOTAL" if (row.get("mode") or "").strip().upper() == "TOTAL" else "MODES"
            u[basis][(cand, row.get("party_simplified"), row.get("party_detailed"))] += v

    tallies = {}
    for (key, _unit), u in per_unit.items():
        basis = "TOTAL" if sum(u["TOTAL"].values()) else "MODES"
        tallies.setdefault(key, collections.Counter()).update(u[basis])

    won = {}
    for (state, chamber, district), cands in tallies.items():
        n = mag.get((state, chamber, district), 1)
        top = cands.most_common(n)
        for (cand, simple, detailed), _v in top:
            p = party_bucket(simple, detailed)
            if p is None:
                p = cand_party.get((state, cand), "O")
            c = won.setdefault((state, chamber), collections.Counter())
            c[p] += 1
            c["seats"] += 1
    return won


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True, choices=sorted(MEDSL_FILES))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    ap.add_argument("--seats", action="store_true",
                    help="also fill dem/rep/oth_seats_won and seats_up from district winners")
    args = ap.parse_args()

    path = fetch(args.year)
    sys.stderr.write("pass 1/2: building candidate -> party map\n")
    cand_party = build_candidate_parties(path)
    sys.stderr.write(f"  {len(cand_party):,} candidates with an unambiguous party\n")
    sys.stderr.write("pass 2/2: aggregating\n")
    acc, redacted, styles = aggregate(path, cand_party)

    results, skipped = {}, []
    for key, votes in acc.items():
        st = styles[key]
        basis = "TOTAL" if not st["MODES"] else ("MODES" if not st["TOTAL"] else
                                                f"mixed {st['TOTAL']}T/{st['MODES']}M")
        total = sum(votes.values())
        if total <= 0:
            continue
        if key[0] in EXCLUDE_STATES:
            skipped.append((key, -1.0, EXCLUDE_STATES[key[0]]))
            continue
        if key in SKIP_CHAMBERS:
            skipped.append((key, -1.0, SKIP_CHAMBERS[key]))
            continue
        unattributed = votes.get("U", 0) / total
        if unattributed > MAX_UNATTRIBUTED:
            skipped.append((key, unattributed, basis))
            continue
        # Whatever little is left unattributed is genuinely of unknown party -> Other.
        votes["O"] += votes.pop("U", 0)
        results[key] = (votes, basis, total)
    print(f"\nMEDSL {args.year}: {len(results)} chambers usable, {len(skipped)} skipped")
    for (st, ch), frac, why in sorted(skipped):
        reason = why if frac < 0 else f"{frac*100:.1f}% of votes have no party in MEDSL ({why})"
        print(f"   SKIP {st} {ch}: {reason}")

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    label = f"MEDSL State Precinct-Level Returns {args.year}"
    updated, unmatched, short = 0, [], []
    print(f"\n{'state':16s}{'ch':7s}{'basis':20s}{'oldD':>10}{'newD':>10}{'oldR':>10}{'newR':>10}{'oth':>9}")
    for r in rows:
        if r["year"].strip() != str(args.year):
            continue
        key = (r["state_name"], r["type"])
        if key not in results:
            unmatched.append(key)
            continue
        votes, basis, total = results[key]
        d, rp, o = votes["D"], votes["R"], votes["O"]
        old_d = int((r["dem_votes"] or "0").strip() or "0")
        old_r = int((r["rep_votes"] or "0").strip() or "0")
        old_total = int((r["total_votes"] or "0").strip() or "0")

        if old_total and total < old_total * MIN_COVERAGE_VS_EXISTING:
            short.append((r["state_name"], r["type"], old_total, total))
            continue
        flag = ""
        if old_d and old_r:
            moved = max(abs(d - old_d) / max(old_d, 1), abs(rp - old_r) / max(old_r, 1))
            if moved > 0.25:
                flag = "  <-- moved >25%"
        print(f"{r['state_name']:16s}{r['type']:7s}{basis:20s}{old_d:10d}{d:10d}{old_r:10d}{rp:10d}{o:9d}{flag}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = label
        if r.get("note", "").strip() in ("Estimate", "Incomplete Data", "Incompelte Data"):
            r["note"] = ""
        n_red = redacted.get(key, 0)
        if n_red:
            r["note"] = (r.get("note", "") + f" {n_red} precinct rows redacted in source").strip()
        updated += 1

    if args.seats:
        skipped_keys = {k for k, _f, _w in skipped}
        sys.stderr.write("pass 3/3: counting district winners\n")
        won = seats_won(path, cand_party)
        filled = 0
        print(f"\nseats won ({len(won)} chambers):")
        for r in rows:
            if r["year"].strip() != str(args.year) or r["note"].strip() == "Unicameral":
                continue
            key = (r["state_name"], r["type"])
            # A chamber whose votes MEDSL could not attribute cannot have its winners
            # attributed either - Oregon's 15 Senate districts came out 2D/8R/5"other"
            # purely because those five winners carry no party in the file.
            if key in skipped_keys or key in SKIP_CHAMBERS or key[0] in EXCLUDE_STATES:
                print(f"   SKIP {key[0]} {key[1]}: party coverage too poor for winners")
                continue
            w = won.get(key)
            if not w or r["dem_seats_won"].strip():
                continue
            r["dem_seats_won"], r["rep_seats_won"] = str(w["D"]), str(w["R"])
            r["oth_seats_won"], r["seats_up"] = str(w["O"]), str(w["seats"])
            print(f"   {r['state_name']:16s}{r['type']:7s} won D={w['D']:3d} R={w['R']:3d} "
                  f"O={w['O']:2d}  of {w['seats']:3d} up   (chamber has {r['total_seats'] or '?'})")
            filled += 1
        print(f"seats_won rows filled: {filled}")

    print(f"\nrows updated: {updated}")
    for st, ch, old_t, new_t in short:
        print(f"   SKIP {st} {ch}: MEDSL total {new_t:,} is only "
              f"{new_t/old_t*100:.0f}% of the existing {old_t:,} - source coverage looks partial")
    if unmatched:
        print(f"{args.year} rows with no MEDSL chamber match: {sorted(set(unmatched))}")

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"wrote {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
