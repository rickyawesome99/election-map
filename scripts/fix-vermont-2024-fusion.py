#!/usr/bin/env python3
"""Vermont 2024: restore the Republicans MEDSL's fusion rule filed as Other, and the House seat count.

Vermont cross-endorses heavily. A Republican who also won the Democratic line appears in MEDSL's
2024 file as "Republican/Democratic", and build-state-leg-votes-from-medsl.py's party_bucket()
keeps a label naming both major parties as Other ("genuinely ambiguous"). In Vermont it is not:
the first-named party is the candidate's own (the 2018 SoS printout's ordered labels, which
build-vermont-2018-leg-votes.py restores the same way). 13 winners - 10 House, 3 Senate - came
out as Other, so their votes sat in the Other column and their districts read as having no
Republican. Every other Other in the file is a real independent or third party (Wikipedia's 2024
district results: Independent, Common Sense, Progressive).

The statewide House seat count (state_leg.csv / data/forecastData.ts, 105 D - 37 R - 8 other) was
wrong in a second way: the 2024 result is 87 D - 56 R - 4 Progressive - 3 Independent (Wikipedia,
"2024 Vermont House of Representatives election", seats_after; Ballotpedia agrees). The per-
district file, once relabelled, gives 91 D - 56 R - 3 other with the four Progressives on the
Democratic line; the seat count, like Klarner's for earlier years and the current composition,
counts Progressives as other. The district VOTE data keeps Prog/Dem candidates as D - the project
rule for a slash label naming one major party, and what 2016-2022 do.

Idempotent. Usage: python3 scripts/fix-vermont-2024-fusion.py
"""

import csv
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "data-entry", "state-leg-results", "VT-2024.json")
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
FORECAST = os.path.join(REPO, "data", "forecastData.ts")

REPUBLICAN_FUSION = {
    "house": {"Alicia Malay", "Carolyn Whitney Branagan", "Ashley R Bartley", 'Eileen "Lynn" Dickinson', "Matthew E Walker",
              'Thomas "Tom" Oliver Jr.', "Wayne A Laroche", "Lisa A Hango", "James Gregoire", 'Francis "Topper" McFaun'},
    "senate": {"Randy Brock", "Robert W Norris", "Richard A Westman"},
}
# Seats after the 2024 election (Wikipedia seats_after: D 87, R 56, Progressive 4, Independent 3).
HOUSE_SEATS = {"D": 87, "R": 56, "O": 7}

data = json.load(open(RESULTS))
moved = {"house": 0, "senate": 0}
for chamber, names in REPUBLICAN_FUSION.items():
    seen = set()
    for r in data[chamber]["districts"].values():
        for c in r["candidates"]:
            if c["name"] in names:
                seen.add(c["name"])
                if c["party"] == "O":
                    c["party"] = "R"
                    moved[chamber] += c.get("votes") or 0
        # Recompute the district's columns from its candidates.
        if any(c["name"] in names for c in r["candidates"]):
            r["demVotes"] = sum(c.get("votes") or 0 for c in r["candidates"] if c["party"] == "D")
            r["repVotes"] = sum(c.get("votes") or 0 for c in r["candidates"] if c["party"] == "R")
            r["othVotes"] = sum(c.get("votes") or 0 for c in r["candidates"] if c["party"] == "O")
    missing = names - seen
    if missing:
        raise SystemExit(f"{chamber}: not found in {RESULTS}: {sorted(missing)}")
data["house"]["note"] = data["house"].get("note") or ""
for ch in ("house", "senate"):
    tag = "Republicans on the Democratic line too (R/D) restored to R (scripts/fix-vermont-2024-fusion.py)."
    if tag not in data[ch].get("note", ""):
        data[ch]["note"] = (data[ch].get("note", "") + " " + tag).strip()
json.dump(data, open(RESULTS, "w"), indent=1)
print(f"district file: moved {moved['house']:,} House and {moved['senate']:,} Senate votes Other -> R")


def fix_row(r, chamber):
    """state_leg.csv row (string values) -> corrected, given the votes just moved."""
    shift = moved[chamber]
    if shift:
        r["rep_votes"] = str(int(float(r["rep_votes"])) + shift)
        r["oth_votes"] = str(int(float(r["oth_votes"])) - shift)
    if chamber == "house":
        for k, p in (("dem", "D"), ("rep", "R"), ("oth", "O")):
            r[f"{k}_seats"] = r[f"{k}_seats_won"] = str(HOUSE_SEATS[p])
    tot = int(float(r["total_votes"]))
    d, rp, o = (int(float(r[f"{k}_votes"])) for k in ("dem", "rep", "oth"))
    r["dem_pct"], r["rep_pct"], r["oth_pct"] = (f"{100 * x / tot:.1f}" for x in (d, rp, o))
    r["margin"] = f"{100 * (rp - d) / tot:.1f}"   # this file's margin and vote_margin are R minus D
    r["vote_margin"] = str(rp - d)
    return r


# Only apply the vote shift once: the district file is the record of whether it has run.
already = all(c["party"] == "R" for ch, names in REPUBLICAN_FUSION.items() for r in data[ch]["districts"].values()
              for c in r["candidates"] if c["name"] in names) and not any(moved.values())

rows = list(csv.DictReader(open(STATE_LEG_CSV, newline="", encoding="utf-8")))
fields = list(rows[0].keys())
for r in rows:
    if r["state_name"] == "Vermont" and r["year"] == "2024" and not already:
        fix_row(r, r["type"].lower())
with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
vt = {r["type"]: r for r in rows if r["state_name"] == "Vermont" and r["year"] == "2024"}
print("state_leg.csv:", {t: (r["dem_seats"], r["rep_seats"], r["oth_seats"], r["dem_votes"], r["rep_votes"], r["oth_votes"], r["margin"]) for t, r in vt.items()})

# data/forecastData.ts carries the same rows as (multi-line) objects; set the two Vermont 2024 ones' fields in place.
src = open(FORECAST, encoding="utf-8").read()
# The stateLegData table's own Vermont block (other tables earlier in the file have one too).
start = src.index('"Vermont": [', src.index("export const stateLegData"))
end = src.index("]", start)
for t, r in vt.items():
    m = re.compile(r'\{\s*"year": 2024,\s*"type": "%s",[^}]*\}' % t).search(src, start)
    if not m or m.end() > end:
        raise SystemExit(f"forecastData.ts: Vermont 2024 {t} row not found")
    row = m.group(0)
    for k, col in (("demSeats", "dem_seats"), ("repSeats", "rep_seats"), ("othSeats", "oth_seats"), ("demSeatsWon", "dem_seats_won"),
                   ("repSeatsWon", "rep_seats_won"), ("othSeatsWon", "oth_seats_won"), ("demVotes", "dem_votes"), ("repVotes", "rep_votes"),
                   ("othVotes", "oth_votes"), ("demPct", "dem_pct"), ("repPct", "rep_pct"), ("othPct", "oth_pct")):
        v = r[col]
        v = str(int(float(v))) if not k.endswith("Pct") else (str(float(v)).rstrip("0").rstrip(".") if float(v) != int(float(v)) else str(int(float(v))))
        row, n = re.subn(r'("%s": )[-\d.]+' % k, lambda mm: mm.group(1) + v, row)
        if n != 1:
            raise SystemExit(f"forecastData.ts: {t} {k} not found once")
    src = src[:m.start()] + row + src[m.end():]
open(FORECAST, "w", encoding="utf-8").write(src)
print("forecastData.ts: Vermont 2024 rows rewritten")
