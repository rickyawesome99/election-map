#!/usr/bin/env python3
"""U.S. House and state-legislative results for 2016, 2018 and 2020, fitted onto the 2024 precincts,
and every office for 2022 (no public shapes that year: rows go straight onto the 2024 precincts by name).

MEDSL publishes these contests by precinct but without shapes; VEST publishes that year's precinct
shapes with the statewide contests only. This joins the two, then reuses the block crosswalk of
build_results_vest.py to move the votes onto the 2024 precincts.

Joining a MEDSL precinct to a VEST precinct, inside one county, in this order:
  1. fingerprint: both files carry the statewide contests, so a precinct whose (Dem, Rep) counts for
     president / U.S. Senate / governor are identical in both, and unique in the county, is the same one;
  2. name: normalized precinct names, trying every text column of the VEST file against the MEDSL
     precinct and jurisdiction+precinct, most productive pairing first; then fuzzy names (same numbers,
     overlapping words, mutual best with a clear margin); a name match whose fingerprints disagree
     badly is thrown out;
  3. near fingerprint: mutual nearest neighbours whose counts differ by under 5%.
What stays unmatched (countywide absentee/provisional lines, renamed precincts) is spread inside its
county (inside its town or house district where the file says which) over the precincts already known to
vote in that district - or, for a real precinct that found
no partner, over the county's unpartnered shapes - in proportion to their top-of-ticket vote. A line that
names a town the shapes also name stays inside that town ("local"). Wisconsin's multi-ward reporting units
are split over their own wards. The share of votes placed by a real precinct match is recorded per office
("matched"), and the share kept inside a town ("local").

Offices: USH is two-candidate ("slot", same rule as the statewide offices); SLDU and SLDL are party
sums. Fusion lines are added to the candidate (site rule). Party comes from the file; where it is blank
or the ballot is nonpartisan (Nebraska) it is taken from the site's own district results by surname.

  python3 scripts/precincts/split_medsl.py 2020          # once per year
  python3 scripts/precincts/build_results_medsl.py 2020 GA
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
import build_results_vest as V  # noqa: E402
from coverage import clear_cells, update_cells  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW = PRE / "raw"
OUT = ROOT / "public" / "precincts" / "results"
DISTRICT_OFFICES = ["USH", "SLDU", "SLDL"]
# Years with no public precinct shapes: MEDSL rows go straight onto the 2024 precincts by name, and the
# statewide offices come from MEDSL too.
NO_SHAPES = {2022, 2023, 2025, 2026}
SLOT = {"PRES", "USS", "USSS", "GOV", "USH"}
# Command-line switches: --variant oe reads {ST}.oe.parquet (OpenElections, for contests MEDSL lacks); --only SLDU,SLDL limits the offices written.
VARIANT = ""
ONLY: set[str] = set()
# Where the per-state input was not written by split_medsl.py: what the rows really are.
SRC = {**{(s_, 2026): "official-2026" for s_ in ("AZ", "GA", "HI", "ID", "MN", "NC", "ND", "OH", "SC", "SD", "UT", "WA", "WY")}, ("MS", 2019): "openelections-2019", ("MS", 2023): "openelections-2023", ("KY", 2023): "openelections-2023", ("NJ", 2017): "openelections-2017-municipal",
       ("NJ", 2019): "nj-doe-2019-municipal", ("NJ", 2021): "nj-doe-2021-municipal", ("NJ", 2023): "nj-doe-2023-municipal", ("NJ", 2025): "nj-doe-2025-municipal",
       ("VA", 2021): "va-elections-2021", ("VA", 2023): "va-elections-2023", ("VA", 2025): "va-elections-2025", ("LA", 2019): "la-sos-2019", ("LA", 2023): "la-sos-2023"}
# The second input of a --variant mix build, where it is not OpenElections.
SECOND = {("NM", 2020): "nm-sos-2020", ("NY", 2018): "openelections-2018+ny-boe-county-2018", ("NY", 2016): "openelections-2016+ny-boe-county-2016"}
# Differences from the site's totals that have a known cause (shown on /audit/precincts).
EXPLAINED: dict[tuple[str, str], str] = {
    ("AK", "USH"): "Ranked choice: precincts report first choices, the site holds the final round (2022 on).",
    ("SD", "USS"): "No Democrat ran in 2026: the independent Brian Bengs takes the Democratic side here, as the site does for such races elsewhere; the 2026 results file counts by party and shows 0.",
    ("ID", "USS"): "No Democrat ran in 2026: the leading independent (Achilles) takes the Democratic side here, as the site does for such races elsewhere; the 2026 results file counts by party and shows 0.",
    ("NE", "SLDU"): "Nonpartisan ballot. The site holds no party for these years' candidates, so its totals are not by party. Here each candidate takes the affiliation on file (2018 research, 2022-2026 rosters); the rest count as other.",
}
SIG_OFFICES = ["PRES", "USS", "GOV", "USS_S"]

# Rows that are not a vote for anyone.
META = re.compile(r"^(UNDER ?VOTES?|OVER ?VOTES?|OVER|UNDER|BLANKS?(?:[ /-].*)?|PUBLIC COUNTER|REGISTERED VOTERS.*|.*BALLOTS( CAST)?|TOTAL( VOTES)?|CAST VOTES|ELIGIBLE|"
                  r"ABSENTEE ?/ ?MILITARY|AFFIDAVIT|FEDERAL( VOTES)?|STATE VOTES|SPECIAL VOTES|MANUALLY COUNTED EMERGENCY|TIMES BLANK VOTED|NOT ASSIGNED|VOID.*|SPOILED.*|"
                  r"TIMES COUNTED|TURNOUT|NO VOTE|.*- (UNDER|OVER)VOTES)$")
SCATTER = re.compile(r"^(ALL OTHERS?|SCATTER.*|WRITE[- ]?INS?.*|\[WRITE-IN\]|NONE OF THESE CANDIDATES|OTHERS?|MISC.*|UNQUALIFIED WRITE.*|UNRESOLVED WRITE.*)$")
# Countywide lines that are not a place.
PSEUDO = re.compile(r"ABSENT|PROVISION|EARLY|MAIL|UOCAVA|FEDERAL|CENTRAL|COUNTYWIDE|MILITARY|OVERSEAS|TRANSFER|CURBSIDE|ONE.?STOP|ADVANCE|FAILSAFE|EMERGENCY|LIMITED|\bAV\b|\bVBM\b|HAND COUNT|SUPPLEMENT")
IND = {"INDEPENDENT", "NONPARTISAN", "UNENROLLED", "NONE", "NO PARTY", "UNAFFILIATED", "NO PARTY AFFILIATION", "NPA", "NON-PARTISAN", "IND", "NA", "NO PARTY PREFERENCE"}
SUFFIX = {"JR", "SR", "II", "III", "IV", "MD", "PHD", "ESQ"}


def fold(x: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", str(x)) if not unicodedata.combining(c)).upper()


def key(s: object) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(s).lower())


def surname(name: str) -> str:
    n = re.sub(r'"[^"]*"|\([^)]*\)', " ", fold(name)).replace(".", " ")
    n = n.split(",")[0] if "," in n and len(n.split(",")[0].split()) <= 2 and n.split(",")[1].strip() not in SUFFIX else n.replace(",", " ")
    toks = [t for t in re.split(r"[\s&/]+", n) if t and t not in SUFFIX]
    return re.sub(r"[^A-Z]", "", toks[-1]) if toks else ""


STOP = {"precinct", "pct", "prec", "pre", "ward", "wd", "district", "dist", "twp", "township", "boro", "borough", "city", "town", "of", "the", "no", "x", "voting",
        "vtd", "and", "at", "ad", "election", "village", "vlg", "tp", "bor", "ed", "number", "num", "box", "pcnt", "wards", "precincts", "county", "co", "municipality", "mun"}
ABBR = {"comm": "community", "ctr": "center", "cntr": "center", "ch": "church", "bapt": "baptist", "sch": "school", "elem": "elementary", "hs": "high", "mt": "mount",
        "st": "saint", "ft": "fort", "n": "north", "s": "south", "e": "east", "w": "west", "hts": "heights", "meth": "methodist", "bldg": "building", "lib": "library",
        "rec": "recreation", "vfd": "fire", "fd": "fire", "dept": "department", "jr": "junior", "sr": "senior", "pk": "park", "hwy": "highway"}


def tokens(s: object) -> tuple[frozenset[str], tuple[str, ...]]:
    """Name → (words, numbers) with filler words dropped and common abbreviations spelled out."""
    text = re.sub(r"\b[a-z]\s*(?=\d)", " ", fold(s).lower())  # "W 63 P 16" → "63 16"
    raw = re.findall(r"[a-z]+|\d+", text)
    words = frozenset(ABBR.get(t, t) for t in raw if not t.isdigit() and t not in STOP)
    nums = tuple(t.lstrip("0") or "0" for t in raw if t.isdigit())
    return words, nums


def similarity(a: tuple[frozenset[str], tuple[str, ...]], b: tuple[frozenset[str], tuple[str, ...]]) -> float:
    (wa, na), (wb, nb) = a, b
    if na and nb and na != nb:
        return 0.0
    if not wa and not wb:
        return 1.0 if na and na == nb else 0.0
    if "".join(sorted(wa)) == "".join(sorted(wb)) or "".join(wa) == "".join(wb):
        hit = float(max(len(wa), len(wb)))
        score = 1.0
    else:
        # A word also counts (a little less) when one is the start of the other: "COMM" ~ "COMMUNITY".
        hit = sum(1.0 if x in wb else 0.9 if any(len(x) >= 3 and len(y) >= 3 and (x.startswith(y) or y.startswith(x)) for y in wb) else 0.0 for x in wa)
        score = hit / max(1.0, len(wa) + len(wb) - hit)
    return score * (1.0 if na == nb else 0.8)


def person_key(name: str) -> str:
    """Surname plus first initial of the given name: one key per person, tolerant of spelling ("BRET" / "BRETT")
    but not of a different person with the same surname ("ADAM SMITH" / "SARAH SMITH")."""
    n = re.sub(r'"[^"]*"|\([^)]*\)', " ", fold(name)).replace(".", " ")
    toks = [t for t in re.split(r"[\s,&/]+", n) if t and t not in SUFFIX]
    sn = surname(name)
    given = [t for t in toks if re.sub(r"[^A-Z]", "", t) != sn and len(t) > 1]
    return f"{sn}~{given[0][:1] if given else ''}"


DEM_RE = re.compile(r"^(DEM|DEMOCRAT|DEMOCRATIC)\b(?! IN )")
REP_RE = re.compile(r"^(REP|REPUBLICAN)\b")


def line_letter(party: str) -> str:
    """One ballot line's party → D, R, I (independent / none listed), M (minor) or ? (blank)."""
    p = party.strip()
    if not p:
        return "?"
    parts = [x.strip() for x in re.split(r"[,/]", p)]
    is_d = [bool(DEM_RE.match(x)) or x in ("DPN", "DFL", "DNL") for x in parts]
    is_r = [bool(REP_RE.match(x)) or x in ("RPN", "GOP") for x in parts]
    if any(is_d) and any(is_r):
        return "B"  # cross-filed on both major lines (Pennsylvania, New York): settled per candidate
    for x in parts:  # the first major party named ("PROGRESSIVE/DEMOCRATIC" is a Democrat)
        if DEM_RE.match(x) or x in ("DPN", "DFL", "DNL"):
            return "D"
        if REP_RE.match(x) or x in ("RPN", "GOP"):
            return "R"
    return "I" if parts[0] in IND else "M"


def norm_district(d: str) -> str:
    d = fold(d).strip()
    return re.sub(r"^0+(?=\d)", "", d) if re.fullmatch(r"\d+", d) else d


def site_parties(st: str, year: int) -> dict[tuple[str, str, str], str]:
    """(office, district or '*', surname) → D / R / I from the site's own district results."""
    out: dict[tuple[str, str, str], str] = {}
    amb: set[tuple[str, str, str]] = set()
    if st == "NE":
        return nebraska_parties()
    path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
    if not path.exists():
        return out
    j = json.loads(path.read_text())
    for chamber, office in (("senate", "SLDU"), ("house", "SLDL")):
        for dk, v in ((j.get(chamber) or {}).get("districts") or {}).items():
            for c in v.get("candidates", []):
                party = {"D": "D", "R": "R"}.get(c.get("party"), "I")
                for k in ((office, norm_district(dk), surname(c.get("name", ""))), (office, "*", surname(c.get("name", ""))), (office, norm_district(dk), person_key(c.get("name", "")))):
                    if k in out and out[k] != party:
                        amb.add(k)
                    out[k] = party
    for k in amb:  # two candidates of different parties share the surname (in the district, or statewide): no answer
        out.pop(k, None)
    return out


def nebraska_parties() -> dict[tuple[str, str, str], str]:
    """Nebraska's ballot is nonpartisan and the site's 2016-2020 district files carry no party. Every
    affiliation the site does hold (the 2018 research files, the 2022-2026 rosters) is pooled by surname."""
    import csv
    seen: dict[str, set[str]] = defaultdict(set)
    de = ROOT / "data-entry"
    for name, cols in (("nebraska_2018_candidate_parties.csv", [("candidate", "party")]), ("nebraska_2018_members.csv", [("incumbent", "incumbent_party"), ("elected", "elected_party")]),
                       ("nebraska_2026_candidate_parties.csv", [("candidate", "party")])):
        if (de / name).exists():
            with open(de / name, newline="") as f:
                for row in csv.DictReader(f):
                    for a, b in cols:
                        letter = {"D": "D", "R": "R"}.get((row.get(b) or "")[:1].upper())
                        if letter and row.get(a):
                            seen[surname(row[a])].add(letter)
    for y in (2022, 2024):
        path = de / "state-leg-results" / f"NE-{y}.json"
        if path.exists():
            for v in ((json.loads(path.read_text()).get("senate") or {}).get("districts") or {}).values():
                for c in v.get("candidates", []):
                    if c.get("party") in ("D", "R"):
                        seen[surname(c.get("name", ""))].add(c["party"])
    return {("SLDU", "*", k): next(iter(v)) for k, v in seen.items() if len(v) == 1 and k}


