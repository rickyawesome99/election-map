#!/usr/bin/env python3
"""
Per-district redistricting history for every state legislative chamber: for each pair of
consecutive map eras, what each NEW district is made of in terms of the OLD districts, which
counties it gained and lost, and how its 2020 presidential margin moved. The same overlay also
yields the population-weighted old-to-new crosswalk the 2026 projection uses to relocate a seat's
pre-redraw results onto today's lines (decision 5 of the atlas plan).

Method. Both eras' polygons are intersected in EPSG:5070; each intersection cell gets its 2020
population by area-apportioning Dave's Redistricting 2020-VTD T_20_CENS counts onto it (the same
VTD file and rule as build-state-leg-pres-by-era.py), so a new district's composition is measured
in PEOPLE, not land - an equal-population map makes area shares meaningless for urban districts.
County membership comes from public/state-counties/{ST}.json the same way. The presidential
margins on each era's lines are read from data-entry/state-leg-pres-by-era/{ST}.json (Phase 1),
not recomputed.

Text. Geography first, then the lean shift as a number, never an adjective - the rule the House
redistricting descriptions settled on. Generated, not hand-written: about 7,000 districts across
up to three transitions each.

Era keys match data/stateLegHistoricalMaps.ts: a superseded era is its boundary-file vintage
("2020", "2022"), the map in force is "current". Only transitions that the 2016-2025 record
actually crosses are emitted (an era with no elections in range still has lines, and the first
era has no predecessor).

Usage:
  python3 scripts/build-state-leg-redistricting.py OH [--chambers house] [--dry-run]
Writes data-entry/state-leg-redistricting/{ST}.json; scripts/build-state-leg-redistricting.mjs
builds the TS module.
"""

import argparse
import datetime as dt
import importlib.util
import json
import os
import subprocess
from collections import defaultdict

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-redistricting")
PRES_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres-by-era")
COUNTY_DIR = os.path.join(ROOT, "public", "state-counties")
MIN_SHARE = 0.5   # % of a district's population below which a contributor / county is dropped

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("pbe", os.path.join(_here, "build-state-leg-pres-by-era.py"))
pbe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pbe)
fg, dra = pbe.fg, pbe.dra


def load_counties(abbr, cache_dir):
    path = os.path.join(COUNTY_DIR, f"{abbr}.json")
    fc = json.load(open(pbe.topo_to_geo(path, cache_dir)))
    feats = [f for f in fc["features"] if f.get("geometry")]
    gdf = gpd.GeoDataFrame([{"county": f["properties"]["name"]} for f in feats],
                           geometry=[shape(f["geometry"]).buffer(0) for f in feats], crs="EPSG:4326")
    return gdf.to_crs(epsg=5070)


def apportion_pop(cells, vtds):
    """Population of each cell: VTD population split by the share of the VTD's area in the cell."""
    v = vtds[["vtd", "pop", "geometry"]].to_crs(epsg=5070).copy()
    v["v_area"] = v.geometry.area
    ov = gpd.overlay(v, cells, how="intersection", keep_geom_type=False)
    ov["frac"] = ov.geometry.area / ov["v_area"]
    ov = ov[ov["frac"] > 0.002].copy()
    ov["frac"] = ov["frac"] / ov.groupby("vtd")["frac"].transform("sum")
    ov["pop"] = ov["pop"] * ov["frac"]
    return ov.groupby("cell")["pop"].sum()


def district_label(abbr, chamber, code):
    import re
    if re.match(r"^\d+[A-Za-z]?$", code):
        return f"{'HD' if chamber == 'house' else 'SD'}-{code}"
    return code


