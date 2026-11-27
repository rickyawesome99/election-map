#!/usr/bin/env python3
"""Fit a past election (2016, 2018, 2020) onto the 2024 precincts, from VEST precinct shapefiles.

VEST files carry that year's precinct lines with the statewide contests (president, U.S. Senate,
governor). Each old precinct's votes are moved to the 2024 precincts through 2020 Census blocks:

  1. every block (its interior point, with its 2020 population) is assigned to the old precinct and to
     the 2024 precinct that contain it (nearest precinct for the few blocks that fall in a gap);
  2. an old precinct's votes are split among 2024 precincts in proportion to the population of the
     blocks they share - never by area; a precinct with no population falls back to block counts, and
     one with no block at all goes to the 2024 precinct under its interior point;
  3. sums are rounded by largest remainder so statewide totals are exactly the source's.

Where the lines did not change this is the identity; where a precinct was split or merged the result
is an estimate, and the share of each 2024 precinct's vote that arrived through a split is recorded
("est", 0-100) so the page can mark it.

Output: public/precincts/results/{ST}/{year}.json (same shape as the 2024 file) and the coverage grid.

  python3 scripts/precincts/build_results_vest.py 2020 GA
  python3 scripts/precincts/build_results_vest.py 2020            # every state with inputs on disk
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from shapely import make_valid

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
from coverage import update_cells  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW = PRE / "raw"
XW = RAW / "crosswalk"
OUT = ROOT / "public" / "precincts" / "results"
OFFICE_CODE = {"PRE": "PRES", "USS": "USS", "GOV": "GOV"}
CRS = 5070


def blocks_for(st: str) -> gpd.GeoDataFrame | None:
    """2020 blocks as points with population, in the working CRS (attributes only; no block geometry)."""
    z = RAW / "blocks" / f"tl_2020_{B_FIPS[st]}_tabblock20.zip"
    if not z.exists():
        return None
    df = pyogrio.read_dataframe(f"/vsizip/{z}", read_geometry=False, columns=["GEOID20", "INTPTLAT20", "INTPTLON20", "POP20"])
    pts = gpd.GeoDataFrame({"geoid": df["GEOID20"], "pop": pd.to_numeric(df["POP20"], errors="coerce").fillna(0).astype(int)},
                           geometry=gpd.points_from_xy(df["INTPTLON20"].astype(float), df["INTPTLAT20"].astype(float)), crs=4269)
    return pts.to_crs(CRS)


def assign(points: gpd.GeoDataFrame, polys: gpd.GeoDataFrame, key: str) -> pd.Series:
    """Index of the polygon containing each point; the nearest one for points in a gap."""
    j = gpd.sjoin(points[["geometry"]], polys[[key, "geometry"]], how="left", predicate="within")
    j = j[~j.index.duplicated()]
    out = j[key].reindex(points.index)
    miss = out.isna()
    if miss.any():
        n = gpd.sjoin_nearest(points.loc[miss, ["geometry"]], polys[[key, "geometry"]], how="left")
        out.loc[miss] = n[~n.index.duplicated()][key].reindex(out.index[miss])
    return out


def anchor_blocks(st: str, pts: gpd.GeoDataFrame) -> pd.Series:
    """block → 2024 pid, cached (it is the same for every year)."""
    XW.mkdir(parents=True, exist_ok=True)
    cache = XW / f"{st}_block_pid.parquet"
    src = PRE / "anchor" / f"{st}.geojsonl"
    if cache.exists() and cache.stat().st_mtime > src.stat().st_mtime:
        return pd.read_parquet(cache)["pid"]
    anchor = gpd.read_file(src, engine="pyogrio")[["pid", "geometry"]].to_crs(CRS)
    pid = assign(pts, anchor, "pid").astype("int64")
    pd.DataFrame({"pid": pid}).to_parquet(cache)
    return pid


def vest_layer(st: str, year: int) -> str | None:
    # KY and NJ 2020 report on coarse units (county groups, municipalities); VEST also publishes its own
    # estimates on 2020 VTDs for them, which are a far finer starting point.
    est = RAW / "vest" / str(year) / f"{st.lower()}_{year}_vtd_estimates.zip"
    z = est if est.exists() else RAW / "vest" / str(year) / f"{st.lower()}_{year}.zip"
    if not z.exists():
        z = RAW / "vest" / str(year) / f"{st.lower()}.zip"  # some 2016 files carry no year in the name
    if not z.exists():
        return None
    with zipfile.ZipFile(z) as zf:
        shp = [n for n in zf.namelist() if n.lower().endswith(".shp")]
    return f"/vsizip/{z}/{shp[0]}" if shp else None


def contests(cols: list[str], yy: str) -> dict[str, dict[str, list[tuple[str, str]]]]:
    """office → 'general' | 'runoff' → [(column, party letter)]. A U.S. Senate special held the same day
    (S..USS, e.g. MN 2018, GA 2020) is office USSS; other specials and primaries are left out."""
    out: dict[str, dict[str, list[tuple[str, str]]]] = defaultdict(lambda: defaultdict(list))
    runoffs: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for c in cols:
        m = re.match(rf"^([GRS])(\d\d)(PRE|USS|GOV)([A-Z])([A-Z0-9]{{2,3}})$", c.upper())
        if not m:
            continue
        stage, cyy, off, party, tag = m.groups()
        if stage == "G" and cyy == yy:
            out[OFFICE_CODE[off]]["general"].append((c, party))
        elif stage == "S" and cyy == yy and off == "USS":
            out["USSS"]["general"].append((c, party))
        elif stage == "R":  # a runoff that decided one of these (held weeks later, sometimes next January)
            runoffs[OFFICE_CODE[off]].append((c, party))
    for office, st in out.items():
        # Each contest takes the runoff columns whose candidates also appear in its own general columns
        # (GA 2021: Perdue/Ossoff decided the regular race, Loeffler/Warnock the special).
        tags = {c[-3:].upper() for c, _ in st.get("general", [])}
        st["runoff"] = [(c, p) for c, p in runoffs.get("USS" if office == "USSS" else office, []) if c[-3:].upper() in tags]
    return out


def largest_remainder(x: np.ndarray, total: int) -> np.ndarray:
    f = np.floor(x).astype(np.int64)
    short = int(total - f.sum())
    if short > 0:
        f[np.argsort(-(x - f))[:short]] += 1
    return f


def load_old(st: str, year: int) -> gpd.GeoDataFrame | None:
    """That year's precincts (VEST), cleaned, in the working CRS, with a running id "oid"."""
    layer = vest_layer(st, year)
    if not layer:
        return None
    old = gpd.read_file(layer, engine="pyogrio")
    old = old[~old.geometry.isna() & ~old.geometry.is_empty].reset_index(drop=True)
    bad = ~old.geometry.is_valid
    if bad.any():
        old.loc[bad, "geometry"] = old.loc[bad, "geometry"].apply(make_valid)
    old = old.to_crs(CRS)
    old["oid"] = np.arange(len(old))
    return old


