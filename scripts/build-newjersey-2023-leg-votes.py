#!/usr/bin/env python3
"""New Jersey's 2023 General Assembly results, from the Division of Elections' official list.

This settles a contradiction that blocked the chamber-year for two passes. Wikipedia's
article disagreed with ITSELF: its per-district tables summed to R 1,486,690 while its own
infobox said R 1,575,074, a gap of ~89,000 that the usual missing-Other-bucket explanation
could not account for. The district tables were internally consistent and districts 33 and
35 were verified to have had no Republican candidate at all, so the parse was faithful -
but with no third source there was no way to say which Wikipedia figure was right, and the
district data was rejected rather than guessed at.

THE CANVASS SETTLES IT: the district tables were right and the infobox was wrong. Official
R is 1,485,075, within 1,615 of the district-table sum and ~90,000 below the infobox. The
other-party total matches the district tables EXACTLY at 15,456.

SOURCE: "2023 Official General Results - General Assembly" (NJ Division of Elections), a
45-page PDF. `--extract` reads it with `pdftotext -layout` and writes
data-entry/new_jersey_2023_legislature.csv; the committed CSV is what every other mode
reads, so the PDF is not needed again.

LAYOUT. One block per district, headed by a SPELLED-OUT ordinal ("Thirty-Eighth Legislative
District:"). Inside, each candidate has a header line, one row per county carrying that
county's vote and the party in caps, and a "Total" line; the district block then ends with a
second "Total" that is the district's own. Two things make the parse fussy:

  * A county row's name and party can be separated by a SINGLE space when the county name
    fills the column ("CUMBERLAND REPUBLICAN 9,814"), so they cannot be split on whitespace
    runs. The party is recovered by stripping a known New Jersey county name from the front.
  * The district heading REPEATS after a page break, so any running per-district tally has
    to accumulate by district number rather than reset on the heading.

New Jersey elects TWO Assembly members per district and every candidate is counted, so the
chamber total is about twice the number of voters. That is the same convention Klarner and
the statewide rows use for multi-member chambers - do not "correct" it.

VALIDATION: all 40 districts' candidate sums equal the PDF's own printed district totals,
and 159 of 160 candidate totals equal the sum of their county rows (the one exception is a
page-break artifact whose district still reconciles).

Usage:
    python3 scripts/build-newjersey-2023-leg-votes.py --extract "/path/to/results.pdf"
    python3 scripts/build-newjersey-2023-leg-votes.py --report
    python3 scripts/build-newjersey-2023-leg-votes.py --write
    python3 scripts/build-newjersey-2023-leg-votes.py --districts
"""

