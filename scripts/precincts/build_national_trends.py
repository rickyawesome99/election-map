#!/usr/bin/env python3
"""Nationwide precinct trends for the all-states sidebar on /precincts: one blended margin per year for
groups of precincts (area type, racial makeup, age and housing, region).

Method: homogeneous precinct analysis. A group is every precinct past a cutoff (90%+ white, urban, in
the South...), fixed for all years: the 2024 precinct lines, the 2020 Census counts and the area type
never change, so a group's line follows the same places through time.

A precinct's figure for a year is the sidebar's Trend figure (blendYear in PrecinctExplorer.tsx):
contested races at face value (estimates kept, one-party races left out), averaged within each TPL race
type and weighed with TPL's race-type weights renormalized over the types present. A group's figure is
the mean of its precincts' figures, weighted by each precinct's votes cast (its largest contested race).

Years: the even years every state has on file (2016-2024). A year is left out until at least
MIN_STATES states have it, so a partly certified year (2026) never mixes a different set of states into
the lines. DC has no partisan federal race in a midterm and is left out of midterm years.

Output: data/precincts/nationalTrends.json, and the same per state (every year the state voted in, no
regions) in public/precincts/trends/{ST}.json

  python3 scripts/precincts/build_national_trends.py
"""
from __future__ import annotations
import json
import re
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "precincts"
OUT = ROOT / "data" / "precincts" / "nationalTrends.json"

OFFICES = ["PRES", "USS", "GOV", "USH", "SLDU", "SLDL"]
TPL_TYPE = {"PRES": "P", "USS": "S", "GOV": "G", "USH": "H", "SLDU": "L", "SLDL": "L"}
YEARS = [2016, 2018, 2020, 2022, 2024, 2026]
ALL_YEARS = list(range(2016, 2027))
MIN_STATES = 45
MIN_GROUP = 10          # precincts a group needs in a state to get a line there
STATE_YEAR_COVER = 0.8  # share of the state's voting precincts a year must reach to be charted
STATE_OUT = PUB / "trends"
MIN_POP = 50  # a precinct needs this many residents for its makeup to mean anything

REGIONS = {
    "Northeast": "CT ME MA NH RI VT NJ NY PA",
    "Great Lakes": "IL IN MI OH WI",
    "Plains": "IA KS MN MO NE ND SD",
    "South": "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX",
    "Mountain West": "AZ CO ID MT NV NM UT WY",
    "West Coast": "AK CA HI OR WA",
}


def tpl_weights() -> tuple[dict[str, float], dict[str, float]]:
    """TPL's race-type weights, read from the model's own constants so the two cannot drift."""
    src = (ROOT / "data" / "tplModelData.ts").read_text()

    def grab(name: str) -> dict[str, float]:
        m = re.search(rf"{name}:\s*\{{([^}}]*)\}}", src)
        assert m, f"{name} not found in data/tplModelData.ts"
        return {k: float(v) for k, v in re.findall(r"(\w+):\s*([\d.]+)", m.group(1))}

    return grab("RACE_TYPE_WEIGHTS"), grab("RACE_TYPE_WEIGHTS_MIDTERM")


def leg_key(st: str, office: str, code: str, year: int) -> str:
    """legKey() in PrecinctExplorer.tsx."""
    k = re.sub(r"(,\s*POSITION.*|-P\d+)$", "", re.sub(r"^DISTRICT\s+", "", code.strip().upper()))
    if office == "SLDL" and st == "WA" and year == 2024 and re.fullmatch(r"\d{3}", k):
        k = k[:-1]
    if office == "SLDL" and st == "ID":
        k = re.sub(r"[A-Z]$", "", k)
    return re.sub(r"^0+(?=\d)", "", k)


def one_party_mask(st: str, year: int, office: str, rows: np.ndarray, districts: list | None, op: dict) -> np.ndarray:
    """True where the precinct's race had no candidate from one party (onePartyRace in PrecinctExplorer.tsx)."""
    n = len(rows)
    if office == "PRES":
        return np.zeros(n, bool)
    statewide = office in ("USS", "GOV")
    if not statewide and districts is None:
        return np.zeros(n, bool)
    keys = ["*"] * n if statewide else [d or "" for d in districts]
    covered = office in op["covered"].get(st, {}).get(str(year), [])
    races = op["races"].get(st, {}).get(str(year), {}).get(office, {})
    out = np.zeros(n, bool)
    uniq = sorted(set(keys))
    karr = np.array(keys, dtype=object)
    for d in uniq:
        if d == "":
            continue
        sel = karr == d
        if covered:
            bad = ("*" if statewide else leg_key(st, office, d, year)) in races
        else:
            dsum, rsum = rows[sel, 0].sum(), rows[sel, 1].sum()
            bad = (dsum == 0 or rsum == 0) and (dsum + rsum) > 0
        if bad:
            out[sel] = True
    return out


