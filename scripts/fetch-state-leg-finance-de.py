#!/usr/bin/env python3
"""
Delaware state legislative fundraising from the Department of Elections' CFRS
(cfrs.elections.delaware.gov), cycles 2016–2026.

  python3 scripts/fetch-state-leg-finance-de.py [CYCLE ...]

The receipts search (Public/ViewReceipts) takes a date range and its CSV export
(Public/ExportCSVNew) returns the WHOLE result set: every receipt of every committee, with CF_ID,
receiving committee and office ("District 14 (State Representative)"). The form must be posted with
every field present, even empty, or the server refuses. A cycle = receipts dated Jan 1 of Y-1
through Dec 31 of Y (two years for both chambers, though senators serve four), contribution rows only
(loans, refunds, transfers, other income, reimbursements left out); the "Total of Contributions not
exceeding $100" rows carry the unitemized money. A committee's office is its most common non-empty
office; the committee name ("Friends for Pete Schwartzkopf") carries the candidate's name, which
scripts/assign-state-leg-finance.ts matches within the district. Schwartzkopf, House 14, 2021–22: ~$72k.

Output: data-entry/state-leg-finance/portal-raw/DE-{cycle}.json. CSVs cached in scratch portal-cache/de/.
"""
import csv
import datetime
import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/de"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://cfrs.elections.delaware.gov/Public/"
SOURCE = "Delaware Department of Elections CFRS (contributions, two calendar years)"
TODAY = datetime.date.today()
SKIP = {"Candidate Loan", "Non Candidate Loan", "Other Income", "Refund/Rebate", "Transfer", "Forgiven", "Expense Reimbursement", "Data Conversion"}
EMPTY = ("ContributionTypeData ContributionTypeLabel ContributorTypeData ContributorTypeLabel FilingPeriodNameLabel FilingYearLabel FixedAssetsLabel MemberId "
         "OfficeData OfficeLabels contributorBusinessName hdnFixedAssets hdnTP hdnddlCounty hdnddlOffice hdnddlOfficeSought hdnddljurisdiction tdFilingPeriod "
         "tdFilingYear tdFixedAssets txtAmountRangeFrom txtAmountRangeTo txtContributorName txtFirstName txtReceivingRegistrant txtStreet txtTown txtZipCode "
         "txtZipExt ContributorType ContributionType FilingYear FilingPeriodName ddlOffice ddlCounty ddljurisdiction ddlOfficeSought ddlState ddlEmployerOccupation").split()


def receipts(cycle):
    path = os.path.join(CACHE, f"de{cycle}.csv")
    if not os.path.exists(path) or cycle >= TODAY.year:
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        op.addheaders = [("User-Agent", UA)]
        op.open(BASE + "ViewReceipts", timeout=120).read()
        form = {k: "" for k in EMPTY}
        form.update({"dtStartDate": f"01/01/{cycle - 1}", "dtEndDate": f"12/31/{cycle}", "btnSearch": "Search"})
        op.open(BASE + "ViewReceipts?theme=vista", urllib.parse.urlencode(form).encode(), timeout=300).read()
        body = op.open(BASE + "ExportCSVNew?page=1&orderBy=~&filter=~&Grid-size=15&theme=vista", timeout=600).read()
        if not body.startswith(b"Contribution Date") and not body.lstrip(b"\xef\xbb\xbf").startswith(b"Contribution Date"):
            sys.exit(f"DE {cycle}: export did not return the CSV")
        os.makedirs(CACHE, exist_ok=True)
        open(path, "wb").write(body)
    return path


def fetch(cycle):
    total = defaultdict(float)
    offices = defaultdict(Counter)
    names = {}
    with open(receipts(cycle), encoding="utf-8-sig", errors="replace") as fh:
        for r in csv.DictReader(fh):
            cid = r.get("CF_ID") or ""
            if not re.fullmatch(r"\d{8}", cid):
                continue  # a row shifted by an unquoted comma
            names[cid] = re.sub(r"\s+", " ", r.get("Receiving Committee") or "").strip()
            if r.get("Office"):
                offices[cid][r["Office"]] += 1
            if (r.get("Contribution Type") or "") in SKIP:
                continue
            try:
                total[cid] += float(r["Contribution Amount"])
            except (TypeError, ValueError):
                pass
    out = []
    for cid, cnt in offices.items():
        office = cnt.most_common(1)[0][0]
        m = re.match(r"District (\d+) \(State (Representative|Senator)\)", office)
        if not m:
            continue
        out.append({"name": names[cid], "committee": cid, "chamber": "house" if m.group(2) == "Representative" else "senate", "district": m.group(1),
                    "contributions": round(total.get(cid, 0.0), 2)})
    body = {"state": "DE", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"DE-{cycle}.json"), "w"), indent=1)
    print(f"DE {cycle}: {len(out)} legislative committees")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
        fetch(c)
