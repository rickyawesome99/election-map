#!/usr/bin/env python3
"""Correct four state-legislative district results on the site against the certified canvass.

Found by the precinct reconciliation (/audit/precincts) and written only after each figure was read
from the state's official canvass AND a second source, and equals the precinct sum:

  Arizona House 18, 2018   the site's (Klarner) row left out Republican Jill Norgaard, 44,269 votes.
                           Signed official canvass, 3 Dec 2018, p. 8 (azsos.gov); Wikipedia.
  Montana House 3, 2020    Debo Powers (D) held 12,393 on the site; certified 2,393. Mitchell (R, 3,586) won.
  Montana House 19, 2020   Wendy McKamey (R) held 14,288; certified 4,288. Libertarian Schultz (762) was missing.
  Montana House 84, 2020   Charlie Hull (R) held 12,819; certified 2,819. Dunwell (D, 3,256) won.
                           2020 Legislative General Election Canvass (sosmt.gov); Wikipedia. The three
                           Montana figures were each exactly 10,000 too high, which flipped two winners.

Checked and deliberately NOT changed (the site was right, the precinct source was not):
  Arkansas House 9 and 99, 2016 (the precinct file merges a same-day special election) and
  Oregon House 34, 35, 47, 2016 (the challengers' first party was the Independent Party).

  python3 scripts/precincts/correct_site_state_leg_certified.py --report | --write
Then: node scripts/build-state-leg-results.mjs && python3 scripts/correct-statewide-from-districts.py --write
      && node data-entry/build.js, and the usual derived builds. The chamber blocks as they stood at the
      2026 lock are in data/stateLegResultsLocked2026.ts.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXES = {
    ("AZ", 2018, "house", "18"): {"demVotes": 103245, "repVotes": 83847, "othVotes": 0, "totalVotes": 187092, "candidates": [
        {"name": "Denise Epstein", "party": "D", "votes": 52992, "incumbent": True, "winner": True},
        {"name": "Jennifer Jermaine", "party": "D", "votes": 50253, "winner": True},
        {"name": "Jill Norgaard", "party": "R", "votes": 44269, "incumbent": True},
        {"name": "Greg Patterson", "party": "R", "votes": 39578}]},
    ("MT", 2020, "house", "3"): {"demVotes": 2393, "repVotes": 3586, "othVotes": 0, "totalVotes": 5979, "candidates": [
        {"name": "Braxton Mitchell", "party": "R", "votes": 3586, "winner": True},
        {"name": "Debo Powers", "party": "D", "votes": 2393, "incumbent": True}]},
    ("MT", 2020, "house", "19"): {"demVotes": 0, "repVotes": 4288, "othVotes": 762, "totalVotes": 5050, "uncontested": True, "candidates": [
        {"name": "Wendy McKamey", "party": "R", "votes": 4288, "incumbent": True, "winner": True},
        {"name": "George Anthony Schultz", "party": "O", "votes": 762}]},
    ("MT", 2020, "house", "84"): {"demVotes": 3256, "repVotes": 2819, "othVotes": 0, "totalVotes": 6075, "candidates": [
        {"name": "Mary Ann Dunwell", "party": "D", "votes": 3256, "incumbent": True, "winner": True},
        {"name": "Charlie Hull", "party": "R", "votes": 2819}]},
}


# Massachusetts Senate, 2016-2020 map: three pairs of districts share a name apart from "First" / "Second", and the
# site's (Klarner) file had merged each pair into one entry, so two unrelated contests read as one (Lesser against
# Humason in 2018, who each ran unopposed in different districts). Each candidate is put back in their own district.
# Which district is read from the precinct returns' district labels (MEDSL), and for 2018 from electionstats.state.ma.us
# (elections 131587 and 131530). Votes are the site's own and are not changed; statewide totals do not move.
MA_SPLITS = {
    "Hampden and Hampshire": {"First": ["Lesser", "Harrington"], "Second": ["Humason", "Parker-O'Grady", "Velis", "Cain"]},
    "Middlesex and Norfolk": {"First": ["Creem"], "Second": ["Spilka"]},
    "Suffolk and Middlesex": {"First": ["Boncore"], "Second": ["Brownsberger"]},
}


def split_massachusetts(write: bool) -> None:
    for year in (2016, 2018, 2020):
        path = ROOT / "data-entry" / "state-leg-results" / f"MA-{year}.json"
        j = json.loads(path.read_text())
        ds = j["senate"]["districts"]
        out = {}
        for key, block in ds.items():
            if key not in MA_SPLITS:
                out[key] = block
                continue
            placed = 0
            for which, surnames in MA_SPLITS[key].items():
                cands = [c for c in block["candidates"] if any(sn.lower() in c["name"].lower() for sn in surnames)]
                placed += len(cands)
                d = sum(c["votes"] or 0 for c in cands if c["party"] == "D")
                r = sum(c["votes"] or 0 for c in cands if c["party"] == "R")
                o = sum(c["votes"] or 0 for c in cands if c["party"] not in ("D", "R"))
                new = {"demVotes": d, "repVotes": r, "othVotes": o, "totalVotes": d + r + o}
                if (d == 0) != (r == 0):
                    new["uncontested"] = True
                new["candidates"] = cands
                out[f"{which} {key}"] = new
                print(f"MA {year} senate {which} {key}: D {d:,} R {r:,}  {[c['name'] for c in cands]}")
            assert placed == len(block["candidates"]), (year, key, [c["name"] for c in block["candidates"]])
            assert sum(out[f"{w} {key}"]["totalVotes"] for w in MA_SPLITS[key]) == block["demVotes"] + block["repVotes"] + block["othVotes"], (year, key)
        if write and list(out) != list(ds):
            j["senate"]["districts"] = out
            path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


def vermont_senate(write: bool) -> None:
    """Vermont Senate 2016 and 2018 against the Secretary of State's election archive (the files fetch_vermont.py keeps in
    data-entry/precincts/raw/official/vt/; Wikipedia's 2018 article, which cites the Secretary of State, gives the same
    figures in all eight districts). 2016: Chittenden lacked its Republican (John Gifford, 25,346) and an independent
    (Tom Licata, 17,021). 2018: in Bennington, Chittenden, Essex-Orleans, Franklin, Grand Isle, Rutland, Windham and Windsor
    every candidate's vote was too high; the other five districts already equalled the archive. Each candidate keeps the
    party, incumbency and winner flags the site held; only votes change, and candidates the site lacked are added."""
    import re

    import pandas as pd

    def k(x: str) -> str:
        return re.sub(r"[^a-z]", "", re.sub(r'"[^"]*"|\([^)]*\)', "", x.lower()))

    for year in (2016, 2018):
        src = ROOT / "data-entry" / "precincts" / "raw" / "official" / "vt" / f"{year}_senate.csv"
        if not src.exists():
            sys.exit(f"{src} is missing: run scripts/precincts/fetch_vermont.py {year} first")
        d = pd.read_csv(src, dtype=str, na_filter=False)
        d = d[(d["election_type"] == "General Election") & (d["division_type"] == "City/Town") & ~d["candidate_name"].str.fullmatch(r"(Total (Ballots|Votes) Cast|Undervotes|Overvotes)")]
        d["votes"] = pd.to_numeric(d["votes"], errors="coerce").fillna(0).astype(int)
        path = ROOT / "data-entry" / "state-leg-results" / f"VT-{year}.json"
        j = json.loads(path.read_text())
        changed = False
        for dn, block in j["senate"]["districts"].items():
            a = d[d["district_name"].map(k) == k(dn)]
            arch = {(c, p_): int(v) for (c, p_), v in a.groupby(["candidate_name", "candidate_party_name"])["votes"].sum().items()}
            if not arch:
                sys.exit(f"VT {year} senate {dn}: no archive rows")
            new_c, used = [], set()
            for c in block["candidates"]:
                hit = [(n, p_) for (n, p_) in arch if k(n) == k(c["name"]) or (c["name"].lower().startswith("write") and n.lower().startswith("write"))
                       or (k(n)[-6:] == k(c["name"])[-6:] and k(n)[:3] == k(c["name"])[:3])]
                if len(hit) != 1:
                    sys.exit(f"VT {year} senate {dn}: cannot place {c['name']} ({hit})")
                used.add(hit[0])
                new_c.append({**c, "votes": arch[hit[0]]})
            for (n, p_), v in sorted(arch.items(), key=lambda kv: -kv[1]):
                if (n, p_) not in used and v > 0 and not n.lower().startswith("write"):  # write-in lines are left as the site had them
                    first = re.split(r"[/]", p_)[0].strip().lower()
                    new_c.append({"name": "Write-in" if n.lower().startswith("write") else n, "party": "D" if first.startswith("dem") else "R" if first.startswith("rep") else "O", "votes": v})
            dv = sum(c["votes"] for c in new_c if c["party"] == "D")
            rv = sum(c["votes"] for c in new_c if c["party"] == "R")
            ov = sum(c["votes"] for c in new_c if c["party"] not in ("D", "R"))
            nb = {**block, "demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov, "candidates": new_c}
            if dv and rv:
                nb.pop("uncontested", None)
            if nb != block:
                added = [c["name"] for c in new_c[len(block["candidates"]):]]
                print(f"VT {year} senate {dn}: D {block['demVotes']:,} → {dv:,}   R {block['repVotes']:,} → {rv:,}   other {block['othVotes']:,} → {ov:,}" + (f"   added {added}" if added else ""))
                j["senate"]["districts"][dn] = nb
                changed = True
        if write and changed:
            path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


# Districts where the site had added another election's candidates to the November general. Each list is the general
# election's own candidates (and its write-in count), read from the state's official results and from Wikipedia:
#   Arkansas House 96, 2020: Jill Bryant (10,444) ran unopposed in a separate same-day special election.
#   Virginia 2023: special elections held earlier on the old district numbers had been added in (Senate 7: Rouse and
#   Adams, January 2023; Senate 9: Bagby and Imholt, March 2023; Senate 38: Hackworth and Buchwald, 2021; House 6: Arnold,
#   August 2023; House 24: Campbell and Harris and House 35: Seibold and Baroudi, January 2023; House 89: Glass and Dolmo,
#   January 2022); House 41 carried two stray rows (294 and 213).
GENERAL_ONLY = {
    ("AR", 2020, "house", "96"): (["Joshua Bryant", "Jon Comstock"], None, "Joshua Bryant"),
    ("VA", 2023, "senate", "7"): (["Bill Stanley", 'Deborah "Renie" Gates'], 55, "Bill Stanley"),
    ("VA", 2023, "senate", "9"): (["Frank Ruff"], 3354, "Frank Ruff"),
    ("VA", 2023, "senate", "38"): (["Jennifer Boysko", "Matthew Lang"], 200, "Jennifer Boysko"),
    ("VA", 2023, "house", "6"): (["Rip Sullivan", "Kristin Hoffman"], 81, "Rip Sullivan"),
    ("VA", 2023, "house", "24"): (["Luke Torian"], 1475, "Luke Torian"),
    ("VA", 2023, "house", "35"): (["Chris Runion"], 826, "Chris Runion"),
    ("VA", 2023, "house", "41"): (["Chris Obenshain", "Lily Franklin"], 29, "Chris Obenshain"),
    ("VA", 2023, "house", "89"): (["Baxter Ennis", "Karen Lynette Jenkins"], 77, "Baxter Ennis"),
}
# Two more Virginia districts with a special election added to the general (found by the same check):
#   Senate 33, 2019: the January 2019 special (Boysko 14,779, May 6,377) was in the November totals; VEST's precinct file
#   for the general gives Boysko 34,517, the site's own Fox row 18,615.
#   House 26, 2025: the January 2025 special (Singh 6,404, Venkatachalam 3,857) was listed beside the November general.
GENERAL_ONLY[("VA", 2025, "house", "26")] = (["JJ Singh", "Ommair Butt"], 85, "JJ Singh")
FIXES[("VA", 2019, "senate", "33")] = {"demVotes": 34517, "repVotes": 18615, "othVotes": 0, "totalVotes": 53132, "candidates": [
    {"name": "Jennifer Boysko", "party": "D", "votes": 34517, "winner": True},
    {"name": "Suzanne Denise Fox", "party": "R", "votes": 18615}]}
# New Hampshire House 2022, Rockingham 13 (Derry, 10 seats) and Rockingham 16 (Londonderry, 7 seats): the election
# database the site was built from lists only part of each slate (13 of 20 candidates in Derry, with three losing
# Democrats marked as winners; no Democrats at all in Londonderry). Votes are from the Secretary of State's return
# ("State Representative - ROCKINGHAM County", 2022 general, read from the Internet Archive copy). The return prints
# surnames only: full names are given where another source confirms them, the surname alone otherwise.
NH_ADD = {
    "RO13": ([("David Love", "R", 5682), ("Erica Layon", "R", 5364), ("David Milz", "R", 5340), ("Elizabeth Greenberg", "D", 4868), ("Gaskill", "D", 4652),
              ("Michelle Moge", "D", 4614), ("Mogill", "D", 4255)], "R"),
    "RO16": ([("Combes", "D", 5106), ("Fenn", "D", 4997), ("Green", "D", 4775), ("Hites", "D", 4718), ("Siekmann", "D", 4704), ("Warner", "D", 4677), ("Killey", "D", 4543)], "R"),
}


def new_hampshire(write: bool) -> None:
    path = ROOT / "data-entry" / "state-leg-results" / "NH-2022.json"
    j = json.loads(path.read_text())
    for d, (extra, winners) in NH_ADD.items():
        block = j["house"]["districts"][d]
        have = {c["name"] for c in block["candidates"]}
        cands = [c for c in block["candidates"] if c["name"] != "Write-in"] + [{"name": n, "party": p_, "votes": v} for n, p_, v in extra if n not in have]
        for c in cands:  # every seat went to one party in both districts
            c.pop("winner", None)
            if c["party"] == winners:
                c["winner"] = True
        cands.sort(key=lambda c: -c["votes"])
        cands += [c for c in block["candidates"] if c["name"] == "Write-in"]
        dv = sum(c["votes"] for c in cands if c["party"] == "D")
        rv = sum(c["votes"] for c in cands if c["party"] == "R")
        ov = sum(c["votes"] for c in cands if c["party"] not in ("D", "R"))
        new = {"demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov, "candidates": cands}
        if new != block:
            print(f"NH 2022 house {d}: D {block['demVotes']:,} → {dv:,}   R {block['repVotes']:,} → {rv:,}   candidates {len(block['candidates'])} → {len(cands)}   winners {sum(1 for c in cands if c.get('winner'))}")
            if write:
                j["house"]["districts"][d] = new
    if write:
        path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


def new_hampshire_from_returns(write: bool, year: int = 2022) -> None:
    """New Hampshire House 2022 and 2024, every district, against the Secretary of State's ten county returns
    (scripts/precincts/fetch_newhampshire.py). A candidate's vote is changed only where the return names the same
    person (surname, party and, where two share a surname, first initial) with a different figure. Where a district
    was recounted, the return's last recount line is the result."""
    import re
    import unicodedata
    from collections import defaultdict

    sys.path.insert(0, str(Path(__file__).parent))
    import fetch_newhampshire as F

    rows, recounts, _ = F.parse(year)
    tot: dict[tuple[str, str, str], int] = defaultdict(int)
    for _f, d, _k, _town, name, party, v in rows:
        tot[(d, name, party)] += v
    tot.update(recounts)

    def fold(x: str) -> str:
        return re.sub(r"[^a-z ,.]", "", unicodedata.normalize("NFKD", re.sub(r'"[^"]*"|\([^)]*\)', "", x)).lower())

    def site_key(name: str) -> tuple[str, str]:  # "C. Rich" / "Fromuth, Gus" / "Bennie C. Nelson" → (surname, first initial)
        n = fold(name)
        if "," in n and not re.search(r",\s*(jr|sr|ii|iii|iv)\b", n):
            last, first = [x.strip() for x in n.split(",", 1)]
        else:
            toks = [t for t in re.split(r"[\s,]+", n) if t and t.rstrip(".") not in ("jr", "sr", "ii", "iii", "iv")]
            last, first = (toks[-1], toks[0]) if len(toks) > 1 else (toks[0] if toks else "", "")
        return re.sub(r"[^a-z]", "", last), first[:1]

    def return_key(name: str) -> tuple[str, str]:  # "Rich, C." / "Bacon, Jr." / "Bartlett IV" / "Creteau-Miller"
        parts = [x.strip() for x in fold(name).split(",")]
        last = re.sub(r"\s+(jr|sr|ii|iii|iv)\.?$", "", parts[0])
        first = next((x for x in parts[1:] if x.rstrip(".") not in ("jr", "sr", "ii", "iii", "iv")), "")
        return re.sub(r"[^a-z]", "", last), first[:1]

    path = ROOT / "data-entry" / "state-leg-results" / f"NH-{year}.json"
    j = json.loads(path.read_text())
    changed = 0
    if year == 2024:  # Hillsborough 15: "Mark Proulx, r" on the return had been read as a candidate named "Proulxr" with no party
        for c in j["house"]["districts"]["HI15"]["candidates"]:
            if c["name"] == "Mark Proulxr":
                print("NH 2024 house HI15: Mark Proulxr (other) → Mark Proulx (R), 2,605 votes")
                c["name"], c["party"] = "Mark Proulx", "R"
                b = j["house"]["districts"]["HI15"]
                b["repVotes"], b["othVotes"] = b["repVotes"] + c["votes"], b["othVotes"] - c["votes"]
                changed += 1
    for dk, block in j["house"]["districts"].items():
        d = re.sub(r"^([A-Z]{2})0+", r"\1", dk)
        official = [(return_key(n), p_[:1] if p_ in ("DEMOCRAT", "REPUBLICAN") else "O", v) for (dd, n, p_), v in tot.items() if dd == d and p_ != "WRITE-IN"]
        cands, touched = [], False
        for c in block["candidates"]:
            sk_, party = site_key(c["name"]), c["party"] if c["party"] in ("D", "R") else "O"
            same = [o for o in official if o[1] == party and (o[0][0] == sk_[0] or o[0][0].endswith(sk_[0]) or sk_[0].endswith(o[0][0]))]
            if len(same) > 1:
                same = [o for o in same if o[0][1] and o[0][1] == sk_[1]]
            if len(same) == 1 and same[0][2] != c["votes"]:
                print(f"NH {year} house {dk}: {c['name']} {c['votes']:,} → {same[0][2]:,}")
                c = {**c, "votes": same[0][2]}
                touched = True
            cands.append(c)
        if touched:
            changed += 1
            dv = sum(c["votes"] or 0 for c in cands if c["party"] == "D")
            rv = sum(c["votes"] or 0 for c in cands if c["party"] == "R")
            ov = sum(c["votes"] or 0 for c in cands if c["party"] not in ("D", "R"))
            j["house"]["districts"][dk] = {**block, "demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov, "candidates": cands}
    if write and changed:
        path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


def new_jersey_stray_rows(write: bool) -> None:
    """New Jersey 2023 and 2025: the Wikipedia pages the district file was read from also carry county-convention and
    primary boxes, and their rows (a few dozen to 200 votes) were taken as general-election candidates. A Democratic
    or Republican row under 300 votes, in a district where that party's general-election candidates have thousands,
    is one of those and is removed."""
    for year in (2023, 2025):
        path = ROOT / "data-entry" / "state-leg-results" / f"NJ-{year}.json"
        j = json.loads(path.read_text())
        changed = False
        for chamber in ("senate", "house"):
            for d, block in ((j.get(chamber) or {}).get("districts") or {}).items():
                cs = block.get("candidates") or []
                big = {p_ for p_ in ("D", "R") if any((c.get("votes") or 0) > 5000 and c["party"] == p_ for c in cs)}
                keep = [c for c in cs if not (c["party"] in big and (c.get("votes") or 0) < 300)]
                if len(keep) == len(cs):
                    continue
                dv = sum(c["votes"] or 0 for c in keep if c["party"] == "D")
                rv = sum(c["votes"] or 0 for c in keep if c["party"] == "R")
                ov = sum(c["votes"] or 0 for c in keep if c["party"] not in ("D", "R"))
                print(f"NJ {year} {chamber} {d}: removed {[(c['name'], c['votes']) for c in cs if c not in keep]}   D {block['demVotes']:,} → {dv:,}   R {block['repVotes']:,} → {rv:,}")
                j[chamber]["districts"][d] = {**block, "demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov, "candidates": keep}
                changed = True
        if write and changed:
            path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


# Mississippi Senate 50, 2019: the site held a Republican total of 7,054 with no candidates, a figure in no official
# document. The only contest certified for the seat on 5 November 2019 is the special election (Secretary of State's
# "Certification of the Special Election for State Senate District 50"): Scott DeLano 1,468, Dixie Newman 1,138, no party
# printed on the ballot. Both are Republicans, which is how the site's party totals count them.
FIXES[("MS", 2019, "senate", "50")] = {"demVotes": 0, "repVotes": 2606, "othVotes": 0, "totalVotes": 2606, "uncontested": True, "candidates": [
    {"name": "Scott DeLano", "party": "R", "votes": 1468, "winner": True},
    {"name": "Dixie Newman", "party": "R", "votes": 1138}]}


# Idaho House 2, 2020: the site (Klarner) listed two Democrats who were not on the ballot (Kohles 20,675 as a winner, Kahn
# 3,986) and gave Okuniewicz 3,598. Wikipedia's district tables and the OpenElections precinct file agree on the real
# contests: seat A, Barbieri unopposed; seat B, Okuniewicz against a Libertarian. (The 2020 House was 58 R to 12 D.)
FIXES[("ID", 2020, "house", "2")] = {"demVotes": 0, "repVotes": 50100, "othVotes": 4803, "totalVotes": 54903, "uncontested": True, "candidates": [
    {"name": "Vito Barbieri", "party": "R", "votes": 25827, "incumbent": True, "winner": True, "post": "1"},
    {"name": "Doug Okuniewicz", "party": "R", "votes": 24273, "winner": True, "post": "2"},
    {"name": "Jennifer Luoma", "party": "O", "votes": 4803, "post": "2"}]}
# New Jersey Senate 1, 2023: the district was missing from the site's file (39 of 40). Department of State official list
# of 6 December 2023 (via Wikipedia); the Division of Elections' municipal PDFs sum to 29,186 and 15,969.
ADD = {("NJ", 2023, "senate", "1"): {"demVotes": 15972, "repVotes": 29186, "othVotes": 0, "totalVotes": 45158, "candidates": [
    {"name": "Michael Testa", "party": "R", "votes": 29186, "incumbent": True, "winner": True},
    {"name": "Charles R. LaSpata", "party": "D", "votes": 15972}]}}
# Illinois House 86 and 98, 2024: the candidates carried no party (the precinct source had none), so the districts showed
# no Democratic or Republican votes. Parties from the Redistricting Data Hub precinct file's candidate columns, which
# hold the same vote counts.
PARTY = {("IL", 2024, "house", "86"): {'Lawrence "Larry" Walsh Jr.': "D", "Jim Lanham": "R"}, ("IL", 2024, "house", "98"): {"Natalie A Manley": "D"}}


def add_and_party(write: bool) -> None:
    for (st, year, chamber, d), block in ADD.items():
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        j = json.loads(path.read_text())
        if d not in j[chamber]["districts"]:
            print(f"{st} {year} {chamber} {d}: added, D {block['demVotes']:,}  R {block['repVotes']:,}")
            if write:
                j[chamber]["districts"] = {d: block, **j[chamber]["districts"]}
                path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")
    for (st, year, chamber, d), parties in PARTY.items():
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        j = json.loads(path.read_text())
        block = j[chamber]["districts"][d]
        cands = [{**c, "party": parties.get(c["name"], c["party"])} for c in block["candidates"]]
        if any(n not in [c["name"] for c in cands] for n in parties):
            sys.exit(f"{st} {year} {chamber} {d}: candidate not found")
        dv = sum(c["votes"] for c in cands if c["party"] == "D")
        rv = sum(c["votes"] for c in cands if c["party"] == "R")
        ov = sum(c["votes"] for c in cands if c["party"] not in ("D", "R"))
        new = {**block, "demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov, "candidates": cands}
        if new != block:
            print(f"{st} {year} {chamber} {d}: D {block['demVotes']:,} → {dv:,}   R {block['repVotes']:,} → {rv:,}   other {block['othVotes']:,} → {ov:,}")
            if write:
                j[chamber]["districts"][d] = new
                path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


def general_only(write: bool) -> None:
    for (st, year, chamber, d), (keep, writein, winner) in GENERAL_ONLY.items():
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        j = json.loads(path.read_text())
        block = j[chamber]["districts"][d]
        cands = []
        for name in keep:
            hit = [c for c in block["candidates"] if c["name"] == name]
            if not hit:
                sys.exit(f"{st} {year} {chamber} {d}: {name} not found")
            c = dict(max(hit, key=lambda c_: c_["votes"] or 0))  # House 41 lists Obenshain twice: the 12,529 row is the general
            c.pop("winner", None)
            if name == winner:
                c["winner"] = True
            cands.append(c)
        if writein is not None:
            cands.append({"name": "Write-in", "party": "O", "votes": writein})
        dv = sum(c["votes"] for c in cands if c["party"] == "D")
        rv = sum(c["votes"] for c in cands if c["party"] == "R")
        ov = sum(c["votes"] for c in cands if c["party"] not in ("D", "R"))
        new = {"demVotes": dv, "repVotes": rv, "othVotes": ov, "totalVotes": dv + rv + ov}
        if (dv == 0) != (rv == 0):
            new["uncontested"] = True
        new["candidates"] = cands
        if new != block:
            print(f"{st} {year} {chamber} {d}: D {block['demVotes']:,} → {dv:,}   R {block['repVotes']:,} → {rv:,}   other {block['othVotes']:,} → {ov:,}   dropped {[c['name'] for c in block['candidates'] if c['name'] not in keep and c['name'] != 'Write-in']}")
            if write:
                j[chamber]["districts"][d] = new
                path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


def main() -> None:
    write = "--write" in sys.argv
    split_massachusetts(write)
    vermont_senate(write)
    general_only(write)
    add_and_party(write)
    new_hampshire(write)
    new_hampshire_from_returns(write)
    new_hampshire_from_returns(write, 2024)
    new_jersey_stray_rows(write)
    for (st, year, chamber, d), new in FIXES.items():
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        j = json.loads(path.read_text())
        old = j[chamber]["districts"][d]
        if old == new:
            continue
        print(f"{st} {year} {chamber} {d}: D {old['demVotes'] or 0:,} → {new['demVotes']:,}   R {old['repVotes'] or 0:,} → {new['repVotes']:,}   other {old['othVotes'] or 0:,} → {new['othVotes']:,}"
              f"   winner {[c['name'] for c in old.get('candidates', []) if c.get('winner')]} → {[c['name'] for c in new['candidates'] if c.get('winner')]}")
        if write and old != new:
            j[chamber]["districts"][d] = new
            path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
