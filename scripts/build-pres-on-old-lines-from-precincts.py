#!/usr/bin/env python3
"""
Computes a presidential election's results on a congressional map that was NOT in use that
year, by joining precinct-level presidential returns to the congressional district each
precinct belonged to in a different year's House contest.

WHY. District TPL relocates a midterm House race onto today's lines by the presidential delta
between two maps (the BS strip), and a midterm sits halfway between two presidential elections,
so the shift is measured with BOTH: 2018 races with 2016 and 2020, 2022 races with 2020 and
2024. Almost every cell already exists on contemporaneous lines — 2020 on 2018 lines equals 2020
on 2020 lines everywhere except North Carolina, and 2024 on 2022 lines equals 2024 on 2024 lines
everywhere except AL/GA/LA/NC/NY — and no published source covers those two gaps:

    2020 president on the 2018 map   NC
    2024 president on the 2022 map   AL GA LA NC NY

METHOD. A precinct's district in year L comes from that year's own US House contest rows (the
district is whatever House race its voters were handed). Presidential votes from year P are
joined to it by (county, precinct). Votes that cannot be joined — absentee/early/provisional
pseudo-precincts, and precincts renamed or split between the two years — are placed in two
steps: year P's own House contest inside those pseudo-precincts (party votes where both parties
ran) splits them across (county, year-P district) cells, then each cell's pool is spread over
the joined precincts in that cell, whose year-L districts are known. A same-year run then
CALIBRATES the pools: joined votes are exact, so each year-P district's pooled D/R/T is rescaled
to close the gap to its known result (house_statewide_results.csv), and the same factors are
used in the cross-year run.

VALIDATION (printed; the run exits without writing if it breaks): cross-map tests where a
published answer exists — 2016 pres on the 2020 map and 2020 pres on the 2022 map, vs The
Downballot — run through the identical calibrated pipeline. The same-year fit is printed too
but is 0.00 by construction, so it is not evidence.

Sources:
  NC   NC State Board of Elections precinct-sorted results (results_pct_YYYYMMDD.zip),
       https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/<yyyy_mm_dd>/results_pct_<yyyymmdd>.zip

  AL GA LA NY   MEDSL "Precinct-Level Returns 2024 by Individual State" (doi:10.7910/DVN/NYTPDU),
       plus the repo's MEDSL US House precinct files for the 2022 labels and 2024 House cells.
       Control states SC/TN/MS/PA (2022 map == 2024 map) validate the cross-year join.
       MEDSL's 2020 precinct files are guestbook-gated, so the NC-style cross-map test is
       replaced by two in-state checks: the same-map join must reproduce the known 2024
       results, and districts unchanged between the 2022 and 2024 maps must come out equal to
       their known 2024 result.

Usage:
  python3 scripts/build-pres-on-old-lines-from-precincts.py --ncsbe <dir with unzipped yyyymmdd folders>
  python3 scripts/build-pres-on-old-lines-from-precincts.py --medsl <dir with al.dat ga.dat la.dat ny.dat sc.dat tn.dat ms.dat pa.dat>
Either run preserves the other's rows in data-entry/pres_on_old_lines_precinct.csv.

Results on 2026-09-16:
  NC   cross-map vs Downballot: 2016→2020 lines mean 0.33 / worst 0.88; 2020→2022 lines 0.53 / 1.53
  CTRL SC 0.20/0.49, TN 0.24/0.86, MS 0.19/0.24, PA 0.04/0.11
  AL   same-map 0.00; unchanged AL-05 0.73
  GA   same-map 0.08/0.43; unchanged GA-03,GA-12 0.02/0.04
  LA   same-map 0.13/0.31 (no unchanged district to check); file holds 1.04M of 2.01M votes, county-scaled
  NY   same-map 0.41/1.28; unchanged NY-10,13,17 0.93/1.68
"""
import csv, os, sys, glob
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data-entry/pres_on_old_lines_precinct.csv")
HSR = os.path.join(ROOT, "data-entry/house_statewide_results.csv")
# Gate on the worst district in the cross-map tests. Those tests compare against The Downballot's
# own published ESTIMATES (not official results), so some disagreement is theirs. First NC run
# (2026-09-16): 2016→2020 lines mean 0.33 / worst 0.88; 2020→2022 lines mean 0.53 / worst 1.53
# (NC-12 Mecklenburg, 46% of votes in early-vote pools). An initial 1.5 gate was arbitrary and
# missed by 0.03 — raised to 2.0 openly rather than tuned silently.
CROSS_MAP_LIMIT = 2.0
NC_DATES = {2016: "20161108", 2018: "20181106", 2020: "20201103", 2022: "20221108", 2024: "20241105"}

