#!/usr/bin/env python3
"""
Presidential results (2016, 2020, 2024) for every state legislative district on EVERY map era's
lines - the current map and each superseded era in public/state-leg-districts-historical/.

Why: the Legislative District Atlas shows each seat's presidential vote on the lines it was run
on; the corrected chamber margin imputes unopposed seats from the presidential lean of the
district AS DRAWN THAT YEAR; and the 2026 projection crosswalks old-era results onto today's
lines by the presidential delta between the two polygons. All three need the same table:
chamber -> era -> district -> {2016, 2020, 2024}. The 2024-on-current-lines cell already exists
precinct-exact in data-entry/state-leg-pres2024/ and is NOT replaced here; it is used as the
holdout that measures this overlay's error per state.

Method: Dave's Redistricting App's 2020-VTD GeoJSON (github.com/dra2020/vtd_data), the same file
dra-overlay-state-leg-pres2024.py uses, carries E_16_PRES, E_20_PRES and (for 38 states)
E_24_PRES, plus T_20_CENS population, every election already disaggregated to blocks and
re-aggregated to 2020 VTDs. Each VTD is area-apportioned onto the district polygons of one era in
EPSG:5070; sliver fractions under 0.2% are dropped and the rest renormalised so every VTD is
allocated in full; per-district rounding is largest-remainder per party so a chamber's sum
reproduces DRA's statewide total exactly. 2020 VTDs are used for the 2011-cycle maps too (DRA
publishes no 2010-VTD geometry), so a district line that split a 2020 VTD costs a little
precision there; `splitPct` records how much of each district's vote came through split VTDs.

Validation printed per run: every chamber-era-election sum against the certified state total
(data-entry/president_past_results.csv), and the overlay's 2024-on-current-lines margins against
the precinct-exact file (mean and max absolute error, estimated entries excluded).

Usage:
  python3 scripts/build-state-leg-pres-by-era.py OH                      # both chambers, all eras
  python3 scripts/build-state-leg-pres-by-era.py OH --chambers house --eras 2020,current
  python3 scripts/build-state-leg-pres-by-era.py OH --dry-run

Writes data-entry/state-leg-pres-by-era/{ST}.json, merging per (chamber, era). The TS module is
built from those files by scripts/build-state-leg-pres-by-era.mjs.
"""

import argparse
import csv
import datetime as dt
import glob
import importlib.util
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres-by-era")
HIST_DIR = os.path.join(ROOT, "public", "state-leg-districts-historical")
HIST_INDEX_TS = os.path.join(ROOT, "data", "stateLegHistoricalMaps.ts")
PRES2024_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")
CERTIFIED = os.path.join(ROOT, "data-entry", "president_past_results.csv")
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/dra-cache"
ELECTIONS = {"2016": "E_16_PRES", "2020": "E_20_PRES", "2024": "E_24_PRES"}

_here = os.path.dirname(os.path.abspath(__file__))
_fg_spec = importlib.util.spec_from_file_location("fg", os.path.join(_here, "fill-state-leg-pres2024-gaps.py"))
fg = importlib.util.module_from_spec(_fg_spec)
_fg_spec.loader.exec_module(fg)
_dra_spec = importlib.util.spec_from_file_location("dra", os.path.join(_here, "dra-overlay-state-leg-pres2024.py"))
dra = importlib.util.module_from_spec(_dra_spec)
_dra_spec.loader.exec_module(dra)

# New Hampshire's TIGER House names ("State House District Belknap County No. 6") are rewritten
# to the state's own code ("BE6"), mirroring BOUNDARY_CODE_OVERRIDES.NH_house in
# scripts/build-state-leg-districts-historical.mjs / verify-state-leg-historical-maps.mjs.
NH_COUNTY_CODES = {
    "Belknap": "BE", "Carroll": "CA", "Cheshire": "CH", "Coos": "CO", "Grafton": "GR",
    "Hillsborough": "HI", "Merrimack": "ME", "Rockingham": "RO", "Strafford": "ST", "Sullivan": "SU",
}


def district_code(abbr, chamber, props):
    if abbr == "NH" and chamber == "house":
        m = re.match(r"^State House District (\w+) County No\. (\d+)$", props.get("NAMELSAD") or "")
        if m and m.group(1) in NH_COUNTY_CODES:
            return f"{NH_COUNTY_CODES[m.group(1)]}{int(m.group(2))}"
    return fg.extract_district_code(abbr, chamber, props)


def load_hist_index():
    text = open(HIST_INDEX_TS).read()
    body = text[text.index("{", text.index("export const")):]
    body = body[: body.rindex("}") + 1]
    return json.loads(body)


def eras_for(abbr, chamber, index):
    """Era keys for a chamber: each superseded vintage (as a string) plus 'current', with the
    election years each era served (the current era's years are those absent from the index)."""
    by_year = (index.get(abbr) or {}).get(chamber) or {}
    eras = defaultdict(list)
    for year, vintage in by_year.items():
        eras[str(vintage)].append(int(year))
    return {k: sorted(v) for k, v in eras.items()}


