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
    if m := re.match(r"(Representative to Congress|State Senator|State Representative)[ (-]*(\d+)", name):
        return {"Representative to Congress": "USH", "State Senator": "SLDU", "State Representative": "SLDL"}[m.group(1)], m.group(2)
    return None


def _ohio_name(office: str, cand: str) -> str:
    cand = re.sub(r"\s+", " ", cand).strip()
    if office == "GOV":  # some counties print the ticket, some the governor only
        cand = re.split(r"\s+(?:and|&|/)(?:\s+|$)", cand)[0]
    return cand.upper()


# Wayne County prints "05-01-Orr 4A"; the 2024 map has "PRECINCT ORRVILLE CITY 4-A".
OH_WAYNE = {"ORR": "ORRVILLE CITY", "RITT": "RITTMAN CITY", "WOO": "WOOSTER CITY", "BA": "BAUGHMAN TWP", "CA": "CANAAN TWP", "CHE": "CHESTER TWP",
            "CHIP": "CHIPPEWA TWP", "CLI": "CLINTON TWP", "CON": "CONGRESS TWP", "EU": "EAST UNION TWP", "FR": "FRANKLIN TWP", "GR": "GREEN TWP",
            "MIL": "MILTON TWP", "PAINT": "PAINT TWP", "PLAIN": "PLAIN TWP", "SALT": "SALT CREEK TWP", "SUG": "SUGAR CREEK TWP", "WAY": "WAYNE TWP",
            "WST": "WOOSTER TWP"}
OH_GOV = {"DEM": "AMY ACTON", "REP": "VIVEK RAMASWAMY", "LIB": "DON KISSICK"}
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


def _ohio_sovc(pdf: Path) -> list[tuple[str, str, str, str, int]]:
    """A county "Statement of Votes Cast" PDF whose pages open "Page: N of M" (pdftotext -layout). Each contest
    is a table of precinct rows with one column per candidate; a wide table continues on the next page with
    the remaining columns, so values are keyed by contest and precinct. Candidate names are printed sideways:
    pdftotext leaves each one as fragments that start at the same character column, which is how the columns
    are told apart. A row is either "PRECINCT n n PRECINCT n n" or, where the county prints vote types, a
    precinct heading (it may wrap over lines) followed by "Election Day … / Absentee … / Total …": the Total
    row is read. → (precinct, contest, candidate, party, votes); the Total Votes column is returned as the
    candidate "__TOTAL__" for the caller's check."""
    import subprocess
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    frag = re.compile(r"\S+(?: \S+)*")
    num = re.compile(r"[\d,]+")
    cells: dict[tuple[str, str], dict[str, int]] = {}
    contest, prec, heading_open = None, None, False
    for page in text.split("\f"):
        lines = [x for x in page.split("\n") if x.strip()]
        hdr, cols, start = [], None, 0
        for start, line in enumerate(lines):
            s = line.strip()
            if s.startswith("Page:"):
                continue
            if m := re.match(r"(.+?)\s*\(Vote for\s+\d+\)", s):
                contest, hdr = m.group(1), []
                continue
            if re.match(r"Precinct\b", s):
                xs: list[int] = []
                for h in hdr:
                    for f in frag.finditer(h):
                        if not any(abs(f.start() - x) <= 2 for x in xs):
                            xs.append(f.start())
                cols = [" ".join(f.group(0) for h in hdr for f in frag.finditer(h) if abs(f.start() - x) <= 2) for x in sorted(xs)]
                break
            hdr.append(line)
        if not cols or contest is None:
            continue
        for line in lines[start + 1:]:
            toks = re.split(r"\s{2,}", line.strip())
            if len(toks) > 1 and num.fullmatch(toks[-1]) and (m := re.match(r"^(.*?\S) ([\d,]+)$", toks[0])):
                toks[:1] = [m.group(1), m.group(2)]  # one space between the label and its first number
            nums = [t for t in toks if num.fullmatch(t)]
            names = [t for t in toks if not num.fullmatch(t)]
            code = bool(nums) and not names and all(re.fullmatch(r"\d{3}", t) for t in nums) and len(set(nums)) == 1
            if not nums or code:  # a precinct heading, or the next line of one
                part = nums[0] if code else names[0]
                if part.startswith("Cumulative"):
                    break  # a block of zeros after the county total; it is not a precinct
                if re.fullmatch(r"(County|[A-Z][a-z]+)", part) and not heading_open:
                    continue  # the "County / Hancock" lines under the column header
                prec = f"{prec} {part}" if heading_open else part
                heading_open = True
                continue
            heading_open = False
            label = names[0] if names else ""
            if re.match(r"(County|Cumulative)", label):
                break  # the county's own totals close the table; what follows on the page is not a precinct
            if label != "Total" and re.match(r"(Election Day|Absentee|Provisional)|.*Total$", label):
                continue
            who = prec if label == "Total" else label
            if who is None or len(nums) != len(cols):
                continue
            cells.setdefault((contest, who), {}).update({c: int(v.replace(",", "")) for c, v in zip(cols, nums)})
    out = []
    for (contest, who), row in cells.items():
        for col, votes in row.items():
            if re.search(r"Times Cast|Registered|Unresolved", col):
                continue
            pm = re.search(r"\(([A-Z]{2,4})\)", col)
            name = "__TOTAL__" if col == "Total Votes" else "WRITE-IN" if "Write" in col else re.sub(r"\s*\([A-Z]{2,4}\)", "", col).strip()
            out.append((who, contest, name, pm.group(1) if pm else "", votes))
    return out


