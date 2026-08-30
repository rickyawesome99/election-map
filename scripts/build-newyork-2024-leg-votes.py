#!/usr/bin/env python3
"""New York's 2024 legislative results, from the State Board of Elections canvass.

New York was the last chamber-year pair whose district sum would not reconcile. MEDSL's 2024
file - both the bundled volume and the per-state one, which are byte-identical here - leaves
**12.6% of New York's legislative vote on rows carrying no district at all** (Suffolk County
alone accounts for 769,560 per chamber, with Broome, Rensselaer, Oswego and Sullivan behind
it) and reaches only 140 of 150 Assembly and 59 of 63 Senate districts. This canvass replaces
it: all 150 and all 63.

SOURCE: "2024-11-05 Presidential General" (NY State Board of Elections, results.elections.ny.gov
document 476), the official canvass with a block per district. `--extract` reads it with
`pdftotext -layout` and writes data-entry/new_york_2024_legislature.csv.

LAYOUT, and the one thing that makes it tractable:

  * A district block lists one row per candidate PER PARTY LINE - New York's fusion ballot
    means a candidate appears under DEM and WOR, or REP and CON, on separate rows. Each row's
    "Total Votes by Party" is the figure to take; the "Total Votes by Candidate" column that
    appears on a candidate's first row is their combined total and would double-count.
  * A multi-county district has ONE COLUMN PER COUNTY before those totals, so the number of
    leading values varies by district and the header can wrap unpredictably. Counting "Part of
    <county>" headers is not reliable. Instead the split is found by IDENTITY: "Total Votes by
    Party" is the sum of the county figures before it, so the first k where
    sum(nums[:k]) == nums[k] locates it. That validates itself - 810 of the 814 candidate rows
    resolve this way, and the four that do not are two-county rows whose printed figures
    disagree by a single vote, where the second-to-last column is taken instead.
  * "Blank" and "Void" are not votes for anyone and are excluded; "Scattering" is a real vote
    and goes to Other. Assembly 1 checks out: 62,523 candidate votes + 3,555 blank + 25 void =
    the printed 66,103 Total Votes by County.

Fusion lines are bucketed by the PARTY LINE, not the candidate - a Working Families row counts
Other, not Democratic - which is the convention MEDSL's own New York figures use, so the
corrected statewide rows stay comparable with the ones they replace.

Usage:
    python3 scripts/build-newyork-2024-leg-votes.py --extract "/path/to/2024-11-05_Presidential_General.pdf"
    python3 scripts/build-newyork-2024-leg-votes.py --report
    python3 scripts/build-newyork-2024-leg-votes.py --write
    python3 scripts/build-newyork-2024-leg-votes.py --districts
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
NY_CSV = os.path.join(REPO, "data-entry", "new_york_2024_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "NY-2024.json")

SOURCE = "New York State Board of Elections 2024 canvass (per-district)"

HEAD = re.compile(r"^(Member of Assembly|State Senator)\s+(\d+)(?:st|nd|rd|th)\s+"
                  r"(?:Assembly|Senate) District\s+-\s+General", re.M)
ROW = re.compile(r"^(?P<label>.+?)\s{2,}(?P<nums>[\d,]+(?:\s+[\d,]+)*)$")
PARTY = re.compile(r"\(([A-Z]{2,4})\)\s*$")
BUCKET = {"DEM": "D", "REP": "R"}


def _n(s):
    return int(s.replace(",", ""))


def total_by_party(nums):
    """(value, exact). Counties come first and their sum IS the Total Votes by Party column."""
    for k in range(1, len(nums)):
        if sum(nums[:k]) == nums[k]:
            return nums[k], True
    # Four rows in the 2024 canvass are off by one vote between the county columns and their
    # stated total; the second-to-last column is the party total there.
    return (nums[-2] if len(nums) >= 2 else nums[-1]), False


def extract(pdf_path):
    # Headings are preceded by a form feed, so a line-anchored match needs it turned into a
    # newline first or every district heading is invisible.
    txt = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                         capture_output=True, text=True, check=True).stdout.replace("\f", "\n")
    heads = list(HEAD.finditer(txt))
    res = collections.defaultdict(collections.Counter)
    rows = exact = 0
    for i, h in enumerate(heads):
        chamber = "House" if h.group(1) == "Member of Assembly" else "Senate"
        dist = str(int(h.group(2)))
        blk = txt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(txt)]
        for ln in blk.split("\n"):
            m = ROW.match(ln.strip())
            if not m:
                continue
            label = m.group("label").strip()
            pm = PARTY.search(label)
            scattering = label.lower().startswith("scattering")
            if not pm and not scattering:
                continue          # Blank and Void are not votes for anyone
            nums = [_n(x) for x in m.group("nums").split()]
            rows += 1
            v, ok = total_by_party(nums)
            exact += ok
            res[(chamber, dist)][BUCKET.get(pm.group(1), "O") if pm else "O"] += v
    print(f"district blocks {len(heads)} | candidate rows {rows} | "
          f"county-sum identity confirmed {exact}")
    for ch, size in (("House", 150), ("Senate", 63)):
        have = {int(k[1]) for k in res if k[0] == ch}
        missing = sorted(set(range(1, size + 1)) - have)
        print(f"   {ch}: {len(have)}/{size}" + (f" missing {missing}" if missing else ""))
    return res


def write_csv(res):
    with open(NY_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        for (ch, d), c in sorted(res.items(), key=lambda kv: (kv[0][0], int(kv[0][1]))):
            w.writerow([ch, d, c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    print(f"wrote {len(res)} districts -> {NY_CSV}")


def load_csv():
    agg = collections.defaultdict(dict)
    with open(NY_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            agg[r["chamber"]][r["district"]] = collections.Counter(
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
        payload = {}
        for chamber, ds in agg.items():
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
        if r["state_name"] != "New York" or r["year"] != "2024":
            continue
        ds = agg.get(r["type"])
        if not ds:
            continue
        d = sum(c["D"] for c in ds.values())
        rp = sum(c["R"] for c in ds.values())
        o = sum(c["O"] for c in ds.values())
        total = d + rp + o
        print(f"{r['type']:7s} {len(ds):3d} districts   "
              f"was D={int(r['dem_votes']):>9,} R={int(r['rep_votes']):>9,} O={int(r['oth_votes'] or 0):>7,} T={int(r['total_votes']):>9,}   "
              f"now D={d:>9,} R={rp:>9,} O={o:>7,} T={total:>9,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        r["note"] = ""
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} New York 2024 rows in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
