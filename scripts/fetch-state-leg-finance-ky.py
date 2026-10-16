#!/usr/bin/env python3
"""
Kentucky state legislative fundraising from the Registry of Election Finance (KREF) public search,
cycles 2016–2026.

  python3 scripts/fetch-state-leg-finance-ky.py [CYCLE ...]

Kentucky keeps one account per election: a candidate has a PRIMARY account and a GENERAL account,
and the general's receipts open with the primary's leftover balance booked as "Other Receipts". So a
cycle's contributions are, per account, the latest report's "Campaign Total" column — cash +
anonymous + unitemized + itemized + PAC + executive committee + caucus contributions + in-kind, i.e.
Total Monetary Receipts less Other Receipts plus Total In-Kind — summed over the candidate's primary
and general accounts for that office and district.

  CandidateSearch?ElectionDate=&ElectionType=&OfficeSought=   accounts (name, district, candidate id)
  CandidateSearch/CandidateReports/{id}                        reports, newest first
  CandidateSearch/ContributorDetails/{reportId}?candidateId=   the report summary with Campaign Total

Party is not in the search; scripts/assign-state-leg-finance.ts joins by name within the district.
Output: data-entry/state-leg-finance/portal-raw/KY-{cycle}.json. Pages cached in scratch portal-cache/ky/.
"""
import datetime
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ky"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://secure.kentucky.gov/kref/publicsearch"
SOURCE = "Kentucky Registry of Election Finance (primary + general accounts)"


def get(path, cache_name=None, refresh=False):
    if cache_name:
        p = os.path.join(CACHE, cache_name)
        if os.path.exists(p) and not refresh:
            return open(p, encoding="utf-8").read()
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--http1.1", "-A", UA, "--max-time", "90", BASE + path], capture_output=True)
        if r.returncode == 0 and r.stdout:
            break
        time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"KY: failed {path}")
    body = r.stdout.decode("utf-8", "replace")
    if cache_name:
        os.makedirs(os.path.dirname(os.path.join(CACHE, cache_name)), exist_ok=True)
        open(os.path.join(CACHE, cache_name), "w", encoding="utf-8").write(body)
        time.sleep(0.3)
    return body


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def money(s):
    s = s.replace("$", "").replace(",", "").strip()
    neg = s.startswith("(") or s.startswith("-")
    try:
        v = float(s.strip("()-"))
    except ValueError:
        return None
    return -v if neg else v


def election_dates(cycle):
    dates = json.loads(get("/GetAllElectionDates"))
    ds = [datetime.datetime.strptime(d, "%m/%d/%Y").date() for d in dates]
    general = [d for d in ds if d.year == cycle and d.month == 11]
    primary = [d for d in ds if d.year == cycle and d.month in (5, 6)]
    fmt = lambda d: f"{d.month}/{d.day}/{d.year}"
    return (fmt(general[0]) if general else None), (fmt(max(primary)) if primary else None)


def offices(date, etype):
    body = get(f"/GetOfficeByDate_Type?electionDate={date}&electionType={etype}")
    try:
        names = json.loads(body)
    except ValueError:
        return []
    return [o for o in names if o.startswith("STATE REPRESENTATIVE") or o.startswith("STATE SENATOR")]


def accounts(date, etype, office, current):
    q = urllib.parse.urlencode({"ElectionDate": date, "ElectionType": etype, "OfficeSought": office, "ExemptionStatus": "All", "IsActiveFlag": "All", "pageSize": 1000})
    body = get(f"/CandidateSearch?{q}", f"search/{date.replace('/', '-')}-{etype}-{office}.html", refresh=current)
    out = []
    for tr in re.findall(r"<tr>.*?</tr>", body, re.S):
        m = re.search(r'CandidateReports/(\d+)">([^<]*)<', tr)
        if not m:
            continue
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        dist = re.search(r"(\d+)", cells[3]) if len(cells) > 3 else None
        if not dist:
            continue
        out.append({"id": m.group(1), "name": text(m.group(2)), "district": str(int(dist.group(1))), "chamber": "house" if "REPRESENTATIVE" in office else "senate", "receipts": money(cells[6]) if len(cells) > 6 else None})
    return out


def account_total(cid, current):
    reports = get(f"/CandidateSearch/CandidateReports/{cid}", f"reports/{cid}.html", refresh=current)
    links = re.findall(r"ContributorDetails/(\d+)\?candidateId=\d+", reports)
    if not links:
        return None, None
    latest = links[0]
    body = get(f"/CandidateSearch/ContributorDetails/{latest}?candidateId={cid}", f"details/{latest}.html")
    rows = {}
    section = ""
    for tr in re.findall(r"<tr.*?</tr>", body, re.S):
        cells = [text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        if len(cells) == 1:
            section = cells[0]
        elif len(cells) >= 4:
            rows[(section, cells[0])] = money(cells[3])
    monetary = rows.get(("Receipts", "Total Monetary Receipts"))
    other = rows.get(("Receipts", "Other Receipts")) or 0
    inkind = rows.get(("In-Kind Contributions", "Total In-Kind Contributions")) or 0
    spent = rows.get(("Expenditures", "Expenditures"))
    if monetary is None:
        return None, spent
    return round(monetary - other + inkind, 2), spent


def fetch(cycle):
    current = cycle >= datetime.date.today().year
    general, primary = election_dates(cycle)
    if not general:
        print(f"KY {cycle}: no general election date")
        return
    totals = defaultdict(lambda: {"contributions": 0.0, "expenditures": 0.0, "known": False})
    general_keys = set()
    for date, etype in ((general, "GENERAL"), (primary, "PRIMARY")):
        if not date:
            continue
        for office in offices(date, etype):
            accts = accounts(date, etype, office, current)
            print(f"KY {cycle} {etype} {office}: {len(accts)} accounts")
            for a in accts:
                key = (a["name"], a["chamber"], a["district"])
                if etype == "GENERAL":
                    general_keys.add(key)
                elif key not in general_keys:
                    continue  # a primary loser: never on the general ballot
                c, s = account_total(a["id"], current)
                t = totals[key]
                if c is not None:
                    t["contributions"] += c
                    t["known"] = True
                if s is not None:
                    t["expenditures"] += s
    out = [{"name": n, "chamber": ch, "district": d, "contributions": round(t["contributions"], 2) if t["known"] else None, "expenditures": round(t["expenditures"], 2)} for (n, ch, d), t in sorted(totals.items())]
    body = {"state": "KY", "cycle": cycle, "source": SOURCE, "fetched": datetime.date.today().isoformat(),
            "dataThrough": datetime.date.today().strftime("%m/%d/%Y") if current else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"KY-{cycle}.json"), "w") as fh:
        json.dump(body, fh, indent=1)
    print(f"KY {cycle}: {len(out)} general-election candidate accounts")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
        fetch(c)
