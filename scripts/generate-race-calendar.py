#!/usr/bin/env python3
"""
Generates data/raceCalendar.ts from the four data-entry/*_past_results.csv files.

Two structures come out of one pass:

  * raceCalendar   — one row per race actually held (President, Senate, Governor, House),
                     with candidates, votes, vote share, and margins. This is the "Race
                     Calendar": every entry corresponds to exactly one slot on the
                     Election Calendar.
  * electionSlots  — the (state, year) -> which offices were on the ballot index, derived
                     from the same rows, so the calendar and the results can never drift.

RUNOFFS below is the curated list of races in this dataset that were decided in a runoff
rather than on general election day. The CSVs already store the *runoff* figures for these
(that is the result the site shows), and check_runoff_invariant() enforces that: in the
three states that can send a general election to a runoff (GA, LA, MS) no stored row may
have a sub-majority winner, which is what a first-round result would look like.

Run from project root: python3 scripts/generate-race-calendar.py
"""
import csv
import os
import re
import sys

DATA_ENTRY = os.path.join(os.path.dirname(__file__), "../data-entry")
DST = os.path.join(os.path.dirname(__file__), "../data/raceCalendar.ts")

# The president CSV's state_name column needs two repairs: a typo, and Nebraska's statewide
# row being labelled "Nebraska AL" to distinguish its at-large electoral votes from the
# NE-01/02/03 rows below it. The office detail belongs in `seat`, not the state's name.
STATE_NAME_FIXES = {
    "District of Coumbia": "District of Columbia",
    "Nebraska AL": "Nebraska",
}

# States whose general elections can go to a runoff, and so whose stored rows must always
# be the runoff result when one happened. GA requires a majority in the general; LA runs a
# jungle primary with a December runoff; MS used a runoff for the 2018 Senate special.
RUNOFF_STATES = {"GA", "LA", "MS"}

# Races in this dataset decided in a runoff. Keys: Senate (state, year, seat),
# Governor (state, year), House (district_name, year).
RUNOFF_SENATE = {
    ("GA", 2020, "1"),  # Ossoff def. Perdue, Jan 5 2021 runoff
    ("GA", 2020, "2"),  # Warnock def. Loeffler, Jan 5 2021 special runoff
    ("GA", 2022, "2"),  # Warnock def. Walker, Dec 6 2022 runoff
    ("LA", 2014, "1"),  # Cassidy def. Landrieu, Dec 6 2014 runoff
    ("LA", 2016, "2"),  # Kennedy def. Campbell, Dec 10 2016 runoff
    ("MS", 2018, "2"),  # Hyde-Smith def. Espy, Nov 27 2018 special runoff
}
RUNOFF_GOVERNOR = {
    ("LA", 2015),  # Edwards def. Vitter, Nov 21 2015 runoff
    ("LA", 2019),  # Edwards def. Rispone, Nov 16 2019 runoff
}
RUNOFF_HOUSE = {
    ("LA-03", 2016),  # Higgins def. Angelle (both R), Dec 10 2016 runoff
    ("LA-04", 2016),  # Johnson def. Jones, Dec 10 2016 runoff
    ("LA-05", 2020),  # Letlow def. Harris (both R), Dec 5 2020 runoff
}

# A candidate name may carry a trailing party tag when the seat's D-line or R-line slot was
# actually filled by someone from another party — "Loretta Sanchez (D)" in the R column of a
# CA top-two race, "Scott Angelle (R)" in the D column of an all-R Louisiana runoff.
PARTY_SUFFIX = re.compile(r"\s*\((D|R|I)\)\s*$")


def split_party(raw: str, default: str) -> tuple[str, str]:
    name = (raw or "").strip()
    m = PARTY_SUFFIX.search(name)
    if m:
        return PARTY_SUFFIX.sub("", name).strip(), m.group(1)
    return name, default


