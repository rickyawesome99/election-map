#!/usr/bin/env python3
"""New Jersey legislature (and the 2025 governor) by municipality, from the Division of Elections PDFs.

New Jersey has no statewide precinct file for its odd-year elections: precinct returns live on 21 county
clerk sites. The Division of Elections publishes official results by MUNICIPALITY, one PDF per
legislative district (State Senate + General Assembly) and, for governor, one per county. This reads
those PDFs (pdftotext -layout) and writes town-level rows in the layout the MEDSL builder reads; the
builder keeps each town's votes inside that town's precincts, in proportion to their top-of-ticket
vote. So these contests are town-accurate, not precinct-accurate, and are marked as estimates.

Columns are found by position: every "Democratic" / "Republican" label in a page header is given to the
nearest vote column, any other column counts as other; "STATE SENATE" and "GENERAL ASSEMBLY" split the
columns between the two chambers. Only party totals are needed (the legislature is summed by party).

  https://www.nj.gov/state/elections/assets/pdf/election-results/{year}/…
  python3 scripts/precincts/fetch_newjersey.py 2023        # 2019, 2021, 2023, 2025
"""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
BASE = "https://www.nj.gov/state/elections/assets/pdf/election-results"
COUNTIES = ["atlantic", "bergen", "burlington", "camden", "cape-may", "cumberland", "essex", "gloucester", "hudson", "hunterdon", "mercer", "middlesex", "monmouth",
            "morris", "ocean", "passaic", "salem", "somerset", "sussex", "union", "warren"]


def urls(year: int) -> list[tuple[str, str, str]]:
    """(kind, key, url): kind 'leg' with the district number, or 'gov' with the county."""
    out = []
    for d in range(1, 41):
        if year == 2019:
            out.append(("leg", str(d), f"{BASE}/2019/2019-general-election-results-general-assembly-{d:02d}.pdf"))
        elif year in (2017, 2021, 2023):
            out.append(("leg", str(d), f"{BASE}/{year}/{year}-general-election-results-gen-assembly-state-senate-district-{d:02d}.pdf"))
        elif year == 2025:
            out.append(("leg", str(d), f"{BASE}/2025/2025-official-general-results-general-assembly-district{d}.pdf"))
    if year == 2025:
        out += [("gov", c, f"{BASE}/2025/2025-official-general-results-governor-{c.replace('-', '')}.pdf") for c in COUNTIES]
    return out


def fetch(year: int, kind: str, key: str, url: str) -> str:
    dest = RAW / "official" / "nj" / str(year) / f"{kind}-{key}.pdf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tries = [url] + ([url.replace("general-assembly-district", "general-assembly-state-senate-district")] if year == 2025 and kind == "leg" else [])
    for u in tries:
        if dest.exists() and dest.read_bytes()[:4] == b"%PDF":
            break
        subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 (precinct pipeline)", "--max-time", "90", "-o", str(dest), u], check=False)
    if not dest.exists() or dest.read_bytes()[:4] != b"%PDF":
        dest.unlink(missing_ok=True)
        return ""
    return subprocess.run(["pdftotext", "-layout", str(dest), "-"], capture_output=True, text=True).stdout


ROW = re.compile(r"^\s*(?P<name>[A-Za-z][A-Za-z .'’\-/&()]*?)\s{2,}(?P<nums>[\d,]+(?:\s+[\d,]+)*)\s*$")


NUMS_ONLY = re.compile(r"^\s*[\d,]+(?:\s+[\d,]+)*\s*$")


