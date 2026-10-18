#!/usr/bin/env python3
"""
Illinois state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the
State Board of Elections' bulk data files (www.elections.il.gov/campaigndisclosuredatafiles/).

  python3 scripts/fetch-state-leg-finance-il.py [YEAR ...]       default 2016

Candidates.txt + CanElections.txt: legislative candidates with a general-election (GE) row for the
year, district from Candidates. CmteCandidateLinks.txt ties them to committees. D2Totals.txt holds
each D-2 quarterly report's totals (FiledDocs.txt gives its period): contributions = individual +
transfers in + other receipts (itemized and not) + in-kind, LOANS LEFT OUT, summed over reports whose
period ends in Y-1 or Y, the latest-received filing per period (amendments). A candidate tied to several
committees (a leadership fund beside the campaign committee) counts only the largest.
Michael Madigan, HD-22, 2016: $5,601,837.75 (the agent's check; his own committee).

Output: data-entry/state-leg-finance/portal-raw/IL-{year}.json. Files cached in scratch portal-cache/il/.
"""
import collections
import csv
import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/il"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://www.elections.il.gov/campaigndisclosuredatafiles/"
SOURCE = "Illinois State Board of Elections D-2 report totals (contributions, loans excluded)"
OFFICES = {"State Representative": "house", "State Senator": "senate", "State Senate": "senate", "Representative in General Assembly": "house"}
csv.field_size_limit(10**9)


def rd(name):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", p, BASE + name], check=True)
    return csv.DictReader(open(p, encoding="latin-1", newline=""), delimiter="\t", quoting=csv.QUOTE_NONE)


def main(years):
    cands = {r["ID"]: r for r in rd("Candidates.txt")}
    ge = collections.defaultdict(set)
    for r in rd("CanElections.txt"):
        if r["ElectionType"].strip() == "GE":
            ge[r["CandidateID"]].add(int(r["ElectionYear"]))
    links = collections.defaultdict(list)
    for r in rd("CmteCandidateLinks.txt"):
        links[r["CandidateID"]].append(r["CommitteeID"])
    docs = {r["ID"]: r for r in rd("FiledDocs.txt")}
    totals = list(rd("D2Totals.txt"))
    f = lambda x: float(x or 0)
    for year in years:
        best = {}
        for r in totals:
            d = docs.get(r["FiledDocID"])
            if not d or not (f"{year - 1}-01-01" <= d["RptPdEndDate"][:10] <= f"{year}-12-31"):
                continue
            k = (r["CommitteeID"], d["RptPdBegDate"][:10], d["RptPdEndDate"][:10])
            if k not in best or d["RcvdDateTime"] > best[k][0]:
                best[k] = (d["RcvdDateTime"], r)
        tot = collections.defaultdict(float)
        for (cm, _, _), (_, r) in best.items():
            tot[cm] += sum(f(r[c]) for c in ("IndivContribI", "IndivContribNI", "XferInI", "XferInNI", "OtherRctI", "OtherRctNI", "TotalInKind"))
        out = []
        for cid, c in cands.items():
            chamber = OFFICES.get(c["Office"].strip())
            if not chamber or year not in ge.get(cid, set()):
                continue
            vals = [tot[cm] for cm in links.get(cid, []) if cm in tot]
            out.append({"name": f'{c["FirstName"].strip()} {c["LastName"].strip()}', "party": c.get("PartyAffiliation"), "chamber": chamber,
                        "district": c["District"].strip(), "contributions": round(max(vals), 2) if vals else None})
        body = {"state": "IL", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"IL-{year}.json"), "w"), indent=1)
        print(f"IL {year}: {len(out)} general-election candidates")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016])