def num(raw: str):
    """Vote counts are plain in most files but comma-grouped and quoted in the governor CSV."""
    s = (raw or "").strip().replace(",", "")
    if s == "":
        return None
    return int(float(s))


def pct(raw: str) -> float:
    s = (raw or "").strip()
    return float(s) if s else 0.0


races = []


def add(kind, year, state, state_name, seat, sort_seat, race_class, runoff, row,
        dem_col="dem_candidate", rep_col="rep_candidate"):
    dem_name, dem_party = split_party(row[dem_col], "D")
    rep_name, rep_party = split_party(row[rep_col], "R")
    inc = row.get("incumbent", "").strip()
    races.append({
        "id": f"{kind}-{state}-{year}-{sort_seat}" + ("-special" if race_class == "Special" else ""),
        "kind": kind,
        "year": year,
        "state": state,
        "stateName": STATE_NAME_FIXES.get(state_name, state_name),
        "seat": seat,
        "seatSlot": sort_seat,
        "raceClass": race_class,
        "runoff": runoff,
        "demName": dem_name,
        "demParty": dem_party,
        "repName": rep_name,
        "repParty": rep_party,
        "demPct": pct(row["dem_pct"]),
        "repPct": pct(row["rep_pct"]),
        "demVotes": num(row["dem_votes"]),
        "repVotes": num(row["rep_votes"]),
        "totalVotes": num(row["total_votes"]),
        "margin": pct(row["margin"]),
        "voteMargin": num(row["vote_margin"]),
        "incumbent": inc if inc in ("D", "R") else None,
    })


def read(name):
    with open(os.path.join(DATA_ENTRY, f"{name}_past_results.csv"), newline="") as f:
        return list(csv.DictReader(f))


# ---- President -------------------------------------------------------------------------
# Maine and Nebraska award electoral votes by congressional district, so the CSV carries
# extra "ME-01"-style rows alongside the statewide one. They stay attached to their state.
for r in read("president"):
    key = r["state_abbr"]
    m = re.match(r"^([A-Z]{2})-(\d+)$", key)
    if m:
        state, seat, sort_seat = m.group(1), f"President CD-{int(m.group(2))}", f"cd{int(m.group(2))}"
    else:
        state, seat, sort_seat = key, "President", "statewide"
    add("P", int(r["year"]), state, r["state_name"], seat, sort_seat, "Regular", False, r)

# ---- Senate ----------------------------------------------------------------------------
for r in read("senate"):
    state, year, seat_no = r["state_abbr"], int(r["year"]), r["seat"]
    race_class = "Special" if r.get("type") == "Special" else "Regular"
    seat = f"Senate Class {r['class']}" + (" (Special)" if race_class == "Special" else "")
    add("S", year, state, "", seat, f"seat{seat_no}", race_class,
        (state, year, seat_no) in RUNOFF_SENATE, r)

# ---- Governor --------------------------------------------------------------------------
for r in read("governor"):
    state, year = r["state_abbr"], int(r["year"])
    race_class = "Special" if r.get("type") == "Special" else "Regular"
    add("G", year, state, "", "Governor" + (" (Special)" if race_class == "Special" else ""),
        "gov", race_class, (state, year) in RUNOFF_GOVERNOR, r)

# ---- House -----------------------------------------------------------------------------
for r in read("house"):
    district, year = r["district_name"], int(r["year"])
    add("H", year, r["state_abbr"], r["state_name"], district, district, "Regular",
        (district, year) in RUNOFF_HOUSE, r)

# stateName is always the plain state. The president CSV labels its ME-01/NE-02 rows "Maine
# 1st CD" and the Senate/Governor CSVs carry no state_name at all, so take the canonical name
# from the statewide presidential rows (which cover all 50 states plus DC) and apply it to
# every race; the district detail lives in `seat` instead.
names = {r["state"]: r["stateName"]
         for r in races if r["kind"] == "P" and r["seatSlot"] == "statewide"}
