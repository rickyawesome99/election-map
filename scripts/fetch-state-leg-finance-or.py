#!/usr/bin/env python3
"""
Oregon state legislative fundraising — BUILD step: sums the ORESTAR transaction exports that
scripts/fetch-state-leg-finance-or.cjs downloaded (see that file for the source and the flow).

  python3 scripts/fetch-state-leg-finance-or.py [CYCLE ...]

Per committee and cycle (Jan 1 of Y-1 → Dec 31 of Y): every contribution row of the export (cash,
in-kind, and the "miscellaneous cash contributions $100 and under" aggregate rows, so the sum is
complete); an amended transaction replaces its original (Original Id). The committee's own district
and candidate name go to scripts/assign-state-leg-finance.ts, which matches within the district.

Output: data-entry/state-leg-finance/portal-raw/OR-{cycle}.json.
"""
import datetime
import json
import os
import sys
import warnings

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/or"
SOURCE = "Oregon Secretary of State ORESTAR (contributions, two calendar years)"
TODAY = datetime.date.today()


def committee_total(path):
    if os.path.getsize(path) == 0:
        return 0.0
    ws = openpyxl.load_workbook(path, read_only=True).active
    rows = ws.iter_rows(values_only=True)
    head = next(rows)
    recs = [dict(zip(head, r)) for r in rows]
    replaced = {r["Original Id"] for r in recs if r.get("Original Id") and r.get("Original Id") != r.get("Tran Id")}
    return sum(float(r["Amount"] or 0) for r in recs if r["Tran Id"] not in replaced)


def main(cycles):
    comms = {c["id"]: c for c in json.load(open(os.path.join(CACHE, "committees.json")))}
    for cycle in cycles:
        out = []
        for cid, c in comms.items():
            path = os.path.join(CACHE, "tx", f"{cid}-{cycle}.xlsx")
            if not os.path.exists(path):
                continue
            out.append({"name": c["committee"] or c["candidate"], "candidate": c["candidate"], "party": c["party"], "chamber": c["chamber"],
                        "district": c["district"], "committee": cid, "contributions": round(committee_total(path), 2)})
        body = {"state": "OR", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"OR-{cycle}.json"), "w"), indent=1)
        print(f"OR {cycle}: {len(out)} committees")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026])
