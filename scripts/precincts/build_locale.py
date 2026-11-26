#!/usr/bin/env python3
"""Urban / suburban / exurban / rural class for every 2024 precinct, for the panel on /precincts.

Inputs (all on disk): the TIGER 2020 block attributes (raw/locale/{ST}.parquet, cache_block_attrs.py) and
the block → precinct crosswalk (raw/crosswalk). Each block goes whole to one precinct, as everywhere else.

Measures, per precinct:
  density  residents' neighborhood housing density: each block takes its TRACT's housing units
           per square mile of land, averaged over the precinct's blocks weighted by population. A park,
           airport or farm field inside the precinct does not dilute it; where the people live decides.
  core     share of residents in a Census 2020 urban area of at least METRO_MIN people (an urban area
           is a contiguous built-up area, drawn by the Census Bureau from housing density).
  dist     miles from the precinct's population centre to the nearest populated block of such an area,
           by size tier.

Class:
  Urban     core ≥ 0.5 and density ≥ URBAN_DENSITY and ≥ URBAN_REL × its urban area's median density
            (the median resident's tract density). Relative as well as absolute, so a metro's dense core
            counts as urban and a dense suburb of a far denser one (Nassau beside New York) does not.
  Suburban  core ≥ 0.5, density below that
  Exurban   outside those areas but within the commuting radius of one (EXURB_RADIUS by area size)
  Rural     everything else (small towns included)
A precinct with nobody living in it takes its class from land area instead of population.

Output: public/precincts/locale/{ST}.json  { st, n, first_pid, labels, rules, cls: [0..3 | -1], dens: [...], dist: [...] }
  cls 0 urban, 1 suburban, 2 exurban, 3 rural, -1 no blocks; dens hu/sq mi (int); dist miles × 10 (int) to the nearest metro urban area, 0 inside one.

  python3 scripts/precincts/build_locale.py [ST ...]
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW = PRE / "raw"
OUT = ROOT / "public" / "precincts" / "locale"

SQMI = 2_589_988.11
METRO_MIN = 50_000            # an urban area this size anchors suburbs and exurbs
URBAN_DENSITY = 2_000         # housing units / sq mi (CityLab's urban cut is ~2,200 households / sq mi by tract)
URBAN_REL = 1.5               # × the urban area's median resident's density
# Commuting radius (miles beyond the area's edge) by urban-area population: bigger metros reach further.
EXURB_RADIUS = [(1_000_000, 20.0), (250_000, 12.0), (METRO_MIN, 6.0)]
LABELS = ["Urban", "Suburban", "Exurban", "Rural"]


def xy(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Miles on a plane: fine at commuting distances."""
    r = 3958.8
    la = np.radians(lat)
    return np.column_stack([r * np.radians(lon) * np.cos(la), r * la])


def load_all() -> dict[str, pd.DataFrame]:
    """Every state's blocks, each with its tract's housing density."""
    out = {}
    for f in sorted((RAW / "locale").glob("*.parquet")):
        b = pd.read_parquet(f)
        tract = b["geoid"].str[:11]
        g = b.groupby(tract)[["hu", "aland"]].sum()
        b["dens"] = (g["hu"] / np.maximum(g["aland"], 1) * SQMI).reindex(tract).to_numpy()
        out[f.stem] = b
    return out


def weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    o = np.argsort(values)
    c = np.cumsum(weights[o])
    return float(values[o][np.searchsorted(c, c[-1] / 2)])


