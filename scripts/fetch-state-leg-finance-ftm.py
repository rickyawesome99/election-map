#!/usr/bin/env python3
"""
State legislative candidate fundraising from the FollowTheMoney (OpenSecrets / NIMSP) API for
the states Transparency USA does not cover, and for 2016 everywhere (TU starts at the 2017/2018
cycle). One API call per state, cycle and chamber returns every candidate of that chamber with
their total contributions.

  python3 scripts/fetch-state-leg-finance-ftm.py --cycle 2024 [ST ...]
  python3 scripts/fetch-state-leg-finance-ftm.py --cycle all          2016–2024, non-TU states; 2016 for all
  python3 scripts/fetch-state-leg-finance-ftm.py --probe OH 2024      print the raw first records (check office codes)

Output: data-entry/state-leg-finance/ftm/{ST}-{cycle}.json
  { state, cycle, fetched, house: { "<district>": [ {name, party, incumbent, contributions, status} ] }, senate: {...} }

The same notes as scripts/fetch-governor-fundraising-ftm.py apply: FTM_API_KEY in .env.local
(a fresh key resets the free tier's quota, which refuses with "pending Institute review" once
spent); https only; curl --http1.1, not urllib; responses cached under --cache so a re-run
after a quota refusal only fetches what is missing. FTM's data stops at the 2024 election year.
Office codes: c-r-ot=H (state house / assembly) and c-r-ot=S (state senate); Office_Sought reads
"HOUSE DISTRICT 031" / "SENATE DISTRICT 05" and is the district key after the leading zeros go.
#_of_Records == 0 is a coverage gap, not $0, and is written as null.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "ftm")
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/f0dc0b69-f6dc-43ea-86e3-d48e7e098c28/scratchpad/ftm-cache"
TU_STATES = {"AL", "AZ", "CA", "CO", "FL", "GA", "IA", "ID", "IL", "IN", "MI", "MN", "NC", "NH", "NM", "NV", "NY", "OH", "PA", "SC", "TX", "VA", "WA", "WI", "WY"}
ALL_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]
ODD_YEAR = {"VA": [2017, 2019, 2021, 2023], "NJ": [2017, 2019, 2021, 2023], "MS": [2019, 2023], "LA": [2019, 2023]}
LAST_FTM_YEAR = 2024


def key():
    for line in open(os.path.join(ROOT, ".env.local")):
        if line.startswith("FTM_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("FTM_API_KEY missing from .env.local")


def cycles_for(st):
    if st in ODD_YEAR:
        return ODD_YEAR[st]
    return [2016, 2018, 2020, 2022, 2024]


def flat(rec):
    o = {}
    for k, v in rec.items():
        o.update(v) if isinstance(v, dict) else o.__setitem__(k, v)
    return o


def fetch(st, yr, ot, k, cache):
    """Every record of one state-year-chamber query, paged (recordsPerPage 100), cached per page."""
    os.makedirs(cache, exist_ok=True)
    url = (f"https://api.followthemoney.org/?dt=1&s={st}&y={yr}&c-exi=1&c-r-ot={ot}"
           f"&gro=c-t-id%2Cc-t-p&APIKey={k}&mode=json")
    records, page = [], 0
    while True:
        path = os.path.join(cache, f"{st}-{yr}-{ot}-p{page}.json")
        if os.path.exists(path):
            d = json.load(open(path))
        else:
            d = None
            for attempt in range(4):
                r = subprocess.run(["curl", "-s", "--http1.1", "--max-time", "300", f"{url}&p={page}"], capture_output=True, text=True)
                try:
                    d = json.loads(r.stdout)
                    break
                except Exception:
                    print(f"  {st}:{yr}:{ot} page {page} attempt {attempt + 1}: no/!json response", file=sys.stderr)
                    time.sleep(8 * (attempt + 1))
            if d is None:
                return None
            if "metaInfo" not in d:
                print(f"  {st}:{yr}:{ot} API refused: {d.get('error', d)}", file=sys.stderr)
                return None
            json.dump(d, open(path, "w"))
            time.sleep(1)
        records.extend(flat(x) for x in d.get("records", []))
        paging = d["metaInfo"].get("paging", {})
        if page >= int(paging.get("maxPage", 0) or 0):
            break
        page += 1
    return records


def district_of(office):
    m = re.search(r"DISTRICT\s+0*([A-Z0-9]+[A-Z]?)\b", office or "", re.I)
    return m.group(1).upper() if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*")
    ap.add_argument("--cycle", action="append", default=[])
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--probe", nargs=2, metavar=("ST", "YEAR"))
    args = ap.parse_args()
    k = key()
    if args.probe:
        st, yr = args.probe[0].upper(), int(args.probe[1])
        for ot in ("H", "S"):
            recs = fetch(st, yr, ot, k, args.cache) or []
            print(f"{st} {yr} ot={ot}: {len(recs)} records")
            for r in recs[:3]:
                print("  ", {x: r.get(x) for x in ("Candidate", "General_Party", "Office_Sought", "Incumbency_Status", "Status_of_Candidate", "Total_$", "#_of_Records")})
        return
    states = [s.upper() for s in args.states] or [s for s in ALL_STATES if s not in TU_STATES]
    os.makedirs(OUT_DIR, exist_ok=True)
    for st in states:
        cycles = cycles_for(st) if "all" in args.cycle else [int(c) for c in args.cycle]
        if st in TU_STATES and "all" in args.cycle:
            cycles = [c for c in cycles if c == 2016]
        for yr in cycles:
            if yr > LAST_FTM_YEAR or yr not in cycles_for(st):
                continue
            out = {"state": st, "cycle": yr, "fetched": datetime.date.today().isoformat(), "house": {}, "senate": {}}
            ok = True
            for chamber, ot in (("house", "H"), ("senate", "S")):
                recs = fetch(st, yr, ot, k, args.cache)
                if recs is None:
                    ok = False
                    break
                for r in recs:
                    d = district_of(r.get("Office_Sought"))
                    if not d:
                        continue
                    n = int(r.get("#_of_Records") or 0)
                    total = r.get("Total_$")
                    try:
                        total = float(total) if n > 0 and total not in (None, "") else None
                    except ValueError:
                        total = None
                    status = r.get("Status_of_Candidate") or ""
                    # General-election candidates only: FTM marks primary losers "Lost-Primary".
                    if "Primary" in status and "Won" not in status and "General" not in status:
                        continue
                    out[chamber].setdefault(d, []).append({
                        "name": r.get("Candidate"), "party": r.get("General_Party") or r.get("Specific_Party"),
                        "incumbent": (r.get("Incumbency_Status") or "").upper().startswith("I"),
                        "contributions": total, "status": status, "records": n,
                    })
            if not ok:
                print(f"{st} {yr}: stopped (quota or network); rerun later", file=sys.stderr)
                return
            with open(os.path.join(OUT_DIR, f"{st}-{yr}.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, indent=1, ensure_ascii=False)
                f.write("\n")
            print(f"{st} {yr}: house {sum(len(v) for v in out['house'].values())} candidates in {len(out['house'])} districts · senate {sum(len(v) for v in out['senate'].values())} in {len(out['senate'])}", flush=True)


if __name__ == "__main__":
    main()
