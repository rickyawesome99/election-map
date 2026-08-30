#!/usr/bin/env python3
"""Phase 3 last resort: per-district results parsed from Wikipedia's district tables.

Klarner covers 2016-2022 and MEDSL covers 2024, which leaves two kinds of hole this script
is for:

  * the ODD-YEAR states - Louisiana, Mississippi, New Jersey and Virginia elect in 2023 and
    2025, past Klarner's end, and MEDSL publishes no odd-year volume at all;
  * 2024 chambers MEDSL cannot answer - Oregon records no usable party on a quarter of its
    vote, and neither MEDSL volume fixes it (the per-state file is the same data).

It reuses scripts/build-state-leg-votes-from-wikipedia.py wholesale via importlib - the
wikitext fetch and cache, the party bucketing, and above all `general_only`, which is the
function that keeps a primary from being summed in alongside the general. That script's
docstring documents the article-structure traps; they all still apply here, because this is
the same parse with the per-district totals kept instead of thrown away.

WHAT IS NEW: the district identity. `DISTRICT_HEAD_ANY` already finds each district's
heading, so this pulls the number back out of it - headings run from a plain
"=== District 1 ===" to Oregon's "=== [[Oregon's 1st House district|District 1]] ===", and
the number is taken from the LAST "District N"/"LD N" in the heading so a wikilink target
cannot be mistaken for the district itself.

Wikipedia is the weakest source in this project and it is treated that way: every
chamber-year is checked against its statewide row in state_leg.csv and a district set that
does not reconcile is REPORTED AND DROPPED rather than written, unless --force. A
transcription this indirect is worth having only when it agrees with something.

Usage:
    python3 scripts/build-state-leg-results-from-wikipedia.py --report
    python3 scripts/build-state-leg-results-from-wikipedia.py --targets OR:2024 --report
    python3 scripts/build-state-leg-results-from-wikipedia.py --write
"""

import argparse
import collections
import csv
import importlib.util
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")

SOURCE_LABEL = "Wikipedia district tables"

# The chamber-years with no district data from any stronger source. Nebraska is deliberately
# absent: its ballot is nonpartisan and party has to come from the member lists that
# scripts/build-nebraska-leg-votes.py already assembles, so it is that script's job.
DEFAULT_TARGETS = [
    ("LA", 2023), ("MS", 2023), ("NJ", 2023), ("VA", 2023),
    ("NJ", 2025), ("VA", 2025),
    ("OR", 2024), ("AZ", 2024), ("IA", 2024),
]

# Tolerance on the district sum vs the statewide row. Wikipedia transcriptions differ from a
# canvass by small amounts (a write-in line dropped, a recount not reflected); a difference
# bigger than this means the parse found the wrong thing, not that the source is imprecise.
MAX_DIFF = 0.02

# Chamber-years that already have district data from a stronger source are left alone. The one
# exception is recorded here with its reason: Arizona's House comes out BETTER from Wikipedia
# than from MEDSL, which carries only 28 of its 30 districts and leaves 13.6% of the chamber's
# vote on rows with no district at all. Overriding costs the audit an independently-sourced row
# (AZ's statewide figure is itself a Wikipedia infobox), which is a real loss - completeness of
# the district set wins because Phase 4 has to colour all 30 districts on a map.
# Chamber-years whose district sum exceeds MAX_DIFF for a reason that has been run down, where
# the DISTRICT data is the better of the two. Each entry names the evidence; without one, an
# over-tolerance parse stays rejected.
ACCEPT_OVER_TOLERANCE = {
    ("OR", 2024, "Senate"): (
        "R and O match the statewide row EXACTLY (+0, +0) and only D differs, by 54,001. That "
        "row's source is 'Wikipedia district tables', i.e. the same article parsed by the shared "
        "CAND_BOX - which misses boxes putting `party` directly before `votes`. The statewide "
        "figure is undercounted on D; this parse is the corrected one."
    ),
    ("IA", 2024, "House"): (
        "R matches the statewide row EXACTLY (+0) and D within 1,000. The whole 3.4% is the "
        "47,376-vote Other bucket, which that row cannot carry - it is a Wikipedia infobox and "
        "its own convention is major parties only (oth_votes = 0)."
    ),
}

