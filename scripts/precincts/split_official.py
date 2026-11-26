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
  AZ GA HI ID MN NC SC SD WA WY 2026   the official precinct rows kept by the site's 2026 results build
  ND 2026             Secretary of State results JSON (north_dakota_2026)
  OH 2026             county boards' official canvass exports, one file per county (ohio_2026); no statewide file yet
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


PARTY_WORD = {"D": "DEMOCRAT", "DEM": "DEMOCRAT", "R": "REPUBLICAN", "REP": "REPUBLICAN", "L": "LIBERTARIAN", "LIB": "LIBERTARIAN",
              "C": "CONSTITUTION", "CON": "CONSTITUTION", "IND": "INDEPENDENT", "I": "INDEPENDENT", "G": "GREEN", "NON": ""}


def north_dakota_2026() -> None:
    """Secretary of State results site, election 348 (the 2026 general; "IsOfficial": true after the Nov 18
    canvass): resultsnd.sos.nd.gov/results/north-dakota/348/FullDataFile.json → raw/official/nd/nd_2026.json.
    Contest → county (FIPS) → precinct ("094501" = county 09, LD 45, precinct 01, as in MEDSL's 2022 file).
    Absentee and early votes are already in the precincts (one vote type). The three unexpired-term House
    races (LD 20, 26, 42) are separate contests and are left out, as the site leaves out specials."""
    import json
    d = json.loads((RAW / "official" / "nd" / "nd_2026.json").read_text())
    rows = []
    for c in d["ContestData"]:
        name = c["ContestName"].strip()
        if name == "Representative in Congress":
            office, dist = "USH", "1"
        elif m := re.fullmatch(r"State (Senator|Representative) District (\d+)", name):
            office, dist = ("SLDU" if m.group(1) == "Senator" else "SLDL"), m.group(2).lstrip("0")
        else:
            continue
        for fips, county in c["Locations"].items():
            for p in county["Locations"].values():
                for ch in p["Choices"] + p.get("WriteinChoices", []):
                    cand = re.sub(r"\s+", " ", ch["Name"]).strip().upper()
                    rows.append((fips, county["LocationName"].upper(), p["LocationName"], office, dist, cand,
                                 PARTY_WORD.get(ch.get("PartyID", "").strip(), ch.get("PartyID", "").strip()), "WRITE" in cand, "TOTAL", ch.get("TotalVotes", 0)))
    df = pd.DataFrame(rows, columns=COLS)
    print("ND 2026", len(df), df.groupby("office")["votes"].sum().to_dict())
    write("ND", 2026, df)


OH_PARTY = {"DEM": "DEMOCRAT", "DEMOCRATIC": "DEMOCRAT", "REP": "REPUBLICAN", "REPUBLICAN": "REPUBLICAN", "LIB": "LIBERTARIAN", "LIBERTARIAN": "LIBERTARIAN",
            "NON": "", "NONPARTISAN": "", "UNAFFILIATED": ""}


def _ohio_contest(name: str):
    """A county's contest title → (office, district), or None for contests the site does not map."""
    name = re.sub(r"\s+", " ", re.sub(r"<br\s*/?>", " ", name)).strip()
    name = re.sub(r"^For ", "", name)
    if name.startswith("Governor"):
        return "GOV", ""
    if re.match(r"U\.?S\.? Senator", name):
        return "USS", ""
    if m := re.match(r"(Representative to Congress|State Senator|State Representative) \(?(\d+)", name):
        return {"Representative to Congress": "USH", "State Senator": "SLDU", "State Representative": "SLDL"}[m.group(1)], m.group(2)
    return None


def _ohio_name(office: str, cand: str) -> str:
    cand = re.sub(r"\s+", " ", cand).strip()
    if office == "GOV":  # some counties print the ticket, some the governor only
        cand = re.split(r"\s+(?:and|&|/)\s+", cand)[0]
    return cand.upper()


OH_TICKET = {"ACTON": "DEM", "RAMASWAMY": "REP", "KISSICK": "LIB", "BROWN": "DEM", "HUSTED": "REP", "REDPATH": "LIB"}
_OH_ROW = re.compile(r"^\s*(.*?\S)\s+([\d,]+)(?:\s+[\d.]+%)?((?:\s+[\d,]+){2,})\s*$")
_OH_NUMS = re.compile(r"^\s*([\d,]+)(?:\s+[\d.]+%)?((?:\s+[\d,]+){2,})\s*$")
_OH_PARTY = re.compile(r"^(REP|DEM|LIB|OPC|NP|NON|IND|GRN)\s+(.*)$", re.I)


