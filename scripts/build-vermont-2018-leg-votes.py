#!/usr/bin/env python3
"""Vermont's 2018 Senate results, from the Secretary of State's town-level export.

The last Phase 3 gap. Klarner's Vermont 2018 Senate is corrupt - its Chittenden district
carries 867,753 Democratic votes, about twelve per voter and 69.6% of a chamber that should
be nearer 41% - so it sits in that script's SKIP list, and the Wikipedia article has no
district tables to fall back on.

SOURCE: the VT SoS "elstats" search export, one row per town x office x candidate, as CSV.
`--extract` reads it and writes data-entry/vermont_2018_legislature.csv; the committed CSV is
what the other modes read, so the export is not needed again.

USE THE CSV EXPORT, NOT THE `vt_november_general_2018_1.csv.pdf` PRINTOUT. That PDF is part
ONE of a multi-part set: 142 of Vermont's ~246 municipalities, missing Burlington, South
Burlington, Essex and Colchester - the four largest towns of Chittenden, the six-member
district - and its Senate votes come to only 378,945. The CSV carries all 293 divisions. (The
"United States and Vermont Statewide Offices" canvassing report is no help either: US and
statewide offices only, with no legislative rows at all.)

TWO THINGS THE PARSE HAS TO HANDLE:

  * NON-CANDIDATE ROWS. "Total Votes Cast", "Total Ballots Cast", "Undervotes" and
    "Overvotes" are filed as candidates with a blank party, once per town, and together come
    to 2.5 million votes - four times the real chamber total. Dropping them is the single most
    important step. "Write-Ins" is also blank-partied but IS a real vote and belongs in Other.
  * FUSION, and the CSV LOSES what the printout knows. Vermont cross-endorses heavily; the
    printout labels each candidate in their own party's order ("REP/DEM" for the Republican
    Joe Benning, "DEM/REP" for the Democrat Jane Kitchel) but the CSV flattens both to
    "Democratic/Republican". Six senators are affected, and taking the CSV at face value
    reports Benning and Westman as Democrats and leaves Caledonia, Grand Isle and Lamoille
    looking as though they cast no Republican votes at all. FUSION_PARTY restores each from
    the printout's ordered label. Slash labels naming only one major party (Dem/Prog,
    Progressive/Democratic) are unambiguous and resolve to it, as elsewhere in this project.

Vermont's 2018 Senate districts are the pre-2022 map - Chittenden as a single six-member
district, Essex-Orleans, Grand Isle - so their keys deliberately do NOT match the current
boundary data, whose Chittenden is split into Central/North/South East. Phase 2's era table
(data/stateLegCalendar.ts) records which map a year used.

Usage:
    python3 scripts/build-vermont-2018-leg-votes.py --extract "/path/to/elstats_search_*.csv"
    python3 scripts/build-vermont-2018-leg-votes.py --report
    python3 scripts/build-vermont-2018-leg-votes.py --write
    python3 scripts/build-vermont-2018-leg-votes.py --districts
"""

import argparse
import collections
import csv
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
VT_CSV = os.path.join(REPO, "data-entry", "vermont_2018_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "VT-2018.json")

SOURCE = "Vermont SoS 2018 town-level returns (per-district)"

# Filed as candidates with a blank party, once per town. Left in, they add 2.5M phantom votes.
NON_CANDIDATE = {"total votes cast", "total ballots cast", "undervotes", "overvotes"}

# The six cross-endorsed senators, whose own party the CSV cannot express. Recovered from the
# ordered labels in the SoS printout, consistent across every town it covers: Benning REP/DEM
# x16, Westman REP/DEM x4, Kitchel DEM/REP x16, Rodgers DEM/REP x15, Starr DEM/REP x15,
# Mazza DEM/REP x2.
FUSION_PARTY = {
    "Joe Benning": "R",
    "Richard A. Westman": "R",
    "Jane Kitchel": "D",
    "John S. Rodgers": "D",
    "Robert A. Starr": "D",
    "Richard Dick Mazza": "D",
}


def bucket(candidate, party):
    """D / R / O for one row."""
    if candidate in FUSION_PARTY:
        return FUSION_PARTY[candidate]
    p = (party or "").lower()
    if not p:
        return "O"          # write-ins land here; non-candidate rows are dropped before this
    has_d = "dem" in p
    # "Fair Representation VT" contains "rep" and is not a Republican label.
    has_r = "rep" in p and "representation" not in p
    if has_d and not has_r:
        return "D"
    if has_r and not has_d:
        return "R"
    return "O"


def extract(src_csv):
    res = collections.defaultdict(collections.Counter)
    seats = {}
    towns = set()
    dropped = 0
    fusion_seen = collections.Counter()
    with open(src_csv, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["office_name"] != "State Senate":
                continue
            name = r["candidate_name"].strip()
            if name.lower() in NON_CANDIDATE:
                dropped += 1
                continue
            try:
                v = int(r["votes"] or 0)
            except ValueError:
                continue
            d = r["district_name"].strip()
            if "/" in (r["candidate_party_name"] or "") and name in FUSION_PARTY:
                fusion_seen[name] += 1
            res[d][bucket(name, r["candidate_party_name"])] += v
            seats[d] = int(r["number_seats"] or 0)
            towns.add(r["division_name"])

    missing = sorted(set(FUSION_PARTY) - set(fusion_seen))
    print(f"districts {len(res)} | seats {sum(seats.values())} | towns {len(towns)} | "
          f"non-candidate rows dropped {dropped}")
    if missing:
        print(f"   NOTE: FUSION_PARTY names not found in this export: {missing}")
    return res, seats


def write_csv(res, seats):
    with open(VT_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "seats", "dem_votes", "rep_votes", "oth_votes",
                    "total_votes"])
        for d, c in sorted(res.items()):
            w.writerow(["Senate", d, seats[d], c["D"], c["R"], c["O"],
                        c["D"] + c["R"] + c["O"]])
    print(f"wrote {len(res)} districts -> {VT_CSV}")


def load_csv():
    out = {}
    with open(VT_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[r["district"]] = collections.Counter(
                D=int(r["dem_votes"]), R=int(r["rep_votes"]), O=int(r["oth_votes"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--extract", metavar="CSV")
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--districts", action="store_true")
    args = ap.parse_args()

    if args.extract:
        res, seats = extract(args.extract)
        write_csv(res, seats)
        return

    agg = load_csv()
    if args.districts:
        payload = {"senate": {
            "source": SOURCE,
            "districts": {
                d: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                    "totalVotes": c["D"] + c["R"] + c["O"]}
                for d, c in sorted(agg.items())
            },
        }}
        os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
        existing = (json.load(open(DISTRICTS_JSON, encoding="utf-8"))
                    if os.path.exists(DISTRICTS_JSON) else {})
        existing.update(payload)
        with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
            json.dump(existing, fh, indent=1)
            fh.write("\n")
        print(f"senate  {len(agg):3d} districts -> {DISTRICTS_JSON}")
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "Vermont" or r["year"] != "2018" or r["type"] != "Senate":
            continue
        d = sum(c["D"] for c in agg.values())
        rp = sum(c["R"] for c in agg.values())
        o = sum(c["O"] for c in agg.values())
        total = d + rp + o
        print(f"Senate  {len(agg):3d} districts   "
              f"was D={int(r['dem_votes']):>8,} R={int(r['rep_votes']):>8,} "
              f"O={int(r['oth_votes'] or 0):>6,} T={int(r['total_votes']):>9,}   "
              f"now D={d:>8,} R={rp:>8,} O={o:>6,} T={total:>9,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        r["note"] = ""
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} Vermont 2018 Senate row in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
