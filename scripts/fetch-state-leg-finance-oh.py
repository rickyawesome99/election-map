#!/usr/bin/env python3
"""
Ohio state legislative fundraising for 2016 (Transparency USA, scripts/fetch-state-leg-finance-tu.py, starts with
2018) from The Accountability Project's public copy of the Secretary of State's yearly candidate contribution files
(ALL_CAN_CON_{year}.CSV / CAC_CON_{year}.CSV, merged as publicaccountability.s3.amazonaws.com/csv/oh_contribs_clean.csv,
3.8 GB, through 2022). Every ohiosos.gov host sits behind a Cloudflare challenge, so the S3 copy is the route.

  python3 scripts/fetch-state-leg-finance-oh.py [YEAR ...]       default 2016

A cycle is the two file years Y-1 and Y (a file year holds the reports filed that year, so the January annual of Y
covering late Y-1 counts toward Y). Counted: 31-A contributions, 31-E fundraising-event contributions, 31-A-2 other
income and 31-J-1 in-kind received, per committee (master_key). That is Transparency USA's definition: on 2018 it
reproduces their general-election totals for 174 of 202 name-matched candidates within 1% (197 within 5%).
The file's office, district and party come from the CURRENT candidate master (Scott Wiggam's 2015 rows say HD-77,
his post-2022 seat), so they are not used: all candidate committees go out by name ("Scott Wiggam") and
scripts/assign-state-leg-finance.ts keeps the ones that match a general-election legislative candidate.

Output: data-entry/state-leg-finance/portal-raw/OH-{year}.json. The candidate rows for the file years asked for are
cached in scratch dl/oh/ (the full file is streamed once, not stored).
"""
import collections
import csv
import datetime
import io
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/dl/oh"
URL = "https://publicaccountability.s3.amazonaws.com/csv/oh_contribs_clean.csv"
SOURCE = "Ohio Secretary of State candidate contribution files via The Accountability Project (contributions, other income, in-kind)"
TYPES = {"31-A", "31-E", "31-A-2", "31-J-1"}

years = [int(a) for a in sys.argv[1:]] or [2016]
file_years = sorted({str(y) for c in years for y in (c - 1, c)})
path = os.path.join(CACHE, f"oh_cand_{file_years[0]}_{file_years[-1]}.csv")
if not os.path.exists(path):
    os.makedirs(CACHE, exist_ok=True)
    curl = subprocess.Popen(["curl", "-sSf", URL], stdout=subprocess.PIPE)
    reader = csv.reader(io.TextIOWrapper(curl.stdout, encoding="utf-8", errors="replace"))
    header = next(reader)
    ix = {k: i for i, k in enumerate(header)}
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in reader:
            if len(row) == len(header) and row[ix["file_type"]] == "CANDIDATE" and row[ix["file_year"]] in file_years:
                w.writerow(row)
    curl.wait()

for year in years:
    tot = collections.defaultdict(float)
    who = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["file_year"] not in (str(year - 1), str(year)) or (r["desc"].split() or [""])[0] not in TYPES:
            continue
        try:
            amt = float(r["amount"] or 0)
        except ValueError:
            continue
        tot[r["master_key"]] += amt
        who[r["master_key"]] = (" ".join(p for p in (r["cand_first"], r["cand_middle"] if "cand_middle" in r else "", r["cand_last"]) if p.strip()), r["com_name"])
    out = [{"name": who[k][0].title(), "committee": who[k][1], "contributions": round(v, 2)} for k, v in tot.items() if who[k][0].strip()]
    body = {"state": "OH", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"OH-{year}.json"), "w"), indent=1)
    print(f"OH {year}: {len(out)} candidate committees")
