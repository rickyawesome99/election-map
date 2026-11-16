#!/usr/bin/env python3
"""New York State Board of Elections certified results by district and county.

The Board publishes no election-district file for 2018, but its certified workbooks give every district's
vote by county: one sheet per district, one row per candidate and party line, one column per county
(2018Congress.xlsx, 2018NYSenate.xlsx, 2018Assembly.xlsx; live site refuses scripts, Internet Archive
copies of 9-10 November 2022, saved in data-entry/precincts/raw/official/ny/2018/).

`county_truth(year)` gives (office, district, county fips) → [Democratic, Republican] with every party line
credited to its candidate (the site's fusion rule). A candidate's party is the major line they hold; the first
listed when they hold both. build_results_medsl.py uses it to choose, county by county, which precinct source
to take for a district. Run directly to compare the site's district totals with the certified ones.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
FILES = {"USH": "{y}Congress.xlsx", "SLDU": "{y}NYSenate.xlsx", "SLDL": "{y}Assembly.xlsx"}


def counties() -> dict[str, str]:
    out = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "NY":
                out[re.sub(r"[^a-z]", "", r["county_name"].lower().replace(" county", ""))] = r["county_id"].zfill(5)
    return out


OLD_FILES = {"USH": "{y}Congress.xls", "SLDU": "{y}Senate.xls", "SLDL": "{y}Assembly.xls"}


def county_truth_2016(year: int) -> dict[tuple[str, str, str], list[int]]:
    """The 2016 workbooks: one sheet for the whole office, a block per district with the candidates across (given name,
    surname and party line on three rows) and a row per county."""
    code = counties()
    out: dict[tuple[str, str, str], list[int]] = {}
    folder = ROOT / "data-entry" / "precincts" / "raw" / "official" / "ny" / str(year)
    for office, name in OLD_FILES.items():
        path = folder / name.format(y=year)
        if not path.exists():
            continue
        for df in pd.read_excel(path, sheet_name=None, header=None, dtype=str).values():
            rows = [[str(c).strip() for c in r] for r in df.fillna("").values.tolist()]
            i = 0
            while i < len(rows):
                m = re.match(r"(\d+)(?:st|nd|rd|th)\s+(?:SENATE|ASSEMBLY|CONGRESSIONAL)\s+DISTRICT", rows[i][0], re.I)
                if not m:
                    i += 1
                    continue
                district = m.group(1)
                h = next((k for k in range(i + 1, min(i + 8, len(rows))) if rows[k][0].lower() == "county"), None)
                if h is None:
                    i += 1
                    continue
                first, last, party = rows[h - 1], rows[h], rows[h + 1]
                cand = {j: f"{first[j]} {last[j]}".strip() for j in range(1, len(last)) if re.fullmatch(r"[A-Z]{2,4}", party[j])}
                order: dict[str, list[str]] = defaultdict(list)
                for j, c in cand.items():
                    order[c].append(party[j])
                k = h + 2
                while k < len(rows) and rows[k][0] and not rows[k][0].upper().startswith("RECAP"):
                    if re.match(r"(sub)?total", rows[k][0], re.I):
                        k += 1
                        continue
                    fips = code.get(re.sub(r"[^a-z]", "", re.sub(r"^part of ", "", rows[k][0].lower())), "")
                    for c in order:
                        majors = [l for l in order[c] if l in ("DEM", "REP")]
                        if not majors:
                            continue
                        side = 0 if majors[0] == "DEM" else 1
                        v = sum(int(float(rows[k][j].replace(",", ""))) for j, cc in cand.items() if cc == c and re.fullmatch(r"[\d,]+(\.0+)?", rows[k][j]))
                        out.setdefault((office, district, fips), [0, 0])[side] += v
                    k += 1
                i = k
    return out


def county_truth(year: int) -> dict[tuple[str, str, str], list[int]]:
    if year == 2016:
        return county_truth_2016(year)
    code = counties()
    out: dict[tuple[str, str, str], list[int]] = {}
    folder = ROOT / "data-entry" / "precincts" / "raw" / "official" / "ny" / str(year)
    for office, name in FILES.items():
        path = folder / name.format(y=year)
        if not path.exists():
            continue
        for sheet, df in pd.read_excel(path, sheet_name=None, header=None, dtype=str).items():
            m = re.match(r"(\d+)", sheet)
            if not m:
                continue
            district = m.group(1)
            rows = df.fillna("").values.tolist()
            head = next(i for i, r in enumerate(rows) if str(r[0]).startswith("Candidate Name"))
            cols = {}
            for j, h in enumerate(rows[head][1:], 1):
                mm = re.match(r"(?:Part of )?(.+?) Count\w* Vote Results", str(h))
                if mm:
                    cols[j] = code.get(re.sub(r"[^a-z]", "", mm.group(1).lower()), "")
            lines: dict[str, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))  # candidate → party line → column → votes
            order: dict[str, list[str]] = defaultdict(list)
            for r in rows[head + 1:]:
                mm = re.match(r"(.+?)\s*\(([A-Z]{2,4})\)\s*$", str(r[0]).strip())
                if not mm:
                    continue
                cand, line = mm.group(1).strip(), mm.group(2)
                order[cand].append(line)
                for j in cols:
                    v = str(r[j]).replace(",", "").strip()
                    lines[cand][line][j] = int(float(v)) if re.fullmatch(r"\d+(\.0+)?", v) else 0
            for cand, by_line in lines.items():
                majors = [l for l in order[cand] if l in ("DEM", "REP")]
                side = {"DEM": 0, "REP": 1}.get(majors[0]) if majors else None
                if side is None:
                    continue
                for j, fips in cols.items():
                    out.setdefault((office, district, fips), [0, 0])[side] += sum(v.get(j, 0) for v in by_line.values())
    return out


def main() -> None:
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2018
    truth = county_truth(year)
    dist: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for (office, d, _c), v in truth.items():
        dist[(office, d)][0] += v[0]
        dist[(office, d)][1] += v[1]
    print(f"{len(truth)} district-county pieces, {len(dist)} districts; no county code for {sum(1 for k in truth if not k[2])} pieces")
    site: dict[tuple[str, str], tuple[int, int]] = {}
    sys.path.insert(0, str(Path(__file__).parent))
    import build_results_2024 as B
    for (y, st, d), v in B.house_certified().items():
        if y == year and st == "NY":
            site[("USH", d)] = v
    j = json.loads((ROOT / "data-entry" / "state-leg-results" / f"NY-{year}.json").read_text())
    for chamber, office in (("senate", "SLDU"), ("house", "SLDL")):
        for d, v in j[chamber]["districts"].items():
            site[(office, d)] = (v.get("demVotes") or 0, v.get("repVotes") or 0)
    for office in ("USH", "SLDU", "SLDL"):
        ks = [k for k in dist if k[0] == office]
        diff = [(k[1], dist[k][0] - site.get(k, (0, 0))[0], dist[k][1] - site.get(k, (0, 0))[1]) for k in ks]
        bad = [x for x in diff if x[1] or x[2]]
        print(f"{office}: {len(ks)} districts, {len(ks) - len(bad)} equal the site; certified minus site: {sorted(bad, key=lambda x: -abs(x[1]) - abs(x[2]))[:12]}")


if __name__ == "__main__":
    main()
