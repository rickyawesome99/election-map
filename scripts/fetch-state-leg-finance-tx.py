#!/usr/bin/env python3
"""
Texas state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the Texas
Ethics Commission's full campaign finance CSV database (TEC_CF_CSV.zip, ~1 GB; download it whole —
CloudFront refuses after a few dozen range requests).

  python3 scripts/fetch-state-leg-finance-tx.py [YEAR ...]       default 2016

cover.csv: one row per report. Candidate/officeholder (COH) reports not superseded (infoOnlyFlag), with a
period ending in Y-1 or Y, of filers seeking or holding State Representative / State Senator (district
from the seek office, else the held one). Their contributions = the report's itemized rows in
contribs_##.csv (same superseded rule) + the cover's unitemized amount. The cover's own
totalContribAmount is NOT used: it is blank on about a quarter of these reports (Kelly Hancock, SD-9,
would come out $0). Sarah Davis, HD-134, 2015–16: ~$1.05M.

Output: data-entry/state-leg-finance/portal-raw/TX-{year}.json. The zip is cached in scratch portal-cache/tx/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/tx"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Texas Ethics Commission campaign finance database (itemized + unitemized contributions)"
OFFICES = {"STATEREP": "house", "STATESEN": "senate"}
csv.field_size_limit(10**9)

path = os.path.join(CACHE, "TEC_CF_CSV.zip")
if not os.path.exists(path):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sSfL", "-A", UA, "-o", path, "https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip"], check=True)
z = zipfile.ZipFile(path)


def table(name):
    with z.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""))


def num(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    reports, info = {}, {}
    for r in table("cover.csv"):
        if r.get("filerTypeCd") != "COH" or r.get("infoOnlyFlag") == "Y" or not (f"{year - 1}0101" <= (r.get("periodEndDt") or "") <= f"{year}1231"):
            continue
        seek, hold = r.get("filerSeekOfficeCd"), r.get("filerHoldOfficeCd")
        if seek not in OFFICES and hold not in OFFICES:
            continue
        reports[r["reportInfoIdent"]] = r["filerIdent"]
        office, dist = (seek, r.get("filerSeekOfficeDistrict")) if seek in OFFICES else (hold, r.get("filerHoldOfficeDistrict"))
        info[r["filerIdent"]] = {"name": r["filerName"], "chamber": OFFICES[office], "district": str(int(dist)) if (dist or "").isdigit() else dist,
                                 "unitemized": info.get(r["filerIdent"], {}).get("unitemized", 0.0) + num(r.get("unitemizedContribAmount"))}
    tot = collections.defaultdict(float)
    for name in sorted(n for n in z.namelist() if re.match(r"contribs_\d+\.csv$", n)):
        for r in table(name):
            fid = reports.get(r.get("reportInfoIdent"))
            if fid and r.get("infoOnlyFlag") != "Y":
                tot[fid] += num(r.get("contributionAmount"))
    out = [{"name": v["name"], "chamber": v["chamber"], "district": v["district"], "committee": fid,
            "contributions": round(tot[fid] + v["unitemized"], 2)} for fid, v in info.items()]
    body = {"state": "TX", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"TX-{year}.json"), "w"), indent=1)
    print(f"TX {year}: {len(out)} legislative filers")
