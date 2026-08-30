#!/usr/bin/env python3
"""Set Louisiana's 2019 legislative vote totals from the official parish-reported results.

Louisiana was the last chamber-year in 2016-2025 with no vote totals at all: Klarner omits
the state entirely (its jungle primary does not fit a D-vs-R contest model), MEDSL's volumes
are even-year only, and Wikipedia's "2019 Louisiana House of Representatives election"
article is a 4,900-character stub with no results in it.

Input: `data-entry/louisiana_2019_legislature.csv`, per-district D/R/other totals for both
rounds, transcribed from the Louisiana Secretary of State's published results. Every one of
the 92 primary districts and 29 runoff districts was checked against the district's own
stated "Total:" line and all 121 reconcile exactly.

WHICH ROUND COUNTS. Louisiana runs a jungle primary in October where every candidate of
every party shares one ballot; anyone taking a majority wins outright, and only the
undecided seats go to a November runoff. The chamber total here is the OCTOBER PRIMARY,
because that is the round the whole electorate votes in and the only one that covers every
contested seat - the analogue of another state's general election. Summing primary and
runoff together would double-count every voter in a runoff district, and using the runoff
alone would describe just 24 of 105 House seats. The runoff rows are kept in the input file
so the choice stays reversible and so the per-district data is complete.

Not every seat appears: 65 of 105 House and 27 of 39 Senate districts were contested. The
rest were unopposed, and Louisiana declares an unopposed candidate elected without printing
a vote count, so a Louisiana chamber total is structurally well below the state's turnout.
That is a property of the system, not a gap - the note on each row says so.

Usage:
    python3 scripts/build-louisiana-2019-leg-votes.py --report
    python3 scripts/build-louisiana-2019-leg-votes.py --write
"""

import argparse
import collections
import csv
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
LA_CSV = os.path.join(REPO, "data-entry", "louisiana_2019_legislature.csv")

ROUND = "primary"
NOTE = ("October jungle primary (the round all voters cast in); unopposed seats are "
        "declared elected with no vote printed, so the total sits below statewide turnout")
SOURCE = "Louisiana SoS 2019 official results (per-district)"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

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
        if r["state_name"] != "Louisiana" or r["year"] != "2019":
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
        print(f"\nupdated {changed} Louisiana 2019 rows in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
