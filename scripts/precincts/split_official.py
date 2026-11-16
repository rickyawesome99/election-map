#!/usr/bin/env python3
"""Official state precinct files → the per-state layout the MEDSL builder reads.

For contests no national collection covers. Each adapter reads the state's own publication and writes
data-entry/precincts/raw/medsl/{year}/by_state/{ST}.parquet (columns as in split_medsl.py); with
--append the rows are added to a file that already holds other offices for that state and year.

  VA 2021 2023 2025   Department of Elections statewide precinct CSV (governor, House of Delegates, Senate).
                      2021: apps.elections.virginia.gov/SBE_CSV/ELECTIONS/ELECTIONRESULTS/2021/2021 November General .csv
                      2023, 2025: enr.elections.virginia.gov "Election Results" report (blob name from the
                      election's JSON at /results/public/api/elections/Virginia/{2023-Nov-Gen|2025-November-General})
                      → data-entry/precincts/raw/official/va/va_{year}.csv
  KS 2022             Secretary of State, Kansas House by precinct (xlsx: one long sheet + four county sheets)
                      sos.ks.gov/elections/22elec/2022-General-Election-Kansas-House-of-Representatives-Results-By-Precinct.xlsx
                      → data-entry/precincts/raw/official/ks/ks_house_2022.xlsx   (appended to MEDSL's Kansas 2022 file)
  AZ GA HI ID MN NC WA 2026   the official precinct rows kept by the site's 2026 results build
  LA 2019 2023        Secretary of State results service, one JSON per race and parish (fetch_louisiana.py)

  python3 scripts/precincts/split_official.py VA 2023
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
COLS = ["county", "jurisdiction", "precinct", "office", "district", "candidate", "party", "writein", "mode", "votes"]


def write(st: str, year: int, df: pd.DataFrame, append: bool = False) -> None:
    dest = RAW / "medsl" / str(year) / "by_state"
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{st}.parquet"
    df = df[COLS].copy()
    df["votes"] = pd.to_numeric(df["votes"], errors="coerce").fillna(0).round().astype("int64")
    df["writein"] = df["writein"].astype(bool)
    if append and path.exists():
        old = pd.read_parquet(path)
        df = pd.concat([old[~old["office"].isin(set(df["office"]))], df], ignore_index=True)
    df.to_parquet(path, index=False)
    print(st, year, len(df), df["office"].value_counts().to_dict())


def virginia(year: int) -> None:
    d = pd.read_csv(RAW / "official" / "va" / f"va_{year}.csv", dtype=str, na_filter=False)
    title = d["OfficeTitle"].str.upper()
    office = pd.Series("", index=d.index)
    office[title == "GOVERNOR"] = "GOV"
    office[title.str.contains("HOUSE OF DELEGATES")] = "SLDL"
    office[title.str.contains("SENATE OF VIRGINIA")] = "SLDU"
    d = d[office != ""].copy()
    office = office[d.index]
    name = d["CandidateName"] if "CandidateName" in d.columns else (d["FirstName"] + " " + d["MiddleName"] + " " + d["LastName"] + " " + d["Suffix"]).str.replace(r"\s+", " ", regex=True)
    write("VA", year, pd.DataFrame({
        "county": "51" + d["LocalityCode"].str.zfill(3), "jurisdiction": d["LocalityName"].str.upper(), "precinct": d["PrecinctName"].str.strip(), "office": office,
        "district": [x.strip() if o != "GOV" else "" for x, o in zip(d["DistrictName"], office)], "candidate": name.str.upper().str.strip(),
        "party": d["Party"].str.upper().str.strip(), "writein": d["WriteInVote"].isin(["1", "True", "true"]), "mode": "TOTAL", "votes": d["TOTAL_VOTES"],
    }))


def kansas_house_2022() -> None:
    import csv
    code = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "KS":
                code[re.sub(r"[^a-z]", "", r["county_name"].lower().replace(" county", ""))] = r["county_id"].zfill(5)
    path = RAW / "official" / "ks" / "ks_house_2022.xlsx"
    rows = []
    long = pd.read_excel(path, sheet_name="KSHouse", dtype=str).fillna("")
    for c, p, race, cand, party, v in zip(long["County"], long["Precinct"], long["Race"], long["Candidate"], long["Party"], long["Votes"]):
        m = re.search(r"(\d+)\s*$", race)
        if m and cand:
            last_first = [x.strip() for x in cand.split(",", 1)]
            rows.append((c, p, m.group(1), " ".join(reversed(last_first)), party, v))
    # County sheets: row 1 = district per column, row 2 = candidate, then one row per precinct.
    for sheet in ("JOHNSON", "SEDGWICK", "SHAWNEE", "WYANDOTTE"):
        w = pd.read_excel(path, sheet_name=sheet, header=None, dtype=str).fillna("")
        hdr, cands = list(w.iloc[0]), list(w.iloc[1])
        name_col = next((i for i, x in enumerate(hdr) if "NAME" in str(x).upper()), next((i for i, x in enumerate(cands) if "NAME" in str(x).upper()), 0))
        dist = ""
        for j in range(len(hdr)):
            m = re.search(r"(\d+)(?:ST|ND|RD|TH)?\s+DISTRICT", str(hdr[j]).upper())
            if m:
                dist = m.group(1)
            cand = str(cands[j]).strip()
            if not dist or not cand or j <= name_col or cand.upper() in ("VTD", "PRECINCT NAME", "PRECINCT CODE", "PRECINCT"):
                continue
            pm = re.match(r"^(REP|DEM|LIB)\s+(.*)$", cand)
            party, nm = ({"REP": "Republican", "DEM": "Democratic", "LIB": "Libertarian"}[pm.group(1)], pm.group(2)) if pm else ("", cand)
            for i in range(2, len(w)):
                v = str(w.iat[i, j]).strip()
                if v not in ("", "0", "0.0") and str(w.iat[i, name_col]).strip() and "TOTAL" not in str(w.iat[i, name_col]).upper():
                    rows.append((sheet.title(), str(w.iat[i, name_col]).strip(), dist, nm, party, v))
    d = pd.DataFrame(rows, columns=["county", "precinct", "district", "candidate", "party", "votes"])
    write("KS", 2022, pd.DataFrame({
        "county": d["county"].str.lower().str.replace(r"[^a-z]", "", regex=True).map(code).fillna(""), "jurisdiction": d["county"].str.upper(), "precinct": d["precinct"],
        "office": "SLDL", "district": d["district"], "candidate": d["candidate"].str.upper(), "party": d["party"].str.upper(),
        "writein": d["candidate"].str.contains("write", case=False), "mode": "TOTAL", "votes": d["votes"],
    }), append=True)


def results_2026(st: str) -> None:
    """The site's own 2026 official-results build already keeps precinct rows for the states whose election
    offices publish them (data-entry/results-2026/precincts/{ST}.csv.gz, written by `npm run results-2026`).
    Counts move until certification: re-run this after each refresh of that build."""
    d = pd.read_csv(ROOT / "data-entry" / "results-2026" / "precincts" / f"{st}.csv.gz", dtype=str, na_filter=False)
    d = d[d["special"].isin(["0", ""])]
    office = d["office"].map({"senate": "USS", "governor": "GOV", "house": "USH", "state_house": "SLDL", "state_senate": "SLDU"})
    d = d[office.notna()].copy()
    # Georgia counties differ in how they print a name: some append "(I)" for the incumbent and the party
    # in brackets ("NIKEMA WILLIAMS (I) (DEM)"), which the results build reads as an independent.
    tag = d["candidate"].str.extract(r"^(.*?)\s*(?:\(I\))?\s*\((DEM|REP)\)\s*$", flags=re.I)
    hit = tag[1].notna()
    d.loc[hit, "candidate"] = tag.loc[hit, 0]
    d.loc[hit, "party_simple"] = tag.loc[hit, 1].str.upper().str[0]
    d["candidate"] = d["candidate"].str.replace(r"\s*\(I\)\s*$", "", regex=True)
    write(st, 2026, pd.DataFrame({
        "county": d["county_fips"].str.zfill(5), "jurisdiction": d["county_name"].str.upper(), "precinct": d["precinct_name"].str.strip().where(d["precinct_name"].str.strip() != "", d["precinct_id"]),
        "office": office[d.index], "district": [re.sub(r"-P\d+$", "", x) if o in ("house", "state_house", "state_senate") else "" for x, o in zip(d["seat"], d["office"])],
        "candidate": d["candidate"].str.upper().str.strip(), "party": d["party_simple"].map({"D": "DEMOCRAT", "R": "REPUBLICAN", "I": "INDEPENDENT", "L": "LIBERTARIAN", "G": "GREEN"}).fillna(d["party_simple"]),
        "writein": d["candidate"].str.contains("write", case=False), "mode": "TOTAL", "votes": d["votes"],
    }))


ME_COUNTY = {"AND": "23001", "ARO": "23003", "CUM": "23005", "FRA": "23007", "HAN": "23009", "KEN": "23011", "KNO": "23013", "LIN": "23015", "OXF": "23017",
             "PEN": "23019", "PIS": "23021", "SAG": "23023", "SOM": "23025", "WAL": "23027", "WAS": "23029", "YOR": "23031"}


def maine_cd2_2018() -> None:
    """MEDSL has no rows for Maine's 2nd district in 2018 (the ranked-choice race). The Secretary of State's workbook
    of first choices by town and ward (maine.gov/sos/sites/maine.gov.sos/files/content/assets/Rep-congress-results.xlsx,
    saved as raw/official/me/2018_cd2_Rep-congress-results.xlsx) is appended to MEDSL's Maine 2018 file. Overseas ballots
    are one statewide line with no county."""
    x = pd.read_excel(RAW / "official" / "me" / "2018_cd2_Rep-congress-results.xlsx", sheet_name=0, header=None, dtype=str).fillna("")
    names, parties = list(x.iloc[0]), list(x.iloc[2])
    cols = [(j, names[j].upper().strip(), {"DEM": "DEMOCRAT", "REP": "REPUBLICAN", "IND": "INDEPENDENT"}.get(parties[j].upper().strip(), parties[j].upper())) for j in range(4, len(names)) if names[j] and names[j] not in ("BLK", "TBC", "TBC by Town")]
    rows = []
    for i in range(3, len(x)):
        r = list(x.iloc[i])
        town = r[2].strip()
        if not town:
            continue  # the grand-total line
        for j, name, party in cols:
            if re.fullmatch(r"\d+", r[j]):
                rows.append((ME_COUNTY.get(r[1].strip().upper(), ""), town.upper(), f"{town} {r[3]}".strip() if r[3] and r[3] != "1-1" else town, "USH", "2", name, party, False, "TOTAL", int(r[j])))
    add = pd.DataFrame(rows, columns=["county", "jurisdiction", "precinct", "office", "district", "candidate", "party", "writein", "mode", "votes"])
    f = RAW / "medsl" / "2018" / "by_state" / "ME.parquet"
    cur = pd.read_parquet(f)
    cur = cur[~((cur["office"] == "USH") & (cur["district"].astype(str).str.lstrip("0") == "2"))]
    pd.concat([cur, add[cur.columns]], ignore_index=True).to_parquet(f, index=False)
    print("ME 2018 CD2", len(add), add.groupby("candidate")["votes"].sum().to_dict())


def main() -> None:
    st, year = sys.argv[1].upper(), int(sys.argv[2])
    if (st, year) == ("ME", 2018):
        maine_cd2_2018()
        return
    if year == 2026:
        results_2026(st)
    elif st == "VA":
        virginia(year)
    elif (st, year) == ("KS", 2022):
        kansas_house_2022()
    else:
        sys.exit(f"no adapter for {st} {year}")


if __name__ == "__main__":
    main()