def crosswalk(st: str, old: gpd.GeoDataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, int] | None:
    """Old precinct → 2024 precinct weights: (old row, 2024 row, weight, is-a-real-split, first pid, n)."""
    meta_path = PRE / "anchors" / f"{st}.json"
    pts = blocks_for(st) if meta_path.exists() else None
    if pts is None:
        return None
    pids = sorted(int(p) for p in json.loads(meta_path.read_text())["precincts"])
    first, n = pids[0], len(pids)
    new_pid = anchor_blocks(st, pts)
    old_id = assign(pts, old, "oid").astype("int64")
    xw = pd.DataFrame({"oid": old_id.values, "pid": new_pid.values, "pop": pts["pop"].values, "one": 1})
    g = xw.groupby(["oid", "pid"], as_index=False)[["pop", "one"]].sum()
    tot = g.groupby("oid")[["pop", "one"]].transform("sum")
    g["w"] = np.where(tot["pop"] > 0, g["pop"] / tot["pop"].replace(0, np.nan), g["one"] / tot["one"])
    # Old precincts holding no block at all: the 2024 precinct under their interior point.
    lone = old.loc[~old["oid"].isin(g["oid"])]
    if len(lone):
        anchor = gpd.read_file(PRE / "anchor" / f"{st}.geojsonl", engine="pyogrio")[["pid", "geometry"]].to_crs(CRS)
        rp = gpd.GeoDataFrame({"oid": lone["oid"].values}, geometry=lone.geometry.representative_point().values, crs=CRS)
        g = pd.concat([g, pd.DataFrame({"oid": rp["oid"].values, "pid": assign(rp, anchor, "pid").astype("int64").values, "pop": 0, "one": 0, "w": 1.0})], ignore_index=True)
    g = g[g["w"] > 0]
    w = g["w"].to_numpy()
    # A real division; slivers from line misalignment (main piece >= 95%) do not count.
    return g["oid"].to_numpy(), (g["pid"] - first).to_numpy(), w, w < 0.95, first, n


