#!/usr/bin/env python3
"""
Michigan state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Bureau of Elections' MiTN campaign finance export (mi-boe.entellitrak.com; the old nictusa dump is gone).

  python3 scripts/fetch-state-leg-finance-mi.py [YEAR ...]       default 2016 (House only; the Senate is elected in 2014/2018)

The export list (cfrexportresults, JSON, after a cookie-setting page load) gives the current download
id of each year's "Contribution" file (ids change with the nightly refresh); each is a zip of
tab-separated itemized contributions with committee type, candidate name, can_office_sought and
can_district_sought. A cycle = rows of candidate committees for State Representative / State Senator
received in Y-1 or Y, read from the files for Y-1, Y and Y+1 (the January annual statement can carry
late-December money). Tom Leonard, HD-93, 2016: $174,055.

Output: data-entry/state-leg-finance/portal-raw/MI-{year}.json. Zips cached in scratch portal-cache/mi/.
"""
import collections
import csv
import datetime
import io
import json
import os
import re
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/mi"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://mi-boe.entellitrak.com/etk-mi-boe-prod/page.request.do"
SOURCE = "Michigan Bureau of Elections MiTN (itemized contributions)"
OFFICES = {"Representative in State Legislature": "house", "State Senator": "senate"}
csv.field_size_limit(10**9)


def curl(url, out=None):
    jar = os.path.join(CACHE, "cookies")
    args = ["curl", "-sS", "--max-time", "1200", "-A", UA, "-b", jar, "-c", jar, url] + (["-o", out] if out else [])
    return subprocess.run(args, capture_output=True, check=True).stdout


def contribution_zip(year, ids):
    p = os.path.join(CACHE, f"contrib-{year}.zip")
    if not os.path.exists(p):
        curl(f"{BASE}?page=gov.mi.boe.component.cfrexport.page.cfrexportfile&id={ids[year]}", p)
    return p


def main(years):
    os.makedirs(CACHE, exist_ok=True)
    curl(f"{BASE}?page=gov.mi.boe.component.cfrexport.page.cfrexportdownload")
    listing = json.loads(curl(f"{BASE}?page=gov.mi.boe.component.cfrexport.page.cfrexportresults&pageSize=200&pageNumber=1&sortDirection=DESC&sortBy=year&type="))
    ids = {x["year"]: x["download"] for x in listing["data"]["list"] if x["transactiontype"] == "Contribution"}
    for year in years:
        tot = collections.defaultdict(float)
        for y in (year - 1, year, year + 1):
            if y not in ids:
                continue
            z = zipfile.ZipFile(contribution_zip(y, ids))
            for name in z.namelist():
                with z.open(name) as fh:
                    for r in csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1"), delimiter="\t", quoting=csv.QUOTE_NONE):
                        chamber = OFFICES.get(r.get("can_office_sought") or "")
                        if r.get("com_type") != "Candidate" or not chamber or (r.get("received_date") or "")[-4:] not in (str(year - 1), str(year)):
                            continue
                        try:
                            amt = float(r["amount"] or 0)
                        except ValueError:
                            continue
                        tot[(f'{r["can_first_name"]} {r["can_last_name"]}'.strip(), chamber, (lambda m: str(int(m.group(1))) if m else "")(re.search(r"(\d+)", r["can_district_sought"] or "")), r.get("can_political_party"))] += amt
        out = [{"name": n, "party": p, "chamber": ch, "district": d or None, "contributions": round(v, 2)} for (n, ch, d, p), v in tot.items()]
        body = {"state": "MI", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"MI-{year}.json"), "w"), indent=1)
        print(f"MI {year}: {len(out)} legislative candidates")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016])