def vest_tags(old: gpd.GeoDataFrame, year: int) -> dict[str, dict[str, str]]:
    """office → {first three letters of the surname: party letter}, read off the VEST column names."""
    out: dict[str, dict[str, str]] = defaultdict(dict)
    for c in old.columns:
        m = re.match(rf"^[GS]{year % 100:02d}(PRE|USS|GOV)([A-Z])([A-Z]{{3}})$", c.upper())
        if m and m.group(2) in ("D", "R"):
            out[{"PRE": "PRES", "USS": "USS", "GOV": "GOV"}[m.group(1)]][m.group(3)] = m.group(2)
    return out


ORDINAL = {"FIRST": "1", "SECOND": "2", "THIRD": "3", "FOURTH": "4", "FIFTH": "5", "SIXTH": "6", "SEVENTH": "7", "EIGHTH": "8", "NINTH": "9", "TENTH": "10",
           "ELEVENTH": "11", "TWELFTH": "12", "THIRTEENTH": "13", "FOURTEENTH": "14", "FIFTEENTH": "15", "SIXTEENTH": "16", "SEVENTEENTH": "17", "EIGHTEENTH": "18", "NINETEENTH": "19", "TWENTIETH": "20"}


def district_key(d: str) -> str:
    """District name as a comparison key: "First Essex and Middlesex" = "1ST ESSEX & MIDDLESEX"."""
    toks = re.findall(r"[A-Z]+|\d+", fold(d))
    toks = [ORDINAL.get(t, t) for t in toks if t not in ("AND", "ST", "ND", "RD", "TH", "DISTRICT")]
    toks = [re.sub(r"^0+(?=\d)", "", t) for t in toks]
    if len(toks) > 1 and toks[-1].isdigit() and not any(t.isdigit() for t in toks[:-1]) and len(toks[0]) > 3:
        toks = toks[-1:] + toks[:-1]  # "Plymouth and Bristol 1" = "1st Plymouth and Bristol" (county-coded keys like BE1 stay)
    return "".join(toks)


def district_truth(st: str, year: int, office: str) -> dict[str, tuple[int, int]]:
    """The site's own (Dem, Rep) per district, keyed by district_key."""
    import csv
    out: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    if office == "USH":
        for (y, s_, d), (dv, rv) in B.house_certified().items():
            if s_ == st and y == year:
                out[district_key(d)] = [dv, rv]
    else:
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        if path.exists():
            ds = (json.loads(path.read_text()).get({"SLDU": "senate", "SLDL": "house"}[office]) or {}).get("districts") or {}
            for k, v in ds.items():
                out[district_key(k)] = [B._num(v.get("demVotes")), B._num(v.get("repVotes"))]
    return {k: (v[0], v[1]) for k, v in out.items()}


# Districts where the precinct rows and the site differ for a reason that has been checked by hand. Where
# every other district of the contest agrees with the site (within the usual tolerance), the cell reads
# "explained" and carries these reasons; otherwise they are added to its note.
RUNOFF = "Louisiana's November election is an all-party primary. The site holds the top Democrat and top Republican of the deciding round (the December runoff where there was one); precinct returns here are the November vote, with the two leading candidates on the two sides."
KNOWN: dict[tuple[str, int, str], dict[str, str]] = {
    ("LA", 2016, "USH"): {"2": RUNOFF, "3": RUNOFF, "4": RUNOFF, "5": RUNOFF},
    ("LA", 2020, "USH"): {"5": RUNOFF},
    ("SC", 2016, "USH"): {k: "Districts 1, 2 and 7: the Democratic candidates also ran on the Working Families and Green lines. Precincts report the Democratic line only; the certified totals add 9,240, 4,146 and 9,290 votes from the other lines, which the state does not publish by precinct." for k in ("1", "2", "7")},
    ("WV", 2016, "SLDU"): {"3": "District 3 filled two seats on the same day, the regular term and an unexpired one. The site adds both; precinct returns here are the regular-term contest (Boley 27,172, Vanzile 14,826)."},
    ("ME", 2022, "USH"): {"2": "Maine's 2nd was decided by ranked choice: precincts report first choices, the site holds the final round."},
    ("ME", 2018, "USH"): {"2": "Maine's 2nd was decided by ranked choice: precincts report first choices, the site holds the final round."},
    ("AZ", 2018, "USH"): {"7": "No Republican ran in District 7: the Green candidate (18,706) takes the second side here, the site shows the Republican write-in."},
    ("NY", 2018, "SLDU"): {"17": "Felder held the Democratic, Republican and Conservative lines in District 17: the site lists him as other, here his votes sit on the Democratic side."},
    ("WY", 2016, "SLDL"): {"4": "District 4: the source lists Michaels (1,185) as a Democrat, the site as other."},
}


# Cells where the precinct rows are the certified count and the SITE's figure is the one that is off (not yet fixed).
SITE_OFF: dict[tuple[str, int, str], str] = {}


# Cells where the SITE was checked against the certified canvass and is right: the precinct source is the one that is off.
# Added to the cell's note (the cell stays "loaded": the precinct rows there are not the certified count).
SOURCE_OFF: dict[tuple[str, int, str], str] = {
    ("UT", 2016, "SLDU"): "Checked against the state canvass: the site is right in District 19 (Christensen 20,994, Froerer 16,381); the precinct source runs high.",
    ("UT", 2016, "USH"): "Checked against the state canvass: the certified count for Clemens in District 1 is 73,381; the precinct source has 64,952.",
    ("OR", 2020, "SLDU"): "Checked against the state's abstract of votes: the site is right in District 28 (Linthicum 54,800, Palcic 20,444); the precinct source is missing part of the district.",
    ("OR", 2020, "SLDL"): "Checked against the state's abstract of votes: the site is right in Districts 15 and 55; the precinct source is missing part of each.",
    ("MI", 2022, "SLDL"): "Checked against the certified results: the site is right in Districts 63 and 64 (DeBoyer 28,050 to Noland 15,598; Beeler 23,216 to Howell 14,653); the precinct source has half of 63 and none of 64.",
    ("ID", 2020, "SLDL"): "Checked against Wikipedia's district tables: the site is right in Districts 26, 28, 32 and 35; the precinct source is missing part of each.",
    ("TX", 2016, "SLDL"): "The second precinct source lacks whole counties for about twenty districts with an unopposed Republican (for example District 5: 32,942 of 51,428); the site matches the Secretary of State where checked (District 122).",
    ("NH", 2022, "SLDL"): "Checked against the Secretary of State's Rockingham return: the precinct sources leave out the seven Democrats in Rockingham 16 (Londonderry, 33,520 votes) and the Republicans in Rockingham 1. The election database both were built from drops part of the slate in large districts.",
    ("TX", 2016, "SLDU"): "Checked against the Secretary of State: the site is right in Districts 27 and 28 (Lucio 135,945; Perry 205,512); the second precinct source runs high there.",
}


def known_residual(st: str, year: int, office: str, o: pd.DataFrame, statewide: dict | None) -> str | None:
    """The reasons text when the districts outside KNOWN agree with the site (0.5% of the statewide two-party vote), else None."""
    known = KNOWN.get((st, year, office))
    truth = district_truth(st, year, office)
    if not known or not truth:
        return None
    got: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for (d, c), v in o[o["comp"] < 2].groupby(["district", "comp"])["votes"].sum().items():
        got[district_key(d)][c] += int(v)
    two = sum(v[0] + v[1] for v in truth.values()) or 1
    rest = [sum(got.get(k, [0, 0])[i] - truth.get(k, (0, 0))[i] for k in set(truth) | set(got) if k not in known) for i in (0, 1)]
    return " ".join(dict.fromkeys(known.values())) if all(abs(x) / two <= 0.005 for x in rest) else None


def district_note(st: str, year: int, office: str, o: pd.DataFrame) -> str:
    """Where a statewide total differs from the site's, say which districts carry the difference."""
    truth = district_truth(st, year, office)
    got: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for (d, c), v in o[o["comp"] < 2].groupby(["district", "comp"])["votes"].sum().items():
        got[district_key(d)][c] += int(v)
    if len(truth) == 1 and len(got) == 1:
        got = {next(iter(truth)): next(iter(got.values()))}
    if not truth:
        return ""
    with_votes = {k for k, v in truth.items() if v[0] + v[1] > 0}
    missing = sorted(with_votes - set(got))
    off = []
    for k in sorted(set(truth) & set(got)):
        t, g = truth[k], got[k]
        two = max(1, t[0] + t[1])
        if abs(g[0] - t[0]) / two > 0.01 or abs(g[1] - t[1]) / two > 0.01:
            off.append((abs(g[0] - t[0]) + abs(g[1] - t[1]), f"{k} (D {g[0] - t[0]:+,}, R {g[1] - t[1]:+,})"))
    bits = []
    if missing:
        bits.append(f"The source has no votes for {len(missing)} of the site's {len(with_votes)} districts ({', '.join(missing[:8])}{'…' if len(missing) > 8 else ''}).")
    if off:
        off.sort(reverse=True)
        bits.append(f"{len(off)} district{'s' if len(off) != 1 else ''} differ by more than 1% ({'; '.join(x for _, x in off[:5])}{'…' if len(off) > 5 else ''}).")
    return " ".join(bits)


# State-years where a seat's unexpired term and full term were both on the ballot and the source merges them
# (Michigan House 11 and 28, Montana Senate 26, all 2016). The doubled-row rule is applied only here: elsewhere
# two rows for a precinct are separate counts (Detroit's absentee boards share their precinct's name).
# Contests in the source that are not the regular general election and have no regular count to stand beside:
# Arkansas House 99 in 2016 (Fortner was unopposed for the full term and no votes were tallied; the rows are the
# same-day special for the unexpired term, checked against the Secretary of State's results).
NOT_THE_GENERAL = {("AR", 2016, "SLDL", "99")}
SAME_DAY_SPECIALS = {("MI", 2016), ("MT", 2016), ("HI", 2016)}  # Hawaii's 1st: Hanabusa won the unexpired term and the full term the same day
VT_COUNTY = {"ADD": "ADDISON", "BEN": "BENNINGTON", "CAL": "CALEDONIA", "CHI": "CHITTENDEN", "ESX": "ESSEX", "FRA": "FRANKLIN", "GI": "GRAND ISLE", "LAM": "LAMOILLE",
             "ORA": "ORANGE", "ORL": "ORLEANS", "RUT": "RUTLAND", "WAS": "WASHINGTON", "WDH": "WINDHAM", "WDR": "WINDSOR", "CT": "CENTRAL", "N": "NORTH", "SE": "SOUTH EAST"}
NH_COUNTY = {"33001": "BE", "33003": "CA", "33005": "CH", "33007": "CO", "33009": "GR", "33011": "HI", "33013": "ME", "33015": "RO", "33017": "ST", "33019": "SU"}


def site_names(st: str, year: int) -> dict[tuple[str, str], dict[str, str]]:
    """(office, district key) → {surname: party} for every candidate in the site's legislative results."""
    out: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
    if path.exists():
        j = json.loads(path.read_text())
        for chamber, office in (("senate", "SLDU"), ("house", "SLDL")):
            for dk, v in ((j.get(chamber) or {}).get("districts") or {}).items():
                for c in v.get("candidates", []):
                    out[(office, district_key(dk))][surname(c.get("name", ""))] = c.get("party") or ""
    return out


def site_votes(st: str, year: int) -> dict[tuple[str, str], dict[int, str]]:
    """(office, district key) → {a candidate's vote total: their party}, for totals no other candidate of the district shares."""
    out: dict[tuple[str, str], dict[int, str]] = defaultdict(dict)
    path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
    if path.exists():
        j = json.loads(path.read_text())
        for chamber, office in (("senate", "SLDU"), ("house", "SLDL")):
            for dk, v in ((j.get(chamber) or {}).get("districts") or {}).items():
                seen: dict[int, list[str]] = defaultdict(list)
                for c in v.get("candidates", []):
                    if c.get("votes"):
                        seen[int(c["votes"])].append({"D": "D", "R": "R"}.get(c.get("party"), "I"))
                out[(office, district_key(dk))] = {n: ps[0] for n, ps in seen.items() if len(ps) == 1 and n >= 100}
    return out


def undouble(df: pd.DataFrame, st: str, year: int) -> pd.DataFrame:
    # A seat filled twice on the same day (the unexpired term and the full term) arrives as two rows per precinct
    # and candidate, sometimes under two spellings as well. Where a district carries 1.5 times the site's vote or
    # more, one row per precinct and candidate is kept: the set (larger or smaller) that lands nearer the site's total.
    truth0 = {o: district_truth(st, year, o) for o in DISTRICT_OFFICES}
    leg = df["office"].isin(DISTRICT_OFFICES)
    dk_all = df["district"].map(lambda d, memo={}: memo.setdefault(d, district_key(d)))
    major = df["party"].map(lambda p_, memo={}: memo.setdefault(p_, line_letter(p_) in ("D", "R")))
    dsum = df[leg & major].groupby([df["office"], dk_all])["votes"].sum()
    heavy = {k for k, v in dsum.items() if sum(truth0[k[0]].get(k[1], (0, 0))) > 0 and v >= 1.5 * sum(truth0[k[0]][k[1]])}
    if heavy:
        hk = pd.Series([(o, k) in heavy for o, k in zip(df["office"], dk_all)], index=df.index)
        h = df[hk].copy()
        h["_dk"] = dk_all[hk]
        h["_sn"] = h["candidate"].map(surname)
        gk = ["county", "jurisdiction", "precinct", "office", "_dk", "_sn", "party", "mode"]
        agg = h.groupby(gk)["votes"].agg(["max", "min", "count"]).reset_index()
        agg = agg[agg["count"] > 1]
        if len(agg):
            first = h.drop_duplicates(gk).copy()
            first = first.merge(agg, on=gk, how="left")
            rest = df[~hk]
            pieces = []
            for (office, dk), g in first.groupby(["office", "_dk"]):
                hi = g["max"].fillna(g["votes"])
                lo = g["min"].fillna(g["votes"])
                side = g["party"].map(lambda p_: line_letter(p_))
                votes = hi.copy()
                dupd = g["count"].notna()
                for letter, want in zip(("D", "R"), truth0[office][dk]):  # judged a side at a time, on the doubled rows' candidates
                    m_ = (side == letter) & g["_sn"].isin(set(g.loc[dupd & (side == letter), "_sn"]))
                    if m_.any() and abs(lo[m_].sum() - want) < abs(hi[m_].sum() - want):
                        votes[side == letter] = lo[side == letter]
                pieces.append(g.assign(votes=votes))
            fixed = pd.concat(pieces)[list(df.columns)]
            df = pd.concat([rest, fixed], ignore_index=True)
    return df