def build_state(st: str, year: int, truth: dict) -> str:
    old = load_old(st, year)
    xw = crosswalk(st, old) if old is not None else None
    if xw is None:
        return f"{st}: missing inputs"
    rows, cols_idx, w, split, first, n = xw

    yy = f"{year % 100:02d}"
    cs = contests([c for c in old.columns if c not in ("geometry", "oid")], yy)
    offices: dict[str, list[list[int]]] = {}
    est: dict[str, list[int]] = {}
    sums: dict[str, dict] = {}
    notes = []
    for office in ("PRES", "USS", "USSS", "GOV"):
        if st == "DC" and office != "PRES":
            continue  # DC's "U.S. Senator" is the shadow senator, not a Senate seat
        stage = "runoff" if cs.get(office, {}).get("runoff") else "general"
        cols = cs.get(office, {}).get(stage, [])
        if not cols:
            continue
        v = old[[c for c, _ in cols]].apply(pd.to_numeric, errors="coerce").fillna(0)
        dcol, rcol = B.slot_columns([(c, p, int(v[c].sum())) for c, p in cols])
        d_old = v[dcol].to_numpy() if dcol else np.zeros(len(old))
        r_old = v[rcol].to_numpy() if rcol else np.zeros(len(old))
        o_old = v.sum(axis=1).to_numpy() - d_old - r_old
        parts = []
        for comp in (d_old, r_old, o_old):
            acc = np.zeros(n)
            np.add.at(acc, cols_idx, comp[rows] * w)
            parts.append(largest_remainder(acc, int(round(comp.sum()))))
        tot_old = d_old + r_old + o_old
        allv, splitv = np.zeros(n), np.zeros(n)
        np.add.at(allv, cols_idx, tot_old[rows] * w)
        np.add.at(splitv, cols_idx, np.where(split, tot_old[rows] * w, 0))
        offices[office] = [[int(a), int(b), int(c)] for a, b, c in zip(*parts)]
        est[office] = [int(round(100 * s / a)) if a > 0 else 0 for s, a in zip(splitv, allv)]
        sums[office] = {"d": int(parts[0].sum()), "r": int(parts[1].sum()), "o": int(parts[2].sum()), "precincts_with_votes": int(((parts[0] + parts[1] + parts[2]) > 0).sum()),
                        "src": f"vest-{year}", "basis": "slot", "est": round(float(splitv.sum() / allv.sum()), 4) if allv.sum() else 0.0, **({"stage": "runoff"} if stage == "runoff" else {})}
        notes.append(f"{office}{'(runoff)' if stage == 'runoff' else ''} est {sums[office]['est']:.0%}")

    (OUT / st).mkdir(parents=True, exist_ok=True)
    path = OUT / st / f"{year}.json"
    doc = json.loads(path.read_text()) if path.exists() else {"year": year, "st": st, "n": n, "first_pid": first, "offices": {}, "districts": {}, "basis": {}, "est": {}, "src": []}
    doc["offices"].update(offices)
    doc.setdefault("est", {}).update(est)
    doc.setdefault("basis", {}).update({o: "slot" for o in offices})
    doc["src"] = sorted(set(doc.get("src", [])) | {f"vest-{year}"})
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    line = update_cells(st, year, n, sums, truth)
    return f"{st} {n:6d}  old {len(old):5d}  {line}   [{', '.join(notes)}]"


