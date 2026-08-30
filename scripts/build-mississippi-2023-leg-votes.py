#!/usr/bin/env python3
"""Mississippi's 2023 legislative results, from the Secretary of State's recapitulation sheet.

The 2023 twin of the Louisiana scripts, and needed for the same reason: Klarner stops at
2022 and MEDSL publishes no odd-year volume. Mississippi is worse than Louisiana, though -
its Wikipedia articles contain **zero** Election box templates, so there were no district
tables to parse at all and the statewide row was a bare infobox.

SOURCE: "2023 Statewide Recapitulation Sheet" (MS SoS, Statewide Election Management
System), a 249-page PDF of every office by county, supplied by the user. `--extract` reads
it with `pdftotext -layout` and writes data-entry/mississippi_2023_legislature.csv; the
committed CSV is what every other mode reads, so the PDF is not needed again.

HOW THE RECAP IS LAID OUT, and why the parse is fussier than it looks:

  * Counties are COLUMNS, ~11 per page, so one office's row is spread across a run of pages
    with an "X" wherever the county is not in that district. The LAST page of each run adds
    a TOTAL column, and that column is what this reads - the per-county figures are only
    used to check it.
  * A district's heading can be the last thing printed on a page, with its candidate rows
    at the top of the NEXT one. 28 rows are orphaned this way. Carrying the heading forward
    is therefore required - but carrying it INDISCRIMINATELY is wrong and inflates a chamber
    badly (an early attempt put Senate 18.3% over), because the page after a page-run is the
    start of a new run and its rows belong to a different district. The rule that works:
    carry a heading forward ONLY when it was the last thing on its page with no rows after
    it, and only into the rows above the next page's first heading.
  * Headings also WRAP across lines, so they cannot be matched with a line-anchored regex.

VALIDATION. All 122 House and 52 Senate districts come out with votes and no candidate is
counted twice. Summing the per-county columns independently reproduces the printed TOTAL for
203 of the 203 rows that can be checked without the carry rule. The House Republican total
reproduces the previous statewide figure EXACTLY (447,034).

KNOWN DISCREPANCY, not resolved: for the SENATE this canvass and the old Wikipedia infobox
agree on D+R to within 2,478 votes (0.4%) but split it differently - D 215,752 vs 232,036
and R 461,514 vs 447,708. The infobox also carries oth_votes = 0 against a real 16,254, so
it is certainly incomplete; which source has the D/R split right has NOT been established.
The canvass is the official document and is used, but that disagreement is worth resolving
before the Senate row is treated as settled.

Usage:
    python3 scripts/build-mississippi-2023-leg-votes.py --extract "/path/to/recap.pdf"
    python3 scripts/build-mississippi-2023-leg-votes.py --report
    python3 scripts/build-mississippi-2023-leg-votes.py --write
    python3 scripts/build-mississippi-2023-leg-votes.py --districts
"""

import argparse
import collections
import csv
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
MS_CSV = os.path.join(REPO, "data-entry", "mississippi_2023_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "MS-2023.json")

SOURCE = "Mississippi SoS 2023 Statewide Recapitulation Sheet (per-district)"

TOTAL_COL = re.compile(r"^\s+TOTAL\s*$", re.M)
# Not line-anchored: the heading wraps across lines in the extracted layout.
HEAD = re.compile(r"State (Senate|House Of Rep)\s*(\d+)\s*-\s*District\s*(\d+)")
CAND = re.compile(r"^\s*(\S.*?)\s{2,}(Democrat|Republican|Independent|Libertarian|Green|"
                  r"Constitution|Reform|No Party|Nonpartisan)\s+(.+?)\s*$")
BUCKET = {"Democrat": "D", "Republican": "R"}


def extract(pdf_path):
    """Parse the recap PDF into {(chamber, district): Counter(D/R/O)}."""
    out = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                         capture_output=True, text=True, check=True).stdout
    res = collections.defaultdict(collections.Counter)
    seen = collections.defaultdict(set)
    carry = None
    for page in out.split("\f"):
        if not TOTAL_COL.search(page):
            continue
        heads = [(m.end(), ("Senate" if m.group(1) == "Senate" else "House", str(int(m.group(3)))))
                 for m in HEAD.finditer(page)]
        cur = carry
        tail = page[heads[-1][0]:] if heads else ""
        # A heading with nothing after it owns the rows at the top of the next page.
        carry = heads[-1][1] if heads and not any(CAND.match(l) for l in tail.split("\n")) else None
        pos = hi = 0
        for line in page.split("\n"):
            start = pos
            pos += len(line) + 1
            while hi < len(heads) and heads[hi][0] <= start:
                cur = heads[hi][1]
                hi += 1
            c = CAND.match(line)
            if not c or cur is None:
                continue
            nums = re.findall(r"\b\d[\d,]*\b", c.group(3))
            if not nums:
                continue
            name = c.group(1).strip()
            if name in seen[cur]:
                sys.stderr.write(f"WARNING: {cur} lists {name} twice\n")
                continue
            seen[cur].add(name)
            # Last number on the row is the TOTAL column; the rest are per-county.
            res[cur][BUCKET.get(c.group(2), "O")] += int(nums[-1].replace(",", ""))
    return res


def write_csv(res):
    rows = []
    for (chamber, dist), c in sorted(res.items(), key=lambda kv: (kv[0][0], int(kv[0][1]))):
        rows.append([chamber, dist, c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    with open(MS_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        w.writerows(rows)
    print(f"wrote {len(rows)} districts -> {MS_CSV}")


def load_csv():
    agg = collections.defaultdict(collections.Counter)
    with open(MS_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            c = agg[(r["chamber"], r["district"])]
            c["D"] += int(r["dem_votes"])
            c["R"] += int(r["rep_votes"])
            c["O"] += int(r["oth_votes"])
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
        payload = {}
        for chamber in ("House", "Senate"):
            ds = {d: c for (ch, d), c in agg.items() if ch == chamber}
            payload["senate" if chamber == "Senate" else "house"] = {
                "source": SOURCE,
                "districts": {
                    d: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                        "totalVotes": c["D"] + c["R"] + c["O"]}
                    for d, c in sorted(ds.items(), key=lambda kv: int(kv[0]))
                },
            }
        os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
        with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1)
            fh.write("\n")
        for ch, b in payload.items():
            print(f"{ch:7s} {len(b['districts']):3d} districts")
        print(f"wrote {DISTRICTS_JSON}")
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "Mississippi" or r["year"] != "2023":
            continue
        ds = [c for (ch, _d), c in agg.items() if ch == r["type"]]
        if not ds:
            continue
        d = sum(c["D"] for c in ds)
        rp = sum(c["R"] for c in ds)
        o = sum(c["O"] for c in ds)
        total = d + rp + o
        print(f"{r['type']:7s} {len(ds):3d} districts   "
              f"was D={int(r['dem_votes']):>8,} R={int(r['rep_votes']):>8,} O={int(r['oth_votes'] or 0):>7,} T={int(r['total_votes']):>9,}   "
              f"now D={d:>8,} R={rp:>8,} O={o:>7,} T={total:>9,}")
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
        print(f"\nupdated {changed} Mississippi 2023 rows in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
