#!/usr/bin/env python3
"""Correct a statewide chamber-year row in state_leg.csv from its own district-level data.

Phase 3 sometimes produces district results that are demonstrably BETTER than the statewide
row they are checked against. The pattern is always the same: the statewide row came from a
Wikipedia infobox, which lists only the two major parties, so its `oth_votes` is 0 - a value
that is not merely imprecise but known-wrong, and the row's own `note` usually says so. The
district data, summed, carries the third-party and write-in votes the infobox omitted.

This script applies that correction, but ONLY for the chamber-years named in CORRECTIONS
below. It is deliberately not automatic: a district sum being different from the statewide
row is normally a reason to investigate, not to overwrite, and in states that declare
unopposed candidates elected without printing a count the district sum is legitimately the
LOWER of the two and must never replace the statewide figure.

WHAT IS SPENT BY DOING THIS. A row whose two sides come from different sources is one of the
very few independent checks on the audit page. Overwriting the statewide side makes the
lineage shared and the check trivially exact from then on. So each entry records the
corroboration that was measured BEFORE the overwrite - that evidence is the reason to trust
the change, and once applied it can no longer be re-derived from the file.

Usage:
    python3 scripts/correct-statewide-from-districts.py --report
    python3 scripts/correct-statewide-from-districts.py --write
"""

import argparse
import csv
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
RESULTS_DIR = os.path.join(REPO, "data-entry", "state-leg-results")

# (state_name, year, chamber) -> {abbr, source, note, why}
CORRECTIONS = {
    ("Washington", 2024, "House"): {
        "abbr": "WA",
        "source": "MEDSL Precinct-Level Returns 2024 by Individual State",
        "note": "",
        "why": (
            "The prior row was a Wikipedia infobox with oth_votes = 0 and a note saying the "
            "infobox lists major parties only. Before the overwrite the two sources were "
            "independent and agreed closely: D 3,782,223 vs 3,782,471 (-248, 0.007%) and "
            "R 3,008,595 vs 3,011,190 (-2,595, 0.09%). The whole remaining difference was the "
            "missing third-party and write-in vote, 197,618, which this correction adds."
        ),
    },
    ("Oregon", 2024, "Senate"): {
        "abbr": "OR",
        "source": "Wikipedia district tables",
        "note": "",
        "why": (
            "Same article, same tables, corrected parse. The prior figure came from the shared "
            "CAND_BOX in build-state-leg-votes-from-wikipedia.py, which cannot match a result box "
            "that puts `party` directly before `votes`, and so dropped 54,001 Democratic votes. "
            "R and O were already exact and are unchanged (+0, +0); only D moves."
        ),
    },
    ("Iowa", 2024, "House"): {
        "abbr": "IA",
        "source": "Wikipedia district tables",
        "note": "",
        "why": (
            "The prior row was a Wikipedia infobox with oth_votes = 0, whose convention is major "
            "parties only. Its R total matched the district sum EXACTLY and D to within 1,000, so "
            "the entire difference is the 47,376-vote Other bucket the infobox omits."
        ),
    },
    ("Arizona", 2024, "House"): {
        "abbr": "AZ",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": (
            "Second correction (2026-11-14). The Wikipedia district tables this row was first "
            "corrected from held an incomplete count: 22 of 30 districts were below the sum of the "
            "RDH 2024 precinct file, 18 of them by 15-35% (LD14 R 91,716 vs 145,344). MEDSL agrees "
            "with RDH in every district MEDSL covers completely (LD6, LD8, LD11). User rule: RDH "
            "precinct data is trusted over existing site data."
        ),
    },
    ("Indiana", 2024, "Senate"): {
        "abbr": "IN",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": (
            "MEDSL's Indiana 2024 file is unreliable: SD10 was exactly doubled, SD40 was 9,378 "
            "against 38,424 in the RDH precinct file, SD7/SD9/SD35 were 20-45% high. Districts and "
            "this row both move to the RDH precinct sums (2026-11-14)."
        ),
    },
    ("Maine", 2024, "Senate"): {
        "abbr": "ME",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": (
            "MEDSL-based totals ran about 0.7% below the RDH precinct file in 34 of 35 districts, "
            "consistent with centrally counted overseas ballots that RDH allocates and MEDSL omits."
        ),
    },
    ("Maine", 2024, "House"): {
        "abbr": "ME",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": "Same cause as the Maine Senate row: MEDSL-based totals about 0.7% low across the chamber.",
    },
    ("North Dakota", 2024, "Senate"): {
        "abbr": "ND",
        "source": "MEDSL State Precinct-Level Returns 2024; SD2 from RDH 2024 precinct results",
        "note": "",
        "why": "SD2 was half the RDH precinct sum for both parties (635/3,145 vs 1,154/6,615).",
    },
    ("Oklahoma", 2024, "Senate"): {
        "abbr": "OK",
        "source": "MEDSL State Precinct-Level Returns 2024; SD46 from RDH 2024 precinct results",
        "note": "",
        "why": "SD46 had no district row (MEDSL's rows for it are doubled); RDH has D 12,722, R 7,228, I 1,107.",
    },
    ("Arizona", 2018, "House"): {
        "abbr": "AZ",
        "source": "Klarner SLERS 1967-2022; LD18 from the signed official canvass",
        "note": "",
        "why": "LD18 was missing Republican Jill Norgaard (44,269 votes; signed canvass of 3 Dec 2018, p. 8; precinct returns agree).",
    },
    ("Montana", 2020, "House"): {
        "abbr": "MT",
        "source": "Klarner SLERS 1967-2022; HD3, HD19, HD84 from the 2020 legislative canvass",
        "note": "",
        "why": "Three winners' or losers' totals were 10,000 too high (HD3 Powers 12,393 for 2,393; HD19 McKamey 14,288 for 4,288; HD84 Hull 12,819 for 2,819) and HD19's Libertarian (762) was missing. Canvass and precinct returns agree.",
    },
    ("Oregon", 2024, "House"): {
        "abbr": "OR",
        "source": "Wikipedia district tables; HD9 from RDH 2024 precinct results",
        "note": "",
        "why": "HD9 was missing its Democrat, William Mrkvicka (14,196 votes).",
    },
    ("Connecticut", 2024, "Senate"): {
        "abbr": "CT",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": "Fusion rule (user, 2026-11-14): a candidate's cross-endorsement line votes count for that candidate's party. The prior row counted the major-party line only.",
    },
    ("Connecticut", 2024, "House"): {
        "abbr": "CT",
        "source": "Redistricting Data Hub 2024 precinct results",
        "note": "",
        "why": "Fusion rule, as for the Connecticut Senate row.",
    },
    ("New York", 2024, "Senate"): {
        "abbr": "NY",
        "source": "New York State Board of Elections 2024 canvass",
        "note": "Fusion rule: a candidate's votes on every party line count for that candidate's party.",
        "why": "Fusion rule (user, 2026-11-14). Same canvass, different convention: the prior row counted only the Democratic and Republican lines and put Working Families, Conservative and other line votes in Other (599,150 votes in 54 districts). They now count for the candidate who received them.",
    },
    ("New York", 2024, "House"): {
        "abbr": "NY",
        "source": "New York State Board of Elections 2024 canvass",
        "note": "Fusion rule: a candidate's votes on every party line count for that candidate's party.",
        "why": "Fusion rule, as for the New York Senate row (564,139 votes in 119 districts moved out of Other).",
    },
    ("New Jersey", 2025, "House"): {
        "abbr": "NJ",
        "source": "Wikipedia district tables",
        "note": "",
        "why": (
            "The prior row was a Wikipedia infobox with oth_votes = 0. Its D and R agree with "
            "the district sum to within 749 and 617 votes (0.02% each) across all 40 districts, "
            "so the substance of the change is the 6,362 third-party votes the infobox omits. "
            "An official NJ Division of Elections canvass would be better still, as it was for "
            "the 2023 Assembly."
        ),
    },
    ("Washington", 2024, "Senate"): {
        "abbr": "WA",
        "source": "MEDSL Precinct-Level Returns 2024 by Individual State",
        "note": "",
        "why": (
            "The two sides were INDEPENDENT here - the row was transcribed from Wikipedia's "
            "district tables, the districts come from MEDSL's per-state precinct returns - and "
            "they agreed to 0.05%: D 979,681 vs 979,004 (+677), R 876,692 vs 876,314 (+378), "
            "other 13,750 vs 13,903 (-153) across all 25 districts up. The precinct returns are "
            "the stronger of two sources that already corroborate each other."
        ),
    },
}


