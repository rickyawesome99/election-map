#!/usr/bin/env python3
"""
Arkansas state legislative fundraising from the Secretary of State's ethics disclosure system
(api-ethics-disclosures.sos.arkansas.gov), cycles 2024 and 2026 — the new system's itemized data
starts with reports filed in 2023 (earlier cycles are scanned/legacy PDFs, not read here).

  python3 scripts/fetch-state-leg-finance-ar.py [CYCLE ...]

Candidates: POST /api/PublicFilerDetails/GetCandidateCommitteDetails — every candidate registration
with office (State Representative / State Senate), district, party and filingYear (= the election
it is for). A registration is one cycle, so its money = every Contribution row filed under its
Filing Entity ID in the yearly bulk CSVs (POST /api/ExportData/GetExportPublicDownloadData, TCON),
itemized + non-itemized, monetary + non-money. The CSV's own "Election Year" is unreliable and the
list's totalRaised sometimes disagrees with the filings; the entity-ID sum is used.

Output: data-entry/state-leg-finance/portal-raw/AR-{cycle}.json. CSVs cached in scratch portal-cache/ar/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ar"
API = "https://api-ethics-disclosures.sos.arkansas.gov/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Arkansas Secretary of State ethics disclosures (itemized + non-itemized contributions)"
TODAY = datetime.date.today()
CHAMBER = {"State Representative": "house", "State Senate": "senate"}


def post(path, body, out=None):
    args = ["curl", "-sS", "--max-time", "900", "-X", "POST", "-A", UA, "-H", "Content-Type: application/json",
            "-H", "Origin: https://ethics-disclosures.sos.arkansas.gov", "-d", json.dumps(body), API + path]
    if out:
        subprocess.run(args + ["-o", out], check=True)
        return None
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)


def year_file(year):
    path = os.path.join(CACHE, f"tcon{year}.csv")
    if not os.path.exists(path) or year >= TODAY.year:
        os.makedirs(CACHE, exist_ok=True)
        post("/ExportData/GetExportPublicDownloadData", {"transactionTypeCode": "TCON", "type": "CSV", "filingYear": str(year)}, out=path)
    head = open(path, encoding="utf-8-sig", errors="replace").readline()
    return path if head.startswith("Filing Entity ID") else None


def main(cycles):
    d = post("/PublicFilerDetails/GetCandidateCommitteDetails", {"pageNumber": 1, "pageSize": 10000, "filerTypeCode": "CAN"})
    items = d["data"]["items"] if "data" in d else d["items"]
    if not items:
        sys.exit("AR: empty candidate list")
    money = defaultdict(float)
    for year in range(2022, TODAY.year + 1):
        path = year_file(year)
        if not path:
            print(f"AR: no contributions file for {year}")
            continue
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            for r in csv.DictReader(fh):
                if r.get("Transaction Type") != "Contribution":
                    continue
                try:
                    money[r["Filing Entity ID"]] += float(r["Transaction Amount"].replace("$", "").replace(",", ""))
                except (ValueError, AttributeError):
                    pass
    for cycle in cycles:
        rows = [x for x in items if x.get("filingYear") == str(cycle) and x.get("office") in CHAMBER]
        out = [{"name": x["filerName"], "party": x.get("politicalParty"), "chamber": CHAMBER[x["office"]], "district": x.get("officeDistrictName"),
                "contributions": (round(money[str(x["filerEntityID"])], 2) if str(x["filerEntityID"]) in money else None), "expenditures": x.get("totalSpent")} for x in rows]
        body = {"state": "AR", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year - 1 else f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"AR-{cycle}.json"), "w"), indent=1)
        print(f"AR {cycle}: {len(out)} legislative registrations, ${sum(o['contributions'] or 0 for o in out):,.0f}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2024, 2026])
