#!/usr/bin/env python3
"""California 2016-2022 from the Statewide Database (SWDB), fitted onto the 2024 precincts.

California redraws its precincts for every election and has no VEST file for 2018; MEDSL lacks its 2022
U.S. Senate and state Senate rows. The Statewide Database (the state's redistricting database, UC Berkeley)
publishes, for every general election, the Statement of Vote by "SR precinct" together with that
election's SR-precinct shapes. This builder uses both, so every California contest is placed by real
geometry: the SR precinct's votes move to the 2024 precincts through 2020 Census blocks, exactly as in
build_results_vest.py.

Columns are {office}{party}{nn}: PRS president, USS U.S. Senate (USP, a partial term, is left out),
GOV governor, CNG U.S. House, SEN state Senate, ASS Assembly. The district is the precinct's CDDIST /
SDDIST / ADDIST. Top-two generals can put two candidates of one party in a contest (USSDEM01, USSDEM02):
the single-winner offices use the site's two-slot rule per contest, the legislature is summed by party.
Rows with no shape (a handful of absentee-only precincts) are spread over the shapes of the same county
and district.

Inputs (public, no login): https://statewidedatabase.org/pub/data/G{yy}/state/
  state_g{yy}_sov_data_by_g{yy}_srprec.zip and srprec_state_g{yy}_v01_shp.zip → data-entry/precincts/raw/swdb/

  python3 scripts/precincts/build_results_swdb.py 2018
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import make_valid

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
import build_results_vest as V  # noqa: E402
from coverage import update_cells  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw" / "swdb"
OUT = ROOT / "public" / "precincts" / "results"
ST = "CA"
OFFICE = {"PRS": ("PRES", None), "USS": ("USS", None), "GOV": ("GOV", None), "CNG": ("USH", "CDDIST"), "SEN": ("SLDU", "SDDIST"), "ASS": ("SLDL", "ADDIST")}
# Known gaps in the source, shown on /audit/precincts.
NOTES = {2020: {("CA", "SLDU"): "The Statewide Database file holds about half of Senate District 19's votes (127,364 D / 69,459 R against 272,442 / 150,089 certified); every other district matches."}}
LETTER = {"DEM": "D", "REP": "R", "NPP": "I", "IND": "I", "DCL": "I"}


# A contest the Statewide Database file leaves blank in one county. Senate District 19, 2020: Santa Barbara County is
# there (127,364 D / 69,459 R) and the Ventura County part of the district has no Senate votes at all. The certified
# district total is 272,442 / 150,089, so 145,078 D and 80,630 R belong to those Ventura precincts. They are spread
# over them in proportion to each precinct's presidential vote for the same party: an estimate, not a count.
BLANK_COUNTY = {(2020, "SLDU", "19"): ("06111", 145078, 80630)}


def load(year: int) -> tuple[pd.DataFrame, gpd.GeoDataFrame]:
    yy = f"{year % 100:02d}"
    with zipfile.ZipFile(RAW / f"state_g{yy}_sov_data_by_g{yy}_srprec.zip") as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        data = pd.read_csv(zf.open(name), dtype=str, na_filter=False)
    data.columns = [c.upper() for c in data.columns]
    z = RAW / f"srprec_state_g{yy}_v01_shp.zip"
    with zipfile.ZipFile(z) as zf:
        shp = next(n for n in zf.namelist() if n.lower().endswith(".shp"))
    old = gpd.read_file(f"/vsizip/{z}/{shp}", engine="pyogrio")
    old.columns = [c.upper() if c != "geometry" else c for c in old.columns]
    if old.crs is None:  # the 2018 file ships without a .prj; like the other years it is in degrees (NAD83)
        b = old.total_bounds
        old = old.set_crs(4269 if abs(b[0]) <= 180 else 3310)
    old = old[~old.geometry.isna() & ~old.geometry.is_empty].reset_index(drop=True)
    bad = ~old.geometry.is_valid
    if bad.any():
        old.loc[bad, "geometry"] = old.loc[bad, "geometry"].apply(make_valid)
    old = old.dissolve(by="SRPREC_KEY", as_index=False) if old["SRPREC_KEY"].duplicated().any() else old
    old = old[["SRPREC_KEY", "geometry"]].to_crs(V.CRS)
    old["oid"] = np.arange(len(old))
    return data, old


def build(year: int, truth: dict) -> str:
    data, old = load(year)
    xw = V.crosswalk(ST, old)
    if xw is None:
        return "CA: no blocks"
    rows, cols_idx, w, split, first, n = xw
    nold = len(old)
    oid = dict(zip(old["SRPREC_KEY"], old["oid"]))
    data["oid"] = [oid.get(k, -1) for k in data["SRPREC_KEY"]]
    data["cty"] = data["SRPREC_KEY"].str[:5]
    vote_cols = [c for c in data.columns if re.fullmatch(r"(PRS|USS|GOV|CNG|SEN|ASS)[A-Z]{3}\d\d", c)]
    data[vote_cols] = data[vote_cols].apply(pd.to_numeric, errors="coerce").fillna(0)

    offices: dict[str, list[list[int]]] = {}
    districts: dict[str, list[str]] = {}
    est: dict[str, list[int]] = {}
    sums: dict[str, dict] = {}
    notes = []
    for pre, (office, dcol) in OFFICE.items():
        cols = [c for c in vote_cols if c.startswith(pre)]
        if not cols or st_missing(truth, year, office):
            continue
        letters = {c: LETTER.get(c[3:6], "M") for c in cols}
        dist = data[dcol].str.strip() if dcol else pd.Series("", index=data.index)
        comp = np.zeros((len(data), 3))
        v = data[cols].to_numpy()
        if office in ("SLDU", "SLDL"):
            for j, c in enumerate(cols):
                comp[:, {"D": 0, "R": 1}.get(letters[c], 2)] += v[:, j]
        else:
            for d in sorted(set(dist)):
                m = (dist == d).to_numpy()
                tot = v[m].sum(axis=0)
                dc, rc = B.slot_columns([(c, letters[c], int(t)) for c, t in zip(cols, tot)])
                for j, c in enumerate(cols):
                    comp[m, 0 if c == dc else 1 if c == rc else 2] += v[m, j]
        for (y_, office_, d_), (cty, dem_add, rep_add) in BLANK_COUNTY.items():
            if (y_, office_) != (year, office):
                continue
            m = ((data["cty"] == cty) & (dist == d_)).to_numpy()
            if comp[m].sum() == 0:
                for side, amount, tag in ((0, dem_add, "DEM"), (1, rep_add, "REP")):
                    wcols = [c for c in vote_cols if c.startswith("PRS" + tag)]
                    wt = data.loc[m, wcols].to_numpy().sum(axis=1) if wcols else np.ones(int(m.sum()))
                    comp[m, side] += V.largest_remainder(amount * wt / max(wt.sum(), 1e-9), amount)
        arr = np.zeros((3, nold))
        has = (data["oid"] >= 0).to_numpy()
        np.add.at(arr, (slice(None), data["oid"].to_numpy()[has]), comp[has].T)
        dlab = np.full(nold, "", dtype=object)
        dlab[data["oid"].to_numpy()[has]] = dist.to_numpy()[has]
        # Rows with no shape: spread over the shapes of the same county and district.
        lost = data[~has & (comp.sum(axis=1) > 0)]
        if len(lost):
            shape_cty = np.array([k[:5] for k in old["SRPREC_KEY"]])
            weight = arr.sum(axis=0)
            for (cty, d), g in lost.groupby(["cty", dist[lost.index]]):
                target = np.flatnonzero((shape_cty == cty) & (dlab == d))
                if not len(target):
                    target = np.flatnonzero(shape_cty == cty)
                if not len(target):
                    continue
                wt = weight[target] + 1e-9
                arr[:, target] += comp[g.index.to_numpy()].sum(axis=0)[:, None] * (wt / wt.sum())[None, :]
        parts = []
        for c in range(3):
            acc = np.zeros(n)
            np.add.at(acc, cols_idx, arr[c][rows] * w)
            parts.append(V.largest_remainder(acc, int(round(arr[c].sum()))))
        tot_old = arr.sum(axis=0)
        allv, splitv = np.zeros(n), np.zeros(n)
        np.add.at(allv, cols_idx, tot_old[rows] * w)
        np.add.at(splitv, cols_idx, np.where(split, tot_old[rows] * w, 0))
        if dcol:
            g = pd.DataFrame({"pid": cols_idx, "d": dlab[rows], "v": tot_old[rows] * w})
            g = g[g["d"] != ""].groupby(["pid", "d"], as_index=False)["v"].sum().sort_values("v").drop_duplicates("pid", keep="last")
            lab = [""] * n
            width = 2 if office in ("USH", "SLDU") else 3
            for p, d in zip(g["pid"], g["d"]):
                lab[int(p)] = d.zfill(width) if d.isdigit() else d
            districts[office] = lab
        offices[office] = [[int(a), int(b), int(c)] for a, b, c in zip(*parts)]
        est[office] = [int(round(100 * s / a)) if a > 0 else 0 for s, a in zip(splitv, allv)]
        sums[office] = {"d": int(parts[0].sum()), "r": int(parts[1].sum()), "o": int(parts[2].sum()), "precincts_with_votes": int(((parts[0] + parts[1] + parts[2]) > 0).sum()),
                        "src": f"swdb-{year}", "basis": "slot" if office in ("PRES", "USS", "GOV", "USH") else "party", "matched": round(float(comp[has].sum() / max(1.0, comp.sum())), 4),
                        "est": round(float(splitv.sum() / allv.sum()), 4) if allv.sum() else 0.0}
        notes.append(f"{office} est {sums[office]['est']:.0%}")

    path = OUT / ST / f"{year}.json"
    (OUT / ST).mkdir(parents=True, exist_ok=True)
    doc = json.loads(path.read_text()) if path.exists() else {"year": year, "st": ST, "n": n, "first_pid": first, "offices": {}, "districts": {}, "basis": {}, "est": {}, "src": []}
    doc["offices"].update(offices)
    doc.setdefault("districts", {}).update(districts)
    doc.setdefault("est", {}).update(est)
    doc.setdefault("basis", {}).update({o: s["basis"] for o, s in sums.items()})
    doc["src"] = [f"swdb-{year}"] if set(doc["offices"]) <= set(offices) else sorted(set(doc.get("src", [])) | {f"swdb-{year}"})
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    line = update_cells(ST, year, n, sums, truth, suspect=NOTES.get(year))
    return f"CA {year}  srprec {nold}  rows {len(data)} (no shape {int((data['oid'] < 0).sum())})  {line}   [{', '.join(notes)}]"


def st_missing(truth: dict, year: int, office: str) -> bool:
    return ST not in truth.get(year, {}).get(office, {})


def main() -> None:
    truth = B.load_truth()
    for y in [int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022]:
        try:
            print(build(y, truth), flush=True)
        except Exception as e:
            import traceback
            print(f"CA {y}: FAILED {type(e).__name__}: {str(e)[:300]} @ {traceback.extract_tb(e.__traceback__)[-1].lineno}", flush=True)


if __name__ == "__main__":
    main()
