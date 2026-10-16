#!/usr/bin/env python3
"""
Refreshes 2026 House/Senate campaign finance from the FEC, in three parts:

  1. Receipts: re-reads weball26 (FEC bulk "all candidates" summary) and rewrites
     dem_receipts / rep_receipts of every 2026 H/S row in
     data-entry/fundraising_2016_2026.csv that has a *_fec_id. This is the number
     the split bar and the forecast's money term use.
  2. Candidate-committee detail: OpenFEC /candidate/{id}/totals/ (two-year period, the
     same window as weball): cash on hand at the end of the latest report, total
     disbursements ("spent"), individual contributions, unitemized individual
     contributions (under $200 from a donor in the cycle = the "small-dollar" share).
  3. Outside spending: FEC bulk independent_expenditure_2026.csv, the 24/48-hour
     independent-expenditure reports (refreshed daily). The processed Schedule E
     endpoints lag by weeks, so they are not used. Superseded filings (any file_num
     another filing amends) are dropped, then exact duplicates; single entries over
     $100M are junk filings (one filer reported $9B "against" a primary candidate).
     Rows with a blank cand_id are matched to a nominee by office/state/district +
     surname. ie_for_* = spending supporting the candidate; ie_against_* = opposing.

Candidates registered but not yet filing stay blank (not 0) in both outputs.

Output: data-entry/fundraising_details_2026.csv (one row per 2026 H/S nominee with an
FEC id), then run scripts/generate-fundraising-data.py.

Usage (repo root):  python3 scripts/fetch-fec-race-finance.py [--no-receipts]
Needs FEC_API_KEY in .env.local. API responses are cached per day in .fec-cache/.
"""
import csv, datetime, io, json, os, re, sys, time, urllib.request, urllib.error, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSVP = os.path.join(ROOT, "data-entry", "fundraising_2016_2026.csv")
OUT = os.path.join(ROOT, "data-entry", "fundraising_details_2026.csv")
CACHE = os.path.join(ROOT, ".fec-cache")
TODAY = datetime.date.today().isoformat()
UPDATE_RECEIPTS = "--no-receipts" not in sys.argv
IE_JUNK = 100_000_000

