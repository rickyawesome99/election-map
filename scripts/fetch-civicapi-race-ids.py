#!/usr/bin/env python3
"""Map every 2026 Senate / governor / House general-election race to its civicAPI race id.

civicAPI (https://civicapi.org, free, no key, attribution required) is the election-night results
feed behind /results. Its race search takes a state and a date and returns every race on that
ballot — thousands of local ones — so this script walks the 50 states (plus DC for nothing) once,
keeps the three federal/statewide types, and writes data-entry/civicapi_race_ids.csv:

    office,state,district,civic_id,election_name,polls_close_utc,candidates

`district` is the civicAPI district key ("TX-23", "AK-AL"; blank for statewide), `polls_close_utc`
the feed's poll-closing timestamp. Re-run if civicAPI adds or renumbers a race (ids were stable
through October 2026). Python's default User-Agent is refused (403); a curl one is sent.
"""
import csv, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

BASE = "https://civicapi.org/api/v2/"
UA = {"User-Agent": "curl/8.4.0", "Accept": "application/json"}
STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]
WANT = {"US Senate": "senate", "Governor": "governor", "House of Representatives": "house"}
DATE = "2026-11-03"
OUT = Path(__file__).resolve().parent.parent / "data-entry" / "civicapi_race_ids.csv"

def get(path, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1: raise
            print(f"  retry {path}: {e}", file=sys.stderr); time.sleep(3 * (i + 1))

def main():
    rows = []
    only = sys.argv[1:] or STATES
    for st in only:
        q = urllib.parse.urlencode(dict(province=st, startDate=DATE, endDate=DATE, limit=5000))
        data = get("race/search?" + q)
        hits = [r for r in data.get("races", []) if r.get("type") in WANT]
        print(f"{st}: {data.get('count')} races, {len(hits)} federal/statewide", file=sys.stderr)
        for r in hits:
            detail = get(f"race/{r['id']}")
            rows.append({
                "office": WANT[r["type"]], "state": st, "district": (r.get("district") or "") if r["type"] == "House of Representatives" else "",
                "civic_id": r["id"], "election_name": r["election_name"],
                "polls_close_utc": detail.get("polls_close") or "",
                "candidates": " / ".join(f"{c['name']} ({c['party']})" for c in detail.get("candidates", []) if c.get("major_candidate") or c.get("party") in ("Democratic", "Republican")),
            })
            time.sleep(0.15)
    rows.sort(key=lambda r: (r["office"], r["state"], r["district"]))
    if sys.argv[1:] and OUT.exists():  # partial run: merge over the existing file
        old = [r for r in csv.DictReader(OUT.open()) if r["state"] not in only]
        rows = sorted(old + rows, key=lambda r: (r["office"], r["state"], r["district"]))
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["office", "state", "district", "civic_id", "election_name", "polls_close_utc", "candidates"])
        w.writeheader(); w.writerows(rows)
    print(f"wrote {len(rows)} rows → {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
