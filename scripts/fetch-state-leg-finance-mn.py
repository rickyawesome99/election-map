#!/usr/bin/env python3
"""
Minnesota state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Campaign Finance Board's district viewer (cfb.mn.gov; its bulk downloads hold only gifts over $200).

  python3 scripts/fetch-state-leg-finance-mn.py [YEAR ...]       default 2016

Per district and calendar year: GET the district page (cookie), then POST its /api with
office, district, year and tabname=financial (X-Requested-With and Referer required, else 403). The
reply's HTML table has one column per candidate and rows for individual, lobbyist, committee/fund and
party-unit contributions, public subsidy, other receipts. Contributions = the four contribution rows
(the public subsidy is left out, private money only), summed over years Y-1 and Y.
Districts: House 1A–67B, Senate 1–67. Abigail Whelan, 35A: $9,547.82 in 2016, $19,329.82 for 2015–16.

Output: data-entry/state-leg-finance/portal-raw/MN-{year}.json. Replies cached in scratch portal-cache/mn/.
"""
import collections
import datetime
import html
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/mn"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://cfb.mn.gov/reports-and-data/viewers/campaign-finance/districts-constitutional-offices/"
SOURCE = "Minnesota Campaign Finance Board (private contributions; public subsidy excluded)"
ROWS = ("Individual contributions", "Lobbyist contributions", "Committee / fund contributions", "Party unit contributions")


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def financial(office, district, year):
    p = os.path.join(CACHE, f"{office}-{district}-{year}.json")
    if os.path.exists(p):
        return json.load(open(p))["tabcontent"]
    os.makedirs(CACHE, exist_ok=True)
    jar = os.path.join(CACHE, "cookies")
    page = f"{BASE}{office}/{district}/{year}/"
    for attempt in range(4):
        subprocess.run(["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar, "-o", "/dev/null", page], check=False)
        r = subprocess.run(["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar, "-H", "X-Requested-With: XMLHttpRequest", "-e", page,
                            "-d", f"office={office}&district={district}&year={year}&tabname=financial", BASE + "api"], capture_output=True)
        try:
            d = json.loads(r.stdout)
            break
        except ValueError:
            time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"MN: failed {office} {district} {year}")
    os.makedirs(CACHE, exist_ok=True)
    json.dump(d, open(p, "w"))
    time.sleep(0.4)
    return d["tabcontent"]


def money(s):
    s = s.replace("$", "").replace(",", "").strip()
    neg = s.startswith("(")
    try:
        v = float(s.strip("()"))
    except ValueError:
        return 0.0
    return -v if neg else v


districts = [("House", f"{n}{s}") for n in range(1, 68) for s in "AB"] + [("Senate", str(n)) for n in range(1, 68)]
for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    for office, district in districts:
        for y in (year - 1, year):
            rows = [[text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)] for tr in re.findall(r"<tr.*?</tr>", financial(office, district, y), re.S)]
            head = next((r for r in rows if r and r[0] == "Candidate"), None)
            if not head:
                continue
            for r in rows:
                if r and r[0] in ROWS:
                    for name, v in zip(head[1:], r[1:]):
                        tot[(name, office, district)] += money(v)
    out = [{"name": n, "chamber": "house" if o == "House" else "senate", "district": re.sub(r"[AB]$", "", d) if o == "Senate" else d,
            "contributions": round(v, 2)} for (n, o, d), v in tot.items()]
    body = {"state": "MN", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MN-{year}.json"), "w"), indent=1)
    print(f"MN {year}: {len(out)} candidate-districts")
