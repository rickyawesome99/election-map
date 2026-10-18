#!/usr/bin/env python3
"""
Colorado state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's TRACER bulk contribution files.

  python3 scripts/fetch-state-leg-finance-co.py [YEAR ...]       default 2016

tracer.sos.colorado.gov/PublicSite/Docs/BulkDataDownloads/{Y}_ContributionData.csv.zip: every
contribution with committee type, committee and candidate name, amount and whether a later amendment
superseded the row (Amended = Y, dropped). Candidate committees' rows dated Y-1..Y are summed per
committee, returns included as negatives. No office or district: the candidate name goes to
scripts/assign-state-leg-finance.ts, and a committee name that states its seat ("… (STATE SENATE DISTRICT 2)")
passes the chamber and district along. Daniel Kagan, SD-26: $246,642.

Output: data-entry/state-leg-finance/portal-raw/CO-{year}.json. Zips cached in scratch portal-cache/co/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/co"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Colorado Secretary of State TRACER (contributions)"
csv.field_size_limit(10**9)


def year_rows(y):
    p = os.path.join(CACHE, f"{y}.zip")
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", p, f"https://tracer.sos.colorado.gov/PublicSite/Docs/BulkDataDownloads/{y}_ContributionData.csv.zip"], check=True)
    z = zipfile.ZipFile(p)
    with z.open(z.namelist()[0]) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""))


for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    info = {}
    for y in (year - 1, year):
        for r in year_rows(y):
            if r.get("CommitteeType") != "Candidate Committee" or r.get("Amended") == "Y" or (r.get("ContributionDate") or "")[:4] not in (str(year - 1), str(year)):
                continue
            try:
                tot[r["CO_ID"]] += float(r["ContributionAmount"] or 0)
            except ValueError:
                continue
            info[r["CO_ID"]] = (r.get("CandidateName") or "", r.get("CommitteeName") or "")
    out = []
    for cid, v in tot.items():
        cand, comm = info[cid]
        m = re.search(r"(HOUSE|SENATE)\D{0,12}(\d+)", comm.upper())
        out.append({"name": cand.strip() or comm, "committee": comm, "chamber": ("house" if m.group(1) == "HOUSE" else "senate") if m else None,
                    "district": m.group(2) if m else None, "contributions": round(v, 2)})
    body = {"state": "CO", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"CO-{year}.json"), "w"), indent=1)
    print(f"CO {year}: {len(out)} candidate committees")
