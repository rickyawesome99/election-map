#!/usr/bin/env python3
"""Which state legislative seats share ground: the geographic link the candidate index uses to
decide that two spellings of one name, on two DIFFERENT seats, are one person.

A member who moves from the House to the Senate (South Carolina's Roger Nutt, HD 34 -> SD 12), or
whose district is renumbered by a redraw (Alaska's Andy Josephson, HD 17 -> HD 13), never shares a
seat key across the two spellings. What they share is territory: the Senate district contains the
House one, the new district is drawn from the old. A same-named candidate across the state shares
none, so a link here is evidence and its absence is not a merge.

For every state, every pair of district polygons that are NOT the same chamber on the same map
(a House district and a Senate district on any maps, or one chamber's district on two maps) is
linked when their intersection covers at least MIN_SHARE of the SMALLER district's area. Area, not
population: the question is only whether the two seats overlap, and the smaller-district share
keeps a compact urban seat inside a large rural one linked while dropping the boundary slivers the
simplified files leave along shared edges.

Polygons come from the same loader as build-state-leg-pres-by-era.py (current map = the 2026
TIGER source, superseded maps = public/state-leg-districts-historical). Keys are normalized the way
lib/stateLegDistrictKey.ts normalizes them.

Output: data-entry/state-leg-seat-links.json
  { "SC": ["house|current|34~senate|current|12", ...], ... }   (each pair once, sorted)

Usage: python3 scripts/build-state-leg-seat-links.py [ABBR ...]
"""

import importlib.util
import json
import os
import re
import sys

import geopandas as gpd

MIN_SHARE = 0.10

_here = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(_here)
OUT = os.path.join(ROOT, "data-entry", "state-leg-seat-links.json")

_spec = importlib.util.spec_from_file_location("pbe", os.path.join(_here, "build-state-leg-pres-by-era.py"))
pbe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pbe)


def norm(code):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\band\b", "", str(code).lower()))


def layers_for(abbr, index):
    stfp = pbe.fg.ABBR_TO_FIPS[abbr]
    chambers = ["senate"] if abbr == "NE" else ["house", "senate"]
    out = []
    for chamber in chambers:
        for era in sorted(pbe.eras_for(abbr, chamber, index)) + ["current"]:
            gdf = pbe.load_era_districts(abbr, chamber, era, stfp, pbe.DEFAULT_CACHE)
            if gdf is None or gdf.empty:
                print(f"  {abbr} {chamber} {era}: no polygons", file=sys.stderr)
                continue
            gdf = gdf.to_crs(epsg=5070)
            gdf["SEAT"] = [f"{chamber}|{era}|{norm(c)}" for c in gdf["CODE"]]
            gdf["AREA"] = gdf.geometry.area
            out.append((chamber, era, gdf[["SEAT", "AREA", "geometry"]]))
    return out


def links_for(abbr, index):
    layers = layers_for(abbr, index)
    pairs = set()
    for i in range(len(layers)):
        for j in range(i + 1, len(layers)):
            (ca, ea, a), (cb, eb, b) = layers[i], layers[j]
            if ca == cb and ea == eb:
                continue
            inter = gpd.overlay(a, b, how="intersection", keep_geom_type=True)
            if inter.empty:
                continue
            inter["SHARE"] = inter.geometry.area / inter[["AREA_1", "AREA_2"]].min(axis=1)
            for s1, s2 in inter.loc[inter["SHARE"] >= MIN_SHARE, ["SEAT_1", "SEAT_2"]].itertuples(index=False):
                pairs.add("~".join(sorted((s1, s2))))
    return sorted(pairs)


def main():
    index = pbe.load_hist_index()
    abbrs = [a.upper() for a in sys.argv[1:]] or sorted(pbe.fg.ABBR_TO_FIPS)
    result = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for abbr in abbrs:
        if abbr == "DC":
            continue
        result[abbr] = links_for(abbr, index)
        print(f"{abbr}: {len(result[abbr])} links")
    with open(OUT, "w") as f:
        json.dump(dict(sorted(result.items())), f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
