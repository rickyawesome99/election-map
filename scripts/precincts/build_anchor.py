#!/usr/bin/env python3
"""Build a state's anchor precinct layer: the one 2024 precinct geometry every year is shown on (D1).

Reads the state's 2024 precinct boundary file (Redistricting Data Hub zip by default; a public
official layer where sources.csv names one), cleans the geometry, assigns the national precinct id
and writes:

  data-entry/precincts/anchor/{ST}.geojsonl   one feature per precinct, props pid/st/geoid/name/county
                                              (gitignored; input to build_tiles.py and the crosswalk)
  data-entry/precincts/anchors/{ST}.json      committed metadata keyed by pid + provenance + QA summary

Usage:
  python3 scripts/precincts/build_anchor.py WA NC TX DC        # states with files on disk
  python3 scripts/precincts/build_anchor.py --all               # every state whose input exists
  python3 scripts/precincts/build_anchor.py TX --repair         # also run maup.smart_repair (slow)

pid = state FIPS × 1,000,000 + running index (1-based) in (county, geoid) order. It is stable for a
given input file; rebuilding from a different source file renumbers, which is fine before results
are attached and must be avoided after (results JSON is positional by pid order).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import make_valid
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW_RDH = PRE / "raw" / "rdh"
RAW_OFF = PRE / "raw" / "official"
ANCHOR = PRE / "anchor"
ANCHORS = PRE / "anchors"
COUNTIES_TOPO = ROOT / "public" / "us-counties.json"

STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}

# Field candidates, in order of preference, for sources that are not described below.
GEOID_FIELDS = ["UNIQUE_ID", "GEOID20", "GEOID", "VTDST20", "CNTYVTD", "prec_id", "PRECINCTID", "PCTNUM", "NAME"]
NAME_FIELDS = ["PRECINCT", "PREC_NAME", "PRECNAME", "NAME", "PrecinctNa", "enr_desc", "VTD", "NAMELSAD20", "UNIQUE_ID"]
RDH_NAME_FIELDS = ["PRECINCTNA", "PRECINCT_N", "PRECINCT", "PREC_NAME", "PRECNAME", "DISTRICT", "PREC_ID", "NAME"]
COUNTY_FIELDS = ["COUNTYFP", "COUNTYFP20", "COUNTY", "CNTYFP", "CountyName", "county_nam", "CNTY", "County", "county_id"]


def norm_name(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"\b(county|parish|borough|census area|municipality|city and borough|city)\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def county_lookup() -> dict[tuple[str, str], str]:
    """(state postal, normalized county name) → 5-digit FIPS, from the site's county TopoJSON."""
    topo = json.loads(COUNTIES_TOPO.read_text())
    geoms = next(iter(topo["objects"].values()))["geometries"]
    by_fips = {v: k for k, v in STATE_FIPS.items()}
    out: dict[tuple[str, str], str] = {}
    for g in geoms:
        fips = str(g["id"]).zfill(5)
        st = by_fips.get(fips[:2])
        if st:
            out[(st, norm_name(g["properties"]["name"]))] = fips
    return out


def county_by_location(gdf: gpd.GeoDataFrame, st: str) -> pd.Series:
    counties = gpd.read_file(COUNTIES_TOPO)
    if counties.crs is None:
        counties = counties.set_crs(4326)
    counties["fips"] = counties["id"].astype(str).str.zfill(5)
    counties = counties[counties["fips"].str[:2] == STATE_FIPS[st]][["fips", "geometry"]].to_crs(5070)
    pts = gpd.GeoDataFrame(geometry=gdf.geometry.to_crs(5070).representative_point(), index=gdf.index)
    j = gpd.sjoin_nearest(pts, counties, how="left")
    return j[~j.index.duplicated()]["fips"].reindex(gdf.index)


# ---------------------------------------------------------------------------------------------
# Per-source readers. Each returns a GeoDataFrame with columns geoid, name, county (5-digit), geometry.

def read_rdh(st: str) -> gpd.GeoDataFrame | None:
    zips = sorted(RAW_RDH.glob(f"{st.lower()}_2024_gen_prec*.zip")) + sorted(RAW_RDH.glob(f"{st.lower()}_2024*.zip"))
    if not zips:
        return None
    z = zips[0]
    with zipfile.ZipFile(z) as zf:
        shps = [n for n in zf.namelist() if n.lower().endswith((".shp", ".geojson"))]
    # RDH ships _all_ (whole precincts) plus _cong_/_sldu_/_sldl_ splits; the anchor is the unsplit layer.
    pick = next((n for n in shps if "_all" in n.lower()), None) or next((n for n in shps if not re.search(r"_(cong|sldu|sldl)", n.lower())), None) or (shps[0] if shps else None)
    if not pick:
        sys.exit(f"{st}: no shapefile inside {z.name}")
    gdf = gpd.read_file(f"zip://{z}!{pick}")
    cols = {c.upper(): c for c in gdf.columns}
    geoid = next((cols[c.upper()] for c in GEOID_FIELDS if c.upper() in cols), None)
    name = next((cols[c.upper()] for c in RDH_NAME_FIELDS if c.upper() in cols), None)
    if not geoid and "PRECINCT" in cols:
        geoid = cols["PRECINCT"]  # KS (VEST / IKE Lab layout): coname + precinct, no UNIQUE_ID or COUNTYFP
    if not geoid:
        sys.exit(f"{st}: cannot find an id field in {pick}: {list(gdf.columns)[:20]}")
    out = gpd.GeoDataFrame({
        "geoid": gdf[geoid].astype(str),
        "name": gdf[name].astype(str) if name else gdf[geoid].astype(str).str.split("-:-").str[-1],
    }, geometry=gdf.geometry, crs=gdf.crs)
    if "COUNTYFP" in cols:
        fp = gdf[cols["COUNTYFP"]].astype(str).str.strip()
        out["county"] = fp.map(lambda v: v if len(v) == 5 else STATE_FIPS[st] + v.zfill(3))
    else:
        # No county column (AK): take the county-equivalent containing each precinct's interior point.
        out["county"] = county_by_location(out, st)
    out.attrs["source_file"] = f"{z.name}!{pick}"
    return out


