#!/usr/bin/env python3
"""
Missouri state legislative fundraising from the Missouri Ethics Commission (www.mec.mo.gov — the
bare mec.mo.gov host is behind Incapsula), cycles 2020–2026 (the election search starts at 2020).

  python3 scripts/fetch-state-leg-finance-mo.py [CYCLE ...]

Candidates: CF12_SearchElection.aspx (year → general election date → office) lists every committee
for State Representative / State Senator with candidate, party and district, in one page.
Money: CF12_ContrExpend.aspx advanced search by committee NAME and calendar year, then the results
page's "Export Results to Excel" (an HTML table): every itemized contribution with MECID, committee,
amount, monetary/in-kind. Rows of other committees whose name merely contains the searched one are
dropped. A cycle = calendar years Y-1 and Y. KNOWN UNDERCOUNT: Missouri itemizes only contributions
over $100; the non-itemized small money sits in report totals behind a reCAPTCHA, not read here.
Ashley Aune, HD-14: 2023 $35,819.09, 2024 $100,619.37 itemized.

Output: data-entry/state-leg-finance/portal-raw/MO-{cycle}.json. Pages cached in scratch portal-cache/mo/.
"""
import datetime
import hashlib
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/mo"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://www.mec.mo.gov/MEC/Campaign_Finance/"
P = "ctl00$ctl00$ContentPlaceHolder$ContentPlaceHolder1$"
SOURCE = "Missouri Ethics Commission (itemized contributions over $100 only)"
TODAY = datetime.date.today()
GENERAL = {2020: "11/03/2020", 2022: "11/08/2022", 2024: "11/05/2024", 2026: "11/03/2026"}
OFFICES = {"State Representative": "house", "State Senator": "senate"}


class Session:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.op.addheaders = [("User-Agent", UA)]

    def req(self, page, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        for attempt in range(5):
            try:
                return self.op.open(BASE + page, body, timeout=180).read().decode("utf-8", "replace")
            except Exception as e:  # noqa: BLE001
                print(f"  retry {page}: {e}", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
        sys.exit(f"MO: failed {page}")


def fields(t):
    f = {}
    for tag in re.findall(r"<input[^>]*>", t):
        n = re.search(r'name="([^"]+)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        ty = re.search(r'type="([^"]+)"', tag)
        if n and not (ty and ty.group(1).lower() in ("submit", "button", "image", "checkbox", "radio")):
            f[html.unescape(n.group(1))] = html.unescape(v.group(1)) if v else ""
    for m in re.finditer(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', t, re.S):
        sel = re.search(r'<option[^>]*selected="selected"[^>]*value="([^"]*)"', m.group(2))
        f[html.unescape(m.group(1))] = html.unescape(sel.group(1)) if sel else ""
    return f


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def candidates(cycle, office):
    path = os.path.join(CACHE, f"cands-{cycle}-{office.replace(' ', '')}.json")
    if os.path.exists(path) and cycle < TODAY.year:
        return json.load(open(path))
    s = Session()
    u = "CF12_SearchElection.aspx"
    t = s.req(u)
    kv = {}
    for name, value in (("ddElectionYear", str(cycle)), ("ddElectionDate", GENERAL[cycle]), ("ddPoliticalOffice", office)):
        kv[name] = value
        f = fields(t)
        f.update({P + k: v for k, v in kv.items()})
        f["__EVENTTARGET"] = P + name
        f["__EVENTARGUMENT"] = ""
        t = s.req(u, f)
    f = fields(t)
    f[P + "btnSearch"] = "Search"
    f["__EVENTTARGET"] = ""
    t = s.req(u, f)
    out = []
    for tr in re.findall(r"<tr.*?</tr>", t, re.S):
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) >= 6 and "District" in cells[4]:
            m = re.search(r"District (\d+)", cells[4])
            out.append({"committee": cells[1], "name": cells[2], "party": cells[3], "district": m.group(1) if m else None})
    os.makedirs(CACHE, exist_ok=True)
    json.dump(out, open(path, "w"))
    return out


def committee_year(committee, year):
    key = hashlib.md5(committee.encode()).hexdigest()[:12]
    path = os.path.join(CACHE, "contr", f"{key}-{year}.json")
    if os.path.exists(path) and year < TODAY.year:
        return json.load(open(path))["total"]
    s = Session()
    u = "CF12_ContrExpend.aspx"
    t = s.req(u)
    f = fields(t)
    f["__EVENTTARGET"] = P + "lbtnAdvanced"
    f["__EVENTARGUMENT"] = ""
    t = s.req(u, f)
    f = fields(t)
    f["__EVENTTARGET"] = ""
    f[P + "ddYear"] = str(year)
    f[P + "txtCommName"] = committee
    f[P + "btnSearch"] = "Search"
    t = s.req(u, f)
    total = 0.0
    if "ContrExpendResults" in t or "grvContr" in t:
        r = s.req("CF12_ContrExpendResults.aspx")
        f = fields(r)
        f["__EVENTTARGET"] = ""
        f["ctl00$ContentPlaceHolder$btnExport"] = "Export Results to Excel"
        x = s.req("CF12_ContrExpendResults.aspx", f)
        for tr in re.findall(r"<tr.*?</tr>", x, re.S):
            cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(cells) >= 17 and cells[1].lower() == committee.lower():
                try:
                    total += float(cells[15].replace("$", "").replace(",", "").strip("()"))
                except ValueError:
                    pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"total": round(total, 2)}, open(path, "w"))
    time.sleep(0.3)
    return round(total, 2)


def fetch(cycle):
    out = []
    for office, chamber in OFFICES.items():
        cands = candidates(cycle, office)
        print(f"MO {cycle} {chamber}: {len(cands)} committees")
        for c in cands:
            total = sum(committee_year(c["committee"], y) for y in (cycle - 1, cycle) if y <= TODAY.year)
            out.append({"name": c["name"], "party": c["party"], "chamber": chamber, "district": c["district"], "committee": c["committee"], "contributions": total})
    body = {"state": "MO", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MO-{cycle}.json"), "w"), indent=1)
    print(f"MO {cycle}: {len(out)} candidates")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or sorted(GENERAL):
        fetch(c)