def topo_to_geo(path, cache_dir):
    """mapshaper converts the TopoJSON era file to GeoJSON; cached by file name + mtime."""
    stamp = int(os.path.getmtime(path))
    out = os.path.join(cache_dir, "_geo", f"{os.path.basename(path)}.{stamp}.geojson")
    if not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(["mapshaper", path, "-o", out, "format=geojson"], check=True, capture_output=True)
    return out


def load_era_districts(abbr, chamber, era, stfp, cache_dir):
    if era == "current":
        src = fg.HOUSE_SRC if chamber == "house" else fg.SENATE_SRC
        fc = json.load(open(src))
        feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    else:
        path = os.path.join(HIST_DIR, chamber, f"{abbr}-{era}.json")
        if not os.path.exists(path):
            return None
        fc = json.load(open(topo_to_geo(path, cache_dir)))
        feats = [f for f in fc["features"] if f.get("geometry")]
    props = [f["properties"] for f in feats]
    gdf = gpd.GeoDataFrame(props, geometry=[shape(f["geometry"]).buffer(0) for f in feats], crs="EPSG:4326")
    gdf["CODE"] = [district_code(abbr, chamber, p) for p in props]
    gdf = gdf.dropna(subset=["CODE"])
    # A district split into several features (multi-part eras) is dissolved to one row.
    gdf = gdf[["CODE", "geometry"]].dissolve(by="CODE", as_index=False)
    return gdf


def load_dra(path, elections):
    fc = json.load(open(path))
    rows, geoms = [], []
    present = set()
    for f in fc["features"]:
        if not f.get("geometry"):
            continue
        p = f["properties"]
        ds = p.get("datasets") or {}
        row = {"vtd": p["id"], "pop": float((ds.get("T_20_CENS") or {}).get("Total", 0) or 0)}
        for year, key in elections.items():
            e = ds.get(key)
            if e is None:
                continue
            present.add(year)
            dem, rep, tot = float(e.get("Dem", 0) or 0), float(e.get("Rep", 0) or 0), float(e.get("Total", 0) or 0)
            row[f"dem{year}"], row[f"rep{year}"], row[f"oth{year}"] = dem, rep, max(tot - dem - rep, 0.0)
        rows.append(row)
        geoms.append(shape(f["geometry"]).buffer(0))
    gdf = gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326")
    years = sorted(present)
    for y in years:
        for b in ("dem", "rep", "oth"):
            gdf[f"{b}{y}"] = gdf[f"{b}{y}"].fillna(0.0)
    return gdf, years


