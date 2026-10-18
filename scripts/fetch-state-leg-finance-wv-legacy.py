#!/usr/bin/env python3
"""
West Virginia state legislative fundraising for 2016 (the current CFRS, scripts/fetch-state-leg-finance-wv.py,
starts with 2018) from the Secretary of State's "Historical Campaign Finance Reports" search
(apps.sos.wv.gov/elections/candidate-search/, https only).

  python3 scripts/fetch-state-leg-finance-wv-legacy.py [YEAR ...]       default 2016

The search (year, general-election candidates, district contests) lists every legislative candidate
with party and "Delegate District 1" / "Senatorial District 17"; each candidate page lists the reports
(P1–P3 primary, G1–G3 general, A17 annual) as machine-generated PDFs with a text layer, whose
"TOTAL CONTRIBUTIONS ELECTION YEAR-TO-DATE" is cumulative for the CALENDAR election year — so the
largest of them is the year's total. Activity in the year before (2015) is not included.
Pat McGeehan, HD-1, 2016: $14,795.

Output: data-entry/state-leg-finance/portal-raw/WV-{year}.json. Pages cached in scratch portal-cache/wv-legacy/.
"""
import datetime
import html
import http.cookiejar
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/wv-legacy"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://apps.sos.wv.gov/elections/candidate-search/"
SOURCE = "West Virginia Secretary of State historical reports (election year-to-date contributions)"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE  # the server's certificate chain is incomplete
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=ctx))
op.addheaders = [("User-Agent", UA)]


def fetch(url, name, data=None, required=True):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return open(p, "rb").read()
    for attempt in range(4):
        try:
            body = op.open(url, urllib.parse.urlencode(data).encode() if data else None, timeout=120).read()
            break
        except Exception:  # noqa: BLE001
            time.sleep(10 * (attempt + 1))
    else:
        if not required:
            return b""  # one report that will not download: the candidate's other reports still count
        sys.exit(f"WV: failed {url}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(body)
    time.sleep(0.3)
    return body


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    page = op.open(BASE, timeout=120).read().decode("utf-8", "replace")
    form = {m.group(1): m.group(2) for m in re.finditer(r'<input type="hidden" name="([^"]*)" id="[^"]*" value="([^"]*)"', page)}
    form.update({"ctl00$MainContent$ddlYear": str(year), "ctl00$MainContent$ddlCandidateType": "General", "ctl00$MainContent$ddlContestLevel": "District", "ctl00$MainContent$btnSearch": "Search"})
    res = fetch(BASE, f"search-{year}.html", form).decode("utf-8", "replace")
    out = []
    for tr in re.findall(r"<tr.*?</tr>", res, re.S):
        cid = re.search(r"candidate\.aspx\?candidate=(\d+)", tr)
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if not cid or len(cells) < 3:
            continue
        m = re.match(r"(Delegate|Senatorial) District (\d+)", cells[2])
        if not m:
            continue
        cand = fetch(BASE + f"candidate.aspx?candidate={cid.group(1)}", f"c/{cid.group(1)}.html").decode("utf-8", "replace")
        ytd = []
        for doc in sorted(set(re.findall(r"ReadCFRSReport\.aspx\?DocId=(\d+)", cand))):
            pdf = fetch(BASE + f"ReadCFRSReport.aspx?DocId={doc}", f"d/{doc}.pdf", required=False)
            if not pdf.startswith(b"%PDF"):
                continue
            t = subprocess.run(["pdftotext", "-layout", os.path.join(CACHE, "d", f"{doc}.pdf"), "-"], capture_output=True).stdout.decode("utf-8", "replace")
            v = re.search(r"TOTAL CONTRIBUTIONS ELECTION YEAR-TO-DATE[^\d$]*\$?\s*([\d,]+\.\d\d)", t)
            if v:
                ytd.append(float(v.group(1).replace(",", "")))
        out.append({"name": cells[0], "party": cells[1], "chamber": "house" if m.group(1) == "Delegate" else "senate", "district": m.group(2),
                    "contributions": max(ytd) if ytd else None})
    body = {"state": "WV", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"WV-{year}.json"), "w"), indent=1)
    print(f"WV {year}: {len(out)} legislative candidates, {sum(1 for o in out if o['contributions'] is None)} without a readable report")