def _ohio_precinct_report(pdf: Path) -> list[tuple[str, str, str, str, int]]:
    """A county "Precinct Report" / "Precinct Summary … with Group Detail" PDF (pdftotext -layout): a precinct
    heading, then per contest the title, "Vote For N", and one row per candidate whose first number is the
    TOTAL. → (precinct, contest, candidate, party, votes). A long ticket wraps: the name on one line, its
    numbers on the next."""
    import subprocess
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    out, prec = [], None
    for page in text.split("\f"):
        body = [x for x in page.split("\n")[3:] if x.strip()]  # three running-header lines
        contest, pending = None, None
        for i, line in enumerate(body):
            s = line.strip()
            nxt = body[i + 1].strip() if i + 1 < len(body) else ""
            nxt2 = body[i + 2].strip() if i + 2 < len(body) else ""
            if re.match(r"Vote For \d", s):
                continue
            if re.match(r"Vote For \d", nxt):
                contest, pending = re.sub(r"\s+", " ", s), None
                continue
            m = _OH_ROW.match(line)
            nm = _OH_NUMS.match(line)
            if nm and pending and contest:
                name, votes = pending, nm.group(1)
            elif m and contest and not nm:
                name, votes = m.group(1).strip(), m.group(2)
            else:
                opens = re.match(r"Vote For \d", nxt2) or re.match(r"statistics", nxt, re.I) or re.match(r"statistics", nxt2, re.I)
                if opens and not re.search(r"Turnout|Registered|Ballots Cast|\bTOTAL\b|%\s*$", s):
                    prec, contest = re.sub(r"\s+", " ", s), None  # precinct heading: the next line opens a contest
                elif contest and not nm and i + 1 < len(body) and _OH_NUMS.match(body[i + 1]):
                    pending = s
                continue
            pending = None
            if re.match(r"(Total Votes Cast|Overvotes|Undervotes|Contest Totals|Write-In: |Not Assigned|Unresolved)", name, re.I):
                continue
            pm = _OH_PARTY.match(name)
            party, name = (pm.group(1).upper(), pm.group(2)) if pm else ("", name)
            out.append((prec, contest, name, party, int(votes.replace(",", ""))))
    return out


