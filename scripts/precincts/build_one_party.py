"""One-party races for the precinct page: where one of the two parties had no candidate.

The precinct results files can't say this on their own. A same-party general (CA/WA top-two, LA) fills
the D and R slots like any D-vs-R race, and a precinct's district code is sometimes the wrong one near
a line, so summing precincts by district lets a neighbour's votes make an unopposed seat look
contested. This reads the site's own district-level results instead:

  U.S. House     data-entry/house_past_results.csv (a "(D)"/"(R)" suffix marks the second candidate of a
                 party) and data-entry/results-2026/races.csv (`contest`)
  Senate, gov.   data-entry/{senate,governor}_past_results.csv, races.csv
  Legislature    public/state-leg-results/{ST}.json (2016-2024; `uncontested`) and races.csv for 2026

Writes public/precincts/one-party.json:
  {"covered": {ST: {year: [office, ...]}}, "races": {ST: {year: {office: {district: "D" | "R" | "same"}}}}}
"D" means only Democrats ran (no Republican), "R" the reverse, "same" a general between two candidates of
one party. An office listed in `covered` is complete: a district missing from `races` was contested.
Statewide offices use the district "*". District keys are normalised as leg_key() below, which
components/precincts/PrecinctExplorer.tsx (legKey) mirrors for precinct codes. MA, VT and the NH House
are left out: the precinct files name those districts with codes that don't match the results files.

Run: python3 scripts/precincts/build_one_party.py
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUFFIX = re.compile(r"\((D|R)\)\s*$")
races: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
covered: dict = defaultdict(lambda: defaultdict(set))
UNMATCHED = {("MA", "SLDU"), ("MA", "SLDL"), ("VT", "SLDU"), ("VT", "SLDL"), ("NH", "SLDL")}


def leg_key(st: str, office: str, code: str) -> str:
    k = code.strip().upper()
    k = re.sub(r"^DISTRICT\s+", "", k)
    k = re.sub(r"(,\s*POSITION.*|-P\d+)$", "", k)
    if office == "SLDL" and st == "ID":
        k = re.sub(r"[A-Z]$", "", k)
    return re.sub(r"^0+(?=\d)", "", k)


def num(v: str) -> float:
    try:
        return float((v or "0").replace(",", ""))
    except ValueError:
        return 0.0


def kind(dem: float, rep: float) -> str | None:
    if dem > 0 and rep > 0 or dem + rep == 0:
        return None
    return "D" if rep == 0 else "R"


# U.S. House, 2016-2024
for r in csv.DictReader(open(ROOT / "data-entry/house_past_results.csv")):
    st, y = r["state_abbr"], r["year"]
    covered[st][y].add("USH")
    k = "same" if SUFFIX.search(r["dem_candidate"] or "") or SUFFIX.search(r["rep_candidate"] or "") else kind(num(r["dem_votes"]), num(r["rep_votes"]))
    if k:
        races[st][y]["USH"][leg_key(st, "USH", r["district_name"].split("-")[1])] = k

# Senate and governor, 2016-2024: only where the state held one race of that office that year
for name, office in (("senate_past_results.csv", "USS"), ("governor_past_results.csv", "GOV")):
    by = defaultdict(list)
    for r in csv.DictReader(open(ROOT / "data-entry" / name)):
        by[(r["state_abbr"], r["year"])].append(r)
    for (st, y), rows in by.items():
        if len(rows) != 1:
            continue
        r = rows[0]
        covered[st][y].add(office)
        k = "same" if SUFFIX.search(r["dem_candidate"] or "") or SUFFIX.search(r["rep_candidate"] or "") else kind(num(r["dem_votes"]), num(r["rep_votes"]))
        if k:
            races[st][y][office]["*"] = k

# Legislature, 2016-2024
for f in sorted((ROOT / "public/state-leg-results").glob("*.json")):
    st = f.stem
    for y, chambers in json.loads(f.read_text()).items():
        for chamber, body in chambers.items():
            office = "SLDU" if chamber == "senate" else "SLDL"
            if (st, office) in UNMATCHED:
                continue
            covered[st][y].add(office)
            for key, d in body["districts"].items():
                k = kind(d.get("demVotes") or 0, d.get("repVotes") or 0)
                if k:
                    races[st][y][office][leg_key(st, office, key)] = k if d.get("uncontested") else "same"

# 2026: every office from the official count
OFFICE_2026 = {"house": "USH", "senate": "USS", "governor": "GOV", "state_senate": "SLDU", "state_house": "SLDL"}
agg: dict = defaultdict(lambda: [0.0, 0.0, True, 0])  # (st, office, key) -> dem, rep, all same-party, races
statewide = defaultdict(int)
for r in csv.DictReader(open(ROOT / "data-entry/results-2026/races.csv")):
    office = OFFICE_2026.get(r["office"])
    if not office or r["contest"] == "not_on_ballot" or (r["state"], office) in UNMATCHED:
        continue
    st = r["state"]
    key = "*" if office in ("USS", "GOV") else leg_key(st, office, r["seat"])
    if key == "*":
        statewide[(st, office)] += 1
    a = agg[(st, office, key)]
    a[0] += num(r["dem_votes"]); a[1] += num(r["rep_votes"]); a[2] = a[2] and r["contest"] == "same_party"; a[3] += 1
for (st, office, key), (dem, rep, same, _n) in agg.items():
    if key == "*" and statewide[(st, office)] != 1:
        continue
    covered[st]["2026"].add(office)
    k = "same" if same else kind(dem, rep)
    if k:
        races[st]["2026"][office][key] = k

doc = {
    "covered": {st: {y: sorted(os_) for y, os_ in sorted(ys.items())} for st, ys in sorted(covered.items())},
    "races": {st: {y: {o: dict(sorted(v.items())) for o, v in sorted(ys[y].items())} for y in sorted(ys)} for st, ys in sorted(races.items())},
}
path = ROOT / "public/precincts/one-party.json"
path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
n = sum(len(v) for ys in doc["races"].values() for os_ in ys.values() for v in os_.values())
print(f"wrote {path.relative_to(ROOT)}: {n} one-party races, {path.stat().st_size // 1024} KB")
