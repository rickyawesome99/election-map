#!/usr/bin/env python3
"""
Estimate a chamber's 2024 presidential results from the OTHER chamber's already-sourced results,
disaggregating through 2020 VTD-level presidential votes instead of raw polygon area.

Why: a 4-year-staggered Senate only has a 2024 legislative race in about half its districts, so the
MEDSL precinct crosswalk can only reach that half. `fill-state-leg-pres2024-gaps.py` filled the rest
by splitting each House district's votes across the Senate districts it overlaps in proportion to
AREA, which (a) is badly wrong wherever voters are unevenly spread inside a House district - the
usual case, since districts are equal-POPULATION, not equal-area - and (b) does not conserve votes,
because it only rewrites the missing districts and leaves the directly-crosswalked ones alone. PA's
Senate consequently over-counted by 45,645 Dem / 18,466 Rep against the certified state total.

Method: Dave's Redistricting publishes 2020 presidential results on 2020 VTDs with geometry for
every state (`E_20_PRES`), including the states with no 2024 data. Overlay the House and Senate
polygons to get the (house, senate) intersection cells, area-apportion each VTD's 2020 Dem/Rep/Total
into the cells it touches, and then split each House district's 2024 votes across its cells in
proportion to that cell's 2020 vote FOR THE SAME PARTY. Weighting per party matters: Democratic and
Republican voters are not spread alike inside a district, so a turnout-weighted split still misses
the partisan gradient a per-party split captures. Vote conservation is exact by construction - the
chamber's districts sum to the source chamber's total, whatever that total is.

Accuracy is reported, not assumed: districts that already have precinct-exact data are estimated
too and printed as a holdout comparison. Run with --dry-run first and read that line.

By default only districts MISSING from the target chamber are written (`estimated: true`), which
preserves precinct-exact data but leaves the chamber's sum short. --replace-chamber writes the
estimate for every district, which makes the chamber conserve votes exactly; use it when the
holdout error is small enough that consistency is worth more than the exact half.

Usage:
  python3 scripts/estimate-senate-pres2024-from-house.py PA --dry-run
  python3 scripts/estimate-senate-pres2024-from-house.py PA --replace-chamber
  python3 scripts/estimate-senate-pres2024-from-house.py ME --from senate --to house   # any direction
"""

import argparse
import glob
import importlib.util
import io
import json
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")
SRC = {"house": f"{ROOT}/data-entry/state-leg-districts-2026-source/state-house-districts-2026.json",
       "senate": f"{ROOT}/data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json"}
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/dra-cache"
GITHUB_RAW = "https://raw.githubusercontent.com/dra2020/vtd_data/master/2020_VTD/{st}/{name}"

sys.path.insert(0, os.path.dirname(__file__))
_fg_spec = importlib.util.spec_from_file_location("fg", os.path.join(os.path.dirname(__file__), "fill-state-leg-pres2024-gaps.py"))
fg = importlib.util.module_from_spec(_fg_spec)
_fg_spec.loader.exec_module(fg)


def dra_geojson(abbr, cache_dir):
    d = os.path.join(cache_dir, abbr)
    hit = glob.glob(os.path.join(d, "*.geojson"))
    if hit:
        return hit[0]
    for n in range(11, 3, -1):
        try:
            data = urllib.request.urlopen(GITHUB_RAW.format(st=abbr, name=f"Geojson_{abbr}.v{n:02d}.zip")).read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            continue
        zipfile.ZipFile(io.BytesIO(data)).extractall(d)
        print(f"{abbr}: downloaded Geojson_{abbr}.v{n:02d}.zip")
        return glob.glob(os.path.join(d, "*.geojson"))[0]
    sys.exit(f"{abbr}: no Geojson package in dra2020/vtd_data")


def load_weight_vtds(path):
    """2020 presidential votes per VTD - the disaggregation weight layer."""
    fc = json.load(open(path))
    rows, geoms = [], []
    for f in fc["features"]:
        ds = (f["properties"].get("datasets") or {}).get("E_20_PRES")
        if ds is None or not f.get("geometry"):
            continue
        dem, rep, tot = ds.get("Dem", 0) or 0, ds.get("Rep", 0) or 0, ds.get("Total", 0) or 0
        if tot <= 0:
            continue
        rows.append({"w_dem": float(dem), "w_rep": float(rep), "w_oth": float(max(tot - dem - rep, 0)) + 1e-9})
        geoms.append(shape(f["geometry"]).buffer(0))
    if not rows:
        sys.exit(f"{path}: no E_20_PRES data - cannot build a weight layer")
    return gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326")