def columns(header: list[str], centers: list[float], kind: str) -> list[tuple[str, str]]:
    """Per vote column: (office, D / R / O), read off the page header by position."""
    labels = sorted(((x.group().upper()[0], (x.start() + x.end()) / 2) for h in header for x in re.finditer(r"Demo\w*tic|Republican", h)), key=lambda t: t[1])
    letters = ["O"] * len(centers)
    if len(labels) == len(centers):  # one label per column: left to right
        letters = [l for l, _ in labels]
    elif labels:
        # Header text sits a little to one side of the numbers: measure that shift, then give each major-party
        # label its nearest free column. Columns left over belong to other parties.
        shift = sorted(min(centers, key=lambda c: abs(c - x)) - x for _, x in labels)[len(labels) // 2]
        free = set(range(len(centers)))
        for letter, x in sorted(labels, key=lambda t: min(abs(c - t[1] - shift) for c in centers)):
            if free:
                j = min(free, key=lambda k: abs(centers[k] - x - shift))
                letters[j] = letter
                free.discard(j)
    titles = sorted(((t, (x.start() + x.end()) / 2) for h in header for t in ("STATE SENATE", "GENERAL ASSEMBLY") for x in re.finditer(t, h)), key=lambda t: t[1])
    if kind == "gov":
        offices = ["GOV"] * len(centers)
    elif len(titles) == 2 and len(centers) >= 2:
        # Each title is centred over its own columns: the split that best centres both.
        mean = lambda xs: sum(xs) / len(xs)  # noqa: E731
        code = {"STATE SENATE": "SLDU", "GENERAL ASSEMBLY": "SLDL"}
        cap = [1 if code[t] == "SLDU" else 2 for t, _ in titles]  # a party runs one candidate for Senate, two for Assembly

        def fits(k: int) -> bool:
            return all(part.count(l) <= c for part, c in ((letters[:k], cap[0]), (letters[k:], cap[1])) for l in "DR")

        cost = lambda k: abs(mean(centers[:k]) - titles[0][1]) + abs(mean(centers[k:]) - titles[1][1])  # noqa: E731
        ks = [k for k in range(1, len(centers)) if fits(k)] or list(range(1, len(centers)))
        sen = 0 if code[titles[0][0]] == "SLDU" else 1  # a contested Senate seat shows both parties: prefer the split that keeps them together
        both = lambda k: len({l for l in (letters[:k] if sen == 0 else letters[k:]) if l in "DR"})  # noqa: E731
        k = min(ks, key=lambda k: (-both(k), cost(k)))
        offices = [code[titles[0][0]]] * k + [code[titles[1][0]]] * (len(centers) - k)
    else:
        offices = [("SLDU" if titles and titles[0][0] == "STATE SENATE" else "SLDL")] * len(centers)
    return list(zip(offices, letters))


def parse(text: str, kind: str, key: str) -> list[tuple]:
    """→ (county, municipality, office, party letter, votes)"""
    out = []
    county = key.replace("-", " ").upper() if kind == "gov" else ""
    mapping: list[tuple[str, str]] = []
    for page in text.split("\f"):
        header: list[str] = []
        rows: list[tuple[str, str, list[int], list[float] | None]] = []  # county, name, votes, column centres (None once merged)
        loose: list[tuple[int, list[int]]] = []  # number-only lines: (row above, values)
        for line in page.split("\n"):
            m = ROW.match(line)
            if m and "TOTAL" not in m.group("name").upper():
                found = list(re.finditer(r"[\d,]+", line[m.start("nums"):]))
                rows.append((county, m.group("name").strip(), [int(x.group().replace(",", "")) for x in found], [m.start("nums") + (x.start() + x.end()) / 2 for x in found]))
            elif NUMS_ONLY.match(line) and rows and not m:
                loose.append((len(rows) - 1, [int(x.replace(",", "")) for x in re.findall(r"[\d,]+", line)]))
            elif not m:
                bare = line.strip()
                if kind == "leg" and re.fullmatch(r"[A-Z][A-Z ]+", bare) and "TOTAL" not in bare and bare not in ("STATE SENATE", "GENERAL ASSEMBLY", "MUNICIPALITIES") and "  " not in bare:
                    county = bare
                if not rows:
                    header.append(line)
        if not rows:
            continue
        width = max(len(r[2]) for r in rows)
        for i, extra in loose:  # a short row whose cells wrapped onto the next line; a full row followed by loose numbers (an unnamed "Federal" line) is left alone
            c, n, v, _ = rows[i]
            if len(v) < width and len(v) + len(extra) == width:
                rows[i] = (c, n, v + extra, None)
        ref = next((r[3] for r in rows if r[3] is not None and len(r[2]) == width), None)
        if ref is not None and (any(re.search(r"Demo\w*tic|Republican", h) for h in header) or len(mapping) != width):
            mapping = columns(header, ref, kind)
        if len(mapping) != width:
            continue
        for c, name, votes, _ in rows:
            if len(votes) == width:
                out += [(c, name, office, letter, v) for (office, letter), v in zip(mapping, votes)]
    return out


def main() -> None:
    year = int(sys.argv[1])
    code = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "NJ":
                code[re.sub(r"[^a-z]", "", r["county_name"].lower().replace(" county", ""))] = r["county_id"].zfill(5)
    rows, missing = [], []
    for kind, key, url in urls(year):
        text = fetch(year, kind, key, url)
        if not text:
            missing.append(f"{kind}-{key}")
            continue
        got = parse(text, kind, key)
        if not got:
            missing.append(f"{kind}-{key} (no rows)")
        for county, muni, office, letter, votes in got:
            party = {"D": "DEMOCRAT", "R": "REPUBLICAN"}.get(letter, "OTHER")
            county = re.sub(r"\s+COUNTY$", "", county)
            ck = re.sub(r"[^a-z]", "", county.lower())
            if ck not in code:  # "BURLIGTON"
                import difflib
                ck = (difflib.get_close_matches(ck, list(code), n=1, cutoff=0.8) or [ck])[0]
            rows.append((code.get(ck, ""), county, muni, office, "" if office == "GOV" else key, f"{party} CANDIDATES", party, False, "TOTAL", votes))
    df = pd.DataFrame(rows, columns=["county", "jurisdiction", "precinct", "office", "district", "candidate", "party", "writein", "mode", "votes"])
    dest = RAW / "medsl" / str(year) / "by_state"
    dest.mkdir(parents=True, exist_ok=True)
    df.to_parquet(dest / "NJ.parquet", index=False)
    print(f"NJ {year}: {len(df)} rows", df.groupby(["office", "party"])["votes"].sum().to_dict(), "no county:", int((df["county"] == "").sum()), "missing files:", missing)


if __name__ == "__main__":
    main()
