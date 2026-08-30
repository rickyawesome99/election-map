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
        "source": "Wikipedia district tables",
        "note": "",
        "why": (
            "D and R match the district sum EXACTLY (1,951,102 and 2,412,962). The whole "
            "difference is the 43,383-vote Other bucket: the prior row was a Wikipedia infobox, "
            "whose convention is major parties only, so its oth_votes was 0. All 30 districts "
            "are present on the district side against MEDSL's 28."
        ),
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