def ohio_2026() -> None:
    """County boards of elections, official canvass (complete by Nov 24, 2026). The state has not published a
    statewide precinct file, so this reads whatever county files are in raw/official/oh/ and the state is
    partial until all 88 are there. Files are named {county number}_{county}.{ext}; the number (1-88,
    alphabetical) gives the FIPS code. All vote types are already in the precinct. The U.S. Senate race is
    the unexpired-term election, Ohio's only one. Three layouts:
      .pdf          "Precinct Report" / "Precinct Summary with Group Detail" (_ohio_precinct_report above)
      .xlsx / .csv  "ElectionResultsCSV", the counties' standard precinct export: three header rows (contest /
                    party / "Party Name"), then one row per precinct: COUNTY NUMBER, PRECINCT CODE, PRECINCT
                    NAME, REGISTERED VOTERS, TOTAL VOTERS, one column per candidate. The last rows (COUNTY
                    TOTALS, code ZZZ, and notes with no code) are left out.
      .json         Enhanced Voting export (app.enhancedvoting.com/cdn/results/{county}/export-{election}.json):
                    ballotItems → ballotOptions → precinctResults.
    Sources (county results pages are listed at ohiosos.gov/directories/local-election-results):
      18 Cuyahoga  app.enhancedvoting.com/cdn/results/cuyahoga-county-oh/export-GE2026.json
      25 Franklin  vote.franklincountyohio.gov/election-info/2026 "Official Results - by Precinct (XLSX)"
      77 Summit    app.enhancedvoting.com/cdn/results/summit-county-oh/export-Nov2026General.json
      13 Clermont  boe.clermontcountyohio.gov/election_results/ "Precinct Report - Official Results" (OPrecinct.pdf)
      54 Mercer    mercercountyoh.gov board-of-elections-election-results "General Detail OFFICIAL"
      62 Ottawa    boe.ottawa.oh.gov/current-results/ "Precinct Level Official Summary"
    """
    import json
    # The 2024 map names a precinct "COLS 01-A" and keeps the county's precinct code in its id ("… (AAN)").
    # Where a county file carries the same code, the map's own name is used, so the join is exact.
    code_name: dict[tuple[str, str], str] = {}
    map_names: dict[str, set[str]] = {}
    for line in (ROOT / "data-entry" / "precincts" / "anchor" / "OH.geojsonl").open():
        a = json.loads(line)
        a = a.get("properties", a)
        if m := re.search(r"\(([A-Z]{3})\)$", a["geoid"]):
            code_name[(a["county"], m.group(1))] = a["name"]
        map_names.setdefault(a["county"], set()).add(a["name"])

    def tidy(name: str) -> str:
        name = re.sub(r"\s+", " ", name).strip()
        name = re.sub(r"^\d{3} ", "", name)  # Summit numbers its precincts: "001 AKRON 1-A"
        return re.sub(r"\s+-", "-", name)  # Cuyahoga: "BAY VILLAGE -01-A"

    def on_map(fp: str, name: str) -> str:
        """The map's spelling where the county's is its start: "BAY 1" → "BAY 1 (PCS)"."""
        names = map_names.get(fp, set())
        if name in names:
            return name
        longer = [n for n in names if n.startswith(name + " (")]
        return longer[0] if len(longer) == 1 else name

    rows = []
    files = sorted(f for f in (RAW / "official" / "oh").iterdir() if f.suffix.lower() in (".xlsx", ".csv", ".json", ".pdf") and re.match(r"\d+_", f.name))
    for f in files:
        fp = f"39{2 * int(f.name.split('_')[0]) - 1:03d}"
        n0 = len(rows)
        if f.suffix.lower() == ".pdf":
            for prec, contest, cand, party, votes in _ohio_precinct_report(f):
                c = _ohio_contest(contest)
                if not c or prec is None:
                    continue
                cand = "WRITE-IN" if cand.upper().startswith("WRITE-IN") else _ohio_name(c[0], cand)
                party = party or OH_TICKET.get(cand.split()[-1], "")
                rows.append((fp, "", on_map(fp, tidy(prec).upper()), c[0], c[1], cand, OH_PARTY.get(party, party), "WRITE" in cand, "TOTAL", votes))
            print(f"  {f.name}: {len({r[2] for r in rows[n0:]})} precincts, {len(rows) - n0} rows")
            continue
        if f.suffix.lower() == ".json":
            d = json.loads(f.read_text())
            for item in d["results"]["ballotItems"]:
                c = _ohio_contest(item["name"])
                if not c:
                    continue
                for o in item["ballotOptions"]:
                    cand = _ohio_name(c[0], o["name"])
                    party = (o.get("politicalParty") or "").upper()
                    for p in o.get("precinctResults") or []:
                        rows.append((fp, "", tidy(p["name"]), c[0], c[1], cand, OH_PARTY.get(party, party), "WRITE" in cand, "TOTAL", p["voteCount"]))
            print(f"  {f.name}: {len(rows) - n0} rows ({d.get('createdAt', '')[:10]})")
            continue
        t = pd.read_excel(f, header=None, dtype=str) if f.suffix.lower() == ".xlsx" else pd.read_csv(f, header=None, dtype=str, encoding="latin-1")
        t = t.fillna("")
        if str(t.iat[0, 0]).strip().upper() != "COUNTY NUMBER":
            print("  skipped (not the standard export):", f.name)
            continue
        body = t.iloc[3:]
        body = body[(body[1].str.strip() != "") & (body[1].str.strip().str.upper() != "ZZZ")]
        pnames = [code_name.get((fp, code.strip().upper()), tidy(nm)) for code, nm in zip(body[1], body[2])]
        for j in range(5, t.shape[1]):
            name, party, cand = (re.sub(r"\s+", " ", str(t.iat[i, j])).strip() for i in (0, 1, 2))
            c = _ohio_contest(name)
            if not c:
                continue
            cand = _ohio_name(c[0], re.sub(rf"^{re.escape(party)}\s+", "", cand) if party else cand)
            v = pd.to_numeric(body[j].str.replace(",", ""), errors="coerce")
            for pname, votes in zip(pnames, v):
                if pd.notna(votes):  # blank = the precinct is outside the district
                    rows.append((fp, "", pname, c[0], c[1], cand, OH_PARTY.get(party.upper(), party.upper()), "WRITE" in cand, "TOTAL", votes))
        print(f"  {f.name}: {len(body)} precincts, {len(rows) - n0} rows")
    df = pd.DataFrame(rows, columns=COLS)
    print("OH 2026", df["county"].nunique(), "of 88 counties;", df.groupby("office")["votes"].sum().astype(int).to_dict())
    write("OH", 2026, df)


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
    if (st, year) == ("ND", 2026):
        north_dakota_2026()
    elif (st, year) == ("OH", 2026):
        ohio_2026()
    elif year == 2026:
        results_2026(st)
    elif st == "VA":
        virginia(year)
    elif (st, year) == ("KS", 2022):
        kansas_house_2022()
    else:
        sys.exit(f"no adapter for {st} {year}")


if __name__ == "__main__":
    main()
