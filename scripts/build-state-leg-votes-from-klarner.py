#!/usr/bin/env python3
"""Rebuild the vote columns of data-entry/state_leg.csv from the Klarner SLERS dataset.

Source: Carl Klarner, "State Legislative Election Returns, 1967-2022"
        Harvard Dataverse doi:10.7910/DVN/FJOGJB, file 202slers_uoa_contest20230810.tab
        (contest = one state-leg race; the unit we aggregate up to chamber-year).

Why this source: state_leg.csv was compiled from Wikipedia and carries 57 rows with no
votes at all ("Incomplete Data") plus 102 rows whose votes are flagged "Estimate".
Klarner is a cleaned academic compilation of official returns and was validated here
against official results (see VALIDATION below), so it replaces both.

WHAT THIS SCRIPT TOUCHES: only the VOTE columns (dem/rep/oth/total votes and the
percentages + margins derived from them). It deliberately does NOT touch dem_seats /
rep_seats, because those are a DIFFERENT QUANTITY from anything Klarner reports:
state_leg.csv's seat columns are the chamber's full composition after the election
(holdovers included), while Klarner's dwin/rwin are seats WON in that cycle. For a
staggered chamber the two legitimately differ - e.g. Wisconsin 2020 Senate is D12/R21
as a 33-seat composition but only 16 seats were up, of which D won 6 and R won 10.

KEY STRUCTURAL RULES (each verified against the data, not assumed):

  * Votes are a raw sum of dvote/rvote/ovote over the chamber-year's contests. In a
    true multi-member district each voter casts several votes and Klarner reports the
    sum over that district's candidates, so the chamber total is "votes cast", not
    "ballots cast". state_leg.csv already used that convention.
  * Seats won (used only for the --report cross-check) are dwin * seats-per-contest,
    where seats-per-contest is dseats for an at-large multi-member contest but 1 when
    mmdpost is set (ID/WA-style systems where each of a district's seats is its own
    single-seat "post" contest). Verified: with this rule, seats won sums to exactly
    `seatsup` for all 454 chamber-years from 2014 on; using dseats unconditionally
    breaks on ID/WA, and ignoring dseats breaks on AZ/MD/NH/NJ/VT.
  * UNCONTESTED races are INCLUDED. Checked against the 234 unflagged state_leg.csv
    rows: 216 sit closer to the include-uncontested total vs 5 for exclude, so that is
    the file's existing convention and it is also the only one that yields "all votes
    cast for this chamber".
  * SPECIAL elections are excluded: Klarner carries lone off-cycle contests as their own
    chamber-year rows (seatsup=1 against a totalseats of 38-67). state_leg.csv tracks
    regular generals only.

VALIDATION performed when this script was written:
  * Idaho 2020 Senate District 1 - Klarner D 6,549 / R 22,433 matches the Idaho SoS
    certified result exactly. (state_leg.csv's Idaho 2020 Senate row was ~50% low.)
  * Seats-won rule reproduces `seatsup` for 454/454 chamber-years (see above).
  * Klarner's chamber totals agree with the unflagged state_leg.csv rows within 1% for
    171 of 234; the tail is dominated by rows where state_leg.csv is demonstrably the
    wrong one (Idaho/Massachusetts undercounts, Wisconsin's full-chamber-equivalent
    figure for a half-staggered cycle) or by fusion-voting states (NY) where Klarner
    counts every party line a candidate appeared on.

HOW THE TWO SOURCES WERE ADJUDICATED. Klarner and state_leg.csv agree closely almost
everywhere - the median Klarner/CSV total-vote ratio is 1.000 in each of the three
district structures (single-member, at-large multi-member, per-post multi-member), so
this is not a systematic-bias situation. Only five chamber-years disagreed by more than
20%, and each was checked individually against an official or contemporaneous source.
They did NOT all go the same way, which is why this script does not blind-replace:

  * Idaho 2020 Senate      -> KLARNER right. District 1 Klarner D 6,549 / R 22,433
                              matches the Idaho SoS certified result exactly; the CSV
                              row was ~50% low (it had dropped uncontested races).
  * New Jersey 2019 House  -> KLARNER right. District 1 Klarner R 53,568 matches the
                              NJ Division of Elections official PDF exactly (Simonsen
                              27,304 + McClellan 26,264). The CSV/Wikipedia total of
                              778,261 implies ~6.5% turnout statewide, which is not
                              credible; Klarner's implies ~25%.
  * New Hampshire 2022 Sen -> KLARNER WRONG, uniformly doubled. All 48 vote values are
                              even (the only chamber-year in the file above a 0.9 even
                              share; the median chamber-year is 0.496), and District 1
                              reads D 21,710 / R 26,224 against an official D 10,855 /
                              R 13,112. Corrected by /2 in KNOWN_DEFECTS - which lands
                              within 0.007% of the existing CSV value, so this is a
                              safe correction rather than a new claim.
  * New Hampshire 2022 Hse -> KLARNER WRONG but NOT cleanly correctable. Belknap 1 is
                              exactly doubled (Klarner D 1,784 / R 2,106 vs official
                              D 892 / R 1,053) yet Belknap 2's 3,127 is odd, so the
                              doubling is mixed rather than uniform - most likely base
                              and floterial districts conflated. Klarner's chamber total
                              also implies 5.4 votes per ballot against a structurally
                              expected ~3.6. Left on the CSV/Wikipedia value; see SKIP.
  * Vermont 2018 Senate    -> KLARNER WRONG in one district. Chittenden (6 seats) carries
                              867,753 Democratic votes when Vermont's entire 2018 turnout
                              was ~265,000 - about 12 votes per voter. It is 69.6% of the
                              chamber's votes where ~41% is expected (votes scale with
                              seats^2, and Chittenden is 36 of the chamber's ~87). The
                              same district is normal in 2016 (35%) and 2020 (44%), so
                              this is a one-year corruption. Left on the CSV value.

A per-district outlier scan (votes-per-seat above 3x the chamber median) additionally
flagged NH House in every year and WV House 2016-2020; both were checked and are
structurally legitimate, not errors - NH's are floterial districts, which overlay several
base districts and so really do carry far more voters than their seat count implies, and
WV ran multi-member districts until its 2022 switch to 100 single-member seats.

NOT COVERED by this script (Klarner stops at 2022 and omits two states) - these rows are
left untouched and still need their own sourcing:
  * every 2023 / 2024 / 2025 row (2024 is the big one: 24 flagged rows)
  * Louisiana - absent from Klarner entirely (jungle-primary system)
  * Nebraska - absent from Klarner entirely (nonpartisan unicameral)

Usage:
    python3 scripts/build-state-leg-votes-from-klarner.py --report   # diff only, no writes
    python3 scripts/build-state-leg-votes-from-klarner.py --write    # update the CSV
"""