def load_districts(abbr, year, chamber):
    path = os.path.join(RESULTS_DIR, f"{abbr}-{year}.json")
    if not os.path.exists(path):
        return None
    block = json.load(open(path, encoding="utf-8")).get("senate" if chamber == "Senate" else "house")
    if not block:
        return None
    d = r = o = 0
    counted = 0
    for v in block["districts"].values():
        # A district with no published count contributes nothing; see StateLegDistrictResult.
        if v.get("totalVotes") is None:
            continue
        d += v["demVotes"]
        r += v["repVotes"]
        o += v["othVotes"]
        counted += 1
    return {"D": d, "R": r, "O": o, "total": d + r + o, "districts": counted,
            "source": block["source"]}


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for row in rows:
        try:
            key = (row["state_name"], int(row["year"]), row["type"])
        except ValueError:
            continue
        spec = CORRECTIONS.get(key)
        if not spec:
            continue
        agg = load_districts(spec["abbr"], key[1], key[2])
        if not agg:
            print(f"{key}: no district data found, skipping")
            continue

        old = (int(row["dem_votes"]), int(row["rep_votes"]), int(row["oth_votes"] or 0),
               int(row["total_votes"]))
        new = (agg["D"], agg["R"], agg["O"], agg["total"])
        print(f"{key[0]} {key[1]} {key[2]}  ({agg['districts']} districts)")
        print(f"  was  D={old[0]:>9,} R={old[1]:>9,} O={old[2]:>9,} T={old[3]:>10,}   {row['source']}")
        print(f"  now  D={new[0]:>9,} R={new[1]:>9,} O={new[2]:>9,} T={new[3]:>10,}   {spec['source']}")
        print(f"  why  {spec['why']}\n")

        total = agg["total"]
        row["dem_votes"], row["rep_votes"], row["oth_votes"] = str(new[0]), str(new[1]), str(new[2])
        row["total_votes"] = str(total)
        row["dem_pct"] = f"{new[0] / total * 100:.1f}"
        row["rep_pct"] = f"{new[1] / total * 100:.1f}"
        row["oth_pct"] = f"{new[2] / total * 100:.1f}"
        row["margin"] = f"{(new[1] - new[0]) / total * 100:.1f}"
        row["vote_margin"] = str(new[1] - new[0])
        row["source"] = spec["source"]
        row["note"] = spec["note"]
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"updated {changed} row(s) in {STATE_LEG_CSV}")
    else:
        print(f"{changed} row(s) would change (--write to apply)")


if __name__ == "__main__":
    main()
