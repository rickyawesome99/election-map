#!/usr/bin/env python3
"""
South Carolina state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from
the State Ethics Commission's filing API (ethicsfiling.sc.gov/api, no auth).

  python3 scripts/fetch-state-leg-finance-sc.py [YEAR ...]       default 2016

POST /api/Candidate/Report/Public/Campaign/Get/Reports {office House|Senate, electionyear} lists every
report of every campaign for that election with filer id, campaign id and office ("SC House of
Representatives District 65"); POST /api/Ethics/Get/Public/Candidate/Reports {candidateFilerId} returns
the filer's reports, whose `contributions` is CUMULATIVE for the campaign — so a cycle = the campaign's
last report. Jay Lucas, HD-65, 2016 (Q1 2015 → Q4 2016): $135,349.03.

Output: data-entry/state-leg-finance/portal-raw/SC-{year}.json. Responses cached in scratch portal-cache/sc/.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/sc"
API = "https://ethicsfiling.sc.gov/api"
SOURCE = "South Carolina Ethics Commission (cumulative campaign contributions)"


def post(path, body, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return json.load(open(p))
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--max-time", "120", "-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body), API + path], capture_output=True)
        try:
            d = json.loads(r.stdout)
            break
        except ValueError:
            time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"SC: failed {path}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(d, open(p, "w"))
    time.sleep(0.2)
    return d


def fetch(year):
    out = []
    for office, chamber in (("House", "house"), ("Senate", "senate")):
        rows = post("/Candidate/Report/Public/Campaign/Get/Reports", {"candidate": "", "office": office, "reportType": "Any", "electionyear": year, "electionType": "Any"}, f"list-{year}-{office}.json")
        camps = {}
        for r in rows:
            camps[(r["candidateFilerId"], r["campaignId"])] = r
        for (fid, cid), r in camps.items():
            reps = post("/Ethics/Get/Public/Candidate/Reports", {"campaignId": 0, "candidateFilerId": fid}, f"filer/{fid}.json")["results"]
            mine = [q for q in reps if q.get("reportWithDates", {}).get("campaignId") == cid]
            last = max(mine, key=lambda q: (q.get("reportWithDates", {}).get("filingEndDate") or "", q["reportId"]), default=None)
            d = re.search(r"District (\d+)", r.get("office") or "")
            name = r["candidateName"].strip()
            if "," in name:
                last_name, first = name.split(",", 1)
                name = f"{first.strip()} {last_name.strip()}"
            out.append({"name": name, "chamber": chamber, "district": d.group(1) if d else None, "campaign": cid,
                        "contributions": round(last["contributions"], 2) if last and last.get("contributions") is not None else None})
    body = {"state": "SC", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"SC-{year}.json"), "w"), indent=1)
    print(f"SC {year}: {len(out)} campaigns")


if __name__ == "__main__":
    for y in [int(a) for a in sys.argv[1:]] or [2016]:
        fetch(y)