def build(states: list[str]) -> None:
    blocks = load_all()
    # Urban-area sizes cross state lines: sum nationally.
    allb = pd.concat([b[["uace", "pop", "lat", "lon", "dens"]] for b in blocks.values()], ignore_index=True)
    ua_pop = allb[allb["uace"] != ""].groupby("uace")["pop"].sum()
    in_ua = allb[(allb["uace"] != "") & (allb["pop"] > 0)]
    ua_median = in_ua.groupby("uace").apply(lambda x: weighted_median(x["dens"].to_numpy(), x["pop"].to_numpy().astype(float)))
    trees = []
    for lo, radius in EXURB_RADIUS:
        hi = next((l for l, _ in EXURB_RADIUS if l > lo), None)
        ids = ua_pop[(ua_pop >= lo) & ((ua_pop < hi) if hi else True)].index
        pts = allb[allb["uace"].isin(ids) & (allb["pop"] > 0)]
        trees.append((radius, cKDTree(xy(pts["lat"].to_numpy(), pts["lon"].to_numpy()))))
    big = set(ua_pop[ua_pop >= METRO_MIN].index)
    del allb

    OUT.mkdir(parents=True, exist_ok=True)
    for st in states:
        b = blocks[st].copy()
        b["pid"] = pd.read_parquet(RAW / "crosswalk" / f"{st}_block_pid.parquet")["pid"].to_numpy()
        b["core"] = b["uace"].isin(big).astype(float)
        # Each block's urban-area median (0 outside a metro area), averaged like the density.
        b["uamed"] = np.where(b["core"] > 0, ua_median.reindex(b["uace"]).fillna(0).to_numpy(), 0.0)
        # Weight: residents; a precinct with none falls back to land area.
        pop_tot = b.groupby("pid")["pop"].transform("sum")
        b["w"] = np.where(pop_tot > 0, b["pop"], b["aland"].clip(lower=1)).astype(float)
        p = xy(b["lat"].to_numpy(), b["lon"].to_numpy())
        b["x"], b["y"] = p[:, 0], p[:, 1]
        for c in ["dens", "core", "uamed", "x", "y"]:
            b[f"w_{c}"] = b[c] * b["w"]
        agg = b.groupby("pid")[["w", "w_dens", "w_core", "w_uamed", "w_x", "w_y"]].sum()
        dens = agg["w_dens"] / agg["w"]
        core = agg["w_core"] / agg["w"]
        uamed = agg["w_uamed"] / np.maximum(agg["w_core"], 1e-9)  # over the blocks inside a metro area
        cen = np.column_stack([agg["w_x"] / agg["w"], agg["w_y"] / agg["w"]])
        dist = np.full(len(agg), np.inf)
        exurb = np.zeros(len(agg), bool)
        for radius, tree in trees:
            d, _ = tree.query(cen)
            dist = np.minimum(dist, d)
            exurb |= d <= radius
        urban = (dens >= URBAN_DENSITY) & (dens >= URBAN_REL * uamed)
        cls = np.where(core >= 0.5, np.where(urban, 0, 1), np.where(exurb, 2, 3))

        meta = json.loads((PRE / "anchors" / f"{st}.json").read_text())
        pids = sorted(int(k) for k in meta["precincts"])
        first, n = pids[0], len(pids)
        idx = pd.RangeIndex(first, first + n)
        s_cls = pd.Series(cls, index=agg.index).reindex(idx, fill_value=-1).astype(int)
        s_dens = dens.reindex(idx, fill_value=0).round().astype(int)
        s_dist = pd.Series(np.round(np.where(core >= 0.5, 0, dist) * 10), index=agg.index).reindex(idx, fill_value=0).astype(int)
        rules = {"metroMin": METRO_MIN, "urbanDensity": URBAN_DENSITY, "urbanRel": URBAN_REL, "radius": [[lo, r] for lo, r in EXURB_RADIUS]}
        doc = {"st": st, "n": n, "first_pid": first, "labels": LABELS, "rules": rules,
               "cls": s_cls.tolist(), "dens": s_dens.tolist(), "dist": s_dist.tolist()}
        (OUT / f"{st}.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
        pop = b.groupby("pid")["pop"].sum().reindex(idx, fill_value=0)
        shares = [f"{LABELS[k]} {pop[s_cls == k].sum() / max(pop.sum(), 1):.0%}" for k in range(4)]
        print(f"{st}: {n:,} precincts · population " + ", ".join(shares), flush=True)


if __name__ == "__main__":
    states = [a.upper() for a in sys.argv[1:]] or sorted(p.stem for p in (PRE / "anchors").glob("*.json"))
    build(states)