import argparse
import collections
import csv
import json
import os
import re
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
NJ_CSV = os.path.join(REPO, "data-entry", "new_jersey_2023_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "NJ-2023.json")

SOURCE = "New Jersey Division of Elections 2023 official results (per-district)"

ORDINALS = {
    "First": 1, "Second": 2, "Third": 3, "Fourth": 4, "Fifth": 5, "Sixth": 6, "Seventh": 7,
    "Eighth": 8, "Ninth": 9, "Tenth": 10, "Eleventh": 11, "Twelfth": 12, "Thirteenth": 13,
    "Fourteenth": 14, "Fifteenth": 15, "Sixteenth": 16, "Seventeenth": 17, "Eighteenth": 18,
    "Nineteenth": 19, "Twentieth": 20, "Twenty-First": 21, "Twenty-Second": 22,
    "Twenty-Third": 23, "Twenty-Fourth": 24, "Twenty-Fifth": 25, "Twenty-Sixth": 26,
    "Twenty-Seventh": 27, "Twenty-Eighth": 28, "Twenty-Ninth": 29, "Thirtieth": 30,
    "Thirty-First": 31, "Thirty-Second": 32, "Thirty-Third": 33, "Thirty-Fourth": 34,
    "Thirty-Fifth": 35, "Thirty-Sixth": 36, "Thirty-Seventh": 37, "Thirty-Eighth": 38,
    "Thirty-Ninth": 39, "Fortieth": 40,
}
# Longest first, so "CAPE MAY" is stripped before "CAPE" could partially match anything.
COUNTIES = sorted([
    "ATLANTIC", "BERGEN", "BURLINGTON", "CAMDEN", "CAPE MAY", "CUMBERLAND", "ESSEX",
    "GLOUCESTER", "HUDSON", "HUNTERDON", "MERCER", "MIDDLESEX", "MONMOUTH", "MORRIS",
    "OCEAN", "PASSAIC", "SALEM", "SOMERSET", "SUSSEX", "UNION", "WARREN",
], key=len, reverse=True)

DIST = re.compile(r"^([A-Za-z-]+) Legislative District:")
TOTAL = re.compile(r"\bTotal\s+([\d,]+)\s*$")
ROW = re.compile(r"^\s{20,}(.*?)\s{2,}([\d,]+)\s*$")
BUCKET = {"DEMOCRATIC": "D", "REPUBLICAN": "R"}


def extract(pdf_path):
    txt = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                         capture_output=True, text=True, check=True).stdout
    res = collections.defaultdict(collections.Counter)
    printed = collections.defaultdict(int)
    dist = cparty = None
    csum = 0
    ck = [0, 0]

    for ln in txt.split("\n"):
        m = DIST.match(ln.strip())
        if m:
            # The heading repeats after a page break; accumulate by number, never reset.
            dist = ORDINALS.get(m.group(1))
            cparty, csum = None, 0
            continue
        t = TOTAL.search(ln)
        if t and dist:
            v = int(t.group(1).replace(",", ""))
            # The district's own total is the largest Total in its block.
            printed[dist] = max(printed[dist], v)
            if cparty is not None:
                ck[0] += 1
                ck[1] += (csum == v)
                res[dist][BUCKET.get(cparty, "O")] += v
                cparty, csum = None, 0
            continue
        r = ROW.match(ln)
        if r and dist:
            g = r.group(1).strip()
            for c in COUNTIES:
                if g.startswith(c):
                    cparty = g[len(c):].strip() or cparty
                    csum += int(r.group(2).replace(",", ""))
                    break

    ok = sum(1 for d, v in res.items() if sum(v.values()) == printed[d])
    print(f"{len(res)} districts; {ok} match the PDF's own printed district total")
    print(f"{ck[1]}/{ck[0]} candidate totals equal the sum of their county rows")
    if ok != len(res):
        print("WARNING: a district does not reconcile - do not write without checking")
    return res


def write_csv(res):
    with open(NJ_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        for d, c in sorted(res.items()):
            w.writerow(["House", d, c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    print(f"wrote {len(res)} districts -> {NJ_CSV}")


def load_csv():
    agg = {}
    with open(NJ_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            agg[r["district"]] = collections.Counter(
                D=int(r["dem_votes"]), R=int(r["rep_votes"]), O=int(r["oth_votes"]))
    return agg


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--extract", metavar="PDF")
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--districts", action="store_true")
    args = ap.parse_args()

    if args.extract:
        write_csv(extract(args.extract))
        return

    agg = load_csv()
    if args.districts:
        payload = {
            "house": {
                "source": SOURCE,
                "districts": {
                    d: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                        "totalVotes": c["D"] + c["R"] + c["O"]}
                    for d, c in sorted(agg.items(), key=lambda kv: int(kv[0]))
                },
            }
        }
        os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
        existing = json.load(open(DISTRICTS_JSON, encoding="utf-8")) if os.path.exists(DISTRICTS_JSON) else {}
        existing.update(payload)
        with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
            json.dump(existing, fh, indent=1)
            fh.write("\n")
        print(f"house   {len(agg):3d} districts -> {DISTRICTS_JSON}")
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "New Jersey" or r["year"] != "2023" or r["type"] != "House":
            continue
        d = sum(c["D"] for c in agg.values())
        rp = sum(c["R"] for c in agg.values())
        o = sum(c["O"] for c in agg.values())
        total = d + rp + o
        print(f"House   {len(agg):3d} districts   "
              f"was D={int(r['dem_votes']):>9,} R={int(r['rep_votes']):>9,} O={int(r['oth_votes'] or 0):>6,} T={int(r['total_votes']):>10,}   "
              f"now D={d:>9,} R={rp:>9,} O={o:>6,} T={total:>10,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} New Jersey 2023 House row in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
