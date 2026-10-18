#!/usr/bin/env python3
"""
Arizona state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's See The Money site (seethemoney.az.gov, JSON behind its DataTables calls).

  python3 scripts/fetch-state-leg-finance-az.py [YEAR ...]       default 2016

GetNEWTableData (ChartName 1, years Y-1..Y) lists every candidate committee with its office; each
legislative committee's transactions come from GetNEWDetailedTableData (ChartName 20, entityId). The
DataTables order/search fields must be posted or the reply is empty; replies are latin-1. Contributions
= the transaction types that are contributions (individuals, committees, PACs, candidate or family,
in-kind), so the committee's "Income" figure's surplus transfers from an earlier committee, shared-expense
receipts, other income and Clean Elections public funding are left out (private money only). The seat is
the transaction's CandidateOfficeId: 31NN = Senate district NN, 32NN = House district NN.
J.D. Mesnard, HD-17, "Vote Mesnard 2016": ~$116,665 (Income $168,082).

Output: data-entry/state-leg-finance/portal-raw/AZ-{year}.json. Responses cached in scratch portal-cache/az/.
"""
import collections
import datetime
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/az"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://seethemoney.az.gov/Reporting/"
BODY = "draw=1&start=0&length=5000&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&search%5Bvalue%5D="
SOURCE = "Arizona Secretary of State See The Money (private contributions; public funding excluded)"
IS_CONTRIBUTION = re.compile(r"contribution", re.I)
NOT_PRIVATE = re.compile(r"transfer|clean|public|loan|refund|return", re.I)


def post(query, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return json.load(open(p))
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--max-time", "300", "-A", UA, "-H", "X-Requested-With: XMLHttpRequest", "-d", BODY, BASE + query], capture_output=True)
        try:
            d = json.loads(r.stdout.decode("latin-1"))
            if d != "":
                break
        except ValueError:
            pass
        time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"AZ: failed {query[:80]}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(d, open(p, "w"))
    time.sleep(0.3)
    return d


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    common = f"startYear={year - 1}&endYear={year}&JurisdictionId=0&TablePage=1&IsLessActive=true&ShowOfficeHolder=false"
    ents = post(f"GetNEWTableData/?Page=1&{common}&TableLength=5000&ChartName=1", f"list-{year}.json")["data"]
    out = []
    for e in ents:
        # The entity's OfficeName is its CURRENT office (a 2016 legislator now in Congress would be dropped):
        # every committee is read and the transactions' own CandidateOfficeId decides the seat.
        eid = e["EntityID"]
        tx = post(f"GetNEWDetailedTableData/?Page=20&{common}&TableLength=5000&ChartName=20&entityId={eid}&View=Detail&Name=1~{eid}", f"tx/{year}-{eid}.json")["data"]
        by_seat = collections.defaultdict(float)
        name = None
        for t in tx:
            kind = t.get("TransactionType") or ""
            if not IS_CONTRIBUTION.search(kind) or NOT_PRIVATE.search(kind):
                continue
            by_seat[t.get("CandidateOfficeId")] += float(t.get("Amount") or 0)
            name = f'{t.get("CandidateFirstName") or ""} {t.get("CandidateLastName") or ""}'.strip() or name
        for office, v in by_seat.items():
            m = re.match(r"3([12])(\d\d)$", str(office or ""))
            if not m:
                continue
            out.append({"name": name or e.get("CommitteeName"), "committee": e.get("CommitteeName"), "party": e.get("PartyName"),
                        "chamber": ("senate" if m.group(1) == "1" else "house") if m else None, "district": str(int(m.group(2))) if m else None,
                        "contributions": round(v, 2)})
    body = {"state": "AZ", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"AZ-{year}.json"), "w"), indent=1)
    print(f"AZ {year}: {len(out)} committee-seats")
