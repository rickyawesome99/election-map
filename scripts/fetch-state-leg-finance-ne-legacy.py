#!/usr/bin/env python3
"""
Nebraska state legislative fundraising for 2016–2020 from the NADC's legacy bulk data
(www.nebraska.gov/nadc_data/nadc_data.zip, pipe-delimited, frozen 2022-07-11). 2022 on comes from the
new Civix portal (scripts/fetch-state-leg-finance-civix.py NE).

  python3 scripts/fetch-state-leg-finance-ne-legacy.py [CYCLE ...]

forma1cand.txt ties each candidate committee to its office: Office Description "LEGISLATURE", Office
Title = the district number. formb1.txt holds every B-1 campaign statement with Field 10 = total
receipts year to date. A cycle = for each of the two calendar years Y-1 and Y, the committee's
latest statement of that year (latest period end, then latest received: an amendment) and its
year-to-date receipts. Megan Hunt, LD 8, 2018: $43,226.75 (2017) + $91,845.51 (2018) = $135,072.26.
The legislature is nonpartisan; assign-state-leg-finance.ts matches the name within the district.

Output: data-entry/state-leg-finance/portal-raw/NE-{cycle}.json. The zip is cached in scratch portal-cache/ne-legacy/.
"""
import csv
import datetime
import json
import os
import subprocess
import sys
import zipfile
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ne-legacy"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Nebraska Accountability and Disclosure Commission legacy data (receipts per campaign statement)"


def table(z, name):
    with z.open(next(n for n in z.namelist() if n.lower().endswith(name))) as fh:
        return list(csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1"), delimiter="|"))


def date(s):
    try:
        return datetime.datetime.strptime(s.strip(), "%m/%d/%Y").date()
    except ValueError:
        return None


def main(cycles):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "nadc_data.zip")
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", path, "https://www.nebraska.gov/nadc_data/nadc_data.zip"], check=True)
    z = zipfile.ZipFile(path)
    cands = {}
    for r in table(z, "forma1cand.txt"):
        if (r.get("Office Description") or "").strip().upper() == "LEGISLATURE" and (r.get("Office Title") or "").strip().isdigit():
            cands[r["Form A1 ID Number"].strip()] = {"name": f'{r["Candidate First Name"].strip()} {r["Candidate Last Name"].strip()}', "district": str(int(r["Office Title"]))}
    latest = {}
    for r in table(z, "formb1.txt"):
        cid = r["Committee ID Number"].strip()
        if cid not in cands:
            continue
        end, got = date(r["Report End Date"]), date(r["Date Received"])
        if not end:
            continue
        key = (cid, end.year)
        rank = (end, got or datetime.date.min)
        if key not in latest or rank > latest[key][0]:
            try:
                latest[key] = (rank, float(r["Field 10"] or 0))
            except ValueError:
                pass
    for cycle in cycles:
        out = []
        for cid, c in cands.items():
            parts = [latest[(cid, y)][1] for y in (cycle - 1, cycle) if (cid, y) in latest]
            if parts:
                out.append({"name": c["name"], "chamber": "senate", "district": c["district"], "committee": cid, "contributions": round(sum(parts), 2)})
        body = {"state": "NE", "cycle": cycle, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"NE-{cycle}.json"), "w"), indent=1)
        print(f"NE {cycle}: {len(out)} legislative committees with statements")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016, 2018, 2020])