def relabel_districts(df: pd.DataFrame, st: str, year: int) -> pd.DataFrame:
    """Bring the source's district labels and contest filing into line with the site's, where the source
    is known to differ: abbreviated or county-relative district names, a race filed under the other
    chamber, and a second contest (a same-day special, a mislabelled local race) inside a district."""
    leg = df["office"].isin(["SLDU", "SLDL"])
    if st == "VT":
        def vt(d: str, office: str) -> str:
            toks = [VT_COUNTY.get(t, t) for t in re.split(r"[\s-]+", d) if t]
            if office == "SLDU" and year >= 2022:  # "ADD 1" is the Addison district's seat count, not a number in its name
                toks = [t for t in toks if not t.isdigit()]
                toks = toks[:1] + toks[1:] if toks[:1] != ["CHITTENDEN"] else toks
            elif office == "SLDU":  # some towns are filed under their House district: the Senate district is the county's
                toks = toks[:1]
                toks = ["ESSEX", "ORLEANS"] if toks[0] in ("ESSEX", "ORLEANS") else toks
            return " ".join(toks)
        df.loc[leg, "district"] = [vt(d, o) for d, o in zip(df.loc[leg, "district"], df.loc[leg, "office"])]
    if st == "NH":  # House districts are numbered within a county: Belknap 1 is "BE1"
        m = (df["office"] == "SLDL") & df["district"].str.fullmatch(r"\d+") & df["county"].isin(NH_COUNTY)
        df.loc[m, "district"] = df.loc[m, "county"].map(NH_COUNTY) + df.loc[m, "district"]
        byname = {"BELKNAP": "BE", "CARROLL": "CA", "CHESHIRE": "CH", "COOS": "CO", "GRAFTON": "GR", "HILLSBOROUGH": "HI", "MERRIMACK": "ME", "ROCKINGHAM": "RO", "STRAFFORD": "ST", "SULLIVAN": "SU"}
        m = (df["office"] == "SLDL") & df["district"].str.fullmatch(r"\d+") & df["jurisdiction"].isin(byname)  # no county code: the county's name
        df.loc[m, "district"] = df.loc[m, "jurisdiction"].map(byname) + df.loc[m, "district"]
    gone = [d for (s_, y_, o_, d) in NOT_THE_GENERAL if (s_, y_) == (st, year)]
    if gone:
        df = df[~(df["office"].isin([o_ for (s_, y_, o_, _d) in NOT_THE_GENERAL if (s_, y_) == (st, year)]) & df["district"].isin(gone))].copy()
        leg = df["office"].isin(["SLDU", "SLDL"])
    if (st, year) in SAME_DAY_SPECIALS:
        df = undouble(df, st, year)
        leg = df["office"].isin(["SLDU", "SLDL"])
    if st == "ID":  # House seats A and B of a district are one district on the site
        m = (df["office"] == "SLDL") & df["district"].str.fullmatch(r"\d+[AB]")
        df.loc[m, "district"] = df.loc[m, "district"].str[:-1]
    names = site_names(st, year)
    if not names or not leg.any():
        return df
    sub = df[leg & ~df["candidate"].map(lambda c, memo={}: memo.setdefault(c, bool(SCATTER.match(c))))]
    tot = sub.groupby(["office", "district", "candidate"])["votes"].sum()
    other = {"SLDU": "SLDL", "SLDL": "SLDU"}
    side_of = {k: line_letter(v) for k, v in sub.groupby(["office", "district", "candidate"])["party"].agg(lambda x: x.mode().iat[0] if len(x.mode()) else "").items()}
    move: dict[tuple[str, str, str], str] = {}
    drop: set[tuple[str, str, str]] = set()
    truth = {o: district_truth(st, year, o) for o in ("SLDU", "SLDL")}
    for (office, district), g in tot.groupby(level=[0, 1]):
        dk = district_key(district)
        here, there = names.get((office, dk), {}), names.get((other[office], dk), {})
        cands = {c: int(v) for (_, _, c), v in g.items() if v > 0}
        sn = {c: surname(c) for c in cands}
        # Filed under the wrong chamber: nobody here is the site's candidate for this seat, they are all the other chamber's.
        strays = [c for c in cands if sn[c] not in here and sn[c] in there]
        if strays and (not here or all(sn[c] not in here for c in cands if cands[c] > 0.02 * sum(cands.values())) or len(strays) < len(cands)):
            for c in strays:
                move[(office, district, c)] = other[office]
        # A second contest in the district: in a seat where the site lists one candidate a side, and that candidate's
        # votes here equal the site's, an unlisted candidate of some size is not part of this race.
        t = truth[office].get(dk)
        sides = defaultdict(list)
        for s_, p_ in here.items():
            sides[p_].append(s_)
        if t and here and all(len(v) == 1 for k, v in sides.items() if k in ("D", "R")):
            listed = {c for c in cands if sn[c] in here}
            ok = [side for side, want in (("D", t[0]), ("R", t[1])) if want > 0 and any(here.get(sn[c]) == side and abs(cands[c] - want) <= 0.01 * want for c in listed)]
            for c in cands:
                if c not in listed and (office, district, c) not in move and cands[c] > 0.15 * (t[0] + t[1]) and side_of.get((office, district, c)) in ok:
                    drop.add((office, district, c))
    if move or drop:
        k = list(zip(df["office"], df["district"], df["candidate"]))
        keep = np.array([x not in drop for x in k])
        df["office"] = [move.get(x, x[0]) for x in k]
        df = df[keep].copy()
    return df


def county_pieces(df: pd.DataFrame, ctruth: dict) -> dict[tuple[str, str, str], list[int]]:
    """(office, district key, county) → [Dem, Rep] in a source frame, for the offices the certified table covers."""
    s_ = df[df["office"].isin({k[0] for k in ctruth}) & df["letter"].isin(["D", "R"])]
    out_: dict[tuple[str, str, str], list[int]] = defaultdict(lambda: [0, 0])
    for (o, d, c, l), v in s_.groupby(["office", "district", "county", "letter"])["votes"].sum().items():
        out_[(o, district_key(d), c)][0 if l == "D" else 1] += int(v)
    return out_


def drop_hidden_county_totals(df: pd.DataFrame, ctruth: dict) -> pd.DataFrame:
    """A city or county total filed as if it were one more precinct ("CITY OF YONKERS NY", "City of Buffalo"):
    where a county piece runs 15% or more over its certified figure and one precinct accounts for the excess,
    that precinct's rows for the contest are dropped."""
    got = county_pieces(df, ctruth)
    gone = []
    s_ = df[df["office"].isin({k[0] for k in ctruth}) & df["letter"].isin(["D", "R"])]
    dk_ = s_["district"].map(lambda d, memo={}: memo.setdefault(d, district_key(d)))
    for k, t in ctruth.items():
        have = sum(got.get(k, [0, 0]))
        want = t[0] + t[1]
        if not k[2] or want == 0 or have < 1.15 * want:
            continue
        piece = s_[(s_["office"] == k[0]) & (dk_ == k[1]) & (s_["county"] == k[2])]
        by = piece.groupby(["jurisdiction", "precinct"])["votes"].sum()
        if len(by) < 3:
            continue
        top, v = by.idxmax(), int(by.max())
        if v >= 0.8 * (have - want) and abs(have - v - want) < abs(have - want):
            gone.append((k[0], k[1], k[2], top[0], top[1]))
    if not gone:
        return df
    dk_all = df["district"].map(lambda d, memo={}: memo.setdefault(d, district_key(d)))
    hit = set(gone)
    keep = [(o, d, c, j, p_) not in hit for o, d, c, j, p_ in zip(df["office"], dk_all, df["county"], df["jurisdiction"], df["precinct"])]
    return df[keep].copy()


def fill_from_certified(df: pd.DataFrame, ctruth: dict, st: str, year: int) -> pd.DataFrame:
    """A county piece that no source has, or has more than 10% off its certified figure (Orange County's House vote
    in New York 2018, the Indiana counties that publish no precinct returns): the certified county total stands in as
    one countywide line, which the builder spreads over that county's precincts and counts as an estimate."""
    got = county_pieces(df, ctruth)
    fill = [(k, t) for k, t in ctruth.items() if k[2] and t[0] + t[1] > 0
            and sum(abs(got.get(k, [0, 0])[i] - t[i]) for i in (0, 1) if t[i] > 0) > 0.10 * (t[0] + t[1])]  # a side with no certified major-party line is left alone
    # A county whose precinct rows are a little short of its certified figure on both sides (1% to 10%: ballots the
    # county did not report by precinct) keeps its precinct rows and gets one countywide line for the shortfall.
    filled = {k for k, _ in fill}
    short = []
    for k, t in ctruth.items():
        g = got.get(k)
        if k in filled or not k[2] or g is None or t[0] + t[1] == 0:
            continue
        gap = [t[i] - g[i] if t[i] > 0 else 0 for i in (0, 1)]
        if min(gap) >= 0 and sum(gap) > 0.01 * (t[0] + t[1]):
            short.append((k, gap))
    if not fill and not short:
        return df
    dk_all = df["district"].map(lambda d, memo={}: memo.setdefault(d, district_key(d)))
    # the contest's leading candidate of each party, so the countywide line joins that candidate's other rows
    lead = {}
    for (o, d, l, c), v in df[df["letter"].isin(["D", "R"])].assign(_dk=dk_all).groupby(["office", "_dk", "letter", "candidate"])["votes"].sum().sort_values().items():
        lead[(o, d, l)] = c
    side_gone = {(k[0], k[1], k[2], l) for k, t in fill for l, v in (("D", t[0]), ("R", t[1])) if v > 0}
    df = df[[(o, d, c, l) not in side_gone for o, d, c, l in zip(df["office"], dk_all, df["county"], df["letter"])]].copy()
    template = df.iloc[0].to_dict()
    extra = []
    for (office, dk, county), t in fill:
        for letter, votes, party in (("D", t[0], "DEMOCRAT"), ("R", t[1], "REPUBLICAN")):
            if votes:
                extra.append({**template, "county": county, "jurisdiction": "", "precinct": "COUNTYWIDE (CERTIFIED TOTAL)", "office": office, "district": dk,
                              "candidate": lead.get((office, dk, letter), f"{party} CANDIDATE"), "party": party, "writein": False, "mode": "TOTAL", "votes": votes, "scatter": False, "line": letter, "letter": letter})
    for (office, dk, county), gap in short:
        for letter, votes, party in (("D", gap[0], "DEMOCRAT"), ("R", gap[1], "REPUBLICAN")):
            if votes:
                extra.append({**template, "county": county, "jurisdiction": "", "precinct": "COUNTYWIDE (NOT REPORTED BY PRECINCT)", "office": office, "district": dk,
                              "candidate": lead.get((office, dk, letter), f"{party} CANDIDATE"), "party": party, "writein": False, "mode": "TOTAL", "votes": votes, "scatter": False, "line": letter, "letter": letter})
    if not extra:
        return df
    df = pd.concat([df, pd.DataFrame(extra)[list(df.columns)]], ignore_index=True)
    if short:
        print(f"  {st} {year}: {len(short)} county pieces topped up to their certified totals")
    print(f"  {st} {year}: {len(fill)} county pieces taken from the certified county totals ({', '.join(sorted(f'{o} {d} in {c}' for (o, d, c), _ in fill)[:10])}{'…' if len(fill) > 10 else ''})")
    return df


# Contests where the site's district totals were checked against the certified result and the precinct source is the
# one that is off, but no certified figure by county is at hand. Each district more than 1% from its certified total
# is brought to it: short on both sides, the precinct rows stay and the shortfall is added as countywide lines;
# otherwise the district's major-party rows are replaced by countywide lines. Either way the votes are split between
# the district's counties in proportion to the source's own vote there, and counted as an estimate.
# A district with no source rows at all cannot be placed and is left out.
DISTRICT_CERTIFIED = {("UT", 2016, "SLDU"), ("UT", 2016, "USH"), ("OR", 2020, "SLDU"), ("OR", 2020, "SLDL"), ("ID", 2020, "SLDL"), ("MI", 2022, "SLDL"),
                      ("TX", 2016, "USH"), ("TX", 2016, "SLDU"), ("TX", 2016, "SLDL"),
                      # MEDSL's Arkansas 2022 file drops unopposed winners (House 8, 45, 97, 39's Republican), some
                      # candidates (House 73's Democrat, 22's Republican) and files House 98's Democrat under 5 (2026-11-26).
                      ("AR", 2022, "SLDU"), ("AR", 2022, "SLDL"),
                      # MEDSL's Vermont 2022 file puts Orange's Republican (John Klar, 4,519) under Washington (2026-11-27).
                      ("VT", 2022, "SLDU"),
                      # Found by the 2026-11-27 seat scan (precinct seat totals against the site's certified seat results):
                      # Vermont 2020 Senate's county seats ran 20–40% off.
                      ("VT", 2020, "SLDU")}


