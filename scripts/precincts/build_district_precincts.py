#!/usr/bin/env python3
"""
Builds public/state-leg-precincts/{chamber}/{ST}/{i}.json: for every state legislative district on
today's lines, the 2024 precincts it covers, cut at the district line, as a small TopoJSON. The
district pages' map (components/atlas/AtlasPrecinctMap.tsx) draws one file per district, the way a
House page draws public/house-county-pieces.

  i         the district's position in public/state-leg-districts/{chamber}/{ST}.json's geometry
            list (the boundary file the chamber map and the page already load), so no district-key
            rules are repeated here: the page resolves its key to a feature, then asks for file i.
  pieces    one geometry per (precinct, district) piece; properties p (precinct id, as in the
            tiles and results files) and k (1 = inside this district, 0 = the rest of a precinct
            the district shares with a neighbour, drawn hatched)

Detail scales with the district (INTERVAL_*): a city district keeps 8 m line work, a big rural one
80 m. Pieces smaller than 2% of their precinct are dropped as slivers from the two files' different
line work (the page paints the district itself grey underneath, so a dropped sliver is never a
hole). Simplification runs once per state and chamber over every piece together (mapshaper keeps
shared borders shared), then each district's file is written from the simplified pieces.

Input:  data-entry/precincts/anchor/{ST}.geojsonl, public/state-leg-districts/{chamber}/{ST}.json
Run from project root (geopandas + mapshaper):
  python3 scripts/precincts/build_district_precincts.py            # every state
  python3 scripts/precincts/build_district_precincts.py MN CA
"""
import json, math, shutil, subprocess, sys, tempfile, warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.validation import make_valid

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
ANCHOR = ROOT / "data-entry" / "precincts" / "anchor"
BOUNDS = ROOT / "public" / "state-leg-districts"
OUT = ROOT / "public" / "state-leg-precincts"
SLIVER = 0.02          # share of the precinct's area below which a piece is dropped
# Simplification interval in metres, by district size: 1/2500 of the district's bounding-box
# diagonal (about a third of a pixel at the opening view of a ~850px map, so zooming in 3-4x stays
# clean), never finer than 8 m (a city district) or coarser than 80 m (the largest rural ones).
INTERVAL_DIV, INTERVAL_MIN, INTERVAL_MAX = 2500, 8, 80
EQUAL_AREA = "EPSG:6933"


def polys(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    bad = ~gdf.geometry.is_valid
    if bad.any():
        gdf.loc[bad, "geometry"] = gdf.loc[bad, "geometry"].apply(make_valid)
    gdf = gdf.explode(index_parts=False)
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    return gdf.dissolve(by=gdf.columns.drop("geometry").tolist(), as_index=False)


def build(st: str) -> None:
    src = ANCHOR / f"{st}.geojsonl"
    if not src.exists():
        print(st, "no anchor file")
        return
    prec = polys(gpd.read_file(src)[["pid", "geometry"]].set_crs(4326, allow_override=True))
    prec_area = prec.to_crs(EQUAL_AREA).set_index("pid").area
    for chamber in ("house", "senate"):
        bf = BOUNDS / chamber / f"{st}.json"
        if not bf.exists():
            continue
        dist = gpd.read_file(bf).set_crs(4326, allow_override=True)
        dist["i"] = range(len(dist))
        dist = polys(dist[["i", "geometry"]])
        b = dist.to_crs(EQUAL_AREA).bounds
        diag = ((b.maxx - b.minx) ** 2 + (b.maxy - b.miny) ** 2) ** 0.5
        dist["iv"] = (diag / INTERVAL_DIV).clip(INTERVAL_MIN, INTERVAL_MAX).round(1)
        pieces = gpd.overlay(prec, dist, how="intersection", keep_geom_type=True)
        pieces = pieces.dissolve(by=["pid", "i"], as_index=False)
        share = pieces.to_crs(EQUAL_AREA).area.values / prec_area.reindex(pieces["pid"]).values
        pieces = pieces[share >= SLIVER].reset_index(drop=True)

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            raw, simp = tmp / "pieces.json", tmp / "simplified.json"
            pieces[["pid", "i", "iv", "geometry"]].to_file(raw, driver="GeoJSON")
            # mapshaper's per-feature (variable) simplification stalls on very large layers (California's
            # Senate: >25,000 pieces, still running after 30 minutes). Those are simplified in groups of
            # districts of like size instead, each at its group's interval; borders between groups are
            # simplified twice, which only shows under the district outline drawn over them.
            if len(pieces) <= 20000:
                subprocess.run(["mapshaper", "-i", str(raw), "-simplify", "variable", "interval=iv", "keep-shapes",
                                "-o", "precision=0.00001", str(simp)], check=True, capture_output=True)
                feats = json.loads(simp.read_text())["features"]
            else:
                feats = []
                bucket = pieces["iv"].apply(lambda v: min(INTERVAL_MAX, INTERVAL_MIN * 2 ** round(math.log2(max(v, INTERVAL_MIN) / INTERVAL_MIN))))
                for iv, grp in pieces.groupby(bucket):
                    gin, gout = tmp / f"g{iv}.json", tmp / f"g{iv}.out.json"
                    grp[["pid", "i", "geometry"]].to_file(gin, driver="GeoJSON")
                    subprocess.run(["mapshaper", "-i", str(gin), "-simplify", f"interval={iv}", "keep-shapes",
                                    "-o", "precision=0.00001", str(gout)], check=True, capture_output=True)
                    feats += json.loads(gout.read_text())["features"]
            by_pid: dict[int, list[dict]] = {}
            by_dist: dict[int, list[dict]] = {}
            for f in feats:
                if not f.get("geometry"):
                    continue
                p, i = int(f["properties"]["pid"]), int(f["properties"]["i"])
                by_pid.setdefault(p, []).append(f)
                by_dist.setdefault(i, []).append(f)
            gj = tmp / "gj"
            gj.mkdir()
            for i, mine in by_dist.items():
                pids = {int(f["properties"]["pid"]) for f in mine}
                out = [{"type": "Feature", "properties": {"p": int(f["properties"]["pid"]), "k": 1}, "geometry": f["geometry"]} for f in mine]
                for p in pids:
                    for f in by_pid[p]:
                        if int(f["properties"]["i"]) != i:
                            out.append({"type": "Feature", "properties": {"p": p, "k": 0}, "geometry": f["geometry"]})
                (gj / f"{i}.json").write_text(json.dumps({"type": "FeatureCollection", "features": out}))
            dest = OUT / chamber / st
            if dest.exists():
                shutil.rmtree(dest)
            dest.mkdir(parents=True)
            files = sorted(gj.glob("*.json"), key=lambda x: int(x.stem))
            # One mapshaper run converts every district's file (each input is written separately).
            for chunk in range(0, len(files), 200):
                batch = files[chunk:chunk + 200]
                subprocess.run(["mapshaper", "-i", *map(str, batch), "-rename-layers", "pieces",
                                "-o", "format=topojson", "quantization=100000", str(dest) + "/"], check=True, capture_output=True)
        size = sum(f.stat().st_size for f in dest.glob("*.json"))
        print(f"{st} {chamber}: {len(dist)} districts, {len(by_dist)} files, {len(pieces)} pieces, {size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    states = [s.upper() for s in sys.argv[1:]] or sorted(p.stem for p in ANCHOR.glob("*.geojsonl"))
    for st in states:
        build(st)
