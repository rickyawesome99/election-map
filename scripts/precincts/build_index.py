#!/usr/bin/env python3
"""Small lookup files the precinct page loads next to the tiles.

  public/precincts/index/{ST}.json   { first, names: [...], county: [index into counties], counties: [[fips, name], …] }
                                     positional by pid (pid = first + i), so a tile feature id resolves to a name.
  data/precincts/states.json         { ST: { n, first, bbox: [w, s, e, n] } } for the page shell (bbox from the tile archive).

  python3 scripts/precincts/build_index.py
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANCHORS = ROOT / "data-entry" / "precincts" / "anchors"
TILES = ROOT / "public" / "precincts" / "tiles"
OUT = ROOT / "public" / "precincts" / "index"
STATES = ROOT / "data" / "precincts" / "states.json"
# Archives whose bounds wrap the antimeridian get a hand-set view box.
BBOX_OVERRIDE = {"AK": [-170.0, 51.0, -129.9, 71.5]}


def tile_bbox(path: Path) -> list[float]:
    with open(path, "rb") as f:
        h = f.read(127)
    w, s, e, n = struct.unpack("<4i", h[102:118])
    return [round(v / 1e7, 4) for v in (w, s, e, n)]


def main() -> None:
    topo = json.loads((ROOT / "public" / "us-counties.json").read_text())
    county_name = {str(g["id"]).zfill(5): g["properties"]["name"] for g in next(iter(topo["objects"].values()))["geometries"]}
    OUT.mkdir(parents=True, exist_ok=True)
    states = {}
    for p in sorted(ANCHORS.glob("*.json")):
        meta = json.loads(p.read_text())
        st = meta["state"]
        pids = sorted(int(k) for k in meta["precincts"])
        assert pids[-1] - pids[0] + 1 == len(pids), f"{st}: pids are not consecutive"
        fips = sorted({meta["precincts"][str(k)]["county"] for k in pids})
        pos = {f: i for i, f in enumerate(fips)}
        names = []
        for k in pids:
            a = meta["precincts"][str(k)]
            nm = a["name"]
            # RDH ids read "County-:-Precinct"; KS names read "County-Precinct". Keep the precinct part.
            if "-:-" in nm:
                nm = nm.split("-:-", 1)[1]
            names.append(nm.strip())
        doc = {"first": pids[0], "names": names, "county": [pos[meta["precincts"][str(k)]["county"]] for k in pids], "counties": [[f, county_name.get(f, f)] for f in fips]}
        (OUT / f"{st}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        tile = TILES / f"{st}.pmtiles"
        states[st] = {"n": len(pids), "first": pids[0], "bbox": BBOX_OVERRIDE.get(st) or (tile_bbox(tile) if tile.exists() else None)}
    STATES.write_text(json.dumps(states, separators=(",", ":"), sort_keys=True) + "\n")
    total = sum(f.stat().st_size for f in OUT.glob("*.json"))
    print(f"{len(states)} states, index files {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
