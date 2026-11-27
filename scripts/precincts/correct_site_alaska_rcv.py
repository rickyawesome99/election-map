#!/usr/bin/env python3
"""Puts Alaska's ranked-choice FINAL rounds into the site's own results files (user rule 2026-11-14,
applied 2026-11-26): the 2022 U.S. Senate row, its borough rows, and every 2022/2024 legislative race
that went past round 1. U.S. House was already final round; races won in round 1 are unchanged.

Source: the Division of Elections' cast vote record, tabulated by scripts/precincts/build_alaska_rcv.py
(official stopping rule). 2022 tallies are used as they are (they match the Division's official RCV
reports to a few votes); 2024's export predates certification and holds ~1.3% more ballots, so each
2024 contest is scaled to the certified first-choice turnout the site already holds for it. Borough rows come from the final-round precinct file (public/precincts/results/AK/2022.json).

Writes, with --write:
  data-entry/state-leg-results/AK-2022.json, AK-2024.json   final-round finalists only, like the House row
  data-entry/senate_past_results.csv                        AK 2022: Murkowski v. Tshibaka (same-party: "(R)" tag)
  data-entry/county_senate_results_2022.csv                 AK rows: D slot Tshibaka, R slot Murkowski
and first locks the values they replace (data/stateLegResultsLocked2026.ts, data/countyRowsLocked2026.ts)
so the frozen 2026 forecast reads them unchanged.

  python3 scripts/precincts/correct_site_alaska_rcv.py --report
  python3 scripts/precincts/correct_site_alaska_rcv.py --write
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_alaska_rcv as R  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DE = ROOT / "data-entry"
WRITE = "--write" in sys.argv


def fold(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def surname(cvr_name: str) -> str:
    return fold(cvr_name.split(",")[0])


def final_rounds(year: int):
    """contest description → (rounds, {candidate id: name}, party_of)."""
    contests, cands, portions, groups, ballots, party_of = R.read_cvr(year)
    by: dict[int, Counter] = defaultdict(Counter)
    for (cid, portion, group, seq), k in ballots.items():
        by[cid][seq] += k
    out = {}
    for cid, c in contests.items():
        final, rounds = R.tabulate(by[cid])
        if final:
            out[c["Description"].strip()] = (rounds, {x: cands[x]["Description"] for x in final}, party_of)
    return out


def leg_changes(year: int, rcv) -> dict[str, dict[str, dict]]:
    path = DE / "state-leg-results" / f"AK-{year}.json"
    doc = json.loads(path.read_text())
    changes: dict[str, dict[str, dict]] = defaultdict(dict)
    for desc, (rounds, names, party_of) in rcv.items():
        oc = R.office_of(desc)
        if not oc or oc[0] not in ("SLDU", "SLDL") or len(rounds) == 1:
            continue
        chamber = "senate" if oc[0] == "SLDU" else "house"
        key = oc[1].lstrip("0") or "0"
        site = (doc.get(chamber) or {}).get("districts", {}).get(key)
        if not site:
            print(f"  {year} {chamber} {key}: not in the site file")
            continue
        factor = site["totalVotes"] / sum(rounds[0].values()) if year in R.SCALE_YEARS else 1.0
        fin = sorted(rounds[-1].items(), key=lambda kv: -kv[1])
        cands = []
        for cid, v in fin:
            match = [c for c in site["candidates"] if surname(names[cid]) in fold(c["name"])]
            base = dict(match[0]) if match else {"name": names[cid], "party": party_of.get(cid, "O")}
            base["votes"] = int(round(v * factor))
            base.pop("winner", None)
            cands.append(base)
        cands[0]["winner"] = True
        sums = {"D": 0, "R": 0, "O": 0}
        for c in cands:
            sums[c["party"] if c["party"] in ("D", "R") else "O"] += c["votes"]
        new = {"demVotes": sums["D"], "repVotes": sums["R"], "othVotes": sums["O"], "totalVotes": sum(sums.values()), "candidates": cands}
        changes[chamber][key] = new
        was = ", ".join(f"{c['name']} {c['votes']}" for c in site["candidates"])
        now = ", ".join(f"{c['name']} {c['votes']}" for c in cands)
        print(f"  {year} {chamber:6s} {key:3s} rounds {len(rounds)}  was [{was}]  →  final [{now}]")
    return changes


def ts_obj(o) -> str:
    return json.dumps(o, separators=(",", ":"))


def lock_leg_blocks(blocks: list[tuple[int, str, dict]]) -> None:
    p = ROOT / "data" / "stateLegResultsLocked2026.ts"
    s = p.read_text()
    if '{ abbr: "AK", year: 2022' in s or '{ abbr: "AK", year: 2024' in s:
        print("  lock: AK legislature blocks already locked")
        return
    lines = "  // Added 2026-11-26 (Alaska ranked-choice final rounds, scripts/precincts/correct_site_alaska_rcv.py).\n"
    for year, chamber, block in blocks:
        lines += f'  {{ abbr: "AK", year: {year}, chamber: "{chamber}", block: {ts_obj(block)} }},\n'
    i = s.rstrip().rfind("];")
    p.write_text(s[:i] + lines + s[i:])


def county_rows_from_precincts() -> dict[str, tuple[int, int]]:
    doc = json.loads((ROOT / "public" / "precincts" / "results" / "AK" / "2022.json").read_text())
    anchors = json.loads((DE / "precincts" / "anchors" / "AK.json").read_text())["precincts"]
    first = doc["first_pid"]
    by: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for i, (d, r, o) in enumerate(doc["offices"]["USS"]):
        c = anchors[str(first + i)]["county"]
        by[c][0] += d
        by[c][1] += r
    return {c: (v[0], v[1]) for c, v in by.items()}


def main() -> None:
    lock_blocks = []
    for year in (2022, 2024):
        print(f"== {year}")
        rcv = final_rounds(year)
        changes = leg_changes(year, rcv)
        path = DE / "state-leg-results" / f"AK-{year}.json"
        doc = json.loads(path.read_text())
        for chamber, ds in changes.items():
            lock_blocks.append((year, chamber, json.loads(json.dumps(doc[chamber]))))
            for key, new in ds.items():
                doc[chamber]["districts"][key] = new
        if WRITE and changes:
            path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        if year == 2022:
            rounds, names, party_of = rcv["U.S. Senator"]
            factor = 1.0  # 2022's export matches the official RCV report (R.SCALE_YEARS)
            # (the statewide row was then set to the Division's official final round, 136,330 / 117,534,
            # from results/22GENR/US SEN.txt: the CVR tally is 3 and 2 votes higher)
            fin = sorted(rounds[-1].items(), key=lambda kv: -kv[1])
            (w_id, w_v), (l_id, l_v) = fin[0], fin[1]
            w, l = int(round(w_v * factor)), int(round(l_v * factor))
            print(f"  U.S. Senate final: {names[w_id]} {w}, {names[l_id]} {l}")
            senate_rows = (w, l)

    # Senate statewide row + borough rows
    sp = DE / "senate_past_results.csv"
    text = sp.read_bytes().decode()
    rows = list(csv.DictReader(io.StringIO(text)))
    head = text.splitlines()[0].strip().split(",")
    w, l = senate_rows
    tot = w + l
    for r in rows:
        if r["state_abbr"] == "AK" and r["year"] == "2022":
            print(f"  senate_past_results AK 2022 was: {r['dem_candidate']} {r['dem_votes']} / {r['rep_candidate']} {r['rep_votes']}")
            r.update({"dem_candidate": "Kelly Tshibaka (R)", "rep_candidate": "Lisa Murkowski", "dem_votes": str(l), "rep_votes": str(w),
                      "dem_pct": f"{l / tot * 100:.2f}", "rep_pct": f"{w / tot * 100:.2f}", "margin": f"{(w - l) / tot * 100:.2f}",
                      "vote_margin": str(w - l), "total_votes": str(tot)})
    cp = DE / "county_senate_results_2022.csv"
    ctext = cp.read_bytes().decode()
    crows = list(csv.DictReader(io.StringIO(ctext)))
    chead = ctext.splitlines()[0].strip().split(",")
    final_by_county = county_rows_from_precincts()
    locked_county = []
    for r in crows:
        if r["state"] != "AK":
            continue
        new = final_by_county.get(r["county_id"])
        if not new:
            print(f"  county {r['county_id']} {r['county_name']}: no precincts")
            continue
        old = {k: int(r[k]) for k in ("dem_2022", "gop_2022", "oth_2022", "total_2022")}
        t = old["total_2022"]
        dp, rp = (round(old["dem_2022"] / t * 100, 2), round(old["gop_2022"] / t * 100, 2)) if t else (0.0, 0.0)
        locked_county.append(f'  {{ fips: "{r["county_id"]}", bucket: "years", year: 2022, row: {{ demVotes: {old["dem_2022"]}, repVotes: {old["gop_2022"]}, othVotes: {old["oth_2022"]}, totalVotes: {t}, demPct: {dp}, repPct: {rp}, margin: {round(rp - dp, 2)} }} }},')
        r.update({"dem_2022": str(new[0]), "gop_2022": str(new[1]), "oth_2022": "0", "total_2022": str(new[0] + new[1])})
    print(f"  borough rows: {len(locked_county)}; statewide sum D {sum(int(r['dem_2022']) for r in crows if r['state'] == 'AK')} R {sum(int(r['gop_2022']) for r in crows if r['state'] == 'AK')}")

    if not WRITE:
        print("(report only; --write to apply)")
        return
    # locks first
    lock_leg_blocks(lock_blocks)
    lp = ROOT / "data" / "countyRowsLocked2026.ts"
    ls = lp.read_text()
    if 'fips: "02020", bucket: "years", year: 2022' not in ls:
        i = ls.index("export const lockedSenateRows: LockedRow[] = [")
        j = ls.index("];", i)
        ls = ls[:j] + "  // Added 2026-11-26: Alaska 2022 borough rows before the ranked-choice final round (scripts/precincts/correct_site_alaska_rcv.py).\n" + "\n".join(locked_county) + "\n" + ls[j:]
        lp.write_text(ls)
    out = io.StringIO()
    w_ = csv.DictWriter(out, fieldnames=head, lineterminator="\r\n" if "\r\n" in text else "\n")
    w_.writeheader()
    w_.writerows(rows)
    sp.write_bytes(out.getvalue().encode())
    out = io.StringIO()
    w_ = csv.DictWriter(out, fieldnames=chead, lineterminator="\r\n" if "\r\n" in ctext else "\n")
    w_.writeheader()
    w_.writerows(crows)
    cp.write_bytes(out.getvalue().encode())
    print("written")


if __name__ == "__main__":
    main()
