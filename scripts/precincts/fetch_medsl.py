#!/usr/bin/env python3
"""Download the MIT Election Data + Science Lab precinct returns that carry state-legislative races.

Everything is CC0 on Harvard Dataverse. Files land in data-entry/precincts/raw/medsl/ (gitignored),
resumable, skipped when the size already matches. ~9 GB in total; the 2024 by-state files are the
richest single source (every office in one file per state), the earlier years ship one national
state-office file each. The federal 2016–2024 House/Senate files already live in data-entry/medsl/.

  python3 scripts/precincts/fetch_medsl.py            # everything
  python3 scripts/precincts/fetch_medsl.py 2024 2022  # selected years
  python3 scripts/precincts/fetch_medsl.py --list     # show the manifest, download nothing

Dataset DOIs (verified 2026-11-14): 2024 by state NYTPDU (v1.0, 2026-05-01), 2024 state offices DODOBJ,
2022 OAARCY (v5.0, 2026-09-18), 2020 OKL2K1 (v5.0, 2026-03-02), 2018 ZFXEJU (v1.1), 2016 GSZG1O (v10.1).
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw" / "medsl"
API = "https://dataverse.harvard.edu/api"

# year → (dataset DOI, which files to take: None = all, else label predicate)
DATASETS: dict[str, tuple[str, str]] = {
    "2024": ("doi:10.7910/DVN/NYTPDU", "by-state files (all offices)"),
    "2022": ("doi:10.7910/DVN/OAARCY", "state offices, national file"),
    "2020": ("doi:10.7910/DVN/OKL2K1", "state offices, national file"),
    "2018": ("doi:10.7910/DVN/ZFXEJU", "state offices, national file"),
    "2016": ("doi:10.7910/DVN/GSZG1O", "state offices, national file"),
}


def dataset_files(doi: str) -> list[dict]:
    # Dataverse answers 403 to Python's default User-Agent; any browser-like one is accepted.
    req = urllib.request.Request(f"{API}/datasets/:persistentId/?persistentId={doi}", headers={"User-Agent": "Mozilla/5.0 (election-map precinct pipeline)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    if j.get("status") != "OK":
        sys.exit(f"Dataverse error for {doi}: {j.get('message')}")
    return j["data"]["latestVersion"]["files"]


def wanted(year: str, label: str) -> bool:
    if year == "2016":
        return label.endswith((".tab", ".md"))  # skip the .rda duplicate
    return not label.endswith(".rda")


def fetch(year: str, f: dict) -> None:
    df = f["dataFile"]
    label, fid, size = f["label"], df["id"], df["filesize"]
    dest = RAW / year / label
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == size:
        print(f"  {year}/{label}: already complete ({size / 1e6:.0f} MB)")
        return
    # ?format=original returns the file as deposited (CSV/TAB), not Dataverse's re-ingested variant.
    url = f"{API}/access/datafile/{fid}?format=original"
    print(f"  {year}/{label}: {size / 1e6:.0f} MB")
    subprocess.run(["curl", "-sSL", "-A", "Mozilla/5.0 (election-map precinct pipeline)", "-C", "-", "--retry", "5", "--retry-delay", "10", "-o", str(dest), url], check=True)
    got = dest.stat().st_size
    if got != size:
        print(f"    size differs after download: expected {size}, got {got} (Dataverse 'original' size can differ for ingested tabular files; kept)")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    list_only = "--list" in sys.argv
    years = args or list(DATASETS)
    total = 0
    for year in years:
        doi, note = DATASETS[year]
        files = [f for f in dataset_files(doi) if wanted(year, f["label"])]
        size = sum(f["dataFile"]["filesize"] for f in files)
        total += size
        print(f"{year} {doi} — {note}: {len(files)} files, {size / 1e9:.2f} GB")
        if list_only:
            for f in files:
                print(f"    {f['label']} {f['dataFile']['filesize'] / 1e6:.0f} MB")
            continue
        for f in files:
            fetch(year, f)
    print(f"total {total / 1e9:.2f} GB")


if __name__ == "__main__":
    main()
