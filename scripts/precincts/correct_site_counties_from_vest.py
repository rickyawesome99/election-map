#!/usr/bin/env python3
"""Correct the site's county rows where VEST precinct sums equal the certified result and the site is short.

Found by the precinct reconciliation (/audit/precincts), each checked against the certified statewide
count before being listed here:

  Kansas 2020 president    site 558,669 / 758,100   certified and precinct sum 570,323 / 771,406
  Maine 2020 president     site 430,473 / 359,899   precinct sum 435,070 / 360,767
  Maine 2020 U.S. Senate   site 343,155 / 416,556   precinct sum 347,241 / 417,642
  Maryland 2016 U.S. Senate site 1,488,845 / 898,902 certified and precinct sum 1,659,907 / 972,557

County totals come from the source's own precincts (each placed in the county that contains it), not
from the 2024-line fit, so no vote crosses a county line. The rows as they stood at the 2026 forecast
lock are appended to data/countyRowsLocked2026.ts so the frozen model keeps reading them.

  python3 scripts/precincts/correct_site_counties_from_vest.py --report | --write
Then: python3 scripts/generate-county-pres-data.py && python3 scripts/generate-county-senate-data.py
"""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import make_valid

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
import build_results_vest as V  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [("KS", 2020, "PRES"), ("ME", 2020, "PRES"), ("ME", 2020, "USS"), ("MD", 2016, "USS")]
PRES_CSV = ROOT / "data" / "county_presidential_results_2008_2024.csv"
LOCKED = ROOT / "data" / "countyRowsLocked2026.ts"


def county_sums(st: str, year: int, office: str) -> dict[str, list[int]]:
    old = gpd.read_file(V.vest_layer(st, year), engine="pyogrio")
    old = old[~old.geometry.isna() & ~old.geometry.is_empty].reset_index(drop=True)
    bad = ~old.geometry.is_valid
    if bad.any():
        old.loc[bad, "geometry"] = old.loc[bad, "geometry"].apply(make_valid)
    counties = gpd.read_file(ROOT / "public" / "us-counties.json")
    if counties.crs is None:
        counties = counties.set_crs(4326)
    counties["fips"] = counties["id"].astype(str).str.zfill(5)
    counties = counties[counties["fips"].str[:2] == V.B_FIPS[st]][["fips", "geometry"]].to_crs(5070)
    pts = gpd.GeoDataFrame(geometry=old.geometry.to_crs(5070).representative_point(), index=old.index)
    j = gpd.sjoin_nearest(pts, counties, how="left")
    fips = j[~j.index.duplicated()]["fips"].reindex(old.index)
    cols = V.contests([c for c in old.columns if c != "geometry"], f"{year % 100:02d}")[office]["general"]
    v = old[[c for c, _ in cols]].apply(pd.to_numeric, errors="coerce").fillna(0)
    dcol, rcol = B.slot_columns([(c, p, int(v[c].sum())) for c, p in cols])
    out: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for f, d, r, t in zip(fips, v[dcol], v[rcol], v.sum(axis=1)):
        o = out[f]
        o[0] += int(d)
        o[1] += int(r)
        o[2] += int(t - d - r)
    return out


def locked_rows(ts_text: str, fipses: list[str], year: int) -> list[str]:
    rows = []
    for f in fipses:
        m = re.search(rf'^  "{f}": \{{.*?years: \{{(.*?)\}} \}}', ts_text, re.M)
        y = re.search(rf"\b{year}: (\{{[^}}]*\}})", m.group(1)) if m else None
        if y:
            rows.append(f'  {{ fips: "{f}", bucket: "years", year: {year}, row: {y.group(1)} }},')
    return rows


def main() -> None:
    write = "--write" in sys.argv
    locked_add: dict[str, list[str]] = {"lockedPresidentialRows": [], "lockedSenateRows": []}
    for st, year, office in TARGETS:
        sums = county_sums(st, year, office)
        path = PRES_CSV if office == "PRES" else ROOT / "data-entry" / f"county_senate_results_{year}.csv"
        with open(path, newline="") as f:
            rows = list(csv.DictReader(f))
            fields = list(rows[0].keys())
        changed = []
        td = tr = 0
        for row in rows:
            if row["state"] != st:
                continue
            s = sums.get(row["county_id"])
            if not s:
                print(f"  {st} {row['county_name']}: no precinct sum, left as is")
                continue
            td += s[0]
            tr += s[1]
            new = (str(s[0]), str(s[1]), str(s[2]), str(sum(s)))
            old = tuple(row[f"{k}_{year}"] for k in ("dem", "gop", "oth", "total"))
            if old != new:
                changed.append(row["county_id"])
                for k, val in zip(("dem", "gop", "oth", "total"), new):
                    row[f"{k}_{year}"] = val
        print(f"{st} {year} {office}: {len(changed)} county rows {'written' if write else 'would change'}; statewide D {td:,} R {tr:,}")
        if not changed:
            continue
        ts_path = "data/countyPresidentialData.ts" if office == "PRES" else "data/countySenateData.ts"
        at_lock = subprocess.run(["git", "show", f"2bf0d57:{ts_path}"], capture_output=True, text=True, cwd=ROOT).stdout  # v3.50 = the inputs at the lock
        locked_add["lockedPresidentialRows" if office == "PRES" else "lockedSenateRows"] += locked_rows(at_lock, changed, year)
        if write:
            with open(path, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
                w.writeheader()
                w.writerows(rows)
    if write:
        s = LOCKED.read_text()
        for name, rows in locked_add.items():
            i = s.index(f"export const {name}: LockedRow[] = [")
            j = s.index("\n];", i)
            new = [r for r in rows if r.split(", row:")[0] not in s[i:j]]  # de-duplicate within this array only
            if not new:
                continue
            s = s[:j] + "\n  // 2026-11-15: rows corrected from VEST precinct sums (scripts/precincts/correct_site_counties_from_vest.py)\n" + "\n".join(new) + s[j:]
        LOCKED.write_text(s)
    print({k: len(v) for k, v in locked_add.items()})


if __name__ == "__main__":
    main()