def load_districts(abbr, chamber, stfp):
    fc = json.load(open(SRC[chamber]))
    feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    props = [f["properties"] for f in feats]
    gdf = gpd.GeoDataFrame(props, geometry=[shape(f["geometry"]).buffer(0) for f in feats], crs="EPSG:4326")
    gdf["CODE"] = [fg.extract_district_code(abbr, chamber, p) for p in props]
    return gdf.dropna(subset=["CODE"])[["CODE", "geometry"]]


def largest_remainder(values):
    floors = {k: int(v) for k, v in values.items()}
    short = int(round(sum(values.values()))) - sum(floors.values())
    for k in sorted(values, key=lambda k: values[k] - floors[k], reverse=True)[:max(short, 0)]:
        floors[k] += 1
    return floors


def build_cell_weights(vtds, src_gdf, dst_gdf):
    """weight[src_code][dst_code] -> {dem, rep, oth} of 2020 votes in that intersection cell."""
    src = src_gdf.to_crs(epsg=5070).rename(columns={"CODE": "SRC"})
    dst = dst_gdf.to_crs(epsg=5070).rename(columns={"CODE": "DST"})
    cells = gpd.overlay(src, dst, how="intersection", keep_geom_type=False)
    cells = cells[cells.geometry.area > 0].reset_index(drop=True)

    v = vtds.to_crs(epsg=5070).reset_index(drop=True)
    v["vid"] = v.index
    v["v_area"] = v.geometry.area
    ov = gpd.overlay(v, cells, how="intersection", keep_geom_type=False)
    ov["frac"] = ov.geometry.area / ov["v_area"]
    ov = ov[ov["frac"] > 1e-6]
    # A VTD is split across cells by area; renormalise so each VTD is fully allocated.
    ov["frac"] = ov["frac"] / ov.groupby("vid")["frac"].transform("sum")

    weight = defaultdict(lambda: defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0}))
    for s, d, fr, wd, wr, wo in zip(ov["SRC"], ov["DST"], ov["frac"], ov["w_dem"], ov["w_rep"], ov["w_oth"]):
        cell = weight[s][d]
        cell["dem"] += wd * fr
        cell["rep"] += wr * fr
        cell["oth"] += wo * fr
    # A source district with no 2020 votes anywhere (shouldn't happen, but guard) falls back to area.
    for s, row in weight.items():
        if sum(sum(c.values()) for c in row.values()) <= 0:
            for d in row:
                row[d] = {"dem": 1.0, "rep": 1.0, "oth": 1.0}
    return weight


def apportion(src_data, weight):
    acc = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for s, vals in src_data.items():
        cells = weight.get(s)
        if not cells:
            print(f"  source district {s} overlaps no target district - {vals.get('totalVotes')} votes dropped")
            continue
        dem = vals.get("demVotes") or 0
        rep = vals.get("repVotes") or 0
        oth = max((vals.get("totalVotes") or 0) - dem - rep, 0)
        for b, amount in (("dem", dem), ("rep", rep), ("oth", oth)):
            denom = sum(c[b] for c in cells.values())
            if denom <= 0:  # no 2020 voters of this party anywhere in the district
                denom = sum(sum(c.values()) for c in cells.values())
                shares = {d: sum(c.values()) / denom for d, c in cells.items()} if denom else {}
            else:
                shares = {d: c[b] / denom for d, c in cells.items()}
            for d, sh in shares.items():
                acc[d][b] += amount * sh
    return acc


