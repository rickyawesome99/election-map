#!/usr/bin/env python3
"""
Arkansas state legislative fundraising for 2018–2022 from the ethics disclosure system's LEGACY
filings (reports filed 2017–2022 before the current system; 2024 on: scripts/fetch-state-leg-finance-ar.py).

  python3 scripts/fetch-state-leg-finance-ar-legacy.py [CYCLE ...]

POST /api/PublicLegacyFiledReport/GetPublicLegacyFiledReport (moduleName CF, registrationYear Y) lists
every legacy report with filer, office, report type and dates; POST
/api/PublicFiledReportAndDownload/LegacyDownloadDocument returns the report as a system-generated text
PDF. Line 7 "Total Monetary Contributions" has a CUMULATIVE TOTAL column for the registration, so the
latest contribution report of each legislative registration (by period end, an amendment over the
original; carry-over and debt-retirement reports skipped; a scanned report falls back to the one
before it) is enough; its "District Number:" gives the district. COVERAGE IS PARTIAL: only e-filed reports are here
(paper filers are not) — roughly 115 legislative filers for 2018, 55 for 2020, 192 for 2022.
Jonathan Dismang, Senate 18, 2022 pre-general: $122,411.99 cumulative.

Output: data-entry/state-leg-finance/portal-raw/AR-{cycle}.json. PDFs cached in scratch portal-cache/ar/legacy/.
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ar/legacy"
API = "https://api-ethics-disclosures.sos.arkansas.gov/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Arkansas Secretary of State legacy e-filed reports (cumulative contributions; paper filers missing)"
CHAMBER = {"State Representative": "house", "State Senate": "senate"}


def post(path, body, out=None):
    args = ["curl", "-sS", "--max-time", "300", "-X", "POST", "-A", UA, "-H", "Content-Type: application/json",
            "-H", "Origin: https://ethics-disclosures.sos.arkansas.gov", "-d", json.dumps(body), API + path]
    if out:
        subprocess.run(args + ["-o", out], check=True)
        return None
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)


def reports(year):
    path = os.path.join(CACHE, f"list-{year}.json")
    if not os.path.exists(path):
        d = post("/PublicLegacyFiledReport/GetPublicLegacyFiledReport", {"pageNumber": 1, "pageSize": 10000, "moduleName": "CF", "registrationYear": str(year)})
        os.makedirs(CACHE, exist_ok=True)
        json.dump(d, open(path, "w"))
    d = json.load(open(path))
    items = d["data"]["items"] if isinstance(d.get("data"), dict) else d.get("data") or d.get("items") or []
    return items


def pdf_text(guid):
    pdf = os.path.join(CACHE, f"{guid}.pdf")
    if not os.path.exists(pdf):
        post("/PublicFiledReportAndDownload/LegacyDownloadDocument", {"filerReportGuid": guid, "fileName": "x.pdf"}, out=pdf)
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True).stdout.decode("utf-8", "replace")


def date(s):
    try:
        return datetime.datetime.strptime(s, "%m/%d/%Y").date()
    except (TypeError, ValueError):
        return datetime.date.min


def fetch(cycle):
    regs = {}
    for r in reports(cycle):
        if r.get("officeType") not in CHAMBER or re.search(r"carryover|debt retirement", r.get("fileName") or "", re.I):
            continue  # carry-over and debt-retirement reports have no contributions line
        regs.setdefault(r["legacyFilerRegistrationID"], []).append(r)
    out = []
    for rid, rs in regs.items():
        rs.sort(key=lambda r: (date(r.get("reportEndDate")), r.get("reportVersion") != "Orginal", date(r.get("filedDate"))), reverse=True)
        contrib, district = None, None
        for r in rs:  # newest first; a scanned (image-only) report has no text: the next one stands in
            t = pdf_text(r["filerReportGuid"])
            m = re.search(r"7\. Total Monetary Contributions[^\n]*?\$([\d,]+\.\d\d)\s+\$([\d,]+\.\d\d)", t)
            if m:
                dist = re.search(r"District Number:\s*\n[^\n]*?(\d+)\s*$", t, re.M)
                contrib, district = float(m.group(2).replace(",", "")), dist.group(1) if dist else None
                break
        r = rs[0]
        out.append({"name": re.sub(r"\s+-\s+(Primary|General).*$", "", r["filerName"]), "chamber": CHAMBER[r["officeType"]],
                    "district": district, "contributions": contrib})
    body = {"state": "AR", "cycle": cycle, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"AR-{cycle}.json"), "w"), indent=1)
    print(f"AR {cycle}: {len(out)} legislative registrations ({sum(1 for o in out if o['contributions'] is None)} unparsed)")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2018, 2020, 2022]:
        fetch(c)
