#!/usr/bin/env python3
"""
North Carolina state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from
the State Board of Elections' transaction search (cf.ncsbe.gov/CFTxnLkup).

  python3 scripts/fetch-state-leg-finance-nc.py [YEAR ...]       default 2016

The advanced search (antiforgery token, then a form POST) redirects to Results, whose search parameters
are JSON; the paged-data handler returns 500 rows a page for any edited parameters — here candidate
committees (CNC) for the House and Senate (NSHS, NCSN), every receipt type, Jan 1 of Y-1 to Dec 31 of Y.
Contributions = the individual, party, non-party committee, general, outside-source and nonprofit rows
(loans, refunds, interest and reimbursements left out), a transaction counted once. Rows carry the
committee name ("KIRK SHERRILL FOR NC HOUSE") and office but no district: assign-state-leg-finance.ts
finds the candidate whose name the committee name holds. Tim Moore, HD-111, 2015–16: $1,863,422.

Output: data-entry/state-leg-finance/portal-raw/NC-{year}.json. Pages cached in scratch portal-cache/nc/.
"""
import collections
import datetime
import glob
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/nc"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://cf.ncsbe.gov/CFTxnLkup/"
SOURCE = "North Carolina State Board of Elections transactions (contributions)"
KEEP = {"Individual", "Non-Party Comm", "Party Comm", "General", "Outside Source", "Nonprofit"}
RECEIPTS = "'GEN ','OTLN','IND ','PPTY','CPCM','LOAN','RFND','INT ','NFPC','OUTS','GNS ','FRLN','CNRE','LEFO','EPPS','DEBT','DON ','BFND'"


def curl(*args):
    jar = os.path.join(CACHE, "cookies")
    return subprocess.run(["curl", "-sS", "--max-time", "300", "-A", UA, "-b", jar, "-c", jar, *args], capture_output=True, check=True).stdout


def pages(year):
    d = os.path.join(CACHE, str(year))
    if glob.glob(os.path.join(d, "p*.json")) and os.path.exists(os.path.join(d, "done")):
        return sorted(glob.glob(os.path.join(d, "p*.json")))
    os.makedirs(d, exist_ok=True)
    page = curl(BASE + "AdvancedSearch").decode("utf-8", "replace")
    token = re.search(r'name="__RequestVerificationToken" type="hidden" value="([^"]+)"', page).group(1)
    curl("-L", "--data-urlencode", f"__RequestVerificationToken={token}", "--data-urlencode", f"DateFrom=01/01/{year - 1}",
         "--data-urlencode", f"DateTo=12/31/{year}", BASE + "AdvancedSearch")
    params = {"ReceiptType": RECEIPTS, "ExpenditureType": "", "CommitteeType": "'CNC'", "PartyType": "'CST','DEM','GRN','LIB','NAT','NON','OTH','REP','RFM','SOU','UNA'",
              "OfficeType": "'NCSN','NSHS'", "CommitteeIDs": "", "SelectedCommitteeNames": "", "CommitteeName": "", "Cities": "", "Counties": "", "State": "",
              "ZipCodes": "", "DateFrom": f"01/01/{year - 1}", "DateTo": f"12/31/{year}", "OrganizationName": "", "FirstName": "", "LastName": "",
              "NameSoundsLike": False, "NameIsOrg": False, "Purpose": "", "AmountFrom": "", "AmountTo": "", "JobProfession": "", "JobProfSoundsLike": False,
              "Employer": "", "EmployerSoundsLike": False, "PaymentType": "", "Page": 0, "Debug": False, "IsAdvancedSearch": True}
    n, total = 1, None
    while total is None or (n - 1) * 500 < total:
        body = curl("-G", "-H", "X-Requested-With: XMLHttpRequest", "-e", BASE + "Results", BASE + "Results",
                    "--data-urlencode", "handler=PagedData", "--data-urlencode", "searchParamsJson=" + json.dumps(params),
                    "--data-urlencode", "pageSize=500", "--data-urlencode", f"page={n}")
        data = json.loads(body)
        total = data["Total"]
        open(os.path.join(d, f"p{n:04d}.json"), "wb").write(body)
        n += 1
    open(os.path.join(d, "done"), "w").close()
    return sorted(glob.glob(os.path.join(d, "p*.json")))


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    info = {}
    seen = set()
    for p in pages(year):
        for r in json.load(open(p))["Data"]:
            if r.get("TransSubType") not in KEEP:
                continue
            key = (r.get("GroupID"), r.get("Amount"), r.get("OccurDate"), r.get("FullName") or r.get("OrgName"))
            if key in seen:
                continue
            seen.add(key)
            tot[r["SboeID"]] += float(r.get("Amount") or 0)
            info[r["SboeID"]] = (html.unescape(r["CommName"]), "senate" if r.get("CandOfficeCode") == "NCSN" else "house", r.get("PartyCode"))
    out = [{"name": info[k][0], "chamber": info[k][1], "party": info[k][2], "committee": k, "contributions": round(v, 2)} for k, v in tot.items()]
    body = {"state": "NC", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"NC-{year}.json"), "w"), indent=1)
    print(f"NC {year}: {len(out)} candidate committees")