# State-years on the same district map as 2024, where a district with no source rows can borrow its county split from 2024.
SAME_MAP_AS_2024 = {("MI", 2022), ("AR", 2022), ("VT", 2022)}


def counties_2024(st: str, office: str, dk: str) -> pd.Series:
    """County → votes cast in that district in 2024, from the 2024 precinct results (precinct → county from the index)."""
    res = json.loads((OUT / st / "2024.json").read_text())
    idx = json.loads((ROOT / "public" / "precincts" / "index" / f"{st}.json").read_text())
    rows, dist = res["offices"].get(office), res.get("districts", {}).get(office)
    if not rows or not dist:
        return pd.Series(dtype=float)
    out: dict[str, int] = defaultdict(int)
    for r, d, c in zip(rows, dist, idx["county"]):
        if district_key(d) == dk:
            out[idx["counties"][c][0]] += r[0] + r[1] + r[2]
    return pd.Series(out, dtype=float)


def fill_from_district_truth(df: pd.DataFrame, st: str, year: int) -> pd.DataFrame:
    offices = [o for (s_, y_, o) in DISTRICT_CERTIFIED if (s_, y_) == (st, year) and (not ONLY or o in ONLY)]
    if not offices:
        return df
    dk_all = df["district"].map(lambda d, memo={}: memo.setdefault(d, district_key(d)))
    extra, gone, n_top, n_rep, n_none = [], set(), 0, 0, 0
    template = df.iloc[0].to_dict()
    for office in offices:
        truth = district_truth(st, year, office)
        # Rows filed under a district the office does not have (Arkansas 2022: Senate 6's Democrat under "085")
        # are a source mislabel: dropped here, since the district they belong to is brought to its total below.
        if truth:
            bogus = (df["office"] == office) & ~dk_all.isin(set(truth))
            if bogus.any():
                print(f"  {st} {year} {office}: {int(bogus.sum())} rows under districts the office does not have ({', '.join(sorted(set(dk_all[bogus]))[:6])}) dropped")
                df, dk_all = df[~bogus].copy(), dk_all[~bogus]
        if office in SLOT:
            # single-winner office: the two sides are the slot candidates (a Libertarian holds the first slot where no
            # Democrat ran), so the comparison and the added lines follow the slots, not the party labels
            comp_ = slot_table(df)
            sub = df[(df["office"] == office) & (comp_ < 2)].assign(_dk=dk_all, _side=comp_.map({0: "D", 1: "R"}))
        else:
            sub = df[(df["office"] == office) & df["letter"].isin(["D", "R"])].assign(_dk=dk_all)
            sub["_side"] = sub["letter"]
        side_tot = {k: int(v) for k, v in sub.groupby(["_dk", "_side"])["votes"].sum().items()}
        lead, lead_letter, lead_party = {}, {}, {}
        for (d, l, c, lt, pt), v in sub.groupby(["_dk", "_side", "candidate", "letter", "party"])["votes"].sum().sort_values().items():
            lead[(d, l)], lead_letter[(d, l)], lead_party[(d, l)] = c, lt, pt
        for dk, t in truth.items():
            if t[0] + t[1] == 0:
                continue
            g = [side_tot.get((dk, "D"), 0), side_tot.get((dk, "R"), 0)]
            if abs(g[0] - t[0]) + abs(g[1] - t[1]) <= 0.01 * (t[0] + t[1]):
                continue
            counties = sub[sub["_dk"] == dk].groupby("county")["votes"].sum()
            counties = counties[counties.index != ""]
            if counties.sum() <= 0 and (st, year) in SAME_MAP_AS_2024:
                counties = counties_2024(st, office, dk)  # no rows at all: where the district's 2024 vote was cast (same map)
            if counties.sum() <= 0:
                n_none += 1
                continue
            share = counties / counties.sum()
            gap = [t[i] - g[i] for i in (0, 1)]
            top_up = min(gap) >= 0
            if top_up:
                amounts, n_top = gap, n_top + 1
            else:
                amounts, n_rep = [t[0], t[1]], n_rep + 1
                gone |= {(office, dk, lead_letter.get((dk, "D"), "D"), lead.get((dk, "D"))), (office, dk, lead_letter.get((dk, "R"), "R"), lead.get((dk, "R")))}
            for i, (letter, party) in enumerate((("D", "DEMOCRAT"), ("R", "REPUBLICAN"))):
                if amounts[i] <= 0:
                    continue
                parts = V.largest_remainder((share * amounts[i]).to_numpy(), int(amounts[i]))
                for county, v in zip(share.index, parts):
                    if v:
                        lt = lead_letter.get((dk, letter), letter)
                        extra.append({**template, "county": county, "jurisdiction": "", "precinct": "COUNTYWIDE (CERTIFIED DISTRICT TOTAL)", "office": office, "district": dk,
                                      "candidate": lead.get((dk, letter), f"{party} CANDIDATE"), "party": lead_party.get((dk, letter), party), "writein": False, "mode": "TOTAL", "votes": int(v), "scatter": False, "line": lt, "letter": lt})
    if not extra:
        return df
    if gone:
        if any(o in SLOT for o, *_ in gone):
            df = df[[(o, d, l, c) not in gone for o, d, l, c in zip(df["office"], dk_all, df["letter"], df["candidate"])]].copy()
        else:
            g2 = {(o, d, l) for o, d, l, _c in gone}
            df = df[[(o, d, l) not in g2 for o, d, l in zip(df["office"], dk_all, df["letter"])]].copy()
    df = pd.concat([df, pd.DataFrame(extra)[list(df.columns)]], ignore_index=True)
    df["mk"] = df.groupby(["county", "jurisdiction", "precinct"], sort=False).ngroup()
    print(f"  {st} {year}: districts brought to their certified totals: {n_top} topped up, {n_rep} replaced, {n_none} with no source rows left out")
    return df


def load_medsl(st: str, year: int, tags: dict[str, dict[str, str]] | None = None, statewide: dict[str, dict] | None = None) -> pd.DataFrame | None:
    """--variant mix: two inputs for one state-year (MEDSL and OpenElections). Statewide offices come from MEDSL.
    Each House or legislative district comes whole from one of the two: the one whose party totals sit nearer
    the site's result for that district (MEDSL when level, or when the site holds no result)."""
    global VARIANT
    if VARIANT != "mix":
        df = load_one(st, year, tags, statewide)
        ctruth = certified_by_county(st, year) if df is not None else {}
        if ctruth:  # certified totals by county exist: hidden total rows go, and counties no source covers are filled
            df = fill_from_certified(drop_hidden_county_totals(df, ctruth), ctruth, st, year)
            df["mk"] = df.groupby(["county", "jurisdiction", "precinct"], sort=False).ngroup()
        return fill_from_district_truth(df, st, year) if df is not None else None
    try:
        VARIANT = ""
        a = load_one(st, year, tags, statewide)
        VARIANT = "oe"
        b = load_one(st, year, tags, statewide)
    finally:
        VARIANT = "mix"
    if a is None or b is None:
        return a if b is None else b
    pick_b: set[tuple[str, str]] = set()
    for office in DISTRICT_OFFICES:
        truth = district_truth(st, year, office)
        tot = []
        for df in (a, b):
            s_ = df[(df["office"] == office) & df["letter"].isin(["D", "R"])]
            if office == "USH":  # single-winner: the leading candidate of each party
                s_ = s_.groupby(["district", "letter", "candidate"])["votes"].sum().groupby(level=[0, 1]).max()
            else:
                s_ = s_.groupby(["district", "letter"])["votes"].sum()
            got: dict[str, list[int]] = defaultdict(lambda: [0, 0])
            for (d, l), v in s_.items():
                got[district_key(d)][0 if l == "D" else 1] += int(v)
            tot.append(got)
        for k, t in truth.items():
            if t[0] + t[1] == 0 or k not in tot[1]:
                continue
            err = [abs(g[k][0] - t[0]) + abs(g[k][1] - t[1]) if k in g else t[0] + t[1] + 1 for g in tot]
            if err[1] < err[0]:
                pick_b.add((office, k))
    ka = pd.Series([(o, district_key(d)) in pick_b for o, d in zip(a["office"], a["district"])], index=a.index)
    kb = pd.Series([(o, district_key(d)) in pick_b for o, d in zip(b["office"], b["district"])], index=b.index)
    # Where the state certifies each district's vote by county (New York), the choice is made a county at a time:
    # one source can be complete in one county of a district and short or doubled in the next.
    ctruth = certified_by_county(st, year)
    if ctruth:
        pieces = lambda df_: county_pieces(df_, ctruth)  # noqa: E731
        drop_hidden_totals = lambda df_: drop_hidden_county_totals(df_, ctruth)  # noqa: E731
        a, b = drop_hidden_totals(a), drop_hidden_totals(b)
        ka = pd.Series([(o, district_key(d)) in pick_b for o, d in zip(a["office"], a["district"])], index=a.index)
        kb = pd.Series([(o, district_key(d)) in pick_b for o, d in zip(b["office"], b["district"])], index=b.index)
        pa, pb = pieces(a), pieces(b)
        take_b = set()
        for k, t in ctruth.items():
            if not k[2] or t[0] + t[1] == 0:
                continue
            ea = abs(pa[k][0] - t[0]) + abs(pa[k][1] - t[1]) if k in pa else t[0] + t[1] + 1
            eb = abs(pb[k][0] - t[0]) + abs(pb[k][1] - t[1]) if k in pb else t[0] + t[1] + 1
            if eb < ea:
                take_b.add(k)
        decided = set(ctruth)
        ka2 = [(o, district_key(d), c) for o, d, c in zip(a["office"], a["district"], a["county"])]
        kb2 = [(o, district_key(d), c) for o, d, c in zip(b["office"], b["district"], b["county"])]
        ka = pd.Series([(k in take_b) if k in decided else bool(x) for k, x in zip(ka2, ka)], index=a.index)
        kb = pd.Series([(k in take_b) if k in decided else bool(x) for k, x in zip(kb2, kb)], index=b.index)
        pick_b = {(o, f"{d} in {c}") for o, d, c in take_b}
    # MEDSL rows with no district number are the votes of districts it could not place: once the other source
    # supplies districts for that office, they would be counted twice.
    blank = a["office"].isin({o for o, _ in pick_b}) & a["office"].isin(DISTRICT_OFFICES) & (a["district"].map(district_key) == "") & ~ka
    ka = ka | blank
    b = b[kb].copy()
    b["jurisdiction"] = b["jurisdiction"].astype(str)
    df = pd.concat([a[~ka], b], ignore_index=True)
    if ctruth:
        df = fill_from_certified(df, ctruth, st, year)
    df["mk"] = df.groupby(["county", "jurisdiction", "precinct"], sort=False).ngroup()
    print(f"  {st} {year} mix: {len(pick_b)} districts from OpenElections ({', '.join(sorted(o + ' ' + k for o, k in pick_b)[:12])}{'…' if len(pick_b) > 12 else ''})")
    return fill_from_district_truth(df, st, year)


def certified_by_county(st: str, year: int) -> dict[tuple[str, str, str], list[int]]:
    """(office, district key, county fips) → [Dem, Rep] where the state publishes certified district totals by county.
    Limited to the offices being built (--only), so the top-of-ticket rows used to match precincts are left as they are."""
    out = certified_all(st, year)
    return {k: v for k, v in out.items() if k[0] in ONLY} if ONLY else out


# Districts that lie wholly inside one county, where the precinct source is short, garbled or empty: the site's
# certified district total is that county's figure (each checked against the state's certified result).
SINGLE_COUNTY = {
    ("KY", 2016, "SLDU", "19"): "21111",   # Jefferson
    ("FL", 2018, "SLDU", "18"): "12057",   # Hillsborough: the state's own precinct file has no candidate rows for it
    ("SC", 2018, "SLDL", "79"): "45079",   # Richland
    ("SC", 2018, "SLDL", "80"): "45079",
}


