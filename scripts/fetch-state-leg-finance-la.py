#!/usr/bin/env python3
"""
Louisiana state legislative fundraising from the Ethics Administration's bulk contribution files,
elections 2019 and 2023 (the legislature is elected every four years, in odd years).

  python3 scripts/fetch-state-leg-finance-la.py [YEAR ...]

ethics.la.gov/Pub/CampFinan/DataDownload/ContributionReports/Contributions_{2016_to_2019,
2020_to_2023}.csv: every itemized contribution e-filed by every candidate in the state, with the
filer's name and number but no office (paper filers are not in it). A cycle = the four years up to
and including the election (2016–2019 for 2019, matching the term), contribution types CONTRIB,
IN-KIND and ANON. scripts/assign-state-leg-finance.ts keeps the filers whose name matches a general-
election legislative candidate (Louisiana's jungle primary: the Oct/Nov candidates on our list).
Sums match the report summaries exactly (report LA-116514: $58,150.00 + $1,885.59 in-kind).

Output: data-entry/state-leg-finance/portal-raw/LA-{year}.json. CSVs (~150–180 MB) cached in scratch portal-cache/la/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/la"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Louisiana Ethics Administration (e-filed itemized contributions, four-year cycle)"
FILES = {2019: "Contributions_2016_to_2019.csv", 2023: "Contributions_2020_to_2023.csv"}


def fetch(year):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, FILES[year])
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", path, f"https://www.ethics.la.gov/Pub/CampFinan/DataDownload/ContributionReports/{FILES[year]}"], check=True)
    total = defaultdict(float)
    names = {}
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        for r in csv.DictReader(fh):
            if r["ContributionType"] not in ("CONTRIB", "IN-KIND", "ANON"):
                continue
            try:
                total[r["FilerNumber"]] += float(r["ContributionAmt"].replace(",", ""))
            except ValueError:
                continue
            names[r["FilerNumber"]] = f'{r["FilerFirstName"].strip()} {r["FilerLastName"].strip()}'
    out = [{"name": names[f], "filer": f, "contributions": round(v, 2)} for f, v in total.items()]
    body = {"state": "LA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"LA-{year}.json"), "w"), indent=1)
    print(f"LA {year}: {len(out)} filers")


if __name__ == "__main__":
    for y in [int(a) for a in sys.argv[1:]] or sorted(FILES):
        fetch(y)
