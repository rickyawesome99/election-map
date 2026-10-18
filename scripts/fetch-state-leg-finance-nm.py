#!/usr/bin/env python3
"""
New Mexico state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's LEGACY campaign finance site, still live (www.cfis.state.nm.us/media/; the new
CFIS starts in 2020).

  python3 scripts/fetch-state-leg-finance-nm.py [YEAR ...]       default 2016

CFIS_Data_Download.aspx (an ASP.NET postback: Transactions, Candidates, filing-period year, all
periods) returns every candidate's transactions for a year; contribution rows (IsContribution = 1)
dated Y-1..Y are summed per candidate across the files for Y-1 and Y. The file has no office or
district, so the name goes to scripts/assign-state-leg-finance.ts. Brian Egolf, HD-47, 2015–16: $196,544.

Output: data-entry/state-leg-finance/portal-raw/NM-{year}.json. CSVs cached in scratch portal-cache/nm/.
"""
import collections
import csv
import datetime
import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/nm"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
URL = "https://www.cfis.state.nm.us/media/CFIS_Data_Download.aspx"
SOURCE = "New Mexico Secretary of State legacy CFIS (contributions)"


def year_csv(y):
    p = os.path.join(CACHE, f"t{y}.csv")
    if not os.path.exists(p):
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        op.addheaders = [("User-Agent", UA)]
        page = op.open(URL, timeout=120).read().decode("utf-8", "replace")
        f = {m.group(1): m.group(2) for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page)}
        x = "ctl00$ContentPlaceHolder1$header1$"
        f.update({x + "ddlCSVSelect": "Transactions", x + "ddlLookFor": "Candidates", x + "ddlFilePeriodYear": str(y), x + "ddlFPCan": "ALL",
                  x + "hfFilePeriodFilter": "ALL", x + "ddlRegisrationYear": "0", x + "ddlViewBy": "Lobbyist", x + "ddlTransRegYear": "0",
                  x + "ddlFPLob": "ALL", x + "Button1": "Download Data"})
        body = op.open(URL, urllib.parse.urlencode(f).encode(), timeout=900).read()
        os.makedirs(CACHE, exist_ok=True)
        open(p, "wb").write(body)
    return p


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    for y in (year - 1, year):
        for r in csv.DictReader(open(year_csv(y), encoding="utf-8-sig", errors="replace")):
            if str(r.get("IsContribution")).strip() not in ("1", "True", "true"):
                continue
            d = r.get("Date Contribution") or ""
            m = re.search(r"(\d{4})", d)
            if not m or m.group(1) not in (str(year - 1), str(year)):
                continue
            try:
                tot[f'{(r.get("First Name") or "").strip()} {(r.get("Last Name") or "").strip()}'.strip()] += float((r.get("Amount") or "0").replace("$", "").replace(",", ""))
            except ValueError:
                pass
    out = [{"name": n, "contributions": round(v, 2)} for n, v in tot.items() if n]
    body = {"state": "NM", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"NM-{year}.json"), "w"), indent=1)
    print(f"NM {year}: {len(out)} candidates")
