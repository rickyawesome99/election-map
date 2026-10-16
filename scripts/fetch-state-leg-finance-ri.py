#!/usr/bin/env python3
"""
Rhode Island state legislative fundraising from the Board of Elections' ERTS
(ricampaignfinance.com), cycles 2016–2026.

  npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts RI > /tmp/ri.json
  python3 scripts/fetch-state-leg-finance-ri.py /tmp/ri.json [CYCLE ...]

The portal has no bulk export (its CSV link is session-bound and fails), so it is searched by OUR
candidates' surnames: Filings.aspx (office State Representative or State Senator), then a postback
per matching organisation for its Key (OrgID) and its campaigns ("2022 Election; Running for: State
Representative | Democratic"). Money: Reporting/TransactionReport.aspx?OrgID=&BeginDate=&EndDate=
(plain GET) — "Summary Totals" by type for Jan 1 of Y-1 through Dec 31 of Y: every contribution type
(individual, PAC, aggregate, in-kind, party, …) less interest, other receipts, loans, refunds and
bounced checks. No district on either page: scripts/assign-state-leg-finance.ts matches the name
within the chamber. K. Joseph Shekarchi, 2021–22: $955,965 individual + $114,850 PAC (+ in-kind).

Output: data-entry/state-leg-finance/portal-raw/RI-{cycle}.json. Pages cached in scratch portal-cache/ri/.
"""
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import http.cookiejar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ri"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://ricampaignfinance.com/RIPublic/"
SOURCE = "Rhode Island Board of Elections ERTS (contributions, two calendar years)"
TODAY = datetime.date.today()
OFFICES = {"7": "house", "6": "senate"}
NOT_CONTRIBUTIONS = re.compile(r"interest|other receipt|loan|refund|nsf|returned|reimburse", re.I)
SUFFIX = {"jr", "sr", "ii", "iii", "iv"}


def opener():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", UA)]
    return op


def fetch_url(op, url, data=None, tries=5):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    for attempt in range(tries):
        try:
            r = op.open(url, body, timeout=120)
            return r.geturl(), r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {url[:80]}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    if tries < 5:
        return None, None
    sys.exit(f"RI: failed {url}")


def hidden(h):
    d = {}
    for tag in re.findall(r'<input[^>]*type="hidden"[^>]*>', h):
        n = re.search(r'name="([^"]*)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        if n:
            d[n.group(1)] = html.unescape(v.group(1)) if v else ""
    return d


def flat(h):
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "|", h)))
    return re.sub(r"(\| ?)+", "|", t)


def orgs_for(last, office):
    """[{key, name, campaigns: [(year, office, party)]}] for organisations with this surname."""
    path = os.path.join(CACHE, "orgs", f"{office}-{re.sub(r'[^A-Za-z]', '_', last)}.json")
    if os.path.exists(path):
        return json.load(open(path))
    op = opener()
    _, h = fetch_url(op, BASE + "Filings.aspx")
    d = hidden(h)
    d.update({"txtOrgLastName": last, "txtOrgFirstName": "", "txtOrgCity": "", "txtOrgState": "", "txtOrgZip": "", "lstOffice": office,
              "lstParty": "All", "lstDisplayResults": "All", "lnkSubSearchOrg": "Search"})
    _, h2 = fetch_url(op, BASE + "Filings.aspx", d)
    rows = re.findall(r"dgdOrgSearchResults\$ctl(\d+)\$lnkOrgID',''\)\">([^<]*)<", h2)
    out = []
    for idx, name in rows:
        d = hidden(h2)
        d["__EVENTTARGET"] = f"dgdOrgSearchResults$ctl{idx}$lnkOrgID"
        d["__EVENTARGUMENT"] = ""
        _, h3 = fetch_url(op, BASE + "Filings.aspx", d)
        t = flat(h3)
        key = re.search(r"Key:\|(\d+)", t)
        camps = re.findall(r"(\d{4}) Election; Running for: ([^|]*)\|([^|]*)\|", t)
        if key:
            out.append({"key": key.group(1), "name": html.unescape(name).strip(), "campaigns": [[int(y), o.strip(), p.strip()] for y, o, p in camps]})
        time.sleep(0.3)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w"))
    return out