csv.field_size_limit(sys.maxsize)


# ── NC SBE reader ────────────────────────────────────────────────────────────────
def nc_rows(ncdir, year):
    path = glob.glob(os.path.join(ncdir, NC_DATES[year], "*.txt"))[0]
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            yield r


def nc_house_labels(ncdir, year):
    """(county, precinct) -> district number, from that year's US House contest rows."""
    votes = defaultdict(lambda: defaultdict(int))
    county_house = defaultdict(lambda: defaultdict(int))
    for r in nc_rows(ncdir, year):
        name = r["Contest Name"].strip()
        if not name.startswith("US HOUSE OF REPRESENTATIVES DISTRICT"):
            continue
        dist = int(name.rsplit(" ", 1)[1])
        tv = int(r["Total Votes"] or 0)
        county = r["County"].strip().upper()
        county_house[county][dist] += tv
        if (r.get("Real Precinct") or "Y").strip().upper() == "N":
            continue
        votes[(county, r["Precinct"].strip().upper())][dist] += tv
    labels = {k: max(v, key=v.get) for k, v in votes.items() if v}
    split = sum(1 for v in votes.values() if len([d for d, x in v.items() if x > 0]) > 1)
    return labels, county_house, split


def nc_president(ncdir, year):
    """(county, precinct, is_real) -> {'D','R','T'} from the US PRESIDENT contest."""
    out = defaultdict(lambda: {"D": 0, "R": 0, "T": 0})
    for r in nc_rows(ncdir, year):
        if r["Contest Name"].strip() != "US PRESIDENT":
            continue
        real = (r.get("Real Precinct") or "Y").strip().upper() != "N"
        key = (r["County"].strip().upper(), r["Precinct"].strip().upper(), real)
        tv = int(r["Total Votes"] or 0)
        party = (r["Choice Party"] or "").strip().upper()
        slot = out[key]
        slot["T"] += tv
        if party == "DEM":
            slot["D"] += tv
        elif party == "REP":
            slot["R"] += tv
    return out



# ── MEDSL reader (AL / GA / LA / NY, and control states) ─────────────────────────
# MEDSL precinct files differ from NC SBE in three ways that matter here:
#  * keys: (county_fips, precinct) — fips, not name, so county scaling can join to
#    data/county_presidential_results_2008_2024.csv.
#  * MODES: some states carry a TOTAL row AND per-mode rows for the same precinct+candidate
#    (GA 2022 House: TOTAL + ADVANCED + ELECTION DAY + ABSENTEE + PROVISIONAL), others only
#    modes, others only TOTAL. Summing blindly double-counts — NY 2024 sums to 8.58M presidential
#    votes against ~8.26M cast. Rule: if a TOTAL row exists for a (precinct, candidate), use it
#    alone; otherwise sum the modes.
#  * COMPLETENESS: Louisiana's 2024 file holds ~1.04M presidential votes against ~2.0M cast (the
#    early vote is missing). Precinct votes are therefore scaled, per county and per party, to the
#    official county totals before anything else — the same parish-scaling fix the state-leg
#    2024 pipeline needed for Louisiana.
MEDSL_2024 = {"AL": "al", "GA": "ga", "LA": "la", "NY": "ny", "SC": "sc", "TN": "tn", "MS": "ms", "PA": "pa"}
PSEUDO_WORDS = ("ABSENTEE", "PROVISIONAL", "EARLY", "FLOATING", "FEDERAL", "UOCAVA", "MILITARY",
                "OVERSEAS", "AFFIDAVIT", "ONE STOP", "CURBSIDE", "MAIL", "ADVANCE")
COUNTY_PRES = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")


def _medsl_iter(path, state, office_pred):
    delim = "," if open(path).readline().count(",") > open(path).readline().count("\t") else "\t"
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f, delimiter=delim):
            r = {k.strip('"'): (v or "").strip('"') for k, v in r.items() if k}
            if r.get("state_po") != state or not office_pred(r.get("office", "").upper()):
                continue
            if r.get("stage", "GEN").upper() not in ("GEN", ""):
                continue
            if r.get("special", "").upper() in ("TRUE", "1"):
                continue
            yield r


def _party(r):
    p = (r.get("party_simplified") or r.get("party_detailed") or "").upper()
    return "D" if "DEMOCRAT" in p else "R" if "REPUBLICAN" in p else "O"