OVERRIDE_EXISTING = {
    ("AZ", 2024, "House"): "MEDSL has only 28 of 30 districts and 13.6% of the vote undistricted",
}


def _load_wiki_module():
    path = os.path.join(REPO, "scripts", "build-state-leg-votes-from-wikipedia.py")
    spec = importlib.util.spec_from_file_location("wiki_statewide", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


W = _load_wiki_module()

# CAND_BOX in the shared module requires ANOTHER parameter between `party` and `votes`
# (it consumes the pipe after the party value, then demands a further pipe before `votes`).
# Most articles order the template `party | candidate | votes`, so the candidate parameter
# satisfies it - but Louisiana writes `candidate | party | votes`, leaving party directly
# before votes, and every one of its 105 district boxes silently failed to match. This is the
# same pattern with that pipe turned into a lookahead so it stays available.
#
# Deliberately overridden HERE rather than fixed in the shared module: that module produced
# the statewide figures already sitting in state_leg.csv, and widening its regex would
# silently change previously-derived rows. The shared bug is real and worth fixing on its own,
# with those rows re-verified.
CAND_BOX = re.compile(
    r"\{\{\s*Election box (?:winning )?candidate[^}]*?\|\s*party\s*=\s*([^|\n}]+?)\s*(?=\|)"
    r"[^}]*?\|\s*votes\s*=\s*([\d,]+)", re.IGNORECASE | re.DOTALL)

# The district number inside a heading. Taken from the LAST match so that Oregon's
# "[[Oregon's 1st House district|District 1]]" resolves to 1 rather than to the link target.
HEAD_NUM = re.compile(r"(?:District|LD)\s*(\d+)", re.IGNORECASE)


def parse_district_results(wt, min_districts=5):
    """-> {district: {"D":n,"R":n,"O":n}} from a chamber-year article's district tables."""
    heads = list(W.DISTRICT_HEAD_ANY.finditer(wt))
    if len(heads) < min_districts:
        return None
    out = {}
    for i, h in enumerate(heads):
        nums = HEAD_NUM.findall(h.group(0))
        if not nums:
            continue
        key = str(int(nums[-1]))
        block = wt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(wt)]
        block = W.general_only(block)
        c = out.setdefault(key, {"D": 0, "R": 0, "O": 0})
        for party, votes in CAND_BOX.findall(block):
            c[W.bucket(party)] += int(votes.replace(",", ""))
        for votes in W.WRITEIN_BOX.findall(block):
            c["O"] += int(votes.replace(",", ""))
    # A heading with no result boxes under it is a district the article did not tabulate.
    out = {k: v for k, v in out.items() if sum(v.values()) > 0}
    return out or None


def existing_source(po, year, chamber):
    """The source already backing this chamber-year's district data, if any."""
    path = os.path.join(OUT_DIR, f"{po}-{year}.json")
    if not os.path.exists(path):
        return None
    block = json.load(open(path, encoding="utf-8")).get("senate" if chamber == "Senate" else "house")
    return block["source"] if block else None


def load_statewide():
    out = {}
    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                out[(r["state_name"], int(r["year"]), r["type"])] = r
            except ValueError:
                continue
    return out


