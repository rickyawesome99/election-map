#!/usr/bin/env python3
"""Build one PMTiles archive per state from the anchor precinct layers.

Phase 0 recipe (measured 2026-11-14 on 163,925 precincts): per-state archives at z6–z12 with a
120 KB tile cap come to ~150 MB in total, no state over 12 MB, no tile over ~115 KB. Results are
never baked into tiles; only the precinct id and state ride along, so the archives are rebuilt
only when geometry changes.

Usage:
  python3 scripts/precincts/build_tiles.py                # every state with an anchor file
  python3 scripts/precincts/build_tiles.py IA TX          # selected states
  python3 scripts/precincts/build_tiles.py --stats        # print per-zoom tile sizes after building

Input:  data-entry/precincts/anchor/{ST}.geojsonl   (one feature per precinct; properties pid, st, …)
Output: public/precincts/tiles/{ST}.pmtiles          (layer name "precincts", feature id = pid)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANCHOR_DIR = ROOT / "data-entry" / "precincts" / "anchor"
OUT_DIR = ROOT / "public" / "precincts" / "tiles"

LAYER = "precincts"
# z4 so a whole large state (TX, CA, MT, AK fit at z4–5 on a laptop, lower on a phone) renders from its
# own archive; the 120 KB cap coalesces the smallest polygons at those zooms, where they are sub-pixel.
MIN_ZOOM, MAX_ZOOM = 4, 12
MAX_TILE_BYTES = 120_000

STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
    "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
    "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]


def tippecanoe() -> str:
    for cand in (shutil.which("tippecanoe"), os.path.expanduser("~/.local/bin/tippecanoe")):
        if cand and os.path.exists(cand):
            return cand
    sys.exit("tippecanoe not found: build it from https://github.com/felt/tippecanoe (make -j8) and put it on PATH or in ~/.local/bin")


def build(state: str, verbose: bool) -> Path | None:
    src = ANCHOR_DIR / f"{state}.geojsonl"
    if not src.exists():
        return None
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{state}.pmtiles"
    cmd = [
        tippecanoe(), "-o", str(out), "-l", LAYER,
        "-Z", str(MIN_ZOOM), "-z", str(MAX_ZOOM),
        "--use-attribute-for-id=pid",       # integer pid becomes the vector-tile feature id (feature-state key)
        "-y", "pid", "-y", "st",            # keep only these attributes
        "-pn",                               # no simplification of shared nodes (replaces --detect-shared-borders)
        "--coalesce-smallest-as-needed",     # merge the smallest polygons when a tile overflows
        "--extend-zooms-if-still-dropping",
        "-S", "4",
        "-M", str(MAX_TILE_BYTES),
        "--read-parallel", "--force", "-q",
        str(src),
    ]
    if verbose:
        print(" ".join(cmd))
    subprocess.run(cmd, check=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*", help="state postal codes; default = every state with an anchor file")
    ap.add_argument("--stats", action="store_true", help="print per-zoom tile statistics after building")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    wanted = [s.upper() for s in args.states] or STATES
    built: list[Path] = []
    total = 0
    for st in wanted:
        out = build(st, args.verbose)
        if out is None:
            print(f"{st}: no anchor file at {ANCHOR_DIR / (st + '.geojsonl')}, skipped")
            continue
        size = out.stat().st_size
        total += size
        built.append(out)
        print(f"{st}: {size / 1e6:5.1f} MB → {out.relative_to(ROOT)}")
    print(f"{len(built)} archives, {total / 1e6:.1f} MB")

    manifest = {p.stem: p.stat().st_size for p in sorted(OUT_DIR.glob("*.pmtiles"))}
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=0, sort_keys=True) + "\n")

    if args.stats and built:
        sys.path.insert(0, str(Path(__file__).parent))
        from pmstat import report  # noqa: E402
        for p in built:
            report(str(p))


if __name__ == "__main__":
    main()
