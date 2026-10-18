#!/usr/bin/env python3
"""
Wisconsin state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Ethics Commission's campaign finance system ("Sunshine", campaignfinance.wi.gov; 2015–16 legacy data
migrated in), through its public tRPC API.

  python3 scripts/fetch-state-leg-finance-wi.py [YEAR ...]       default 2016

publicFrontendApi.getTransactionsTopCommitteesByDonations — per office (8 = Assembly, 9 = Senate),
state candidate committees, transaction categories 1, 9 and 11 (monetary, conduit, payroll deduction
contributions), dated Y-1..Y — returns each committee's total. The transactions' relatedDistrict is the
committee's CURRENT district (Robin Vos's 2016 money reads "District No. 33", his post-2024 seat; he held
the 63rd). It is passed on only as a hint: assign-state-leg-finance.ts looks for the surname in that
district first and falls back to the candidate name in the committee name statewide, which is how
Vos lands on the 63rd (without the hint, coverage drops from 98 to 80 districts).
Robin Vos, AD-63, 2015–16: $155,938.

Output: data-entry/state-leg-finance/portal-raw/WI-{year}.json. Responses cached in scratch portal-cache/wi/.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/wi"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
API = "https://campaignfinance.wi.gov/api/trpc/publicFrontendApi."
SOURCE = "Wisconsin Ethics Commission (monetary, conduit and payroll contributions)"
OFFICES = {8: "house", 9: "senate"}


def call(proc, payload, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return json.load(open(p))
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--max-time", "180", "-A", UA, "-G", API + proc, "--data-urlencode", "input=" + json.dumps({"json": payload})], capture_output=True)
        try:
            d = json.loads(r.stdout)["result"]["data"]["json"]
            break
        except (ValueError, KeyError):
            time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"WI: failed {proc}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(d, open(p, "w"))
    time.sleep(0.2)
    return d


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    lo, hi = f"{year - 1}-01-01", f"{year}-12-31"
    out = []
    for office, chamber in OFFICES.items():
        comms = call("getTransactionsTopCommitteesByDonations", {"limit": 2000, "dateFrom": lo, "dateTo": hi, "officeIds": [office], "committeeTypeId": [1], "transactionCategory": [1, 9, 11]}, f"top-{year}-{office}.json")
        for c in comms:
            tx = call("getTransactions", {"createdByEntityId": [c["id"]], "limit": 5, "dateFrom": lo, "dateTo": hi}, f"tx/{year}-{c['id']}.json")["results"]
            dist = next((re.search(r"District No\. (\d+)", t["relatedDistrict"]["name"]).group(1) for t in tx if (t.get("relatedDistrict") or {}).get("name") and re.search(r"District No\. (\d+)", t["relatedDistrict"]["name"])), None)
            party = next(((((t.get("createdByEntity") or {}).get("committee") or {}).get("party") or {}).get("name") for t in tx), None)
            out.append({"name": c["nameLabel"], "party": party, "chamber": chamber, "district": dist, "committee": c["id"], "contributions": round(c["total"], 2)})
    body = {"state": "WI", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"WI-{year}.json"), "w"), indent=1)
    print(f"WI {year}: {len(out)} committees")