import argparse
import csv
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
REFERENCE_CSV = os.path.join(REPO, "data-entry", "state_leg_klarner.csv")

# Harvard Dataverse file id for 202slers_uoa_contest20230810.tab (doi:10.7910/DVN/FJOGJB).
KLARNER_FILE_ID = 10273086
KLARNER_URL = f"https://dataverse.harvard.edu/api/access/datafile/{KLARNER_FILE_ID}?format=original"
CACHE = os.environ.get(
    "KLARNER_CACHE",
    "/private/tmp/claude-501/-Users-rickyjia-election-map/klarner-cache/contest.tab",
)

# Klarner covers 48 states; LA (jungle primary) and NE (nonpartisan unicameral) are absent.
ABBR_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

# (state, year, chamber) -> divisor, for a defect whose correction is verified. See the
# adjudication list in the module docstring.
KNOWN_DEFECTS = {("New Hampshire", 2022, "Senate"): 2}

# Chamber-years where Klarner is demonstrably wrong and NOT cleanly correctable, so the
# existing (Wikipedia-derived) state_leg.csv numbers are kept instead. Value = why.
SKIP = {
    ("New Hampshire", 2022, "House"):
        "Klarner mixes doubled and undoubled districts (Belknap 1 exactly 2x official, "
        "Belknap 2 odd); implies 5.4 votes/ballot vs ~3.6 expected",
    ("Vermont", 2018, "Senate"):
        "Klarner's Chittenden district is corrupt (867,753 D votes = ~12 per voter; "
        "69.6% of chamber vs ~41% expected)",
}

# state_leg.csv only goes back to 2015 for regular coverage; Klarner reaches 1968 but
# pulling older years in would add rows the site has no other data for.
MIN_YEAR = 2015

