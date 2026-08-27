#!/usr/bin/env python3
"""
Fill / replace a state's per-district 2024 presidential results using Dave's Redistricting App's
published 2020-VTD-level election data (github.com/dra2020/vtd_data, `2020_VTD/{ST}/Geojson_{ST}.vNN.zip`).

Why a third pipeline: the MEDSL direct crosswalk (crosswalk-state-leg-pres2024.py) can only
place a precinct in a district when that precinct ALSO reported a state-leg race in Nov 2024 -
which fails for the off-cycle half of staggered Senates (previously back-filled by a coarse
House-district area overlay marked `estimated`), for states whose MEDSL file only tags a subset of
precincts with a district (NM/OK/ND/HI/FL/VT/NE), and for dense-urban blank-district rows
(NYC, Maricopa). DRA's file is VEST-quality precinct results already disaggregated to census
blocks and re-aggregated to 2020 VTDs (block groups for CA/HI/OR/WV), with geometry and the
`E_24_PRES` totals in one GeoJSON - so every district can be computed the same way regardless
of what was on the ballot: area-weighted overlay of VTD polygons onto the CURRENT district
boundaries (same method as spatial-join-state-leg-pres2024.py, minus the name-matching step).

Guarantees: each VTD's votes are allocated in full (sliver fractions are renormalised per VTD),
and per-district rounding uses largest-remainder per party, so a chamber's sum reproduces DRA's
statewide totals exactly. DRA's statewide totals are printed against the certified numbers in
data-entry/president_past_results.csv - check that line before trusting a state.

Not available (no `E_24_PRES` in DRA as of 2026-08): AK AR CT ID ME MI ND NJ OK OR PA SD.

Usage:
  python3 scripts/dra-overlay-state-leg-pres2024.py NM                 # both chambers
  python3 scripts/dra-overlay-state-leg-pres2024.py CA --chambers senate
  python3 scripts/dra-overlay-state-leg-pres2024.py NM --geojson path/to/NM_2020_VD_tabblock.vtd.datasets.geojson

Downloads the latest Geojson_{ST}.vNN.zip into --cache-dir (default: scratch dir under /private/tmp)
when --geojson isn't given. Merges into data-entry/state-leg-pres2024/{ST}.json, replacing only
the chambers run (an `estimated` flag from the old House-overlay fill is dropped for those chambers).
Rerun scripts/build-state-leg-pres2024.mjs afterwards.
"""

import argparse
import csv
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
HOUSE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-house-districts-2026.json"
SENATE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json"
CERTIFIED = f"{ROOT}/data-entry/president_past_results.csv"
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/dra-cache"
GITHUB_API = "https://api.github.com/repos/dra2020/vtd_data/contents/2020_VTD/{st}"
GITHUB_RAW = "https://raw.githubusercontent.com/dra2020/vtd_data/master/2020_VTD/{st}/{name}"

sys.path.insert(0, os.path.dirname(__file__))
_fg_spec = importlib.util.spec_from_file_location("fg", os.path.join(os.path.dirname(__file__), "fill-state-leg-pres2024-gaps.py"))
fg = importlib.util.module_from_spec(_fg_spec)
_fg_spec.loader.exec_module(fg)


def download_geojson(abbr, cache_dir):
    os.makedirs(cache_dir, exist_ok=True)
    existing = glob.glob(os.path.join(cache_dir, abbr, "*.geojson"))
    if existing:
        return existing[0]
    # The GitHub contents API is rate-limited to 60 unauthenticated calls/hour, which a 38-state
    # batch blows through; raw.githubusercontent.com is not, so fall back to probing versions.
    names = []
    try:
        listing = json.load(urllib.request.urlopen(GITHUB_API.format(st=abbr)))
        names = sorted(x["name"] for x in listing if x["name"].startswith("Geojson_"))
    except Exception as e:  # noqa: BLE001
        print(f"{abbr}: GitHub API unavailable ({e}); probing raw URLs")
        names = [f"Geojson_{abbr}.v{n:02d}.zip" for n in range(4, 12)]
    data = None
    for name in reversed(names):
        try:
            data = urllib.request.urlopen(GITHUB_RAW.format(st=abbr, name=name)).read()
            print(f"{abbr}: downloaded {name}")
            break
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    if data is None:
        sys.exit(f"{abbr}: no Geojson_* package in dra2020/vtd_data")
    zipfile.ZipFile(io.BytesIO(data)).extractall(os.path.join(cache_dir, abbr))
    return glob.glob(os.path.join(cache_dir, abbr, "*.geojson"))[0]


def load_dra(path):
    fc = json.load(open(path))
    rows, geoms = [], []
    missing = 0
    for f in fc["features"]:
        p = f["properties"]
        ds = (p.get("datasets") or {}).get("E_24_PRES")
        if ds is None:
            missing += 1
            continue
        if not f.get("geometry"):
            continue
        dem, rep, tot = ds.get("Dem", 0) or 0, ds.get("Rep", 0) or 0, ds.get("Total", 0) or 0
        rows.append({"vtd": p["id"], "county": str(p["id"])[:5],
                     "dem": float(dem), "rep": float(rep), "oth": float(max(tot - dem - rep, 0))})
        geoms.append(shape(f["geometry"]).buffer(0))
    if not rows:
        sys.exit(f"{path}: no E_24_PRES dataset in any feature - DRA has no 2024 data for this state")
    if missing:
        print(f"note: {missing} VTD(s) without an E_24_PRES entry (skipped)")
    return gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326")


