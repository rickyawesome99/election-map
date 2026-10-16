#!/usr/bin/env python3
"""
West Virginia state legislative fundraising from the Secretary of State's CFRS (cfrs.wvsos.gov),
cycles 2018–2026. 2016 is not available: the old system was not migrated (its 2016 file has 27 rows).

  python3 scripts/fetch-state-leg-finance-wv.py [CYCLE ...]

Committees: POST /api/Public-Service/Committee/getPublicCandidatesCommitteeDataList — every candidate
committee with its election ("2022 Election"), office (House of Delegates / State Senator), district
and party. A committee serves one election, so its money = every Monetary and In-Kind contribution
row it reported in the yearly contribution files for the election year, the year before and the
year after (post-election reports), from the daily-regenerated bulk CSVs (list, then a signed S3
link). Transfers of excess funds, "Other Income" and returns are left out.
The server's TLS chain is incomplete, hence curl -k. Roger Hanshaw, HoD-62, 2022: $203,888.77.

Output: data-entry/state-leg-finance/portal-raw/WV-{cycle}.json. CSVs cached in scratch portal-cache/wv/.
"""
import csv
import datetime
import json
import os
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/wv"
API = "https://cfrs.wvsos.gov/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "West Virginia Secretary of State CFRS (itemized contributions)"
TODAY = datetime.date.today()
CHAMBER = {"House of Delegates": "house", "State Senator": "senate"}


def post(path, body, out=None):
    # Without a browser UA, Origin and Referer the API answers 403.
    args = ["curl", "-skS", "--max-time", "300", "-X", "POST", "-A", UA, "-H", "Origin: https://cfrs.wvsos.gov", "-H", "Referer: https://cfrs.wvsos.gov/",
            "-H", "Content-Type: application/json", "-d", json.dumps(body), API + path]
    r = subprocess.run(args, capture_output=True, check=True)
    return json.loads(r.stdout)


def contributions_file(year):
    path = os.path.join(CACHE, f"con{year}.csv")
    if os.path.exists(path) and year < TODAY.year - 1:
        return path
    listing = post("/Public-Service/AccessReport/getDataDownloadDataList", {"pageNumber": 1, "pageSize": 200, "dataType": "", "year": ""})
    names = json.dumps(listing)
    import re
    m = re.findall(rf"prd/CFDataDownload/Contributions_{year}_\d+\.csv", names)
    if not m:
        return None
    link = post("/Common-Service/AmazonCloudFront/getDownloadLinkWithoutCookies", {"s3FilePath": sorted(m)[-1]})
    url = link.get("responseData") or link.get("data") or link
    if isinstance(url, dict):
        url = next(v for v in url.values() if isinstance(v, str) and v.startswith("http"))
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sS", "--max-time", "600", "-A", UA, "-o", path, url], check=True)
    return path


def main(cycles):
    os.makedirs(CACHE, exist_ok=True)
    cands = post("/Public-Service/Committee/getPublicCandidatesCommitteeDataList", {"pageNumber": 1, "pageSize": 5000})["responseData"]["data"]
    if not cands:
        sys.exit("WV: empty committee list")
    money = defaultdict(float)
    loaded = set()
    for cycle in cycles:
        for year in (cycle - 1, cycle, cycle + 1):
            if year in loaded or year > TODAY.year:
                continue
            path = contributions_file(year)
            loaded.add(year)
            if not path:
                continue
            with open(path, encoding="utf-8-sig", errors="replace") as fh:
                for r in csv.DictReader(fh):
                    if r["TransactionCategory"] in ("Monetary", "In-Kind"):
                        try:
                            money[r["RegistrantID"]] += float(r["TransactionAmount"].replace(",", "").replace("$", ""))
                        except ValueError:
                            pass
        rows = [c for c in cands if c.get("election") == f"{cycle} Election" and c.get("office") in CHAMBER]
        out = [{"name": c["candidateName"], "party": c.get("party"), "chamber": CHAMBER[c["office"]], "district": str(c.get("district") or "").strip(),
                "contributions": (round(money[c["entityId"]], 2) if c["entityId"] in money else None)} for c in rows]
        body = {"state": "WV", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year - 1 else f"12/31/{cycle + 1}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"WV-{cycle}.json"), "w"), indent=1)
        print(f"WV {cycle}: {len(out)} legislative committees, ${sum(o['contributions'] or 0 for o in out):,.0f}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2018, 2020, 2022, 2024, 2026])