def _ohio_table_report(pdf: Path) -> list[tuple[str, str, str, str, int]]:
    """A county SOVC table PDF ("Custom Table Report", "SOVC Report", Lorain's "Precinct Canvass"): per page
    one or more contests side by side, each a title, "VOTE FOR N", candidate names printed sideways, then one
    row per precinct and a Totals row. Read from word positions (pdftotext -bbox):
      rows      words on one baseline that open with a label at the left and carry numbers
      columns   the right edges of those numbers; a sideways header word belongs to the first column whose
                right edge is at or past its left edge (a name runs over one or two strips, first line
                rightmost, read top to bottom)
      contests  the columns are cut into as many runs as there are "VOTE FOR" marks, so that each run is
                centred under its mark; the title is the text stacked above the mark
    Each candidate column is checked against the table's Totals row."""
    import itertools
    import subprocess
    html = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    word = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
    num = re.compile(r"[\d,]+")
    sideways = lambda w: abs((w[2] - w[0]) - 7.4) < 0.7  # noqa: E731  (a rotated word is one line-height wide)
    out, running, off = [], {}, []
    for page in html.split("<page ")[1:]:
        ws = [(float(a), float(b), float(c), float(d), t.replace("&amp;", "&").replace("&apos;", "'")) for a, b, c, d, t in word.findall(page)]
        marks = sorted(w for w in ws if w[4] == "VOTE")
        if not marks:
            continue
        vy, centres = marks[0][1], [w[0] + 24 for w in marks]
        lines: dict[int, list] = {}
        ys: list[float] = []
        for w in sorted(ws, key=lambda w: w[1]):
            if w[1] > vy + 8 and (not sideways(w) or num.fullmatch(w[4])):
                yc = (w[1] + w[3]) / 2
                if not ys or yc - ys[-1] > 3:
                    ys.append(yc)
                lines.setdefault(len(ys), []).append(w)
        rows = []
        for k in sorted(lines):
            line = sorted(lines[k])
            text = " ".join(w[4] for w in line)
            if line[0][0] < 120 and not num.fullmatch(line[0][4]) and any(num.fullmatch(w[4]) for w in line[1:]) and not re.search(r"Precincts|\d\d/\d\d/\d{4}|Copyright|Report generated", text):
                rows.append(line)
        if not rows:
            continue
        cols: list[int] = []
        for x in sorted({round(w[2]) for r in rows for w in r if num.fullmatch(w[4]) and w[0] > 150}):
            if not cols or x - cols[-1] > 4:
                cols.append(x)
        skip_y = {round(w[1]) for w in ws if w[4] in ("Precincts", "Reporting")}
        names: dict[int, list] = {}
        for w in ws:
            if vy + 8 < w[1] < rows[0][0][1] - 1 and sideways(w) and round(w[1]) not in skip_y:
                c = min((x for x in cols if x >= w[0] - 1), default=None)
                if c is not None and c - w[0] < 24:
                    names.setdefault(c, []).append(w)
        cols = [c for c in cols if c in names]
        if not cols:
            continue
        label = {c: " ".join(w[4] for w in sorted(names[c], key=lambda w: (-round(w[0]), w[1]))) for c in cols}
        pitch = min((b_ - a_ for a_, b_ in zip(cols, cols[1:])), default=42)
        mids = [c - (pitch / 2 - 4) for c in cols]
        groups = [list(range(len(cols)))]
        if len(centres) > 1 and len(cols) >= len(centres):
            best = None
            for cuts in itertools.combinations(range(1, len(cols)), len(centres) - 1):
                edges = [0, *cuts, len(cols)]
                g = [list(range(edges[i], edges[i + 1])) for i in range(len(centres))]
                cost = sum(abs(sum(mids[j] for j in run) / len(run) - v) for run, v in zip(g, centres))
                if best is None or cost < best[0]:
                    best = (cost, g)
            groups = best[1]
        titles = []
        for v in centres:
            near = [w for w in ws if 60 < w[1] < vy - 2 and abs((w[0] + w[2]) / 2 - v) == min(abs((w[0] + w[2]) / 2 - u) for u in centres)]
            keep, last = [], vy
            for y in sorted({round(w[1]) for w in near}, reverse=True):
                lw = [w for w in near if round(w[1]) == y]
                if last - y > (60 if last == vy else 15) or any(re.fullmatch(r"[\d,.]+%?", w[4]) or w[4] == "Totals" for w in lw):
                    break
                keep, last = lw + keep, y
            titles.append(" ".join(w[4] for w in sorted(keep, key=lambda w: (round(w[1]), w[0]))))
        contest_of = {cols[j]: titles[i] for i, run in enumerate(groups[:len(titles)]) for j in run}
        for r in rows:
            who = " ".join(w[4] for w in r if w[2] < cols[0] - 30)
            for w in r:
                if not num.fullmatch(w[4]) or w[2] < cols[0] - 30:
                    continue
                c = min(cols, key=lambda x: abs(x - w[2]))
                if abs(c - w[2]) > 5 or c not in contest_of or re.search(r"Total|votes|Write-in", label[c], re.I):
                    continue
                key, v = (contest_of[c], label[c]), int(w[4].replace(",", ""))
                if who == "Totals":
                    if running.get(key, 0) != v:
                        off.append((key, running.get(key, 0), v))
                    running[key] = 0
                    continue
                running[key] = running.get(key, 0) + v
                pm = re.match(r"^(DEM|REP|LIB|OPC|GRN|IND) (.*)$", label[c]) or re.match(r"^()(.*?) \(([DRL])\)$", label[c])
                party = (pm.group(1) or {"D": "DEM", "R": "REP", "L": "LIB"}[pm.group(3)]) if pm else ""
                out.append((who, contest_of[c], pm.group(2) if pm else label[c], party, v))
    # A candidate filed under two contests of the same kind on different pages belongs to the one that holds
    # most of the votes (a page where two district titles sit too close to tell apart).
    kind = lambda t: re.sub(r"\d+(st|nd|rd|th)?", "#", t, flags=re.I)  # noqa: E731
    votes: dict[tuple[str, str], dict[str, int]] = {}
    for who, contest, name, party, v in out:
        votes.setdefault((kind(contest), name), {}).setdefault(contest, 0)
        votes[(kind(contest), name)][contest] += v
    home = {k: max(d, key=d.get) for k, d in votes.items()}
    out = [(who, home[(kind(contest), name)], name, party, v) for who, contest, name, party, v in out]
    want = [o for o in off if _ohio_contest(o[0][0]) and home.get((kind(o[0][0]), re.sub(r"^(DEM|REP|LIB|OPC|GRN|IND) | \([DRL]\)$", "", o[0][1]))) == o[0][0]]
    if want:
        print(f"  {pdf.name}: columns that do not add to a printed Totals row: {want[:6]}")
    return out


