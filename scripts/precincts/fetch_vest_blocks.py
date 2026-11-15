#!/usr/bin/env python3
"""Download the inputs for fitting 2016-2020 results onto the 2024 precincts.

  VEST precinct shapefiles with statewide results (Harvard Dataverse, CC BY 4.0, no login):
      data-entry/precincts/raw/vest/{2016,2018,2020}/{st}_{year}.zip
  Census 2020 blocks with population (TIGER tabblock20: GEOID20, INTPTLAT20/LON20, POP20):
      data-entry/precincts/raw/blocks/tl_2020_{fips}_tabblock20.zip      (~6 GB for all states)

Both are resumable and skip files whose size already matches. Everything lands in gitignored folders.

  python3 scripts/precincts/fetch_vest_blocks.py vest 2020          # one VEST year
  python3 scripts/precincts/fetch_vest_blocks.py blocks             # all block files
  python3 scripts/precincts/fetch_vest_blocks.py blocks GA TX       # selected states
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
UA = "Mozilla/5.0 (election-map precinct pipeline)"
VEST_DOI = {"2016": "doi:10.7910/DVN/NH5S2I", "2018": "doi:10.7910/DVN/UBKYRU", "2020": "doi:10.7910/DVN/K7760H"}
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11",
    "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30",
    "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}


def curl(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sSL", "-A", UA, "-C", "-", "--retry", "8", "--retry-delay", "5", "--retry-all-errors", "-o", str(dest), url], check=False)


def vest(year: str) -> None:
    req = urllib.request.Request(f"https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId={VEST_DOI[year]}", headers={"User-Agent": UA})
    files = json.load(urllib.request.urlopen(req, timeout=60))["data"]["latestVersion"]["files"]
    for f in files:
        label, fid, size = f["label"], f["dataFile"]["id"], f["dataFile"]["filesize"]
        dest = RAW / "vest" / year / label
        if dest.exists() and dest.stat().st_size == size:
            continue
        if dest.exists():
            dest.unlink()  # Dataverse redirects to signed URLs; a partial file cannot be resumed reliably
        curl(f"https://dataverse.harvard.edu/api/access/datafile/{fid}", dest)
        ok = dest.exists() and dest.stat().st_size == size
        print(f"vest {year} {label}: {'ok' if ok else 'INCOMPLETE'} {dest.stat().st_size if dest.exists() else 0}/{size}", flush=True)


def blocks(states: list[str]) -> None:
    for st in states:
        fips = STATE_FIPS[st]
        name = f"tl_2020_{fips}_tabblock20.zip"
        dest = RAW / "blocks" / name
        url = f"https://www2.census.gov/geo/tiger/TIGER2020/TABBLOCK20/{name}"
        head = subprocess.run(["curl", "-sI", "-A", UA, url], capture_output=True, text=True).stdout.lower()
        size = next((int(l.split(":")[1]) for l in head.splitlines() if l.startswith("content-length")), -1)
        for _ in range(4):
            if dest.exists() and dest.stat().st_size == size:
                break
            curl(url, dest)
        ok = dest.exists() and dest.stat().st_size == size
        print(f"blocks {st}: {'ok' if ok else 'INCOMPLETE'} {dest.stat().st_size / 1e6 if dest.exists() else 0:.0f} MB", flush=True)


if __name__ == "__main__":
    what, args = sys.argv[1], sys.argv[2:]
    if what == "vest":
        for y in args or list(VEST_DOI):
            vest(y)
    else:
        blocks([a.upper() for a in args] or list(STATE_FIPS))