def compose(abbr, chamber, new_code, rec, from_label, to_label):
    """One or two sentences, geography first, then the presidential shift as a number."""
    lab = lambda c: district_label(abbr, chamber, c)
    same = next((c for c in rec["contributors"] if c["key"] == new_code), None)
    others = [c for c in rec["contributors"] if c["key"] != new_code]
    parts = []
    unchanged = bool(same and same["popPct"] >= 99.5 and not others)
    if unchanged:
        parts.append(f"Lines unchanged from the {from_label} map.")
    elif same and same["popPct"] >= 50:
        s = f"Kept {same['popPct']:.0f}% of its population from the {from_label} {lab(new_code)}"
        if others:
            s += "; gained the rest from " + ", ".join(f"the old {lab(c['key'])} ({c['popPct']:.0f}%)" for c in others[:3])
            if len(others) > 3:
                s += f" and {len(others) - 3} more"
        parts.append(s + ".")
    else:
        kept = f"only {same['popPct']:.0f}%" if same and same["popPct"] >= 0.5 else "none"
        s = f"A new footprint: {kept} of its population was in the {from_label} {lab(new_code)}; it draws from " + \
            ", ".join(f"the old {lab(c['key'])} ({c['popPct']:.0f}%)" for c in others[:3])
        if len(others) > 3:
            s += f" and {len(others) - 3} more"
        parts.append(s + ".")
    gained = [c for c in rec["countiesGained"]]
    lost = [c for c in rec["countiesLost"]]
    if gained or lost:
        bits = []
        if gained:
            bits.append("gained " + ", ".join(f"{c['county']} ({c['popPct']:.0f}%)" for c in gained[:3]) + (f" and {len(gained) - 3} more" if len(gained) > 3 else ""))
        if lost:
            bits.append("lost " + ", ".join(c["county"] for c in lost[:4]) + (f" and {len(lost) - 4} more" if len(lost) > 4 else ""))
        parts.append("Counties: " + "; ".join(bits) + ".")
    else:
        names = [c["county"] for c in rec["counties"]]
        if names:
            if len(names) == 1:
                parts.append(f"Entirely in {names[0]} County.")
            else:
                parts.append("Spans " + ", ".join(names[:4]) + (f" and {len(names) - 4} more counties" if len(names) > 4 else " counties") + ".")
    if not unchanged and rec.get("pres2020Old") is not None and rec.get("pres2020New") is not None:
        fmt = lambda m: ("R+" if m > 0 else "D+" if m < 0 else "Even ") + (f"{abs(m):.1f}" if m != 0 else "")
        parts.append(f"2020 presidential margin {fmt(rec['pres2020Old'])} on the {from_label} lines → {fmt(rec['pres2020New'])} on the {to_label} lines.")
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("abbr")
    ap.add_argument("--chambers", default="house,senate")
    ap.add_argument("--geojson")
    ap.add_argument("--cache-dir", default=pbe.DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    abbr = args.abbr.upper()
    stfp = fg.ABBR_TO_FIPS[abbr]
    chambers = ["senate"] if abbr == "NE" else [c.strip() for c in args.chambers.split(",") if c.strip()]

    path = args.geojson or dra.download_geojson(abbr, args.cache_dir)
    vtds, _years = pbe.load_dra(path, {})
    counties = load_counties(abbr, args.cache_dir)
    index = pbe.load_hist_index()
    pres = json.load(open(os.path.join(PRES_DIR, f"{abbr}.json"))) if os.path.exists(os.path.join(PRES_DIR, f"{abbr}.json")) else {}

    result = {"meta": {"built": dt.date.today().isoformat(), "minSharePct": MIN_SHARE}}
    for chamber in chambers:
        era_years = pbe.eras_for(abbr, chamber, index)
        eras = sorted(era_years) + ["current"]
        if len(eras) < 2:
            print(f"{abbr} {chamber}: one era only, nothing to compare")
            continue
        def label_of(e):
            if e == "current":
                return "current"
            ys = era_years.get(e)
            if not ys:
                return e
            return str(ys[0]) if len(ys) == 1 else f"{ys[0]}–{ys[-1]}"
        gdfs = {}
        for e in eras:
            g = pbe.load_era_districts(abbr, chamber, e, stfp, args.cache_dir)
            if g is None or g.empty:
                print(f"  {abbr} {chamber} {e}: no boundary file")
                continue
            gdfs[e] = g.to_crs(epsg=5070)
        chamber_out = {}
        for old, new in zip(eras, eras[1:]):
            if old not in gdfs or new not in gdfs:
                continue
            o = gdfs[old].rename(columns={"CODE": "old"})
            n = gdfs[new].rename(columns={"CODE": "new"})
            cells = gpd.overlay(o, n, how="intersection", keep_geom_type=False)
            cells = cells[cells.geometry.area > 1].reset_index(drop=True)
            cells["cell"] = cells.index
            cells["area"] = cells.geometry.area
            cells["pop"] = apportion_pop(cells[["cell", "geometry"]], vtds).reindex(cells["cell"]).fillna(0).values
            # county composition of each era's districts, population-weighted
            def county_mix(districts, key):
                cc = gpd.overlay(districts, counties, how="intersection", keep_geom_type=False)
                cc = cc[cc.geometry.area > 1].reset_index(drop=True)
                cc["cell"] = cc.index
                cc["pop"] = apportion_pop(cc[["cell", "geometry"]], vtds).reindex(cc["cell"]).fillna(0).values
                tot = cc.groupby(key)["pop"].transform("sum")
                cc["pct"] = 100 * cc["pop"] / tot.replace(0, pd.NA)
                mix = defaultdict(list)
                for _, r in cc.iterrows():
                    if pd.notna(r["pct"]) and r["pct"] >= MIN_SHARE:
                        mix[r[key]].append({"county": r["county"], "popPct": round(float(r["pct"]), 1)})
                return {k: sorted(v, key=lambda x: -x["popPct"]) for k, v in mix.items()}
            old_mix = county_mix(o, "old")
            new_mix = county_mix(n, "new")
            pres_old = (pres.get(chamber) or {}).get(old, {})
            pres_new = (pres.get(chamber) or {}).get(new, {})
            new_pop = cells.groupby("new")["pop"].sum()
            new_area = cells.groupby("new")["area"].sum()
            out = {}
            for code in n["new"]:
                sub = cells[cells["new"] == code]
                tp, ta = float(new_pop.get(code, 0)), float(new_area.get(code, 0))
                contribs = []
                for okey, grp in sub.groupby("old"):
                    pp = 100 * grp["pop"].sum() / tp if tp else 0
                    ap_ = 100 * grp["area"].sum() / ta if ta else 0
                    if pp >= MIN_SHARE or (okey == code and ap_ >= MIN_SHARE):
                        contribs.append({"key": okey, "popPct": round(float(pp), 1), "areaPct": round(float(ap_), 1)})
                contribs.sort(key=lambda c: -c["popPct"])
                same = next((c for c in contribs if c["key"] == code), None)
                nm, om = new_mix.get(code, []), old_mix.get(code, [])
                old_names = {c["county"] for c in om}
                new_names = {c["county"] for c in nm}
                rec = {
                    "fromEra": old, "toEra": new,
                    "retainedPopPct": same["popPct"] if same else 0.0,
                    "retainedAreaPct": same["areaPct"] if same else 0.0,
                    "pop2020": int(round(tp)),
                    "contributors": contribs,
                    "counties": nm,
                    # Slivers under 2% of the population are real but not worth a sentence.
                    "countiesGained": [c for c in nm if c["county"] not in old_names and c["popPct"] >= 2],
                    "countiesLost": [c for c in om if c["county"] not in new_names and c["popPct"] >= 2],
                    "pres2020Old": (pres_old.get(code, {}).get("2020") or {}).get("margin") if code in pres_old else None,
                    "pres2020New": (pres_new.get(code, {}).get("2020") or {}).get("margin"),
                }
                rec["text"] = compose(abbr, chamber, code, rec, label_of(old), label_of(new))
                out[code] = rec
            chamber_out[new] = out
            unchanged = sum(1 for r in out.values() if r["retainedPopPct"] >= 99.5 and len(r["contributors"]) == 1)
            print(f"  {abbr} {chamber} {old} → {new}: {len(out)} districts, {unchanged} unchanged, "
                  f"median retained pop {sorted(r['retainedPopPct'] for r in out.values())[len(out)//2]:.0f}%")
        result[chamber] = chamber_out

    if args.dry_run:
        for chamber in chambers:
            for new, out in (result.get(chamber) or {}).items():
                for code in list(out)[:2]:
                    print(f"    {chamber} {new} {code}: {out[code]['text']}")
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"{abbr}.json"), "w") as f:
        json.dump(result, f, indent=1, sort_keys=True)
    print(f"wrote {OUT_DIR}/{abbr}.json")


if __name__ == "__main__":
    main()
