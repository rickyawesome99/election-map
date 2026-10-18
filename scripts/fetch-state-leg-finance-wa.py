#!/usr/bin/env python3
"""
Washington state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from
the Public Disclosure Commission's "Campaign Finance Summary" open dataset (data.wa.gov 3h9x-7bvm).

  python3 scripts/fetch-state-leg-finance-wa.py [YEAR ...]       default 2016

One call: every candidate registration for the election year with office, legislative district
("LEG DISTRICT 03 - HOUSE"), party, primary/general status and contributions_amount (the PDC's own
total for the campaign). Mark Manweller, HD-13, 2016: $168,155.38.

Output: data-entry/state-leg-finance/portal-raw/WA-{year}.json.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SOURCE = "Washington PDC campaign finance summary (total contributions)"
CHAMBER = {"STATE REPRESENTATIVE": "house", "STATE SENATOR": "senate"}

for year in [int(a) for a in sys.argv[1:]] or [2016]:
    q = urllib.parse.urlencode({"election_year": str(year), "$where": "office in('STATE REPRESENTATIVE','STATE SENATOR')", "$limit": "5000"})
    rows = json.loads(subprocess.run(["curl", "-sS", "--max-time", "120", f"https://data.wa.gov/resource/3h9x-7bvm.json?{q}"], capture_output=True, check=True).stdout)
    if not isinstance(rows, list) or not rows:
        sys.exit(f"WA {year}: unexpected response")
    out = []
    for r in rows:
        d = re.search(r"DISTRICT 0*(\d+)", r.get("jurisdiction") or "")
        amt = r.get("contributions_amount")
        out.append({"name": re.sub(r"\s*\(.*\)$", "", r["filer_name"]), "party": r.get("party"), "chamber": CHAMBER[r["office"]],
                    "district": d.group(1) if d else None, "contributions": round(float(amt), 2) if amt not in (None, "") else None,
                    "status": r.get("general_election_status")})
    body = {"state": "WA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"WA-{year}.json"), "w"), indent=1)
    print(f"WA {year}: {len(out)} registrations")
