#!/usr/bin/env python3
"""2024 precinct results from the vote columns already inside the RDH 2024 files, plus the coverage manifest.

For every state with an anchor layer this reads the attributes of the same RDH layer the anchor was
built from, sums the candidate columns of each office into D / R / other per precinct, and writes

  public/precincts/results/{ST}/2024.json   positional arrays in pid order:
        { "year": 2024, "n": N, "offices": { "PRES": [[d, r, o], …], "USH": …, … },
          "districts": { "USH": ["03", …], "SLDU": …, "SLDL": … } }     (district carrying the precinct's votes)
  data/precincts/coverage.json              the grid the /audit/precincts page and, later, the public
                                            precinct page read: one status per state × year × office.

Statuses: "na" (no such contest), "missing" (contest held, nothing loaded), "loaded" (precinct votes in,
statewide sum differs from the site's own county/district totals by more than the tolerance, or no
truth to compare), "reconciled" (statewide D and R sums within RECONCILE_TOL of the site's totals).

Run again after any anchor rebuild: results are positional by pid.

  python3 scripts/precincts/build_results_2024.py            # all states
  python3 scripts/precincts/build_results_2024.py AZ TX      # selected (coverage file is merged)
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd
import pyogrio

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW_RDH = PRE / "raw" / "rdh"
ANCHORS = PRE / "anchors"
OUT = ROOT / "public" / "precincts" / "results"
COVERAGE = ROOT / "data" / "precincts" / "coverage.json"

YEAR = 2024
OFFICES = ["PRES", "USS", "USSS", "GOV", "USH", "SLDU", "SLDL"]  # USSS = a U.S. Senate special held beside the regular race
YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
# Statewide D and R precinct sums must each sit within this share of the site's two-party total.
RECONCILE_TOL = 0.005

STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
    "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
    "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]

# RDH prefixes → office. District contests drop the year (10-character DBF field limit).
PREFIX = [("G24PRE", "PRES"), ("G24USS", "USS"), ("S24USS", "USSS"), ("G24GOV", "GOV"), ("GCON", "USH"), ("GSU", "SLDU"), ("GSL", "SLDL")]
# Wisconsin (LTSB layout): {office}{party}24.
WI_PREFIX = {"PRE": "PRES", "USS": "USS", "USH": "USH", "WSS": "SLDU", "WSA": "SLDL"}
# New York (Rosenblatt layout): district offices are party totals, G24CON{D,R,O}.
NY_AGG = {"G24CON": "USH", "G24SU": "SLDU", "G24SL": "SLDL"}


# Party letters that are wrong in the source file (checked against certified results).
PARTY_FIX = {
    # RDH's WV file codes every U.S. House candidate "R": Reed (D) and Holden (I) in WV-01, Wendelin (D) in WV-02.
    "WV": {"GCON01RREE": "D", "GCON01RHOL": "I", "GCON02RWEN": "D"},
    # NM House 9: Patricia Lundstrom is a Democrat (unopposed); the file codes her "R".
    "NM": {"GSL09RLUN": "D"},
    # Washington House: Justin Greywolf (11, Pos. 2) stated a Libertarian preference and Kristina Mitchell (21, Pos. 2)
    # "Conservative"; the file codes both "R".
    "WA": {"GSL112RGRE": "O", "GSL212RMIT": "O"},
}
# Single-winner offices are stored the way the rest of the site stores them: a Democratic-slot and a
# Republican-slot candidate per contest (see slot_columns). Legislative offices are party sums, because
# multi-member districts and fusion lines make "the" Democrat ill-defined.
SLOT_OFFICES = {"PRES", "USS", "USSS", "GOV", "USH"}
MEDSL_OFFICE = {"US PRESIDENT": "PRES", "US SENATE": "USS", "GOVERNOR": "GOV", "US HOUSE": "USH", "STATE SENATE": "SLDU", "STATE HOUSE": "SLDL"}
# States/offices the RDH file does not carry, filled from the MEDSL 2024 state file by precinct-name match.
MEDSL_FILL = {"KS": ["USH", "SLDU", "SLDL"], "DC": ["PRES"]}
# Offices where the RDH file leaves out some contests (TX: uncontested seats): MEDSL supplies the
# districts that have no votes in the RDH columns.
MEDSL_SUPPLEMENT = {"TX": ["USH", "SLDU", "SLDL"]}
# Documented reasons a cell differs from the site's totals. Shown on the tracker; status "explained"
# when the difference is a known convention, "loaded" (with the note) when the site's figure looks wrong.
EXPLAINED = {
    ("AK", "USH"): "Ranked-choice race: precincts carry first-choice votes; the site's total is a later round.",
    ("MN", "SLDU"): "Only the SD45 special election was held; the site has no statewide Senate row for 2024.",
    ("LA", "USH"): "LA-04 was Republican against Republican: the runner-up sits in the D slot here, as in the CA and WA top-two races; the site leaves that slot empty for Louisiana.",
    ("TX", "SLDL"): "Uncontested seats are missing from the RDH file and come from MEDSL by precinct-name match; about 4% of those votes did not match a precinct.",
    ("NY", "SLDU"): "District 22: Simcha Felder ran unopposed on both major-party lines. The site keeps his Republican-line (46,468) and Democratic-line (28,531) votes apart; the precinct file counts all of them as Democratic. District 42: 6,694 Conservative-line votes for a different candidate sit in the file's Republican total. The other 61 districts match the state canvass.",
    ("KY", "SLDU"): "SD29 was a write-in-only contest: the winner's votes are in the write-in bucket, not a party column.",
}
SITE_SUSPECT = {
    ("NY", "SLDL"): "After the fusion rule both sides credit all party lines to the candidate; the precinct file (party totals only, compiled from county boards) still differs from the state canvass by about 1% in each direction.",
    ("NY", "USH"): "Precinct sums are about 0.7% above the site's totals for both parties.",
    ("IL", "SLDL"): "24 districts differ by 1-4% in both directions; cause not yet identified.",
    ("ME", "USH"): "Precinct sums run about 0.7% above the site's House county file, the same gap corrected in Maine's legislative results (overseas ballots); the House county file has not been corrected yet.",
    ("WA", "SLDL"): "Republican sum 0.6% above the site; same-party top-two contests are counted by party here.",
}
RAW_MEDSL = PRE / "raw" / "medsl" / "2024"


def _fold(x: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", x) if not unicodedata.combining(c)).upper().replace("'", "")


def nebraska_party_fix() -> dict[str, str]:
    """Nebraska's legislature is nonpartisan on the ballot; every candidate has a known affiliation, which
    the site's district file already records. Give each RDH column that candidate's party (user rule)."""
    path = ROOT / "data-entry" / "state-leg-results" / "NE-2024.json"
    layer = rdh_layer("NE")
    if not path.exists() or not layer:
        return {}
    site = json.loads(path.read_text()).get("senate", {}).get("districts", {})
    by = {re.sub(r"^0+", "", k): v.get("candidates", []) for k, v in site.items()}
    out: dict[str, str] = {}
    for col in pyogrio.read_info(layer)["fields"]:
        if not col.startswith("GSU") or len(col) < 7:
            continue
        rest = col[3:]
        dist, tag = re.sub(r"^0+", "", rest[:-4]), _fold(rest[-3:])
        for c in by.get(dist, []):
            toks = [t for t in re.split(r"[\s\-]+", _fold(c.get("name", "")).replace(".", "")) if t and t not in ("JR", "SR", "II", "III")]
            if toks and (toks[-1].startswith(tag) or "".join(toks[-2:]).startswith(tag)):
                out[col] = {"D": "D", "R": "R"}.get(c.get("party"), "I")
                break
    return out


def classify(st: str, col: str) -> tuple[str, str, str, str] | None:
    """Vote column → (office, district code or '', party letter, candidate tag), or None."""
    if st == "WI":
        m = re.match(r"^(PRE|USS|USH|WSS|WSA)([A-Z0-9]+)24$", col)
        if not m or m.group(2) == "TOT":
            return None
        p = m.group(2)
        return WI_PREFIX[m.group(1)], "", "D" if p == "DEM" else "R" if p == "REP" else "O", p
    if st == "NY":
        m = re.match(r"^(G24CON|G24SU|G24SL)([DRO])$", col)
        if m:
            return NY_AGG[m.group(1)], "", m.group(2), m.group(2)
    for pre, office in PREFIX:
        if col.startswith(pre) and len(col) >= len(pre) + 3:
            rest = col[len(pre):]
            # {district}{party}{3-letter name}; a few surnames are 2 letters (GA "GCON04RYU"), which
            # shows up as a digit where the party letter should be.
            n = 3 if len(rest) >= 4 and not rest[-4].isdigit() else 2
            if office in ("PRES", "USS", "USSS", "GOV"):
                n = len(rest) - 1
            if st == "NE" and "NE" not in PARTY_FIX:
                PARTY_FIX["NE"] = nebraska_party_fix()
            party = PARTY_FIX.get(st, {}).get(col, rest[-n - 1])
            return office, rest[: -n - 1], party, rest[-n:]
    return None


IND_AS_DEM = {"KIN", "SAN"}  # Angus King (ME), Bernie Sanders (VT)


def slot_columns(cands: list[tuple[str, str, int]]) -> tuple[str | None, str | None]:
    """cands = [(column, party letter, total votes)] for ONE contest → (D-slot column, R-slot column).

    The site's convention for single-winner races: the R slot is the leading Republican; the D slot is
    the Democrat (King and Sanders in their races), or with no Democrat on the ballot the leading
    independent (Osborn), or failing that the leading minor-party candidate. With no Republican on the ballot the R slot
    is the runner-up (a same-party general, or the leading minor candidate against an unopposed Democrat)."""
    live = sorted([c for c in cands if c[2] > 0], key=lambda c: -c[2])
    # Write-in and scatter buckets ("O", "W") never fill a slot: an unopposed race keeps an empty side.
    named = [c for c in live if c[1] not in ("O", "W")]
    reps = [c for c in named if c[1] == "R"]
    non = [c for c in named if c[1] != "R"]
    r = reps[0] if reps else None
    # D slot: the Democrat, unless an independent outpolled them (King, Sanders). A minor-party candidate
    # (Libertarian, Green...) takes the slot only when no Democrat or independent ran (Alaska 2016:
    # Metcalfe (D) holds it although Miller (L) finished ahead).
    dem = next((c for c in non if c[1] == "D"), None)
    ind = next((c for c in non if c[1] in ("I", "N", "U")), None)
    # An independent displaces a Democrat only for the two who sit with the Democrats (IND_AS_DEM); in
    # Alaska 2016 Stock (I) outpolled Metcalfe (D) and Metcalfe keeps the slot, as on the site.
    aligned = next((c for c in non if c[1] in ("I", "N", "U") and c[0][-3:].upper() in IND_AS_DEM), None)
    d = (aligned if aligned and (not dem or aligned[2] > dem[2]) else dem) or ind or (non[0] if non else None)
    # Same-party generals (CA, WA top-two; LA when two of one party lead): the runner-up takes the empty slot.
    if d is None and len(reps) > 1:
        d = reps[1]
    if r is None and len(non) > 1:
        r = non[1]
    return (d[0] if d else None), (r[0] if r else None)


def rdh_layer(st: str) -> str | None:
    zips = sorted(RAW_RDH.glob(f"{st.lower()}_2024_gen_prec*.zip")) + sorted(RAW_RDH.glob(f"{st.lower()}_2024*.zip"))
    if not zips:
        return None
    z = zips[0]
    with zipfile.ZipFile(z) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith((".shp", ".geojson"))]
    pick = next((n for n in names if "_all" in n.lower()), None) or next((n for n in names if not re.search(r"_(cong|sldu|sldl)", n.lower())), None)
    return f"/vsizip/{z}/{pick}" if pick else None


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def medsl_fill(st: str, meta: dict, pids: list[int], wanted: list[str], skip: dict[str, set[str]] | None = None) -> tuple[dict, dict, dict]:
    """Offices from the MEDSL state file, matched to anchor precincts by (county, normalized name)."""
    path = next(iter(sorted(RAW_MEDSL.glob(f"2024-{st.lower()}-precinct-general.*"))), None)
    if not path:
        return {}, {}, {}
    df = pd.read_csv(path, sep=None, engine="python", dtype=str)
    df["votes"] = pd.to_numeric(df["votes"], errors="coerce").fillna(0)
    df["office_code"] = df["office"].map(MEDSL_OFFICE)
    df = df[df["office_code"].isin(wanted) & (df["stage"].str.upper() == "GEN") & (df["special"].str.upper() != "TRUE")]
    # anchor lookup: county + name, where KS anchor names are "County-Precinct"
    idx: dict[tuple[str, str], int] = {}
    for i, p in enumerate(pids):
        a = meta["precincts"][str(p)]
        nm = a["name"]
        idx[(a["county"], _key(nm))] = i
        if "-" in nm:
            idx.setdefault((a["county"], _key(nm.split("-", 1)[1])), i)
        m = re.search(r"(\d+)$", nm)
        if m:
            idx.setdefault((a["county"], m.group(1).lstrip("0") or "0"), i)
    df["county5"] = df["county_fips"].str.zfill(5)
    # Last resort: the trailing 4 characters (TX: MEDSL "1010766" = county key + VTD "0766", anchor "201-0766").
    df["row"] = [idx.get((c, _key(p)), idx.get((c, str(p).lstrip("0")), idx.get((c, str(p)[-4:]), -1))) for c, p in zip(df["county5"], df["precinct"])]
    df["letter"] = df["party_simplified"].map({"DEMOCRAT": "D", "REPUBLICAN": "R"}).fillna("O")
    df.loc[df["writein"].str.upper() == "TRUE", "letter"] = "W"
    df["district"] = df["district"].fillna("").str.replace(r"^0+(?=\d)", "", regex=True)
    offices, districts, sums = {}, {}, {}
    for office in wanted:
        o = df[df["office_code"] == office]
        if skip is not None:
            o = o[~o["district"].isin(skip.get(office, set()))]
        if o.empty:
            continue
        total = float(o["votes"].sum())
        matched = o[o["row"] >= 0]
        n = len(pids)
        d = [0] * n
        r = [0] * n
        oth = [0] * n
        dist = [""] * n
        o = o.assign(cand=o["district"] + "|" + o["candidate"].fillna("") + "|" + o["letter"])
        for district, grp in o.groupby("district"):
            if office in SLOT_OFFICES:
                tot = grp.groupby(["cand", "letter"])["votes"].sum().reset_index()
                dcol, rcol = slot_columns([(c, l, int(v)) for c, l, v in zip(tot["cand"], tot["letter"], tot["votes"])])
            m = grp[grp["row"] >= 0]
            for row, cand, letter, v in zip(m["row"], m["cand"], m["letter"], m["votes"]):
                v = int(round(v))
                if office in SLOT_OFFICES:
                    (d if cand == dcol else r if cand == rcol else oth)[row] += v
                else:
                    (d if letter == "D" else r if letter == "R" else oth)[row] += v
                if v and district:
                    dist[row] = str(district).zfill(2)
        offices[office] = [[a, b, c] for a, b, c in zip(d, r, oth)]
        if any(dist):
            districts[office] = dist
        sums[office] = {"d": sum(d), "r": sum(r), "o": sum(oth), "precincts_with_votes": sum(1 for a, b, c in zip(d, r, oth) if a + b + c > 0),
                        "matched": round(float(matched["votes"].sum()) / total, 4) if total else 0.0, "src": "medsl-2024", "basis": "slot" if office in SLOT_OFFICES else "party"}
    return offices, districts, sums


def build_state(st: str) -> dict | None:
    meta_path = ANCHORS / f"{st}.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text())
    pids = sorted(int(p) for p in meta["precincts"])
    geoid_of = {int(p): v["geoid"] for p, v in meta["precincts"].items()}
    offices: dict[str, list[list[int]]] = {}
    districts: dict[str, list[str]] = {}
    sums: dict[str, dict] = {}
    src = []
    layer = rdh_layer(st) if meta["source_kind"] == "rdh" else None
    if layer:
        src.append("rdh-2024")
        df = pyogrio.read_dataframe(layer, read_geometry=False)
        cols = {c.upper(): c for c in df.columns}
        idcol = cols.get("UNIQUE_ID") or cols.get("PRECINCT")
        df["_id"] = df[idcol].astype(str)
        dup = df["_id"].duplicated(keep=False)
        if dup.any():  # mirror build_anchor's de-duplication
            df.loc[dup, "_id"] = df.loc[dup, "_id"] + "#" + df.loc[dup].groupby("_id").cumcount().add(1).astype(str)
        df = df.set_index("_id")
        order = [geoid_of[p] for p in pids]
        missing = [g for g in order if g not in df.index]
        if missing:
            sys.exit(f"{st}: {len(missing)} anchor precincts not found in the RDH attributes, e.g. {missing[:3]}")
        df = df.loc[order]

        # office → district → [(column, party letter)]
        contests: dict[str, dict[str, list[tuple[str, str]]]] = defaultdict(lambda: defaultdict(list))
        for c in df.columns:
            k = classify(st, c)
            if k:
                contests[k[0]][k[1]].append((c, k[2]))
        for office in OFFICES:
            if office not in contests:
                continue
            vote_cols = [c for cs in contests[office].values() for c, _ in cs]
            v = df[vote_cols].apply(pd.to_numeric, errors="coerce").fillna(0)
            totals = v.sum(axis=0)
            aggregated = st in ("NY", "WI")  # party totals, no candidate columns
            slot = office in SLOT_OFFICES and not (aggregated and office != "PRES" and st == "NY") and not (st == "WI")
            dcols: list[str] = []
            rcols: list[str] = []
            for dist, cs in contests[office].items():
                if slot:
                    dc, rc = slot_columns([(c, p, int(totals[c])) for c, p in cs])
                    dcols += [dc] if dc else []
                    rcols += [rc] if rc else []
                else:
                    dcols += [c for c, p in cs if p == "D"]
                    rcols += [c for c, p in cs if p == "R"]
            d = v[dcols].sum(axis=1) if dcols else pd.Series(0, index=df.index)
            r = v[rcols].sum(axis=1) if rcols else pd.Series(0, index=df.index)
            o = v.sum(axis=1) - d - r
            d, r, o = d.round().astype(int), r.round().astype(int), o.round().astype(int)
            offices[office] = [[int(a), int(b_), int(c_)] for a, b_, c_ in zip(d, r, o)]
            sums[office] = {"d": int(d.sum()), "r": int(r.sum()), "o": int(o.sum()), "precincts_with_votes": int(((d + r + o) > 0).sum()), "src": "rdh-2024", "basis": "slot" if slot else "party"}
            named = {dist: [c for c, _ in cs] for dist, cs in contests[office].items() if dist}
            if named:
                per = pd.DataFrame({dist: v[cs].sum(axis=1) for dist, cs in named.items()})
                top = per.idxmax(axis=1).where(per.max(axis=1) > 0, "")
                districts[office] = [str(x) for x in top]
                sums[office]["districts"] = int((per.sum(axis=0) > 0).sum())

    if st in MEDSL_SUPPLEMENT:
        have = {o: {re.sub(r"^0+(?=\d)", "", k) for k in set(districts.get(o, [])) if k} for o in MEDSL_SUPPLEMENT[st]}
        mo, md, ms = medsl_fill(st, meta, pids, [o for o in MEDSL_SUPPLEMENT[st] if o in offices], skip=have)
        for o, rows in mo.items():
            offices[o] = [[a + x, b + y, c + z] for (a, b, c), (x, y, z) in zip(offices[o], rows)]
            if o in md:
                districts[o] = [cur or new for cur, new in zip(districts[o], md[o])]
            for k in ("d", "r", "o"):
                sums[o][k] += ms[o][k]
            sums[o]["precincts_with_votes"] = sum(1 for a, b, c in offices[o] if a + b + c > 0)
            sums[o]["src"] = "rdh-2024+medsl-2024"
            sums[o]["matched"] = ms[o]["matched"]
        if mo:
            src.append("medsl-2024")

    wanted = [o for o in MEDSL_FILL.get(st, []) if o not in offices or sums[o]["d"] + sums[o]["r"] + sums[o]["o"] == 0]
    if wanted:
        mo, md, ms = medsl_fill(st, meta, pids, wanted)
        offices.update(mo)
        districts.update(md)
        sums.update(ms)
        if mo:
            src.append("medsl-2024")

    (OUT / st).mkdir(parents=True, exist_ok=True)
    (OUT / st / f"{YEAR}.json").write_text(json.dumps({"year": YEAR, "st": st, "n": len(pids), "first_pid": pids[0], "offices": offices, "districts": districts, "basis": {o: sums[o]["basis"] for o in offices}, "src": src}, separators=(",", ":")) + "\n")
    return {"n": len(pids), "offices": sums}


# ---------------------------------------------------------------------------------------------
# Truth and applicability from the files the site already holds.

def _num(v: str) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def house_certified() -> dict[tuple[int, str, str], tuple[int, int]]:
    """(year, state, district number as text, at-large = "1") → certified (Dem, Rep) votes, 2016-2024."""
    out = {}
    with open(ROOT / "data-entry" / "house_past_results.csv", newline="") as f:
        for row in csv.DictReader(f):
            y = int(row["year"])
            if 2016 <= y <= 2024 and y % 2 == 0:
                tail = row["district_name"].split("-")[-1]
                out[(y, row["state_abbr"], str(int(tail)) if tail.isdigit() else "1")] = (_num(row["dem_votes"]), _num(row["rep_votes"]))
    return out


def load_truth() -> dict:
    """truth[year][office][state] = {'d': …, 'r': …}; presence also defines which contests were held."""
    t: dict = defaultdict(lambda: defaultdict(dict))
    de = ROOT / "data-entry"

    def add(year: int, office: str, st: str, d: int, r: int) -> None:
        cur = t[year][office].setdefault(st, {"d": 0, "r": 0})
        cur["d"] += d
        cur["r"] += r

    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for row in csv.DictReader(f):
            for y in (2016, 2020, 2024):
                if row.get(f"total_{y}"):
                    add(y, "PRES", row["state"], _num(row[f"dem_{y}"]), _num(row[f"gop_{y}"]))
    for office, stem in (("USS", "county_senate_results"), ("GOV", "county_governor_results")):
        for p in sorted(de.glob(f"{stem}_*.csv")):
            y = int(p.stem.rsplit("_", 1)[1])
            with open(p, newline="") as f:
                for row in csv.DictReader(f):
                    add(y, office, row["state"], _num(row.get(f"dem_{y}", "")), _num(row.get(f"gop_{y}", "")))
    # U.S. Senate specials held beside the regular race (MN/MS 2018, GA 2020, OK 2022, NE 2024): the
    # certified race row (senate_past_results.csv), whose stage (runoff or general) is the one the site
    # counts. A special that was the state's only Senate race that year (AZ 2020) is its USS contest.
    with open(de / "senate_past_results.csv", newline="") as f:
        sen = list(csv.DictReader(f))
    regular = {(r["state_abbr"], int(r["year"])) for r in sen if r.get("type") != "Special"}
    for r in sen:
        y = int(r["year"])
        if r.get("type") == "Special" and y >= 2016 and (r["state_abbr"], y) in regular:
            add(y, "USSS", r["state_abbr"], _num(r["dem_votes"]), _num(r["rep_votes"]))
    # U.S. House: the certified district totals (house_past_results.csv), not the county breakdown, which
    # leaves out county pieces it could not split and is short in a few dozen districts.
    for (y, st, _d), (dv, rv) in house_certified().items():
        add(y, "USH", st, dv, rv)
    for p in sorted((de / "state-leg-results").glob("*.json")):
        st, y = p.stem.split("-")
        j = json.loads(p.read_text())
        for chamber, office in (("senate", "SLDU"), ("house", "SLDL")):
            ds = (j.get(chamber) or {}).get("districts") or {}
            if ds:
                add(int(y), office, st, sum(_num(v.get("demVotes")) for v in ds.values()), sum(_num(v.get("repVotes")) for v in ds.values()))
    # 2026: race roster from the official-results build (votes still moving until certification).
    races = de / "results-2026" / "races.csv"
    if races.exists():
        omap = {"senate": "USS", "governor": "GOV", "house": "USH", "state_senate": "SLDU", "state_house": "SLDL"}
        with open(races, newline="") as f:
            rows = list(csv.DictReader(f))
        for row in rows:
            office = omap.get(row["office"])
            if office and row.get("special") in ("0", "", None):
                add(2026, office, row["state"], _num(row["dem_votes"]), _num(row["rep_votes"]))
        # A Senate special that was the state's only Senate race that year (Ohio, Florida) is its Senate contest.
        for row in rows:
            if row["office"] == "senate" and row.get("special") not in ("0", "", None) and row["state"] not in t[2026]["USS"]:
                add(2026, "USS", row["state"], _num(row["dem_votes"]), _num(row["rep_votes"]))
    return t


def main() -> None:
    states = [s.upper() for s in sys.argv[1:]] or STATES
    truth = load_truth()
    cov = json.loads(COVERAGE.read_text()) if COVERAGE.exists() else {"states": {}}
    for st in states:
        res = build_state(st)
        if res is None:
            print(f"{st}: no anchor")
            continue
        meta = json.loads((ANCHORS / f"{st}.json").read_text())
        entry = cov["states"].setdefault(st, {})
        entry.update({"n": res["n"], "anchor": {"kind": meta["source_kind"], "built": meta["built"], "confidence": meta.get("source", {}).get("confidence", ""), "same_in_2026": meta.get("source", {}).get("same_in_2026", "")}})
        years = entry.setdefault("years", {})
        line = []
        for y in YEARS:
            ycell = years.setdefault(str(y), {})
            for office in OFFICES:
                tr = truth.get(y, {}).get(office, {}).get(st)
                if y != YEAR:
                    if office not in ycell or ycell[office]["status"] in ("na", "missing"):
                        ycell[office] = {"status": "missing" if tr else "na"}
                    continue
                s = res["offices"].get(office)
                if not s or (s["d"] + s["r"] + s["o"]) == 0:
                    ycell[office] = {"status": "missing" if tr else "na"}
                    if tr:
                        line.append(f"{office}:MISSING")
                    continue
                cell = {"status": "loaded", "d": s["d"], "r": s["r"], "o": s["o"], "src": s.get("src", "rdh-2024"), "basis": s.get("basis", "party"), "withVotes": round(s["precincts_with_votes"] / res["n"], 4)}
                if "matched" in s:
                    cell["matched"] = s["matched"]
                if tr and (tr["d"] + tr["r"]) > 0:
                    two = tr["d"] + tr["r"]
                    cell["truthD"], cell["truthR"] = tr["d"], tr["r"]
                    cell["diffD"] = round((s["d"] - tr["d"]) / two, 5)
                    cell["diffR"] = round((s["r"] - tr["r"]) / two, 5)
                    if abs(cell["diffD"]) <= RECONCILE_TOL and abs(cell["diffR"]) <= RECONCILE_TOL:
                        cell["status"] = "reconciled"
                note = EXPLAINED.get((st, office)) or SITE_SUSPECT.get((st, office))
                if cell["status"] == "loaded" and note:
                    cell["note"] = note
                    if (st, office) in EXPLAINED:
                        cell["status"] = "explained"
                ycell[office] = cell
                line.append(f"{office}:{'ok' if cell['status'] == 'reconciled' else cell['status'].upper() + ' ' + format(cell.get('diffD', float('nan')) * 100, '+.1f') + '/' + format(cell.get('diffR', float('nan')) * 100, '+.1f')}")
        print(f"{st} {res['n']:6d}  " + "  ".join(line))
    cov["generated"] = dt.date.today().isoformat()
    cov["offices"] = OFFICES
    cov["years"] = YEARS
    cov["tolerance"] = RECONCILE_TOL
    COVERAGE.parent.mkdir(parents=True, exist_ok=True)
    COVERAGE.write_text(json.dumps(cov, separators=(",", ":"), sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
