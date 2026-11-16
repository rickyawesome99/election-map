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
SLOT = {"PRES", "USS", "GOV", "USH"}
# Command-line switches: --variant oe reads {ST}.oe.parquet (OpenElections, for contests MEDSL lacks); --only SLDU,SLDL limits the offices written.
VARIANT = ""
ONLY: set[str] = set()
# Where the per-state input was not written by split_medsl.py: what the rows really are.
SRC = {**{(s_, 2026): "official-2026" for s_ in ("AZ", "GA", "HI", "ID", "MN", "NC", "WA")}, ("MS", 2019): "openelections-2019", ("MS", 2023): "openelections-2023", ("KY", 2023): "openelections-2023", ("NJ", 2017): "openelections-2017-municipal",
       ("NJ", 2019): "nj-doe-2019-municipal", ("NJ", 2021): "nj-doe-2021-municipal", ("NJ", 2023): "nj-doe-2023-municipal", ("NJ", 2025): "nj-doe-2025-municipal",
       ("VA", 2021): "va-elections-2021", ("VA", 2023): "va-elections-2023", ("VA", 2025): "va-elections-2025", ("LA", 2019): "la-sos-2019", ("LA", 2023): "la-sos-2023"}
# The second input of a --variant mix build, where it is not OpenElections.
SECOND = {("NM", 2020): "nm-sos-2020"}
# Differences from the site's totals that have a known cause (shown on /audit/precincts).
EXPLAINED: dict[tuple[str, str], str] = {
    ("AK", "USH"): "Ranked choice: precincts report first choices, the site holds the final round (2022 on).",
    ("ID", "USS"): "No Democrat ran in 2026: the leading independent (Achilles) takes the Democratic side here, as the site does for such races elsewhere; the 2026 results file counts by party and shows 0.",
    ("GA", "USS"): "The site holds the December runoff that decided the seat; precinct returns here are the November general.",
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


def line_letter(party: str) -> str:
    """One ballot line's party → D, R, I (independent / none listed), M (minor) or ? (blank)."""
    p = party.strip()
    if not p:
        return "?"
    parts = [x.strip() for x in re.split(r"[,/]", p)]
    is_d = [x.startswith("DEM") or x in ("DPN", "DFL", "DNL") for x in parts]
    is_r = [x.startswith("REP") or x in ("RPN", "GOP") for x in parts]
    if any(is_d) and any(is_r):
        return "B"  # cross-filed on both major lines (Pennsylvania, New York): settled per candidate
    for x in parts:  # the first major party named ("PROGRESSIVE/DEMOCRATIC" is a Democrat)
        if x.startswith("DEM") or x in ("DPN", "DFL", "DNL"):
            return "D"
        if x.startswith("REP") or x in ("RPN", "GOP"):
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
    ("AZ", 2018, "USH"): {"7": "No Republican ran in District 7: the Green candidate (18,706) takes the second side here, the site shows the Republican write-in."},
    ("NY", 2018, "SLDU"): {"17": "Felder held the Democratic, Republican and Conservative lines in District 17: the site lists him as other, here his votes sit on the Democratic side."},
    ("WY", 2016, "SLDL"): {"4": "District 4: the source lists Michaels (1,185) as a Democrat, the site as other."},
    ("OR", 2016, "SLDL"): {k: "Districts 34, 35 and 47: the Republican nominee also held the Independent Party line and the site lists them as other. Site figure to correct." for k in ("34", "35", "47")},
    ("AZ", 2018, "SLDL"): {"18": "District 18: the site's results leave out Republican Jill Norgaard (44,269). Site figure to correct."},
    ("AR", 2016, "SLDL"): {"99": "District 99: the site holds no vote count for Fortner (R, 9,487). Site figure to correct.", "9": "District 9: unopposed Democrat; the source counts 15,327, the site 6,519."},
    ("MT", 2020, "SLDL"): {k: "Districts 3, 19 and 84 were unopposed and the site holds a placeholder of 10,000 votes for each. Site figure to correct." for k in ("3", "19", "84")},
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


def load_medsl(st: str, year: int, tags: dict[str, dict[str, str]] | None = None, statewide: dict[str, dict] | None = None) -> pd.DataFrame | None:
    """--variant mix: two inputs for one state-year (MEDSL and OpenElections). Statewide offices come from MEDSL.
    Each House or legislative district comes whole from one of the two: the one whose party totals sit nearer
    the site's result for that district (MEDSL when level, or when the site holds no result)."""
    global VARIANT
    if VARIANT != "mix":
        return load_one(st, year, tags, statewide)
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
    # MEDSL rows with no district number are the votes of districts it could not place: once the other source
    # supplies districts for that office, they would be counted twice.
    blank = a["office"].isin({o for o, _ in pick_b}) & a["office"].isin(DISTRICT_OFFICES) & (a["district"].map(district_key) == "")
    ka = ka | blank
    b = b[kb].copy()
    b["jurisdiction"] = b["jurisdiction"].astype(str)
    df = pd.concat([a[~ka], b], ignore_index=True)
    df["mk"] = df.groupby(["county", "jurisdiction", "precinct"], sort=False).ngroup()
    print(f"  {st} {year} mix: {len(pick_b)} districts from OpenElections ({', '.join(sorted(o + ' ' + k for o, k in pick_b)[:12])}{'…' if len(pick_b) > 12 else ''})")
    return df


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
    for (office, district, cand), g in lines.groupby(ck):
        by = dict(zip(g["line"], g["votes"]))
        major = max((l for l in ("D", "R") if l in by), key=lambda l: by[l], default=None)
        sn = surname(cand)
        exact = site.get((office, district, person_key(cand))) or (site.get((office, district, sn)) if len(firsts[(office, district, sn)]) == 1 else None)
        looked = exact or site.get((office, "*", sn)) or (tags or {}).get(office.replace("_S", ""), {}).get(sn[:3])
        if exact in ("D", "R") and office in ("SLDU", "SLDL"):
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
    person = pd.Series([f"{person_key(c)}~{l}" if l != "W" else c for c, l in zip(s["candidate"], s["letter"])], index=s.index)
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
        wanted = ["USS", "GOV"] + DISTRICT_OFFICES
        by_name = True
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
    est: dict[str, list[int]] = {}
    sums: dict[str, dict] = {}
    notes = []
    dnotes: dict[tuple[str, str], str] = {}
    explained_here: dict[tuple[str, str], str] = dict(EXPLAINED)
    dropped = []
    for office in wanted:
        o = df[(df["office"] == office) & (df["votes"] != 0)]
        if o.empty or st not in truth.get(year, {}).get(office, {}):
            dropped.append(office)
            continue  # nothing reported, or no regular contest that year (odd-year legislatures, DC's delegate)
        dnotes[(st, office)] = district_note(st, year, office, o) if office in DISTRICT_OFFICES else ""
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
        m = o[o["oid"] >= 0]
        np.add.at(arr, (m["comp"].to_numpy(), m["oid"].to_numpy()), m["votes"].to_numpy())
        for district, g in m.groupby("district"):
            a = np.zeros(nold)
            np.add.at(a, g["oid"].to_numpy(), g["votes"].to_numpy())
            dvotes[district] = a
        known_mask = {d: a > 0 for d, a in dvotes.items()}  # where each district is known to vote, before any spreading

        def spread(target: np.ndarray, g: pd.DataFrame, district: str) -> None:
            wt = vweight[target] + 1e-9
            wt = wt / wt.sum()
            byc = g.groupby("comp")["votes"].sum()
            for c, v in byc.items():
                arr[c, target] += v * wt
            dvotes.setdefault(district, np.zeros(nold))[target] += float(byc.sum()) * wt
            if not exact_unit[0]:
                spread_tot[target] += float(byc.sum()) * wt

        u = o[o["oid"] < 0]
        has_multi = u["mk"].isin(multi.keys())
        exact_votes = local_votes = 0.0
        exact_unit = [False]  # set while a Wisconsin reporting unit is being split over its own wards
        # One line, several shapes: a Wisconsin reporting unit (exact), or a line that names a town (local).
        for (mk, district), g in u[has_multi].groupby(["mk", "district"]):
            target, exact = multi[mk]
            if not exact and district in known_mask:
                inside = target[known_mask[district][target]]
                if len(inside):
                    target = inside
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
        for part in ("offices", "districts", "basis", "est"):
            doc.get(part, {}).pop(o, None)
    clear_cells(st, year, [o for o in dropped if st not in truth.get(year, {}).get(o, {})], n)
    if not offices:
        if stale:
            path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
        return f"{st}: no district contests in MEDSL {year}"
    doc["offices"].update(offices)
    doc.setdefault("districts", {}).update(districts)
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
