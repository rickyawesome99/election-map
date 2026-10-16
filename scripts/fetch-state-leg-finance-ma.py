#!/usr/bin/env python3
"""
Massachusetts state legislative fundraising from the Office of Campaign and Political Finance's
public API (api.ocpf.us), cycles 2016–2026.

  python3 scripts/fetch-state-leg-finance-ma.py [CYCLE ...]

Roster: /reports/legislative/race/depository/{Y}?displayGroup=House|Senate — every candidate for the
seat that year with cpfId, district ("3rd Norfolk", the atlas's own key), party and winner flag.
Money: a 2-year cycle = the committee's receipts + in-kind for calendar years Y-1 and Y, from
/reports/reportList/{cpfId}: depository Year-End summaries (BaseReportTypeId 3, 2020 on, one per
year) or, before depository banking, the CPF 102 reports (BaseReportTypeId 8; mid-year, pre-primary,
pre-election, year-end). Amended originals are skipped. A current year with no year-end report yet
uses the roster's receipts-to-date. Ron Mariano, 3rd Norfolk, 2022: $269,696.06 + $202,496.28.

Output: data-entry/state-leg-finance/portal-raw/MA-{cycle}.json. API responses cached in scratch portal-cache/ma/.
"""
import datetime
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ma"
API = "https://api.ocpf.us"
SOURCE = "Massachusetts OCPF (receipts + in-kind, two calendar years)"
TODAY = datetime.date.today()


def get(path, name, refresh=False):
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and not refresh:
        return json.load(open(p))
    for attempt in range(5):
        r = subprocess.run(["curl", "-sS", "--max-time", "90", API + path], capture_output=True)
        try:
            data = json.loads(r.stdout)
            break
        except ValueError:
            time.sleep(5 * (attempt + 1))
    else:
        sys.exit(f"MA: failed {path}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(data, open(p, "w"))
    return data


def num(s):
    try:
        return float(str(s).replace("$", "").replace(",", ""))
    except ValueError:
        return 0.0


def year_money(cpf, year):
    """(receipts + in-kind, expenditures) for one calendar year, or None when nothing was filed."""
    refresh = year >= TODAY.year
    for base in (3, 8):
        d = get(f"/reports/reportList/{cpf}?CpfId={cpf}&BaseReportTypeId={base}&ReportYear={year}&withSummary=true&PageSize=200&StartIndex=1", f"reports/{cpf}-{base}-{year}.json", refresh)
        items = [x for x in (d.get("items") or []) if not x.get("isAmended")]
        if base == 3:
            items = [x for x in items if x.get("isYe") or "Year-End" in (x.get("formTitle") or "")]
        if items:
            return sum(num(x.get("receiptTotal")) + num(x.get("inkindTotal")) for x in items), sum(num(x.get("expenditureTotal")) for x in items)
    return None


def fetch(cycle):
    current = cycle >= TODAY.year
    out = []
    for chamber, group in (("house", "House"), ("senate", "Senate")):
        roster = get(f"/reports/legislative/race/depository/{cycle}?displayGroup={group}", f"roster/{cycle}-{group}.json", current)

        def one(c):
            parts = [year_money(c["cpfId"], y) for y in (cycle - 1, cycle)]
            if current and parts[1] is None:
                parts[1] = (c.get("receiptsYtdNumeric") or 0.0, c.get("expendituresYtdNumeric") or 0.0)
            known = [p for p in parts if p is not None]
            return {
                "name": c["filerName"], "party": c.get("partyAffiliation"), "chamber": chamber, "district": c["officeSought"],
                "contributions": round(sum(p[0] for p in known), 2) if known else None,
                "expenditures": round(sum(p[1] for p in known), 2) if known else None,
            }

        with ThreadPoolExecutor(4) as ex:
            rows = list(ex.map(one, roster))
        out += rows
        print(f"MA {cycle} {chamber}: {len(rows)} candidates")
    body = {"state": "MA", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if current else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"MA-{cycle}.json"), "w"), indent=1)


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026]:
        fetch(c)