def read_official(st: str, lookup: dict[tuple[str, str], str]) -> gpd.GeoDataFrame | None:
    if st == "WA":
        p = RAW_OFF / "WA_Statewide_Precincts_2024General.zip"
        if not p.exists():
            return None
        g = gpd.read_file(f"zip://{p}")
        county = g["CountyName"].map(lambda n: lookup.get(("WA", norm_name(n))))
        out = gpd.GeoDataFrame({"geoid": county + "-" + g["PrecinctNu"].astype(str), "name": g["PrecinctNa"].astype(str), "county": county}, geometry=g.geometry, crs=g.crs)
    elif st == "NC":
        p = RAW_OFF / "NC_SBE_PRECINCTS_20240723.zip"
        if not p.exists():
            return None
        g = gpd.read_file(f"zip://{p}")
        county = g["county_nam"].map(lambda n: lookup.get(("NC", norm_name(n))))
        out = gpd.GeoDataFrame({"geoid": county + "-" + g["prec_id"].astype(str), "name": g["enr_desc"].astype(str), "county": county}, geometry=g.geometry, crs=g.crs)
    elif st == "TX":
        p = RAW_OFF / "TX_vtds_24pg.zip"
        if not p.exists():
            return None
        g = gpd.read_file(f"zip://{p}")
        # TLC: CNTY already holds the 3-digit county FIPS code (odd numbers 1–507); CNTYKEY is the 1–254 index.
        county = g["CNTY"].astype(int).map(lambda n: f"48{n:03d}")
        out = gpd.GeoDataFrame({"geoid": g["CNTYVTD"].astype(str), "name": g["VTD"].astype(str), "county": county}, geometry=g.geometry, crs=g.crs)
    elif st == "DC":
        p = RAW_OFF / "DC_voting_precincts.geojson"
        if not p.exists():
            return None
        g = gpd.read_file(p)
        num = g["NAME"].astype(str).str.extract(r"(\d+)")[0].fillna("0")
        out = gpd.GeoDataFrame({"geoid": "11001-" + num, "name": g["NAME"].astype(str), "county": "11001"}, geometry=g.geometry, crs=g.crs)
    else:
        return None
    out.attrs["source_file"] = p.name
    return out


# ---------------------------------------------------------------------------------------------

def clean(gdf: gpd.GeoDataFrame, repair: bool, doctor: bool) -> tuple[gpd.GeoDataFrame, dict]:
    qa: dict = {}
    n0 = len(gdf)
    gdf = gdf[~gdf.geometry.isna() & ~gdf.geometry.is_empty].copy()
    qa["dropped_empty"] = n0 - len(gdf)
    invalid = ~gdf.geometry.is_valid
    qa["invalid_fixed"] = int(invalid.sum())
    if invalid.any():
        gdf.loc[invalid, "geometry"] = gdf.loc[invalid, "geometry"].apply(make_valid)
    # Work in an equal-area CRS for areas and any repair, then back to WGS84 for output.
    eq = gdf.to_crs(5070)
    # Keep polygons only (make_valid can emit GeometryCollections with stray lines).
    eq["geometry"] = eq.geometry.apply(lambda g: g if g.geom_type in ("Polygon", "MultiPolygon") else _polygonal(g))
    eq = eq[~eq.geometry.is_empty].copy()
    if repair:
        import maup  # noqa: WPS433
        eq["geometry"] = maup.smart_repair(eq.geometry, snapped=True)
        qa["smart_repair"] = True
    eq["area_km2"] = (eq.geometry.area / 1e6).round(4)
    if doctor:
        # maup.doctor unions the whole layer to find gaps; minutes on a large state, so opt-in.
        try:
            import maup
            doc = maup.doctor(eq, accept_holes=True)
            qa["maup_doctor_ok"] = bool(doc) if not hasattr(doc, "__len__") else bool(all(doc))
        except Exception as e:  # advisory only
            qa["maup_doctor_error"] = str(e)[:200]
    out = eq.to_crs(4326)
    return out, qa


