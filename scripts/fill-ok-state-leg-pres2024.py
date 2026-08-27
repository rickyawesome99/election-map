#!/usr/bin/env python3
"""
Oklahoma: 2024 presidential results per state House/Senate district via the State Election
Board's precinct -> district lookup, no geometry needed.

Oklahoma re-precincted statewide in 2022 so that every precinct nests inside a single House and
Senate district (which is also why the 2020 Census VTDs are useless here - different numbering).
The OU Center for Spatial Analysis, which does the Election Board's mapping, publishes the current
statewide precinct layer as an ArcGIS feature service ("Voter Precincts 2020" on
csagis-uok.opendata.arcgis.com) whose attribute table carries `PCT_CEB` (the 6-digit precinct
code MEDSL reports without the leading zero: MEDSL "10001" = PCT_CEB "010001"), `St_house` and
`St_senate`. Verified: 576/576 MEDSL STATE HOUSE precinct->district rows and 438/438 STATE SENATE
rows agree with the lookup (the only disagreements are the pooled pseudo-precincts below).

Pooled rows: Oklahoma County (55) and Tulsa County (72) report part of their early/absentee vote
under a county-wide pseudo-precinct "559999"/"729999" (~220k votes, 7% of the state) with no
district. Those are spread across the county's real precincts in proportion to each precinct's own
votes for that party (same POOLED_REDISTRIBUTION approximation used for Detroit's counting boards
and Louisiana's parish-level early vote). Two other unmatched codes (290204, 440026) are tiny.

Usage:
  python3 scripts/fill-ok-state-leg-pres2024.py <medsl 2024-ok-precinct-general.tab> [precincts.json]
precincts.json = the feature-service query result (attributes only); downloaded automatically when
omitted. Overwrites data-entry/state-leg-pres2024/OK.json; rerun build-state-leg-pres2024.mjs after.
"""

import json
import os
import sys
import urllib.request
from collections import defaultdict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data-entry", "state-leg-pres2024", "OK.json")
SERVICE = ("https://services.arcgis.com/3xOwF6p0r7IHIjfn/arcgis/rest/services/State_Wide_2020_Precincts/"
           "FeatureServer/0/query?where=1%3D1&outFields=PCT_CEB,St_house,St_senate,COUNTY,COUNTY_NAM"
           "&returnGeometry=false&resultRecordCount=2000&f=json")
NON_CANDIDATE = ("OVER", "UNDER", "TOTAL", "BLANK")


def bucket(party_simplified, party_detailed, candidate):
    p = (party_simplified or party_detailed or "").upper()
    if p == "DEMOCRAT":
        return "dem"
    if p == "REPUBLICAN":
        return "rep"
    c = (candidate or "").upper()
    if "HARRIS" in c:
        return "dem"
    if "TRUMP" in c:
        return "rep"
    return "oth"


def entry(v):
    tot = v["dem"] + v["rep"] + v["oth"]
    dem_pct = round(v["dem"] / tot * 100, 1)
    rep_pct = round(v["rep"] / tot * 100, 1)
    return {"demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1),
            "demVotes": int(round(v["dem"])), "repVotes": int(round(v["rep"])), "totalVotes": int(round(tot))}


def main():
    medsl = sys.argv[1]
    if len(sys.argv) > 2:
        svc = json.load(open(sys.argv[2]))
    else:
        svc = json.load(urllib.request.urlopen(SERVICE))
    lookup = {f["attributes"]["PCT_CEB"]: (f["attributes"]["St_house"].lstrip("0"), f["attributes"]["St_senate"].lstrip("0"))
              for f in svc["features"]}
    print(f"precinct lookup: {len(lookup)} precincts")

    df = pd.read_csv(medsl, sep="\t", dtype=str, keep_default_na=False)
    pres = df[df["office"] == "US PRESIDENT"].copy()
    pres = pres[~pres["candidate"].str.upper().str.contains("|".join(NON_CANDIDATE))]
    pres["votes"] = pres["votes"].astype(int)
    # OK reports a TOTAL mode row alongside ELECTION DAY/EARLY/ABSENTEE rows for the same
    # precinct+candidate (same quirk as DE/RI) - summing everything doubles the state. Prefer
    # TOTAL where a precinct+candidate has one, else sum the mutually exclusive modes.
    has_total = pres[pres["mode"] == "TOTAL"].groupby(["precinct", "candidate"]).size().index
    key = pd.MultiIndex.from_frame(pres[["precinct", "candidate"]])
    pres = pres[(pres["mode"] == "TOTAL") | ~key.isin(has_total)]
    pres["code"] = pres["precinct"].str.zfill(6)
    pres["b"] = [bucket(a, b, c) for a, b, c in zip(pres["party_simplified"], pres["party_detailed"], pres["candidate"])]

    by_prec = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for code, b, v in zip(pres["code"], pres["b"], pres["votes"]):
        by_prec[code][b] += v

    # Pooled / unmatched precincts -> redistribute within county by party share.
    matched = {c: v for c, v in by_prec.items() if c in lookup}
    pooled = {c: v for c, v in by_prec.items() if c not in lookup}
    for code, v in pooled.items():
        county = code[:2]
        peers = {c: pv for c, pv in matched.items() if c[:2] == county}
        if not peers:
            print(f"unmatched precinct {code} ({sum(v.values()):,.0f} votes) has no county peers - dropped")
            continue
        for b in ("dem", "rep", "oth"):
            denom = sum(pv[b] for pv in peers.values())
            if denom <= 0:
                continue
            for c, pv in peers.items():
                pv[b] += v[b] * pv[b] / denom
        print(f"pooled {code}: {sum(v.values()):,.0f} votes spread over {len(peers)} county precincts")

    house = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    senate = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for code, v in matched.items():
        h, s = lookup[code]
        for b in v:
            house[h][b] += v[b]
            senate[s][b] += v[b]

    tot = {b: sum(v[b] for v in matched.values()) for b in ("dem", "rep", "oth")}
    print(f"OK statewide: dem={tot['dem']:,.0f} rep={tot['rep']:,.0f} oth={tot['oth']:,.0f} total={sum(tot.values()):,.0f}")
    out = {"house": {k: entry(v) for k, v in house.items()}, "senate": {k: entry(v) for k, v in senate.items()}}
    print(f"OK house: {len(out['house'])} districts; senate: {len(out['senate'])} districts")
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