def _ohio_hart(pdf: Path) -> list[tuple[str, str, str, str, int]]:
    """A county "Statement of Votes Cast" PDF in the layout Union County prints: a contest title, a column
    header whose names wrap over three lines, then per precinct a heading ("01 ALLEN 1") and Normal /
    Absentee / Provisional rows of "votes pct" pairs, which are summed. The header is read from word
    positions (pdftotext -bbox-layout): words on a line closer than a word space apart form a run, and runs
    that start at the same x are one column. A narrow contest shares its page with a turnout block on the
    left (the contest starts at the right-hand "Reg."), and a wide one continues on the next page. Total
    Votes comes back as "__TOTAL__" for the caller's check."""
    import subprocess
    run = lambda flag: subprocess.run(["pdftotext", flag, str(pdf), "-"], capture_output=True, text=True, check=True).stdout  # noqa: E731
    word = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</word>')
    cells: dict[tuple[str, str], dict[str, int]] = {}
    prec = None
    for html, text in zip(run("-bbox-layout").split("<page ")[1:], run("-layout").split("\f")):
        ws = [(float(a), float(b), float(c), t.replace("&amp;", "&").replace("&apos;", "'")) for a, b, c, t in word.findall(html)]
        reg = [w for w in ws if w[3] == "Reg."]
        if not reg:
            continue
        x0, y0 = max(reg)[0] - (12 if any(w[3] == "Counter" for w in ws) else 1), max(reg)[1]
        # Warren County's variant: "Counter Group | Ballots Cast | Reg. Voters | Total Votes | names…", the header
        # starts on the "Reg." line and runs down to the first "Precinct NAME 136" heading, whose Total row is read.
        counter = any(w[3] == "Counter" for w in ws)
        first_row = min((w[1] for w in ws if w[1] > y0 + 5 and w[0] < 120 and w[3] in ("Precinct", "Absentee", "Election", "Early", "Provisional", "Total")), default=y0 + 40)
        lo, hi = (y0 - 2, first_row - 2) if counter else (y0 - 12, y0 + 12)
        runs: list[list] = []
        for y in sorted({round(w[1]) for w in ws if lo <= w[1] <= hi}):
            cur = None
            for w in sorted(w for w in ws if round(w[1]) == y and w[0] >= x0):
                if cur and w[0] - cur[2] <= 4:
                    cur[2], cur[3] = w[2], cur[3] + " " + w[3]
                else:
                    cur = [w[0], y, w[2], w[3]]
                    runs.append(cur)
        # Union's header lines share a left edge; Warren's are centred over the column.
        at = (lambda r: (r[0] + r[2]) / 2) if counter else (lambda r: r[0])
        tol = 5 if counter else 3
        xs: list[float] = []
        for r in sorted(runs, key=at):
            if not any(abs(at(r) - x) <= tol for x in xs):
                xs.append(at(r))
        cols: list[str] = []
        for x in sorted(xs):
            c = " ".join(r[3] for r in sorted(runs, key=lambda r: r[1]) if abs(at(r) - x) <= tol)
            if cols and re.fullmatch(r"\([A-Z]{1,3}\)", c):
                cols[-1] += " " + c  # a party tag pushed off its name's left edge
            else:
                cols.append(c)
        above = [w for w in ws if y0 - 60 <= w[1] < lo - (0 if counter else 0) and (counter or w[1] > 90) and (counter or w[0] >= x0) and w[1] < y0 - 2]
        if not above:
            continue
        ty = max(round(w[1]) for w in above)
        title = " ".join(w[3] for w in sorted(above) if round(w[1]) == ty)
        page: dict[str, dict[str, int]] = {}
        prec = prec if counter else None  # Warren's precinct blocks run over the page break
        for line in text.split("\n"):
            s = line.strip()
            if counter:
                if m := re.match(r"Precinct (.+?) \d+$", s):
                    prec = m.group(1)
                    continue
                if s.startswith("All Precincts"):
                    prec = None  # the county's own totals follow
                    continue
                m = re.match(r"(Total)\s+(.*)$", s)
            else:
                m = re.match(r"(Normal|Absentee|Provisional)\s+(.*)$", s)
            if m:
                ints = [int(x.replace(",", "")) for x in m.group(2).split() if re.fullmatch(r"[\d,]+", x)]
                if counter:
                    ints = ints[1:]  # Ballots Cast stands left of "Reg."
                if prec is None or len(ints) - len(cols) not in (0, 2):
                    continue
                row = page.setdefault(prec, {})
                for c, v in zip(cols, ints[-len(cols):]):
                    row[c] = row.get(c, 0) + v
            elif not counter and re.match(r"\d\d [A-Z]", s):
                prec = s
            elif s.startswith("Total"):
                prec = None
        for who, row in page.items():
            cells.setdefault((title, who), {}).update(row)
    out = []
    for (title, prec), row in cells.items():
        for col, votes in row.items():
            if re.match(r"(Reg\.|Over|Under)", col):
                continue
            pm = re.search(r"\(([A-Z]{1,3})\)$", col)
            party = {"D": "DEM", "R": "REP", "L": "LIB", "O": "OPC"}.get(pm.group(1), "") if pm else ""
            name = "__TOTAL__" if col == "Total Votes" else "WRITE-IN" if col == "Write-in" or (pm and pm.group(1) == "WI") else re.sub(r"\s*\([A-Z]{1,3}\)$", "", col)
            out.append((prec, title, name, party, votes))
    return out


