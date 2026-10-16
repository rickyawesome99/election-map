#!/usr/bin/env python3
"""
Montana state legislative fundraising from the Commissioner of Political Practices' CERS
(cers-ext.mt.gov/CampaignTracker), election years 2016–2026.

  python3 scripts/fetch-state-leg-finance-mt.py [CYCLE ...]

One Java session per year: searchFinancials (contributions, candidate type SD = state district,
election year) → listFinancialCandidateResults (DataTables JSON; House/Senate District rows kept) →
per candidate, viewFinancialEntities (sets the candidate; carries "totalContrLessThan35", the
unitemized small gifts) → listViewFinancialEntityResults (every itemized contribution as JSON).
Contributions = Σ(cash + in-kind) + the under-$35 total. A candidate record is per election year and
holds the prior year's receipts too. Amy Regier, HD-6, 2022: 19 rows, $4,430.00.
The DataTables query parameters must all be present or the server returns an error page.

Output: data-entry/state-leg-finance/portal-raw/MT-{cycle}.json. JSON cached in scratch portal-cache/mt/.
"""
import datetime
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/mt"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://cers-ext.mt.gov/CampaignTracker/public/"
SOURCE = "Montana Commissioner of Political Practices (itemized + under-$35 contributions)"
TODAY = datetime.date.today()


class Session:
    def __init__(self, year):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.op.addheaders = [("User-Agent", UA)]
        self.year = year
        self.post("search/candidateSearch")
        self.post("searchResults/searchFinancials", {"financialSearchType": "CONTR", "contrSearchTypeCode": "CANDIDATE", "contrCandidateTypeCode": "SD", "electionYear": str(year)})

    def post(self, path, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        for attempt in range(5):
            try:
                return self.op.open(BASE + path, body, timeout=120).read()
            except Exception as e:  # noqa: BLE001
                print(f"  retry {path}: {e}", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
        sys.exit(f"MT: failed {path}")

    def table(self, path, ncol):
        q = {"sEcho": 1, "iColumns": ncol, "sColumns": "," * (ncol - 1), "iDisplayStart": 0, "iDisplayLength": 10000, "sSearch": "", "bRegex": "false",
             "iSortCol_0": 0, "sSortDir_0": "asc", "iSortingCols": 1}
        for i in range(ncol):
            q.update({f"mDataProp_{i}": str(i), f"sSearch_{i}": "", f"bRegex_{i}": "false", f"bSearchable_{i}": "true", f"bSortable_{i}": "true"})
        return json.loads(self.post(f"searchResults/{path}?{urllib.parse.urlencode(q)}"))["aaData"]


def money(s):
    try:
        return float(str(s).replace("$", "").replace(",", ""))
    except ValueError:
        return 0.0


def candidate_total(s, cid, current):
    path = os.path.join(CACHE, str(s.year), f"{cid}.json")
    if os.path.exists(path) and not current:
        return json.load(open(path))["total"]
    head = json.loads(s.post("searchResults/viewFinancialEntities", {"candidateId": cid, "committeeId": 0}))
    rows = s.table("listViewFinancialEntityResults", 12)
    total = sum((r.get("cashAmt") or 0) + (r.get("inKindAmt") or 0) for r in rows) + money(head.get("totalContrLessThan35"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"total": round(total, 2), "rows": len(rows)}, open(path, "w"))
    time.sleep(0.2)
    return round(total, 2)


def fetch(cycle):
    current = cycle >= TODAY.year
    s = Session(cycle)
    cands = [c for c in s.table("listFinancialCandidateResults", 9) if re.match(r"(House|Senate) District", c.get("officeTitle") or "")]
    out = []
    for c in cands:
        m = re.match(r"(House|Senate) District No\.?\s*0*(\d+)", c["officeTitle"])
        out.append({"name": c["candidateName"], "party": c.get("partyDescr"), "chamber": "house" if m and m.group(1) == "House" else "senate",
                    "district": m.group(2) if m else None, "contributions": candidate_total(s, c["candidateId"], current)})
    body = {"state": "MT", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if current else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MT-{cycle}.json"), "w"), indent=1)
    print(f"MT {cycle}: {len(out)} legislative candidates")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
        fetch(c)
