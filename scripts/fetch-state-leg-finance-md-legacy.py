#!/usr/bin/env python3
"""
Maryland state legislative fundraising for the 2018 election (the current MDCRIS, scripts/fetch-state-leg-finance-md.py,
has itemized data only from 11/2020) from The Accountability Project's public copy of the old CRIS
receipts export (publicaccountability.s3.amazonaws.com/csv/md_contribs_clean.csv, 1.35 GB).

  python3 scripts/fetch-state-leg-finance-md-legacy.py [YEAR ...]       default 2018

Every itemized receipt by committee NAME (no id, no district). Maryland itemizes essentially everything,
so the sums approach report totals. A cycle = the four-year term window (2015–2018), less candidate
loans, other income and refunds. The committee is tied to its candidate and office through the MDCRIS
committee list (portal-cache/md/committees.json, written by the MDCRIS fetcher): the same committee name
once commas and case are set aside ("Ferguson, Bill Citizens for" = "Ferguson Bill Citizens for").
Bill Ferguson, SD-46, filing years 2015–2018: $342,717.

Output: data-entry/state-leg-finance/portal-raw/MD-{year}.json. The CSV is cached in scratch portal-cache/md-legacy/.
"""
import collections
import csv
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SCRATCH = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache"
CACHE = os.path.join(SCRATCH, "md-legacy")
SOURCE = "Maryland SBE CRIS receipts via The Accountability Project (itemized contributions)"
CHAMBER = {"House of Delegates": "house", "State Senator": "senate"}
SKIP = {"Candidate Loan", "Other Income", "Refund/Rebate"}
csv.field_size_limit(10**9)
norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()

path = os.path.join(CACHE, "md_contribs_clean.csv")
if not os.path.exists(path):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sSf", "-o", path, "https://publicaccountability.s3.amazonaws.com/csv/md_contribs_clean.csv"], check=True)
comms = json.load(open(os.path.join(SCRATCH, "md", "committees.json")))

for year in [int(a) for a in sys.argv[1:]] or [2018]:
    leg = {norm(c["committeeName"]): c for c in comms if c.get("officeSought") in CHAMBER and str(year) in (c.get("electionYears") or "")}
    tot = collections.defaultdict(float)
    with open(path, encoding="utf-8", errors="replace") as fh:
        for r in csv.DictReader(fh):
            key = norm(r.get("committee"))
            if key not in leg or r.get("method") in SKIP or not (f"{year - 3}-01-01" <= (r.get("date") or "") <= f"{year}-12-31"):
                continue
            try:
                tot[key] += float(r["amount"] or 0)
            except ValueError:
                pass
    out = [{"name": leg[k]["candidateName"], "party": leg[k].get("partyAffiliation"), "chamber": CHAMBER[leg[k]["officeSought"]],
            "committee": leg[k]["committeeName"], "contributions": round(v, 2)} for k, v in tot.items()]
    body = {"state": "MD", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MD-{year}.json"), "w"), indent=1)
    print(f"MD {year}: {len(out)} of {len(leg)} legislative committees with receipts")
