#!/usr/bin/env python3
"""Split the national MEDSL precinct files (2016, 2018, 2020) into one small file per state.

The national files are 0.1-2 GB each and come in two layouts (2016; 2018 onward). This reads them once,
keeps the six offices the precinct project uses, puts both layouts on one schema and writes
data-entry/precincts/raw/medsl/{year}/by_state/{ST}.parquet:

  county (5-digit FIPS), jurisdiction, precinct, office (PRES USS GOV USH SLDU SLDL), district,
  candidate, party (as published, upper case), writein (bool), mode, votes

General-election rows only; special elections and recount stages are left out (a U.S. Senate special
is kept as office USS_S, used only to match precincts). Sources: the state-office
file fetched by fetch_medsl.py, and the federal files in data-entry/medsl/ (house, senate, president).
The 2020 president file sits behind a Dataverse guestbook and is optional (it only adds a matching key).

  python3 scripts/precincts/split_medsl.py 2020
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw" / "medsl"
FED = ROOT / "data-entry" / "medsl"
GOV_RE = re.compile(r"^GOVERNOR(\s*(AND|&|/)\s*(LIEUTENANT|LT\.?)\s*GOVERNOR)?$")


def sources(year: int) -> list[tuple[Path, set[str]]]:
    state = RAW / str(year) / ("2016-precinct-state.tab" if year == 2016 else "STATE_precinct_general.csv")
    out = [(state, {"SLDU", "SLDL", "GOV"}), (FED / f"house_{year}_precinct.csv", {"USH"}), (FED / f"senate_{year}_precinct.csv", {"USS"})]
    for p in (FED / f"president_{year}_precinct.tab", FED / f"president_{year}_precinct.csv", RAW / str(year) / "PRESIDENT_precinct_general.csv"):
        out.append((p, {"PRES"}))
    return [(p, o) for p, o in out if p.exists()]


def office_code(o: str) -> str | None:
    if o in ("US HOUSE", "US SENATE", "STATE SENATE", "STATE HOUSE"):
        return {"US HOUSE": "USH", "US SENATE": "USS", "STATE SENATE": "SLDU", "STATE HOUSE": "SLDL"}[o]
    if o in ("US PRESIDENT", "PRESIDENT"):
        return "PRES"
    if o == "HOUSE OF DELEGATES":
        return "SLDL"
    return "GOV" if GOV_RE.match(o) else None


def read(path: Path, keep: set[str]) -> pd.DataFrame:
    head = pd.read_csv(path, nrows=0, encoding="latin-1").columns
    old = "state_postal" in head  # the 2016 layout
    cols = {"state_postal" if old else "state_po": "st", "county_fips": "county", "jurisdiction" if old else "jurisdiction_name": "jurisdiction",
            "precinct": "precinct", "office": "office", "district": "district", "candidate": "candidate",
            "party" if old else "party_detailed": "party", "writein": "writein", "mode": "mode", "votes": "votes", "stage": "stage", "special": "special"}
    extra = [] if old else ["party_simplified"]
    parts = []
    for ch in pd.read_csv(path, dtype=str, usecols=list(cols) + extra, na_filter=False, encoding="latin-1", chunksize=2_000_000):
        ch = ch.rename(columns=cols)
        if extra:  # the detailed label keeps "DEMOCRATIC-FARMER-LABOR" and fusion lines apart; fall back to the simplified one
            ch["party"] = ch["party"].where(ch["party"].str.strip() != "", ch.pop("party_simplified"))
        ch["office"] = ch["office"].str.upper().map(lambda o, memo={}: memo.setdefault(o, office_code(o)))
        ch = ch[ch["office"].isin(keep) & (ch["stage"].str.upper() == "GEN")]
        special = ch["special"].str.upper() == "TRUE"
        # Specials are dropped, except a U.S. Senate special: kept apart as "USS_S", only as a matching key.
        ch = ch[~special | (ch["office"] == "USS")].copy()
        ch.loc[special.reindex(ch.index) & (ch["office"] == "USS"), "office"] = "USS_S"
        parts.append(ch.drop(columns=["stage", "special"]))
    df = pd.concat(parts, ignore_index=True)
    df["county"] = df["county"].str.replace(r"\.0$", "", regex=True).str.zfill(5)
    df["district"] = df["district"].str.replace(r"\.0$", "", regex=True).str.strip()
    df["votes"] = pd.to_numeric(df["votes"], errors="coerce").fillna(0).round().astype("int64")
    df["writein"] = df["writein"].str.upper() == "TRUE"
    for c in ("party", "mode", "candidate"):
        df[c] = df[c].str.upper().str.strip()
    return df


def main() -> None:
    year = int(sys.argv[1])
    frames = [read(p, keep) for p, keep in sources(year)]
    df = pd.concat(frames, ignore_index=True)
    out = RAW / str(year) / "by_state"
    out.mkdir(parents=True, exist_ok=True)
    for st, g in df.groupby("st"):
        g.drop(columns=["st"]).to_parquet(out / f"{st}.parquet", index=False)
        print(st, len(g), " ".join(f"{o}:{n}" for o, n in g["office"].value_counts().items()), flush=True)


if __name__ == "__main__":
    main()
