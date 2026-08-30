#!/usr/bin/env python3
"""New Mexico's 2024 legislative results, from the Secretary of State's official canvass.

New Mexico was a Phase 3 gap for a reason no amount of parsing could fix: MEDSL's 2024
file is TRUNCATED to 25 districts per chamber, in both the bundled volume and the per-state
one, against a real 70 (House) and 42 (Senate). This canvass replaces it outright.

SOURCE: "2024-11-05 General State Canvass" (NM SoS), a 41-page PDF of every office by
county, supplied by the user. `--extract` reads it with `pdftotext -layout` and writes
data-entry/new_mexico_2024_legislature.csv; the committed CSV is what every other mode
reads, so the PDF is not needed again.

HOW THE CANVASS IS LAID OUT:

  * Counties are COLUMNS - all 33 of them on every page, lines up to 444 characters - and
    each race appears exactly once, on one page. The LAST number on a candidate's row is
    the district total and it equals the sum of the county figures before it, which gives a
    free per-candidate checksum: all 160 candidate entries pass it.
  * A candidate's name WRAPS across lines and the party can land on either the name line or
    the continuation ("JARED A HEMBREE 9547" / "(REP)"), so an entry is accumulated until a
    (PARTY) token is seen and closed on that whole line.
  * Office headings are Title Case while candidate names are ALL CAPS - that is the
    discriminator for where one race ends and the next begins. Without it the statewide
    races fold into whichever legislative district was last seen and House District 4 comes
    out at 903,494 votes, roughly New Mexico's entire turnout.
  * PAGE FURNITURE MUST NOT RESET THE CURRENT DISTRICT. "Date Run:", the rotated county
    column headers and the summary rows are all Title Case too, and three headings (House 3,
    Senate 10, Senate 12) sit at the foot of a page with their candidates on the next one -
    treating the footer as an office heading silently drops exactly those three.

VALIDATION, and it is unusually strong for a source this awkward: every one of the 160
candidate entries reconciles against its own county columns, all 70 House and 42 Senate
districts are present, and the SENATE totals reproduce the previous statewide row EXACTLY on
D, R, other and total - a row that came from a Wikipedia infobox, so that is an independent
confirmation. The House Republican total also matches exactly; its D is 10,232 higher and it
adds the 3,298 third-party votes the infobox could not carry (oth_votes = 0).

Usage:
    python3 scripts/build-newmexico-2024-leg-votes.py --extract "/path/to/canvass.pdf"
    python3 scripts/build-newmexico-2024-leg-votes.py --report
    python3 scripts/build-newmexico-2024-leg-votes.py --write
    python3 scripts/build-newmexico-2024-leg-votes.py --districts
"""