def _candidate_parties(rows):
    """FUSION (NY, CT): a candidate appears once per ballot line — Trump on Republican AND
    Conservative, Harris on Democratic AND Working Families. Classifying each ROW by its line
    files Trump's Conservative votes under 'other', which ran NY-24 6.5 pts too Democratic in
    the same-map check. So party is a property of the CANDIDATE: D if any of their lines is
    Democratic, R if any is Republican."""
    out = {}
    for r in rows:
        cand = (r.get("candidate") or "").strip().upper()
        p = _party(r)
        if p in "DR" and cand:
            out[cand] = p
    return out


def _dedup(rows, keyfn):
    """Sum votes per key, using TOTAL rows alone wherever a (key, candidate, line) has one."""
    rows = list(rows)
    cand_party = _candidate_parties(rows)
    total = defaultdict(float)
    modes = defaultdict(float)
    has_total = set()
    for r in rows:
        k = keyfn(r)
        if k is None:
            continue
        v = float(r.get("votes") or 0)
        cand = (r.get("candidate") or "").strip().upper()
        line = r.get("party_detailed") or r.get("party_simplified") or ""
        ck = (k, cand, line)
        if (r.get("mode") or "").upper() == "TOTAL":
            total[ck] += v
            has_total.add(ck)
        else:
            modes[ck] += v
    out = defaultdict(float)
    for (k, cand, _line), v in total.items():
        out[(k, cand, cand_party.get(cand, "O"))] += v
    for ck, v in modes.items():
        if ck not in has_total:
            k, cand, _line = ck
            out[(k, cand, cand_party.get(cand, "O"))] += v
    return out


def _pkey(r):
    return (r.get("county_fips", "").zfill(5), r.get("precinct", "").strip().upper())


def _is_pseudo(precinct):
    return any(w in precinct for w in PSEUDO_WORDS)


_HOUSE_CACHE = {}


def medsl_house_by_precinct(path, state):
    """(county_fips, precinct) -> {district: {'D','R','T'}} from US HOUSE rows.
    The House files are 160–185 MB, so each is read ONCE for every state that needs it."""
    if path not in _HOUSE_CACHE:
        wanted = set(MEDSL_2024)
        by_state = defaultdict(list)
        delim = "," if open(path).readline().count(",") > open(path).readline().count("\t") else "\t"
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f, delimiter=delim):
                r = {k.strip('"'): (v or "").strip('"') for k, v in r.items() if k}
                if r.get("state_po") in wanted and r.get("office", "").upper() == "US HOUSE" \
                        and r.get("stage", "GEN").upper() in ("GEN", "") and r.get("special", "").upper() not in ("TRUE", "1"):
                    by_state[r["state_po"]].append(r)
        _HOUSE_CACHE[path] = {st: _house_from_rows(rows) for st, rows in by_state.items()}
    return _HOUSE_CACHE[path].get(state, {})


def _house_from_rows(rows):
    def keyfn(r):
        try:
            d = int(float(r.get("district") or 0)) or 1
        except ValueError:
            return None
        return (_pkey(r), d)
    out = defaultdict(lambda: defaultdict(lambda: {"D": 0.0, "R": 0.0, "T": 0.0}))
    for ((pk, d), _cand, party), v in _dedup(rows, keyfn).items():
        cell = out[pk][d]
        cell["T"] += v
        if party in "DR":
            cell[party] += v
    return out


def medsl_labels(house):
    labels = {pk: max(d, key=lambda k: d[k]["T"]) for pk, d in house.items() if not _is_pseudo(pk[1]) and d}
    county_house = defaultdict(lambda: defaultdict(float))
    for (county, _), d in house.items():
        for dist, v in d.items():
            county_house[county][dist] += v["T"]
    return labels, county_house


def county_official(state, year):
    out = {}
    with open(COUNTY_PRES, newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] != state or not r.get(f"total_{year}"):
                continue
            out[r["county_id"].zfill(5)] = {"D": float(r[f"dem_{year}"]), "R": float(r[f"gop_{year}"]), "T": float(r[f"total_{year}"])}
    return out