def abbr_to_name():
    text = open(os.path.join(REPO, "data", "statesData.ts"), encoding="utf-8").read()
    return {m.group(2): m.group(1)
            for m in re.finditer(r'name: "([^"]+)",\s*abbr: "([A-Z]{2})"', text)}


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    ap.add_argument("--targets", help="comma-separated ABBR:YEAR, e.g. OR:2024,VA:2023")
    ap.add_argument("--force", action="store_true",
                    help="write even a chamber-year that fails the statewide check")
    args = ap.parse_args()

    targets = DEFAULT_TARGETS
    if args.targets:
        targets = []
        for t in args.targets.split(","):
            po, year = t.split(":")
            targets.append((po.upper(), int(year)))

    names = abbr_to_name()
    statewide = load_statewide()
    kept, failed, skipped = {}, [], []

    print(f"{'ST':3s} {'YEAR':5s} {'CHAMBER':8s} {'DISTS':>6s} {'DIST SUM':>11s} {'STATEWIDE':>11s} {'DIFF':>9s}")
    for po, year in targets:
        state = names.get(po)
        if not state:
            continue
        for chamber in ("House", "Senate"):
            sw = statewide.get((state, year, chamber))
            if sw is None:
                continue
            # Never overwrite district data already produced by a stronger source.
            existing = existing_source(po, year, chamber)
            if existing and (po, year, chamber) not in OVERRIDE_EXISTING:
                skipped.append((po, year, chamber, f"already sourced from {existing}"))
                continue
            for title in W.titles_for(state, chamber, year):
                wt = W.wikitext(title)
                if not wt:
                    continue
                districts = parse_district_results(wt)
                if districts:
                    break
            else:
                districts = None
            if not districts:
                failed.append((po, year, chamber, "no district tables found in any article title"))
                continue

            tot = sum(sum(c.values()) for c in districts.values())
            swt = int(sw["total_votes"]) if sw["total_votes"].strip() else None
            diff = None if swt is None else tot - swt
            rel = None if not swt else diff / swt
            ds = "—" if diff is None else f"{diff:+,}"
            print(f"{po:3s} {year:<5d} {chamber:8s} {len(districts):6d} {tot:11,} "
                  f"{(swt if swt is not None else 0):11,} {ds:>9s}")
            if (rel is None or abs(rel) > MAX_DIFF) and (po, year, chamber) not in ACCEPT_OVER_TOLERANCE:
                failed.append((po, year, chamber,
                               f"district sum {tot:,} vs statewide {swt:,} "
                               f"({rel:+.1%})" if swt else "no statewide total to check against"))
                if not args.force:
                    continue
            kept[(po, year, chamber)] = districts

    print(f"\n{len(kept)} chamber-year(s) usable, {len(failed)} rejected, {len(skipped)} left alone:")
    for po, year, chamber, why in failed:
        print(f"  REJECTED {po} {year} {chamber}: {why}")
    for po, year, chamber, why in skipped:
        print(f"  SKIPPED  {po} {year} {chamber}: {why}")
    for key, why in ACCEPT_OVER_TOLERANCE.items():
        if key in kept:
            print(f"  ACCEPTED {key[0]} {key[1]} {key[2]} over tolerance: {why}")
    for key, why in OVERRIDE_EXISTING.items():
        if key in kept:
            print(f"  OVERRODE {key[0]} {key[1]} {key[2]}: {why}")

    if args.write and kept:
        os.makedirs(OUT_DIR, exist_ok=True)
        by_file = collections.defaultdict(dict)
        for (po, year, chamber), districts in kept.items():
            by_file[(po, year)]["senate" if chamber == "Senate" else "house"] = {
                "source": SOURCE_LABEL,
                "districts": {
                    k: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                        "totalVotes": c["D"] + c["R"] + c["O"]}
                    for k, c in sorted(districts.items(), key=lambda kv: int(kv[0]))
                },
            }
        for (po, year), payload in sorted(by_file.items()):
            fp = os.path.join(OUT_DIR, f"{po}-{year}.json")
            existing = json.load(open(fp, encoding="utf-8")) if os.path.exists(fp) else {}
            existing.update(payload)
            with open(fp, "w", encoding="utf-8") as fh:
                json.dump(existing, fh, indent=1)
                fh.write("\n")
        print(f"\nwrote {len(by_file)} file(s) to {OUT_DIR}")


if __name__ == "__main__":
    main()