def _ohio_key_canvass(path: Path) -> list[tuple[str, str, str, str, int]]:
    """A county "Numbered Key Canvass" text file: per page a contest title, a two-column legend
    "01 = Amy Acton and David Pepper (DEM)   63157   52.91" (a long name wraps onto the next line), then one
    row per precinct, "00100 001 Ashley  147 23 197 …", with one number per key. Each key's precinct sum is
    checked against the legend's VOTES."""
    out, sums, printed = [], {}, {}
    for page in re.split(r"(?=RUN DATE:)", path.read_text(errors="replace")):
        lines = page.split("\n")
        at = next((i for i, x in enumerate(lines) if re.search(r"VOTES\s+PERCENT", x)), None)
        if at is None:
            continue
        title = next((x.strip() for x in lines[at + 1:] if x.strip()), "")
        keys: dict[str, str] = {}
        last = [None, None]
        for x in lines[at + 2:]:
            if re.match(r"\s*-{10,}", x):
                break
            cut = next((m.start() for m in re.finditer(r"\d\d = ", x) if m.start() > 40), len(x))  # where the right-hand column starts
            for side, part in enumerate((x[:cut], x[cut:])):
                if m := re.match(r"\s*(\d\d) = (.*?)(?:\s{2,}(\d+)\s|\s*$)", part + " "):
                    keys[m.group(1)], last[side] = m.group(2).strip(), m.group(1)
                    if m.group(3):
                        printed[(title, m.group(1))] = int(m.group(3))
                elif part.strip() and last[side] and not re.search(r"\d{2,}", part):
                    keys[last[side]] += " " + part.strip()
        order = sorted(keys)
        for x in lines:
            if m := re.match(r"^\d{5} \d{3} (.+?)\s{2,}([\d ]+)$", x.rstrip()):
                nums = m.group(2).split()
                if len(nums) != len(order):
                    continue
                for k, v in zip(order, nums):
                    name = keys[k]
                    if re.search(r"OVER VOTES|UNDER VOTES", name):
                        continue
                    pm = re.search(r"\(([A-Z]{1,3})\)\s*$", name)
                    party = pm.group(1) if pm and pm.group(1) != "W" else ""
                    cand = "WRITE-IN" if (pm and pm.group(1) == "W") or name == "WRITE-IN" else re.sub(r"\s*\([A-Z]{1,3}\)\s*$", "", name)
                    out.append((m.group(1).strip(), title, cand, party, int(v)))
                    sums[(title, k)] = sums.get((title, k), 0) + int(v)
    off = {k: (sums.get(k), v) for k, v in printed.items() if k in sums and sums[k] != v and _ohio_contest(k[0])}
    if off:
        print(f"  {path.name}: keys that do not add to the legend's VOTES: {off}")
    return out


