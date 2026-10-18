#!/usr/bin/env python3
"""
Virginia state legislative fundraising for the 2017 House of Delegates election (Transparency USA's
Virginia data starts with 2019) from the Department of Elections' legacy bulk report files.

  python3 scripts/fetch-state-leg-finance-va.py [YEAR ...]       default 2017

apps.elections.virginia.gov/SBE_CSV/CF/YYYY_MM/ holds, per month SUBMITTED, Report.csv (committee,
candidate, office sought, district, election cycle "11/2017", period, amendment count) and
ScheduleH.csv (each report's summary). Contributions = ScheduleH ContributionsReceived summed over the
committee's reports for the election cycle, the most-amended report per period. Months from January of
the year before through February after the election. TotalReceiptsThisElectionCycle is NOT used: it
resets mid-cycle (Danica Roem shows $12,551 there; the sum is $978,781.63).

Output: data-entry/state-leg-finance/portal-raw/VA-{year}.json. CSVs cached in scratch portal-cache/va/.
"""
import collections
import csv
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/va"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Virginia Department of Elections report summaries (Schedule H contributions received)"


def month_file(ym, kind):
    p = os.path.join(CACHE, f"{kind}_{ym}.csv")
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        name = "Report.csv" if kind == "Report" else "ScheduleH.csv"
        r = subprocess.run(["curl", "-sS", "-A", UA, "-o", p, "-w", "%{http_code}", f"https://apps.elections.virginia.gov/SBE_CSV/CF/{ym}/{name}"], capture_output=True)
        if r.stdout.decode() != "200":
            open(p, "w").close()
    return p


def rows(p):
    return csv.DictReader(open(p, encoding="utf-8-sig", errors="replace")) if os.path.getsize(p) else []


def fetch(year):
    months = [f"{y}_{m:02d}" for y in (year - 1, year, year + 1) for m in range(1, 13) if not (y == year + 1 and m > 2)]
    reps = {}
    for ym in months:
        for r in rows(month_file(ym, "Report")):
            reps[r["ReportId"]] = r
    best = {}
    for ym in months:
        for h in rows(month_file(ym, "H")):
            r = reps.get(h["ReportId"])
            if not r or r["ElectionCycle"] != f"11/{year}" or r["IsGeneralAssembly"] != "True":
                continue
            k = (r["CommitteeCode"], r["StartDate"][:10], r["EndDate"][:10])
            if k not in best or int(r["AmendmentCount"] or 0) >= int(best[k][0]["AmendmentCount"] or 0):
                best[k] = (r, h)
    tot = collections.defaultdict(float)
    info = {}
    for (cc, _, _), (r, h) in best.items():
        try:
            tot[cc] += float(h["ContributionsReceived"] or 0)
        except ValueError:
            pass
        info[cc] = r
    out = []
    for cc, v in tot.items():
        r = info[cc]
        office = (r["OfficeSought"] or "").lower()
        d = re.search(r"(\d+)", r["District"] or "") or re.search(r"(\d+)", r["OfficeSought"] or "")
        out.append({"name": r["CandidateName"], "party": r.get("Party"), "chamber": "senate" if "senat" in office else "house",
                    "district": str(int(d.group(1))) if d else None, "committee": cc, "contributions": round(v, 2)})
    body = {"state": "VA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"VA-{year}.json"), "w"), indent=1)
    print(f"VA {year}: {len(out)} General Assembly committees")


if __name__ == "__main__":
    for y in [int(a) for a in sys.argv[1:]] or [2017]:
        fetch(y)