def overlay(abbr, chamber, era, vtds, districts, years):
    v = vtds.to_crs(epsg=5070)
    d = districts.to_crs(epsg=5070)
    v["p_area"] = v.geometry.area
    ov = gpd.overlay(v, d, how="intersection", keep_geom_type=False)
    ov["frac"] = ov.geometry.area / ov["p_area"]
    ov = ov[ov["frac"] > 0.002].copy()
    ov["frac"] = ov["frac"] / ov.groupby("vtd")["frac"].transform("sum")
    lost = v[~v["vtd"].isin(set(ov["vtd"]))]
    if len(lost):
        lost_votes = sum(lost[f"dem{y}"].sum() + lost[f"rep{y}"].sum() + lost[f"oth{y}"].sum() for y in years)
        if lost_votes > 0:
            near = gpd.sjoin_nearest(lost.drop(columns=["p_area"]), d[["CODE", "geometry"]], how="left").drop_duplicates("vtd")
            near["frac"] = 1.0
            ov = pd.concat([ov, near[list(lost.columns.drop(["geometry", "p_area"])) + ["CODE", "frac"]]], ignore_index=True)
            print(f"  {abbr} {chamber} {era}: {len(lost)} VTD(s) with {lost_votes:,.0f} votes outside every district -> nearest")
    ov["split"] = ov["frac"] < 0.999
    cols = ["pop"] + [f"{b}{y}" for y in years for b in ("dem", "rep", "oth")]
    for c in cols:
        ov[c] = ov[c] * ov["frac"]
    ov["splitvotes"] = sum(ov[f"dem{y}"] + ov[f"rep{y}"] + ov[f"oth{y}"] for y in years) * ov["split"]
    ov["allvotes"] = sum(ov[f"dem{y}"] + ov[f"rep{y}"] + ov[f"oth{y}"] for y in years)
    agg = ov.groupby("CODE")[cols + ["splitvotes", "allvotes"]].sum()

    out = {}
    rounded = {c: dra.largest_remainder(agg[c].to_dict()) for c in cols}
    for code in agg.index:
        entry = {"pop2020": rounded["pop"][code],
                 "splitPct": round(100 * agg.loc[code, "splitvotes"] / agg.loc[code, "allvotes"], 1) if agg.loc[code, "allvotes"] else 0.0}
        for y in years:
            dem, rep, oth = rounded[f"dem{y}"][code], rounded[f"rep{y}"][code], rounded[f"oth{y}"][code]
            tot = dem + rep + oth
            if tot <= 0:
                continue
            dem_pct, rep_pct = round(dem / tot * 100, 1), round(rep / tot * 100, 1)
            entry[y] = {"demVotes": dem, "repVotes": rep, "othVotes": oth, "totalVotes": tot,
                        "demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1)}
        out[code] = entry
    return out


def certified(abbr):
    out = {}
    for r in csv.DictReader(open(CERTIFIED)):
        if r["state_abbr"] == abbr and r["year"] in ELECTIONS:
            out[r["year"]] = (int(r["dem_votes"]), int(r["rep_votes"]), int(r["total_votes"]))
    return out


def holdout_2024(abbr, chamber, out):
    """Overlay vs the precinct-exact 2024-on-current-lines file."""
    path = os.path.join(PRES2024_DIR, f"{abbr}.json")
    if not os.path.exists(path):
        return None
    exact = (json.load(open(path)).get(chamber) or {})
    diffs = []
    for code, e in exact.items():
        if e.get("estimated") or code not in out or "2024" not in out[code]:
            continue
        diffs.append(abs(out[code]["2024"]["margin"] - e["margin"]))
    if not diffs:
        return None
    return len(diffs), sum(diffs) / len(diffs), max(diffs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("abbr")
    ap.add_argument("--chambers", default="house,senate")
    ap.add_argument("--eras", default="all", help="'all', or comma list of vintages and/or 'current'")
    ap.add_argument("--geojson")
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    abbr = args.abbr.upper()
    stfp = fg.ABBR_TO_FIPS[abbr]
    chambers = ["senate"] if abbr == "NE" else [c.strip() for c in args.chambers.split(",") if c.strip()]

    path = args.geojson or dra.download_geojson(abbr, args.cache_dir)
    vtds, years = load_dra(path, ELECTIONS)
    cert = certified(abbr)
    print(f"{abbr}: {len(vtds)} VTDs, elections {years}, pop {vtds['pop'].sum():,.0f}")
    for y in years:
        dem, rep, tot = vtds[f"dem{y}"].sum(), vtds[f"rep{y}"].sum(), (vtds[f"dem{y}"] + vtds[f"rep{y}"] + vtds[f"oth{y}"]).sum()
        line = f"  DRA {y}: dem={dem:,.0f} rep={rep:,.0f} total={tot:,.0f}"
        if y in cert:
            c = cert[y]
            line += f" | certified dem={c[0]:,} rep={c[1]:,} total={c[2]:,} | diff dem={dem-c[0]:+,.0f} rep={rep-c[1]:+,.0f} total={tot-c[2]:+,.0f}"
        print(line)

    index = load_hist_index()
    out_path = os.path.join(OUT_DIR, f"{abbr}.json")
    result = json.load(open(out_path)) if os.path.exists(out_path) else {}
    meta = result.setdefault("meta", {})
    meta.update({"dra": os.path.basename(path), "built": dt.date.today().isoformat(), "elections": years})
    meta.setdefault("eras", {})

    for chamber in chambers:
        era_years = eras_for(abbr, chamber, index)
        all_eras = sorted(era_years) + ["current"]
        wanted = all_eras if args.eras == "all" else [e.strip() for e in args.eras.split(",")]
        meta["eras"][chamber] = {**{k: v for k, v in era_years.items()}, "current": None}
        chamber_out = result.setdefault(chamber, {})
        for era in wanted:
            districts = load_era_districts(abbr, chamber, era, stfp, args.cache_dir)
            if districts is None or districts.empty:
                print(f"  {abbr} {chamber} {era}: no boundary file")
                continue
            out = overlay(abbr, chamber, era, vtds, districts, years)
            served = era_years.get(era, "current map")
            print(f"  {abbr} {chamber} era {era} ({served}): {len(out)}/{len(districts)} districts")
            for y in years:
                s_dem = sum(v[y]["demVotes"] for v in out.values() if y in v)
                s_rep = sum(v[y]["repVotes"] for v in out.values() if y in v)
                s_tot = sum(v[y]["totalVotes"] for v in out.values() if y in v)
                line = f"    {y}: dem={s_dem:,} rep={s_rep:,} total={s_tot:,}"
                if y in cert:
                    c = cert[y]
                    line += f"  vs certified diff dem={s_dem-c[0]:+,} rep={s_rep-c[1]:+,} total={s_tot-c[2]:+,}"
                print(line)
            if era == "current" and "2024" in years:
                h = holdout_2024(abbr, chamber, out)
                if h:
                    print(f"    holdout vs precinct-exact 2024: n={h[0]} MAE={h[1]:.2f} max={h[2]:.2f} pts of margin")
            split = sorted(out.values(), key=lambda e: -e["splitPct"])[:1]
            if split:
                print(f"    split-VTD share: median {sorted(e['splitPct'] for e in out.values())[len(out)//2]:.1f}% max {split[0]['splitPct']:.1f}%")
            if not args.dry_run:
                chamber_out[era] = out

    if args.dry_run:
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, indent=1, sort_keys=True)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
