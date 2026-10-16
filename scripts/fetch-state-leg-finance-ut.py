#!/usr/bin/env python3
"""
Utah state legislative fundraising from the Lieutenant Governor's disclosure site
(disclosures.utah.gov), for every cycle 2016–2026.

  python3 scripts/fetch-state-leg-finance-ut.py [CYCLE ...]      default: 2016 2018 2020 2022 2024 2026

Source: the bulk itemized CSV of every Candidates & Office Holders (PCC) committee for one report
year, GET /Search/AdvancedSearch/GenerateReport?ReportYear=YYYY&EntityType=PCC. Utah itemizes every
contribution, so a cycle's total contributions = the sum of a committee's Contribution rows dated in
the two report years of the cycle (2021 + 2022 for 2022), counting in-kind gifts and leaving out
loans and "Balance Transfer" rows (carry-over from the committee's previous election, not new money).
The CSV carries the candidate's name only ("Abbott, Nelson"), no office: the district comes from
scripts/assign-state-leg-finance.ts, which matches names to the general-election candidates.

Output: data-entry/state-leg-finance/portal-raw/UT-{cycle}.json in the portal-raw shape
  { state, cycle, source, fetched, dataThrough, candidates: [ {name, contributions, expenditures} ] }
"""
import csv
import datetime
import io
import json
import os
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ut"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Utah Lieutenant Governor disclosures (itemized contributions)"


def report_year(year):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"PCC-{year}.csv")
    current = year >= datetime.date.today().year
    if not os.path.exists(path) or current:
        url = f"https://disclosures.utah.gov/Search/AdvancedSearch/GenerateReport?ReportYear={year}&EntityType=PCC"
        subprocess.run(["curl", "-sSf", "--http1.1", "-A", UA, "-o", path, url], check=True)
    with open(path, encoding="latin-1") as f:
        text = f.read()
    if not text.startswith("FILED,PCC"):
        sys.exit(f"UT {year}: unexpected response (not the PCC CSV)")
    return list(csv.DictReader(io.StringIO(text)))


def money(s):
    try:
        return float(str(s).replace(",", "").replace("$", ""))
    except ValueError:
        return 0.0


def cycle(c):
    contrib = defaultdict(float)
    spent = defaultdict(float)
    latest = None
    for year in (c - 1, c):
        for r in report_year(year):
            name = r["PCC"].strip()
            if not name:
                continue
            amt = money(r["TRAN_AMT"])
            if r["TRAN_TYPE"] == "Contribution":
                if r["LOAN"] == "X" or "balance transfer" in r["NAME"].lower():
                    continue
                contrib[name] += amt
            elif r["TRAN_TYPE"] == "Expenditure":
                spent[name] += amt
            try:
                d = datetime.datetime.strptime(r["TRAN_DATE"], "%m/%d/%Y").date()
                if d.year <= c and (latest is None or d > latest):
                    latest = d
            except ValueError:
                pass
    names = sorted(set(contrib) | set(spent))
    out = {
        "state": "UT", "cycle": c, "source": SOURCE, "fetched": datetime.date.today().isoformat(),
        "dataThrough": latest.strftime("%m/%d/%Y") if latest else None,
        "candidates": [{"name": n, "contributions": round(contrib[n], 2), "expenditures": round(abs(spent[n]), 2)} for n in names],
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"UT-{c}.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(f"UT {c}: {len(names)} committees, ${sum(contrib.values()):,.0f} contributions, through {out['dataThrough']}")


if __name__ == "__main__":
    cycles = [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]
    for c in cycles:
        cycle(c)