COUNTY_CERTIFIED = f"{ROOT}/data/county_presidential_results_2008_2024.csv"


def scale_to_county_totals(abbr, vtds):
    """Scale each county's VTDs so they sum to that county's certified 2024 presidential total, per
    party. DRA's statewide totals land within ~0.1% of certified for most states but not all (CA is
    3,137 Dem short, NC 1,766, VA 1,617) - a handful of precincts they could not place. Distributing
    that residue across the county it belongs to is closer to the truth than leaving it out, and it
    makes each chamber's aggregate reproduce the certified state total. The VTD/block-group id's
    first five characters are the state+county FIPS."""
    cert = {}
    with open(COUNTY_CERTIFIED) as f:
        for r in csv.DictReader(f):
            if r["county_id"].startswith(fg.ABBR_TO_FIPS[abbr]) and r["dem_2024"]:
                cert[r["county_id"]] = {"dem": int(r["dem_2024"]), "rep": int(r["gop_2024"]),
                                        "oth": int(r["oth_2024"])}
    if not cert:
        print(f"{abbr}: no certified county totals available - not scaled")
        return vtds
    sums = vtds.groupby("county")[["dem", "rep", "oth"]].sum()
    factors, missing = {}, []
    for county, row in sums.iterrows():
        if county not in cert:
            missing.append(county)
            continue
        factors[county] = {b: (cert[county][b] / row[b] if row[b] else 1.0) for b in ("dem", "rep")}
    if missing:
        print(f"{abbr}: {len(missing)} county(ies) with no certified row, left unscaled: {missing[:5]}")
    for b in ("dem", "rep"):
        vtds[b] = [v * factors.get(c, {}).get(b, 1.0) for v, c in zip(vtds[b], vtds["county"])]
    lo = min(f["dem"] for f in factors.values()); hi = max(f["dem"] for f in factors.values())
    print(f"{abbr}: scaled {len(factors)} counties to certified totals (dem factor {lo:.4f}-{hi:.4f})")
    # Third-party/write-in votes are scaled to the STATEWIDE target instead of per county. The
    # county file's `oth_2024` is a narrower quantity than the state file's (total - dem - rep) -
    # it is 0 for all 62 New York counties, and 20-35% low in IL/VA/NC/PA - so scaling `oth` per
    # county would zero out New York's 64,401 third-party votes and shrink several other states'.
    # Dem and Rep agree between the two reference files, so only those are safe to scale locally.
    cert_state = state_certified(abbr)
    if cert_state:
        target = cert_state[2] - cert_state[0] - cert_state[1]
        cur = vtds["oth"].sum()
        if cur > 0 and target > 0:
            print(f"{abbr}: scaled third-party votes statewide by {target / cur:.4f} "
                  f"({cur:,.0f} -> {target:,})")
            vtds["oth"] = vtds["oth"] * (target / cur)
    return vtds


def load_districts(abbr, chamber, src, stfp):
    fc = json.load(open(src))
    feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    props = [f["properties"] for f in feats]
    gdf = gpd.GeoDataFrame(props, geometry=[shape(f["geometry"]).buffer(0) for f in feats], crs="EPSG:4326")
    gdf["CODE"] = [fg.extract_district_code(abbr, chamber, p) for p in props]
    gdf = gdf.dropna(subset=["CODE"])
    return gdf[["CODE", "geometry"]]


def largest_remainder(values):
    """Round a dict of floats to ints so the rounded sum equals round(sum of floats)."""
    keys = list(values)
    floors = {k: int(values[k]) for k in keys}
    target = int(round(sum(values.values())))
    short = target - sum(floors.values())
    order = sorted(keys, key=lambda k: values[k] - floors[k], reverse=True)
    for k in order[:max(short, 0)]:
        floors[k] += 1
    return floors


