#!/usr/bin/env python3
"""Split the national MEDSL precinct files (2016-2022) into one small file per state.

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
    out = [(state, {"SLDU", "SLDL", "GOV"}), (FED / f"house_{year}_precinct.csv", {"USH"}), (FED / f"house_{year}_precinct.tab", {"USH"}), (FED / f"senate_{year}_precinct.csv", {"USS"})]
    for p in (FED / f"president_{year}_precinct.tab", FED / f"president_{year}_precinct.csv", RAW / str(year) / "PRESIDENT_precinct_general.csv"):
        out.append((p, {"PRES"}))
    return [(p, o) for p, o in out if p.exists()]


def office_code(o: str) -> str | None:
    if o in ("US HOUSE", "US SENATE", "STATE SENATE", "STATE HOUSE"):
        return {"US HOUSE": "USH", "US SENATE": "USS", "STATE SENATE": "SLDU", "STATE HOUSE": "SLDL"}[o]
    if o in ("US PRESIDENT", "PRESIDENT"):
        return "PRES"
    if o in ("HOUSE OF DELEGATES", "STATE REPRESENTATIVE", "REPRESENTATIVE IN GENERAL ASSEMBLY"):
        return "SLDL"
    if o in ("STATE SENATOR", "SENATOR IN GENERAL ASSEMBLY"):  # Hawaii, Rhode Island 2022
        return "SLDU"
    return "GOV" if GOV_RE.match(o) else None


def read(path: Path, keep: set[str]) -> pd.DataFrame:
    with open(path, encoding="latin-1") as f:
        sep = "\t" if "\t" in f.readline() else ","
    head = pd.read_csv(path, nrows=0, encoding="latin-1", sep=sep).columns
    old = "state_postal" in head  # the 2016 layout
    cols = {"state_postal" if old else "state_po": "st", "county_fips": "county", "jurisdiction" if old else "jurisdiction_name": "jurisdiction",
            "precinct": "precinct", "office": "office", "district": "district", "candidate": "candidate",
            "party" if old else "party_detailed": "party", "writein": "writein", "mode": "mode", "votes": "votes", "stage": "stage", "special": "special"}
    extra = [] if old else ["party_simplified"]
    parts = []
    for ch in pd.read_csv(path, dtype=str, usecols=list(cols) + extra, na_filter=False, encoding="latin-1", chunksize=2_000_000, sep=sep):
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


def state_files(year: int) -> list[Path]:
    """2022: MEDSL's per-state files (every office in one file), from its public GitHub repository
    github.com/MEDSL/2022-elections-official/individual_states → raw/medsl/2022/states/*.zip."""
    import zipfile
    out = []
    for z in sorted((RAW / str(year) / "states").glob("*.zip")):
        dest = z.with_suffix(".csv")
        if not dest.exists():
            with zipfile.ZipFile(z) as zf:
                name = max(zf.infolist(), key=lambda i: i.file_size).filename
                dest.write_bytes(zf.read(name))
        out.append(dest)
    return out


def tennessee_governor_2022() -> pd.DataFrame | None:
    """MEDSL's Tennessee 2022 file has no governor rows; OpenElections' precinct file (the MEDSL source) does.
    It carries county names and no party: the county code comes from MEDSL's own Tennessee rows, and the
    party is settled by the builder from the site's statewide result."""
    oe, ms = FED / "tn22_openelections_precinct.csv", RAW / "2022" / "states" / "2022-tn-local-precinct-general.csv"
    if not oe.exists() or not ms.exists():
        return None
    fips = pd.read_csv(ms, dtype=str, na_filter=False, usecols=["county_name", "county_fips"], encoding="latin-1").drop_duplicates()
    code = {n.upper(): f.zfill(5) for n, f in zip(fips["county_name"], fips["county_fips"])}
    t = pd.read_csv(oe, dtype=str, na_filter=False)
    t = t[t["office"] == "Governor"]
    return pd.DataFrame({"st": "TN", "county": [code.get(c.upper(), "") for c in t["county"]], "jurisdiction": t["county"].str.upper(), "precinct": t["precinct"],
                         "office": "GOV", "district": "", "candidate": t["candidate"].str.upper().str.replace(r"^WRITE-IN - ", "", regex=True), "party": t["party"].str.upper(),
                         "writein": t["candidate"].str.upper().str.startswith("WRITE-IN"), "mode": "TOTAL", "votes": pd.to_numeric(t["votes"], errors="coerce").fillna(0).round().astype("int64")})


def main() -> None:
    year = int(sys.argv[1])
    per_state = state_files(year)
    everything = {"PRES", "USS", "GOV", "USH", "SLDU", "SLDL"}
    frames = [read(p, everything) for p in per_state] if per_state else [read(p, keep) for p, keep in sources(year)]
    if year == 2022 and (tn := tennessee_governor_2022()) is not None:
        frames.append(tn)
    df = pd.concat(frames, ignore_index=True)
    out = RAW / str(year) / "by_state"
    out.mkdir(parents=True, exist_ok=True)
    for st, g in df.groupby("st"):
        g.drop(columns=["st"]).to_parquet(out / f"{st}.parquet", index=False)
        print(st, len(g), " ".join(f"{o}:{n}" for o, n in g["office"].value_counts().items()), flush=True)


if __name__ == "__main__":
    main()
