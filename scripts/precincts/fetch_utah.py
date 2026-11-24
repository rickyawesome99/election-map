#!/usr/bin/env python3
"""Utah 2026 precinct results from the counties' official precinct reports.

Utah's results site (electionresults.utah.gov, Enhanced Voting) has no precinct export; each of the 29
counties uploads its own "Official Precinct Results" report. The report index is the election's JSON
(/results/public/api/elections/Utah/General11032026 → publicReportCategories), and each file is at
/cdn/results/{jurisdictionId}/{blobName}. Saved to data-entry/precincts/raw/official/ut/2026/{County}.{ext}.

Formats (2026):
  Salt Lake    xlsx "Statement of Votes Cast": one contest per sheet, precincts down, candidates across
  Davis        xlsx "SOVC Template": one wide sheet, contests across (row 5), candidates below (row 7, party prefix)
  Uintah       PDF "Custom Table Report": contests in column blocks, precincts down (table_report())
  Summit       PDF precinct table with rotated candidate names: not read yet (NOT_READ); county totals fill it
  most others  PDF "Summary Results Report" (ES&S), one block per precinct: contest, "PARTY NAME   votes" lines
  9 counties   scanned PDFs with no text layer (Carbon, Daggett, Garfield, Juab, Kane, Morgan, Piute, San Juan,
               Sanpete): not read. No OCR here; their votes come in through the county totals below.

Small precincts are suppressed ("****", "Suppressed") to protect voter privacy. Wherever the precinct rows fall
short of a county's official figure, scripts/precincts/build_results_medsl.py fills the gap with a countywide line
spread over the county's precincts (fill_from_certified). The county figures it compares against are written here
to raw/official/ut/certified_by_county_2026.csv from the site's own 2026 results (data-entry/results-2026/
counties.csv: Utah's official county export).

  python3 scripts/precincts/fetch_utah.py            # download what is missing, parse, write
  python3 scripts/precincts/fetch_utah.py --refresh  # download every report again
Then: python3 scripts/precincts/build_results_medsl.py 2026 UT
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from split_official import COLS, write  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "data-entry" / "precincts" / "raw" / "official" / "ut"
API = "https://electionresults.utah.gov/results/public/api/elections/Utah/General11032026"
UA = {"User-Agent": "Mozilla/5.0"}
SCANNED = {"Carbon", "Daggett", "Garfield", "Juab", "Kane", "Morgan", "Piute", "San Juan", "Sanpete"}
PARTY = {"DEM": "DEMOCRAT", "REP": "REPUBLICAN", "LIB": "LIBERTARIAN", "CON": "CONSTITUTION", "FWD": "FORWARD", "UNA": "UNAFFILIATED",
         "IAP": "INDEPENDENT AMERICAN", "GRN": "GREEN", "UUP": "UNITED UTAH", "NLP": "NATURAL LAW", "IND": "INDEPENDENT"}
OFFICE_RE = [
    (re.compile(r"^(?:U\.?\s?S\.?|UNITED STATES)\s+(?:HOUSE|REPRESENTATIVE|CONGRESS)\w*\s+(?:DISTRICT\s+|DIST\.?\s+)?(\d+)\b", re.I), "USH"),
    (re.compile(r"^(?:UTAH\s+)?STATE\s+SENATE?\w*\s+(?:DISTRICT\s+|DIST\.?\s+)?(\d+)\b", re.I), "SLDU"),
    (re.compile(r"^(?:UTAH\s+)?STATE\s+(?:HOUSE|REPRESENTATIVE)\w*\s+(?:DISTRICT\s+|DIST\.?\s+)?(\d+)\b", re.I), "SLDL"),
]


def office_of(text: str) -> tuple[str, str] | None:
    t = re.sub(r"\s+", " ", text or "").strip()
    for rx, office in OFFICE_RE:
        m = rx.match(t)
        if m:
            return office, str(int(m.group(1)))
    return None


def split_party(cell: str) -> tuple[str, str]:
    """'DEM PETER CROSBY' / 'JESSE WEST (LIB)' / 'AYDEN SCOTT' → (name, party word)."""
    c = re.sub(r"\s+", " ", cell or "").strip()
    m = re.fullmatch(r"(.*?)\s*\(([A-Z]{3})\)", c)
    if m and m.group(2) in PARTY:
        return m.group(1).strip(), PARTY[m.group(2)]
    m = re.fullmatch(r"([A-Z]{3})\s+(.*)", c)
    if m and m.group(1) in PARTY:
        return m.group(2).strip(), PARTY[m.group(1)]
    return c, ""


def surname(name: str) -> str:
    words = [w for w in re.sub(r"[^A-Z ]", " ", name.upper()).split() if w not in ("JR", "SR", "II", "III", "IV")]
    return words[-1] if words else ""


def strip_county_number(precinct: str, fips: str) -> str:
    """Counties prefix precinct names with Utah's county number (alphabetical, 1-29 = FIPS (n+1)/2): Davis
    "6BO01:I-S-", Iron "11 3PK", Wasatch "26-100 Heber City NW", Emery "0801 EMERY". The 2024 precinct layer
    names carry no prefix, so it is dropped (keeping the rest for the name match)."""
    n = (int(fips[2:]) + 1) // 2
    return re.sub(rf"^0?{n}(?:\s+|-|(?=[A-Z])|(?=\d\d\b))", "", precinct.strip(), count=1).strip() or precinct


# ---------------------------------------------------------------- download

def fetch(refresh: bool) -> dict[str, Path]:
    d = json.loads(urllib.request.urlopen(urllib.request.Request(API, headers=UA), timeout=120).read())
    cat = next(c for c in d["publicReportCategories"] if c.get("categoryName") == "Official Precinct Results")
    out = {}
    (DIR / "2026").mkdir(parents=True, exist_ok=True)
    for r in cat["reports"]:
        county = r["county"].replace(" County", "")
        blob = r["versions"][-1]["blobName"] if r.get("versions") else r["blobName"]
        path = DIR / "2026" / f"{county}{Path(blob).suffix.lower()}"
        if refresh or not path.exists():
            url = f"https://electionresults.utah.gov/cdn/results/{d['jurisdictionId']}/{urllib.parse.quote(blob)}"
            path.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read())
            print(f"  {county}: {path.stat().st_size:,} bytes")
        out[county] = path
    return out


# ---------------------------------------------------------------- readers: each yields (precinct, office, district, candidate, party, votes)

def salt_lake(path: Path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        if len(rows) < 5 or not rows[1] or not rows[1][0]:
            continue
        o = office_of(str(rows[1][0]).split("(")[0])
        if not o:
            continue
        head = rows[3]
        cols = [(j, *split_party(str(h))) for j, h in enumerate(head) if j > 4 and h and str(h).strip() not in ("Total Votes",) and "Unresolved" not in str(h)]
        for r in rows[4:]:
            p = str(r[0] or "").strip() if r else ""
            if not p or p in ("County",) or "Total" in p or "Cumulative" in p or p.endswith("County"):
                continue
            for j, name, party in cols:
                v = r[j] if j < len(r) else None
                if isinstance(v, (int, float)):
                    yield p, o[0], o[1], name, party, int(v)


def davis(path: Path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = [list(r) for r in wb["SOVC Template"].iter_rows(values_only=True)]
    hrow = next(i for i, r in enumerate(rows) if len(r) > 1 and r[1] == "Precinct")
    contests, cands = rows[hrow], rows[hrow + 2]
    cols, cur = [], None
    for j in range(len(cands)):
        if j < len(contests) and contests[j]:
            cur = office_of(str(contests[j]))
        if cur and cands[j]:
            cols.append((j, cur, *split_party(str(cands[j]))))
    for r in rows[hrow + 3:]:
        p = str(r[1] or "").strip() if len(r) > 1 else ""
        if not p or "total" in p.lower():
            continue
        for j, (office, dist), name, party in cols:
            v = r[j] if j < len(r) else None
            if isinstance(v, (int, float)):
                yield p, office, dist, name, party, int(v)


def pdf_text(path: Path) -> str:
    return subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True).stdout


NUM = re.compile(r"^(.*?\S)\s{2,}([\d,]+)(?:\s|$)")


def summary_report(path: Path):
    """ES&S "Summary Results Report" / "Precinct Results Report": the precinct name is the first line after the
    three-line page header (its last line holds "November 3, 2026"); contests follow, each ending at "Total Votes Cast"."""
    precinct, office, after_header, prev = None, None, False, ""
    for line in pdf_text(path).splitlines():
        s = line.strip()
        if not s:
            continue
        last, prev = prev, s
        if s.startswith("Vote For"):  # every contest title sits on the line above "Vote For N"
            office = office_of(last)
            continue
        if "November 3, 2026" in s:
            after_header = True
            continue
        if after_header:
            after_header = False
            if s.upper() not in ("STATISTICS",) and not s.startswith("TOTAL"):
                precinct = re.sub(r"\s+Suppressed$", "", s, flags=re.I).strip()
                office = None
                continue
        o = office_of(s)
        if o:
            office = o
            continue
        if s.startswith(("Total Votes Cast", "Contest Totals", "Overvotes", "Undervotes", "Vote For", "TOTAL")):
            if s.startswith("Total Votes Cast"):
                office = None
            continue
        if office and precinct:
            m = NUM.match(s)
            if m and not re.match(r"^(Registered|Ballots|Voter Turnout|Times)", m.group(1)):
                name, party = split_party(m.group(1))
                yield precinct, office[0], office[1], name, party, int(m.group(2).replace(",", ""))


TITLE = re.compile(r"(?:U\.S\. House|State Senate|State House) District\s+\d+", re.I)


def header_titles(head: list[str]) -> tuple:
    """Our contests named in a table header. Titles wrap in place ("State Senate District" over "20"), so each
    fragment is joined with the fragments under it in the next two lines that overlap it."""
    frags = [[(m.start(), m.end(), m.group(0)) for m in re.finditer(r"\S(?:.*?\S)?(?=\s{2,}|$)", ln)] for ln in head]
    found = set()
    for i, row in enumerate(frags):
        for a, b, t in row:
            text = t
            for below in frags[i + 1:i + 3]:
                text += " " + " ".join(t2 for a2, b2, t2 in below if a2 < b + 2 and b2 > a - 2)
            for hit in TITLE.findall(re.sub(r"\s+", " ", text)):
                found.add(office_of(hit))
    return tuple(sorted(found - {None}))


def table_report(path: Path, cands: dict[tuple[str, str, str], int]):
    """Precinct-table PDFs (Summit, Uintah): precincts down, contests in column blocks across, one table often
    running over several pages. Summit prints candidate names rotated (unreadable as text), so columns are not
    named from the header. Instead: pages are grouped by the contest titles in their header; within a group every
    figure is placed in a column by its right edge on the line (a precinct outside one of two side-by-side contests
    simply has no figures there); each column's sum over the group is matched to the candidate of those contests
    (cands: (office, district, name) → official county total) it is closest to. A match must be within 3%, clearly
    better than the next candidate, and used once; total / over / under columns match nothing and are dropped. A
    group that does not resolve is left to the county totals."""
    groups: dict[tuple, list] = defaultdict(list)  # titles → [(precinct, right edge, votes)]
    for page in pdf_text(path).split("\f"):
        lines = page.splitlines()
        body = [i for i, ln in enumerate(lines) if re.match(r"^\s*\S.*?\s{2,}[\d,]+(?:\s+[\d,]+)*\s*$", ln) and not re.search(r"Page \d+ of|%", ln)]
        if not body:
            continue
        titles = header_titles(lines[:body[0]])
        if not titles:
            continue
        for i in body:
            ln = lines[i]
            m = re.match(r"^\s*(\S.*?)\s{2,}", ln)
            name = m.group(1).strip()
            if re.search(r"total|cumulative|federal only", name, re.I):
                continue
            for f in re.finditer(r"[\d,]+(?=\s|$)", ln[m.end():]):
                groups[titles].append((name, m.end() + f.end(), int(f.group(0).replace(",", ""))))
    out = []
    for titles, figs in groups.items():
        edges: list[list[int]] = []  # clusters of right edges
        for x in sorted({x for _, x, _ in figs}):
            if edges and x - edges[-1][-1] <= 2:
                edges[-1].append(x)
            else:
                edges.append([x])
        col = {x: j for j, e in enumerate(edges) for x in e}
        sums = defaultdict(int)
        for _, x, v in figs:
            sums[col[x]] += v
        pool = {k: t for k, t in cands.items() if (k[0], k[1]) in titles}
        pick, used = {}, set()
        for j in sorted(sums):
            scored = sorted(((abs(sums[j] - t) / max(t, 1), k) for k, t in pool.items()), key=lambda x: x[0])
            if scored and scored[0][0] <= 0.03 and (len(scored) == 1 or scored[1][0] > 3 * scored[0][0] + 0.003) and scored[0][1] not in used:
                pick[j] = scored[0][1]
                used.add(scored[0][1])
        for name, x, v in figs:
            k = pick.get(col[x])
            if k:
                out.append((name, k[0], k[1], k[2], "", v))
    return out


READERS = {"Salt Lake": salt_lake, "Davis": davis}
TABLES = {"Uintah"}
# Summit's table prints candidate names rotated and its columns drift a few characters from page to page in the
# text layer, with school-board columns beside ours: not read (county totals fill it) until a position-aware reader exists.
NOT_READ = {"Summit": "precinct table with rotated candidate names; columns shift between pages"}


# ---------------------------------------------------------------- county figures for the fill

def county_truth() -> dict[tuple[str, str, str], list[int]]:
    om = {"house": "USH", "state_senate": "SLDU", "state_house": "SLDL"}
    out: dict[tuple[str, str, str], list[int]] = defaultdict(lambda: [0, 0])
    with open(ROOT / "data-entry" / "results-2026" / "counties.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] != "UT" or r["office"] not in om or r["special"] not in ("0", ""):
                continue
            k = (om[r["office"]], r["seat"], r["county_fips"].zfill(5))
            if r["party_simple"] in ("D", "R"):
                out[k][0 if r["party_simple"] == "D" else 1] += int(r["votes"] or 0)
            else:
                out[k]  # noqa: B018 (keep the key: a county piece with no D/R vote still exists)
    return out


def main() -> None:
    files = fetch("--refresh" in sys.argv)
    fips = {}
    with open(ROOT / "data-entry" / "results-2026" / "counties.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "UT":
                fips[r["county_name"].replace(" County", "")] = r["county_fips"].zfill(5)
    truth = county_truth()
    # Candidate → party from the official statewide candidate list, for reports that print no party (Weber).
    known: dict[tuple[str, str, str], str] = {}
    with open(ROOT / "data-entry" / "results-2026" / "candidates.csv", newline="") as f:
        om = {"house": "USH", "state_senate": "SLDU", "state_house": "SLDL"}
        for r in csv.DictReader(f):
            if r["state"] == "UT" and r["office"] in om and r["party_simple"] in ("D", "R"):
                known[(om[r["office"]], r["seat"], surname(r["candidate"]))] = "DEMOCRAT" if r["party_simple"] == "D" else "REPUBLICAN"
    cand_county: dict[tuple[str, str, str, str], int] = defaultdict(int)  # (fips, office, district, candidate) → official county votes
    with open(ROOT / "data-entry" / "results-2026" / "counties.csv", newline="") as f:
        om = {"house": "USH", "state_senate": "SLDU", "state_house": "SLDL"}
        for r in csv.DictReader(f):
            if r["state"] == "UT" and r["office"] in om and r["special"] in ("0", ""):
                cand_county[(r["county_fips"].zfill(5), om[r["office"]], r["seat"], r["candidate"])] += int(r["votes"] or 0)
    rows = []
    for county, path in sorted(files.items()):
        if county in SCANNED or county in NOT_READ:
            print(f"  {county}: {NOT_READ.get(county, 'scanned report')}, not read (county totals fill it)")
            continue
        reader = READERS.get(county, summary_report)
        if county in TABLES:
            reader = table_report
            raw = table_report(path, {k[1:]: v for k, v in cand_county.items() if k[0] == fips[county]})
        else:
            raw = reader(path)
        got = [(p, o, d, n, party or known.get((o, d, surname(n)), ""), v) for p, o, d, n, party, v in raw]
        rows += [(fips[county], county.upper(), strip_county_number(p, fips[county]), o, d, n.upper(), party, "WRITE" in n.upper(), "TOTAL", v) for p, o, d, n, party, v in got]
        # coverage against the county's official D/R figures for the offices read
        sums = defaultdict(lambda: [0, 0])
        for p, o, d, n, party, v in got:
            if party in ("DEMOCRAT", "REPUBLICAN"):
                sums[(o, d)][0 if party == "DEMOCRAT" else 1] += v
        tk = {(o, d): t for (o, d, c), t in truth.items() if c == fips[county]}
        want = sum(t[0] + t[1] for t in tk.values())
        have = sum(min(sums[k][0], t[0]) + min(sums[k][1], t[1]) for k, t in tk.items())
        print(f"  {county:12s} {reader.__name__:15s} {len({r[0] for r in got}):4d} precincts, {len(got):6d} rows, D/R covered {have / want:.1%}" if want else f"  {county}: no county figures")
    df = pd.DataFrame(rows, columns=COLS)
    write("UT", 2026, df)
    with open(DIR / "certified_by_county_2026.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["office", "district", "county", "dem", "rep"])
        for (o, d, c), (dv, rv) in sorted(truth.items()):
            w.writerow([o, d, c, dv, rv])
    print(f"UT 2026: {len(df)} rows, {df['precinct'].nunique()} precinct names; county figures for {len(truth)} district pieces")


if __name__ == "__main__":
    main()
