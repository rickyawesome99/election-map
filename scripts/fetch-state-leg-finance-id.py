#!/usr/bin/env python3
"""
Idaho state legislative fundraising for the 2016 and 2018 cycles (2020 on: scripts/fetch-state-leg-finance-id-sunshine.py) from the
Secretary of State's campaign finance archive (archive.sos.idaho.gov/ELECT/Finance/{Y}/{Y}_cand_cont.xlsx).

  python3 scripts/fetch-state-leg-finance-id.py [YEAR ...]       default 2016; 2018 too

One workbook per election cycle (2015-dated contributions are in the 2016 file) with candidate, party,
district, office ("State Senator" / "State Representative, Position A|B"), contribution type and amount.
Cash and in-kind rows are summed per candidate; loans are left out. KNOWN UNDERCOUNT: only itemized
contributions (over $50) are in the file. Scott Bedke, HD-27A, 2016: $79,050.

Output: data-entry/state-leg-finance/portal-raw/ID-{year}.json. Workbooks cached in scratch portal-cache/id/.
"""
import collections
import datetime
import json
import os
import subprocess
import sys
import warnings

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/6b494d78-e452-4e2a-a736-93ff75a64a87/scratchpad/portal-cache/id"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Idaho Secretary of State archive (itemized contributions over $50 only)"
# The 2018 workbook (2017- and 2018-dated rows) is complete: it reproduces the reports' calendar-year-to-date total
# contributions exactly (James Woodward, SD-1: 2017 $24,345.00 on his 2017 annual report, 2018 $40,733.79 on his
# January 2019 report).
SOURCES = {2018: "Idaho Secretary of State archive, 2018 candidate contribution file (matches the reports' calendar-year-to-date totals)"}

# 2018's full workbook is candidate_contributions.xlsx with its own column names (2018_cand_cont.xlsx in the same
# folder holds only ~2,000 mostly statewide rows); mapped onto the 2016 names.
FILES = {2018: "candidate_contributions.xlsx"}
COLS_2018 = {"LastName": "CandLast", "FirstName": "CandFirst", "PartyName": "Party", "OfficeName": "Office",
             "ContributorAmount": "ContrAmount", "Contribution Type": "ContrType"}

for year in [int(a) for a in sys.argv[1:]] or [2016]:
    name = FILES.get(year, f"{year}_cand_cont.xlsx")
    p = os.path.join(CACHE, f"{year}_{name}" if year in FILES else name)
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", p, f"https://archive.sos.idaho.gov/ELECT/Finance/{year}/{name}"], check=True)
    rows = openpyxl.load_workbook(p, read_only=True).active.iter_rows(values_only=True)
    head = [COLS_2018.get(h, h) for h in next(rows)] if year in FILES else next(rows)
    tot = collections.defaultdict(float)
    for r in rows:
        r = dict(zip(head, r))
        if (r.get("ContrType") or "") == "In Kind":
            r["ContrType"] = "In-Kind"
        office = r.get("Office") or ""
        if not office.startswith(("State Senator", "State Representative")) or (r.get("ContrType") or "") == "Loan":
            continue
        key = (f'{r.get("CandFirst") or ""} {r.get("CandLast") or ""}'.strip(), "senate" if office.startswith("State Senator") else "house", str(r.get("District") or ""), r.get("Party"))
        try:
            tot[key] += float(r.get("ContrAmount") or 0)
        except (TypeError, ValueError):
            pass
    out = [{"name": n, "party": pty, "chamber": ch, "district": d or None, "contributions": round(v, 2)} for (n, ch, d, pty), v in tot.items()]
    body = {"state": "ID", "cycle": year, "source": SOURCES.get(year, SOURCE), "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"ID-{year}.json"), "w"), indent=1)
    print(f"ID {year}: {len(out)} legislative candidates")
