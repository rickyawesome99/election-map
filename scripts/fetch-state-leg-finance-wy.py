#!/usr/bin/env python3
"""
Wyoming state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's WYCF report "Candidates who Received the Largest Total Contributions".

  python3 scripts/fetch-state-leg-finance-wy.py [YEAR ...]       default 2016

Reports/ResearchToolsAndLists.aspx → that report (postback) → election year, contest type 5 (House) or
6 (Senate), contributions dated Jan 1 of Y-1 to Dec 31 of Y → ShowReports.aspx returns a PDF listing
candidate (party), "HOUSE DISTRICT nn" and the amount. Candidates with no contributions are not listed.
Mary Throne, HD-11, 2016: $41,167.17.

Output: data-entry/state-leg-finance/portal-raw/WY-{year}.json. PDFs cached in scratch portal-cache/wy/.
"""
import datetime
import html
import http.cookiejar
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/wy"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
URL = "https://www.wycampaignfinance.gov/WYCFWebApplication/Reports/ResearchToolsAndLists.aspx"
SOURCE = "Wyoming Secretary of State WYCF (total contributions)"


def fields(page):
    f = {}
    for t in re.findall(r"<input[^>]*>", page):
        n = re.search(r'name="([^"]+)"', t)
        v = re.search(r'value="([^"]*)"', t)
        ty = re.search(r'type="([^"]+)"', t)
        if n and not (ty and ty.group(1) in ("submit", "button", "image", "checkbox", "radio")):
            f[html.unescape(n.group(1))] = html.unescape(v.group(1)) if v else ""
    return f


def report_pdf(year, contest):
    path = os.path.join(CACHE, f"{year}-{contest}.pdf")
    if os.path.exists(path):
        return path
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", UA)]
    page = op.open(URL, timeout=120).read().decode("utf-8", "replace")
    f = fields(page)
    f.update({"__EVENTTARGET": "ctl00$BodyContent$lnkSummaryWhoReceivedtheMost", "__EVENTARGUMENT": ""})
    page = op.open(URL, urllib.parse.urlencode(f).encode(), timeout=120).read().decode("utf-8", "replace")
    f = fields(page)
    f.update({"__EVENTTARGET": "", "ctl00$BodyContent$txtElectionYear": str(year), "ctl00$BodyContent$ContestType": contest,
              "ctl00$BodyContent$btnRunReport": "Run Report", "ctl00$BodyContent$txtDateFrom": f"01/01/{year - 1}", "ctl00$BodyContent$txtDateTo": f"12/31/{year}"})
    op.open(URL, urllib.parse.urlencode(f).encode(), timeout=300).read()
    pdf = op.open("https://www.wycampaignfinance.gov/WYCFWebApplication/Reports/ShowReports.aspx", timeout=300).read()
    if not pdf.startswith(b"%PDF"):
        sys.exit(f"WY {year} {contest}: the report did not come back as a PDF")
    os.makedirs(CACHE, exist_ok=True)
    open(path, "wb").write(pdf)
    return path


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    out = []
    for contest, chamber in (("5", "house"), ("6", "senate")):
        t = subprocess.run(["pdftotext", "-layout", report_pdf(year, contest), "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
        for m in re.finditer(r"^(.+?)\s+\((\w+)\)\s+(?:HOUSE|SENATE) DISTRICT 0*(\d+)\s+\$([\d,]+\.\d\d)", t, re.M):
            out.append({"name": m.group(1).strip(), "party": m.group(2), "chamber": chamber, "district": m.group(3), "contributions": float(m.group(4).replace(",", ""))})
    body = {"state": "WY", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"WY-{year}.json"), "w"), indent=1)
    print(f"WY {year}: {len(out)} candidates")
