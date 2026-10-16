#!/usr/bin/env python3
"""
State legislative fundraising from the two state portals built on Civix's campaign-finance platform
(Oklahoma Ethics Commission "Guardian", Nebraska NADC from 2022), through their public Political Race
search: one search per election, office and district returns every candidate committee of that race
with its totals over all of the committee's filing years for that election — the cycle total, which
a calendar-year bulk file would split (Charles McCall, OK HD-22, raised $463k for 2022, only $203k of
it in calendar 2022).

  python3 scripts/fetch-state-leg-finance-civix.py OK [CYCLE ...]
  python3 scripts/fetch-state-leg-finance-civix.py NE [CYCLE ...]       (2022 onward; older NE is another system)

Contributions = Monetary + In-Kind contributions (OK) / "Receipts From All Sources" (NE).
Every candidate in the race comes back, primary losers included, with the district from the
search itself; scripts/assign-state-leg-finance.ts keeps the general-election candidates.
Pages are cached under the scratch portal-cache/{st}/ (delete to refetch).

Output: data-entry/state-leg-finance/portal-raw/{ST}-{cycle}.json (portal-raw shape, see the assign script).
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

SITES = {
    "OK": {
        "base": "https://guardian.ok.gov", "source": "Oklahoma Ethics Commission (race totals, monetary + in-kind)",
        "elections": {2016: "6", 2018: "7", 2020: "26", 2022: "32", 2024: "35", 2026: "41"},
        "jurisdictionType": "1", "committeeType": None, "yearToShow": None,
        "offices": {"house": "16", "senate": "15"},
    },
    "NE": {
        "base": "https://nadc-e.nebraska.gov", "source": "Nebraska Accountability and Disclosure Commission (race totals)",
        "elections": {2022: "34", 2024: "44", 2026: "57"},
        "jurisdictionType": "2", "committeeType": "3", "yearToShow": "-2",
        "offices": {"senate": "10"},  # the unicameral legislature is "senate" in the atlas
    },
}


class Session:
    def __init__(self, base):
        self.url = base + "/PublicSite/SearchPages/PoliticalRaceSearch.aspx"
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.op.addheaders = [("User-Agent", UA)]

    def post(self, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        for attempt in range(4):
            try:
                return self.op.open(self.url, body, timeout=90).read().decode("utf-8", "replace")
            except Exception as e:  # noqa: BLE001 - transient portal errors
                if attempt == 3:
                    raise
                print(f"  retry after {e}", file=sys.stderr)
                time.sleep(10 * (attempt + 1))


def fields(h):
    f = {}
    for tag in re.findall(r"<input[^>]*>", h):
        n = re.search(r'name="([^"]+)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        if n and (n.group(1).startswith("__") or "HiddenField" in n.group(1)):
            f[html.unescape(n.group(1))] = html.unescape(v.group(1)) if v else ""
    for n, body in re.findall(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', h, re.S):
        m = re.search(r'<option[^>]*selected="selected"[^>]*value="([^"]*)"', body) or re.search(r'<option[^>]*value="([^"]*)"', body)
        f[html.unescape(n)] = m.group(1) if m else ""
    return f


def options(h, name):
    m = re.search(r'<select[^>]*name="' + re.escape(name) + r'"[^>]*>(.*?)</select>', h, re.S)
    return [(v, html.unescape(t).strip()) for v, t in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]*)', m.group(1))] if m else []


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def money(s):
    s = s.replace("$", "").replace(",", "").strip()
    neg = s.startswith("(") and s.endswith(")")
    try:
        v = float(s.strip("()"))
    except ValueError:
        return None
    return -v if neg else v


def grid(h):
    m = re.search(r'<table[^>]*id="ctl00_Content_dgdSearchResults".*?</table>', h, re.S)
    if not m:
        return []
    rows = [[text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)] for tr in re.findall(r"<tr.*?</tr>", m.group(0), re.S)]
    head, out = rows[0], []
    for r in rows[1:]:
        if len(r) == len(head):
            out.append(dict(zip(head, r)))
    return out


def setup(site, election, office):
    s = Session(site["base"])
    h = s.post()
    f = fields(h)
    steps = []
    if site["committeeType"]:
        steps.append(("ctl00$Content$ddlCommitteeType", site["committeeType"]))
    steps += [("ctl00$Content$ddlElection", election), ("ctl00$Content$ddlJurisdictionType", site["jurisdictionType"])]
    for name, value in steps:
        f[name] = value
        f["__EVENTTARGET"] = name
        h = s.post(f)
        f = fields(h)
    juris = [v for v, _ in options(h, "ctl00$Content$ddlJurisdiction") if v not in ("0", "")]
    f["ctl00$Content$ddlJurisdiction"] = juris[0]
    f["__EVENTTARGET"] = "ctl00$Content$ddlJurisdiction"
    h = s.post(f)
    f = fields(h)
    f["ctl00$Content$ddlOffice"] = office
    f["__EVENTTARGET"] = "ctl00$Content$ddlOffice"
    h = s.post(f)
    f = fields(h)
    districts = [(v, t) for v, t in options(h, "ctl00$Content$ddlDistrict") if v not in ("0", "")]
    return s, f, districts


def fetch(st, cycle):
    site = SITES[st]
    election = site["elections"].get(cycle)
    if not election:
        print(f"{st} {cycle}: no election id known, skipped")
        return
    cache = os.path.join(CACHE, st.lower(), str(cycle))
    os.makedirs(cache, exist_ok=True)
    out = []
    for chamber, office in site["offices"].items():
        s, f, districts = setup(site, election, office)
        print(f"{st} {cycle} {chamber}: {len(districts)} districts")
        for value, label in districts:
            num = re.search(r"\d+", label)
            if not num:
                continue
            district = str(int(num.group(0)))
            path = os.path.join(cache, f"{chamber}-{district}.html")
            if os.path.exists(path):
                h = open(path).read()
            else:
                q = dict(f)
                q["ctl00$Content$ddlDistrict"] = value
                if site["yearToShow"]:
                    q["ctl00$Content$ddlYearToShow"] = site["yearToShow"]
                q["__EVENTTARGET"] = ""
                q["ctl00$Content$btnSearch"] = "Search"
                h = s.post(q)
                if "lblRecordsFound" not in h and "No matching" not in h and "dgdSearchResults" not in h:
                    s, f, _ = setup(site, election, office)  # session expired: start over
                    q.update({k: v for k, v in f.items() if k.startswith("__")})
                    h = s.post(q)
                open(path, "w").write(h)
                time.sleep(0.4)
            shown = re.search(r'id="ctl00_Content_lblResultDistrict"[^>]*>([^<]*)<', h)
            if shown and re.search(r"\d+", shown.group(1)) and str(int(re.search(r"\d+", shown.group(1)).group(0))) != district:
                sys.exit(f"{st} {cycle} {chamber} {district}: result page shows {shown.group(1)!r}")
            for r in grid(h):
                name = r.get("Candidate") or r.get("Candidate/Ballot Question") or ""
                if st == "OK":
                    mon, ink = money(r.get("Monetary Contributions", "")), money(r.get("In-Kind Contributions", ""))
                    contrib = None if mon is None and ink is None else (mon or 0) + (ink or 0)
                    spent = money(r.get("Expenditures and Payments", ""))
                else:
                    contrib = money(r.get("Receipts From All Sources", ""))
                    spent = money(r.get("Expenditures And Unpaid Bills", ""))
                out.append({"name": name, "chamber": chamber, "district": district, "contributions": contrib, "expenditures": spent, "status": r.get("Candidate Status") or r.get("Candidate/Ballot Question Status")})
    body = {"state": st, "cycle": cycle, "source": site["source"], "fetched": datetime.date.today().isoformat(),
            "dataThrough": None if cycle >= datetime.date.today().year else f"12/31/{cycle}", "candidates": out}
    if cycle >= datetime.date.today().year:
        body["dataThrough"] = datetime.date.today().strftime("%m/%d/%Y")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"{st}-{cycle}.json"), "w") as fh:
        json.dump(body, fh, indent=1)
    print(f"{st} {cycle}: {len(out)} candidate committees")


if __name__ == "__main__":
    st = sys.argv[1].upper()
    cycles = [int(a) for a in sys.argv[2:]] or sorted(SITES[st]["elections"])
    for c in cycles:
        fetch(st, c)
