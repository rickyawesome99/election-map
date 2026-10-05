#!/usr/bin/env python3
"""
Presidential results (2016, 2020, 2024) on a state's 119th-Congress district lines, from Dave's
Redistricting App's 2020-VTD election data (github.com/dra2020/vtd_data) laid over the Census
TIGER district polygons.

WHY. house_pres_2026_dist.csv must carry all three presidential elections on the lines each
state votes on in 2026. Published cuts cover 2020 (Downballot 2022-lines sheet) and 2024
(house_statewide_results.csv) for the 2022/2024 maps, but no source publishes 2016 on them.
Built 2026-10-04 for MISSOURI, whose 2025 mid-decade map was struck down (Missouri Supreme
Court, 2026-09-03), so it votes on its 2022 lines - the 119th-Congress map - in November 2026.

METHOD. Each VTD polygon's E_16/20/24_PRES votes are split across the districts it overlaps by
area (EPSG:5070), with the fractions renormalised per VTD so every vote is allocated. TIGER's
full-resolution lines are used, not the site's simplified drawing files.

VALIDATION (printed): the same overlay's 2020 and 2024 results against the published figures in
pres_by_boundary_vintage.csv (2022 vintage). Missouri on 2026-10-04: 2020 mean |margin diff|
0.07 pts (max 0.21), 2024 mean 0.04 (max 0.07); DRA's 2016 statewide Clinton/Trump votes equal
the certified count exactly. Write the 2016 columns from this output and keep the published
2020/2024 counts.

Usage:
  python3 scripts/dra-overlay-cd-pres.py MO [--out path.csv]
Downloads (cached under the OS temp dir): Geojson_{ST}.vNN.zip from dra2020/vtd_data and
tl_2024_{FIPS}_cd119.zip from the Census.
"""
import argparse, csv, glob, io, json, os, tempfile, urllib.error, urllib.request, zipfile

import geopandas as gpd
from shapely.geometry import shape

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(tempfile.gettempdir(), "dra-overlay-cd-pres")
VINTAGE_CSV = os.path.join(ROOT, "data-entry/pres_by_boundary_vintage.csv")
DRA_RAW = "https://raw.githubusercontent.com/dra2020/vtd_data/master/2020_VTD/{st}/Geojson_{st}.v{n:02d}.zip"
TIGER = "https://www2.census.gov/geo/tiger/TIGER2024/CD/tl_2024_{fips}_cd119.zip"
FIPS = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10",
        "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20",
        "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28",
        "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36",
        "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45",
        "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54",
        "WI": "55", "WY": "56"}
YEARS = ("16", "20", "24")


def fetch_zip(url, dest):
    if not glob.glob(os.path.join(dest, "*")):
        os.makedirs(dest, exist_ok=True)
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read())).extractall(dest)
    return dest


def dra_geojson(st):
    dest = os.path.join(CACHE, f"dra_{st}")
    if not glob.glob(os.path.join(dest, "*.geojson")):
        for n in range(12, 3, -1):  # newest package first
            try:
                fetch_zip(DRA_RAW.format(st=st, n=n), dest)
                break
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
    found = glob.glob(os.path.join(dest, "*.geojson"))
    if not found:
        raise SystemExit(f"{st}: no Geojson package in dra2020/vtd_data")
    return found[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state")
    ap.add_argument("--out")
    a = ap.parse_args()
    st, fips = a.state.upper(), FIPS[a.state.upper()]

    rows, geoms = [], []
    for f in json.load(open(dra_geojson(st)))["features"]:
        if not f.get("geometry"):
            continue
        ds, r = f["properties"]["datasets"], {"vtd": f["properties"]["id"]}
        for y in YEARS:
            d = ds.get(f"E_{y}_PRES") or {}
            r[f"d{y}"], r[f"r{y}"], r[f"t{y}"] = (float(d.get(k, 0) or 0) for k in ("Dem", "Rep", "Total"))
        rows.append(r)
        geoms.append(shape(f["geometry"]).buffer(0))
    vtds = gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326").to_crs(5070)
    vtds["varea"] = vtds.area

    tiger = fetch_zip(TIGER.format(fips=fips), os.path.join(CACHE, f"tl_cd119_{fips}"))
    cds = gpd.read_file(glob.glob(os.path.join(tiger, "*.shp"))[0]).to_crs(5070)[["GEOID", "geometry"]]
    x = gpd.overlay(vtds, cds, how="intersection", keep_geom_type=True)
    x["w"] = x.area / x["varea"]
    x["w"] = x["w"] / x.groupby("vtd")["w"].transform("sum")
    cols = [f"{p}{y}" for y in YEARS for p in "drt"]
    for c in cols:
        x[c] = x[c] * x["w"]
    agg = x.groupby("GEOID")[cols].sum().round().astype(int)
    print(f"{st}: {len(vtds)} VTDs, {(x.groupby('vtd')['w'].max() < 0.98).sum()} split between districts")
    print("DRA statewide:", {c: int(vtds[c].sum()) for c in cols})

    known = {}
    for r in csv.DictReader(open(VINTAGE_CSV)):
        if r["boundary_year"] == "2022" and r["district_id"].zfill(4).startswith(fips) and r["dem_votes"]:
            known[(r["district_id"].zfill(4), r["pres_year"][2:])] = tuple(int(r[k]) for k in ("dem_votes", "rep_votes", "total_votes"))
    margin = lambda d, r, t: (r - d) / t * 100
    for y in ("20", "24"):
        errs = [abs(margin(a[f"d{y}"], a[f"r{y}"], a[f"t{y}"]) - margin(*known[(g, y)]))
                for g, a in agg.iterrows() if (g, y) in known]
        if errs:
            print(f"check 20{y} vs published: mean |margin diff| {sum(errs) / len(errs):.2f}  max {max(errs):.2f}  ({len(errs)} districts)")
    print(agg.to_string())
    if a.out:
        agg.to_csv(a.out)


if __name__ == "__main__":
    main()
