#!/usr/bin/env python3
"""
Maine state legislative fundraising for 2016 (the current disclosure site, scripts/fetch-state-leg-finance-me.py,
starts with 2018) from The Accountability Project's public copy of the Ethics Commission's old yearly
contribution downloads (publicaccountability.s3.amazonaws.com/csv/me_contribs_clean.csv; the old
mainecampaignfinance.com portal is gone).

  python3 scripts/fetch-state-leg-finance-me-legacy.py [YEAR ...]       default 2016

Candidate committees' rows dated Y-1..Y: itemized and unitemized monetary contributions plus in-kind,
less returned contributions. Left out, per the private-money rule: Maine Clean Election Act payments,
transfers from a previous campaign, loans and other receipts. Office and district are blank for these
years, so the name ("Representative Christopher R Barstow", titles dropped) goes to
scripts/assign-state-leg-finance.ts. Michael Thibodeau, SD-11, 2016: $29,424.81 net of a $375 return.

Output: data-entry/state-leg-finance/portal-raw/ME-{year}.json. The CSV (135 MB) is cached in scratch portal-cache/me-legacy/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/me-legacy"
SOURCE = "Maine Ethics Commission yearly downloads via The Accountability Project (private contributions)"
TITLES = re.compile(r"^(hon\.?|honorable|representative|rep\.?|senator|sen\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+", re.I)

path = os.path.join(CACHE, "me_contribs_clean.csv")
if not os.path.exists(path):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sSf", "-o", path, "https://publicaccountability.s3.amazonaws.com/csv/me_contribs_clean.csv"], check=True)

for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    for r in csv.DictReader(open(path, encoding="utf-8", errors="replace")):
        if r.get("committee_type") != "Candidate" or (r.get("date") or "")[:4] not in (str(year - 1), str(year)):
            continue
        t, src = r.get("type") or "", (r.get("source_type") or "").upper()
        if "MCEA" in src or "TRANSFER FROM PREVIOUS" in src or t in ("Loan", "Other Receipts", "Equipment Sales Proceeds"):
            continue
        try:
            amt = float(r["amount"] or 0)
        except ValueError:
            continue
        name = r.get("candidate") or ""
        while TITLES.match(name):
            name = TITLES.sub("", name)
        tot[(r["org_id"], name.strip())] += -abs(amt) if t == "Returned Contribution" else amt
    out = [{"name": n, "committee": org, "contributions": round(v, 2)} for (org, n), v in tot.items() if n]
    body = {"state": "ME", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"ME-{year}.json"), "w"), indent=1)
    print(f"ME {year}: {len(out)} candidate committees")
