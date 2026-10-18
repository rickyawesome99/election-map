#!/usr/bin/env python3
"""
Missouri state legislative fundraising, FULL totals — BUILD step over the report summaries that
scripts/fetch-state-leg-finance-mo-full.cjs downloads (replaces the itemized-only MO files).

  python3 scripts/fetch-state-leg-finance-mo-full.py [CYCLE ...]     default 2016–2026

Per committee (MECID), per report: Contributions Received + In-Kind Contributions; where an "AMENDED …"
copy of a report exists, it replaces the original of the same name; a cycle = reports of years Y-1 and Y.
Committees are tied to candidates through the MEC election search that scripts/fetch-state-leg-finance-mo.py
caches (portal-cache/mo/cands-{Y}-*.json: committee name → candidate, party, district; 2020 on); for 2016
and 2018 every committee goes out under its own name ("Burger for Missouri") and the assignment finds the
candidate in it. Ashley Aune, HD-14, 2024: $114,615 (Contributions Received over the 2024 reports).

Output: data-entry/state-leg-finance/portal-raw/MO-{cycle}.json.
"""
import collections
import csv
import datetime
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SCRATCH = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache"
SOURCE = "Missouri Ethics Commission report summaries (contributions received + in-kind)"
TODAY = datetime.date.today()
norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def num(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


def year_totals(y):
    path = os.path.join(SCRATCH, "mo-full", f"summary{y}.csv")
    if not os.path.exists(path):
        return None
    reps = collections.defaultdict(dict)  # mecid -> report name -> (amended?, value)
    names = {}
    for r in csv.DictReader(open(path, encoding="utf-8-sig", errors="replace")):
        r = {k.strip(): v for k, v in r.items() if k}
        rep = (r.get("Report") or "").strip()
        amended = rep.upper().startswith("AMENDED")
        base = re.sub(r"^AMENDED\s+", "", rep, flags=re.I)
        v = num(r.get("Contributions Received")) + num(r.get("In-Kind Contributions"))
        prev = reps[r["MECID"]].get(base)
        if prev is None or (amended and not prev[0]) or (amended == prev[0] and int(r.get("ReportID") or 0) > prev[2]):
            reps[r["MECID"]][base] = (amended, v, int(r.get("ReportID") or 0))
        names[r["MECID"]] = r.get("Committee Name") or ""
    return {m: (names[m], sum(x[1] for x in d.values())) for m, d in reps.items()}


for cycle in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
    parts = [year_totals(y) for y in (cycle - 1, cycle) if y <= TODAY.year]
    if any(p is None for p in parts):
        print(f"MO {cycle}: a summary file is missing, skipped")
        continue
    tot = collections.defaultdict(float)
    names = {}
    for p in parts:
        for m, (n, v) in p.items():
            tot[m] += v
            names[m] = n
    known = {}
    for f in glob.glob(os.path.join(SCRATCH, "mo", f"cands-{cycle}-*.json")):
        chamber = "senate" if "Senator" in f else "house"
        for c in json.load(open(f)):
            known[norm(c["committee"])] = dict(c, chamber=chamber)
    out = []
    for m, v in tot.items():
        c = known.get(norm(names[m]))
        if known and not c:
            continue  # 2020 on: only the election search's legislative committees
        out.append({"name": c["name"] if c else names[m], "party": (c or {}).get("party"), "chamber": (c or {}).get("chamber"),
                    "district": (c or {}).get("district"), "committee": names[m], "contributions": round(v, 2) if v else None})
    body = {"state": "MO", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MO-{cycle}.json"), "w"), indent=1)
    print(f"MO {cycle}: {len(out)} committees")
