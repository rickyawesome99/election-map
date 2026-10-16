#!/usr/bin/env python3
"""
Alaska state legislative fundraising — BUILD step: sums the APOC income exports that
scripts/fetch-state-leg-finance-ak.cjs downloaded (report years 2022, 2024, 2026; see that file).

  python3 scripts/fetch-state-leg-finance-ak.py [YEAR ...]

Report year = election year; it holds the Year Start report (prior-year activity) through the
year-end report. Per candidate (the "Name" column, filer type Candidate), every income row except
bank interest, bank fees and "Future Campaign Account" carry-overs. No district or party:
scripts/assign-state-leg-finance.ts matches the name within the chamber.
Cathy Giessel, Senate E, 2022: $111,116.53 in all rows, $110,296.95 net of interest and carry-over.

Output: data-entry/state-leg-finance/portal-raw/AK-{year}.json.
"""
import csv
import datetime
import io
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ak"
SOURCE = "Alaska Public Offices Commission (income, report year)"
TODAY = datetime.date.today()
SKIP_PAYMENT = {"Bank Interest", "Bank Fee"}


def amount(s):
    s = (s or "").replace("$", "").replace(",", "").strip()
    neg = s.startswith("(")
    try:
        v = float(s.strip("()"))
    except ValueError:
        return 0.0
    return -v if neg else v


def main(years):
    for year in years:
        total = defaultdict(float)
        chamber_of = {}
        found = False
        for office, chamber in (("House", "house"), ("Senate", "senate")):
            path = os.path.join(CACHE, f"inc-{year}-{office}.csv")
            if not os.path.exists(path):
                print(f"AK {year} {office}: no export yet")
                continue
            found = True
            text = open(path, encoding="utf-8", errors="replace").read()
            if not text.lstrip().startswith('"Result"'):
                text = text[text.index("\n") + 1:]
            for r in csv.DictReader(io.StringIO(text)):
                if r.get("Filer Type") != "Candidate" or (r.get("Payment Type") or "") in SKIP_PAYMENT or r.get("Report Type") == "Future Campaign Account":
                    continue
                total[r["Name"]] += amount(r.get("Amount"))
                chamber_of[r["Name"]] = chamber
        if not found:
            continue
        out = [{"name": n, "chamber": chamber_of[n], "contributions": round(v, 2)} for n, v in total.items()]
        body = {"state": "AK", "cycle": year, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if year >= TODAY.year else f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"AK-{year}.json"), "w"), indent=1)
        print(f"AK {year}: {len(out)} candidates")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2022, 2024, 2026])
