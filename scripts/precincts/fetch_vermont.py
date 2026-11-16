#!/usr/bin/env python3
"""Vermont legislative results by town from the Secretary of State's election archive.

MEDSL's Vermont files are short for the legislature in every year (whole towns missing, 2018 Senate
by a quarter). The state's archive (vtelectionarchive.sec.state.vt.us, data service
vt2.elstats.civera.com) serves each office-year as one CSV: one row per contest, candidate and town
(and per ward where a town has wards). General-election rows are kept, one line per town, and written to
raw/medsl/{year}/by_state/VT.oe.parquet in the layout build_results_medsl.py reads.

  python3 scripts/precincts/fetch_vermont.py 2018
  python3 scripts/precincts/build_results_medsl.py 2018 VT --variant oe --only SLDU,SLDL
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
OFFICE = {8: ("house", "SLDL"), 9: ("senate", "SLDU")}


def download(year: int, oid: int, dest: Path) -> None:
    q = {"global": {"years": {"from": year, "to": year}}, "contests": {"candidates": [], "offices": [{"id": oid}], "divisions": []}, "voterStats": False, "stages": [], "specialElectionsOnly": False}
    url = "https://vt2.elstats.civera.com/api/download_search.csv?search=" + urllib.parse.quote(json.dumps(q, separators=(",", ":")))
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (precinct results archive)"}), timeout=600) as r:
        dest.write_bytes(r.read())


def main() -> None:
    year = int(sys.argv[1])
    folder = RAW / "official" / "vt"
    folder.mkdir(parents=True, exist_ok=True)
    # town → county, from the precinct layer (Vermont's precincts are its towns)
    idx = json.loads((ROOT / "public" / "precincts" / "index" / "VT.json").read_text())
    def key(t: str) -> str:
        t = " " + t.upper().replace(".", ". ").replace("  ", " ") + " "
        for short, full in ((" S. ", " SOUTH "), (" N. ", " NORTH "), (" E. ", " EAST "), (" W. ", " WEST "), (" ST. ", " SAINT "), (" ST ", " SAINT "), (" MT. ", " MOUNT ")):
            t = t.replace(short, full)
        return "".join(ch for ch in t if ch.isalnum())

    # a town split between House districts is listed as "Burlington - Chittenden 13": the town is the part before the dash
    county = {key(n.split(" - ")[0]): idx["counties"][c][0] for n, c in zip(idx["names"], idx["county"])}
    frames = []
    for oid, (name, office) in OFFICE.items():
        path = folder / f"{year}_{name}.csv"
        if not path.exists():
            download(year, oid, path)
        d = pd.read_csv(path, dtype=str, na_filter=False)
        d = d[(d["election_type"] == "General Election") & d["election_date"].str.startswith(f"{year}-11")]
        d["votes"] = pd.to_numeric(d["votes"], errors="coerce").fillna(0).astype("int64")
        # One line per town: the "Precinct" rows are the same votes again by ward. Totals and blank-vote lines are not candidates.
        use = d[(d["division_type"] == "City/Town") & ~d["candidate_name"].str.fullmatch(r"(Total (Ballots|Votes) Cast|Undervotes|Overvotes|Blank Votes?|Spoiled Votes?)", case=False)].reset_index(drop=True)
        tname = use["division_name"]
        frames.append(pd.DataFrame({
            "county": [county.get(key(t), "") for t in tname], "jurisdiction": tname.str.upper(), "precinct": use["division_name"].str.upper(), "office": office,
            "district": use["district_name"].str.upper(), "candidate": use["candidate_name"].str.upper().str.strip(), "party": use["candidate_party_name"].str.upper().str.strip(),
            "writein": use["candidate_name"].str.contains(r"write.?in", case=False, regex=True), "mode": "TOTAL", "votes": use["votes"]}))
    out = pd.concat(frames, ignore_index=True)
    out.to_parquet(RAW / "medsl" / str(year) / "by_state" / "VT.oe.parquet", index=False)
    print("VT", year, len(out), out.groupby("office")["votes"].sum().to_dict(), "districts", out.groupby("office")["district"].nunique().to_dict(), "no county:", sorted(set(out.loc[out["county"] == "", "jurisdiction"]))[:8])


if __name__ == "__main__":
    main()