def entry(v, estimated):
    tot = v["dem"] + v["rep"] + v["oth"]
    dem_pct = round(v["dem"] / tot * 100, 1)
    rep_pct = round(v["rep"] / tot * 100, 1)
    e = {"demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1),
         "demVotes": v["dem"], "repVotes": v["rep"], "totalVotes": tot}
    if estimated:
        e["estimated"] = True
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("abbr")
    ap.add_argument("--from", dest="src_ch", default="house", choices=["house", "senate"])
    ap.add_argument("--to", dest="dst_ch", default="senate", choices=["house", "senate"])
    ap.add_argument("--only", help="comma-separated target districts to (re)estimate, e.g. Maine's "
                                   "8 Portland House seats, whose source reports them as one city-wide "
                                   "block; with --conserve their combined total is preserved exactly")
    ap.add_argument("--conserve", action="store_true",
                    help="scale the estimated districts so the chamber's total matches the source chamber's")
    ap.add_argument("--replace-chamber", action="store_true",
                    help="write the estimate for EVERY district (conserves votes) instead of only the missing ones")
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    abbr = args.abbr.upper()
    stfp = fg.ABBR_TO_FIPS[abbr]

    path = os.path.join(OUT_DIR, f"{abbr}.json")
    data = json.load(open(path))
    src_data = data.get(args.src_ch) or {}
    if not src_data:
        sys.exit(f"{abbr}: no {args.src_ch} data to estimate from")
    existing = data.get(args.dst_ch) or {}

    vtds = load_weight_vtds(dra_geojson(abbr, args.cache_dir))
    src_gdf = load_districts(abbr, args.src_ch, stfp)
    dst_gdf = load_districts(abbr, args.dst_ch, stfp)
    print(f"{abbr}: {len(vtds)} weight VTDs, {len(src_gdf)} {args.src_ch}, {len(dst_gdf)} {args.dst_ch} districts")

    weight = build_cell_weights(vtds, src_gdf, dst_gdf)
    acc = apportion(src_data, weight)

    # Holdout: how well does the estimate reproduce districts that already have real data?
    exact = {k: v for k, v in existing.items() if not v.get("estimated") and v.get("totalVotes")}
    if exact:
        errs = []
        for k, v in exact.items():
            if k not in acc:
                continue
            a = acc[k]
            t = a["dem"] + a["rep"] + a["oth"]
            est_margin = (a["rep"] - a["dem"]) / t * 100
            errs.append((abs(est_margin - v["margin"]), k, v["margin"], est_margin))
        if errs:
            errs.sort(reverse=True)
            mean = sum(e[0] for e in errs) / len(errs)
            print(f"{abbr} holdout vs {len(errs)} precinct-exact {args.dst_ch} districts: "
                  f"mean |margin error| {mean:.2f} pts, max {errs[0][0]:.2f} "
                  f"(district {errs[0][1]}: real {errs[0][2]:+.1f} vs est {errs[0][3]:+.1f})")

    src_tot = sum((v.get("totalVotes") or 0) for v in src_data.values())
    est_tot = sum(a["dem"] + a["rep"] + a["oth"] for a in acc.values())
    print(f"{abbr}: {args.src_ch} total {src_tot:,} -> estimated {args.dst_ch} total {est_tot:,.0f}")

    if args.only:
        targets = {k.strip() for k in args.only.split(",") if k.strip()}
        unknown = targets - set(acc)
        if unknown:
            sys.exit(f"{abbr}: --only names district(s) not produced by the estimate: {sorted(unknown)}")
    elif args.replace_chamber:
        targets = set(acc)
    else:
        targets = {k for k in dst_gdf["CODE"] if k not in existing}
    raw = {b: {k: acc[k][b] for k in targets if k in acc} for b in ("dem", "rep", "oth")}

    # Conserve the chamber total without discarding the precinct-exact half: the districts being
    # estimated must jointly hold whatever the source chamber's total leaves over after the
    # already-exact districts, so scale them to exactly that residual. (Replacing the whole chamber
    # conserves trivially; this keeps the real data AND conserves.) A scale factor far from 1.0
    # means the two chambers' crosswalks captured different amounts of the statewide vote - printed
    # so it can't pass silently.
    if args.conserve and not args.replace_chamber and targets:
        kept = {k: v for k, v in existing.items() if k not in targets}
        for b, field in (("dem", "demVotes"), ("rep", "repVotes"), ("oth", None)):
            src_total = sum((v.get(field) if field else
                             max((v.get("totalVotes") or 0) - (v.get("demVotes") or 0) - (v.get("repVotes") or 0), 0)) or 0
                            for v in src_data.values())
            kept_total = sum((v.get(field) if field else
                              max((v.get("totalVotes") or 0) - (v.get("demVotes") or 0) - (v.get("repVotes") or 0), 0)) or 0
                             for v in kept.values())
            residual = src_total - kept_total
            cur = sum(raw[b].values())
            if cur > 0 and residual > 0:
                factor = residual / cur
                print(f"  conserve {b}: estimated half scaled by {factor:.4f} "
                      f"({cur:,.0f} -> {residual:,})")
                raw[b] = {k: v * factor for k, v in raw[b].items()}
            else:
                print(f"  conserve {b}: skipped (residual {residual:,}, estimate {cur:,.0f})")

    dem = largest_remainder(raw["dem"])
    rep = largest_remainder(raw["rep"])
    oth = largest_remainder(raw["oth"])
    out = dict(existing) if not args.replace_chamber else {}
    for k in dem:
        out[k] = entry({"dem": dem[k], "rep": rep[k], "oth": oth[k]}, estimated=True)
    print(f"{abbr} {args.dst_ch}: wrote {len(dem)} estimated district(s), {len(out)} total")

    if args.dry_run:
        return
    data[args.dst_ch] = out
    with open(path, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