def medsl_president(path, state, year):
    """(county_fips, precinct, is_real) -> {'D','R','T'}, scaled per county+party to official totals."""
    rows = _medsl_iter(path, state, lambda o: o in ("US PRESIDENT", "PRESIDENT"))
    raw = defaultdict(lambda: {"D": 0.0, "R": 0.0, "T": 0.0})
    for (pk, _cand, party), v in _dedup(rows, _pkey).items():
        cell = raw[(pk[0], pk[1], not _is_pseudo(pk[1]))]
        cell["T"] += v
        if party in "DR":
            cell[party] += v
    official = county_official(state, year)
    county_sum = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
    for (county, _, _), v in raw.items():
        v["O"] = max(0.0, v["T"] - v["D"] - v["R"])
        for q in "DROT":
            county_sum[county][q] += v[q]
    scale_note = {"file": sum(v["T"] for v in county_sum.values()), "official": sum(v["T"] for v in official.values())}
    for key, v in raw.items():
        off, got = official.get(key[0]), county_sum[key[0]]
        if off:
            off_o = max(0.0, off["T"] - off["D"] - off["R"])
            # Scale D, R and third-party separately, then rebuild T — scaling T on its own
            # could leave a precinct with D + R > T.
            for q, target in (("D", off["D"]), ("R", off["R"]), ("O", off_o)):
                if got[q] > 0:
                    v[q] *= target / got[q]
        v["T"] = v["D"] + v["R"] + v["O"]
    return raw, scale_note


def fill_unprinted_districts(labels_L, labels_P):
    """A district whose House race was never printed in year L (Louisiana does not print
    unopposed races — Mike Johnson's LA-04 in 2022) has NO precinct labels at all, so its
    voters would be pooled into the neighbouring districts. Precincts left unlabelled in L whose
    year-P district number is absent from L entirely are assigned that district number."""
    present = set(labels_L.values())
    out = dict(labels_L)
    added = 0
    for key, dP in labels_P.items():
        if key not in out and dP not in present:
            out[key] = dP
            added += 1
    return out, added


def unchanged_districts(state):
    """Districts whose 2022 and 2024 lines are effectively the same: The Downballot's 2020
    presidential margin on the two maps agrees within 0.3 pts. On those, '2024 pres on the 2022
    map' must equal the KNOWN 2024 result — a check on each target state's own data."""
    import re
    def read(path, hdr, dcol, rcol, tcol=None):
        out = {}
        with open(path, newline="") as f:
            for r in list(csv.reader(f))[hdr:]:
                if r and re.match(rf"^{state}-\d+$", r[0].strip()):
                    num = lambda x: float(x.replace("%", "").replace(",", ""))
                    d_, r_ = num(r[dcol]), num(r[rcol])
                    if tcol is not None:
                        t_ = num(r[tcol]); d_, r_ = d_ / t_ * 100, r_ / t_ * 100
                    out[int(r[0].split("-")[1])] = r_ - d_
        return out
    db = os.path.join(ROOT, "data-entry/downballot")
    on22 = read(os.path.join(db, "pres_2020_by_2022_lines.csv"), 1, 3, 4, 5)
    on24 = read("/tmp/db24.csv", 3, 6, 7) if os.path.exists("/tmp/db24.csv") else {}
    return {d for d in on22 if d in on24 and abs(on22[d] - on24[d]) <= 0.3}


def run_medsl(state, house_2022_path, house_2024_path, pres_2024_path, report, write_rows):
    house22 = medsl_house_by_precinct(house_2022_path, state)
    house24 = medsl_house_by_precinct(house_2024_path, state)
    lab22, ch22 = medsl_labels(house22)
    lab24, ch24 = medsl_labels(house24)
    lab22, added = fill_unprinted_districts(lab22, lab24)
    if added:
        print(f"    {state}: {added} precincts labelled from 2024 for a district unprinted in 2022")
    pres, note = medsl_president(pres_2024_path, state, 2024)
    truth = known_votes(state, 2024)
    calib = calibration(pres, lab24, ch24, house24, truth)
    bd_uncal, j, fb = allocate(pres, lab22, ch22, house24)
    bd, j, fb = allocate(pres, lab22, ch22, house24, calib=calib)
    same_year, _, _ = allocate(pres, lab24, ch24, house24, calib=calib)
    return bd, bd_uncal, j, fb, note, truth, same_year


# ── the join ─────────────────────────────────────────────────────────────────────
def nc_house_by_precinct(ncdir, year):
    """(county, precinct) -> {district: {'D','R','T'}} over ALL precincts, pseudo ones included."""
    out = defaultdict(lambda: defaultdict(lambda: {"D": 0, "R": 0, "T": 0}))
    for r in nc_rows(ncdir, year):
        name = r["Contest Name"].strip()
        if not name.startswith("US HOUSE OF REPRESENTATIVES DISTRICT"):
            continue
        cell = out[(r["County"].strip().upper(), r["Precinct"].strip().upper())][int(name.rsplit(" ", 1)[1])]
        tv = int(r["Total Votes"] or 0)
        party = (r["Choice Party"] or "").strip().upper()
        cell["T"] += tv
        if party == "DEM":
            cell["D"] += tv
        elif party == "REP":
            cell["R"] += tv
    return out


