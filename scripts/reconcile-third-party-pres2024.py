#!/usr/bin/env python3
"""
Final reconciliation pass: make each chamber's TOTAL vote count match the certified statewide 2024
presidential total, by adjusting only the third-party/write-in component of each district.

Why this is a separate pass. After the sourcing pipelines run, every chamber's Dem and Rep sums
already reproduce `data-entry/president_past_results.csv` (the two reference files agree on those,
so per-county scaling can be trusted). The remaining Agg-Total-vs-Total differences are entirely in
the "other" bucket, where the sources genuinely disagree about what counts:

  * New York's DRA totals carry 105,931 other votes against 64,401 certified - fusion-party lines
    counted separately.
  * Florida, Illinois and Texas run the other way, their precinct files reporting fewer write-ins
    than the certified statewide return.
  * `data/county_presidential_results_2008_2024.csv`'s own `oth_2024` column is a NARROWER quantity
    than the statewide file's (total - dem - rep): it is 0 for all 62 New York counties and 20-35%
    low in IL/VA/NC/PA, so it cannot be used as a per-county target for this.

So third-party votes are reconciled here, once, against the statewide figure: each district's other
votes are scaled by one statewide factor and `totalVotes` recomputed as dem + rep + other. Dem and
Rep are never touched, and neither are the per-district percentages' relative standing - only the
denominator moves, by well under a point of margin.

SAFETY: a chamber whose Dem or Rep sum is NOT already within `--tolerance` of certified is SKIPPED
and reported, because there the total difference reflects a real sourcing gap that this pass must
not paper over. Run it after every future sourcing change; it is idempotent.

Usage:
  python3 scripts/reconcile-third-party-pres2024.py --dry-run
  python3 scripts/reconcile-third-party-pres2024.py [STATE ...]
Then rerun scripts/build-state-leg-pres2024.mjs.
"""

import argparse
import csv
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")
CERTIFIED = os.path.join(ROOT, "data-entry", "president_past_results.csv")


def certified_2024():
    out = {}
    with open(CERTIFIED) as f:
        for r in csv.DictReader(f):
            if r["year"] == "2024":
                out[r["state_abbr"]] = (int(r["dem_votes"]), int(r["rep_votes"]), int(r["total_votes"]))
    return out


