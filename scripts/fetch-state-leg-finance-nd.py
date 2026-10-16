#!/usr/bin/env python3
"""
North Dakota state legislative fundraising from the Secretary of State's campaign finance search
(cf.sos.nd.gov), cycles 2016–2024. 2026 is not in the search's year list yet (year-end statements
for 2026 arrive in January 2027).

  python3 scripts/fetch-state-leg-finance-nd.py [CYCLE ...]

Candidates: the Telerik search form (cfsearch.aspx), year Y, Year-End statements, filer type
Candidates, page size raised to 2,000 — every candidate committee that filed a year-end statement for
Y, with office and district. Money: showcommittee.aspx?cid=&yr= (plain GET) has the year-end statement,
which covers the whole calendar year: "contributions of $200 or less" + "greater than $200" (North
Dakota itemizes only the latter, so itemized sums would undercount). A cycle = year-end (Y-1) +
year-end (Y). Mary Adams, House 43, 2022 year-end: $4,421.87 + $9,047.10.

Output: data-entry/state-leg-finance/portal-raw/ND-{cycle}.json. Pages cached in scratch portal-cache/nd/.
"""
import datetime
import html
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/nd"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://cf.sos.nd.gov/search/"
SOURCE = "North Dakota Secretary of State (year-end statements)"
TODAY = datetime.date.today()
OFFICES = {"State Representative": "house", "State Senator": "senate"}


def fields(h):
    f = {}
    for tag in re.findall(r"<input[^>]*>", h):
        n = re.search(r'name="([^"]+)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        t = re.search(r'type="([^"]+)"', tag)
        if not n:
            continue
        if t and t.group(1) in ("submit", "button", "image", "checkbox", "radio"):
            if t.group(1) in ("checkbox", "radio") and "checked" in tag:
                f[n.group(1)] = html.unescape(v.group(1)) if v else "on"
            continue
        f[n.group(1)] = html.unescape(v.group(1)) if v else ""
    return f


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def year_end_list(year):
    path = os.path.join(CACHE, f"list-{year}.html")
    if os.path.exists(path):
        h = open(path).read()
    else:
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        op.addheaders = [("User-Agent", UA)]
        post = lambda d=None: op.open(BASE + "cfsearch.aspx", urllib.parse.urlencode(d).encode() if d is not None else None, timeout=120).read().decode("utf-8", "replace")
        f = fields(post())
        f["ctl00$MainContent$rcbxOnlyYear"] = str(year)
        f["ctl00_MainContent_rcbxOnlyYear_ClientState"] = json.dumps({"logEntries": [], "value": str(year), "text": str(year), "enabled": True, "checkedIndices": [], "checkedItemsTextOverflows": False})
        f["__EVENTTARGET"] = "ctl00$MainContent$rcbxOnlyYear"
        f["__EVENTARGUMENT"] = json.dumps({"Command": "Select", "Index": 1})
        f = fields(post(f))
        f["ctl00$MainContent$searchCriteria"] = "rbtnYearEnd"
        f["__EVENTTARGET"] = "ctl00$MainContent$rbtnYearEnd"
        f["__EVENTARGUMENT"] = ""
        f = fields(post(f))
        f["ctl00$MainContent$rcbxFilerType"] = "Candidates"
        f["ctl00_MainContent_rcbxFilerType_ClientState"] = json.dumps({"logEntries": [], "value": "Candidates", "text": "Candidates", "enabled": True, "checkedIndices": [], "checkedItemsTextOverflows": False})
        f["__EVENTTARGET"] = "ctl00$MainContent$searchButton"
        f["__EVENTARGUMENT"] = ""
        h = post(f)
        f = fields(h)
        pager = "ctl00$MainContent$RadGrid3$ctl00$ctl03$ctl01$"
        f[pager + "ChangePageSizeTextBox"] = "2000"
        f["ctl00_MainContent_RadGrid3_ctl00_ctl03_ctl01_ChangePageSizeTextBox_ClientState"] = json.dumps({"enabled": True, "emptyMessage": "", "validationText": "2000", "valueAsString": "2000", "minValue": 1, "maxValue": 2000, "lastSetTextBoxValue": "2000"})
        f["__EVENTTARGET"] = pager + "ChangePageSizeLinkButton"
        f["__EVENTARGUMENT"] = ""
        h = post(f)
        os.makedirs(CACHE, exist_ok=True)
        open(path, "w").write(h)
    rows = {}
    for tr in re.findall(r"<tr[^>]*>.*?</tr>", h, re.S):
        m = re.search(r"showcommittee\.aspx\?cid=(\d+)&yr=\d+' target='_self'>([^<]*)<", tr)
        if not m:
            continue
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        office = next((c for c in cells if c in OFFICES), None)
        if office:
            rows[m.group(1)] = {"cid": m.group(1), "name": text(m.group(2)), "chamber": OFFICES[office]}
    return h, list(rows.values())


def committee(cid, year):
    path = os.path.join(CACHE, f"c{cid}-{year}.html")
    if os.path.exists(path):
        return open(path).read()
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{BASE}showcommittee.aspx?cid={cid}&yr={year}", headers={"User-Agent": UA})
            h = urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace")
            break
        except Exception:  # noqa: BLE001
            time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"ND: failed cid {cid} {year}")
    open(path, "w").write(h)
    time.sleep(0.3)
    return h


def year_end(h):
    """(contributions, district, party) from a committee-year page; contributions None without a year-end statement."""
    x = text(h)
    dist = re.search(r"District (\d+)\b", x)
    party = re.search(r"Political Party (.*?) Running for", x)
    m = re.search(r"Year End \d\d/\d\d/\d\d Year End \d+ \d+ \$([\d,]+\.\d\d) \$([\d,]+\.\d\d)", x)
    contrib = float(m.group(1).replace(",", "")) + float(m.group(2).replace(",", "")) if m else None
    return contrib, dist.group(1) if dist else None, party.group(1).strip() if party else None


def fetch(cycle):
    _, cands = year_end_list(cycle)
    if not cands:
        sys.exit(f"ND {cycle}: empty year-end list (the form flow changed?)")
    out = []
    for c in cands:
        now, district, party = year_end(committee(c["cid"], cycle))
        before, _, _ = year_end(committee(c["cid"], cycle - 1))
        known = [v for v in (before, now) if v is not None]
        out.append({"name": c["name"], "party": party, "chamber": c["chamber"], "district": district,
                    "contributions": round(sum(known), 2) if known else None})
    body = {"state": "ND", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(), "dataThrough": f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"ND-{cycle}.json"), "w"), indent=1)
    print(f"ND {cycle}: {len(out)} legislative candidates")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024]:
        fetch(c)