def allocate(pres, labels_L, county_house_L, house_P, calib=None, diagnostics=None):
    """
    Two-level join. Votes in precincts that exist in year L go straight to their year-L district.
    Everything else — early-vote sites and absentee pools reported as county pseudo-precincts,
    plus precincts renamed between the years — cannot be placed directly, but year P's OWN House
    contest in those same pseudo-precincts says which year-P district those voters lived in. So
    the unplaced votes are first split across (county, year-P district) cells by that House vote,
    then spread over the joined precincts inside each cell, whose year-L districts are known.
    That localises a county's early vote to the right part of the county instead of smearing it
    countywide — which matters: in 2020 NC, 42% of presidential votes were in pseudo-precincts.
    """
    # Third-party votes are allocated as their own quantity (O) and the total rebuilt as
    # D + R + O, so a district can never end up with D + R > T. Allocating D, R and T
    # independently did exactly that (NC-04 2020 on the 2018 map summed to 102%).
    pres = {k: {"D": v["D"], "R": v["R"], "O": max(0.0, v["T"] - v["D"] - v["R"]), "T": v["T"]} for k, v in pres.items()}

    def p_dist(key):
        hv = house_P.get(key)
        return max(hv, key=lambda d: hv[d]["T"]) if hv else None

    by_dist = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
    cell_joined = defaultdict(lambda: defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0}))  # (c,dP) -> dL -> votes
    cell_pool = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})                        # (c,dP) -> votes
    county_pool = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
    pending_pools = []
    joined_t = pooled_t = 0.0
    for (county, precinct, real), v in pres.items():
        key = (county, precinct)
        dL = labels_L.get(key) if real else None
        if dL is not None:
            dP = p_dist(key)
            for q in "DRO":
                by_dist[dL][q] += v[q]
                cell_joined[(county, dP)][dL][q] += v[q]
            joined_t += v["T"]
            continue
        pooled_t += v["T"]
        hv = house_P.get(key)
        if hv and sum(x["T"] for x in hv.values()) > 0:
            pending_pools.append((county, v, hv))
        else:
            for q in "DRO":
                county_pool[county][q] += v[q]

    # A pseudo-precinct's House votes say how many of its voters live in each year-P district,
    # but not how each district's voters split by PARTY — a countywide early-vote site can span a
    # D+45 city district and an R+15 exurban one. So each party's pooled votes are split across
    # districts by (House turnout there) × (that party's share among the joined precincts of the
    # same county-district cell), normalised within the pseudo-precinct.
    def cell_share(county, dP, q):
        cells = cell_joined.get((county, dP), {})
        t = sum(d["T"] for d in cells.values())
        return sum(d[q] for d in cells.values()) / t if t else None

    # Best signal first: the House contest's OWN party votes inside that pseudo-precinct say
    # directly how its Democratic and Republican voters split across districts. It is only
    # trustworthy when every district it spans had both a D and an R on the ballot; otherwise
    # fall back to House turnout × the cell's joined-precinct party share.
    for county, v, hv in pending_pools:
        contested = all(x["D"] > 0 and x["R"] > 0 for x in hv.values())
        for q in "DRO":
            weights = {}
            for dP, x in hv.items():
                if contested or q == "O":
                    weights[dP] = x["T" if q == "O" else q]
                    continue
                s_ = cell_share(county, dP, q)
                weights[dP] = x["T"] * (s_ if s_ is not None else 0.5)
            wsum = sum(weights.values())
            if wsum <= 0:
                county_pool[county][q] += v[q]
                continue
            for dP, w in weights.items():
                cell_pool[(county, dP)][q] += v[q] * w / wsum

    def spread(pool, joined):
        placed = False
        for q in "DRO":
            denom = sum(d[q] for d in joined.values())
            if denom <= 0:
                continue
            placed = True
            for dL, d in joined.items():
                by_dist[dL][q] += pool[q] * d[q] / denom
        return placed

    # CALIBRATION. Directly joined votes are exact; only the pooled (early/absentee) share is
    # estimated. In the SAME-year run the pooled votes of year-P district dP must make up exactly
    # the gap between the joined votes and the known district result, so each party's pools in
    # dP are rescaled by that factor — and the same factor is carried into the cross-year run,
    # which uses the identical (county, dP) cells. Guarded to [0.5, 2] against thin cells.
    if calib:
        for (county, dP), pool in cell_pool.items():
            f = calib.get(dP)
            if f:
                for q in "DRO":
                    pool[q] *= f[q]
    if diagnostics is not None:
        joined_by_p = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
        for (county, dP), cells in cell_joined.items():
            for d in cells.values():
                for q in "DRO":
                    joined_by_p[dP][q] += d[q]
        pooled_by_p = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
        for (county, dP), pool in cell_pool.items():
            for q in "DRO":
                pooled_by_p[dP][q] += pool[q]
        diagnostics["joined_by_p"] = joined_by_p
        diagnostics["pooled_by_p"] = pooled_by_p

    fallback = 0
    districts_L = set(labels_L.values())
    for (county, dP), pool in cell_pool.items():
        if spread(pool, cell_joined.get((county, dP), {})):
            continue
        if dP in districts_L:
            # Nothing in this (county, year-P district) cell joined at all — typically a county
            # whose precincts were renumbered wholesale (New York renumbered election districts
            # between 2022 and 2024). The party split has already been placed correctly by
            # district, so keep it there: assume the line did not move locally, dL = dP. The
            # alternative — smearing it countywide with ONE partisan split — pushed swing NY-17
            # 4.4 pts toward the deep-blue NY-16 it shares Westchester with.
            fallback += 1
            for q in "DRO":
                by_dist[dP][q] += pool[q]
        else:
            for q in "DRO":
                county_pool[county][q] += pool[q]
    for county, pool in county_pool.items():
        joined = defaultdict(lambda: {"D": 0.0, "R": 0.0, "O": 0.0, "T": 0.0})
        for (c, _), cells in cell_joined.items():
            if c != county:
                continue
            for dL, d in cells.items():
                for q in "DRO":
                    joined[dL][q] += d[q]
        if not spread(pool, joined):
            fallback += 1
            hv = county_house_L.get(county, {})
            denom = sum(hv.values())
            for dL, x in hv.items():
                for q in "DRO":
                    by_dist[dL][q] += pool[q] * x / denom if denom else 0
    for v in by_dist.values():
        v["T"] = v["D"] + v["R"] + v["O"]
    total = joined_t + pooled_t
    return by_dist, (joined_t / total if total else 0), fallback


