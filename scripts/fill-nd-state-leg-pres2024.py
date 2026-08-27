#!/usr/bin/env python3
"""
North Dakota: 2024 presidential results per legislative district straight from MEDSL's precinct
file, no geometry needed.

ND precinct codes embed the legislative district: MEDSL's `precinct` is
`<county sequence 1-53><district DD><precinct PP>` (e.g. "22401" = county #2 Barnes, District 24,
precinct 01; "301501" = county #30, District 15, precinct 01), matching the Census VTD NAME20
"24-01". Precincts nest inside districts by construction, so a district's presidential vote is a
plain group-by on the DD digits. The direct crosswalk only covered the ~half of districts that had
a 2024 legislative race (ND staggers both chambers), hence 27/47 + 26/47 before this script.

House subdistricts: District 4 is split into 4A/4B (the current boundary file has no 9A/9B - it
carries the court-ordered whole District 9 used in Nov 2024, which is what the precinct codes
reflect). 4A/4B are taken from the STATE HOUSE rows (both were on the 2024 ballot), every other
House district = the Senate district of the same number.

Usage: python3 scripts/fill-nd-state-leg-pres2024.py <medsl 2024-nd-precinct-general.tab>
Overwrites data-entry/state-leg-pres2024/ND.json; rerun scripts/build-state-leg-pres2024.mjs after.
"""

import json
import os
import sys
from collections import defaultdict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data-entry", "state-leg-pres2024", "ND.json")


def bucket(row):
    p = (row["party_simplified"] or "").upper()
    if p == "DEMOCRAT":
        return "dem"
    if p == "REPUBLICAN":
        return "rep"
    return "oth"


def entry(v):
    tot = v["dem"] + v["rep"] + v["oth"]
    dem_pct = round(v["dem"] / tot * 100, 1)
    rep_pct = round(v["rep"] / tot * 100, 1)
    return {"demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1),
            "demVotes": v["dem"], "repVotes": v["rep"], "totalVotes": tot}


def main():
    df = pd.read_csv(sys.argv[1], sep="\t", dtype=str, keep_default_na=False)
    df["votes"] = df["votes"].astype(int)
    pres = df[df["office"] == "US PRESIDENT"].copy()
    assert set(pres["mode"]) == {"TOTAL"}, set(pres["mode"])
    pres = pres[~pres["candidate"].str.contains("WRITE", na=False) | (pres["party_simplified"] != "")]
    pres["dist"] = pres["precinct"].str[-4:-2].str.lstrip("0")
    pres["b"] = pres.apply(bucket, axis=1)

    by_dist = defaultdict(lambda: {"dem": 0, "rep": 0, "oth": 0})
    by_prec = defaultdict(lambda: {"dem": 0, "rep": 0, "oth": 0})
    for _, r in pres.iterrows():
        by_dist[r["dist"]][r["b"]] += r["votes"]
        by_prec[r["precinct"]][r["b"]] += r["votes"]

    senate = {d: entry(v) for d, v in by_dist.items()}
    house = {d: dict(e) for d, e in senate.items() if d != "4"}

    # District 4 subdistricts from the STATE HOUSE rows (precinct -> 04A/04B).
    sub = df[(df["office"] == "STATE HOUSE") & df["district"].isin(["04A", "04B"]) & (df["votes"] > 0)]
    prec_to_sub = {}
    for _, r in sub.drop_duplicates(["precinct", "district"]).iterrows():
        prec_to_sub.setdefault(r["precinct"], set()).add(r["district"])
    d4 = [p for p in by_prec if p[-4:-2] == "04"]
    acc = defaultdict(lambda: {"dem": 0, "rep": 0, "oth": 0})
    unassigned = []
    for p in d4:
        subs = prec_to_sub.get(p)
        if not subs or len(subs) != 1:
            unassigned.append((p, subs))
            continue
        code = next(iter(subs)).lstrip("0")
        for k in acc[code]:
            acc[code][k] += by_prec[p][k]
    if unassigned:
        print("District 4 precincts not cleanly assigned to 4A/4B:", unassigned)
    for code, v in acc.items():
        house[code] = entry(v)

    tot = pres.groupby("b")["votes"].sum().to_dict()
    print(f"ND statewide: dem={tot.get('dem', 0):,} rep={tot.get('rep', 0):,} oth={tot.get('oth', 0):,}")
    print(f"ND house: {len(house)} districts; senate: {len(senate)} districts")
    with open(OUT, "w") as f:
        json.dump({"house": house, "senate": senate}, f, indent=2, sort_keys=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