missing = {r["state"] for r in races if r["state"] not in names}
if missing:
    print(f"No canonical state name for: {sorted(missing)}", file=sys.stderr)
    sys.exit(1)
for r in races:
    r["stateName"] = names[r["state"]]


def check_runoff_invariant():
    """A first-round jungle-primary or sub-majority general result would show up as a winner
    under 50% in a state that runs runoffs. Every stored row there must be the final result.
    President is exempt: it is decided by plurality everywhere, so a sub-50% winner there is
    an ordinary outcome (Biden carried Georgia in 2020 with 49.47%)."""
    bad = []
    for r in races:
        if r["state"] not in RUNOFF_STATES or r["kind"] == "P":
            continue
        top = max(r["demPct"], r["repPct"])
        if 0 < top < 50:
            bad.append(f"{r['kind']} {r['state']} {r['year']} {r['seat']}: winner at {top}%")
    for r in races:
        if r["runoff"] and max(r["demPct"], r["repPct"]) < 50:
            bad.append(f"flagged runoff without a majority winner: {r['id']}")
    if bad:
        print("Runoff invariant violated — these rows are not final results:", file=sys.stderr)
        for b in bad:
            print("  " + b, file=sys.stderr)
        sys.exit(1)


check_runoff_invariant()

races.sort(key=lambda r: (-r["year"], r["state"], "PSGH".index(r["kind"]), r["seatSlot"]))

# electionSlots: (state, year) -> the offices on the ballot, deduped by kind + class, with a
# count so a state's House delegation reads as one entry instead of 52 identical badges.
# Each slot also carries enough of a result to describe itself on hover: the margin when the
# slot is a single race, and the seats each party won when it is a whole House delegation.
slots: dict[str, dict[int, dict[tuple[str, str], dict]]] = {}
for r in races:
    per_year = slots.setdefault(r["state"], {}).setdefault(r["year"], {})
    key = (r["kind"], r["raceClass"])
    entry = per_year.setdefault(key, {"kind": r["kind"], "raceClass": r["raceClass"],
                                      "count": 0, "runoff": False, "margin": None,
                                      "seats": {"d": 0, "r": 0, "o": 0}})
    entry["count"] += 1
    entry["runoff"] = entry["runoff"] or r["runoff"]
    # Maine and Nebraska put three or four presidential contests in one slot; the statewide
    # result is the one that describes the state, so the district rows don't overwrite it.
    if r["kind"] != "P" or r["seatSlot"] == "statewide":
        entry["margin"] = r["margin"]
    # The winner is whichever ballot line polled higher, credited to the party that line's
    # candidate actually ran under — an all-Republican Louisiana runoff elects a Republican
    # whichever column won it.
    winner = r["demParty"] if r["demPct"] > r["repPct"] else r["repParty"]
    entry["seats"]["d" if winner == "D" else "r" if winner == "R" else "o"] += 1

for by_year in slots.values():
    for per_year in by_year.values():
        for entry in per_year.values():
            # A margin describes one race; across a whole House delegation it would be
            # meaningless, so a multi-seat delegation reports its seat split instead. Every
            # other slot keeps its margin and drops the split.
            if entry["kind"] == "H" and entry["count"] > 1:
                entry["margin"] = None
            else:
                entry["seats"] = None

years = sorted({r["year"] for r in races})


