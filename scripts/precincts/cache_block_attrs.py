#!/usr/bin/env python3
"""Compact per-state copies of the TIGER 2020 block attributes the locale build needs (no geometry):
raw/locale/{ST}.parquet with geoid, pop, hu, aland, ur, uace, lat, lon, row-aligned with raw/crosswalk.

  python3 scripts/precincts/cache_block_attrs.py [ST ...]
"""
from __future__ import annotations
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import pandas as pd
import pyogrio

sys.path.insert(0, str(Path(__file__).parent))
from build_results_vest import B_FIPS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
OUT = RAW / "locale"
COLS = ["GEOID20", "UR20", "UACE20", "ALAND20", "INTPTLAT20", "INTPTLON20", "HOUSING20", "POP20"]


def one(st: str) -> str:
    out = OUT / f"{st}.parquet"
    if out.exists():
        return f"{st}: cached"
    z = RAW / "blocks" / f"tl_2020_{B_FIPS[st]}_tabblock20.zip"
    df = pyogrio.read_dataframe(f"/vsizip/{z}", read_geometry=False, columns=COLS)
    pd.DataFrame({
        "geoid": df["GEOID20"].astype(str),
        "pop": pd.to_numeric(df["POP20"]).astype("int32"),
        "hu": pd.to_numeric(df["HOUSING20"]).astype("int32"),
        "aland": pd.to_numeric(df["ALAND20"]).astype("int64"),
        "ur": df["UR20"].fillna("").astype(str),
        "uace": df["UACE20"].fillna("").astype(str),
        "lat": pd.to_numeric(df["INTPTLAT20"]).astype("float64"),
        "lon": pd.to_numeric(df["INTPTLON20"]).astype("float64"),
    }).to_parquet(out, index=False)
    return f"{st}: {len(df):,} blocks"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    states = [a.upper() for a in sys.argv[1:]] or sorted(B_FIPS)
    with ProcessPoolExecutor(6) as ex:
        for msg in ex.map(one, states):
            print(msg, flush=True)
