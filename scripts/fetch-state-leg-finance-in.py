#!/usr/bin/env python3
"""
Indiana state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Election Division's bulk contribution files (campaignfinance.in.gov).

  python3 scripts/fetch-state-leg-finance-in.py [YEAR ...]       default 2016

PublicSite/Docs/BulkDataDownloads/{Y}_ContributionData.csv.zip, one per calendar year: every
contribution with committee type, committee and candidate name. Candidate committees' Direct,
Unitemized and In-Kind rows (not loans, interest, debts or miscellaneous) dated Y-1..Y, summed per
candidate. There is no office or district and no committee file, so every candidate committee in the
state is listed and scripts/assign-state-leg-finance.ts keeps the names that match a general-election
legislative candidate. Brian Bosma, HD-88, 2015–16: $919,909.

Output: data-entry/state-leg-finance/portal-raw/IN-{year}.json. Zips cached in scratch portal-cache/in/.
"""
import collections
import csv
import datetime
import io
import json
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/in"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Indiana Election Division bulk contributions (direct, unitemized, in-kind)"
KEEP = {"Direct", "Unitemized", "In-Kind"}


def year_rows(y):
    p = os.path.join(CACHE, f"{y}.zip")
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", p, f"https://campaignfinance.in.gov/PublicSite/Docs/BulkDataDownloads/{y}_ContributionData.csv.zip"], check=True)
    z = zipfile.ZipFile(p)
    with z.open(z.namelist()[0]) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""))


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    for y in (year - 1, year):
        for r in year_rows(y):
            if r.get("CommitteeType") != "Candidate" or r.get("Type") not in KEEP or not (r.get("CandidateName") or "").strip():
                continue
            try:
                tot[r["CandidateName"].strip()] += float(r["Amount"] or 0)
            except ValueError:
                pass
    out = [{"name": n, "contributions": round(v, 2)} for n, v in tot.items()]
    body = {"state": "IN", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"IN-{year}.json"), "w"), indent=1)
    print(f"IN {year}: {len(out)} candidate committees")
