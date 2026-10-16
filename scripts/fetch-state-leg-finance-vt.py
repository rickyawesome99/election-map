#!/usr/bin/env python3
"""
Vermont state legislative fundraising from the Secretary of State's campaign finance system
(campaignfinance.vermont.gov), cycles 2016–2026, in ONE call:

  python3 scripts/fetch-state-leg-finance-vt.py

POST api.campaignfinance.vermont.gov/api/PublicFilerDetails/GetCandidateDetails returns every
registered candidate committee per election cycle (filingYear) with totalRaised / totalSpent,
office ("State Representative" / "State Senator"), party and town — no district, so
scripts/assign-state-leg-finance.ts places them by name. Vermont candidates register only past the
$500 threshold: a general-election candidate with no record raised little or nothing (left null).

Output: data-entry/state-leg-finance/portal-raw/VT-{cycle}.json.
"""
import datetime
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SOURCE = "Vermont Secretary of State campaign finance (total raised)"
TODAY = datetime.date.today()
CHAMBER = {"State Representative": "house", "State Senator": "senate"}

r = subprocess.run(["curl", "-sS", "--max-time", "180", "-X", "POST", "-H", "Content-Type: application/json",
                    "-H", "Origin: https://campaignfinance.vermont.gov", "-d", '{"pageNumber":1,"pageSize":10000}',
                    "https://api.campaignfinance.vermont.gov/api/PublicFilerDetails/GetCandidateDetails"], capture_output=True, check=True)
items = json.loads(r.stdout)["data"]["items"]
if not items:  # the API answers an over-large pageSize with an empty list
    raise SystemExit("VT: empty candidate list")
for cycle in (2016, 2018, 2020, 2022, 2024, 2026):
    rows = [x for x in items if x.get("filingYear") == cycle and x.get("office") in CHAMBER]
    out = [{"name": x["filerName"], "party": x.get("party"), "chamber": CHAMBER[x["office"]], "town": x.get("town"),
            "contributions": x.get("totalRaised"), "expenditures": x.get("totalSpent")} for x in rows]
    body = {"state": "VT", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"VT-{cycle}.json"), "w"), indent=1)
    print(f"VT {cycle}: {len(out)} candidate committees")