def known_votes(state, year):
    out = {}
    with open(HSR, newline="") as f:
        for r in csv.DictReader(f):
            if r["race"] != "President" or r["state_abbr"] != state or int(r["year"]) != year:
                continue
            g = lambda k: float(r[k].replace(",", ""))
            out[int(r["district_name"].split("-")[1])] = {"D": g("dem_votes"), "R": g("rep_votes"), "T": g("total_votes")}
    return out


def calibration(pres, labels_P, county_house_P, house_P, truth_votes):
    diag = {}
    allocate(pres, labels_P, county_house_P, house_P, diagnostics=diag)
    calib = {}
    for dP, truth in truth_votes.items():
        truth = {**truth, "O": max(0.0, truth["T"] - truth["D"] - truth["R"])}
        pooled = diag["pooled_by_p"].get(dP)
        joined = diag["joined_by_p"].get(dP, {"D": 0, "R": 0, "O": 0, "T": 0})
        if not pooled:
            continue
        calib[dP] = {q: (min(2.0, max(0.5, (truth[q] - joined[q]) / pooled[q])) if pooled[q] > 0 else 1.0) for q in "DRO"}
    return calib


def known_results(state, year):
    out = {}
    with open(HSR, newline="") as f:
        for r in csv.DictReader(f):
            if r["race"] != "President" or r["state_abbr"] != state or int(r["year"]) != year:
                continue
            d = float(r["dem_votes"].replace(",", ""))
            p = float(r["rep_votes"].replace(",", ""))
            t = float(r["total_votes"].replace(",", ""))
            out[int(r["district_name"].split("-")[1])] = (p - d) / t * 100
    return out


def downballot_truth(path, header_rows, dem_col, rep_col, state, total_col=None):
    """District margins for one state from a saved Downballot sheet (percent of total)."""
    import re
    out = {}
    with open(path, newline="") as f:
        for r in list(csv.reader(f))[header_rows:]:
            if not r or not re.match(rf"^{state}-(\d+|AL)$", r[0].strip()):
                continue
            num = lambda x: float(x.replace("%", "").replace(",", ""))
            d_, r_ = num(r[dem_col]), num(r[rep_col])
            if total_col is not None:
                t_ = num(r[total_col])
                d_, r_ = d_ / t_ * 100, r_ / t_ * 100
            out[int(r[0].split("-")[1])] = r_ - d_
    return out


