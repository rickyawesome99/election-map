#!/usr/bin/env python3
"""Per-zoom tile counts and sizes of a PMTiles v3 archive (no dependencies).

  python3 scripts/precincts/pmstat.py public/precincts/tiles/IA.pmtiles [more.pmtiles …]
"""
from __future__ import annotations

import collections
import gzip
import struct
import sys


def _varint(b: bytes, i: int) -> tuple[int, int]:
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if c < 0x80:
            return r, i
        s += 7


def _parse_dir(data: bytes) -> list[tuple[int, int, int, int]]:
    i = 0
    n, i = _varint(data, i)
    ids: list[int] = []
    runs: list[int] = []
    lens: list[int] = []
    offs: list[int] = []
    last = 0
    for _ in range(n):
        v, i = _varint(data, i)
        last += v
        ids.append(last)
    for _ in range(n):
        v, i = _varint(data, i)
        runs.append(v)
    for _ in range(n):
        v, i = _varint(data, i)
        lens.append(v)
    for k in range(n):
        v, i = _varint(data, i)
        offs.append(offs[k - 1] + lens[k - 1] if (v == 0 and k > 0) else v - 1)
    return list(zip(ids, runs, lens, offs))


def _zoom_of(tile_id: int) -> int:
    z = acc = 0
    while True:
        n = 1 << (2 * z)
        if acc + n > tile_id:
            return z
        acc += n
        z += 1


def _decomp(b: bytes, c: int) -> bytes:
    return gzip.decompress(b) if c == 2 else b


def report(path: str) -> None:
    with open(path, "rb") as f:
        h = f.read(127)
        if h[:7] != b"PMTiles":
            print(f"{path}: not a PMTiles file")
            return
        (root_off, root_len, _meta_off, _meta_len, leaf_off, _leaf_len, data_off, data_len,
         n_addr, _n_entries, n_contents, _clustered, ic, _tc, _tt, minz, maxz) = struct.unpack("<11Q6B", h[8:8 + 88 + 6])
        print(f"{path}: {(data_off + data_len) / 1e6:.1f} MB, addressed {n_addr}, contents {n_contents}, z{minz}-{maxz}")
        f.seek(root_off)
        root = _parse_dir(_decomp(f.read(root_len), ic))
        entries: list[tuple[int, int, int, int]] = []
        for tid, run, ln, off in root:
            if run == 0:  # leaf directory
                f.seek(leaf_off + off)
                entries += _parse_dir(_decomp(f.read(ln), ic))
            else:
                entries.append((tid, run, ln, off))
    byz: dict[int, list[int]] = collections.defaultdict(lambda: [0, 0, 0])
    for tid, run, ln, _off in entries:
        z = _zoom_of(tid)
        byz[z][0] += run
        byz[z][1] += ln
        byz[z][2] = max(byz[z][2], ln)
    for z in sorted(byz):
        c, tot, mx = byz[z]
        print(f"  z{z:2d} tiles {c:7d} total {tot / 1e6:7.2f} MB avg {tot / c / 1e3:6.1f} KB max {mx / 1e3:6.1f} KB")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        report(p)
