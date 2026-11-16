#!/usr/bin/env python3
"""Indiana certified results by county from the Election Division's results archive.

enr.indianavoters.in.gov/archive/{year}General/download/AllOfficeResults.csv is the state's own certified export:
one row per reporting unit, contest and candidate. For 2016 and 2018 the unit is the county; for 2020 and 2022 it is
the precinct in the counties that report by precinct (35 of 92 in 2022) and the county in the rest.

MEDSL's Indiana files carry the same precinct rows and nothing for the other counties, which is why Indiana ran a
quarter to a third short. This writes data-entry/precincts/raw/official/in/certified_by_county_{year}.csv
(office, district, county, dem, rep). build_results_medsl.py then keeps the precinct rows where they agree with the
certified county figure and, for a county no source covers, puts in one countywide line that is spread over the
county's precincts and counted as an estimate.

  python3 scripts/precincts/fetch_indiana.py 2022
  python3 scripts/precincts/build_results_medsl.py 2022 IN
"""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "data-entry" / "precincts" / "raw" / "official" / "in"
ORDINAL = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9}
CATEGORY = {"US Senator": "USS", "US Representative": "USH", "State Senator": "SLDU", "State Representative": "SLDL", "Governor & Lt. Governor": "GOV",
            "Presidential Electors For US President & Vp": "PRES"}


def main() -> None:
    year = int(sys.argv[1])
    FOLDER.mkdir(parents=True, exist_ok=True)
    src = FOLDER / f"All_{year}.csv"
    if not src.exists():
        subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 (precinct results archive)", "--max-time", "300", "-o", str(src),
                        f"https://enr.indianavoters.in.gov/archive/{year}General/download/AllOfficeResults.csv"], check=True)
    d = pd.read_csv(src, dtype=str, na_filter=False)
    d.columns = [c.replace(" ", "") for c in d.columns]
    d = d[d["OfficeCategory"].isin(CATEGORY) & ~d["Office"].str.contains("Special Election", case=False)].copy()
    d["office"] = d["OfficeCategory"].map(CATEGORY)

    def district(office: str, text: str) -> str:
        if office == "USH":
            m = re.search(r"Representative, (\w+) District", text)
            return str(ORDINAL[m.group(1).lower()]) if m else ""
        m = re.search(r"District 0*(\d+)", text)
        return m.group(1) if m and office in ("SLDU", "SLDL") else ""

    d["district"] = [district(o, t) for o, t in zip(d["office"], d["Office"])]
    d["votes"] = pd.to_numeric(d["TotalVotes"].str.replace(",", ""), errors="coerce").fillna(0).astype(int)
    code = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "IN":
                code[re.sub(r"[^a-z]", "", r["county_name"].lower().replace(" county", ""))] = r["county_id"].zfill(5)
    d["county"] = d["ReportingCountyName"].map(lambda c: code.get(re.sub(r"[^a-z]", "", c.lower()), ""))
    side = d["PoliticalParty"].map({"Democratic": "dem", "Republican": "rep"})
    g = d[side.notna()].assign(side=side).groupby(["office", "district", "county", "side"])["votes"].sum().unstack(fill_value=0).reset_index()
    for c in ("dem", "rep"):
        if c not in g:
            g[c] = 0
    g = g[(g["dem"] + g["rep"]) > 0]
    out = FOLDER / f"certified_by_county_{year}.csv"
    g[["office", "district", "county", "dem", "rep"]].to_csv(out, index=False)
    tot = g.groupby("office")[["dem", "rep"]].sum()
    print(f"IN {year}: {len(g)} county pieces; no county code: {sorted(set(d.loc[d['county'] == '', 'ReportingCountyName']))[:5]}")
    print(tot.to_string())


if __name__ == "__main__":
    main()
