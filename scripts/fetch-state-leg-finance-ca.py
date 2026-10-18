#!/usr/bin/env python3
"""
California state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
Secretary of State's Cal-Access raw data export (campaignfinance.cdn.sos.ca.gov/dbwebexport.zip, ~1.6 GB;
the web UI is bot-walled, the bulk file is not).

  python3 scripts/fetch-state-leg-finance-ca.py [YEAR ...]       default 2016

CVR_CAMPAIGN_DISCLOSURE_CD: every Form 460 cover with filer, candidate, office (ASM / SEN) and district;
the latest amendment of each filing, periods ending in Y-1 or Y. SMRY_CD: that filing's summary lines,
contributions = line 1 (monetary) + line 4 (non-monetary) — line 5 would add loans received. Summed per
filer (committee); scripts/assign-state-leg-finance.ts matches the candidate name within the district.

Output: data-entry/state-leg-finance/portal-raw/CA-{year}.json. The zip is cached in scratch portal-cache/ca/.
"""
import collections
import csv
import datetime
import io
import json
import os
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ca"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "California Cal-Access Form 460 summaries (monetary + non-monetary contributions)"
csv.field_size_limit(10**9)


def table(z, name):
    with z.open(next(n for n in z.namelist() if n.upper().endswith(name))) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""), delimiter="\t", quoting=csv.QUOTE_NONE)


def date(s):
    try:
        return datetime.datetime.strptime((s or "").split(" ")[0], "%m/%d/%Y").date()
    except ValueError:
        return None


def main(years):
    path = os.path.join(CACHE, "dbwebexport.zip")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", path, "https://campaignfinance.cdn.sos.ca.gov/dbwebexport.zip"], check=True)
    z = zipfile.ZipFile(path)
    covers = [r for r in table(z, "CVR_CAMPAIGN_DISCLOSURE_CD.TSV") if r["FORM_TYPE"] == "F460"]
    for year in years:
        lo, hi = datetime.date(year - 1, 1, 1), datetime.date(year, 12, 31)
        best = {}
        for r in covers:
            t = date(r["THRU_DATE"])
            oc, od = (r["OFFICE_CD"] or "").upper(), (r["OFFIC_DSCR"] or "").upper()
            if not t or not (lo <= t <= hi) or not (oc in ("ASM", "SEN") or "ASSEMBLY" in od or "STATE SEN" in od):
                continue
            a = int(r["AMEND_ID"] or 0)
            if r["FILING_ID"] not in best or a > best[r["FILING_ID"]][0]:
                best[r["FILING_ID"]] = (a, r)
        want = {(fid, str(a)) for fid, (a, _) in best.items()}
        lines = collections.defaultdict(float)
        for r in table(z, "SMRY_CD.TSV"):
            if r["FORM_TYPE"] == "F460" and r["LINE_ITEM"] in ("1", "4") and (r["FILING_ID"], r["AMEND_ID"]) in want:
                lines[r["FILING_ID"]] += float(r["AMOUNT_A"] or 0)
        tot = {}
        for fid, (_, r) in best.items():
            x = tot.setdefault(r["FILER_ID"], {"contributions": 0.0})
            x["contributions"] += lines.get(fid, 0.0)
            oc, od = (r["OFFICE_CD"] or "").upper(), (r["OFFIC_DSCR"] or "").upper()
            x.update({"name": f'{r["CAND_NAMF"]} {r["CAND_NAML"]}'.strip() or r["FILER_NAML"], "committee": r["FILER_NAML"],
                      "chamber": "senate" if oc == "SEN" or "SEN" in od else "house", "district": (r["DIST_NO"] or "").lstrip("0") or None})
        out = [dict(v, contributions=round(v["contributions"], 2)) for v in tot.values()]
        body = {"state": "CA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"CA-{year}.json"), "w"), indent=1)
        print(f"CA {year}: {len(out)} legislative committees")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016])