import argparse
import collections
import csv
import json
import os
import re
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
NM_CSV = os.path.join(REPO, "data-entry", "new_mexico_2024_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "NM-2024.json")

SOURCE = "New Mexico SoS 2024 General State Canvass (per-district)"

COUNTIES = {
    "Bernalillo", "Catron", "Chaves", "Cibola", "Colfax", "Curry", "De Baca", "Dona Ana",
    "Eddy", "Grant", "Guadalupe", "Harding", "Hidalgo", "Lea", "Lincoln", "Los Alamos",
    "Luna", "McKinley", "Mora", "Otero", "Quay", "Rio Arriba", "Roosevelt", "San Juan",
    "San Miguel", "Sandoval", "Santa Fe", "Sierra", "Socorro", "Taos", "Torrance", "Union",
    "Valencia",
}
FURNITURE = re.compile(r"^(Date Run:|State Summary|Statewide Canvass Sheet|Canvass of Returns|"
                       r"Absentee|Early|Election Day|Provisional|Total)")
TITLE = re.compile(r"^[A-Z][a-z]")
DIST = re.compile(r"^DISTRICT\s+(\d+)\s*$")
PARTY = re.compile(r"\(([A-Z]{3})\)")
NUM = re.compile(r"\b\d[\d,]*\b")
BUCKET = {"DEM": "D", "REP": "R"}


def extract(pdf_path):
    """Parse the canvass PDF into {(chamber, district): Counter(D/R/O)}."""
    txt = subprocess.run(["pdftotext", "-layout", pdf_path, "-"],
                         capture_output=True, text=True, check=True).stdout
    res = collections.defaultdict(collections.Counter)
    checked = passed = 0
    state = {"chamber": None, "dist": None}
    buf = []

    def flush():
        nonlocal checked, passed
        if buf and state["chamber"] and state["dist"]:
            blob = "\n".join(buf)
            pm = PARTY.search(blob)
            nums = [int(x.replace(",", "")) for x in NUM.findall(blob)]
            if pm and nums:
                checked += 1
                # Last figure is the district total; the ones before it are the counties.
                if not nums[:-1] or sum(nums[:-1]) == nums[-1]:
                    passed += 1
                res[(state["chamber"], state["dist"])][BUCKET.get(pm.group(1), "O")] += nums[-1]
        buf.clear()

    for raw in txt.split("\n"):
        st = raw.strip()
        if not st:
            continue
        if FURNITURE.match(st) or st in COUNTIES or st == "STATEWIDE":
            continue
        if TITLE.match(st):
            flush()
            if st == "State Representative":
                state.update(chamber="House", dist=None)
            elif st == "State Senator":
                state.update(chamber="Senate", dist=None)
            else:
                state.update(chamber=None, dist=None)
            continue
        m = DIST.match(st)
        if m:
            flush()
            state["dist"] = m.group(1)
            continue
        buf.append(raw.rstrip())
        if PARTY.search(raw):
            flush()
    flush()
    print(f"{checked} candidate entries; {passed} reconcile against their own county columns")
    if passed != checked:
        print("WARNING: some entries do not reconcile - do not write without checking")
    return res


def write_csv(res):
    rows = []
    for (chamber, dist), c in sorted(res.items(), key=lambda kv: (kv[0][0], int(kv[0][1]))):
        rows.append([chamber, dist, c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    with open(NM_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        w.writerows(rows)
    print(f"wrote {len(rows)} districts -> {NM_CSV}")


def load_csv():
    agg = collections.defaultdict(collections.Counter)
    with open(NM_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            c = agg[(r["chamber"], r["district"])]
            c["D"] += int(r["dem_votes"])
            c["R"] += int(r["rep_votes"])
            c["O"] += int(r["oth_votes"])
    return agg


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--extract", metavar="PDF")
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--districts", action="store_true")
    args = ap.parse_args()

    if args.extract:
        write_csv(extract(args.extract))
        return

    agg = load_csv()
    if args.districts:
        payload = {}
        for chamber in ("House", "Senate"):
            ds = {d: c for (ch, d), c in agg.items() if ch == chamber}
            payload["senate" if chamber == "Senate" else "house"] = {
                "source": SOURCE,
                "districts": {
                    d: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                        "totalVotes": c["D"] + c["R"] + c["O"]}
                    for d, c in sorted(ds.items(), key=lambda kv: int(kv[0]))
                },
            }
        os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
        with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1)
            fh.write("\n")
        for ch, b in payload.items():
            print(f"{ch:7s} {len(b['districts']):3d} districts")
        print(f"wrote {DISTRICTS_JSON}")
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "New Mexico" or r["year"] != "2024":
            continue
        ds = [c for (ch, _d), c in agg.items() if ch == r["type"]]
        if not ds:
            continue
        d = sum(c["D"] for c in ds)
        rp = sum(c["R"] for c in ds)
        o = sum(c["O"] for c in ds)
        total = d + rp + o
        print(f"{r['type']:7s} {len(ds):3d} districts   "
              f"was D={int(r['dem_votes']):>8,} R={int(r['rep_votes']):>8,} O={int(r['oth_votes'] or 0):>6,} T={int(r['total_votes']):>9,}   "
              f"now D={d:>8,} R={rp:>8,} O={o:>6,} T={total:>9,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} New Mexico 2024 rows in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