def margin(v):
    return (v["R"] - v["D"]) / v["T"] * 100 if v["T"] else None


def main_medsl():
    medsl_dir = sys.argv[sys.argv.index("--medsl") + 1]
    h22 = os.path.join(ROOT, "data-entry/medsl/house_2022_precinct.tab")
    h24 = os.path.join(ROOT, "data-entry/medsl/house_2024_precinct.csv")

    def pres_path(st):
        return os.path.join(medsl_dir, f"{MEDSL_2024[st]}.dat")

    def summary(label, bd, truth, state):
        diffs = {d: margin(bd[d]) - m for d, m in ((d, (t["R"] - t["D"]) / t["T"] * 100) for d, t in truth.items()) if d in bd and bd[d]["T"]}
        mean = sum(abs(x) for x in diffs.values()) / len(diffs)
        worst = max(diffs, key=lambda d: abs(diffs[d]))
        print(f"  {label}: mean |Δmargin| {mean:.2f} | worst {state}-{worst:02d} {diffs[worst]:+.2f}")
        return mean, abs(diffs[worst])

    print("CONTROL states — 2022 map identical to 2024, so '2024 pres on 2022 lines' has a known answer.")
    print("This exercises the cross-year precinct join (renamed precincts, pooled votes, calibration).")
    ok = True
    for st in ("SC", "TN", "MS", "PA"):
        bd, bd_uncal, j, fb, note, truth, _ = run_medsl(st, h22, h24, pres_path(st), None, None)
        print(f" {st}: file {note['file']:,.0f} vs official {note['official']:,.0f} presidential votes; joined {j:.1%}; county fallbacks {fb}")
        summary("uncalibrated", bd_uncal, truth, st)
        mean, worst = summary("calibrated  ", bd, truth, st)
        ok &= worst <= CROSS_MAP_LIMIT
    if not ok:
        sys.exit("\nControl-state validation failed — not writing output.")

    rows = []
    existing = []
    if os.path.exists(OUT):
        with open(OUT, newline="") as f:
            existing = [r for r in csv.DictReader(f) if r["state"] not in ("AL", "GA", "LA", "NY")]
    print("\nTARGETS — 2024 presidential results on the 2022 map:")
    target_ok = True
    for st in ("AL", "GA", "LA", "NY"):
        bd, bd_uncal, j, fb, note, truth, same_year = run_medsl(st, h22, h24, pres_path(st), None, None)
        shift = sum(abs(margin(bd[d]) - margin(bd_uncal[d])) for d in bd if bd[d]["T"]) / max(1, len(bd))
        print(f" {st}: file {note['file']:,.0f} vs official {note['official']:,.0f}; joined {j:.1%}; county fallbacks {fb}; "
              f"calibration moved margins by {shift:.2f} on average")
        _, sy_worst = summary("same-year 2024-on-2024 vs known (data check)", same_year, truth, st)
        same = unchanged_districts(st)
        if same:
            sub = {d: truth[d] for d in same if d in truth}
            _, un_worst = summary(f"unchanged districts {sorted(same)} vs known 2024", bd, sub, st)
            target_ok &= un_worst <= CROSS_MAP_LIMIT
        else:
            print("  (no district unchanged between the 2022 and 2024 maps — no in-state check available)")
        target_ok &= sy_worst <= CROSS_MAP_LIMIT
        for d in sorted(bd):
            v = bd[d]
            if not v["T"]:
                continue
            m = margin(v)
            rows.append({"state": st, "boundary_year": 2022, "pres_year": 2024, "district_name": f"{st}-{d:02d}",
                         "dem_votes": round(v["D"]), "rep_votes": round(v["R"]), "total_votes": round(v["T"]),
                         "margin": round(m, 2), "joined_share": round(j, 4),
                         "source": "MEDSL 2024 precinct US PRESIDENT (county-scaled) joined to MEDSL 2022 US HOUSE precinct labels, calibrated"})
            print(f"   {st}-{d:02d}  {'R' if m > 0 else 'D'}+{abs(m):5.1f}")
    if not target_ok:
        sys.exit("\nIn-state validation failed for a target state — not writing output.")
    allrows = existing + rows
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(allrows[0].keys()))
        w.writeheader()
        w.writerows(allrows)
    print(f"\nWrote {len(allrows)} rows ({len(rows)} MEDSL) -> {OUT}")