def state_year(st: str, year: int, op: dict, weights: dict[str, float]) -> tuple[np.ndarray, np.ndarray] | None:
    """(blended margin, votes) per precinct; NaN margin where the precinct had no contested race."""
    f = PUB / "results" / st / f"{year}.json"
    if not f.exists():
        return None
    res = json.loads(f.read_text())
    n = res["n"]
    by_type: dict[str, list[np.ndarray]] = {}
    votes = np.zeros(n)
    for o in OFFICES:
        raw = res["offices"].get(o)
        if raw is None or not weights.get(TPL_TYPE[o]):
            continue
        rows = np.array([r if r else [0, 0, 0] for r in raw], float)
        total = rows.sum(axis=1)
        bad = one_party_mask(st, year, o, rows, res.get("districts", {}).get(o), op)
        ok = (total > 0) & ~bad
        m = np.where(ok, (rows[:, 1] - rows[:, 0]) / np.maximum(total, 1) * 100, np.nan)
        by_type.setdefault(TPL_TYPE[o], []).append(m)
        votes = np.maximum(votes, np.where(ok, total, 0))
    num, den = np.zeros(n), np.zeros(n)
    for t, ms in by_type.items():
        stack = np.vstack(ms)
        cnt = (~np.isnan(stack)).sum(axis=0)
        mean = np.where(cnt > 0, np.nansum(stack, axis=0) / np.maximum(cnt, 1), 0)
        num += np.where(cnt > 0, weights[t] * mean, 0)
        den += np.where(cnt > 0, weights[t], 0)
    return np.where(den > 0, num / np.maximum(den, 1e-12), np.nan), votes


def main() -> None:
    w_pres, w_mid = tpl_weights()
    op = json.loads((PUB / "one-party.json").read_text())
    states = sorted(p.name for p in (PUB / "results").iterdir() if p.is_dir())
    region_of = {s: r for r, lst in REGIONS.items() for s in lst.split()}
    assert set(states) <= set(region_of), set(states) - set(region_of)

    # Group membership per state (fixed for all years).
    members: dict[str, dict[str, np.ndarray]] = {}
    for st in states:
        d = json.loads((PUB / "demographics" / f"{st}.json").read_text())["cols"]
        c = {k: np.array(v, float) for k, v in d.items()}
        loc = np.array(json.loads((PUB / "locale" / f"{st}.json").read_text())["cls"])
        pop, vap, occ = c["pop"], np.maximum(c["vap"], 1), np.maximum(c["occ"], 1)
        big = pop >= MIN_POP
        share = lambda k: c[k] / np.maximum(pop, 1)  # noqa: E731
        g = {
            "all": np.ones(len(pop), bool),
            "urban": loc == 0, "suburban": loc == 1, "exurban": loc == 2, "rural": loc == 3,
            "white90": big & (share("white") >= 0.9), "black80": big & (share("black") >= 0.8),
            "hisp80": big & (share("hisp") >= 0.8), "asian50": big & (share("asian") >= 0.5),
            "native70": big & (share("aian") >= 0.7),
            "young": big & (c["a18_34"] / vap >= 0.5), "senior": big & (c["a65"] / vap >= 0.4),
            "renter": big & (1 - c["own"] / occ >= 0.8) & (c["occ"] >= 20), "owner": big & (c["own"] / occ >= 0.9) & (c["occ"] >= 20),
        }
        for r in REGIONS:
            g[f"region:{r}"] = np.full(len(pop), region_of[st] == r)
        members[st] = g
    keys = list(next(iter(members.values())))

    # Every state-year on file, once.
    per: dict[int, dict[str, tuple[np.ndarray, np.ndarray]]] = {}
    for year in ALL_YEARS:
        w = w_pres if year % 4 == 0 else w_mid
        per[year] = {}
        for st in states:
            r = state_year(st, year, op, w)
            if r is not None:
                per[year][st] = r

    def figure(rows: dict[str, tuple[np.ndarray, np.ndarray]], k: str) -> float | None:
        num = den = 0.0
        for st, (m, v) in rows.items():
            sel = members[st][k] & ~np.isnan(m) & (v > 0)
            num += float((m[sel] * v[sel]).sum())
            den += float(v[sel].sum())
        return round(num / den, 2) if den else None

    # National: the even years nearly every state has.
    years_out, series = [], {k: [] for k in keys}
    for year in YEARS:
        rows = {st: r for st, r in per[year].items() if not (st == "DC" and year % 4)}
        if len(rows) < MIN_STATES:
            print(f"{year}: {len(rows)} states on file, left out")
            continue
        years_out.append(year)
        for k in keys:
            series[k].append(figure(rows, k))
        print(year, f"{len(rows)} states  all {series['all'][-1]:+.1f}")
    counts = {k: int(sum(members[st][k].sum() for st in states)) for k in keys}
    doc = {"years": years_out, "counts": counts, "series": series, "regions": {r: lst.split() for r, lst in REGIONS.items()}}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    for k in keys:
        print(f"{k:22} {counts[k]:>7,}  " + "  ".join(f"{v:+6.1f}" for v in series[k]))

    # Per state: every year the state voted in (odd years and a certified 2026 included), the same
    # groups without regions. A year counts only when most of the state's precincts had a contested
    # race (a scattered special election is not a statewide reading); a group needs MIN_GROUP precincts.
    STATE_OUT.mkdir(parents=True, exist_ok=True)
    group_keys = [k for k in keys if not k.startswith("region:")]
    for st in states:
        have = {y: per[y][st] for y in ALL_YEARS if st in per[y]}
        voted = {y: int((~np.isnan(m) & (v > 0)).sum()) for y, (m, v) in have.items()}
        full = max(voted.values(), default=0)
        ys = [y for y in ALL_YEARS if y in have and voted[y] >= STATE_YEAR_COVER * full]
        st_counts = {k: int(members[st][k].sum()) for k in group_keys}
        st_series = {k: [figure({st: have[y]}, k) for y in ys] for k in group_keys if st_counts[k] >= MIN_GROUP}
        sdoc = {"st": st, "years": ys, "counts": {k: st_counts[k] for k in st_series}, "series": st_series, "regions": {}}
        (STATE_OUT / f"{st}.json").write_text(json.dumps(sdoc, separators=(",", ":")) + "\n")
    print(f"state files: {len(states)} in {STATE_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
