#!/usr/bin/env python3
"""
Connecticut state legislative fundraising from the State Elections Enforcement Commission's eCRIS
bulk receipts files, election years 2016–2026.

  python3 scripts/fetch-state-leg-finance-ct.py [CYCLE ...]

seec.ct.gov/ecrisreporting/Data/eCrisDownloads/exportdatafiles/
Receipts{Y}ElectionYearCandidateExploratoryCommittees.csv (2022 only as .xlsx): every receipt of every
candidate committee for that election, with district, office sought and candidate name — one file
is already one cycle. PRIVATE contributions only (user rule, 2026-10-16): itemized individuals (B),
small-contributor totals (A), other committees (C), the candidate's personal funds and in-kind
contributions. Left out: Citizens' Election Program public grants (most legislators take one: Martin
Looney, Senate 11, 2022, $112,795), loans, interest, miscellaneous receipts, reimbursements and
in-kind donations "not considered contributions". Amended reports are additive in this file; the
few rows that appear in both an original and an amendment (same committee, contributor, date,
amount, section) are counted once.

Output: data-entry/state-leg-finance/portal-raw/CT-{cycle}.json. Files cached in scratch portal-cache/ct/.
"""
import csv
import datetime
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ct"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
URL = "https://seec.ct.gov/ecrisreporting/Data/eCrisDownloads/exportdatafiles/Receipts{y}ElectionYearCandidateExploratoryCommittees.{ext}"
SOURCE = "Connecticut SEEC eCRIS (private contributions; public grants excluded)"
TODAY = datetime.date.today()
KEEP = re.compile(r"^(Itemized Contributions from Individuals|Total Contributions from Small Contributors|Contributions from Other Committees|Personal Funds of the Candidate|In-Kind Contributions)", re.I)
CHAMBER = {"State Representative": "house", "State Senator": "senate"}


def rows(year):
    os.makedirs(CACHE, exist_ok=True)
    csv_path = os.path.join(CACHE, f"r{year}.csv")
    if not os.path.exists(csv_path) or year >= TODAY.year:
        tmp = csv_path + ".dl"
        subprocess.run(["curl", "-sS", "-A", UA, "-o", tmp, URL.format(y=year, ext="csv")], check=True)
        if open(tmp, "rb").read(9) == b"Committee" or open(tmp, "rb").read(12).lstrip(b"\xef\xbb\xbf").startswith(b"Committee"):
            os.replace(tmp, csv_path)
        else:
            import openpyxl
            xlsx = csv_path + ".xlsx"
            subprocess.run(["curl", "-sSf", "-A", UA, "-o", xlsx, URL.format(y=year, ext="xlsx")], check=True)
            ws = openpyxl.load_workbook(xlsx, read_only=True).active
            with open(csv_path, "w", newline="") as fh:
                w = csv.writer(fh)
                for r in ws.iter_rows(values_only=True):
                    w.writerow(["" if v is None else v for v in r])
            os.remove(tmp)
    with open(csv_path, encoding="utf-8-sig", errors="replace") as fh:
        yield from csv.DictReader(fh)


def fetch(cycle):
    total = defaultdict(float)
    who = {}
    seen = set()
    for r in rows(cycle):
        chamber = CHAMBER.get((r.get("Office Sought") or "").strip())
        if not chamber:
            continue
        cid = r["Committee ID"]
        who[cid] = (f'{(r.get("Candidate First Name") or "").strip()} {(r.get("Candidate Last Name") or "").strip()}'.strip() or r["Committee"], chamber, (r.get("District") or "").strip())
        if not KEEP.match(r.get("Section Name") or ""):
            continue
        key = (cid, r.get("Contributor Name"), r.get("Transaction Date"), r.get("Amount"), r.get("Section Letter"))
        if key in seen:
            continue
        seen.add(key)
        try:
            total[cid] += float(str(r["Amount"]).replace(",", "").replace("$", ""))
        except ValueError:
            pass
    out = [{"name": n, "chamber": ch, "district": d, "committee": cid, "contributions": (round(total[cid], 2) if cid in total else None)} for cid, (n, ch, d) in who.items()]
    body = {"state": "CT", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"CT-{cycle}.json"), "w"), indent=1)
    print(f"CT {cycle}: {len(out)} legislative committees")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
        fetch(c)
