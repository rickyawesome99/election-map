#!/usr/bin/env python3
"""
Tennessee state legislative fundraising from the Registry of Election Finance (apps.tn.gov/tncamp),
cycles 2016–2026.

  python3 scripts/fetch-state-leg-finance-tn.py [CYCLE ...]

Candidates: cpsearch.htm (office, election year) → the CSV export: name, party, district, primary and
general results. Only general-election candidates are kept.
Reports: repsearch.htm by office, election year and report type (results cap at 1,000, so one report
type at a time), paged; each report_full.htm page carries "TOTAL CONTRIBUTIONS (other than
adjustments, loans, and interest)" for its period. The election-year filter already ties every report
of the election's cycle to it (a 2022 House cycle runs Early Mid-Year Supplemental 2021 → 4th Quarter
2022). A cycle = the sum over the candidate's reports, one per report name (an amendment, the higher
report id, replaces the original). William Lamberth, HD-44, 2022: $199,724 over 8 reports.

Output: data-entry/state-leg-finance/portal-raw/TN-{cycle}.json. Pages cached in scratch portal-cache/tn/.
"""
import csv
import datetime
import html
import http.cookiejar
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/tn"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://apps.tn.gov/tncamp"
SOURCE = "Tennessee Registry of Election Finance (total contributions per report)"
TODAY = datetime.date.today()
ELECTIONS = {2016: "213", 2018: "214", 2020: "221", 2022: "225", 2024: "230", 2026: "234"}
OFFICES = {"house": "4", "senate": "3"}

op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders = [("User-Agent", UA)]


def req(path, data=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    for attempt in range(5):
        try:
            return op.open(BASE + path, body, timeout=120).read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {path}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    sys.exit(f"TN: failed {path}")


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def candidates(cycle, office):
    req("/public/cesearch.htm")
    req("/public/cpsearch.htm")
    req("/public/cpsearch.htm", {"searchType": "candidate", "name": "", "officeSelection": office, "districtSelection": "", "electionYearSelection": ELECTIONS[cycle],
                                 "partySelection": "", "nameField": "true", "officeField": "true", "districtField": "true", "partyField": "true",
                                 "electionYearField": "true", "primaryField": "true", "generalField": "true", "_continue": "Search"})
    body = req("/public/cpresults.htm?d-1341904-e=1&6578706f7274=1")
    return [r for r in csv.DictReader(io.StringIO(body.lstrip("﻿"))) if (r.get("General") or "").strip()]


def report_links(cycle, office, current):
    path = os.path.join(CACHE, f"links-{cycle}-{office}.json")
    if os.path.exists(path) and not current:
        return json.load(open(path))
    links = {}
    for sel in range(1, 17):
        req("/public/cesearch.htm")
        req("/public/repsearch.htm")
        h = req("/public/repsearch.htm", {"forAll": "candidate", "name": "", "officeSelection": office, "districtSelection": "", "electionYearSelection": ELECTIONS[cycle],
                                          "partySelection": "", "yearSelection": "", "reportSelection": str(sel), "reportField": "true", "nameField": "true",
                                          "partyField": "true", "_continue": "Search"})
        page = 1
        while True:
            found = 0
            for tr in re.findall(r"<tr[^>]*>.*?</tr>", h, re.S):
                m = re.search(r"reportId=(\d+)", tr)
                cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
                if m and len(cells) >= 2:
                    if m.group(1) not in links:
                        found += 1
                    links[m.group(1)] = {"report": cells[0], "name": cells[1]}
            if not found or not re.search(rf"d-1341904-p={page + 1}\b", h):
                break
            page += 1
            h = req(f"/public/represults.htm?d-1341904-p={page}")
    os.makedirs(CACHE, exist_ok=True)
    json.dump(links, open(path, "w"))
    return links


def report_total(rid):
    path = os.path.join(CACHE, "reports", f"{rid}.txt")
    if os.path.exists(path):
        x = open(path).read()
    else:
        x = text(req(f"/search/pub/report_full.htm?reportId={rid}"))
        m = re.search(r"TOTAL CONTRIBUTIONS \(other than[^)]*\) \$?\s*([\d,]+\.\d\d)", x)
        x = m.group(1) if m else ""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w").write(x)
        time.sleep(0.2)
    return float(x.replace(",", "")) if x else None


def same_person(report_name, c):
    last = c["Last Name"].strip().upper()
    first = c["First Name"].strip().upper().split(" ")[0]
    n = report_name.upper()
    return n.startswith(last + ",") and first in n


def fetch(cycle):
    current = cycle >= TODAY.year
    out = []
    for chamber, office in OFFICES.items():
        cands = candidates(cycle, office)
        links = report_links(cycle, office, current)
        print(f"TN {cycle} {chamber}: {len(cands)} general-election candidates, {len(links)} reports")
        for c in cands:
            mine = {}
            for rid, r in links.items():
                if same_person(r["name"], c):
                    if r["report"] not in mine or int(rid) > int(mine[r["report"]]):
                        mine[r["report"]] = rid
            totals = [report_total(rid) for rid in mine.values()]
            known = [t for t in totals if t is not None]
            out.append({"name": f'{c["First Name"].strip()} {c["Last Name"].strip()}', "party": c.get("Party Affliation"), "chamber": chamber,
                        "district": str(int(c["District"])) if c["District"].strip().isdigit() else c["District"].strip(),
                        "contributions": round(sum(known), 2) if known else None, "reports": len(mine)})
    body = {"state": "TN", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if current else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"TN-{cycle}.json"), "w"), indent=1)
    print(f"TN {cycle}: {len(out)} candidates, {sum(1 for o in out if o['contributions'] is None)} without reports")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or sorted(ELECTIONS):
        fetch(c)
