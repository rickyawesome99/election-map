#!/usr/bin/env python3
"""
September snapshot of House/Senate receipts for past cycles (forecast revamp, Phase 6
"partial-cycle scaling").

data-entry/fundraising_2016_2026.csv holds FULL two-year-cycle receipts for past
elections but only cycle-to-date receipts for the live cycle (FEC weball, mid-September
vintage = everything through the July quarterly plus any pre-primary reports). FF_K was
calibrated on the full-cycle gaps, so this rebuilds what the mid-September file would
have shown in past cycles: for every general-election nominee with an FEC id, the sum of
`total_receipts_period` over the reports of all their authorized committees whose
coverage ends by Aug 31 of the election year (newest amendment of each report).

  The full-cycle sum of the same reports is written alongside as a check against the
  weball figure already in the CSV.

Inputs : data-entry/fundraising_2016_2026.csv (nominee FEC ids), FEC bulk candidate-
         committee linkage (cclYY.zip, downloaded), OpenFEC /reports/house-senate/
         (FEC_API_KEY in .env.local; responses cached in .fec-cache/)
Output : data-entry/fundraising_sept_snapshot.csv

Usage (repo root):  python3 scripts/fetch-fec-september-snapshot.py [--years 2022,2024]
"""
import csv, io, json, os, subprocess, sys, time, zipfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSVP = os.path.join(ROOT, "data-entry", "fundraising_2016_2026.csv")
OUT = os.path.join(ROOT, "data-entry", "fundraising_sept_snapshot.csv")
CACHE = os.path.join(ROOT, ".fec-cache")
YEARS = [int(y) for y in (sys.argv[sys.argv.index("--years") + 1] if "--years" in sys.argv else "2018,2020,2022,2024").split(",")]
BATCH = 4  # committees per API call (≈10 reports each per cycle → one 100-row page, rarely two)

def key():
    for line in open(os.path.join(ROOT, ".env.local")):
        if line.startswith("FEC_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("FEC_API_KEY missing from .env.local")

def linkage(year):
    """candidate id -> authorized committee ids (principal / authorized, this cycle)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"ccl{year % 100:02d}.zip")
    if not os.path.exists(path):
        urllib.request.urlretrieve(f"https://www.fec.gov/files/bulk-downloads/{year}/ccl{year % 100:02d}.zip", path)
    out = {}
    with zipfile.ZipFile(path) as z:
        for line in io.TextIOWrapper(z.open(z.namelist()[0]), encoding="latin-1"):
            cand, _cand_yr, fec_yr, cmte, _tp, dsgn, _ = line.rstrip("\n").split("|")
            if int(fec_yr) == year and dsgn in ("P", "A"):
                out.setdefault(cand, set()).add(cmte)
    return out

def fetch_reports(year, committees, k):
    """All Form 3 reports of these committees in the two-year cycle (cached per batch)."""
    name = os.path.join(CACHE, f"reports_{year}_{'_'.join(committees)}.json")
    if os.path.exists(name):
        return json.load(open(name))
    rows, page = [], 1
    while True:
        url = (f"https://api.open.fec.gov/v1/reports/house-senate/?cycle={year}&per_page=100&page={page}"
               + "".join(f"&committee_id={c}" for c in committees) + f"&api_key={k}")
        for attempt in range(5):
            r = subprocess.run(["curl", "-s", "--max-time", "60", url], capture_output=True, text=True)
            try:
                d = json.loads(r.stdout)
                if "results" in d:
                    break
            except json.JSONDecodeError:
                d = {}
            time.sleep(20 * (attempt + 1))  # rate limit (1,000 calls/hour) or a transient error
        else:
            sys.exit(f"FEC API failed for {committees}: {r.stdout[:200]}")
        rows += [{f: x.get(f) for f in ("committee_id", "coverage_start_date", "coverage_end_date", "receipt_date", "report_type", "most_recent", "total_receipts_period", "transfers_from_other_authorized_committee_period")} for x in d["results"]]
        if page >= (d["pagination"].get("pages") or 1):
            break
        page += 1
    json.dump(rows, open(name, "w"))
    time.sleep(0.4)
    return rows

def main():
    k = key()
    races = [r for r in csv.DictReader(open(CSVP)) if r["office"] in ("H", "S") and int(r["year"]) in YEARS]
    out = []
    for year in YEARS:
        link = linkage(year)
        cands = []
        for r in races:
            if int(r["year"]) != year:
                continue
            for side in ("dem", "rep"):
                if r[f"{side}_fec_id"]:
                    cands.append((r, side, r[f"{side}_fec_id"]))
        committees = sorted({c for _, _, cid in cands for c in link.get(cid, ())})
        print(f"{year}: {len(cands)} nominees with an FEC id, {len(committees)} committees", flush=True)
        reports = {}
        for i in range(0, len(committees), BATCH):
            for x in fetch_reports(year, committees[i:i + BATCH], k):
                reports.setdefault(x["committee_id"], []).append(x)
            if (i // BATCH) % 25 == 0:
                print(f"  {i}/{len(committees)}", flush=True)
        cutoff, start = f"{year}-08-31", f"{year - 1}-01-01"
        for r, side, cid in cands:
            sept = full = 0.0
            n = 0
            for c in link.get(cid, ()):
                for x in reports.get(c, []):
                    if not x["most_recent"] or x["total_receipts_period"] is None or (x["coverage_start_date"] or "")[:10] < start:
                        continue
                    # Total receipts as weball reports them — INCLUDING transfers from other authorized
                    # committees, which for most members is joint-fundraising money (subtracting it put
                    # 124 of 848 nominees >10% under their weball total; keeping it, the two agree).
                    amt = float(x["total_receipts_period"])
                    full += amt
                    n += 1
                    if (x["coverage_end_date"] or "9999")[:10] <= cutoff:
                        sept += amt
            out.append({"office": r["office"], "state": r["state"], "race": r["race"], "year": year, "election_type": r["election_type"], "party": "D" if side == "dem" else "R",
                        "candidate": r[f"{side}_candidate"], "fec_id": cid, "reports": n, "receipts_sept": f"{sept:.2f}" if n else "",
                        "receipts_full_from_reports": f"{full:.2f}" if n else "", "receipts_final_csv": r[f"{side}_receipts"]})
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"wrote {OUT} ({len(out)} rows)")

if __name__ == "__main__":
    main()
