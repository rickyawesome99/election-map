#!/usr/bin/env python3
"""U.S. House and state-legislative results for 2016, 2018 and 2020, fitted onto the 2024 precincts.

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

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
import build_results_vest as V  # noqa: E402
from coverage import update_cells  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PRE = ROOT / "data-entry" / "precincts"
RAW = PRE / "raw"
OUT = ROOT / "public" / "precincts" / "results"
DISTRICT_OFFICES = ["USH", "SLDU", "SLDL"]
# Differences from the site's totals that have a known cause (shown on /audit/precincts).
EXPLAINED: dict[tuple[str, str], str] = {
    ("NE", "SLDU"): "Nonpartisan ballot. The site holds no party for these years' candidates, so its totals are not by party. Here each candidate takes the affiliation on file (2018 research, 2022-2026 rosters); the rest count as other.",
}
SIG_OFFICES = ["PRES", "USS", "GOV", "USS_S"]

# Rows that are not a vote for anyone.
META = re.compile(r"^(UNDER ?VOTES?|OVER ?VOTES?|OVER|UNDER|BLANKS?|BLANK.*|PUBLIC COUNTER|REGISTERED VOTERS.*|.*BALLOTS( CAST)?|TOTAL( VOTES)?|CAST VOTES|ELIGIBLE|"
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
        "vtd", "and", "at", "village", "vlg", "tp", "bor", "ed", "number", "num", "box", "pcnt", "wards", "precincts", "county", "co", "municipality", "mun"}
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


def line_letter(party: str) -> str:
    """One ballot line's party → D, R, I (independent / none listed), M (minor) or ? (blank)."""
    p = party.strip()
    if not p:
        return "?"
    parts = [x.strip() for x in re.split(r"[,/]", p)]
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
                for k in ((office, norm_district(dk), surname(c.get("name", ""))), (office, "*", surname(c.get("name", "")))):
                    if k in out and out[k] != party:
                        amb.add(k)
                    out[k] = party
    for k in amb:
        if k[1] == "*":
            del out[k]
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


def load_medsl(st: str, year: int, tags: dict[str, dict[str, str]] | None = None) -> pd.DataFrame | None:
    path = RAW / "medsl" / str(year) / "by_state" / f"{st}.parquet"
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
    # TOTAL lines next to by-mode lines for the same contest in the same county: keep one of the two.
    grp = ["county", "office", "district"]
    tot = df[df["mode"] == "TOTAL"].groupby(grp)["votes"].sum().rename("t")
    oth = df[df["mode"] != "TOTAL"].groupby(grp)["votes"].sum().rename("m")
    both = pd.concat([tot, oth], axis=1).dropna()
    dup = both[(both["t"] > 0) & (both["m"] > 0) & ((both["m"] - both["t"]).abs() <= 0.02 * both["t"])]
    if len(dup):
        df = df.merge(dup.assign(dupflag=1)[["dupflag"]], left_on=grp, right_index=True, how="left")
        df = df[~((df["dupflag"] == 1) & (df["mode"] != "TOTAL"))].drop(columns=["dupflag"])
    df["scatter"] = df["writein"] | df["candidate"].map(lambda c, memo={}: memo.setdefault(c, bool(SCATTER.match(c))))
    df["line"] = df["party"].map(lambda p, memo={}: memo.setdefault(p, line_letter(p)))
    # One party per candidate (fusion: the candidate keeps every line's votes, under their major party).
    ck = ["office", "district", "candidate"]
    lines = df[~df["scatter"]].groupby(ck + ["line"])["votes"].sum().reset_index()
    site = site_parties(st, year)
    letters: dict[tuple[str, str, str], str] = {}
    for (office, district, cand), g in lines.groupby(ck):
        by = dict(zip(g["line"], g["votes"]))
        major = max((l for l in ("D", "R") if l in by), key=lambda l: by[l], default=None)
        sn = surname(cand)
        looked = site.get((office, district, sn)) or site.get((office, "*", sn)) or (tags or {}).get(office.replace("_S", ""), {}).get(sn[:3])
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
    tot = s.groupby(["office", "district", "candidate", "letter"])["votes"].sum().reset_index()
    pick: dict[tuple[str, str, str], int] = {}
    for (office, district), g in tot.groupby(["office", "district"]):
        cands = [(f"{c}|{l}|", l, int(v)) for c, l, v in zip(g["candidate"], g["letter"], g["votes"])]
        if office != "USH":  # King / Sanders rule reads the last three letters of the tag
            cands = [(f"{c}|{l}|{surname(c)[:3]}", l, v) for (c, l, v), c in zip([(x[0].split('|')[0], x[1], x[2]) for x in cands], g["candidate"])]
        d, r = B.slot_columns(cands)
        if d:
            pick[(office, district, d.split("|")[0])] = 0
        if r:
            pick[(office, district, r.split("|")[0])] = 1
    idx = np.flatnonzero(slot)
    vals = [pick.get(k, 2) if l != "W" else 2 for k, l in zip(zip(s["office"], s["district"], s["candidate"]), s["letter"])]
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
    edp = [re.search(r"ELECTDIST:\s*(\d+)\|PREC:\s*(\d+)", x) for x in prec["precinct"]]  # Maryland 2016: "…|electdist: 20|prec: 7" = precinct 20-007
    if any(edp):
        mkeys["edprec"] = [f"{int(m.group(1))}{int(m.group(2)):03d}" if m else "" for m in edp]
    for c in list(vkeys):
        if "+" not in c:
            vkeys[c + "~0"] = [strip0(x) for x in vkeys[c]]

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
        if best[2] in ("digits", "jurisdiction") and len(best[0]) < 0.3 * (out < 0).sum():
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