def _polygonal(g):
    from shapely.geometry import GeometryCollection, MultiPolygon
    if isinstance(g, GeometryCollection):
        polys = [p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
        flat = []
        for p in polys:
            flat.extend(p.geoms if p.geom_type == "MultiPolygon" else [p])
        return MultiPolygon(flat) if len(flat) > 1 else (flat[0] if flat else g.buffer(0))
    return g


def round_coords(obj, nd: int = 6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], nd), round(obj[1], nd)]
        return [round_coords(o, nd) for o in obj]
    return obj


def source_row(st: str) -> dict:
    with open(PRE / "sources.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == st:
                return r
    return {}


def build(st: str, lookup: dict, repair: bool, doctor: bool) -> bool:
    # RDH first: one schema for every state, and its vote columns join back by UNIQUE_ID. The official
    # readers cover DC (no RDH file) and stay as cross-checks / replacements for WA, NC, TX.
    gdf = read_rdh(st)
    kind = "rdh"
    if gdf is None:
        gdf = read_official(st, lookup)
        kind = "official"
    if gdf is None:
        print(f"{st}: no input file (expected {RAW_RDH}/{st.lower()}_2024_gen_prec*.zip or an official file)")
        return False
    src_file = gdf.attrs.get("source_file", "")
    # Codes the site's county map does not know (CT planning regions, GA rows coded 000) are replaced
    # by the county containing the precinct, so precincts always roll up to the site's counties.
    known = set(lookup.values())
    unknown = ~gdf["county"].isin(known)
    relocated = int(unknown.sum())
    if relocated:
        gdf.loc[unknown, "county"] = county_by_location(gdf.loc[unknown], st)
    missing_county = gdf["county"].isna() | (gdf["county"].astype(str).str.len() != 5)
    if missing_county.any():
        bad = gdf.loc[missing_county].head(5)
        sys.exit(f"{st}: {int(missing_county.sum())} rows without a 5-digit county FIPS, e.g. {bad[['geoid', 'name']].to_dict('records')}")
    gdf, qa = clean(gdf, repair, doctor)
    qa["county_by_location"] = relocated
    gdf = gdf.sort_values(["county", "geoid"]).reset_index(drop=True)
    base = int(STATE_FIPS[st]) * 1_000_000
    gdf["pid"] = [base + i + 1 for i in range(len(gdf))]
    dup = gdf["geoid"].duplicated(keep=False)
    qa["duplicate_geoids"] = int(dup.sum())
    if dup.any():
        # Keep both pieces but make geoid unique so joins stay deterministic.
        gdf.loc[dup, "geoid"] = gdf.loc[dup, "geoid"] + "#" + gdf.loc[dup].groupby("geoid").cumcount().add(1).astype(str)

    ANCHOR.mkdir(parents=True, exist_ok=True)
    ANCHORS.mkdir(parents=True, exist_ok=True)
    with open(ANCHOR / f"{st}.geojsonl", "w") as f:
        for r in gdf.itertuples(index=False):
            geom = mapping(r.geometry)
            geom["coordinates"] = round_coords(geom["coordinates"])
            f.write(json.dumps({"type": "Feature", "properties": {"pid": int(r.pid), "st": st, "geoid": r.geoid, "name": r.name, "county": r.county}, "geometry": geom}, separators=(",", ":")) + "\n")

    meta = {
        "state": st,
        "built": dt.date.today().isoformat(),
        "source_kind": kind,
        "source_file": src_file,
        "source": {k: v for k, v in source_row(st).items() if v and k in ("rdh_dataset_slug", "rdh_readme", "official_2024_layer", "official_license", "boundary_provenance", "same_in_2026", "anchor", "confidence")},
        "n": int(len(gdf)),
        "counties": int(gdf["county"].nunique()),
        "area_km2": round(float(gdf["area_km2"].sum()), 1),
        "qa": qa,
        "precincts": {int(r.pid): {"geoid": r.geoid, "name": r.name, "county": r.county, "area_km2": float(r.area_km2)} for r in gdf.itertuples(index=False)},
    }
    (ANCHORS / f"{st}.json").write_text(json.dumps(meta, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"{st}: {len(gdf):6d} precincts, {gdf['county'].nunique():3d} counties, {meta['area_km2']:,.0f} km², {kind} {src_file} | qa {qa}")
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--repair", action="store_true", help="run maup.smart_repair (minutes for large states)")
    ap.add_argument("--doctor", action="store_true", help="run maup.doctor gap/overlap check (minutes for large states)")
    a = ap.parse_args()
    states = [s.upper() for s in a.states] or (list(STATE_FIPS) if a.all else [])
    if not states:
        ap.error("give state codes or --all")
    lookup = county_lookup()
    done = 0
    failed = []
    for st in states:
        try:
            done += build(st, lookup, a.repair, a.doctor)
        except SystemExit as e:
            failed.append(st)
            print(f"FAILED {e}")
    if failed:
        print("failed:", " ".join(failed))
    print(f"{done}/{len(states)} built")


if __name__ == "__main__":
    main()