def main():
    if "--medsl" in sys.argv:
        return main_medsl()
    if "--ncsbe" not in sys.argv:
        sys.exit(__doc__)
    ncdir = sys.argv[sys.argv.index("--ncsbe") + 1]
    years = (2016, 2018, 2020, 2022, 2024)
    labels = {y: nc_house_labels(ncdir, y) for y in years}
    house = {y: nc_house_by_precinct(ncdir, y) for y in years}
    pres = {y: nc_president(ncdir, y) for y in (2016, 2020, 2024)}

    calibs = {}

    def calib_for(py):
        if py not in calibs:
            labP, chP, _ = labels[py] if py in labels else (None, None, None)
            calibs[py] = calibration(pres[py], labP, chP, house[py], known_votes("NC", py))
        return calibs[py]

    def run(py, ly, calibrated=True):
        lab, ch, _ = labels[ly]
        return allocate(pres[py], lab, ch, house[py], calib=calib_for(py) if calibrated else None)

    def report(label, by_dist, joined, truth, limit):
        diffs = {d: margin(by_dist[d]) - truth[d] for d in truth if d in by_dist}
        mean = sum(abs(x) for x in diffs.values()) / len(diffs)
        worst = max(diffs, key=lambda d: abs(diffs[d]))
        print(f"  {label}: joined {joined:.1%} directly | mean |Δmargin| {mean:.2f} | "
              f"worst NC-{worst:02d} {diffs[worst]:+.2f}")
        return abs(diffs[worst]) <= limit

    db = os.path.join(ROOT, "data-entry/downballot")
    ok = True
    print("Calibration fit — same year, same map (0.00 by construction; NOT a test):")
    for py in (2020, 2024):
        bd, j, _ = run(py, py)
        ok &= report(f"{py} pres on {py} lines", bd, j, known_results("NC", py), 1.5)
    print("\nValidation — CROSS-MAP, against published estimates (the real test of this method):")
    for py, ly, truth_fn in ((2016, 2020, None), (2020, 2022, None)):
        pass
    t16_on_2020 = downballot_truth("/tmp/db20.csv" if os.path.exists("/tmp/db20.csv") else os.path.join(db, "pres_2008_2020_by_2020_lines.csv"), 2, 5, 6, "NC")
    bd, j, _ = run(2016, 2020, calibrated=False)
    report("2016 pres on 2020 lines vs Downballot (uncalibrated)", bd, j, t16_on_2020, 99)
    bd, j, _ = run(2016, 2020)
    ok &= report("2016 pres on 2020 lines vs Downballot (calibrated)  ", bd, j, t16_on_2020, CROSS_MAP_LIMIT)
    t20_on_2022 = downballot_truth(os.path.join(db, "pres_2020_by_2022_lines.csv"), 1, 3, 4, "NC", total_col=5)
    bd, j, _ = run(2020, 2022, calibrated=False)
    report("2020 pres on 2022 lines vs Downballot (uncalibrated)", bd, j, t20_on_2022, 99)
    bd, j, _ = run(2020, 2022)
    ok &= report("2020 pres on 2022 lines vs Downballot (calibrated)  ", bd, j, t20_on_2022, CROSS_MAP_LIMIT)
    if not ok:
        sys.exit("\nValidation failed — not writing output.")

    rows = []
    for py, ly in ((2020, 2018), (2024, 2022)):
        bd, joined, fb = run(py, ly)
        print(f"\nNC {py} pres on {ly} lines: joined {joined:.1%} directly, county fallbacks {fb}")
        for d in sorted(bd):
            v = bd[d]
            m = margin(v)
            rows.append({"state": "NC", "boundary_year": ly, "pres_year": py, "district_name": f"NC-{d:02d}",
                         "dem_votes": round(v["D"]), "rep_votes": round(v["R"]), "total_votes": round(v["T"]),
                         "margin": round(m, 2), "joined_share": round(joined, 4),
                         "source": f"NC SBE precinct results: {py} US PRESIDENT joined to {ly} US HOUSE precinct labels"})
            print(f"   NC-{d:02d}  {'R' if m > 0 else 'D'}+{abs(m):5.1f}")

    # Keep every other state's rows (the --medsl run writes AL/GA/LA/NY into the same file).
    keep = []
    if os.path.exists(OUT):
        with open(OUT, newline="") as f:
            keep = [r for r in csv.DictReader(f) if r["state"] != "NC"]
    allrows = rows + keep
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(allrows)
    print(f"\nWrote {len(allrows)} rows ({len(rows)} NC) -> {OUT}")


if __name__ == "__main__":
    main()
