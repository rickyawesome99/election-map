#!/usr/bin/env python3
"""Historical generic-ballot polls (2018–2024 cycles) from the FiveThirtyEight poll
archive → data-entry/generic_ballot_polls_history.csv.

Source: projects.fivethirtyeight.com/polls/data/generic_ballot_polls_historical.csv (dark
since March 2025; the Wayback copy web.archive.org/web/2025id_/<url> works). Pass a
directory holding that file, or let the script download it next to the race-poll
archives (data-entry/fivethirtyeight/, not committed).

One row per poll question with both a DEM and a REP share. Feeds
scripts/forwardBacktest.ts (--polls): the generic ballot as of each race poll's field
date, which is what the poll-aging shift (lib/racePollAverage.ts) moves a poll by.

Usage: python3 scripts/build-generic-ballot-history.py [dir-with-538-csvs]
"""
import csv, os, sys, urllib.request, datetime, collections
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data-entry", "generic_ballot_polls_history.csv")
NAME = "generic_ballot_polls_historical"
UA = "election-map-research/1.0 (generic ballot history)"

src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "data-entry", "fivethirtyeight")
os.makedirs(src_dir, exist_ok=True)
src = os.path.join(src_dir, NAME + ".csv")
if not os.path.exists(src):
    url = f"https://web.archive.org/web/2025id_/https://projects.fivethirtyeight.com/polls/data/{NAME}.csv"
    print("downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    open(src, "wb").write(urllib.request.urlopen(req, timeout=120).read())

def iso(d):  # "11/4/24" → 2024-11-04
    m, dd, y = d.split("/"); return datetime.date(2000 + int(y), int(m), int(dd)).isoformat()

out = []; stats = collections.Counter()
for r in csv.DictReader(open(src)):
    if not r["dem"] or not r["rep"]: stats["skip-one-party"] += 1; continue
    if r["state"]: stats["skip-state-level"] += 1; continue
    out.append({"year": int(r["cycle"]), "pollster": r["pollster"], "start": iso(r["start_date"]), "end": iso(r["end_date"]),
                "sample": r["sample_size"], "population": r["population"], "dem": float(r["dem"]), "rep": float(r["rep"])})

out.sort(key=lambda r: (r["year"], r["end"], r["pollster"]))
with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
print(f"wrote {len(out)} polls to {OUT}", dict(collections.Counter(r["year"] for r in out)), dict(stats))
