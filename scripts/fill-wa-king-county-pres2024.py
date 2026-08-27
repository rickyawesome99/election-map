"""
Fills WA's King County gap in data-entry/state-leg-pres2024/WA.json.

MEDSL's WA file reports King County's entire ~1.1M votes (29% of the state) as ONE fake precinct
("9917") for every office, so crosswalk-state-leg-pres2024.py has to drop it (MAX_SPLIT_DISTRICTS) -
leaving the 13 wholly-King legislative districts with no data and the 4 King-touching ones (1, 32,
31, 39...) with only their non-King votes. King County Elections publishes real precinct-level
results with each precinct's legislative district as a column (King County Open Data,
"November 2024 General Election Final Precinct Results", dataset uuda-pmuy:
https://data.kingcounty.gov/api/views/uuda-pmuy/rows.csv?accessType=DOWNLOAD) - WA precincts nest
inside legislative districts, so the join is a plain group-by, no geometry involved.

This ADDS King's per-district totals onto whatever WA.json already holds for a district (the
non-King remainder from the crosswalk), or creates the district if absent. WA's House and Senate
share the same 49 boundaries, so both chambers get the identical result. Run once, after the
crosswalk; rerunning the crosswalk (which regenerates WA.json without King) requires rerunning this.

Usage: python3 scripts/fill-wa-king-county-pres2024.py <king-precinct-results.csv>
"""
import csv
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WA_JSON = os.path.join(ROOT, "data-entry", "state-leg-pres2024", "WA.json")
NON_VOTE_COUNTERS = {"Registered Voters", "Times Counted", "Times Under Voted", "Times Over Voted", "Times Blank Voted"}


def load_king_by_district(path):
    out = defaultdict(lambda: {"dem": 0, "rep": 0, "oth": 0})
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if not r["Race"].startswith("President and Vice President"):
                continue
            ct = r["CounterType"]
            if ct in NON_VOTE_COUNTERS:
                continue
            if not r["LegislativeDistrict"]:
                continue  # "ELECTIONS OFFICE" pseudo-precinct, 17 votes, no district
            n = int(r["SumOfCount"])
            ld = str(int(r["LegislativeDistrict"]))
            if ct.startswith("Kamala D. Harris"):
                out[ld]["dem"] += n
            elif ct.startswith("Donald J. Trump"):
                out[ld]["rep"] += n
            else:
                out[ld]["oth"] += n
    return out


def main(king_csv):
    king = load_king_by_district(king_csv)
    tot = {b: sum(v[b] for v in king.values()) for b in ("dem", "rep", "oth")}
    print(f"King County by LD: {len(king)} districts, dem={tot['dem']:,} rep={tot['rep']:,} oth={tot['oth']:,}")
    data = json.load(open(WA_JSON))
    for chamber in ("house", "senate"):
        ch = data.setdefault(chamber, {})
        created, merged = 0, 0
        for ld, k in king.items():
            cur = ch.get(ld)
            if cur:
                dem, rep, total = cur["demVotes"] + k["dem"], cur["repVotes"] + k["rep"], cur["totalVotes"] + k["dem"] + k["rep"] + k["oth"]
                merged += 1
            else:
                dem, rep, total = k["dem"], k["rep"], k["dem"] + k["rep"] + k["oth"]
                created += 1
            dem_pct, rep_pct = round(dem / total * 100, 1), round(rep / total * 100, 1)
            ch[ld] = {"demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1),
                      "demVotes": dem, "repVotes": rep, "totalVotes": total}
        print(f"WA {chamber}: created {created}, merged King votes into {merged} -> {len(ch)} districts")
    with open(WA_JSON, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    print(f"wrote {WA_JSON}")


if __name__ == "__main__":
    main(sys.argv[1])
