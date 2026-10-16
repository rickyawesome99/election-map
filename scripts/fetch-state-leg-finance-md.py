#!/usr/bin/env python3
"""
Maryland state legislative fundraising from the State Board of Elections' MDCRIS
(api-campaignfinance.maryland.gov), elections 2022 and 2026 (Maryland elects its whole legislature
every four years with the governor; 2018 is not in the new system).

  python3 scripts/fetch-state-leg-finance-md.py [CYCLE ...]

Committees: POST /api/PublicGrid/GetCommitteeList (100 per page, the server's maximum) — every
committee with candidate name, office sought (House of Delegates / State Senator), party and the
elections it registered for. No district: assign-state-leg-finance.ts matches the name within the
chamber. Money: the yearly bulk itemized files (POST /api/ExportPublicData/GetExportPublicDownloadData,
TCON), every "Contribution" row (loans and returned contributions left out) dated inside the four-year
term window (2019–2022, 2023–2026), per Filing Entity Id. KNOWN GAP for 2022: itemized transactions in
the new system start with the 2021 annual report (period from 11/2020), so 2019 to Oct 2020 is missing.
Bill Ferguson, 11/2020–11/2022: $1,046,297.

Output: data-entry/state-leg-finance/portal-raw/MD-{cycle}.json. Files cached in scratch portal-cache/md/.
"""
import csv
import datetime
import json
import os
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/md"
API = "https://api-campaignfinance.maryland.gov/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TODAY = datetime.date.today()
CHAMBER = {"House of Delegates": "house", "State Senator": "senate"}
SOURCES = {2022: "Maryland SBE MDCRIS (itemized contributions from 11/2020 only)", 2026: "Maryland SBE MDCRIS (itemized contributions, 2023 on)"}


def post(path, body, out=None):
    args = ["curl", "-sS", "--max-time", "1800", "-X", "POST", "-A", UA, "-H", "Content-Type: application/json",
            "-H", "Origin: https://campaignfinance.maryland.gov", "-d", json.dumps(body), API + path]
    if out:
        subprocess.run(args + ["-o", out], check=True)
        return None
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)


def committees():
    path = os.path.join(CACHE, "committees.json")
    if os.path.exists(path):
        return json.load(open(path))
    items, page = [], 1
    while True:
        d = post("/PublicGrid/GetCommitteeList", {"pageNumber": page, "pageSize": 100})
        batch = d["data"]["items"] if isinstance(d.get("data"), dict) else d.get("items") or d.get("data") or []
        if not batch:
            break
        items += batch
        page += 1
    os.makedirs(CACHE, exist_ok=True)
    json.dump(items, open(path, "w"))
    return items


def year_file(year):
    path = os.path.join(CACHE, f"tcon{year}.csv")
    if not os.path.exists(path) or year >= TODAY.year:
        os.makedirs(CACHE, exist_ok=True)
        post("/ExportPublicData/GetExportPublicDownloadData", {"filingYear": str(year), "transactionTypeCode": "TCON", "type": "CSV", "fileName": f"tcon{year}"}, out=path)
    return path if os.path.getsize(path) > 0 else None


def fetch(cycle):
    comms = [c for c in committees() if c.get("officeSought") in CHAMBER and str(cycle) in (c.get("electionYears") or "")]
    ids = {str(c["filingEntityId"]): c for c in comms}
    start, end = datetime.date(cycle - 3, 1, 1), datetime.date(cycle, 12, 31)
    total = defaultdict(float)
    for year in range(cycle - 3, min(cycle + 1, TODAY.year) + 1):
        path = year_file(year)
        if not path:
            continue
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            first = fh.readline()
            if not first.startswith("Filing Entity Id"):
                pass  # a banner line ("Contributions and Loan Download as of …") precedes the header
            else:
                fh.seek(0)
            for r in csv.DictReader(fh):
                fid = r.get("Filing Entity Id")
                if fid not in ids or r.get("Transaction Type") != "Contribution":
                    continue
                try:
                    d = datetime.datetime.strptime(r["Transaction Date"][:10], "%m/%d/%Y").date()
                    if start <= d <= end:
                        total[fid] += float(r["Transaction Amount"].replace("$", "").replace(",", ""))
                except (ValueError, KeyError):
                    pass
    out = [{"name": c["candidateName"], "party": c.get("partyAffiliation"), "chamber": CHAMBER[c["officeSought"]], "committee": fid,
            "contributions": (round(total[fid], 2) if fid in total else None)} for fid, c in ids.items()]
    body = {"state": "MD", "cycle": cycle, "source": SOURCES[cycle], "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MD-{cycle}.json"), "w"), indent=1)
    print(f"MD {cycle}: {len(out)} legislative committees, ${sum(o['contributions'] or 0 for o in out):,.0f}")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2022, 2026]:
        fetch(c)