def js(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(v, float):
        return repr(round(v, 2))
    return repr(v)


FIELDS = ["id", "kind", "year", "state", "stateName", "seat", "seatSlot", "raceClass", "runoff",
          "demName", "demParty", "repName", "repParty", "demPct", "repPct",
          "demVotes", "repVotes", "totalVotes", "margin", "voteMargin", "incumbent"]

out = [
    "// Auto-generated by scripts/generate-race-calendar.py — do not edit by hand.",
    "// Source: data-entry/{president,senate,governor,house}_past_results.csv",
    "//",
    "// raceCalendar has one row per race actually held; electionSlots indexes the same rows",
    "// by (state, year) so the Election Calendar and the Race Calendar cannot drift apart.",
    "// Races decided in a runoff store the RUNOFF result, not the first round — see the",
    "// generator's RUNOFF_* lists and check_runoff_invariant().",
    "",
    '/** P = President, S = U.S. Senate, G = Governor, H = U.S. House. */',
    'export type RaceKind = "P" | "S" | "G" | "H";',
    'export type RaceClass = "Regular" | "Special";',
    "",
    "export type CalendarRace = {",
    "  id: string;",
    "  kind: RaceKind;",
    "  year: number;",
    "  /** Two-letter state. ME-01-style presidential district rows stay under their state. */",
    "  state: string;",
    "  stateName: string;",
    '  /** Display label: "President", "Senate Class 2", "Governor", "GA-07". */',
    "  seat: string;",
    '  /** Stable seat identifier used to build links: "statewide", "cd1", "seat1", "gov", "GA-07". */',
    "  seatSlot: string;",
    "  raceClass: RaceClass;",
    "  /** True when the stored figures are a runoff result rather than election day. */",
    "  runoff: boolean;",
    "  demName: string;",
    '  /** Actual party of the candidate on that ballot line — a top-two or all-R runoff can',
    "   *  put a same-party candidate in the opposing slot. */",
    '  demParty: "D" | "R" | "I";',
    "  repName: string;",
    '  repParty: "D" | "R" | "I";',
    "  demPct: number;",
    "  repPct: number;",
    "  demVotes: number | null;",
    "  repVotes: number | null;",
    "  totalVotes: number | null;",
    "  /** Republican minus Democratic, in points. Positive = Republican won. */",
    "  margin: number;",
    "  /** Republican minus Democratic, in votes. Positive = Republican won. */",
    "  voteMargin: number | null;",
    '  incumbent: "D" | "R" | null;',
    "};",
    "",
    "export type ElectionSlot = {",
    "  kind: RaceKind;",
    "  raceClass: RaceClass;",
    "  /** Races of this kind held that year — 1 for statewide offices, seats for the House. */",
    "  count: number;",
    "  /** At least one of those races was decided in a runoff. */",
    "  runoff: boolean;",
    "  /** Republican-minus-Democratic margin, when the slot is a single race. */",
    "  margin: number | null;",
    "  /** Seats won by Democrats, Republicans and others, when the slot is a House delegation. */",
    "  seats: { d: number; r: number; o: number } | null;",
    "};",
    "",
    f"export const raceCalendarYears: number[] = [{', '.join(str(y) for y in years)}];",
    "",
    "export const raceCalendar: CalendarRace[] = [",
]

for r in races:
    out.append("  { " + ", ".join(f"{f}: {js(r[f])}" for f in FIELDS) + " },")

out += [
    "];",
    "",
    "/** (state, year) -> offices on the ballot, derived from raceCalendar. */",
    "export const electionSlots: Record<string, Record<number, ElectionSlot[]>> = {",
]

for state in sorted(slots):
    out.append(f"  {state}: {{")
    for year in sorted(slots[state]):
        entries = sorted(slots[state][year].values(), key=lambda e: ("PSGH".index(e["kind"]), e["raceClass"]))
        def slot_js(e):
            fields = [f"{k}: {js(e[k])}" for k in ("kind", "raceClass", "count", "runoff", "margin")]
            seats = e["seats"]
            fields.append("seats: null" if seats is None
                          else "seats: { " + ", ".join(f"{k}: {seats[k]}" for k in ("d", "r", "o")) + " }")
            return "{ " + ", ".join(fields) + " }"

        inner = ", ".join(slot_js(e) for e in entries)
        out.append(f"    {year}: [{inner}],")
    out.append("  },")
out.append("};")
out.append("")

with open(DST, "w") as f:
    f.write("\n".join(out))

print(f"Wrote {DST}: {len(races)} races, {len(slots)} states, years {years[0]}–{years[-1]}")