def overlay(abbr, chamber, vtds, districts):
    v = vtds.to_crs(epsg=5070)
    d = districts.to_crs(epsg=5070)
    v["p_area"] = v.geometry.area
    ov = gpd.overlay(v.reset_index(), d, how="intersection", keep_geom_type=False)
    ov["frac"] = ov.geometry.area / ov["p_area"]
    ov = ov[ov["frac"] > 0.002]
    # Allocate each VTD in full: renormalise the surviving fractions so they sum to 1 per VTD.
    ov["frac"] = ov["frac"] / ov.groupby("vtd")["frac"].transform("sum")
    covered = set(ov["vtd"])
    lost = v[~v["vtd"].isin(covered)]
    lost_votes = lost[["dem", "rep", "oth"]].sum().sum()
    if lost_votes > 0:
        # A VTD that intersects no district polygon (boundary-file slivers along coasts/lakes, or a
        # VTD entirely inside a hole the district file failed to cover) is assigned whole to the
        # nearest district rather than dropped - the votes are real.
        near = gpd.sjoin_nearest(lost[["vtd", "dem", "rep", "oth", "geometry"]], d[["CODE", "geometry"]], how="left")
        near = near.drop_duplicates("vtd")
        near["frac"] = 1.0
        ov = pd.concat([ov, near[["vtd", "dem", "rep", "oth", "CODE", "frac"]]], ignore_index=True)
        print(f"{abbr} {chamber}: {len(lost)} VTD(s) with {lost_votes:,.0f} votes fell outside every district -> nearest district")

    acc = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "oth": 0.0})
    for _, r in ov.iterrows():
        a = acc[r["CODE"]]
        a["dem"] += r["dem"] * r["frac"]
        a["rep"] += r["rep"] * r["frac"]
        a["oth"] += r["oth"] * r["frac"]

    dem = largest_remainder({k: a["dem"] for k, a in acc.items()})
    rep = largest_remainder({k: a["rep"] for k, a in acc.items()})
    oth = largest_remainder({k: a["oth"] for k, a in acc.items()})
    out = {}
    for k in acc:
        tot = dem[k] + rep[k] + oth[k]
        if tot <= 0:
            continue
        dem_pct = round(dem[k] / tot * 100, 1)
        rep_pct = round(rep[k] / tot * 100, 1)
        out[k] = {
            "demPct": dem_pct, "repPct": rep_pct, "margin": round(rep_pct - dem_pct, 1),
            "demVotes": dem[k], "repVotes": rep[k], "totalVotes": tot,
        }
    return out


def state_certified(abbr):
    """(dem, rep, total) from the certified statewide 2024 file."""
    for r in csv.DictReader(open(CERTIFIED)):
        if r["state_abbr"] == abbr and r["year"] == "2024":
            return int(r["dem_votes"]), int(r["rep_votes"]), int(r["total_votes"])
    return None


def certified(abbr):
    for r in csv.DictReader(open(CERTIFIED)):
        if r["state_abbr"] == abbr and r["year"] == "2024":
            return int(r["dem_votes"]), int(r["rep_votes"]), int(r["total_votes"])
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("abbr")
    ap.add_argument("--chambers", default="house,senate")
    ap.add_argument("--geojson")
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE)
    ap.add_argument("--scale-counties", action="store_true",
                    help="scale each county's VTDs to its certified 2024 total before overlaying")
    ap.add_argument("--dry-run", action="store_true", help="print totals, don't write")
    args = ap.parse_args()
    abbr = args.abbr.upper()
    stfp = fg.ABBR_TO_FIPS[abbr]
    chambers = [c.strip() for c in args.chambers.split(",") if c.strip()]
    if abbr == "NE":
        chambers = ["senate"]

    path = args.geojson or download_geojson(abbr, args.cache_dir)
    vtds = load_dra(path)
    if args.scale_counties:
        vtds = scale_to_county_totals(abbr, vtds)
    tot = vtds[["dem", "rep", "oth"]].sum()
    cert = certified(abbr)
    line = f"{abbr} DRA statewide: dem={tot['dem']:,.0f} rep={tot['rep']:,.0f} total={tot.sum():,.0f} ({len(vtds)} VTDs)"
    if cert:
        line += f" | certified dem={cert[0]:,} rep={cert[1]:,} total={cert[2]:,} | diff dem={tot['dem']-cert[0]:+,.0f} rep={tot['rep']-cert[1]:+,.0f} total={tot.sum()-cert[2]:+,.0f}"
    print(line)

    out_path = os.path.join(OUT_DIR, f"{abbr}.json")
    result = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for chamber in chambers:
        src = HOUSE_SRC if chamber == "house" else SENATE_SRC
        districts = load_districts(abbr, chamber, src, stfp)
        out = overlay(abbr, chamber, vtds, districts)
        canon = set(districts["CODE"])
        missing = sorted(canon - set(out))
        s_dem = sum(v["demVotes"] for v in out.values())
        s_rep = sum(v["repVotes"] for v in out.values())
        s_tot = sum(v["totalVotes"] for v in out.values())
        print(f"{abbr} {chamber}: {len(out)}/{len(canon)} districts; sum dem={s_dem:,} rep={s_rep:,} total={s_tot:,}"
              + (f"; MISSING {missing}" if missing else ""))
        if not args.dry_run:
            # A district the overlay can't reach (its boundary feature has null geometry - IL HD 103,
            # VA HD 54) keeps whatever an earlier pipeline produced rather than vanishing.
            kept = {k: v for k, v in (result.get(chamber) or {}).items() if k in missing}
            if kept:
                print(f"{abbr} {chamber}: kept previous entries for {sorted(kept)} (no boundary geometry)")
            result[chamber] = {**out, **kept}

    if args.dry_run:
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, sort_keys=True)
    print(f"wrote {out_path} ({', '.join(chambers)})")


if __name__ == "__main__":
    main()
