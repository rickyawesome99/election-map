#!/usr/bin/env python3
"""
Fills governor rows in data-entry/fundraising_2016_2026.csv from the
FollowTheMoney (Institute on Money in Politics / OpenSecrets) API.

Gubernatorial money is filed with the states, not the FEC, so the House/Senate
FEC pass leaves G rows blank. This fetches per state-year and matches the CSV's
general-election nominees by name.

Notes for whoever runs this next:
  * FTM_API_KEY lives in .env.local. The key is not on a settings page - log in
    at followthemoney.org, open any Ask Anything ("show-me") result, and click
    the export icon; the API URL it hands you carries &APIKey=.
  * The endpoint MUST be https. Their own docs show http://, which 400s.
  * c-r-ot=G is "general office = governor", which INCLUDES lieutenant
    governor, so rows are filtered on Office_Sought == "GOVERNOR".
  * Total_$ is total contributions received per state disclosure - the same
    measure as the TransparencyUSA rows, not FEC-style total receipts.
  * A record with #_of_Records == 0 means FTM has no reports for that
    candidate (a state coverage gap, e.g. MA 2018 Baker). That is NOT $0 and
    is left blank rather than written as zero.
  * The free tier cuts off mid-pass with an {"error": ...} body pending
    "Institute review of data usage". Responses are cached, so a re-run after
    approval only fetches what is missing.

Usage (from repo root):
  python3 scripts/fetch-governor-fundraising-ftm.py            # fetch + dry-run match
  python3 scripts/fetch-governor-fundraising-ftm.py --apply    # write the CSV
  python3 scripts/fetch-governor-fundraising-ftm.py --no-fetch # match from cache only
Then regenerate: python3 scripts/generate-fundraising-data.py
"""
import csv, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSVP = os.path.join(ROOT, "data-entry", "fundraising_2016_2026.csv")
CACHE = os.environ.get("FTM_CACHE", os.path.join(ROOT, ".ftm-cache"))
SOURCE = "FollowTheMoney (state filings, total contributions)"
APPLY, FETCH = "--apply" in sys.argv, "--no-fetch" not in sys.argv
SUFFIX = {"JR", "SR", "II", "III", "IV", "V"}
LAST_FTM_YEAR = 2024  # FTM's data stops at the 2024 election year

def key():
    for line in open(os.path.join(ROOT, ".env.local")):
        if line.startswith("FTM_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("FTM_API_KEY missing from .env.local")

def toks(s):
    return [t for t in re.sub(r"[^A-Z ]", " ", (s or "").upper()).split() if t not in SUFFIX]

def flat(rec):
    o = {}
    for k, v in rec.items():
        o.update(v) if isinstance(v, dict) else o.__setitem__(k, v)
    return o

def fetch(st, yr, k, tries=5):
    url = (f"https://api.followthemoney.org/?dt=1&s={st}&y={yr}&c-exi=1&c-r-ot=G"
           f"&gro=c-t-id%2Cc-t-p&APIKey={k}&mode=json")
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=100) as r:
                d = json.loads(r.read().decode("utf-8", "replace"))
            if "metaInfo" not in d:
                print(f"  {st}:{yr} API refused: {d.get('error', d)}"); return None
            return d
        except Exception as e:
            print(f"  {st}:{yr} attempt {i+1}: {type(e).__name__}", flush=True)
            time.sleep(5 * (i + 1))
    return None

def pick(govs, name, party):
    """Best FTM record for a CSV candidate name -> (record, None) or (None, reason)."""
    want = toks(name)
    if not want: return None, "no name"
    out = []
    for g in govs:
        raw = g.get("Candidate", "")
        sur = toks(raw.split(",")[0])
        given = toks(raw.split(",", 1)[1]) if "," in raw else []
        n = len(sur)
        if n and want[-n:] == sur:  # FTM surname == trailing CSV tokens ("Huckabee Sanders", "Van Ostern")
            first_ok = bool(set(given) & set(want[:-n])) if given and want[:-n] else False
            out.append((n, first_ok, g.get("Election_Status", "").endswith("General"),
                        g.get("General_Party") == party, float(g.get("Total_$", 0) or 0), g))
    if not out: return None, "no surname match"
    out.sort(key=lambda c: c[:5], reverse=True)
    best = out[0][5]
    if int(best.get("#_of_Records", 0) or 0) == 0:
        return None, f'FTM has 0 records for {best.get("Candidate")}'
    return best, None

rows = list(csv.DictReader(open(CSVP)))
fields = list(rows[0].keys())
pending = [r for r in rows if r["office"] == "G" and not r["dem_receipts"].strip()
           and not r["rep_receipts"].strip() and int(r["year"]) <= LAST_FTM_YEAR]
print(f"{len(pending)} pending governor rows through {LAST_FTM_YEAR}")

if FETCH and pending:
    os.makedirs(CACHE, exist_ok=True)
    k = key()
    for st, yr in sorted({(r["state"], r["year"]) for r in pending}):
        path = os.path.join(CACHE, f"{st}_{yr}.json")
        if os.path.exists(path) and os.path.getsize(path) > 200: continue
        d = fetch(st, yr, k)
        if d is None: continue
        json.dump(d, open(path, "w"))
        print(f'OK {st}:{yr} records={d["metaInfo"]["paging"]["totalRecords"]}', flush=True)
        time.sleep(1)

filled, problems = 0, []
for r in pending:
    path = os.path.join(CACHE, f'{r["state"]}_{r["year"]}.json')
    if not os.path.exists(path):
        problems.append(f'{r["state"]}:{r["year"]} - not fetched'); continue
    govs = [g for g in map(flat, json.load(open(path)).get("records", []))
            if g.get("Office_Sought") == "GOVERNOR"]
    d, dr = pick(govs, r["dem_candidate"], "Democratic")
    p, pr = pick(govs, r["rep_candidate"], "Republican")
    if d is None or p is None:
        problems.append(f'{r["state"]}:{r["year"]} - D {r["dem_candidate"]}: {dr or "ok"} | '
                        f'R {r["rep_candidate"]}: {pr or "ok"}'); continue
    r["dem_receipts"], r["rep_receipts"] = f'{float(d["Total_$"]):.2f}', f'{float(p["Total_$"]):.2f}'
    r["source"], r["notes"] = SOURCE, ""
    filled += 1
    print(f'FILL {r["state"]}:{r["year"]}  D {d["Candidate"]:<28s}{float(d["Total_$"]):>13,.0f}'
          f'  |  R {p["Candidate"]:<28s}{float(p["Total_$"]):>13,.0f}')

print(f"\nfilled={filled} problems={len(problems)}")
for x in problems: print("  " + x)

if APPLY and filled:
    with open(CSVP, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"\nwrote {CSVP} - now run scripts/generate-fundraising-data.py")
elif filled:
    print("\n(dry run - pass --apply to write)")
