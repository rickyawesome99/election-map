#!/usr/bin/env python3
"""
Pennsylvania state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Department of State's full campaign finance exports (pa.gov .../campaign-finance-data/{YEAR}.zip).

  python3 scripts/fetch-state-leg-finance-pa.py [YEAR ...]       default 2016

Each year's zip: filer_{Y}.txt (one row per report: filer id, cycle, office STH = House / STS = Senate,
district, party, and the report's UNITEMIZED monetary and in-kind totals) and contrib_{Y}.txt (itemized
contributions, up to three amounts a row). Per filer and report cycle the latest submission is kept
(amendments); a filer's money = its itemized rows + unitemized monetary + in-kind, over the zips for Y-1
and Y (the January annual report for Y sits in Y's file). A candidate often has several committees
(Mike Turzai: his own, "Friends of", a leadership fund); leadership funds and PACs are left out and the
assignment keeps the largest of the rest. Frank Dermody, HD-33: ~$1.18M for 2015–16.

Output: data-entry/state-leg-finance/portal-raw/PA-{year}.json. Zips cached in scratch portal-cache/pa/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/pa"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
URL = "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/campaign-finance/campaign-finance-data/{y}.zip"
SOURCE = "Pennsylvania Department of State campaign finance exports (itemized + unitemized contributions)"
OFFICES = {"STH": "house", "STS": "senate"}
csv.field_size_limit(10**9)


def table(y, kind):
    p = os.path.join(CACHE, f"{y}.zip")
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", p, URL.format(y=y)], check=True)
    z = zipfile.ZipFile(p)
    name = next(n for n in z.namelist() if n.lower().endswith(f"{kind}_{y}.txt"))
    with z.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""))


def num(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    info = {}
    for y in (year - 1, year):
        best = {}
        for r in table(y, "filer"):
            if r.get("OFFICE") not in OFFICES:
                continue
            k = (r["FILERID"], r["CYCLE"])
            if k not in best or r["SubmittedDate"] >= best[k]["SubmittedDate"]:
                best[k] = r
        keep = {r["CampaignfinanceID"]: r["FILERID"] for r in best.values()}
        for r in best.values():
            tot[r["FILERID"]] += num(r["MONETARY"]) + num(r["INKIND"])
            info[r["FILERID"]] = r
        for c in table(y, "contrib"):
            fid = keep.get(c["CampaignFinanceID"])
            if fid:
                tot[fid] += num(c["CONTAMT1"]) + num(c["CONTAMT2"]) + num(c["CONTAMT3"])
    out = []
    for fid, v in tot.items():
        r = info[fid]
        if re.search(r"leadership|\bpac\b|caucus", r["FILERNAME"], re.I):
            continue
        out.append({"name": r["FILERNAME"], "party": r.get("PARTY"), "chamber": OFFICES[r["OFFICE"]], "district": str(int(r["DISTRICT"])) if (r["DISTRICT"] or "").isdigit() else r["DISTRICT"],
                    "committee": fid, "contributions": round(v, 2)})
    body = {"state": "PA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"PA-{year}.json"), "w"), indent=1)
    print(f"PA {year}: {len(out)} legislative filers")
