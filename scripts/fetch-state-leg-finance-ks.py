#!/usr/bin/env python3
"""
Kansas House fundraising for the 2016 cycle from the Governmental Ethics Commission's published summary
"2016 House Candidates – Summary of Receipts and Expenditures" (kansas.gov/ethics/GECSummaries/H2016.pdf).
Kansas filings are otherwise scanned images; there is no Senate file for 2016 and none after 2016.

  python3 scripts/fetch-state-leg-finance-ks.py

One block per candidate: name, district, party, incumbency, primary/general won/lost, and monetary and
in-kind contributions by source (business, individuals, out-of-state, PACs, party, self, unitemized) for
Jan 1 2015 – Dec 31 2016. Contributions = monetary + in-kind. The PDF's text layer is OCR and drops
decimal points ("$11,25000"); every figure has cents, so amounts are read as digits ÷ 100, and a
block's printed total is replaced by the sum of its source lines when the two disagree.
Michael Houser, HD-1: $9,200 monetary + $1,440 in-kind.

Output: data-entry/state-leg-finance/portal-raw/KS-2016.json. The PDF is cached in scratch portal-cache/ks/.
"""
import datetime
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ks"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Kansas Governmental Ethics Commission 2016 House summary (monetary + in-kind)"
SOURCES = ("Business", "Individuals", "Out-of-State", "PACs", "Party", "Self", "Unitemized")


def cents(tok):
    digits = re.sub(r"\D", "", tok)
    return int(digits) / 100 if digits else 0.0


pdf = os.path.join(CACHE, "H2016.pdf")
if not os.path.exists(pdf):
    os.makedirs(CACHE, exist_ok=True)
    subprocess.run(["curl", "-sSf", "-A", UA, "-o", pdf, "https://www.kansas.gov/ethics/GECSummaries/H2016.pdf"], check=True)
lines = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace").splitlines()

out, fixed = [], 0
for i, line in enumerate(lines):
    d = re.search(r"District:\s*(\d+)", line)
    # a page footer repeats "District: N" too; a candidate block has its Party line right below
    if not d or not any("Party:" in l for l in lines[i + 1:i + 6]):
        continue
    name = next((re.sub(r"^\s*I?\s+|\s+I\s*$", "", lines[j]).strip() for j in range(i - 1, max(i - 4, 0), -1)
                 if re.search(r"[A-Za-z]{2}", lines[j]) and "District" not in lines[j]), "")
    block = lines[i:i + 30]
    party = next((m.group(1) for l in block if (m := re.search(r"Party:\s*(\w+)", l))), None)
    party = {"Oem": "Dem", "0em": "Dem"}.get(party, party)
    mon = ink = 0.0
    total_mon = total_ink = None
    started = False
    for l in block:
        if "MONETARY" in l:
            started = True
            continue
        amts = re.findall(r"\$[\d,.]+", l)
        if started and l.strip().startswith("Total"):
            if len(amts) >= 2:
                total_mon, total_ink = cents(amts[0]), cents(amts[1])
            break
        if started and len(amts) >= 2 and re.match(r"\s*\S", l) and not l.strip().startswith(("Printing", "Newspaper")):
            mon += cents(amts[0])  # OCR garbles the source labels ("Individual~", "Out-ot-State"); the columns hold
            ink += cents(amts[1])  # monetary, in-kind, then the expenditure column
    if total_mon is None or abs(total_mon - mon) > 0.5 or abs(total_ink - ink) > 0.5:
        fixed += 1
        total_mon, total_ink = mon, ink
    out.append({"name": name, "party": party, "chamber": "house", "district": d.group(1), "contributions": round(total_mon + total_ink, 2)})

body = {"state": "KS", "cycle": 2016, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": "12/31/2016", "candidates": out}
os.makedirs(OUT_DIR, exist_ok=True)
json.dump(body, open(os.path.join(OUT_DIR, "KS-2016.json"), "w"), indent=1)
print(f"KS 2016: {len(out)} House candidates ({fixed} printed totals replaced by the sum of their lines)")