SOURCE_LABEL = "Klarner SLERS 1967-2022"


def fetch_klarner():
    """Return the path to the Klarner contest file, downloading it once into CACHE."""
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        sys.stderr.write(f"downloading Klarner contest file -> {CACHE}\n")
        urllib.request.urlretrieve(KLARNER_URL, CACHE)
    return CACHE


def num(v):
    v = (v or "").strip()
    if not v or v.upper() in ("NA", "N/A", "."):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def load_klarner_chamber_years(path):
    """Aggregate the contest-level file up to one row per (state, year, chamber)."""
    agg = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            year = num(row.get("year"))
            if year is None or year < MIN_YEAR:
                continue
            state = ABBR_TO_NAME.get((row.get("sab") or "").strip())
            if not state:
                continue
            chamber = "Senate" if num(row.get("sen")) == 1 else "House"
            key = (state, int(year), chamber)

            dv, rv, ov = num(row.get("dvote")), num(row.get("rvote")), num(row.get("ovote"))
            dseats = num(row.get("dseats")) or 1
            # A district whose seats are elected as separate single-seat "posts"
            # (mmdpost set) contributes one seat per contest, not dseats.
            seats_per_contest = 1 if num(row.get("mmdpost")) is not None else dseats

            a = agg.setdefault(key, {
                "dvote": 0.0, "rvote": 0.0, "ovote": 0.0,
                "dseats_won": 0.0, "rseats_won": 0.0, "oseats_won": 0.0,
                "contests": 0, "vmiss": 0, "uncont": 0,
                "seatsup": 0.0, "totalseats": 0.0,
            })
            a["contests"] += 1
            if num(row.get("vmiss")) == 1:
                a["vmiss"] += 1
            if num(row.get("uncont")) == 1:
                a["uncont"] += 1
            a["dvote"] += dv or 0.0
            a["rvote"] += rv or 0.0
            a["ovote"] += ov or 0.0
            for p, field in (("d", "dwin"), ("r", "rwin"), ("o", "owin")):
                a[f"{p}seats_won"] += (num(row.get(field)) or 0.0) * seats_per_contest
            a["seatsup"] = max(a["seatsup"], num(row.get("seatsup")) or 0.0)
            a["totalseats"] = max(a["totalseats"], num(row.get("totalseats")) or 0.0)

    out = {}
    for key, a in agg.items():
        # Drop lone off-cycle contests: a real regular general always puts up more than
        # one seat in a chamber that has more than two.
        if a["seatsup"] == 1 and a["totalseats"] > 2:
            continue
        if key in SKIP:
            continue
        divisor = KNOWN_DEFECTS.get(key)
        if divisor:
            for f in ("dvote", "rvote", "ovote"):
                a[f] /= divisor
        a["total"] = a["dvote"] + a["rvote"] + a["ovote"]
        out[key] = a
    return out


def fmt_int(x):
    return "" if x is None else str(int(round(x)))