def api_key():
    for line in open(os.path.join(ROOT, ".env.local")):
        if line.startswith("FEC_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("FEC_API_KEY missing from .env.local")

def download(url, path):
    if not os.path.exists(path):
        print(f"downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r:
            body = r.read()
        if not body: sys.exit(f"empty download: {url}")
        with open(path + ".part", "wb") as f:
            f.write(body)
        os.replace(path + ".part", path)  # atomic: an interrupted run never leaves a short cache file
    return path

def surname(name):
    """Last word of the surname: FEC "VAN DREW, JEFF" and our "Jeff Van Drew" both → "drew"."""
    part = name.lower().split(",")[0] if "," in name else name.lower()
    words = [p for p in re.sub(r"[^a-z\s-]", "", part).split() if p not in ("jr", "sr", "ii", "iii", "iv")]
    return words[-1] if words else ""

# ── Nominees ─────────────────────────────────────────────────────────────────
with open(CSVP) as f:
    reader = csv.DictReader(f)
    FIELDS = reader.fieldnames
    rows = list(reader)
live = [r for r in rows if r["year"] == "2026" and r["office"] in ("H", "S")]
nominees = []  # (row, party, name, fec_id)
for r in live:
    for side, party in (("dem", "D"), ("rep", "R")):
        if r[f"{side}_fec_id"]:
            nominees.append((r, party, r[f"{side}_candidate"], r[f"{side}_fec_id"]))
print(f"{len(nominees)} nominees with FEC ids")

# ── 1. Receipts from weball26 ────────────────────────────────────────────────
os.makedirs(CACHE, exist_ok=True)
weball = {}
with zipfile.ZipFile(download("https://www.fec.gov/files/bulk-downloads/2026/weball26.zip", os.path.join(CACHE, f"weball26_{TODAY}.zip"))) as z:
    for line in io.TextIOWrapper(z.open(z.namelist()[0]), encoding="latin-1"):
        p = line.rstrip("\n").split("|")
        weball[p[0]] = {"receipts": float(p[5] or 0), "cvg_end": p[27]}
if UPDATE_RECEIPTS:
    changed = 0
    for r in live:
        touched = False
        for side in ("dem", "rep"):
            w = weball.get(r[f"{side}_fec_id"])
            if not w: continue
            new = f"{w['receipts']:.2f}"
            if r[f"{side}_receipts"] == "" or abs(float(r[f"{side}_receipts"]) - w["receipts"]) > 0.5:
                print(f"  {r['race']:6} {side}: {r[f'{side}_receipts'] or '—'} → {new}")
                r[f"{side}_receipts"] = new
                changed += 1
            touched = True
        if touched and r["source"].startswith("FEC bulk"):
            r["source"] = f"FEC bulk (weball26, {TODAY} vintage)"
    with open(CSVP, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"receipts: {changed} sides updated")

# ── 2. Candidate-committee totals (OpenFEC) ──────────────────────────────────
KEY = api_key()
day_cache = os.path.join(CACHE, f"cand_totals_2026_{TODAY}")
os.makedirs(day_cache, exist_ok=True)

def cand_totals(fec_id):
    path = os.path.join(day_cache, f"{fec_id}.json")
    if os.path.exists(path):
        return json.load(open(path))
    url = f"https://api.open.fec.gov/v1/candidate/{fec_id}/totals/?api_key={KEY}&cycle=2026&election_full=false"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(30 * (attempt + 1)); continue
            raise
    else:
        sys.exit(f"gave up on {fec_id}")
    res = data["results"][0] if data["results"] else None
    json.dump(res, open(path, "w"))
    time.sleep(1.05)  # 60 requests/minute
    return res

totals = {}
for i, (_, _, _, fec_id) in enumerate(nominees):
    totals[fec_id] = cand_totals(fec_id)
    if i % 100 == 99: print(f"  totals {i + 1}/{len(nominees)}")

# ── 3. Independent expenditures (24/48-hour reports) ─────────────────────────
ie_path = download("https://www.fec.gov/files/bulk-downloads/2026/independent_expenditure_2026.csv", os.path.join(CACHE, f"ie26_{TODAY}.csv"))
with open(ie_path, encoding="latin-1") as f:
    ie_rows = list(csv.DictReader(f))
superseded = {r["prev_file_num"] for r in ie_rows if r["prev_file_num"]}
seen, kept = set(), []
for r in ie_rows:
    if r["file_num"] in superseded: continue
    amt = float(r["exp_amo"] or 0)
    if amt <= 0 or amt > IE_JUNK: continue
    sig = (r["spe_id"], r["tran_id"])
    sig2 = (r["spe_id"], r["cand_id"], r["cand_name"], r["exp_amo"], r["dissem_dt"], r["exp_date"], r["pur"], r["pay"])
    if sig in seen or sig2 in seen: continue
    seen.add(sig); seen.add(sig2)
    kept.append(r)

# blank cand_id → nominee by office/state/district + surname
by_seat = {}
for row, party, name, fec_id in nominees:
    dist = "00" if row["office"] == "S" else (row["race"].split("-")[1] if "-" in row["race"] else "00")
    if dist == "AL": dist = "00"
    by_seat.setdefault((row["office"], row["state"], dist), []).append((surname(name), fec_id))
ids = {fec_id for *_, fec_id in nominees}
ie = {fid: {"for": 0.0, "against": 0.0, "for_gen": 0.0, "against_gen": 0.0} for fid in ids}
ie_through = ""
matched_by_name = 0
for r in kept:
    fid = r["cand_id"].strip()
    if fid not in ids:
        if fid: continue
        dist = (r["can_office_dis"] or "00").zfill(2) if r["can_office"] == "H" else "00"
        sn = surname(r["cand_name"])
        hits = [f for s, f in by_seat.get((r["can_office"], r["can_office_state"], dist), []) if s and s == sn]
        if len(hits) != 1: continue
        fid = hits[0]; matched_by_name += 1
    side = {"S": "for", "O": "against"}.get(r["sup_opp"])
    if not side: continue
    amt = float(r["exp_amo"])
    ie[fid][side] += amt
    if r["ele_type"] == "G": ie[fid][side + "_gen"] += amt
    if r["receipt_dat"]:
        d = datetime.datetime.strptime(r["receipt_dat"], "%d-%b-%y").date().isoformat()
        ie_through = max(ie_through, d)
print(f"IE: {len(ie_rows)} rows → {len(kept)} kept, {matched_by_name} matched by name, through {ie_through}")

# ── Write ────────────────────────────────────────────────────────────────────
def money(v):
    return "" if v is None else f"{float(v):.2f}"

OUT_FIELDS = ["office", "state", "race", "election_type", "party", "candidate", "fec_id", "coverage_end",
              "receipts", "disbursements", "cash_on_hand", "indiv_contrib", "indiv_unitemized",
              "ie_for", "ie_against", "ie_for_general", "ie_against_general", "ie_through"]
with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=OUT_FIELDS, lineterminator="\n")
    w.writeheader()
    for row, party, name, fec_id in nominees:
        t = totals.get(fec_id)
        x = ie[fec_id]
        w.writerow({
            "office": row["office"], "state": row["state"], "race": row["race"], "election_type": row["election_type"],
            "party": party, "candidate": name, "fec_id": fec_id,
            "coverage_end": (t or {}).get("coverage_end_date", "")[:10] if t else "",
            "receipts": money(t and t.get("receipts")),
            "disbursements": money(t and t.get("disbursements")),
            "cash_on_hand": money(t and t.get("last_cash_on_hand_end_period")),
            "indiv_contrib": money(t and t.get("individual_contributions")),
            "indiv_unitemized": money(t and t.get("individual_unitemized_contributions")),
            "ie_for": money(x["for"]), "ie_against": money(x["against"]),
            "ie_for_general": money(x["for_gen"]), "ie_against_general": money(x["against_gen"]),
            "ie_through": ie_through,
        })
print(f"wrote {OUT}")
