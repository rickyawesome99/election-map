#!/usr/bin/env python3
"""2020 Census counts for every 2024 precinct, for the profile panel on /precincts.

Source: 2020 Decennial Census Demographic and Housing Characteristics file (DHC), block level, from the
Census API (CENSUS_API_KEY in .env.local; two calls per county, cached in raw/census/{ST}.parquet).
Blocks are whole counts, so a precinct's figure is the plain sum of the blocks whose interior point
falls in it - the same block → precinct assignment the results builders use (raw/crosswalk). Nothing is
modelled; the only looseness is a block cut by a precinct line (it goes whole to one side) and the
Census Bureau's own privacy noise in single blocks.

Output: public/precincts/demographics/{ST}.json
  { "st", "n", "first_pid", "source", "fields": [...], "cols": { field: [one value per precinct, by pid order] } }
All fields are counts except "medage" (median age × 10, interpolated from the pooled age bands; -1 = nobody).

  python3 scripts/precincts/build_demographics.py DE         # one or more states
  python3 scripts/precincts/build_demographics.py            # every state
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio

sys.path.insert(0, str(Path(__file__).parent))
from build_results_vest import B_FIPS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW = PRE / "raw"
CACHE = RAW / "census"
OUT = ROOT / "public" / "precincts" / "demographics"
API = "https://api.census.gov/data/2020/dec/dhc"

# P12 sex by age: 23 bands per sex (male 003-025, female 027-049). Lower bound of each band, then the cap.
AGE_EDGES = [0, 5, 10, 15, 18, 20, 21, 22, 25, 30, 35, 40, 45, 50, 55, 60, 62, 65, 67, 70, 75, 80, 85, 100]
P12 = [f"P12_{i:03d}N" for i in range(2, 50)]
OTHER = ["P1_001N", "P5_003N", "P5_004N", "P5_005N", "P5_006N", "P5_007N", "P5_010N",
         "H3_001N", "H3_002N", "H4_002N", "H4_003N", "P15_001N", "P16_003N", "P16_008N", "P21_002N"]
FIELDS = ["pop", "vap", "white", "black", "hisp", "asian", "aian", "nhpi", "a18_34", "a35_49", "a50_64", "a65",
          "medage", "female", "hu", "occ", "own", "hhpop", "married", "alone", "kids"]


def api_key() -> str:
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        for line in (ROOT / ".env.local").read_text().splitlines():
            if line.startswith("CENSUS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not key:
        sys.exit("CENSUS_API_KEY not set")
    return key


def fetch(variables: list[str], state: str, county: str, key: str) -> pd.DataFrame:
    url = f"{API}?get={','.join(variables)}&for=block:*&in=state:{state}&in=county:{county}&key={key}"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                if r.status == 204:  # a county with no blocks in this table
                    return pd.DataFrame(columns=["geoid", *variables])
                rows = json.loads(r.read())
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError) as e:
            if attempt == 5:
                raise RuntimeError(f"{state}{county}: {e}") from None
            time.sleep(3 * (attempt + 1))
    df = pd.DataFrame(rows[1:], columns=rows[0])
    df["geoid"] = df["state"] + df["county"] + df["tract"] + df["block"]
    out = df[["geoid"]].copy()
    for v in variables:
        out[v] = pd.to_numeric(df[v], errors="coerce").fillna(0).astype("int32")
    return out


def census_blocks(st: str, counties: list[str], key: str) -> pd.DataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"{st}.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    fips = B_FIPS[st]
    # Each call takes ~15 s whatever its size, and the API serves many at once: run both tables of every county together.
    with ThreadPoolExecutor(32) as ex:
        age = ex.map(lambda c: fetch(P12, fips, c, key), counties)
        rest = ex.map(lambda c: fetch(OTHER, fips, c, key), counties)
        parts = [a.merge(b, on="geoid", how="outer").fillna(0) for a, b in zip(list(age), list(rest))]
    df = pd.concat(parts, ignore_index=True)
    for c in df.columns[1:]:
        df[c] = df[c].astype("int32")
    df.to_parquet(cache)
    return df


def median_age(bands: np.ndarray) -> np.ndarray:
    """Median age × 10 per row from 23 age-band counts, by linear interpolation inside the median band."""
    total = bands.sum(axis=1)
    cum = np.cumsum(bands, axis=1)
    half = total / 2.0
    k = (cum < half[:, None]).sum(axis=1).clip(max=bands.shape[1] - 1)
    rows = np.arange(len(bands))
    below = np.where(k > 0, cum[rows, np.maximum(k - 1, 0)], 0)
    inside = bands[rows, k]
    lo = np.array(AGE_EDGES)[k]
    width = np.array(AGE_EDGES)[k + 1] - lo
    with np.errstate(divide="ignore", invalid="ignore"):
        med = lo + np.where(inside > 0, (half - below) / inside, 0) * width
    return np.where(total > 0, np.round(med * 10), -1).astype(int)


def build_state(st: str, key: str) -> str:
    fips = B_FIPS[st]
    z = RAW / "blocks" / f"tl_2020_{fips}_tabblock20.zip"
    xw = RAW / "crosswalk" / f"{st}_block_pid.parquet"
    meta_path = PRE / "anchors" / f"{st}.json"
    if not (z.exists() and xw.exists() and meta_path.exists()):
        return f"{st}: inputs missing"
    blocks = pyogrio.read_dataframe(f"/vsizip/{z}", read_geometry=False, columns=["GEOID20", "POP20"])
    pid = pd.read_parquet(xw)["pid"].to_numpy()
    if len(pid) != len(blocks):
        return f"{st}: crosswalk has {len(pid)} rows, block file {len(blocks)}"
    counties = sorted(blocks["GEOID20"].str[2:5].unique())
    cen = census_blocks(st, counties, key).set_index("geoid").reindex(blocks["GEOID20"]).fillna(0).astype("int64")
    # The block file and the DHC must describe the same people.
    tiger_pop = pd.to_numeric(blocks["POP20"], errors="coerce").fillna(0).astype(int).sum()
    if int(cen["P1_001N"].sum()) != int(tiger_pop):
        return f"{st}: DHC population {int(cen['P1_001N'].sum()):,} ≠ block file {int(tiger_pop):,}"

    male = cen[[f"P12_{i:03d}N" for i in range(3, 26)]].to_numpy()
    female = cen[[f"P12_{i:03d}N" for i in range(27, 50)]].to_numpy()
    age = male + female  # 23 bands
    edge = {a: n for n, a in enumerate(AGE_EDGES)}
    band = lambda lo, hi: age[:, edge[lo]:edge[hi]].sum(axis=1)  # noqa: E731
    b = pd.DataFrame({
        "pid": pid,
        "pop": cen["P1_001N"].to_numpy(),
        "vap": band(18, 100),
        "white": cen["P5_003N"].to_numpy(), "black": cen["P5_004N"].to_numpy(), "hisp": cen["P5_010N"].to_numpy(),
        "asian": cen["P5_006N"].to_numpy(), "aian": cen["P5_005N"].to_numpy(), "nhpi": cen["P5_007N"].to_numpy(),
        "a18_34": band(18, 35), "a35_49": band(35, 50), "a50_64": band(50, 65), "a65": band(65, 100),
        "female": cen["P12_026N"].to_numpy(),
        "hu": cen["H3_001N"].to_numpy(), "occ": cen["H3_002N"].to_numpy(),
        "own": (cen["H4_002N"] + cen["H4_003N"]).to_numpy(),
        "hhpop": cen["P15_001N"].to_numpy(), "married": cen["P16_003N"].to_numpy(),
        "alone": cen["P16_008N"].to_numpy(), "kids": cen["P21_002N"].to_numpy(),
    })
    for n in range(age.shape[1]):
        b[f"_age{n}"] = age[:, n]

    meta = json.loads(meta_path.read_text())
    pids = sorted(int(k) for k in meta["precincts"])
    first, n = pids[0], len(pids)
    g = b.groupby("pid").sum().reindex(range(first, first + n), fill_value=0)
    g["medage"] = median_age(g[[f"_age{k}" for k in range(age.shape[1])]].to_numpy())
    assert int(g["pop"].sum()) == int(tiger_pop), f"{st}: blocks fell outside the pid range"

    OUT.mkdir(parents=True, exist_ok=True)
    doc = {"st": st, "n": n, "first_pid": first, "source": "2020 Census (DHC), block counts summed to 2024 precincts",
           "fields": FIELDS, "cols": {f: [int(v) for v in g[f].to_numpy()] for f in FIELDS}}
    (OUT / f"{st}.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    empty = int((g["pop"] == 0).sum())
    return f"{st}: {n:,} precincts, population {int(tiger_pop):,}, {empty:,} with nobody counted"


def main() -> None:
    key = api_key()
    states = [a.upper() for a in sys.argv[1:]] or sorted(p.stem for p in (PRE / "anchors").glob("*.json"))
    for st in states:
        t = time.time()
        try:
            print(build_state(st, key), f"({time.time() - t:.0f}s)", flush=True)
        except Exception as e:  # keep going: one state's failed download should not stop the rest
            print(f"{st}: FAILED {e}", flush=True)
    total = sum(f.stat().st_size for f in OUT.glob("*.json")) if OUT.exists() else 0
    print(f"demographics files {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
