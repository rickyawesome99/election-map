#!/usr/bin/env python3
"""
Nevada state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's full campaign finance database dump, the official copy of 2021-10-27 that the
Investigative Reporting Workshop keeps public (nvsos.gov is behind Incapsula and a fresh dump needs an
account): publicaccountability.s3.amazonaws.com/IRW/raw_backup/nv/CampaignFinance.43993.102721094009.zip

  python3 scripts/fetch-state-leg-finance-nv.py [YEAR ...]       default 2016

Fixed-width files (layout per the IRW diary): Cntrbt (contribution id, report id, candidate id, date,
amount, type), Cnddt (candidate id, first, last, party, office "State Assembly, District 8"), Rpr
(report id, superseded flag at column 175). Monetary and in-kind contributions dated Y-1..Y, on reports
that were not superseded by an amendment, summed per candidate. The office is the candidate's as of
2021, so it goes to the assignment as a hint only. Jason Frierson, AD-8, 2015–16: $546,222.

Output: data-entry/state-leg-finance/portal-raw/NV-{year}.json. The zip is cached in scratch portal-cache/nv/.
"""
import collections
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/nv"
URL = "https://publicaccountability.s3.amazonaws.com/IRW/raw_backup/nv/CampaignFinance.43993.102721094009.zip"
SOURCE = "Nevada Secretary of State database dump (2021 copy via IRW; monetary + in-kind contributions)"

path = os.path.join(CACHE, "nv.zip")
if not os.path.exists(path):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sSf", "-o", path, URL], check=True)
z = zipfile.ZipFile(path)


def lines(tag):
    name = next(n for n in z.namelist() if f".{tag}." in n)
    with z.open(name) as fh:
        yield from io.TextIOWrapper(fh, encoding="latin-1")


superseded = {l[0:10].strip() for l in lines("Rpr") if len(l) > 175 and l[175] == "T"}
cands = {}
for l in lines("Cnddt"):
    office = l[120:180].strip()
    m = re.match(r"State (Assembly|Senate), District (\d+)", office)
    # A 2016 legislator who ran for another office later carries that office here: keep every candidate,
    # with the legislative office only as a hint.
    cands[l[0:10].strip()] = {"name": f"{l[10:35].strip()} {l[35:60].strip()}", "party": l[60:120].strip(),
                              "chamber": ("house" if m.group(1) == "Assembly" else "senate") if m else None, "district": m.group(2) if m else None}

for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    for l in lines("Cntrbt"):
        cid = l[20:30].strip()
        if cid not in cands or l[10:20].strip() in superseded or l[46:50] not in (str(year - 1), str(year)):
            continue
        if l[70:100].strip() not in ("Monetary Contribution", "In Kind Contribution"):
            continue
        try:
            tot[cid] += float(l[50:70].strip() or 0)
        except ValueError:
            pass
    out = [dict(cands[c], contributions=round(v, 2)) for c, v in tot.items()]
    body = {"state": "NV", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"NV-{year}.json"), "w"), indent=1)
    print(f"NV {year}: {len(out)} legislative candidates")
