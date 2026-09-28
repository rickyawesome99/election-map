#!/usr/bin/env python3
"""
Builds public/house-county-pieces/{year}/{ST}.json — for each House election year and state,
the county × congressional-district intersection pieces the /house/[id]/[year] map is drawn
from, so a county split between districts is visibly split at the district line instead of
being painted whole.

Sources (Census cartographic boundary files, 1:500k, downloaded to a temp cache on first run):
  counties   cb_2018_us_county_500k        one vintage for every year, so FIPS codes match the
                                           project's county data (Valdez-Cordova 02261 still
                                           whole, Connecticut's eight counties, not the 2022
                                           planning regions)
  districts  cb_2016_us_cd115_500k  (2016)   the same Congress per year as
             cb_2018_us_cd116_500k  (2018)   lib/congressionalDistricts.ts's national files
             cb_2020_us_cd116_500k  (2020)
             cb_2022_us_cd118_500k  (2022)
             cb_2024_us_cd119_500k  (2024)

Each output file is a TopoJSON with two objects:
  pieces     one MultiPolygon per (county, district): properties c (county FIPS), d (district
             number, at-large = 1), n (county name); id "{c}-{d}"
  districts  one geometry per district: properties d
Slivers from the two files' independent simplification are dropped (< 1 km² AND < 2 % of the
county). A county's pieces are whatever survives; the results table lists every district row
regardless, so a dropped sliver only loses map paint, never data.

Run from project root (needs geopandas + mapshaper; a few minutes):
  python3 scripts/build-house-county-pieces.py            # all years
  python3 scripts/build-house-county-pieces.py 2022 2024
"""
import json, os, subprocess, sys, tempfile, urllib.request, warnings
import geopandas as gpd
import pandas as pd

warnings.filterwarnings("ignore")

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_ROOT = os.path.join(ROOT, "public/house-county-pieces")
CACHE = os.path.join(tempfile.gettempdir(), "election-map-cb")
BASE = "https://www2.census.gov/geo/tiger/"
COUNTY_ZIP = "GENZ2018/shp/cb_2018_us_county_500k.zip"
CD_ZIP = {
    2016: ("GENZ2016/shp/cb_2016_us_cd115_500k.zip", "CD115FP"),
    2018: ("GENZ2018/shp/cb_2018_us_cd116_500k.zip", "CD116FP"),
    2020: ("GENZ2020/shp/cb_2020_us_cd116_500k.zip", "CD116FP"),
    2022: ("GENZ2022/shp/cb_2022_us_cd118_500k.zip", "CD118FP"),
    2024: ("GENZ2024/shp/cb_2024_us_cd119_500k.zip", "CD119FP"),
}
STATE_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "12": "FL",
    "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA",
    "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
    "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK",
    "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT",
    "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
}
EQUAL_AREA = "EPSG:6933"
SLIVER_KM2 = 1.0
SLIVER_SHARE = 0.02
SIMPLIFY = "3%"


def fetch(rel: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, os.path.basename(rel))
    if not os.path.exists(local) or os.path.getsize(local) == 0:
        print(f"downloading {rel}", flush=True)
        urllib.request.urlretrieve(BASE + rel, local)
    return local


def load_counties() -> gpd.GeoDataFrame:
    g = gpd.read_file("zip://" + fetch(COUNTY_ZIP))[["GEOID", "NAME", "geometry"]]
    g = g[g.GEOID.str[:2].isin(STATE_FIPS)].copy()
    g["geometry"] = g.geometry.buffer(0)
    return g


def load_districts(year: int) -> gpd.GeoDataFrame:
    rel, col = CD_ZIP[year]
    g = gpd.read_file("zip://" + fetch(rel))
    g = g[g.STATEFP.isin(STATE_FIPS) & ~g[col].isin(["98", "99", "ZZ"])].copy()
    g["d"] = g[col].apply(lambda s: 1 if s == "00" else int(s))
    g["geometry"] = g.geometry.buffer(0)
    return g[["STATEFP", "d", "geometry"]]


def build_state(year: int, abbr: str, counties: gpd.GeoDataFrame, districts: gpd.GeoDataFrame, tmpdir: str) -> dict:
    pieces = gpd.overlay(counties, districts[["d", "geometry"]], how="intersection", keep_geom_type=True)
    if pieces.empty:
        return {"pieces": 0, "dropped": 0}
    ea = pieces.to_crs(EQUAL_AREA)
    pieces["km2"] = ea.area / 1e6
    county_km2 = counties.to_crs(EQUAL_AREA).set_index("GEOID").area / 1e6
    pieces["share"] = pieces.apply(lambda r: r.km2 / county_km2[r.GEOID] if county_km2[r.GEOID] else 1, axis=1)
    keep = ~((pieces.km2 < SLIVER_KM2) & (pieces.share < SLIVER_SHARE))
    dropped = int((~keep).sum())
    pieces = pieces[keep]
    pieces = pieces.dissolve(by=["GEOID", "d"], as_index=False)[["GEOID", "NAME", "d", "geometry"]]
    pieces = pieces.rename(columns={"GEOID": "c", "NAME": "n"})
    pieces["id"] = pieces.c + "-" + pieces.d.astype(str)

    p_path = os.path.join(tmpdir, "pieces.json")
    d_path = os.path.join(tmpdir, "districts.json")
    pieces.to_file(p_path, driver="GeoJSON")
    districts[["d", "geometry"]].to_file(d_path, driver="GeoJSON")
    out_dir = os.path.join(OUT_ROOT, str(year))
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{abbr}.json")
    # One topology, two layers; simplifying them together keeps shared borders aligned.
    subprocess.run([
        "mapshaper", "-i", p_path, d_path, "combine-files",
        "-rename-layers", "pieces,districts",
        "-simplify", SIMPLIFY, "keep-shapes", "weighted",
        "-clean",
        "-o", out, "format=topojson", "id-field=id", "quantization=10000", "force",
    ], check=True, capture_output=True)
    return {"pieces": len(pieces), "dropped": dropped, "bytes": os.path.getsize(out)}


def main():
    years = [int(a) for a in sys.argv[1:]] or sorted(CD_ZIP)
    counties = load_counties()
    for year in years:
        districts = load_districts(year)
        total_bytes = 0
        with tempfile.TemporaryDirectory() as tmpdir:
            for fips, abbr in sorted(STATE_FIPS.items(), key=lambda kv: kv[1]):
                c = counties[counties.GEOID.str.startswith(fips)]
                d = districts[districts.STATEFP == fips]
                if c.empty or d.empty:
                    print(f"[{year}] {abbr}: no geometry", flush=True)
                    continue
                info = build_state(year, abbr, c, d, tmpdir)
                total_bytes += info.get("bytes", 0)
                print(f"[{year}] {abbr}: {info['pieces']} pieces, {info['dropped']} slivers dropped, {info.get('bytes', 0) // 1024} KB", flush=True)
        print(f"[{year}] total {total_bytes // 1024} KB", flush=True)


if __name__ == "__main__":
    main()
