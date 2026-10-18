#!/usr/bin/env python3
"""
Iowa state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Ethics and Campaign Disclosure Board's itemized contributions on the Iowa Data Hub (dataset 917; the old
data.iowa.gov Socrata ids are gone).

  python3 scripts/fetch-state-leg-finance-ia.py [YEAR ...]       default 2016

idh-be.iowa.gov/api/v1/datasets/917/rows.csv redirects to a signed zip (~400 MB) of every itemized
contribution since 2003 with committee number, type ("State House" / "State Senate") and name.
Contributions (CON) and in-kind (INK) dated Y-1..Y, not loans, summed per committee. The registry
(dataset 704) gives the candidate and district only for committees still registered, so the
committee name ("Upmeyer for House") usually goes to scripts/assign-state-leg-finance.ts instead.
Caucus in-kind support counts and can be large. Linda Upmeyer, HD-54, 2015–16: $1,133,802 + $2,455 in-kind.

Output: data-entry/state-leg-finance/portal-raw/IA-{year}.json. Files cached in scratch portal-cache/ia/.
"""
import collections
import csv
import datetime
import glob
import io
import json
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ia"
SOURCE = "Iowa Ethics and Campaign Disclosure Board (itemized contributions + in-kind)"
CHAMBER = {"State House": "house", "Iowa House": "house", "State Senate": "senate", "Iowa Senate": "senate"}
csv.field_size_limit(10**9)


def dataset(n):
    p = os.path.join(CACHE, f"{n}.zip")
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSfL", "-o", p, f"https://idh-be.iowa.gov/api/v1/datasets/{n}/rows.csv"], check=True)
    z = zipfile.ZipFile(p)
    for name in sorted(z.namelist()):
        with z.open(name) as fh:
            yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace", newline=""))


reg = {r["committee_number"]: r for r in dataset(704)}
for year in [int(a) for a in sys.argv[1:]] or [2016]:
    tot = collections.defaultdict(float)
    info = {}
    for r in dataset(917):
        chamber = CHAMBER.get(r.get("committee_type") or "")
        if not chamber or r.get("transaction_type") not in ("CON", "INK") or not (f"{year - 1}-01-01" <= (r.get("contribution_received_date") or "")[:10] <= f"{year}-12-31"):
            continue
        try:
            tot[r["committee_cd"]] += float(r["amount"] or 0)
        except ValueError:
            continue
        info[r["committee_cd"]] = (r["committee_nm"], chamber)
    out = []
    for cd, v in tot.items():
        name, chamber = info[cd]
        g = reg.get(cd)
        out.append({"name": (g or {}).get("candidate_name") or name, "committee": name, "chamber": chamber,
                    "district": (g or {}).get("district") if g and str(year) in (g.get("election_year") or "") else None, "contributions": round(v, 2)})
    body = {"state": "IA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"IA-{year}.json"), "w"), indent=1)
    print(f"IA {year}: {len(out)} legislative committees")
