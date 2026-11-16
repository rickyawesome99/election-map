#!/usr/bin/env python3
"""New Hampshire House results by town and ward from the Secretary of State's county returns.

The election database that the site's New Hampshire file, MEDSL and OpenElections were all built from cuts
long slates short (Derry's 20 candidates came through as 13, Londonderry's 14 as 7). The Secretary of State's
own returns are ten PDFs, one per county ("State Representatives - BELKNAP County"): a header row per district
naming the candidates ("District No. 5 (4)   Bordes, r   Johnson, r ..."), a row per town or ward beneath it,
and a second header block when the slate does not fit on one line. A "Recount" column beside a candidate
replaces that candidate's figure.

  python3 scripts/precincts/fetch_newhampshire.py 2022            # download (Internet Archive copy), parse, check
  python3 scripts/precincts/fetch_newhampshire.py 2022 --parquet  # also write raw/medsl/2022/by_state/NH.oe.parquet (SLDL rows)

Checks printed: every row has one figure per column; each "Totals" row equals the sum of its town rows.
`parse(year)` returns the rows for scripts/precincts/correct_site_state_leg_certified.py.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
COUNTIES = {"belknap": ("BE", "33001"), "carroll": ("CA", "33003"), "cheshire": ("CH", "33005"), "coos": ("CO", "33007"), "grafton": ("GR", "33009"),
            "hillsborough": ("HI", "33011"), "merrimack": ("ME", "33013"), "rockingham": ("RO", "33015"), "strafford": ("ST", "33017"), "sullivan": ("SU", "33019")}
URL = "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/{year}-ge-house-{county}{suffix}.pdf"
SUFFIXES = ["-remediated", "", "-remediated_0", "_0"]  # 2022 files are "-remediated", 2016 files have no suffix
# Districts whose town names did not survive in the PDF's text layer: the rows in the order printed (towns, then Totals).
UNLABELLED = {(2022, "RO1"): ["Northwood", "Nottingham", "Totals"]}
NUM = re.compile(r"^\d[\d,]*(\.\d+)?$")
PARTY = {"sgi": "INDEPENDENT", "ind": "INDEPENDENT", "und": "INDEPENDENT", "lib": "LIBERTARIAN", "r": "REPUBLICAN", "d": "DEMOCRAT", "l": "LIBERTARIAN", "i": "INDEPENDENT", "u": "INDEPENDENT", "w-in": "WRITE-IN"}


def text(year: int, county: str) -> str:
    folder = RAW / "official" / "nh" / str(year)
    folder.mkdir(parents=True, exist_ok=True)
    pdf = folder / f"{county}.pdf"
    if not pdf.exists():  # the live site refuses scripted requests; the Internet Archive holds the same file
        for suffix in SUFFIXES:
            for _attempt in range(3):  # the archive is slow and sometimes times out
                subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 (precinct results archive)", "--max-time", "180", "-o", str(pdf), "https://web.archive.org/web/2024id_/" + URL.format(year=year, county=county, suffix=suffix)])
                if pdf.exists() and pdf.stat().st_size > 0:
                    break
            if pdf.exists() and pdf.read_bytes()[:4] == b"%PDF":
                break
        else:
            pdf.unlink(missing_ok=True)
            sys.exit(f"no return found for {county} {year}")
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout


# A column head ends at its party letter (lower case: "Newman, R., d", "Bacon, Jr., r", "Fromuth, Gus, r" are one head each).
HEAD = re.compile(r"(?P<scatter>[Ss]cat\w*)(?=\s|$)|(?P<recount>Recount|BLC)(?=\s|$)|(?P<name>\S.*?)(?:,\s*|\s+)(?P<party>w-in|sgi|ind|und|lib|[rdliuRD](?:[/&][rdliu])?)(?=\s|$)")
NUMTOK = re.compile(r"\d[\d,]*(?:\.\d+)?|(?<=\s)-(?=\s|$)")  # a lone dash is an empty cell


def header(line: str, start: int) -> list[tuple[float, str, str]] | None:
    out = header_strict(line, start) or header_loose(line, start)
    return out if out and any(c[2] not in ("SCATTER", "RECOUNT") for c in out) else None  # a lone "Scatter" line is not a new header


def header_strict(line: str, start: int) -> list[tuple[float, str, str]] | None:
    """Column heads of a header line as (centre position, surname, party); None when the line is not all column heads."""
    out, pos = [], start
    for m in HEAD.finditer(line, start):
        if line[pos:m.start()].strip():
            return None
        pos = m.end()
        centre = (m.start() + m.end()) / 2
        if m.group("scatter"):
            out.append((centre, "", "SCATTER"))
        elif m.group("recount"):
            out.append((centre, "", "RECOUNT"))
        else:
            if re.search(r"\s{2,}", m.group("name")):
                return None  # two things run together (a town's name before the first head): not a plain header line
            party = m.group("party").lower()
            out.append((centre, m.group("name").strip().rstrip(","), PARTY.get(party) or fused(party)))
    return out if out and not line[pos:].strip() else None


def header_loose(line: str, start: int) -> list[tuple[float, str, str]] | None:
    # Fallback: split on wide gaps. A name with its party letter missing ("Raymond,", "Renfrew-Hebert") belongs to the
    # same slate as the head before it; at least one head on the line must be a full one.
    out, full = [], 0
    for m in re.finditer(r"\S+(?: \S+)*", line[start:]):
        tok, centre = m.group().strip(), start + (m.start() + m.end()) / 2
        if re.fullmatch(r"[Ss]cat\w*", tok):
            out.append((centre, "", "SCATTER"))
        elif re.fullmatch(r"Recount|BLC", tok):
            out.append((centre, "", "RECOUNT"))
        elif (mm := HEAD.fullmatch(tok)) and mm.group("name") and not re.search(r"\s{2,}", mm.group("name")):
            party = mm.group("party").lower()
            out.append((centre, mm.group("name").strip().rstrip(","), PARTY.get(party) or fused(party)))
            full += 1
        elif re.fullmatch(r"[A-Z][A-Za-z'.\-]+(?: [A-Z][A-Za-z'.\-]+)?,?", tok) and any(c[2] not in ("SCATTER", "RECOUNT") for c in out):
            out.append((centre, tok.rstrip(","), next(c[2] for c in reversed(out) if c[2] not in ("SCATTER", "RECOUNT"))))
        else:
            return None
    return out if full else None


def fused(party: str) -> str:
    """ "d/r" or "i/d": nominated by two parties. A major party if one is named (the first when both are)."""
    letters = re.split(r"[/&]", party)
    for x in letters:
        if x in ("d", "r"):
            return PARTY[x]
    return PARTY[letters[0]]


def parse_cells(year: int) -> tuple[list[tuple], dict[tuple[str, str, str], int], list[str]]:
    """2020 and 2024: the returns are published as spreadsheets only (raw/official/nh/{year}/{county}.xls or .xlsx,
    the latest revision of each). Same layout as the PDFs, a cell per column: a header row "District No. N (seats)" with
    one candidate per cell, then a row per town or ward. Undervotes, Overvotes, Write-Ins and Scatter are not candidates."""
    rows, recounts, problems = [], {}, []
    folder = RAW / "official" / "nh" / str(year)
    for county, (code, fips) in COUNTIES.items():
        path = next((folder / f"{county}{ext}" for ext in (".xlsx", ".xls") if (folder / f"{county}{ext}").exists()), None)
        if path is None:
            sys.exit(f"{folder}/{county}.xls(x) is missing")
        district, seats, cols = None, 0, {}
        block: list[tuple[str, dict[int, float]]] = []
        state = {"recount_block": False, "carry": ""}

        def close_block() -> None:
            towns = [(t, v) for t, v in block if not re.match(r"(totals?|recount|court ordered recount)", t, re.I)]
            if state["recount_block"] and towns:  # "District No. 4 (3) RECOUNT FIGURES": this block replaces the first count
                names = {c[0] for c in cols.values()}
                rows[:] = [r_ for r_ in rows if not (r_[1] == f"{code}{district}" and r_[4] in names)]
            tot = [v for t, v in block if re.match(r"totals?", t, re.I)]
            rec = [v for t, v in block if re.match(r"(recount|court ordered recount)", t, re.I)]
            if tot and towns:
                for i in cols:
                    if i in tot[0] and round(sum(v.get(i, 0) for _, v in towns)) != round(tot[0][i]):
                        problems.append(f"{code}{district}: Totals row does not equal the sum of its towns ({cols[i][0]})")
            for town, vals in towns:
                last = None
                for i in sorted(cols):
                    name, party = cols[i]
                    v = vals.get(i)
                    if party == "RECOUNT":  # the recount of the candidate in the column just before it
                        if last is not None and last[0] == i - 1 and v is not None:
                            rows[last[1]] = rows[last[1]][:6] + (int(round(v)),)
                        last = None
                        continue
                    last = None
                    if v is None:
                        continue
                    rows.append((fips, f"{code}{district}", seats, town, name, party, int(round(v))))
                    last = (i, len(rows) - 1)
            for vals in rec:
                for i, v in vals.items():
                    if i in cols and cols[i][1] != "RECOUNT":
                        recounts[(f"{code}{district}", cols[i][0], cols[i][1])] = int(round(v))
            block.clear()

        for sheet in pd.read_excel(path, sheet_name=None, header=None, dtype=str).values():
            for r in sheet.fillna("").values.tolist():
                cells = [str(c).strip() for c in r]
                first = cells[0] if cells else ""
                m = re.match(r"Dis\w*t\.?(?: No\.?)?\s*(\d+)\s*(?:\((\d+)\))?", first)
                # a second block of the same district: no label, every filled cell a candidate head
                filled = [c for c in cells[1:] if c]
                townhead = bool(first) and not m and district is not None and any(first == t for t, _ in block)  # "Derry | Vargas, d | West, d": heads on the town's own row
                again = ((not first or townhead) and district is not None and filled
                         and all(re.fullmatch(r"scat\w*|undervotes?|overvotes?|write-?ins?|recount|blc", c, re.I) or header_strict(c, 0) for c in filled)
                         and any(header_strict(c, 0) for c in filled))
                if m and not filled:
                    continue  # a bare district label; its heads follow on the next row
                if m or again:
                    close_block()
                    state["recount_block"] = bool(m) and "RECOUNT" in first.upper()
                    state["carry"] = first if (again and townhead) else ""
                    if m and (m.group(1) != district or m.group(2)):
                        district = m.group(1)
                        seats = int(m.group(2)) if m.group(2) else seats
                    cols = {}
                    for i, c in enumerate(cells[1:], 1):
                        if re.fullmatch(r"Recount|BLC", c, re.I):
                            cols[i] = ("", "RECOUNT")
                            continue
                        h = header_strict(c, 0) if c else None
                        if h and len(h) == 1 and h[0][2] not in ("SCATTER", "RECOUNT"):
                            cols[i] = (h[0][1], h[0][2])
                        elif c and not re.fullmatch(r"scat\w*|undervotes?|overvotes?|write-?ins?|blanks?|.*\(w-in\)|.*w-in", c, re.I):
                            problems.append(f"{code}{district}: column head not understood: {c!r}")
                    continue
                if not first and state["carry"] and cols:
                    first, state["carry"] = state["carry"], ""  # the figures for a town whose name sat on the header row
                if district is None or not first or not cols:
                    continue
                vals = {}
                for i, c in enumerate(cells[1:], 1):
                    if i in cols and re.fullmatch(r"\d[\d,]*(\.\d+)?", c):
                        vals[i] = float(c.replace(",", ""))
                if vals:
                    block.append((first, vals))
        close_block()
    return rows, recounts, problems


def parse(year: int) -> tuple[list[tuple], dict[tuple[str, str, str], int], list[str]]:
    """rows (county fips, district key, seats, town or ward, surname, party, votes); recounted district totals keyed
    (district key, surname, party); and the problems found. Each figure goes to the column whose head sits above it."""
    if year in (2020, 2024):
        return parse_cells(year)
    rows, recounts, problems = [], {}, []
    for county, (code, fips) in COUNTIES.items():
        lines = text(year, county).split("\n")
        district, seats, cols, prefix, pending_label = None, 0, [], [], ""
        block: list[tuple[str, dict[int, float]]] = []

        def close_block() -> None:
            towns = [(t, v) for t, v in block if not re.match(r"(totals?|recount|court ordered recount)", t, re.I)]
            tot = [v for t, v in block if re.match(r"totals?", t, re.I)]
            rec = [v for t, v in block if re.match(r"(recount|court ordered recount)", t, re.I)]
            if tot and towns:
                for i in tot[0]:
                    if round(sum(v.get(i, 0) for _, v in towns)) != round(tot[0][i]):
                        problems.append(f"{code}{district}: Totals row does not equal the sum of its towns ({cols[i][1] or cols[i][2]})")
            for town, vals in towns:
                last = None
                for i, (_, name, party) in enumerate(cols):
                    v = vals.get(i)
                    if party == "RECOUNT":  # a recount column: that candidate's figure after the recount
                        if last is not None and v is not None:
                            rows[last] = rows[last][:6] + (int(round(v)),)
                        continue
                    last = None
                    if party == "SCATTER" or v is None:
                        continue
                    rows.append((fips, f"{code}{district}", seats, town, name, party, int(round(v))))
                    last = len(rows) - 1
            for vals in rec:  # a recount ROW: the district totals after the recount (the last such row stands)
                for i, v in vals.items():
                    if cols[i][2] not in ("SCATTER", "RECOUNT"):
                        recounts[(f"{code}{district}", cols[i][1], cols[i][2])] = int(round(v))
            block.clear()

        for line in lines:
            if not line.strip() or "State of New Hampshire" in line or "State Representative" in line:
                continue
            # ("Dover Ward 16 (1)" is the return's own slip for Strafford's District No. 16)
            m = re.match(r"\s*(?:Dis\w*t No\.?|[A-Z][a-z]+ Ward)\s*(\d+)\s*\((\d+)\)(?:\s*FL?\b)?", line)  # "Distict" is the return's own typo  # "F" marks a floterial district
            heads = header(line, m.end() if m else 0) if (m or district) else None
            carry = ""
            if heads is None and not m and district and block:
                # a second header block that starts with the town's name ("Londonderry   Warner, d   Combes, d ..."):
                # the row of figures under it has no label of its own
                for town, _ in block:
                    if line.strip().startswith(town) and header(line, line.index(town) + len(town)) is not None:
                        heads, carry = header(line, line.index(town) + len(town)), town
            if m and heads is None:
                problems.append(f"{code}{m.group(1)}: header not understood: {line.strip()[:90]}")
            if heads is not None:
                close_block()
                if m:
                    district, seats = m.group(1), int(m.group(2))
                cols = []
                for centre, name, party in heads:
                    pre = next((frag for fc, frag in prefix if abs(fc - centre) <= 9), "")
                    cols.append((centre, (pre + name) if name else "", party))
                prefix = []
                pending_label = carry
                continue
            if m:
                close_block()
                district, cols = None, []
                continue
            extra = [(mm.start() + len(mm.group()) / 2) for mm in re.finditer(r"\(write-in\)|[Ss]cat\w*", line)]
            if cols and extra and not re.sub(r"\(write-in\)|[Ss]cat\w*|\s", "", line):
                cols = sorted(cols + [(c, "", "SCATTER") for c in extra])  # write-in and scatter columns printed on their own lines
                continue
            frags = [(mm.start() + len(mm.group()) / 2, mm.group()) for mm in re.finditer(r"\S+", line)]
            if frags and all(re.fullmatch(r"[A-Za-z'.]+-", t) for _, t in frags):  # first half of a hyphenated surname, printed above its column
                prefix = frags
                continue
            if district is None or not cols:
                continue
            first = NUMTOK.search(line)
            lab = re.match(r"\s*(.*?(?:Ward|Wd\.?)\s*\d+[A-Za-z]?\*?)\s{2,}", line)  # "Laconia Ward 1": the ward number is part of the name
            label_end = lab.end(1) if lab else (first.start() if first else len(line))
            label = line[:label_end].strip()
            nums = [(mm.start() + len(mm.group()) / 2, 0.0 if mm.group() == "-" else float(mm.group().replace(",", ""))) for mm in NUMTOK.finditer(line, label_end)]
            if line[label_end:].strip() and re.sub(r"[\d,.\s-]", "", line[label_end:]):
                continue  # words after the label: a note, not a row of figures
            if not label and nums:
                names = UNLABELLED.get((year, f"{code}{district}"))
                label = pending_label or (names[len(block)] if names and len(block) < len(names) else "")
                pending_label = ""
            if not label or not nums:
                continue
            if len(nums) == len(cols) + 1 and all(c[2] != "SCATTER" for c in cols):
                nums = nums[:-1]  # a scatter figure with no column head of its own
            if len(nums) > len(cols):
                problems.append(f"{code}{district} {label}: {len(nums)} figures for {len(cols)} columns")
                continue
            # figures run left to right in column order, with gaps where a cell is blank: the order-keeping
            # assignment that puts each figure nearest its column head
            real = [i for i, c in enumerate(cols) if c[2] != "SCATTER"]
            if len(nums) == len(cols) + 1 and len(real) == len(cols):
                nums = nums[:-1]  # a scatter figure with no column head of its own
            if len(nums) == len(cols):  # a full row: one figure per column, in order
                block.append((label, {i: v for i, (_, v) in enumerate(nums)}))
                continue
            if len(nums) == len(real):  # the scatter cell left blank: one figure per candidate, in order
                block.append((label, {i: v for i, (_, v) in zip(real, nums)}))
                continue
            INF = float("inf")
            n_, k_ = len(nums), len(cols)
            best = [[INF] * (k_ + 1) for _ in range(n_ + 1)]
            best[0] = [0.0] * (k_ + 1)
            take = [[False] * (k_ + 1) for _ in range(n_ + 1)]
            for i in range(1, n_ + 1):
                for j in range(i, k_ + 1):
                    skip = best[i][j - 1]
                    use = best[i - 1][j - 1] + abs(cols[j - 1][0] - nums[i - 1][0])
                    best[i][j], take[i][j] = (use, True) if use <= skip else (skip, False)
            vals: dict[int, float] = {}
            i, j = n_, k_
            while i > 0:
                if take[i][j]:
                    vals[j - 1] = nums[i - 1][1]
                    i -= 1
                j -= 1
            block.append((label, vals))
        close_block()
    return rows, recounts, problems


def main() -> None:
    year = int(sys.argv[1])
    rows, recounts, problems = parse(year)
    df = pd.DataFrame(rows, columns=["county", "district", "seats", "town", "candidate", "party", "votes"])
    print(f"NH {year}: {len(df)} rows, {df['district'].nunique()} districts, {df.groupby(['district', 'candidate']).ngroups} candidacies, votes D {int(df[df.party == 'DEMOCRAT'].votes.sum()):,} R {int(df[df.party == 'REPUBLICAN'].votes.sum()):,}")
    print(f"recounted totals: {len(recounts)}; problems: {len(problems)}")
    for p_ in problems[:40]:
        print("  ", p_)
    if "--parquet" in sys.argv:
        f = RAW / "medsl" / str(year) / "by_state" / "NH.oe.parquet"
        out = pd.DataFrame({"county": df["county"], "jurisdiction": df["town"].str.replace(r"\s+(Ward|Wd\.?)\s*\d+$", "", regex=True).str.upper(), "precinct": df["town"].str.upper(), "office": "SLDL",
                            "district": df["district"], "candidate": df["candidate"].str.upper(), "party": df["party"], "writein": df["party"] == "WRITE-IN", "mode": "TOTAL", "votes": df["votes"]})
        if f.exists():
            cur = pd.read_parquet(f)
            out = pd.concat([cur[cur["office"] != "SLDL"], out[cur.columns]], ignore_index=True)
        out.to_parquet(f, index=False)
        print("wrote", f.name)


if __name__ == "__main__":
    main()