def ohio_2026() -> None:
    """County boards of elections, official canvass (complete by Nov 24, 2026). The state has not published a
    statewide precinct file, so this reads whatever county files are in raw/official/oh/ and the state is
    partial until all 88 are there. Files are named {county number}_{county}.{ext}; the number (1-88,
    alphabetical) gives the FIPS code. All vote types are already in the precinct. The U.S. Senate race is
    the unexpired-term election, Ohio's only one. Layouts:
      .pdf          four report layouts, told apart by the first page: _ohio_precinct_report, _ohio_sovc,
                    _ohio_table_report and _ohio_hart above
      .txt          "Numbered Key Canvass" (_ohio_key_canvass above)
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
      17 Crawford  crawfordcountyohioboe.gov/election-results/ "Official Precinct Results (SOVC) 11-3-2026"
      47 Lorain    voteloraincountyohio.gov/election-results-1/2026-general-election-information "Canvass"
      59 Morrow    boe.morrowcountyohio.gov/new_page/index.php "November 3, 2026 SOVC Official Results"
      21 Delaware  vote.delawarecountyohio.gov "Number Key Canvass" (Number_Key_Canvass_421Official.txt)
      30 Guernsey  boe.guernseycounty.gov/documents/ "Official November 3, 2026 General Election SOVC Report"
      32 Hancock   hancockcountyohioelections.gov/2026-november-general-precinct-by-precinct/ (2026-GEN-SOVC.pdf)
      80 Union     unioncountyohio.gov/departments/boe/boe-election-results "Official Statement of Votes Cast"
      83 Warren    vote.warrencountyohio.gov "Official Election Results and Statement of Ballots Cast" (PDF)
      85 Wayne     waynecountyoh.gov/gen26results/ "Gen-26-OFFICIAL-StatementOfVotesCastRPT.pdf"
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
        name = re.sub(r"^\d{2,4} ", "", name)  # Summit numbers its precincts: "001 AKRON 1-A" (Guernsey prints one as "0014")
        return re.sub(r"\s+-", "-", name)  # Cuyahoga: "BAY VILLAGE -01-A"

    def on_map(fp: str, name: str) -> str:
        """The map's spelling where the county's is its start: "BAY 1" → "BAY 1 (PCS)"."""
        names = map_names.get(fp, set())
        if name in names:
            return name
        if fp == "39169" and (m := re.match(r"^\d\d-\d\d-([A-Z]+) (\d+)([A-Z])?\b", name)) and m.group(1) in OH_WAYNE:
            stem = f"PRECINCT {OH_WAYNE[m.group(1)]} {m.group(2)}" + (f"-{m.group(3)}" if m.group(3) else "")
            hit = [n for n in names if n == stem or n.startswith(stem + " ")]
            if len(hit) == 1:
                return hit[0]
        longer = [n for n in names if n.startswith(name + " (")]
        if len(longer) == 1:
            return longer[0]
        key = re.sub(r"[^A-Z0-9]", "", name)  # "LONDONDERRY/WASHINGT ON" → the map's "PRECINCT LONDONDERRY/WASHINGTON"
        same = [n for n in names if re.sub(r"[^A-Z0-9]", "", re.sub(r"^PRECINCT ", "", n)) == key]
        if len(same) == 1:
            return same[0]
        words = {"E": "EAST", "W": "WEST", "N": "NORTH", "S": "SOUTH", "VLG": "VILLAGE", "TWP": "TOWNSHIP", "PRECINCT": ""}
        spell = lambda n: re.sub(r"[^A-Z0-9]", "", " ".join(words.get(t, t) for t in re.split(r"[ \-]", n)))  # noqa: E731
        same = [n for n in names if spell(n) == spell(name)]
        return same[0] if len(same) == 1 else name

    # Some county reports print no party: the site's 2026 roster names each district's Democrat and Republican.
    roster: dict[tuple[str, str, str], str] = {}
    with open(ROOT / "data-entry" / "results-2026" / "races.csv", newline="") as fh:
        import csv
        for r in csv.DictReader(fh):
            office = {"house": "USH", "state_senate": "SLDU", "state_house": "SLDL"}.get(r["office"])
            if r["state"] == "OH" and office:
                for col, party in (("dem_candidate", "DEM"), ("rep_candidate", "REP")):
                    if r[col].strip():
                        roster[(office, re.sub(r"-P\d+$", "", r["seat"]), re.sub(r"[^A-Z]", "", re.sub(r",? (JR|SR|II|III)\.?$", "", r[col].upper()).split()[-1]))] = party

    rows = []
    files = sorted(f for f in (RAW / "official" / "oh").iterdir() if f.suffix.lower() in (".xlsx", ".csv", ".json", ".pdf", ".txt") and re.match(r"\d+_", f.name))
    for f in files:
        fp = f"39{2 * int(f.name.split('_')[0]) - 1:03d}"
        n0 = len(rows)
        if f.suffix.lower() in (".pdf", ".txt"):
            import subprocess
            first = early = ""
            if f.suffix.lower() == ".pdf":
                first = subprocess.run(["pdftotext", "-l", "1", str(f), "-"], capture_output=True, text=True).stdout.lstrip()
                early = subprocess.run(["pdftotext", "-l", "4", str(f), "-"], capture_output=True, text=True).stdout
            parsed = _ohio_key_canvass(f) if f.suffix.lower() == ".txt" else _ohio_sovc(f) if first.startswith("Page:") else _ohio_hart(f) if "Statement of Votes Cast" in early or "Counter" in early else _ohio_table_report(f) if re.search(r"VOTE FOR \d", early) else _ohio_precinct_report(f)
            check: dict[tuple[str, str], list[int]] = {}
            for prec, contest, cand, party, votes in parsed:
                c = _ohio_contest(contest)
                if not c or prec is None:
                    continue
                k = check.setdefault((prec, contest), [0, -1])
                if cand == "__TOTAL__":
                    k[1] = votes
                    continue
                k[0] += votes
                cand = "WRITE-IN" if cand.upper().startswith("WRITE-IN") else _ohio_name(c[0], cand)
                if c[0] == "GOV" and party in OH_GOV:  # a table report keeps only the start of a long ticket
                    cand = OH_GOV[party]
                party = party or OH_TICKET.get(cand.split()[-1], "")
                party = party or roster.get((c[0], c[1], re.sub(r"[^A-Z]", "", cand.split()[-1])), "")
                rows.append((fp, "", on_map(fp, tidy(prec).upper()), c[0], c[1], cand, OH_PARTY.get(party, party), "WRITE" in cand, "TOTAL", votes))
            off = [k for k, (got, want) in check.items() if want >= 0 and got != want]
            print(f"  {f.name}: {len({r[2] for r in rows[n0:]})} precincts, {len(rows) - n0} rows" + (f"; {len(off)} precinct-contests do not add to the printed Total Votes, e.g. {off[:3]}" if off else ""))
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
    # A table report keeps only the start of a long name ("SHERROD"): take the full name another county prints
    # for the same office, district and party.
    full = df.groupby(["office", "district", "party"])["candidate"].unique()
    fix = {}
    for (office, district, party), names in full.items():
        for short in names:
            longer = [n for n in names if n != short and n.startswith(short + " ")]
            if party and len(longer) == 1:
                fix[(office, district, party, short)] = longer[0]
    if fix:
        df["candidate"] = [fix.get((o, d_, p_, c_), c_) for o, d_, p_, c_ in zip(df["office"], df["district"], df["party"], df["candidate"])]
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
