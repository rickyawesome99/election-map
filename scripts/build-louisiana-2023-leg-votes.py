#!/usr/bin/env python3
"""Set Louisiana's 2023 legislative vote totals from the official parish-reported results.

The 2023 twin of build-louisiana-2023-leg-votes.py, and needed for the same reason: Klarner
stops at 2022, MEDSL publishes no odd-year volume, and Louisiana's jungle primary does not
fit a D-vs-R contest model in any bulk dataset.

WIKIPEDIA IS ACTIVELY WRONG HERE, which is why this file exists. Its district tables list
the primary AND the runoff under one district heading, so summing them double-counts every
runoff district: a parse of them came out at 691,913 for the House against a real 560,450.
Its infobox is much better - its D total matches this canvass EXACTLY for both chambers and
its R is within 883 (House) and 2 (Senate) - but it carries no third-party bucket at all,
reporting oth_votes = 0 against a real 7,316 and 3,496.

Input: `data-entry/louisiana_2023_legislature.csv`, per-district D/R/other totals for both
rounds, transcribed from the Louisiana Secretary of State's published results. All 96
district-rounds (76 primary, 20 runoff) reconcile exactly against their own stated "Total:"
line - 246 candidate lines, zero discrepancies.

WHICH ROUND COUNTS. Louisiana runs a jungle primary in October where every candidate of
every party shares one ballot; anyone taking a majority wins outright, and only the
undecided seats go to a November runoff. The chamber total here is the OCTOBER PRIMARY,
because that is the round the whole electorate votes in and the only one that covers every
contested seat - the analogue of another state's general election. Summing primary and
runoff together would double-count every voter in a runoff district, and using the runoff
alone would describe just 24 of 105 House seats. The runoff rows are kept in the input file
so the choice stays reversible and so the per-district data is complete.

Not every seat appears: 57 of 105 House and 19 of 39 Senate districts were contested. The
rest were unopposed, and Louisiana declares an unopposed candidate elected without printing
a vote count, so a Louisiana chamber total is structurally well below the state's turnout.
That is a property of the system, not a gap - the note on each row says so.

Usage:
    python3 scripts/build-louisiana-2023-leg-votes.py --report
    python3 scripts/build-louisiana-2023-leg-votes.py --write
    python3 scripts/build-louisiana-2023-leg-votes.py --districts

`--districts` writes the same per-district rows out as Phase 3 district-level results
(`data-entry/state-leg-results/LA-2019.json`), for `scripts/build-state-leg-results.mjs`.
Note for the audit page: those districts and the statewide row above come from THIS file, so
their aggregate check is a plumbing test, not an independent one - the emitted chamber
`source` string is what the page uses to say so.
"""

import argparse
import collections
import csv
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
LA_CSV = os.path.join(REPO, "data-entry", "louisiana_2023_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "LA-2023.json")

ROUND = "primary"
NOTE = ("October jungle primary (the round all voters cast in); unopposed seats are "
        "declared elected with no vote printed, so the total sits below statewide turnout")
SOURCE = "Louisiana SoS 2023 official results (per-district)"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--districts", action="store_true")
    args = ap.parse_args()

    if args.districts:
        write_districts()
        return

    agg = collections.defaultdict(collections.Counter)
    with open(LA_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["round"] != ROUND:
                continue
            a = agg[r["chamber"]]
            a["D"] += int(r["dem_votes"])
            a["R"] += int(r["rep_votes"])
            a["O"] += int(r["oth_votes"])
            a["n"] += 1

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "Louisiana" or r["year"] != "2023":
            continue
        a = agg.get(r["type"])
        if not a:
            continue
        d, rp, o = a["D"], a["R"], a["O"]
        total = d + rp + o
        old = (r["dem_votes"] or "—", r["rep_votes"] or "—", r["total_votes"] or "—")
        print(f"{r['type']:7s} {a['n']:3d} contested districts   was D={old[0]:>9s} R={old[1]:>9s} "
              f"T={old[2]:>9s}   now D={d:>9,} R={rp:>9,} O={o:>7,} T={total:>9,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        r["note"] = NOTE
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} Louisiana 2023 rows in {STATE_LEG_CSV}")


def write_districts():
    """Emit the primary-round per-district rows as a Phase 3 state-leg-results file."""
    chambers = {}
    with open(LA_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["round"] != ROUND:
                continue
            ch = chambers.setdefault(r["chamber"].lower(), {})
            ch[r["district"]] = {
                "demVotes": int(r["dem_votes"]),
                "repVotes": int(r["rep_votes"]),
                "othVotes": int(r["oth_votes"]),
                "totalVotes": int(r["total_votes"]),
            }

    out = {
        chamber: {"source": SOURCE, "note": NOTE, "districts": districts}
        for chamber, districts in sorted(chambers.items())
    }
    os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
    with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=False)
        fh.write("\n")
    for chamber, block in out.items():
        print(f"{chamber:7s} {len(block['districts']):3d} districts")
    print(f"wrote {DISTRICTS_JSON}")


if __name__ == "__main__":
    main()
