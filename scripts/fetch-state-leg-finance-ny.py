#!/usr/bin/env python3
"""
New York state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Board of Elections' disclosure data on data.ny.gov (dataset e9ss-239a; the BOE's own portal is behind
Cloudflare).

  npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts NY > /tmp/ny.json
  python3 scripts/fetch-state-leg-finance-ny.py /tmp/ny.json [YEAR ...]       default 2016

Money, summed on the server per filer: schedules A (individuals, incl. unitemized), B (corporations),
C (all other) and D (in-kind), by transaction date in Y-1..Y — not E (other receipts), G (transfers in),
I (loans) or O (LLC attribution, which double counts). Committees carry no office or district, and the
candidate filer records are not linked to their committees in the open data, so a committee is given to
the general-election candidate (from the dump) whose first AND last name both appear in its name
("Friends Of Carl E Heastie"); or, when the name says "Assembly" or "Senate", the one candidate of that chamber with its surname
("Lentol For Assembly"); a committee naming no candidate, or two, is left out.
Carl Heastie, AD-83, 2015–16: $1,048,883.

Output: data-entry/state-leg-finance/portal-raw/NY-{year}.json.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SOURCE = "New York State Board of Elections disclosure data (contributions, schedules A–D)"


def words(s):
    return set(re.sub(r"[^a-z\s-]", " ", s.lower().replace("'", "")).replace("-", " ").split())


def main(cands_file, years):
    pool = json.load(open(cands_file))
    for year in years:
        q = urllib.parse.urlencode({
            "$select": "filer_id,cand_comm_name,sum(org_amt) as total",
            "$where": f"filing_sched_abbrev in('A','B','C','D') and sched_date between '{year - 1}-01-01' and '{year}-12-31T23:59:59'",
            "$group": "filer_id,cand_comm_name", "$limit": "50000"})
        rows = json.loads(subprocess.run(["curl", "-sS", "--max-time", "600", f"https://data.ny.gov/resource/e9ss-239a.json?{q}"], capture_output=True, check=True).stdout)
        if not isinstance(rows, list):
            sys.exit(f"NY {year}: {str(rows)[:200]}")
        people = [c for c in pool if c["year"] == year]
        out = []
        for r in rows:
            w = words(r.get("cand_comm_name") or "")
            hits = []
            for c in people:
                t = [x for x in re.sub(r"\(.*?\)|\".*?\"", " ", c["name"]).lower().replace("-", " ").replace(".", " ").split() if len(x) > 1 and x not in ("jr", "sr", "ii", "iii")]
                if len(t) >= 2 and t[0] in w and t[-1] in w:
                    hits.append(c)
            if not hits:
                # "Lentol For Assembly": the surname alone, when the name says which chamber and only one
                # of that chamber's candidates has that surname.
                chamber = "house" if w & {"assembly", "assemblyman", "assemblywoman", "assemblymember"} else "senate" if w & {"senate", "senator"} else None
                if chamber:
                    hits = [c for c in people if c["chamber"] == chamber and (lambda t: len(t) > 3 and t in w)(re.sub(r"[^a-z]", "", c["name"].split()[-1].lower()))]
                    if len({c["name"] for c in hits}) != 1:
                        hits = []
            if len({(c["chamber"], c["district"], c["name"]) for c in hits}) != 1:
                continue
            c = hits[0]
            out.append({"name": c["name"], "committee": r.get("cand_comm_name"), "chamber": c["chamber"], "district": c["district"],
                        "contributions": round(float(r.get("total") or 0), 2)})
        body = {"state": "NY", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"NY-{year}.json"), "w"), indent=1)
        print(f"NY {year}: {len(rows)} filers, {len(out)} matched to a general-election candidate")


if __name__ == "__main__":
    main(sys.argv[1], [int(a) for a in sys.argv[2:]] or [2016])