def fmt_pct(x):
    return "" if x is None else f"{x:.1f}"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true", help="show the diff, write nothing")
    g.add_argument("--write", action="store_true", help="update state_leg.csv in place")
    ap.add_argument("--tolerance", type=float, default=1.0,
                    help="percent difference above which a replaced row is listed (default 1)")
    args = ap.parse_args()

    kl = load_klarner_chamber_years(fetch_klarner())
    sys.stderr.write(f"Klarner chamber-years {MIN_YEAR}+ (specials excluded): {len(kl)}\n")

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    # New columns: the third-party bucket the file never had, and explicit provenance
    # so the audit page can tell a sourced row from a leftover estimate.
    for col, after in (("oth_pct", "rep_pct"), ("oth_votes", "rep_votes"), ("source", None)):
        if col not in fields:
            if after and after in fields:
                fields.insert(fields.index(after) + 1, col)
            else:
                fields.append(col)

    replaced, big_diffs, untouched = 0, [], []
    for r in rows:
        for c in ("oth_pct", "oth_votes", "source"):
            r.setdefault(c, "")
        year = int(r["year"]) if r["year"].strip().isdigit() else None
        key = (r["state_name"], year, r["type"])
        if key in SKIP:
            # Keep the existing numbers, but record that Klarner was considered and rejected
            # so a later pass doesn't "rediscover" the discrepancy and flip it.
            r["source"] = "Wikipedia (Klarner rejected)"
            r["note"] = SKIP[key]
            untouched.append((r["state_name"], r["year"], r["type"], "Klarner rejected"))
            continue
        a = kl.get(key)
        if a is None:
            if not r.get("source", "").strip():
                r["source"] = "Wikipedia (unverified)"
            untouched.append((r["state_name"], r["year"], r["type"], r.get("note", "").strip()))
            continue

        old_d, old_r = num(r["dem_votes"]), num(r["rep_votes"])
        d, rp, o, t = a["dvote"], a["rvote"], a["ovote"], a["total"]
        if t <= 0:
            continue

        if old_d is not None and old_r is not None:
            diff = max(abs(d - old_d) / max(old_d, 1), abs(rp - old_r) / max(old_r, 1)) * 100
            if diff > args.tolerance:
                big_diffs.append((diff, r["state_name"], r["year"], r["type"],
                                  r.get("note", "").strip() or "clean",
                                  int(old_d), int(d), int(old_r), int(rp)))

        r["dem_votes"], r["rep_votes"], r["oth_votes"] = fmt_int(d), fmt_int(rp), fmt_int(o)
        r["total_votes"] = fmt_int(t)
        r["dem_pct"], r["rep_pct"], r["oth_pct"] = fmt_pct(d / t * 100), fmt_pct(rp / t * 100), fmt_pct(o / t * 100)
        # Existing file convention: margin and vote_margin are signed R - D.
        r["margin"] = fmt_pct((rp - d) / t * 100)
        r["vote_margin"] = fmt_int(rp - d)
        r["source"] = SOURCE_LABEL
        # These flags described the Wikipedia-era numbers we just replaced.
        if r.get("note", "").strip() in ("Estimate", "Incomplete Data", "Incompelte Data", "Identical?"):
            r["note"] = ""
        if a["vmiss"]:
            r["note"] = (r.get("note", "") + f" {a['vmiss']} contest(s) missing votes in source").strip()
        replaced += 1

    print(f"\nrows replaced from Klarner: {replaced} of {len(rows)}")
    print(f"rows left untouched:        {len(untouched)}")

    big_diffs.sort(reverse=True)
    print(f"\nreplaced rows differing >{args.tolerance}% from the old value: {len(big_diffs)}")
    print(f"{'diff%':>7} {'state':16s}{'yr':6s}{'ch':7s}{'was':12s}{'oldD':>9}{'newD':>9}{'oldR':>9}{'newR':>9}")
    for d in big_diffs[:30]:
        print(f"{d[0]:7.1f} {d[1]:16s}{d[2]:6s}{d[3]:7s}{d[4]:12s}{d[5]:9d}{d[6]:9d}{d[7]:9d}{d[8]:9d}")

    still_flagged = [u for u in untouched if u[3] in ("Estimate", "Incomplete Data", "Incompelte Data")]
    print(f"\nstill unsourced/estimated after this pass: {len(still_flagged)}")
    for u in sorted(still_flagged, key=lambda x: (x[1], x[0])):
        print(f"   {u[0]:16s} {u[1]} {u[2]:7s} {u[3]}")

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nwrote {STATE_LEG_CSV}")

        with open(REFERENCE_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["state_name", "year", "type", "dem_votes", "rep_votes", "oth_votes",
                        "total_votes", "dem_seats_won", "rep_seats_won", "oth_seats_won",
                        "seats_up", "total_seats", "contests", "uncontested", "vote_missing_contests"])
            for (state, year, chamber), a in sorted(kl.items()):
                w.writerow([state, year, chamber, fmt_int(a["dvote"]), fmt_int(a["rvote"]),
                            fmt_int(a["ovote"]), fmt_int(a["total"]),
                            f"{a['dseats_won']:.1f}", f"{a['rseats_won']:.1f}", f"{a['oseats_won']:.1f}",
                            fmt_int(a["seatsup"]), fmt_int(a["totalseats"]),
                            a["contests"], a["uncont"], a["vmiss"]])
        print(f"wrote {REFERENCE_CSV} ({len(kl)} chamber-years)")


if __name__ == "__main__":
    main()
