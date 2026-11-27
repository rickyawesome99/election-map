#!/usr/bin/env python3
"""
Writes data-entry/precincts/district-shares/{ST}-{chamber}.json: for every 2024 anchor precinct, the
share of its 2020 population in each state-legislative district on today's lines. Used where a
year's precinct file carries no district label for a chamber (a chamber not on that ballot, e.g.
South Carolina's Senate in 2026, and every past year, whose labels are on that year's lines), so lib/stateLegDistrictRows.ts can sum every office by
district.

Method: every 2020 census block goes to the district holding its interior point (TIGER INTPTLAT20/
INTPTLON20); the block → precinct crosswalk (raw/crosswalk/{ST}_block_pid.parquet, row-aligned with
the TIGER block file, as in build_demographics.py) puts it in a precinct; a precinct's share in a district is that district's
part of the precinct's block population. A precinct with no population falls back to block count.

Output: {"st", "chamber", "first_pid", "shares": {"<index>": [["<district GEOID>", share], ...]}}, index =
pid − first_pid (the results files' row order).

Run from project root:  python3 scripts/precincts/build_district_shares.py SC senate [house]  |  --all
"""
import json, sys, zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
OUT = ROOT / "data-entry" / "precincts" / "district-shares"
FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}


def build(st: str, chamber: str) -> None:
    fips = FIPS[st]
    xw = pd.read_parquet(RAW / "crosswalk" / f"{st}_block_pid.parquet")
    zp = RAW / "blocks" / f"tl_2020_{fips}_tabblock20.zip"
    blocks = gpd.read_file(f"zip://{zp}", columns=["GEOID20", "POP20", "INTPTLAT20", "INTPTLON20"], ignore_geometry=True)
    pts = gpd.GeoDataFrame(
        {"geoid": blocks["GEOID20"].astype(str), "pop": pd.to_numeric(blocks["POP20"], errors="coerce").fillna(0)},
        geometry=gpd.points_from_xy(blocks["INTPTLON20"].astype(float), blocks["INTPTLAT20"].astype(float)), crs=4326)
    assert len(xw) == len(pts)
    pts["pid"] = xw["pid"].values

    dist = gpd.read_file(ROOT / "public" / "state-leg-districts" / chamber / f"{st}.json").set_crs(4326, allow_override=True)
    # Keyed by TIGER GEOID (the roster's `geoid` in data/stateLegDistricts.ts): the files' DISTRICT field
    # is not a usable key everywhere (Minnesota's 34A and 34B are both "34", Alaska's Senate "0").
    dist = dist[["GEOID", "geometry"]].rename(columns={"GEOID": "district"})
    joined = gpd.sjoin(pts, dist, how="left", predicate="within")
    joined = joined[~joined.index.duplicated()]
    # A point on no district (coastline slivers): the nearest one.
    miss = joined["district"].isna()
    if miss.any():
        near = gpd.sjoin_nearest(pts[miss].to_crs(5070), dist.to_crs(5070), how="left")
        joined.loc[miss, "district"] = near[~near.index.duplicated()]["district"].values
    joined = joined.dropna(subset=["pid"])
    joined["pid"] = joined["pid"].astype(int)
    joined["n"] = 1

    anchor = [json.loads(l)["properties"]["pid"] for l in open(ROOT / "data-entry" / "precincts" / "anchor" / f"{st}.geojsonl")]
    first = min(anchor)
    assert anchor == list(range(first, first + len(anchor))), "anchor pids not contiguous"

    g = joined.groupby(["pid", "district"])[["pop", "n"]].sum().reset_index()
    shares: dict[str, list] = {}
    for pid, grp in g.groupby("pid"):
        w = grp["pop"] if grp["pop"].sum() > 0 else grp["n"]
        tot = w.sum()
        shares[str(pid - first)] = [[str(d), round(float(v / tot), 4)] for d, v in zip(grp["district"], w) if v > 0]
    # A precinct holding no block's interior point (tiny Wisconsin wards, California SRPRECs): the
    # district holding a point inside the precinct's own shape, else the nearest district.
    lacking = [pid for pid in anchor if str(pid - first) not in shares]
    if lacking:
        want = set(lacking)
        feats = []
        for line in open(ROOT / "data-entry" / "precincts" / "anchor" / f"{st}.geojsonl"):
            f = json.loads(line)
            if f["properties"]["pid"] in want and f.get("geometry"):
                feats.append({"type": "Feature", "properties": {"pid": f["properties"]["pid"]}, "geometry": f["geometry"]})
        if feats:
            prec = gpd.GeoDataFrame.from_features(feats, crs=4326)
            prec["geometry"] = prec.geometry.make_valid().representative_point()
            hit = gpd.sjoin_nearest(prec.to_crs(5070), dist.to_crs(5070), how="left")
            hit = hit[~hit.index.duplicated()]
            for pid, d in zip(hit["pid"], hit["district"]):
                if isinstance(d, str):
                    shares[str(int(pid) - first)] = [[d, 1.0]]
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{st}-{chamber}.json"
    out.write_text(json.dumps({"st": st, "chamber": chamber, "first_pid": first, "shares": shares}, separators=(",", ":")))
    split = sum(1 for v in shares.values() if len(v) > 1)
    print(f"{out.relative_to(ROOT)}: {len(shares)} of {len(anchor)} precincts, {split} split")


if __name__ == "__main__":
    # python3 build_district_shares.py SC senate house   |   python3 build_district_shares.py --all
    if sys.argv[1] == "--all":
        for st in sorted(FIPS):
            for ch in ("house", "senate"):
                if (ROOT / "public" / "state-leg-districts" / ch / f"{st}.json").exists():
                    build(st, ch)
    else:
        st = sys.argv[1].upper()
        for ch in sys.argv[2:] or ["senate"]:
            build(st, ch)