def build_state(st: str, year: int, truth: dict) -> str:
    old = V.load_old(st, year) if (RAW / "medsl" / str(year) / "by_state" / f"{st}.parquet").exists() else None
    df = load_medsl(st, year, vest_tags(old, year)) if old is not None else None
    if old is None or df is None:
        return f"{st}: missing inputs"
    xw = V.crosswalk(st, old)
    if xw is None:
        return f"{st}: no blocks"
    rows, cols_idx, w, split, first, n = xw
    nold = len(old)
    comp = slot_table(df)
    vcounty = county_of(old, st)
    vsig, vweight = vest_signature(old, year)
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
    for office in DISTRICT_OFFICES:
        o = df[(df["office"] == office) & (df["votes"] != 0)]
        if o.empty or st not in truth.get(year, {}).get(office, {}):
            continue  # nothing reported, or no regular contest that year (odd-year legislatures, DC's delegate)
        arr = np.zeros((3, nold))
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

        u = o[o["oid"] < 0]
        has_multi = u["mk"].isin(multi.keys())
        exact_votes = local_votes = 0.0
        # One line, several shapes: a Wisconsin reporting unit (exact), or a line that names a town (local).
        for (mk, district), g in u[has_multi].groupby(["mk", "district"]):
            target, exact = multi[mk]
            if not exact and district in known_mask:
                inside = target[known_mask[district][target]]
                if len(inside):
                    target = inside
            spread(target, g, district)
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
                        "src": f"medsl-{year}+vest-{year}", "basis": "slot" if office == "USH" else "party",
                        "matched": round((float(m["votes"].sum()) + exact_votes) / total, 4) if total else 0.0, "local": round(local_votes / total, 4) if total else 0.0, "est": round(float(splitv.sum() / allv.sum()), 4) if allv.sum() else 0.0}
        notes.append(f"{office} {sums[office]['matched']:.0%}+{sums[office]['local']:.0%}")

    if not offices:
        return f"{st}: no district contests in MEDSL {year}"
    (OUT / st).mkdir(parents=True, exist_ok=True)
    path = OUT / st / f"{year}.json"
    doc = json.loads(path.read_text()) if path.exists() else {"year": year, "st": st, "n": n, "first_pid": first, "offices": {}, "districts": {}, "basis": {}, "est": {}, "src": []}
    doc["offices"].update(offices)
    doc.setdefault("districts", {}).update(districts)
    doc.setdefault("est", {}).update(est)
    doc.setdefault("basis", {}).update({o: ("slot" if o == "USH" else "party") for o in offices})
    doc["src"] = sorted(set(doc.get("src", [])) | {f"medsl-{year}", f"vest-{year}"})
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    line = update_cells(st, year, n, sums, truth, explained=EXPLAINED)
    nm = len(mk2oid)
    return f"{st} mk {nm:6d} old {nold:5d}  fp {stats['fingerprint']} name {stats['name']} fuzzy {stats['fuzzy']} near {stats['near']} units {stats['units']} place {stats['place']} un {int((mk2oid < 0).sum()) - sum(1 for v in multi.values() if v[1])}{'' if use_county else ' (no county)'}  {line}   [{', '.join(notes)}]"


def main() -> None:
    year = int(sys.argv[1])
    states = [s.upper() for s in sys.argv[2:]] or B.STATES
    truth = B.load_truth()
    for st in states:
        try:
            print(build_state(st, year, truth), flush=True)
        except Exception as e:  # keep going; one state's quirk should not stop the run
            import traceback
            print(f"{st}: FAILED {type(e).__name__}: {str(e)[:300]} @ {traceback.extract_tb(e.__traceback__)[-1].lineno}", flush=True)


if __name__ == "__main__":
    main()