def largest_remainder(values):
    floors = {k: int(v) for k, v in values.items()}
    short = int(round(sum(values.values()))) - sum(floors.values())
    for k in sorted(values, key=lambda k: values[k] - floors[k], reverse=True)[:max(short, 0)]:
        floors[k] += 1
    return floors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*", help="state abbrs (default: all)")
    ap.add_argument("--tolerance", type=int, default=500,
                    help="max |Dem or Rep| deviation from certified for a chamber to be reconciled")
    ap.add_argument("--reconcile-major", action="store_true",
                    help="also scale Dem/Rep to the certified statewide totals, for a chamber whose "
                         "precincts all matched but whose source disagrees slightly with certified")
    ap.add_argument("--major-cap", type=int, default=5000,
                    help="max |Dem or Rep| votes --reconcile-major may move (also capped at 0.5%%)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cert = certified_2024()
    states = [s.upper() for s in args.states] or sorted(
        f[:-5] for f in os.listdir(DATA_DIR) if f.endswith(".json"))

    changed, skipped, clean = [], [], 0
    for abbr in states:
        path = os.path.join(DATA_DIR, f"{abbr}.json")
        if not os.path.exists(path) or abbr not in cert:
            continue
        data = json.load(open(path))
        cd, cr, ct = cert[abbr]
        target_oth = ct - cd - cr
        dirty = False
        for chamber, districts in data.items():
            usable = {k: v for k, v in districts.items()
                      if v.get("demVotes") is not None and v.get("totalVotes") is not None}
            if not usable:
                continue
            dem = sum(v["demVotes"] for v in usable.values())
            rep = sum(v["repVotes"] for v in usable.values())
            oth = sum(v["totalVotes"] - v["demVotes"] - v["repVotes"] for v in usable.values())
            if abs(dem - cd) > args.tolerance or abs(rep - cr) > args.tolerance:
                skipped.append(f"{abbr} {chamber}: Dem {dem - cd:+,} Rep {rep - cr:+,} vs certified "
                               f"- real sourcing gap, third-party NOT reconciled")
                continue
            # Optional final polish for a chamber whose precincts ALL matched but whose source file
            # simply disagrees slightly with the certified statewide return - Oregon's MEDSL file is
            # 284 Dem short and 361 Rep long statewide, and its county reference file cannot be used
            # to place the difference (that file is itself 12,190 Dem short of the statewide one,
            # undercounting Clackamas/Deschutes/Multnomah/Lane). One uniform statewide factor moves
            # each district's margin by ~0.03 points. Deliberately opt-in and hard-capped, so it can
            # only ever close a rounding-scale difference, never substitute for finding a real gap.
            if args.reconcile_major:
                for field, total, target in (("demVotes", dem, cd), ("repVotes", rep, cr)):
                    if total <= 0 or total == target:
                        continue
                    if abs(total - target) > args.major_cap or abs(total - target) / target > 0.005:
                        skipped.append(f"{abbr} {chamber}: {field} off by {total - target:+,} - too "
                                       f"large for --reconcile-major, find the real cause")
                        continue
                    new_v = largest_remainder({k: v[field] * target / total for k, v in usable.items()})
                    for k, v in usable.items():
                        v[field] = new_v[k]
                    changed.append(f"{abbr} {chamber}: {field} {total:,} -> {target:,} "
                                   f"(statewide x{target / total:.5f})")
                    dirty = True
                dem = sum(v["demVotes"] for v in usable.values())
                rep = sum(v["repVotes"] for v in usable.values())
                oth = sum(v["totalVotes"] - v["demVotes"] - v["repVotes"] for v in usable.values())
            if oth <= 0 or target_oth <= 0 or abs(oth - target_oth) <= 1:
                if dirty:
                    # Dem/Rep moved above but the third-party block below (which normally recomputes
                    # them) will not run - refresh the derived percentages here so they stay in sync.
                    for v in usable.values():
                        t = v["totalVotes"]
                        v["demPct"] = round(v["demVotes"] / t * 100, 1)
                        v["repPct"] = round(v["repVotes"] / t * 100, 1)
                        v["margin"] = round(v["repPct"] - v["demPct"], 1)
                else:
                    clean += 1
                continue
            factor = target_oth / oth
            new_oth = largest_remainder(
                {k: (v["totalVotes"] - v["demVotes"] - v["repVotes"]) * factor for k, v in usable.items()})
            for k, v in usable.items():
                v["totalVotes"] = v["demVotes"] + v["repVotes"] + new_oth[k]
                t = v["totalVotes"]
                v["demPct"] = round(v["demVotes"] / t * 100, 1)
                v["repPct"] = round(v["repVotes"] / t * 100, 1)
                v["margin"] = round(v["repPct"] - v["demPct"], 1)
            changed.append(f"{abbr} {chamber}: third-party {oth:,} -> {target_oth:,} (x{factor:.4f})")
            dirty = True
        # Always finish by recomputing every district's derived percentages from its FINAL integer
        # vote counts. Several pipelines compute demPct/repPct from the pre-rounding floats, which
        # leaves a district's displayed margin up to 0.1 point out of step with its displayed votes
        # (32 districts across AK/ME/others). Cheap, idempotent, and keeps the table self-consistent.
        for districts in data.values():
            for v in districts.values():
                t = v.get("totalVotes")
                if not t or v.get("demVotes") is None:
                    continue
                dp = round(v["demVotes"] / t * 100, 1)
                rp = round(v["repVotes"] / t * 100, 1)
                if (dp, rp) != (v.get("demPct"), v.get("repPct")):
                    dirty = True
                v["demPct"], v["repPct"], v["margin"] = dp, rp, round(rp - dp, 1)
        if dirty and not args.dry_run:
            with open(path, "w") as f:
                json.dump(data, f, indent=2, sort_keys=True)

    for line in changed:
        print(line)
    if skipped:
        print("\nSKIPPED (Dem/Rep not yet matching certified - fix the source first):")
        for line in skipped:
            print("  " + line)
    print(f"\n{len(changed)} chamber(s) reconciled, {clean} already matching, {len(skipped)} skipped"
          + (" (dry run, nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
