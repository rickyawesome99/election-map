#!/usr/bin/env python3
"""
Florida state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Division of Elections' campaign finance database (dos.elections.myflorida.com/cgi-bin/contrib.exe).

  python3 scripts/fetch-state-leg-finance-fl.py [YYYYMMDD ...]       default 20161108

One POST per office (STR = State Representative, STS = State Senator) with search_on=3 (totals per
candidate) and queryformat=2 (tab-delimited): candidate, party, office, district, total contributions
for that election's account (Florida accounts are per election, so 2015 money is in it). The full
form must be sent or the reply can come back empty; a 502 now and then needs a retry.
Richard Corcoran, HD-37, 2016: $311,908.34.

Output: data-entry/state-leg-finance/portal-raw/FL-{year}.json.
"""
import csv
import datetime
import io
import json
import os
import subprocess
import sys
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Florida Division of Elections (total contributions per election account)"
FORM = ("search_on=3&CanFName=&CanLName=&CanNameSrch=2&cdistrict=&cgroup=&party=All&ComName=&ComNameSrch=2&committee=All&cfname=&clname="
        "&namesearch=2&ccity=&cstate=&czipcode=&coccupation=&cdollar_minimum=&cdollar_maximum=&rowlimit=&csort1=NAM&csort2=CAN&cdatefrom=&cdateto="
        "&queryformat=2&Submit=Submit")


def totals(election, office):
    body = f"election={election}-GEN&office={office}&{FORM}"
    for attempt in range(6):
        r = subprocess.run(["curl", "-sS", "--max-time", "180", "-A", UA, "-d", body, "https://dos.elections.myflorida.com/cgi-bin/contrib.exe"], capture_output=True)
        text = r.stdout.decode("latin-1")
        if text.startswith("Candidate Name"):
            return list(csv.DictReader(io.StringIO(text), delimiter="\t"))
        time.sleep(15 * (attempt + 1))  # an intermittent "Error code: 502"
    sys.exit(f"FL {election} {office}: no data")


for election in sys.argv[1:] or ["20161108"]:
    year = int(election[:4])
    out = []
    for office, chamber in (("STR", "house"), ("STS", "senate")):
        for r in totals(election, office):
            amt = (r.get("Total Amount") or "").replace(",", "").strip()
            out.append({"name": r["Candidate Name"].strip(), "party": r.get("Party"), "chamber": chamber, "district": str(int(r["District"])) if r["District"].strip().isdigit() else r["District"].strip(),
                        "contributions": float(amt) if amt else None})
    body = {"state": "FL", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"FL-{year}.json"), "w"), indent=1)
    print(f"FL {year}: {len(out)} candidates")