def summary(key, begin, end):
    """Contributions in [begin, end] from the report's Summary Totals; None when the page fails."""
    q = {"OrgID": key, "BeginDate": begin, "EndDate": end, "LastName": "", "FirstName": "", "ContType": "0", "State": "", "City": "",
         "ZIPCode": "", "EmployerName": "", "Amount": "0", "ReportType": "Contrib", "CFStatus": "F", "MPFStatus": "A", "Level": "S", "SumBy": "Type",
         "Sort1": "None", "Direct1": "desc", "Sort2": "None", "Direct2": "desc", "Sort3": "None", "Direct3": "desc", "Site": "Public", "Incomplete": "A", "ContSource": "CF"}
    final, h = fetch_url(opener(), BASE + "Reporting/TransactionReport.aspx?" + urllib.parse.urlencode(q), tries=3)
    if final is None:
        return None
    if "TransactionReport" not in final:
        return 0.0  # redirected to the search page: no records
    t = flat(h)
    seg = t[t.find("Summary Groupings"):t.find("Note: The results below")]
    total = 0.0
    for label, amt in re.findall(r"\|([A-Za-z][^|$]*?) ?\|\(?\$([\d,]+\.\d\d)\)?", seg):
        if label.strip() == "Total" or NOT_CONTRIBUTIONS.search(label):
            continue
        total += float(amt.replace(",", ""))
    return total


def totals(key, cycle):
    path = os.path.join(CACHE, "totals", f"{key}-{cycle}.json")
    if os.path.exists(path) and cycle < TODAY.year:
        return json.load(open(path))["total"]
    total = summary(key, f"01/01/{cycle - 1}", f"12/31/{cycle}")
    if total is None:
        # A big committee's two-year page times out at the CDN (HTTP 522): one year at a time.
        parts = [summary(key, f"01/01/{y}", f"12/31/{y}") for y in (cycle - 1, cycle)]
        total = None if any(p is None for p in parts) else sum(parts)
    if total is not None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        json.dump({"total": total}, open(path, "w"))
    time.sleep(0.3)
    return total


def surname(name):
    toks = [t for t in re.sub(r"\(.*?\)|\".*?\"", " ", name).replace(".", " ").split() if t.lower() not in SUFFIX]
    return toks[-1] if toks else ""


def main(cands_file, cycles):
    cands = json.load(open(cands_file))
    lasts = sorted({surname(c["name"]) for c in cands if surname(c["name"])})
    found = {}
    for i, last in enumerate(lasts):
        for office in OFFICES:
            for o in orgs_for(last, office):
                found[o["key"]] = o
        if i % 50 == 0:
            print(f"RI: {i}/{len(lasts)} surnames searched, {len(found)} organisations")
    for cycle in cycles:
        out = []
        for o in found.values():
            # A sitting member often has not registered the current election yet: their last one stands in.
            years = (cycle, cycle - 2) if cycle >= TODAY.year else (cycle,)
            camp = next((c for y in years for c in o["campaigns"] if c[0] == y and c[1] in ("State Representative", "State Senator")), None)
            if not camp:
                continue
            out.append({"name": o["name"], "party": camp[2], "chamber": "house" if camp[1] == "State Representative" else "senate", "org": o["key"],
                        "contributions": totals(o["key"], cycle)})
        body = {"state": "RI", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"RI-{cycle}.json"), "w"), indent=1)
        print(f"RI {cycle}: {len(out)} legislative campaigns")


if __name__ == "__main__":
    main(sys.argv[1], [int(a) for a in sys.argv[2:]] or [2016, 2018, 2020, 2022, 2024, 2026])