def build_virginia_legislature(year: int, truth: dict) -> list[str]:
    """Virginia's odd-year legislature: VEST publishes it as separate layers with one column per party
    (G19HODDEM, G19SOVREP, ...) and the district of each precinct (HOD_DIST / SOV_DIST)."""
    st, out = "VA", []
    for suffix, office, tag, dcol in (("statehouse", "SLDL", "HOD", "HOD_DIST"), ("statesenate", "SLDU", "SOV", "SOV_DIST")):
        z = RAW / "vest" / str(year) / f"va_{year}_{suffix}.zip"
        if not z.exists() or st not in truth.get(year, {}).get(office, {}):
            continue
        with zipfile.ZipFile(z) as zf:
            shp = next(n for n in zf.namelist() if n.lower().endswith(".shp"))
        old = gpd.read_file(f"/vsizip/{z}/{shp}", engine="pyogrio")
        old = old[~old.geometry.isna() & ~old.geometry.is_empty].reset_index(drop=True)
        bad = ~old.geometry.is_valid
        if bad.any():
            old.loc[bad, "geometry"] = old.loc[bad, "geometry"].apply(make_valid)
        old = old.to_crs(CRS)
        old["oid"] = np.arange(len(old))
        rows, cols_idx, w, split, first, n = crosswalk(st, old)
        pre = f"G{year % 100:02d}{tag}"
        cols = [c for c in old.columns if c.upper().startswith(pre)]
        v = old[cols].apply(pd.to_numeric, errors="coerce").fillna(0)
        d_old = v[[c for c in cols if c.upper().endswith("DEM")]].sum(axis=1).to_numpy()
        r_old = v[[c for c in cols if c.upper().endswith("REP")]].sum(axis=1).to_numpy()
        o_old = v.sum(axis=1).to_numpy() - d_old - r_old
        parts = []
        for comp in (d_old, r_old, o_old):
            acc = np.zeros(n)
            np.add.at(acc, cols_idx, comp[rows] * w)
            parts.append(largest_remainder(acc, int(round(comp.sum()))))
        tot_old = d_old + r_old + o_old
        allv, splitv = np.zeros(n), np.zeros(n)
        np.add.at(allv, cols_idx, tot_old[rows] * w)
        np.add.at(splitv, cols_idx, np.where(split, tot_old[rows] * w, 0))
        dist = old[dcol].astype(str).str.strip().to_numpy()
        g = pd.DataFrame({"pid": cols_idx, "d": dist[rows], "v": tot_old[rows] * w + 1e-9})
        g = g.groupby(["pid", "d"], as_index=False)["v"].sum().sort_values("v").drop_duplicates("pid", keep="last")
        lab = [""] * n
        for pid_, d in zip(g["pid"], g["d"]):
            lab[int(pid_)] = d.zfill(2 if office == "SLDU" else 3) if d.isdigit() else d
        path = OUT / st / f"{year}.json"
        doc = json.loads(path.read_text()) if path.exists() else {"year": year, "st": st, "n": n, "first_pid": first, "offices": {}, "districts": {}, "basis": {}, "est": {}, "src": []}
        doc["offices"][office] = [[int(a), int(b), int(c)] for a, b, c in zip(*parts)]
        doc.setdefault("districts", {})[office] = lab
        doc.setdefault("est", {})[office] = [int(round(100 * s_ / a)) if a > 0 else 0 for s_, a in zip(splitv, allv)]
        doc.setdefault("basis", {})[office] = "party"
        doc["src"] = sorted(set(doc.get("src", [])) | {f"vest-{year}"})
        path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
        sums = {office: {"d": int(parts[0].sum()), "r": int(parts[1].sum()), "o": int(parts[2].sum()), "precincts_with_votes": int(((parts[0] + parts[1] + parts[2]) > 0).sum()),
                         "src": f"vest-{year}", "basis": "party", "est": round(float(splitv.sum() / allv.sum()), 4) if allv.sum() else 0.0}}
        out.append(f"VA {year} {office}  old {len(old)}  " + update_cells(st, year, n, sums, truth))
    return out


B_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}


def main() -> None:
    year = int(sys.argv[1])
    states = [s.upper() for s in sys.argv[2:]] or B.STATES
    truth = B.load_truth()
    for st in states:
        try:
            print(build_state(st, year, truth), flush=True)
        except Exception as e:  # keep going; one state's quirk should not stop the run
            print(f"{st}: FAILED {type(e).__name__}: {str(e)[:200]}", flush=True)
        if st == "VA" and year % 2:
            for line in build_virginia_legislature(year, truth):
                print(line, flush=True)


if __name__ == "__main__":
    main()
