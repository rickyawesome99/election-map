#!/usr/bin/env python3
"""Rebuild the offices build_results_medsl.py owns (SLDU, SLDL, USH, and the statewide races of years without
shapes) for every past precinct year, with the inputs each was built from, as recorded in the coverage grid's
`src` (data/precincts/coverage.json):

  medsl-Y[+vest-Y]                          build_results_medsl.py Y ST --only OFFICE
  medsl-Y+openelections-Y… / +ny-boe / nm-sos   … --variant mix --only OFFICE
  openelections-Y[+vest-Y]                  … --variant oe --only OFFICE  (unless SRC names it: MS, KY, NJ 2017)
  nj-doe / la-sos / va-elections            … --only OFFICE  (the builder's SRC table)
  rdh, official, swdb, ak-cvr, vest-Y, rdh+medsl   skipped: other builders own them

Used after a change to build_results_medsl.py that moves votes but not totals (2026-11-26: a seat's
unmatched votes are spread only inside the seat as drawn that year, legislature and U.S. House; each side's
votes spread by where that side votes). Years run in parallel (the grid is
file-locked; each year writes its own results files).

  python3 scripts/precincts/rebuild_legislature.py --plan
  python3 scripts/precincts/rebuild_legislature.py [YEAR …]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COV = ROOT / "data" / "precincts" / "coverage.json"
BUILDER = ROOT / "scripts" / "precincts" / "build_results_medsl.py"
SRC_OE = {("MS", 2019), ("MS", 2023), ("KY", 2023), ("NJ", 2017)}  # SRC labels them openelections, default variant
YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2025]
OFFICES = ("SLDU", "SLDL", "USH", "USS", "USSS", "GOV")


def recipe(st: str, year: int, src: str) -> str | None:
    """The --variant for a cell ('' default, 'mix', 'oe'), or None when another builder owns it."""
    if re.match(r"^(rdh|official|swdb|ak-cvr|vest)-", src):
        return None
    has_m, has_oe = "medsl-" in src, "openelections-" in src or "nm-sos-" in src or "ny-boe" in src
    if has_m and has_oe:
        return "mix"
    if has_oe and not has_m:
        return "" if (st, year) in SRC_OE else "oe"
    return ""


def plan(years: list[int]) -> dict[int, list[tuple[str, str, list[str]]]]:
    cov = json.loads(COV.read_text())["states"]
    out: dict[int, list[tuple[str, str, list[str]]]] = defaultdict(list)
    for st in sorted(cov):
        for y in years:
            cells = cov[st]["years"].get(str(y), {})
            by_variant: dict[str, list[str]] = defaultdict(list)
            for office in OFFICES:
                src = cells.get(office, {}).get("src")
                if not src or cells[office].get("status") in ("na", "missing"):
                    continue
                v = recipe(st, y, src)
                if v is not None:
                    by_variant[v].append(office)
            for v, offices in by_variant.items():
                out[y].append((st, v, offices))
    return out


def run_year(year: int, jobs: list[tuple[str, str, list[str]]]) -> list[str]:
    lines = []
    for st, v, offices in jobs:
        cmd = [sys.executable, str(BUILDER), str(year), st, "--only", ",".join(offices)] + (["--variant", v] if v else [])
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        tail = [l for l in p.stdout.splitlines() if l.strip()][-1:] or [p.stderr.strip()[-200:]]
        lines.append(f"{year} {st} {v or 'default'} {','.join(offices)}: {tail[0][-160:]}")
        print(lines[-1], flush=True)
    return lines


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    years = [int(a) for a in args] or YEARS
    p = plan(years)
    if "--plan" in sys.argv:
        for y in years:
            print(y, " ".join(f"{st}:{v or 'd'}:{'+'.join(o)}" for st, v, o in p[y]))
        return
    with ThreadPoolExecutor(max_workers=len(years)) as ex:
        list(ex.map(lambda y: run_year(y, p[y]), years))


if __name__ == "__main__":
    main()
