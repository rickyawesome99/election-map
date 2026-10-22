#!/usr/bin/env python3
"""
Oregon state legislative fundraising from ORESTAR data, read through the Oregon Campaign Finance
mirror (orestar-dashboard.vercel.app; code github.com/bphelps1/orestar-dashboard-v3, MIT). The mirror
re-downloads every ORESTAR transaction export daily (2006 → today, ~3M rows) into a Supabase database
with a public read-only SQL endpoint and a public committee index, so the whole state comes out of
seven HTTP requests — ORESTAR itself sits behind an F5 challenge and blocks an IP after a few
hundred searches (scripts/fetch-state-leg-finance-or.cjs, the earlier route, is superseded).

  python3 scripts/fetch-state-leg-finance-or-mirror.py [--refresh] [CYCLE ...]

Verified against ORESTAR's own exports we hold: Committee to Elect Pam Marsh 2015–2016 $74,382.27
and Friends of Julie Fahey 11/04/2020–11/08/2022 $460,606.67, both to the cent; superseded
amendment versions are already dropped from the mirror's table (only the newest version of a
transaction is kept).

Per committee and cycle: the sum of every contribution row (tran_type C: cash, in-kind, and the
"miscellaneous cash contributions $100 and under" aggregate rows) dated Jan 1 of Y-1 → Dec 31 of Y,
the same window the earlier ORESTAR exports used. A candidate committee with no contribution row in
the window writes NO record (null downstream), never $0.

Committee → candidate: the mirror's filer index (dashboard_cache 'filer_index') carries each
committee's candidate name, party and CURRENT self-reported office ("State Representative, 32nd
District"). The office is the committee's latest election, so a record carries chamber + district
only when that cycle's general-election field has a candidate of that surname in that district;
otherwise it goes out without one and scripts/assign-state-leg-finance.ts matches the candidate's
full name statewide (a legislator who moved House → Senate, a county commissioner turned House
candidate). Pool: scripts/dump-state-leg-candidates.ts OR.

Output: data-entry/state-leg-finance/portal-raw/OR-{cycle}.json; caches in the session scratch
mirror-cache/ (--refresh refetches; the current cycle's sums are always refetched).
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = os.environ.get("OR_MIRROR_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/8e29fe12-7c67-4038-b1f2-fae0fd41f348/scratchpad/mirror-cache")
URL = "https://zkyvnprygbfywniisugi.supabase.co"
# The mirror's public (anon) key, published in its client code (docs/lib/supabase.js); read-only.
KEY = "sb_publishable_8tWa4xOZ6i0NZzkq4hr9xw_Z9mADjQv"
SOURCE = "Oregon Secretary of State ORESTAR contributions (two calendar years), via the Oregon Campaign Finance mirror (orestar-dashboard.vercel.app)"
TODAY = datetime.date.today()
PAUSE = 3  # seconds between requests: a handful of aggregate queries, never a crawl


def request(path, body=None):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def cached(name, fetch, refresh=False):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and not refresh:
        return json.load(open(path))
    data = fetch()
    json.dump(data, open(path, "w"))
    time.sleep(PAUSE)
    return data


def filer_index(refresh):
    rows = cached("filer_index_raw.json", lambda: request("/rest/v1/dashboard_cache?select=data,updated_at&key=eq.filer_index"), refresh)
    return rows[0]["data"], rows[0]["updated_at"][:10]


def cycle_sums(cycle, refresh):
    sql = (f"select filer_id, count(*) n, sum(amount) total, max(tran_date) last_tran from transactions "
           f"where tran_type='C' and tran_date between '{cycle - 1}-01-01' and '{cycle}-12-31' group by filer_id")
    res = cached(f"sums-{cycle}.json", lambda: request("/functions/v1/sql-query", {"sql": sql}), refresh or cycle >= TODAY.year)
    if res.get("error") or res.get("truncated"):
        raise SystemExit(f"OR {cycle}: mirror query failed or truncated: {res.get('error') or 'truncated at 5,000 rows'}")
    return {r["filer_id"]: float(r["total"]) for r in res["rows"] if r["filer_id"]}


def pool():
    path = os.path.join(CACHE, "or-pool.json")
    if not os.path.exists(path):
        out = subprocess.run(["npx", "tsx", "--conditions=react-server", "scripts/dump-state-leg-candidates.ts", "OR"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        os.makedirs(CACHE, exist_ok=True)
        open(path, "w").write(out)
    return json.load(open(path))


def surname(s):
    s = unicodedata.normalize("NFKD", s or "").lower()
    s = re.sub(r"\(.*?\)|\".*?\"", " ", s)
    parts = [p for p in re.split(r"[\s,-]+", re.sub(r"[^a-z\s,-]", "", s)) if p and p not in ("jr", "sr", "ii", "iii", "iv")]
    return parts[-1] if parts else ""


OFFICE = re.compile(r"^State (Representative|Senator), (\d+)\w\w District$")


def main(cycles, refresh):
    index, index_date = filer_index(refresh)
    comms = [c for c in index if c.get("committee_type") == "Candidate Committee" and c.get("candidate_name")]
    print(f"OR mirror: index of {index_date}, {len(comms)} candidate committees")
    cands = pool()
    for cycle in cycles:
        sums = cycle_sums(cycle, refresh)
        field = {}
        for c in cands:
            if c["year"] == cycle:
                field.setdefault((c["chamber"], str(int(c["district"]))), set()).add(surname(c["name"]))
        out, placed = [], 0
        for c in comms:
            ids = c.get("filer_ids") or [c["filer_id"]]
            total = sum(sums[i] for i in ids if i in sums)
            if not any(i in sums for i in ids):
                continue
            rec = {"name": c["candidate_name"], "committee": c["name"], "party": c.get("party") or None, "filer": c["filer_id"], "contributions": round(total, 2)}
            m = OFFICE.match(c.get("office_district") or "")
            if m:
                chamber, district = ("house" if m.group(1) == "Representative" else "senate"), str(int(m.group(2)))
                if surname(c["candidate_name"]) in field.get((chamber, district), set()):
                    rec.update({"chamber": chamber, "district": district})
                    placed += 1
            out.append(rec)
        body = {"state": "OR", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": index_date if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"OR-{cycle}.json"), "w"), indent=1)
        print(f"OR {cycle}: {len(out)} candidate committees with contributions in {cycle - 1}–{cycle}, {placed} placed on a district by office")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--refresh"]
    main([int(a) for a in args] or [2016, 2018, 2020, 2022, 2024, 2026], "--refresh" in sys.argv)