def site_by_county(st: str, year: int) -> dict[tuple[str, str, str], list[int]]:
    """Certified county figures the site already holds: governor, U.S. Senate and president by county, U.S. House by
    district and county (only districts whose county rows add up to the certified total), and single-county districts."""
    import csv
    out: dict[tuple[str, str, str], list[int]] = {}
    de = ROOT / "data-entry"
    for office, path in (("GOV", de / f"county_governor_results_{year}.csv"), ("USS", de / f"county_senate_results_{year}.csv")):
        if path.exists():
            with open(path, newline="") as f:
                for r in csv.DictReader(f):
                    if r["state"] == st and r.get("special", "") in ("", "0", "False", "false") and B._num(r.get(f"total_{year}", "")):
                        out[(office, "", r["county_id"].zfill(5))] = [B._num(r.get(f"dem_{year}", "")), B._num(r.get(f"gop_{year}", ""))]
    cert = B.house_certified()
    rows: dict[str, list] = defaultdict(list)
    with open(de / "house_district_county_results.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == st and r["year"] == str(year):
                rows[r["district"]].append(r)
    for d, rs in rows.items():
        c = cert.get((year, st, d))
        sd, sr = sum(B._num(r["dem"]) for r in rs), sum(B._num(r["gop"]) for r in rs)
        if c and abs(sd - c[0]) <= 0.001 * max(c[0], 1) and abs(sr - c[1]) <= 0.001 * max(c[1], 1):
            for r in rs:
                out[("USH", district_key(d), r["county_fips"].zfill(5))] = [B._num(r["dem"]), B._num(r["gop"])]
    for (s_, y_, office, d), fips in SINGLE_COUNTY.items():
        if (s_, y_) == (st, year):
            t = district_truth(st, year, office).get(district_key(d))
            if t:
                out[(office, district_key(d), fips)] = [t[0], t[1]]
    return out


def certified_all(st: str, year: int) -> dict[tuple[str, str, str], list[int]]:
    out = site_by_county(st, year) if (st, year) in USE_SITE_COUNTIES else {}
    out.update(state_certified(st, year))
    return out


# State-years where the site's own certified county figures are used to fill counties the precinct source lacks.
USE_SITE_COUNTIES = {("KY", 2023), ("MI", 2022), ("KY", 2016), ("FL", 2018), ("SC", 2018), ("TX", 2016), ("NJ", 2018)}


def state_certified(st: str, year: int) -> dict[tuple[str, str, str], list[int]]:
    if st == "NY" and (RAW / "official" / "ny" / str(year)).exists():
        import newyork_certified
        return {(o, district_key(d), c): v for (o, d, c), v in newyork_certified.county_truth(year).items()}
    # any state: raw/official/{st}/certified_by_county_{year}.csv (office, district, county, dem, rep), written by that state's fetcher
    path = RAW / "official" / st.lower() / f"certified_by_county_{year}.csv"
    if path.exists():
        import csv
        with open(path, newline="") as f:
            return {(r["office"], district_key(r["district"]), r["county"]): [int(r["dem"]), int(r["rep"])] for r in csv.DictReader(f)}
    return {}


def load_one(st: str, year: int, tags: dict[str, dict[str, str]] | None = None, statewide: dict[str, dict] | None = None) -> pd.DataFrame | None:
    path = RAW / "medsl" / str(year) / "by_state" / (f"{st}.{VARIANT}.parquet" if VARIANT else f"{st}.parquet")
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    if "USS_S" in set(df["office"]) and "USS" not in set(df["office"]):
        df["office"] = df["office"].replace({"USS_S": "USS"})  # the only Senate race that year (VEST files it as the general)
    # Alaska has no counties and the federal and state files code that differently: no county at all.
    ok = df["county"].str.fullmatch(r"\d{5}") & (df["county"].str[:2] == V.B_FIPS[st]) & (df["county"].str[2:] != "000")
    df["county"] = df["county"].where(ok, "")
    for c in ("jurisdiction", "precinct"):
        df[c] = df[c].astype(str).str.upper().str.strip()
    df = df[~df["candidate"].map(lambda c, memo={}: memo.setdefault(c, bool(META.match(c))))].copy()
    df["district"] = df["district"].map(norm_district)
    df = relabel_districts(df, st, year)
    # "COUNTY TOTAL" / "Ocean Totals" lines repeat the precinct lines above them: dropped where the precinct
    # lines of that county and contest cover at least half of them (a county that reports only its total keeps it).
    # District-wide totals (New Jersey) always go.
    df = df[~df["precinct"].str.fullmatch(r"DISTRICT( \d+)? TOTALS?")].copy()
    is_total = df["precinct"].str.contains(r"\bTOTALS?$", regex=True)
    if is_total.any():
        # Compared within one voting mode: Maryland's county "Total" lines for early, absentee and provisional
        # votes sit beside election-day precinct lines and are separate counts.
        g3 = ["county", "office", "district", "mode", "candidate"]
        parts_sum = df[~is_total].groupby(g3)["votes"].sum().rename("p")
        tot_max = df[is_total].groupby(g3)["votes"].max().rename("t")
        chk = pd.concat([parts_sum, tot_max], axis=1).dropna()
        covered = set(chk.index[chk["p"] >= 0.5 * chk["t"]].droplevel("candidate").unique()) if len(chk) else set()
        keys = list(zip(df["county"], df["office"], df["district"], df["mode"]))
        drop = is_total & (pd.Series([k in covered for k in keys], index=df.index) | df["precinct"].str.fullmatch(r"DISTRICT( \d+)? TOTALS?"))
        df = df[~drop].copy()
    # A precinct that carries both a TOTAL line and by-mode lines for a contest: the TOTAL already holds them,
    # provided the modes of those precincts do not add up to more than their TOTALs (then they are separate counts).
    pk = ["county", "jurisdiction", "precinct", "office", "district"]
    has_total = df[df["mode"] == "TOTAL"][pk].drop_duplicates().assign(_t=1)
    if len(has_total) and (df["mode"] != "TOTAL").any():
        df = df.merge(has_total, on=pk, how="left")
        both = df[df["_t"] == 1]
        ck3 = ["county", "office", "district"]
        t_sum = both[both["mode"] == "TOTAL"].groupby(ck3)["votes"].sum().rename("t")
        m_sum = both[both["mode"] != "TOTAL"].groupby(ck3)["votes"].sum().rename("m")
        cmp_ = pd.concat([t_sum, m_sum], axis=1).dropna()
        inside = set(cmp_.index[(cmp_["m"] > 0) & (cmp_["m"] <= 1.02 * cmp_["t"])])
        flag = pd.Series([k in inside for k in zip(df["county"], df["office"], df["district"])], index=df.index)
        df = df[~((df["_t"] == 1) & (df["mode"] != "TOTAL") & flag)].drop(columns=["_t"]).reset_index(drop=True)
    # TOTAL lines next to by-mode lines for the same contest in the same county: keep one of the two.
    grp = ["county", "office", "district"]
    tot = df[df["mode"] == "TOTAL"].groupby(grp)["votes"].sum().rename("t")
    oth = df[df["mode"] != "TOTAL"].groupby(grp)["votes"].sum().rename("m")
    both = pd.concat([tot, oth], axis=1).dropna()
    dup = both[(both["t"] > 0) & (both["m"] > 0) & ((both["m"] - both["t"]).abs() <= 0.02 * both["t"])]
    if len(dup):
        df = df.merge(dup.assign(dupflag=1)[["dupflag"]], left_on=grp, right_index=True, how="left")
        df = df[~((df["dupflag"] == 1) & (df["mode"] != "TOTAL"))].drop(columns=["dupflag"])
    df["line"] = df["party"].map(lambda p, memo={}: memo.setdefault(p, line_letter(p)))
    # The source's write-in flag is wrong for some nominees (Nevada 2018): a major-party line holding at least
    # 5% of its contest is a ballot candidate whatever the flag says.
    ctot = df.groupby(["office", "district"])["votes"].transform("sum")
    cand_tot = df.groupby(["office", "district", "candidate"])["votes"].transform("sum")
    real = df["line"].isin(["D", "R"]) & (cand_tot >= 0.05 * ctot)
    df["scatter"] = (df["writein"].astype(bool) & ~real) | df["candidate"].map(lambda c, memo={}: memo.setdefault(c, bool(SCATTER.match(c))))
    # One party per candidate (fusion: the candidate keeps every line's votes, under their major party).
    ck = ["office", "district", "candidate"]
    lines = df[~df["scatter"]].groupby(ck + ["line"])["votes"].sum().reset_index()
    site = site_parties(st, year)
    svotes = site_votes(st, year)
    letters: dict[tuple[str, str, str], str] = {}
    dtruth: dict[str, dict[str, tuple[int, int]]] = {}
    # A candidate listed once with a party and once without (two spellings) is one person: the blank
    # line takes the party of the same surname in the same contest.
    known: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for o_, d_, c_, l_ in zip(lines["office"], lines["district"], lines["candidate"], lines["line"]):
        if l_ in ("D", "R"):
            known[(o_, d_, surname(c_))].add(l_)
    firsts: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for o_, d_, c_ in zip(lines["office"], lines["district"], lines["candidate"]):
        firsts[(o_, d_, surname(c_))].add(person_key(c_))
    # the first party named on each candidate's label ("INDEPENDENT, REPUBLICAN" → I)
    def first_party(p_: str) -> str:
        x = re.split(r"[,/]", p_.strip())[0].strip()
        return "D" if DEM_RE.match(x) else "R" if REP_RE.match(x) else "I"
    df_party_first = {k: first_party(v) for k, v in df[~df["scatter"]].groupby(ck)["party"].agg(lambda x: x.mode().iat[0] if len(x.mode()) else "").items()}
    for (office, district, cand), g in lines.groupby(ck):
        by = dict(zip(g["line"], g["votes"]))
        major = max((l for l in ("D", "R") if l in by), key=lambda l: by[l], default=None)
        sn = surname(cand)
        exact = site.get((office, district, person_key(cand))) or (site.get((office, district, sn)) if len(firsts[(office, district, sn)]) == 1 else None)
        looked = exact or site.get((office, "*", sn)) or (tags or {}).get(office.replace("_S", ""), {}).get(sn[:3])
        own = df_party_first.get((office, district, cand), "")
        if exact == "I" and office in ("SLDU", "SLDL") and own not in ("D", "R"):
            major = None  # "Independent, Republican" (Oregon): the candidate's own party comes first, and the site lists them as other
            by = {"I": 1}
        elif exact in ("D", "R") and office in ("SLDU", "SLDL"):
            major = exact  # the site's district results name this candidate: its party wins over a stray label
        elif "B" in by or ("D" in by and "R" in by):
            major = (looked if looked in ("D", "R") else None) or major or "D"  # cross-filed: the site's party for them
        same = known.get((office, district, sn), set())
        if major is None and "?" in by and len(same) == 1 and sn and len(firsts[(office, district, sn)]) == 1:
            major = next(iter(same))
        if major is None and not looked and "?" not in by and office in DISTRICT_OFFICES and not any(l in by for l in ("D", "R", "B")):
            # Wyoming House 17, 2022: the nominees carry other parties' labels in the source. A candidate whose total
            # is, to the vote, one side of the site's result for the district is that side's nominee.
            if office not in dtruth:
                dtruth[office] = district_truth(st, year, office)
            t = dtruth[office].get(district_key(district))
            tot = int(g["votes"].sum())
            if t and tot >= 200 and (tot == t[0]) != (tot == t[1]):
                major = "D" if tot == t[0] else "R"
        if major is None and "?" in by and not looked and office in ("SLDU", "SLDL"):
            # No party and a name the site spells differently ("ELSIE BLAIR MAGNUS" / "Elsie Blairmagnus"): a candidate
            # whose total is, to the vote, one site candidate's total in that district is that candidate.
            same_total = svotes.get((office, district_key(district)), {}).get(int(g["votes"].sum()))
            if same_total in ("D", "R"):
                major = same_total
            elif same_total == "I":
                looked = "I"
        if major is None and "?" in by and not looked:
            # No party anywhere: a candidate whose total equals one side of the site's result for the contest is that side.
            if office not in dtruth:
                if office in DISTRICT_OFFICES:
                    dtruth[office] = district_truth(st, year, office)
                else:
                    sw = (statewide or {}).get(office)
                    dtruth[office] = {"": (sw["d"], sw["r"])} if sw else {}
            t = dtruth[office].get(district_key(district))
            tot = int(g["votes"].sum())
            if t and tot > 0:
                near = [l for l, v in (("D", t[0]), ("R", t[1])) if v > 0 and abs(tot - v) <= 0.02 * v]
                if len(near) == 1:
                    major = near[0]
        if st == "NE" and office == "SLDU":
            major = looked if looked in ("D", "R") else None
            by = {"I": 1}
        letters[(office, district, cand)] = major or (looked if "?" in by and looked else None) or ("I" if "I" in by or "?" in by else "M")
    df["letter"] = [("W" if s else letters.get((o, d, c), "M")) for s, o, d, c in zip(df["scatter"], df["office"], df["district"], df["candidate"])]
    df["mk"] = df.groupby(["county", "jurisdiction", "precinct"], sort=False).ngroup()
    return df


def slot_table(df: pd.DataFrame) -> pd.Series:
    """Component per row: 0 = D slot / Democratic sum, 1 = R, 2 = other."""
    comp = np.full(len(df), 2, dtype=np.int8)
    slot = df["office"].isin(["PRES", "USS", "GOV", "USH", "USS_S"]).to_numpy()
    comp[~slot & (df["letter"] == "D").to_numpy()] = 0
    comp[~slot & (df["letter"] == "R").to_numpy()] = 1
    s = df[slot]
    # Two spellings of one name ("S. BRET GUTHRIE" / "S. BRETT GUTHRIE") are one candidate: same surname, initial and party.
    # A misspelt surname ("SCOTT GARNETT" beside "SCOTT GARRETT", same party, same contest) is the same candidate too.
    import difflib
    canon: dict[tuple[str, str, str, str], str] = {}
    names = s[s["letter"] != "W"].groupby(["office", "district", "letter", "candidate"])["votes"].sum()
    for (office_, district_, letter_), g_ in names.groupby(level=[0, 1, 2]):
        ordered = [c for (_, _, _, c), _v in sorted(g_.items(), key=lambda kv: -kv[1])]
        heads: list[str] = []
        for c in ordered:
            fc = re.sub(r"[^A-Z ]", "", fold(c))
            hit = next((h for h in heads if person_key(h) != person_key(c) and difflib.SequenceMatcher(None, re.sub(r"[^A-Z ]", "", fold(h)), fc).ratio() >= 0.9
                        and fold(h).split()[:1] == fold(c).split()[:1]), None)
            if not hit:  # a bare surname ("PINGREE", "BABIN") and the one fuller name of that surname and party are one person
                same = [h for h in heads if surname(h) == surname(c)]
                bare_c = len(fc.split()) == 1
                bare_h = len(same) == 1 and len(re.sub(r"[^A-Z ]", "", fold(same[0])).split()) == 1
                hit = same[0] if len(same) == 1 and (bare_c or bare_h) else None
            if hit:
                canon[(office_, district_, letter_, c)] = hit
            else:
                heads.append(c)
    person = pd.Series([f"{person_key(canon.get((o, d, l, c), c))}~{l}" if l != "W" else c for o, d, c, l in zip(s["office"], s["district"], s["candidate"], s["letter"])], index=s.index)
    tot = s.assign(person=person).groupby(["office", "district", "person", "letter"])["votes"].sum().reset_index()
    pick: dict[tuple[str, str, str], int] = {}
    for (office, district), g in tot.groupby(["office", "district"]):
        cands = [(f"{c}|{l}|" + ("" if office == "USH" else c.split("~")[0][:3]), l, int(v)) for c, l, v in zip(g["person"], g["letter"], g["votes"])]
        d, r = B.slot_columns(cands)  # the King / Sanders rule reads the last three letters of the tag
        if d:
            pick[(office, district, d.split("|")[0])] = 0
        if r:
            pick[(office, district, r.split("|")[0])] = 1
    idx = np.flatnonzero(slot)
    vals = [pick.get(k, 2) if l != "W" else 2 for k, l in zip(zip(s["office"], s["district"], person), s["letter"])]
    comp[idx] = vals
    return pd.Series(comp, index=df.index)


def county_of(old: gpd.GeoDataFrame, st: str) -> pd.Series:
    counties = gpd.read_file(ROOT / "public" / "us-counties.json")
    if counties.crs is None:
        counties = counties.set_crs(4326)
    counties["fips"] = counties["id"].astype(str).str.zfill(5)
    counties = counties[counties["fips"].str[:2] == V.B_FIPS[st]][["fips", "geometry"]].to_crs(V.CRS)
    pts = gpd.GeoDataFrame(geometry=old.geometry.representative_point(), index=old.index)
    j = gpd.sjoin_nearest(pts, counties, how="left")
    return j[~j.index.duplicated()]["fips"].reindex(old.index)


def vest_signature(old: gpd.GeoDataFrame, year: int) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """office → (n, 2) D/R counts per VEST precinct; and a top-of-ticket total used as an allocation weight."""
    cs = V.contests([c for c in old.columns if c not in ("geometry", "oid")], f"{year % 100:02d}")
    sig: dict[str, np.ndarray] = {}
    weight = None
    yy = f"{year % 100:02d}"
    for office in SIG_OFFICES:
        cols = cs.get(office, {}).get("general", [])
        if office == "USS_S":  # a Senate special held with the general (VEST "S20USS…")
            cols = [(c, c[6]) for c in old.columns if re.match(rf"^S{yy}USS[A-Z][A-Z0-9]{{2,3}}$", c.upper())]
        if not cols:
            continue
        v = old[[c for c, _ in cols]].apply(pd.to_numeric, errors="coerce").fillna(0)
        dcol, rcol = B.slot_columns([(c, p, int(v[c].sum())) for c, p in cols])
        sig[office] = np.column_stack([v[dcol].to_numpy() if dcol else np.zeros(len(old)), v[rcol].to_numpy() if rcol else np.zeros(len(old))]).astype(np.int64)
        if weight is None:
            weight = v.sum(axis=1).to_numpy().astype(float)
    return sig, (weight if weight is not None else np.ones(len(old)))


def ward_list(text: str) -> list[int]:
    """"1,3-7" → [1, 3, 4, 5, 6, 7]"""
    out: list[int] = []
    for part in re.split(r"[,&]|\bAND\b", text):
        nums = [int(x) for x in re.findall(r"\d+", part)]
        if len(nums) == 2 and "-" in part and nums[1] >= nums[0] and nums[1] - nums[0] < 200:
            out += list(range(nums[0], nums[1] + 1))
        else:
            out += nums
    return out


def wisconsin_units(prec: pd.DataFrame, old: gpd.GeoDataFrame) -> dict[int, np.ndarray]:
    """Wisconsin reports by "reporting unit" (one or several wards); the shapes are single wards."""
    if not {"CNTY_FIPS", "MCD_NAME", "CTV", "WARDID"} <= set(old.columns):
        return {}
    wards: dict[tuple[str, str, str, int], int] = {}
    for i, (c, m, t, wd) in enumerate(zip(old["CNTY_FIPS"], old["MCD_NAME"], old["CTV"], old["WARDID"])):
        d = re.match(r"\d+", str(wd))
        if d:
            wards[(str(c), key(m), str(t).upper()[:1], int(d.group()))] = i
    out: dict[int, np.ndarray] = {}
    for mk, county, name in zip(prec.index, prec["county"], prec["precinct"]):
        m = re.match(r"^(CITY|TOWN|VILLAGE) OF (.+?),? WARDS? (.+)$", name)
        if not m:
            continue
        hits = [wards.get((county, key(m.group(2)), m.group(1)[0], w)) for w in ward_list(m.group(3))]
        hits = [h for h in hits if h is not None]
        if hits:
            out[mk] = np.array(sorted(set(hits)))
    return out


def match(df: pd.DataFrame, comp: pd.Series, old: gpd.GeoDataFrame, vcounty: pd.Series, vsig: dict[str, np.ndarray], st: str = "") -> tuple[np.ndarray, dict[str, int], bool, dict[int, tuple[np.ndarray, bool]]]:
    """MEDSL precinct (mk) → VEST precinct (oid) or -1; plus mk → (several oids, exact?) for one-to-many cases."""
    prec = df.drop_duplicates("mk").set_index("mk")[["county", "jurisdiction", "precinct"]].sort_index()
    nm = len(prec)
    use_county = prec["county"].isin(set(vcounty)).mean() > 0.8
    mcounty = prec["county"].to_numpy() if use_county else np.array([""] * nm)
    vc = vcounty.to_numpy() if use_county else np.array([""] * len(old))
    # MEDSL fingerprints for the offices VEST also has.
    offices = [o for o in SIG_OFFICES if o in vsig and (df["office"] == o).any()]
    msig = np.zeros((nm, 2 * len(offices)), dtype=np.int64)
    for k, o in enumerate(offices):
        sub = df[(df["office"] == o)]
        c = comp[sub.index]
        for j in (0, 1):
            s = sub[c == j].groupby("mk")["votes"].sum()
            msig[s.index.to_numpy(), 2 * k + j] = s.to_numpy()
    vs = np.column_stack([vsig[o] for o in offices]) if offices else np.zeros((len(old), 0), dtype=np.int64)
    out = np.full(nm, -1, dtype=np.int64)
    taken = np.zeros(len(old), dtype=bool)
    stats = {"fingerprint": 0, "name": 0, "fuzzy": 0, "near": 0, "units": 0, "place": 0}
    multi: dict[int, tuple[np.ndarray, bool]] = {}
    if st == "WI":
        for mk, oids in wisconsin_units(prec, old).items():
            free = oids[~taken[oids]]
            if len(free) == 1 and len(oids) == 1:
                out[mk] = free[0]
                taken[free[0]] = True
            elif len(free) == len(oids):
                multi[mk] = (oids, True)
                taken[oids] = True
            else:
                continue
            stats["units"] += 1

    def rel(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.abs(a - b).sum()) / max(1.0, float(max(a.sum(), b.sum())))

    # 1. exact fingerprint, unique on both sides within the county
    if offices:
        mm: dict[tuple, list[int]] = defaultdict(list)
        vv: dict[tuple, list[int]] = defaultdict(list)
        for i in range(nm):
            if msig[i].sum() >= 10:
                mm[(mcounty[i], *msig[i])].append(i)
        for i in range(len(old)):
            if vs[i].sum() >= 10:
                vv[(vc[i], *vs[i])].append(i)
        for k, ms in mm.items():
            v = vv.get(k)
            if v and len(ms) == 1 and len(v) == 1:
                out[ms[0]] = v[0]
                taken[v[0]] = True
                stats["fingerprint"] += 1

    # 2. names
    text_cols = [c for c in old.columns if c not in ("geometry", "oid") and old[c].dtype == object and not re.match(r"^[GRSPC]\d\d[A-Z]{3}", c.upper())]
    vkeys: dict[str, list[str]] = {c: [key(x) for x in old[c].fillna("")] for c in text_cols}
    if 2 <= len(text_cols) <= 7:
        for a in text_cols:
            for b in text_cols:
                if a != b:
                    vkeys[f"{a}+{b}"] = [x + y for x, y in zip(vkeys[a], vkeys[b])]
    strip0 = lambda s: re.sub(r"^0+", "", s)  # noqa: E731
    pj, pp = [key(x) for x in prec["jurisdiction"]], [key(x) for x in prec["precinct"]]
    mkeys = {"precinct": pp, "jurisdiction+precinct": [a + b for a, b in zip(pj, pp)], "jurisdiction": pj,
             "precinct0": [strip0(x) for x in pp], "segment": [strip0(key(str(x).split("_")[0])) if "_" in str(x) else "" for x in prec["precinct"]], "digits": [strip0(re.sub(r"\D", "", x)) for x in pp]}
    pr = list(prec["precinct"])
    mkeys["dot0"] = [strip0(m.group(1)) if (m := re.search(r"(\d+)\.0\b", x)) else "" for x in pr]  # Florida "PRECINCT 508.0"
    mkeys["last3"] = [strip0(x[-3:]) if re.fullmatch(r"\d{10}", x) else "" for x in pr]  # Colorado 10-digit code: the last three digits are the precinct
    mkeys["lastnum"] = [strip0(m[-1]) if (m := re.findall(r"\d+", x)) else "" for x in pr]  # Washington "SEA 37-1927" = precinct 1927
    nyc = [re.fullmatch(r"(\d+)/(\d+)", x) for x in pr]  # New York City "001/41" = election district 1 of assembly district 41
    if any(nyc):
        mkeys["ad-ed"] = [f"ad{int(m.group(2))}ed{int(m.group(1))}" if m else "" for m in nyc]
    mawp = [re.fullmatch(r"(.*)_WARD(\w+)_PRECINCT(\w+)", x) for x in pr]  # Massachusetts "BOSTON_ward1_precinct15" = "Boston Pct 1-15"
    if any(mawp):
        mkeys["ward-precinct"] = [key(f"{m.group(1)} PCT " + (f"{m.group(2)}-" if m.group(2).lstrip("0") else "") + m.group(3).lstrip("0")) if m else "" for m in mawp]
    edp = [re.search(r"ELECTDIST:\s*(\d+)\|PREC:\s*(\d+)", x) for x in prec["precinct"]]  # Maryland 2016: "…|electdist: 20|prec: 7" = precinct 20-007
    if any(edp):
        mkeys["edprec"] = [f"{int(m.group(1))}{int(m.group(2)):03d}" if m else "" for m in edp]
    for c in list(vkeys):
        if "+" not in c:
            vkeys[c + "~0"] = [strip0(x) for x in vkeys[c]]
            vkeys[c + "~tail"] = [strip0(m.group()) if (m := re.search(r"\d+$", x)) else "" for x in vkeys[c]]

    def pairs_for(vcol: str, mvar: str) -> list[tuple[int, int]]:
        vd: dict[tuple[str, str], list[int]] = defaultdict(list)
        md: dict[tuple[str, str], list[int]] = defaultdict(list)
        for i, k in enumerate(vkeys[vcol]):
            if k and not taken[i]:
                vd[(vc[i], k)].append(i)
        for i, k in enumerate(mkeys[mvar]):
            if k and out[i] < 0:
                md[(mcounty[i], k)].append(i)
        res = []
        for k, ms in md.items():
            v = vd.get(k)
            if v and len(ms) == 1 and len(v) == 1:
                if offices and msig[ms[0]].sum() > 0 and vs[v[0]].sum() > 0 and rel(msig[ms[0]], vs[v[0]]) > 0.6:
                    continue
                res.append((ms[0], v[0]))
        return res

    for _ in range(4):  # most productive pairing first, then again on what is left
        best = max(((pairs_for(vcol, mvar), vcol, mvar) for vcol in vkeys for mvar in mkeys), key=lambda t: len(t[0]), default=([], "", ""))
        if len(best[0]) < max(3, 0.01 * (out < 0).sum()):
            break
        if (best[2] in ("digits", "jurisdiction", "last3", "lastnum") or best[1].endswith("~tail")) and len(best[0]) < 0.3 * (out < 0).sum():
            break  # weak keys are only trusted when they explain a large share
        for m, v in best[0]:
            out[m] = v
            taken[v] = True
        stats["name"] += len(best[0])

    # 2b. fuzzy names: same numbers, overlapping words; mutual best with a clear margin
    name_cols = [c for c in text_cols if old[c].astype(str).str.contains(r"[A-Za-z]{3}").mean() > 0.5] or text_cols
    vtok = {c: [tokens(x) for x in old[c].fillna("")] for c in name_cols}
    if len(name_cols) >= 2:
        vtok["*all"] = [tokens(" ".join(str(old[c].iat[i]) for c in name_cols if old[c].iat[i] is not None)) for i in range(len(old))]
    mtok = {"precinct": [tokens(x) for x in prec["precinct"]], "jp": [tokens(f"{a} {b}") for a, b in zip(prec["jurisdiction"], prec["precinct"])],
            "jurisdiction": [tokens(x) for x in prec["jurisdiction"]]}
    for cty in set(mcounty[out < 0]):
        mi = np.flatnonzero((out < 0) & (mcounty == cty))
        vi = np.flatnonzero(~taken & (vc == cty))
        if not len(mi) or not len(vi):
            continue
        inv: dict[str, set[int]] = defaultdict(set)
        for b, v in enumerate(vi):
            for toks in vtok.values():
                for t in toks[v][0]:
                    inv[t[:4]].add(b)
                inv["#" + "-".join(toks[v][1])].add(b)
        sc: dict[tuple[int, int], float] = {}
        for a, m in enumerate(mi):
            cands: set[int] = set()
            for toks in mtok.values():
                for t in toks[m][0]:
                    cands |= inv.get(t[:4], set())
                cands |= inv.get("#" + "-".join(toks[m][1]), set())
            if len(cands) > 400:
                cands = {b for b in cands if any(mt[m][1] == vt[vi[b]][1] for mt in mtok.values() for vt in vtok.values())}
            for b in cands:
                v = vi[b]
                best = max(similarity(mt[m], vt[v]) for mt in mtok.values() for vt in vtok.values())
                if best >= 0.5:
                    sc[(a, b)] = best
        bestm: dict[int, list[tuple[float, int]]] = defaultdict(list)
        bestv: dict[int, list[tuple[float, int]]] = defaultdict(list)
        for (a, b), x in sc.items():
            bestm[a].append((x, b))
            bestv[b].append((x, a))
        for a, lst in bestm.items():
            lst.sort(reverse=True)
            x, b = lst[0]
            lv = sorted(bestv[b], reverse=True)
            if lv[0][1] != a or (len(lst) > 1 and lst[1][0] > x - 0.1) or (len(lv) > 1 and lv[1][0] > x - 0.1):
                continue
            m, v = mi[a], vi[b]
            if offices and msig[m].sum() > 0 and vs[v].sum() > 0 and rel(msig[m], vs[v]) > 0.6:
                continue
            out[m] = v
            taken[v] = True
            stats["fuzzy"] += 1

    # 3. near fingerprint, mutual nearest within the county
    if offices:
        for cty in set(mcounty[out < 0]):
            mi = np.flatnonzero((out < 0) & (mcounty == cty) & (msig.sum(axis=1) >= 20))
            vi = np.flatnonzero(~taken & (vc == cty) & (vs.sum(axis=1) >= 20))
            if not len(mi) or not len(vi) or len(mi) * len(vi) > 4_000_000:
                continue
            d = np.abs(msig[mi][:, None, :] - vs[vi][None, :, :]).sum(axis=2) / np.maximum(msig[mi].sum(axis=1)[:, None], vs[vi].sum(axis=1)[None, :])
            bm, bv = d.argmin(axis=1), d.argmin(axis=0)
            for a, b in enumerate(bm):
                if bv[b] == a and d[a, b] < 0.05:
                    second = np.partition(d[a], 1)[1] if d.shape[1] > 1 else 1.0
                    if second > 2 * d[a, b] + 0.01:
                        out[mi[a]] = vi[b]
                        taken[vi[b]] = True
                        stats["near"] += 1

    # 4. same place: an unmatched line that names a town the shapes also name stays inside that town
    places: dict[tuple[str, frozenset[str]], list[int]] = defaultdict(list)
    for c in name_cols:
        for i, t in enumerate(vtok[c]):
            if t[0]:
                places[(vc[i], t[0])].append(i)
    by_cty: dict[str, list[tuple[frozenset[str], np.ndarray]]] = defaultdict(list)
    size = pd.Series(vc).value_counts().to_dict()
    for (cty, words), oids in places.items():
        u = np.array(sorted(set(oids)))
        if 2 <= len(u) < 0.6 * size.get(cty, 1) or (len(u) == 1 and size.get(cty, 1) > 3):
            by_cty[cty].append((words, u))
    for m in np.flatnonzero(out < 0):
        if m in multi:
            continue
        wj, wp = mtok["jurisdiction"][m][0], mtok["precinct"][m][0]
        best, tie = None, False
        for words, u in by_cty.get(mcounty[m], []):
            if words == wj or words <= wp or (wj and words <= (wj | wp) and words & wj):
                if best is None or len(words) > len(best[0]):
                    best, tie = (words, u), False
                elif len(words) == len(best[0]) and not np.array_equal(u, best[1]):
                    tie = True
        if best is not None and not tie:
            multi[int(m)] = (best[1], False)
            stats["place"] += 1
    return out, stats, use_county, multi


def anchor_frame(st: str) -> tuple[pd.DataFrame, pd.Series, np.ndarray, int, int] | None:
    """The 2024 precincts as the target of a name match: (names, county, 2024 vote as weight, first pid, n)."""
    meta_path = PRE / "anchors" / f"{st}.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text())["precincts"]
    pids = sorted(int(p) for p in meta)
    old = pd.DataFrame({"NAME": [str(meta[str(p)].get("name") or "") for p in pids], "GEOID": [str(meta[str(p)].get("geoid") or "") for p in pids]})
    old["oid"] = np.arange(len(old))
    county = pd.Series([str(meta[str(p)].get("county") or "") for p in pids])
    # The id is "County-:-Name"; where the name itself is generic (Maine's "Municipal Level") the tail holds the town.
    old["PLACE"] = [g.split("-:-", 1)[1] if "-:-" in g else "" for g in old["GEOID"]]
    ward = [re.fullmatch(r"(.+) - ([CTV]) (\d{4}[A-Z]?)", x) for x in old["NAME"]]  # Wisconsin "ADAMS - C 0001"
    if sum(1 for m in ward if m) > 0.8 * len(old):
        old["CNTY_FIPS"] = county.values
        old["MCD_NAME"] = [m.group(1) if m else "" for m in ward]
        old["CTV"] = [m.group(2) if m else "" for m in ward]
        old["WARDID"] = [m.group(3) if m else "" for m in ward]
    # The state's own precinct code, where the 2024 file carries one (Minnesota's Prec_ID): official exports use it.
    try:
        layer = B.rdh_layer(st)
        fields = list(pyogrio.read_info(layer)["fields"]) if layer else []
        codes = [c for c in fields if re.fullmatch(r"(?i)prec_?id|pct_?code|precinct_?id|pctnum|vtd_?id", c)]
        if codes and "UNIQUE_ID" in fields:
            attr = pyogrio.read_dataframe(layer, read_geometry=False, columns=["UNIQUE_ID"] + codes).drop_duplicates("UNIQUE_ID").set_index("UNIQUE_ID")
            for c in codes:
                old[f"CODE_{c.upper()}"] = [str(attr[c].get(g, "")) for g in old["GEOID"]]
    except Exception:  # an extra matching key only
        pass
    weight = np.ones(len(pids))
    res = OUT / st / "2024.json"
    if res.exists():
        offs = json.loads(res.read_text())["offices"]
        top = offs.get("PRES") or next(iter(offs.values()), None)
        if top:
            weight = np.array([sum(r) for r in top], dtype=float)
    return old, county, weight, pids[0], len(pids)



# ── where each source precinct sat on that year's legislative map ──────────────────────────────────
# A seat's votes that match no precinct by name are spread over precincts of the county. Without a map
# that spread could cross seat lines: in a staggered chamber the county's "free" precincts are the ones
# whose seat was NOT up (Missouri 2018: Senate 8's votes landed in Kansas City's Senate 7 and 9). So the
# spread is kept inside the seat as drawn that year (public/state-leg-districts-historical, or the current
# map for a year held on it), wherever the map's district codes match the source's.
_HIST_MAPS: dict | None = None


def _hist_maps() -> dict:
    global _HIST_MAPS
    if _HIST_MAPS is None:
        txt = (ROOT / "data" / "stateLegHistoricalMaps.ts").read_text()
        body = txt[txt.index("=", txt.index("stateLegHistoricalMaps")) + 1:]
        _HIST_MAPS = json.loads(body[body.index("{"): body.rindex("}") + 1])
    return _HIST_MAPS


def seat_key(code: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(code).lower()).lstrip("0") or "0"


_ANCHOR_PTS: dict[str, gpd.GeoSeries] = {}


def geo_districts(st: str, year: int, office: str, old, by_name: bool) -> np.ndarray | None:
    """Each source precinct's district key on that year's map (legislature or U.S. House), or None (no usable map)."""
    if office == "USH":
        # Congressional maps by election year: 115th (2016), 116th (2018; 2020 as revised, "pre2022"), 118th, 119th.
        name = {2016: "2016", 2018: "2018", 2020: "pre2022", 2022: "2022", 2024: "2024", 2026: "2026"}.get(year)
        path = ROOT / "public" / f"congressional-districts-{name}.json" if name else None
        if not path or not path.exists():
            return None
        try:
            dist = gpd.read_file(path)
        except Exception:
            return None
        dist = dist[dist["STATEFP"] == V.B_FIPS[st]].copy()
        if len(dist) <= 1:  # at large: nothing to keep apart
            return None
        cd = next(c for c in dist.columns if re.fullmatch(r"CD\d+FP", c))
        dist = dist.set_crs(4326, allow_override=True).to_crs(5070)
        dist["key"] = [seat_key(x) for x in dist[cd]]
    elif office in ("SLDU", "SLDL"):
        chamber = "senate" if office == "SLDU" else "house"
        vintage = _hist_maps().get(st, {}).get(chamber, {}).get(str(year))
        path = ROOT / "public" / ("state-leg-districts-historical" if vintage else "state-leg-districts") / chamber / (f"{st}-{vintage}.json" if vintage else f"{st}.json")
        if not path.exists():
            return None
        try:
            dist = gpd.read_file(path).set_crs(4326, allow_override=True).to_crs(5070)
        except Exception:
            return None
        def key_of(row) -> str:
            tail = str(row.get("NAMELSAD") or "").split()[-1:] or [""]
            return seat_key(tail[0] if re.fullmatch(r"\d+[A-Za-z]?", tail[0]) else row.get("DISTRICT", ""))
        dist["key"] = [key_of(r) for _, r in dist.iterrows()]
    else:
        return None
    if dist["key"].duplicated().any():  # county-numbered districts (New Hampshire): codes do not identify a seat
        return None
    if by_name:
        if st not in _ANCHOR_PTS:
            a = gpd.read_file(PRE / "anchor" / f"{st}.geojsonl", engine="pyogrio")[["pid", "geometry"]].sort_values("pid")
            _ANCHOR_PTS[st] = a.set_crs(4326, allow_override=True).to_crs(5070).geometry.make_valid().representative_point().reset_index(drop=True)
        pts = _ANCHOR_PTS[st]
    else:
        pts = old.geometry.make_valid().representative_point().reset_index(drop=True)
    if len(pts) != len(old):
        return None
    g = gpd.GeoDataFrame(geometry=pts.values, crs=5070)
    j = gpd.sjoin_nearest(g, dist[["key", "geometry"]], how="left")
    j = j[~j.index.duplicated()]
    return j["key"].reindex(range(len(old))).fillna("").to_numpy()


def party_weights_2024(st: str, n: int) -> np.ndarray | None:
    """(3, n) D / R / other presidential votes per 2024 precinct: where each side votes, for spreading."""
    res = OUT / st / "2024.json"
    if not res.exists():
        return None
    offs = json.loads(res.read_text())["offices"]
    top = offs.get("PRES") or next(iter(offs.values()), None)
    if not top or len(top) != n:
        return None
    return np.array(top, dtype=float).T

def build_state(st: str, year: int, truth: dict) -> str:
    have = (RAW / "medsl" / str(year) / "by_state" / (f"{st}.{VARIANT}.parquet" if VARIANT not in ("", "mix") else f"{st}.parquet")).exists()
    if st == "CA":
        return "CA: built by build_results_swdb.py (results with that election's own precinct shapes)"
    # No shapes for that year (2022 on), or none for this state (Kentucky 2018, New Jersey 2019): by name onto the 2024 precincts.
    if year in NO_SHAPES or V.vest_layer(st, year) is None:
        af = anchor_frame(st) if have else None
        if af is None:
            return f"{st}: missing inputs"
        old, vcounty, vweight, first, n = af
        df = load_medsl(st, year, statewide={o: truth.get(year, {}).get(o, {}).get(st) for o in ("USS", "GOV")})
        rows = cols_idx = np.arange(n)
        w, split = np.ones(n), np.zeros(n, dtype=bool)
        vsig: dict[str, np.ndarray] = {}
        wanted = ["USS", "USSS", "GOV"] + DISTRICT_OFFICES
        by_name = True
        pweight = party_weights_2024(st, n)
    else:
        old = V.load_old(st, year) if have else None
        df = load_medsl(st, year, vest_tags(old, year)) if old is not None else None
        if old is None or df is None:
            return f"{st}: missing inputs"
        xw = V.crosswalk(st, old)
        if xw is None:
            return f"{st}: no blocks"
        rows, cols_idx, w, split, first, n = xw
        vcounty = county_of(old, st)
        vsig, vweight = vest_signature(old, year)
        wanted = DISTRICT_OFFICES
        by_name = False
        top = next((vsig[o] for o in ("PRES", "USS", "GOV", "USS_S") if o in vsig), None)
        pweight = None if top is None else np.vstack([top[:, 0], top[:, 1], np.clip(vweight - top[:, 0] - top[:, 1], 0, None)]).astype(float)
    if ONLY:
        wanted = [o for o in wanted if o in ONLY]
    src_label = f"openelections-{year}" if VARIANT == "oe" else f"medsl-{year}+{SECOND.get((st, year), f'openelections-{year}')}" if VARIANT == "mix" else SRC.get((st, year), f"medsl-{year}")
    nold = len(old)
    comp = slot_table(df)
    mk2oid, stats, use_county, multi = match(df, comp, old, vcounty, vsig, st)
    df["oid"] = mk2oid[df["mk"].to_numpy()]
    df["comp"] = comp
    vc = vcounty.to_numpy() if use_county else np.array([""] * nold)
    if not use_county:
        df["county"] = ""
    matched_oids = np.zeros(nold, dtype=bool)
    matched_oids[mk2oid[mk2oid >= 0]] = True
    for oids, _ in multi.values():
        matched_oids[oids] = True
    by_county: dict[str, np.ndarray] = {c: np.flatnonzero(vc == c) for c in set(vc)}
    jm = df[df["oid"] >= 0].drop_duplicates("mk")
    juris_oids: dict[tuple[str, str], np.ndarray] = {k: g["oid"].to_numpy() for k, g in jm.groupby(["county", "jurisdiction"]) if len(g) < 0.5 * max(1, len(by_county.get(k[0], [])))}
    df["pseudo"] = df["precinct"].map(lambda p, memo={}: memo.setdefault(p, bool(PSEUDO.search(fold(p)))))

    offices: dict[str, list[list[int]]] = {}
    districts: dict[str, list[str]] = {}
    # Per office, the parts of precincts that voted in more than one district. (Named apart from `split`, the
    # crosswalk's is-a-real-split flags: sharing the name zeroed every "est" share from 2026-11-17 to 11-26.)
    split_parts: dict[str, list[list]] = {}
    est: dict[str, list[int]] = {}
    sums: dict[str, dict] = {}
    notes = []
    dnotes: dict[tuple[str, str], str] = {}
    explained_here: dict[tuple[str, str], str] = dict(EXPLAINED)
    dropped = []
    for office in wanted:
        o = df[(df["office"] == ("USS_S" if office == "USSS" else office)) & (df["votes"] != 0)]
        # A district office's row with no district in the source (Arizona 2016: about 60% of legislative votes;
        # Washington 2022: a third of House votes) takes the district its matched precinct sits in on that year's
        # map (geo_districts), when the map's codes name the office's districts.
        if office in DISTRICT_OFFICES and not o.empty and (o["district"] == "").any():
            geo_lab = geo_districts(st, year, office, old, by_name)
            if geo_lab is not None:
                known = {seat_key(d) for d in o["district"] if d}
                blank = (o["district"] == "") & (o["oid"] >= 0)
                fill = pd.Series([geo_lab[i] if i >= 0 else "" for i in o.loc[blank, "oid"]], index=o.index[blank])
                fill = fill[fill.isin(known)]
                if len(fill):
                    o = o.copy()
                    o.loc[fill.index, "district"] = fill
                    print(f"  {st} {year} {office}: {len(fill)} rows with no district placed by their precinct's district on that year's map ({int(o.loc[fill.index, 'votes'].sum()):,} votes)")
        if o.empty or st not in truth.get(year, {}).get(office, {}):
            dropped.append(office)
            continue  # nothing reported, or no regular contest that year (odd-year legislatures, DC's delegate)
        dnotes[(st, office)] = district_note(st, year, office, o) if office in DISTRICT_OFFICES else ""
        if (st, year, office) in SOURCE_OFF:
            dnotes[(st, office)] = (dnotes[(st, office)] + " " if dnotes[(st, office)] else "") + SOURCE_OFF[(st, year, office)]
        if (st, year, office) in SITE_OFF:
            dnotes[(st, office)] = (dnotes[(st, office)] + " " if dnotes[(st, office)] else "") + SITE_OFF[(st, year, office)]
        if office in DISTRICT_OFFICES and (st, year, office) in KNOWN:
            why = known_residual(st, year, office, o, None)
            if why:
                explained_here[(st, office)] = why
            else:
                dnotes[(st, office)] = (dnotes[(st, office)] + " " if dnotes[(st, office)] else "") + " ".join(dict.fromkeys(KNOWN[(st, year, office)].values()))
        if office not in DISTRICT_OFFICES and use_county:  # a statewide contest should have votes in every county
            all_c, got_c = set(vc), set(o["county"]) - {""}
            if len(got_c) < len(all_c):
                dnotes[(st, office)] = f"The source has votes for {len(got_c)} of {len(all_c)} counties."
        arr = np.zeros((3, nold))
        spread_tot = np.zeros(nold)
        dvotes: dict[str, np.ndarray] = {}
        dv3: dict[str, np.ndarray] = {}  # district → (side, precinct) votes: what a split precinct gave each district
        m = o[o["oid"] >= 0]
        np.add.at(arr, (m["comp"].to_numpy(), m["oid"].to_numpy()), m["votes"].to_numpy())
        for district, g in m.groupby("district"):
            a = np.zeros(nold)
            np.add.at(a, g["oid"].to_numpy(), g["votes"].to_numpy())
            dvotes[district] = a
            a3 = np.zeros((3, nold))
            np.add.at(a3, (g["comp"].to_numpy(), g["oid"].to_numpy()), g["votes"].to_numpy())
            dv3[district] = a3
        known_mask = {d: a > 0 for d, a in dvotes.items()}  # where each district is known to vote, before any spreading

        def spread(target: np.ndarray, g: pd.DataFrame, district: str) -> None:
            # Each side by where that side votes: a precinct's share of the Democratic votes follows its
            # Democratic vote in a nearby top-of-ticket race (pweight), not its turnout, so a county-wide
            # spread no longer paints a D+70 precinct with the county's R+10 (Hempstead, New York 2022).
            tw = vweight[target] + 1e-9
            tw = tw / tw.sum()
            byc = g.groupby("comp")["votes"].sum()
            for c, v in byc.items():
                wt = tw
                if pweight is not None and int(c) < 3:
                    pw = pweight[int(c)][target]
                    if pw.sum() > 0:
                        wt = (pw + 1e-9) / (pw + 1e-9).sum()
                arr[c, target] += v * wt
                dv3.setdefault(district, np.zeros((3, nold)))[c, target] += v * wt
                dvotes.setdefault(district, np.zeros(nold))[target] += v * wt
                if not exact_unit[0]:
                    spread_tot[target] += v * wt

        u = o[o["oid"] < 0]
        has_multi = u["mk"].isin(multi.keys())
        geo = geo_districts(st, year, office, old, by_name)
        geo_keys = set(geo) if geo is not None else set()

        def in_seat(target: np.ndarray, district: str) -> np.ndarray:
            """The targets inside the seat as drawn that year (all of them where the map cannot say)."""
            k = seat_key(district)
            if geo is None or k not in geo_keys or not len(target):
                return target
            inside = target[geo[target] == k]
            return inside if len(inside) else target
        exact_votes = local_votes = 0.0
        exact_unit = [False]  # set while a Wisconsin reporting unit is being split over its own wards
        # One line, several shapes: a Wisconsin reporting unit (exact), or a line that names a town (local).
        for (mk, district), g in u[has_multi].groupby(["mk", "district"]):
            target, exact = multi[mk]
            if not exact and district in known_mask:
                inside = target[known_mask[district][target]]
                if len(inside):
                    target = inside
            if not exact:
                target = in_seat(target, district)
            exact_unit[0] = bool(exact)
            spread(target, g, district)
            exact_unit[0] = False
            if exact:
                exact_votes += float(g["votes"].sum())
            else:
                local_votes += float(g["votes"].sum())
        # Everything else: inside the county (or the file's jurisdiction) over the district's known precincts.
        for (county, juris, district, pseudo), g in u[~has_multi].groupby(["county", "jurisdiction", "district", "pseudo"]):
            pool = by_county.get(county, np.arange(nold))
            known = pool[known_mask[district][pool]] if district in known_mask else pool[:0]
            free = pool[~matched_oids[pool]]
            local = juris_oids.get((county, juris))
            if pseudo and local is not None and len(known):
                inside = known[np.isin(known, local)]
                if len(inside):
                    known = inside
            if geo is not None and seat_key(district) in geo_keys:
                # Keep the spread inside the seat as drawn that year: the seat's own precincts in the county,
                # preferring those no line matched; else its known ones; else the seat statewide.
                seat_pool = pool[geo[pool] == seat_key(district)]
                seat_free = seat_pool[~matched_oids[seat_pool]]
                seat_known = seat_pool[known_mask[district][seat_pool]] if district in known_mask else seat_pool[:0]
                target = seat_free if (not pseudo and len(seat_free)) else seat_known if len(seat_known) else seat_pool
                if not len(target):
                    everywhere = np.flatnonzero(geo == seat_key(district))
                    target = everywhere if len(everywhere) else pool
            else:
                target = (free if (not pseudo and len(free)) else known) if (len(known) or len(free)) else pool
                if not len(target):
                    target = known if len(known) else (pool if len(pool) else np.arange(nold))
            spread(target, g, district)
        parts = []
        for c in range(3):
            acc = np.zeros(n)
            np.add.at(acc, cols_idx, arr[c][rows] * w)
            parts.append(V.largest_remainder(acc, int(round(arr[c].sum()))))
        tot_old = arr.sum(axis=0)
        allv, splitv = np.zeros(n), np.zeros(n)
        np.add.at(allv, cols_idx, tot_old[rows] * w)
        np.add.at(splitv, cols_idx, np.where(split, tot_old[rows] * w, 0))
        if not len(vsig) and len(rows) == n and bool((w == 1).all()):  # no refit here: the estimated part is what was spread rather than matched
            splitv = spread_tot.copy()
        # District label of each 2024 precinct: the district that contributes most of its votes.
        names = sorted(dvotes)
        if names and names != [""]:
            best, label = np.zeros(n), np.full(n, -1)
            for k, dname in enumerate(names):
                acc = np.zeros(n)
                np.add.at(acc, cols_idx, dvotes[dname][rows] * w)
                better = acc > best
                best[better], label[better] = acc[better], k
            width = 2 if office in ("USH", "SLDU") else 3
            fmt = [d.zfill(width) if d.isdigit() else d for d in names]
            districts[office] = [fmt[k] if k >= 0 else "" for k in label]
            # A precinct that voted in more than one district's race: the row above is the sum and the
            # label names the larger part, so each district's own share is kept as well,
            # [precinct index, district, D, R, other]. The district pages' maps read these.
            if office in DISTRICT_OFFICES and len(names) > 1:
                per = []
                for dname in names:
                    a3 = dv3.get(dname)
                    sides = np.zeros((3, n), dtype=np.int64)
                    if a3 is not None:
                        for c in range(3):
                            acc = np.zeros(n)
                            np.add.at(acc, cols_idx, a3[c][rows] * w)
                            sides[c] = V.largest_remainder(acc, int(round(a3[c].sum())))
                    per.append(sides)
                tot = np.stack([p_.sum(axis=0) for p_ in per])  # district × precinct
                multi_d = np.flatnonzero((tot > 0).sum(axis=0) > 1)
                entries = [[int(j), fmt[k], int(per[k][0, j]), int(per[k][1, j]), int(per[k][2, j])] for j in multi_d for k in range(len(names)) if tot[k, j] > 0]
                if entries:
                    split_parts[office] = entries
        offices[office] = [[int(a), int(b), int(c)] for a, b, c in zip(*parts)]
        est[office] = [int(round(100 * s / a)) if a > 0 else 0 for s, a in zip(splitv, allv)]
        total = float(o["votes"].sum())
        sums[office] = {"d": int(parts[0].sum()), "r": int(parts[1].sum()), "o": int(parts[2].sum()), "precincts_with_votes": int(((parts[0] + parts[1] + parts[2]) > 0).sum()),
                        "src": src_label + ("" if by_name else f"+vest-{year}"), "basis": "slot" if office in SLOT else "party",
                        "matched": round((float(m["votes"].sum()) + exact_votes) / total, 4) if total else 0.0, "local": round(local_votes / total, 4) if total else 0.0, "est": round(float(splitv.sum() / allv.sum()), 4) if allv.sum() else 0.0}
        notes.append(f"{office} {sums[office]['matched']:.0%}+{sums[office]['local']:.0%}")

    (OUT / st).mkdir(parents=True, exist_ok=True)
    path = OUT / st / f"{year}.json"
    doc = json.loads(path.read_text()) if path.exists() else {"year": year, "st": st, "n": n, "first_pid": first, "offices": {}, "districts": {}, "basis": {}, "est": {}, "src": []}
    # An office this builder no longer produces must not linger from an earlier run (it owns these three).
    stale = [o for o in dropped if o in doc["offices"]]
    for o in stale:
        for part in ("offices", "districts", "basis", "est", "split"):
            doc.get(part, {}).pop(o, None)
    clear_cells(st, year, [o for o in dropped if st not in truth.get(year, {}).get(o, {})], n)
    if not offices:
        if stale:
            path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
        return f"{st}: no district contests in MEDSL {year}"
    doc["offices"].update(offices)
    doc.setdefault("districts", {}).update(districts)
    doc.setdefault("split", {})
    for o in offices:  # this run owns each office it built: no split entries from an earlier run linger
        doc["split"].pop(o, None)
    doc["split"].update(split_parts)
    if not doc["split"]:
        doc.pop("split")
    doc.setdefault("est", {}).update(est)
    doc.setdefault("basis", {}).update({o: ("slot" if o in SLOT else "party") for o in offices})
    doc["src"] = sorted(set(doc.get("src", [])) | ({src_label} if by_name else {src_label, f"vest-{year}"}))
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    if year == 2026:  # still being certified: say so wherever the precinct rows and the statewide figure disagree
        for o in sums:
            dnotes[(st, o)] = (dnotes.get((st, o)) or "") + (" " if dnotes.get((st, o)) else "") + "2026 counts are not final: the precinct export and the statewide figure were read at different stages of the count."
    line = update_cells(st, year, n, sums, truth, explained=explained_here, suspect={k: v for k, v in dnotes.items() if v})
    nm = len(mk2oid)
    return f"{st} mk {nm:6d} old {nold:5d}  fp {stats['fingerprint']} name {stats['name']} fuzzy {stats['fuzzy']} near {stats['near']} units {stats['units']} place {stats['place']} un {int((mk2oid < 0).sum()) - sum(1 for v in multi.values() if v[1])}{'' if use_county else ' (no county)'}  {line}   [{', '.join(notes)}]"


def main() -> None:
    global VARIANT, ONLY
    args = sys.argv[1:]
    for flag in ("--variant", "--only"):
        if flag in args:
            i = args.index(flag)
            value = args[i + 1]
            del args[i:i + 2]
            if flag == "--variant":
                VARIANT = value
            else:
                ONLY = set(value.split(","))
    year = int(args[0])
    states = [s.upper() for s in args[1:]] or B.STATES
    truth = B.load_truth()
    for st in states:
        try:
            print(build_state(st, year, truth), flush=True)
        except Exception as e:  # keep going; one state's quirk should not stop the run
            import traceback
            print(f"{st}: FAILED {type(e).__name__}: {str(e)[:300]} @ {traceback.extract_tb(e.__traceback__)[-1].lineno}", flush=True)


if __name__ == "__main__":
    main()
