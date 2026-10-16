#!/usr/bin/env python3
"""
Hawaii state legislative fundraising from the Campaign Spending Commission's open data
(hicscdata.hawaii.gov, Socrata), cycles 2016–2026.

  python3 scripts/fetch-state-leg-finance-hi.py [CYCLE ...]

Dataset jexd-xbcg (contributions received by candidates), summed server-side per candidate
registration and election period: SELECT candidate_name, office, reg_no, election_period, sum(amount)
WHERE office in ('House','Senate'). The election period ends in the election year ("2020-2022";
senators' periods often run four years), which is the cycle. KNOWN UNDERCOUNT: Hawaii itemizes only
donors whose aggregate passes $100, and the unitemized small money is not in the open data (the full
report totals live in the session-bound Candidate Filing System, not read here). No district or party:
scripts/assign-state-leg-finance.ts matches the name within the chamber.
Della Au Belatti, House, 2020-2022: $87,325 itemized.

Output: data-entry/state-leg-finance/portal-raw/HI-{cycle}.json.
"""
import datetime
import json
import os
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SOURCE = "Hawaii Campaign Spending Commission (itemized contributions over $100 only)"
TODAY = datetime.date.today()
CHAMBER = {"House": "house", "Senate": "senate"}

q = urllib.parse.urlencode({
    "$select": "candidate_name,office,reg_no,election_period,sum(amount) as total,count(*) as n",
    "$where": "office in('House','Senate')",
    "$group": "candidate_name,office,reg_no,election_period",
    "$limit": "50000",
})
r = subprocess.run(["curl", "-sS", "--max-time", "300", f"https://hicscdata.hawaii.gov/resource/jexd-xbcg.json?{q}"], capture_output=True, check=True)
rows = json.loads(r.stdout)
if not isinstance(rows, list) or not rows:
    sys.exit(f"HI: unexpected response {str(rows)[:200]}")
cycles = [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]
for cycle in cycles:
    mine = [x for x in rows if (x.get("election_period") or "").endswith(str(cycle))]
    out = [{"name": x["candidate_name"], "chamber": CHAMBER[x["office"]], "reg": x.get("reg_no"), "period": x["election_period"],
            "contributions": round(float(x["total"]), 2)} for x in mine]
    body = {"state": "HI", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"HI-{cycle}.json"), "w"), indent=1)
    print(f"HI {cycle}: {len(out)} candidate registrations")
