#!/usr/bin/env python3
"""Correct the site's 2024 results where the RDH 2024 precinct file shows them wrong.

User rule (2026-11-14): RDH precinct data is trusted over what the site already holds. This script
rewrites ONLY the chamber-years and counties named below, each one a case where the precinct
reconciliation (scripts/precincts/build_results_2024.py, /audit/precincts) found the site low, doubled,
stale or missing, and where MEDSL either agrees with RDH or is itself the faulty source.

  A. data-entry/state-leg-results/{ST}-2024.json — district totals and candidate votes, from the sum of
     each candidate column over all precincts (never from a precinct's "main" district, which leaks
     split precincts).
  B. data/county_presidential_results_2008_2024.csv — Oregon 2024 county rows.

Statewide chamber rows follow through scripts/correct-statewide-from-districts.py (entries added there).

  python3 scripts/precincts/correct_site_from_rdh_2024.py --report
  python3 scripts/precincts/correct_site_from_rdh_2024.py --write
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import pandas as pd
import pyogrio

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LEG_DIR = ROOT / "data-entry" / "state-leg-results"
PRES_CSV = ROOT / "data" / "county_presidential_results_2008_2024.csv"
RDH_SOURCE = "Redistricting Data Hub 2024 precinct results"

# (state, chamber) → why. "all" rewrites every district RDH covers; a list limits it to those districts.
LEG_TARGETS: dict[tuple[str, str], dict] = {
    ("AZ", "house"): {"districts": "all", "why": "Wikipedia district tables held an incomplete count: 22 of 30 districts were below the precinct sums, 18 of them by 15-35% (LD14 R 91,716 vs 145,344). MEDSL agrees with RDH wherever MEDSL is complete (LD6, LD8, LD11)."},
    ("OR", "house"): {"districts": ["9"], "why": "HD9 was missing its Democrat, William Mrkvicka (14,196 votes), and showed the seat as unopposed."},
    ("IN", "senate"): {"districts": "all", "why": "MEDSL's Indiana 2024 file is unreliable (straight-ticket folding, duplicated precinct labels): SD10 was exactly doubled, SD40 was 9,378 against 38,424, SD7/SD9/SD35 were 20-45% high."},
    ("ME", "senate"): {"districts": "all", "why": "MEDSL-based totals ran about 0.7% below the precinct file in 34 of 35 districts, consistent with centrally counted overseas (UOCAVA) ballots that RDH allocates and MEDSL leaves out."},
    ("ME", "house"): {"districts": "all", "why": "Same cause as the Maine Senate: MEDSL-based totals about 0.7% low across the chamber."},
    ("CT", "senate"): {"districts": "all", "why": "Fusion rule: district totals counted only the major-party line and put a candidate's Working Families / Independent line votes in Other; the RDH file credits the candidate's full total to their party."},
    ("CT", "house"): {"districts": "all", "why": "Fusion rule, as for the Connecticut Senate."},
    ("ND", "senate"): {"districts": ["2"], "why": "SD2 was half the precinct sum for both parties (635/3,145 vs 1,154/6,615); MEDSL carries only part of the district."},
    ("OK", "senate"): {"districts": ["46"], "why": "SD46 had no district row: MEDSL's rows for it are doubled (25,444/14,456), so it was dropped; RDH has D 12,722, R 7,228, I 1,107."},
}
OFFICE = {"house": "SLDL", "senate": "SLDU"}
MEDSL_NAME = {"house": "STATE HOUSE", "senate": "STATE SENATE"}
WRITEIN_TAGS = {"WRI", "OTH", "SCT", "SCA"}
SUFFIXES = {"JR", "SR", "II", "III", "IV", "JR.", "SR."}


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).upper()


def norm_district(k: str) -> str:
    k = str(k).strip()
    m = re.match(r"^0*(\d+)(.*)$", k)
    return (m.group(1) + m.group(2)).upper() if m else k.upper()


def name_matches(name: str, tag: str) -> bool:
    toks = [t for t in re.split(r"[\s\-]+", fold(name).replace(".", "").replace(",", "").replace("'", "").replace("\u2019", "")) if t and t not in SUFFIXES]
    tag = fold(tag)
    if not toks:
        return False
    # surname is normally the last token; allow any later token and glued particles (McLaughlin → MCL, De La Cruz → DEL).
    cands = toks[1:] if len(toks) > 1 else toks
    glued = "".join(cands)
    return any(t.startswith(tag) for t in cands) or glued.startswith(tag) or "".join(toks[-2:]).startswith(tag)


def rdh_candidates(st: str, office: str) -> dict[str, list[tuple[str, str, int]]]:
    """district → [(party letter, name tag, votes)] summed over every precinct."""
    df = pyogrio.read_dataframe(B.rdh_layer(st), read_geometry=False)
    out: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for c in df.columns:
        k = B.classify(st, c)
        if k and k[0] == office:
            out[norm_district(k[1])].append((k[2], k[3], int(pd.to_numeric(df[c], errors="coerce").fillna(0).sum())))
    return out


def medsl_names(st: str, chamber: str) -> dict[str, list[tuple[str, str]]]:
    """district → [(party letter, candidate name)] for naming candidates the site does not list."""
    paths = glob.glob(str(ROOT / "data-entry" / "precincts" / "raw" / "medsl" / "2024" / f"2024-{st.lower()}-precinct-general.*"))
    if not paths:
        return {}
    df = pd.read_csv(paths[0], sep=None, engine="python", dtype=str)
    df = df[df["office"] == MEDSL_NAME[chamber]]
    out: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for (dist, party, cand), _ in df.groupby([df["district"].fillna(""), "party_simplified", "candidate"]):
        out[norm_district(dist)].append(("D" if party == "DEMOCRAT" else "R" if party == "REPUBLICAN" else "O", str(cand).title()))
    return out


def site_party(letter: str) -> str:
    return letter if letter in ("D", "R") else "O"


def correct_chamber(st: str, chamber: str, spec: dict, write: bool) -> int:
    path = LEG_DIR / f"{st}-2024.json"
    doc = json.loads(path.read_text())
    block = doc[chamber]
    rdh = rdh_candidates(st, OFFICE[chamber])
    names = medsl_names(st, chamber)
    by_norm = {norm_district(k): k for k in block["districts"]}
    wanted = sorted(rdh) if spec["districts"] == "all" else spec["districts"]
    changed = 0
    for nd in wanted:
        cols = [c for c in rdh.get(nd, []) if c[2] > 0]
        if not cols:
            continue
        key = by_norm.get(nd, nd)
        cur = block["districts"].get(key, {})
        d = sum(v for p, _, v in cols if p == "D")
        r = sum(v for p, _, v in cols if p == "R")
        total = sum(v for _, _, v in cols)
        new = {"demVotes": d, "repVotes": r, "othVotes": total - d - r, "totalVotes": total}
        old = {k: cur.get(k) for k in new}
        if old == new:
            continue
        cands = [dict(c) for c in cur.get("candidates", [])]
        used: set[int] = set()
        notes = []
        for letter, tag, votes in sorted(cols, key=lambda c: -c[2]):
            if letter in ("O", "W") and fold(tag) in WRITEIN_TAGS:
                continue  # write-in / scatter bucket: counted in othVotes, no candidate row
            hit = next((i for i, c in enumerate(cands) if i not in used and c.get("party") == site_party(letter) and name_matches(c.get("name", ""), tag)), None)
            if hit is None:
                hit = next((i for i, c in enumerate(cands) if i not in used and name_matches(c.get("name", ""), tag)), None)
            if hit is not None:
                used.add(hit)
                cands[hit]["votes"] = votes
            else:
                full = next((n for p, n in names.get(nd, []) if p == site_party(letter) and name_matches(n, tag)), None) or next((n for _, n in names.get(nd, []) if name_matches(n, tag)), None)
                cands.append({"name": full or tag.title(), "party": site_party(letter), "votes": votes})
                used.add(len(cands) - 1)
                notes.append(f"added {full or tag} ({letter}) {votes:,}")
        stale = [c["name"] for i, c in enumerate(cands) if i not in used]
        if stale:
            notes.append("kept unmatched: " + ", ".join(stale))
        cands.sort(key=lambda c: -(c.get("votes") or 0))
        if not any(c.get("winner") for c in cands) and cands:
            cands[0]["winner"] = True
        entry = {**cur, **new, "candidates": cands}
        contested = sum(1 for c in cands if (c.get("votes") or 0) > 0 and c.get("party") in ("D", "R")) > 1 or len({c.get("party") for c in cands if (c.get("votes") or 0) > 0}) > 1
        if contested:
            entry.pop("uncontested", None)
        block["districts"][key] = entry
        changed += 1
        print(f"  {st} {chamber} {key:>4}: D {old['demVotes']} → {d:,}  R {old['repVotes']} → {r:,}  O {old['othVotes']} → {total - d - r:,}" + ("   [" + "; ".join(notes) + "]" if notes else ""))
    if changed:
        prior = block.get("source", "")
        if spec["districts"] == "all":
            block["source"] = RDH_SOURCE
        block["note"] = (block.get("note", "") + " " if block.get("note") else "") + f"2026-11-14: {changed} district(s) corrected from the RDH 2024 precinct file (was: {prior}). {spec['why']}"
        if write:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(f"{st} {chamber}: {changed} district(s) {'written' if write and changed else 'would change'}")
    return changed


def correct_oregon_president(write: bool) -> int:
    meta = json.loads((ROOT / "data-entry" / "precincts" / "anchors" / "OR.json").read_text())
    res = json.loads((ROOT / "public" / "precincts" / "results" / "OR" / "2024.json").read_text())
    pids = sorted(int(p) for p in meta["precincts"])
    by_county: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for pid, (d, r, o) in zip(pids, res["offices"]["PRES"]):
        c = by_county[meta["precincts"][str(pid)]["county"]]
        c[0] += d
        c[1] += r
        c[2] += o
    with open(PRES_CSV, newline="") as f:
        rows = list(csv.DictReader(f))
        fields = list(rows[0].keys())
    changed = 0
    for row in rows:
        if row["state"] != "OR":
            continue
        new = by_county.get(row["county_id"])
        if not new:
            print(f"  OR {row['county_name']}: no precinct sum, left as is")
            continue
        old = (row["dem_2024"], row["gop_2024"], row["oth_2024"], row["total_2024"])
        nv = (str(new[0]), str(new[1]), str(new[2]), str(sum(new)))
        if old != nv:
            changed += 1
            print(f"  OR {row['county_name']:<12} D {old[0]} → {nv[0]}  R {old[1]} → {nv[1]}  O {old[2]} → {nv[2]}")
            row["dem_2024"], row["gop_2024"], row["oth_2024"], row["total_2024"] = nv
    if write and changed:
        with open(PRES_CSV, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
    print(f"OR president 2024: {changed} county row(s) {'written' if write and changed else 'would change'}")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    a = ap.parse_args()
    for (st, chamber), spec in LEG_TARGETS.items():
        correct_chamber(st, chamber, spec, a.write)
    correct_oregon_president(a.write)


if __name__ == "__main__":
    main()
