#!/usr/bin/env python3
"""Repair district-by-county U.S. House rows (data-entry/house_district_county_results.csv) from precinct returns.

The site's certified district totals (house_past_results.csv) are right for these contests; its county
breakdown was not: New Hampshire 2016 (both districts, the precinct file of the time had no county codes),
Missouri's 5th in 2016 (Kansas City's election board was missing) and Illinois 3, 4 and 6 in 2022 (no rows).
Later additions: California's 24th in 2016, seven New Jersey districts and New York's 25th in 2024 (2024 from the
Redistricting Data Hub precinct file). Each is rebuilt here from precinct returns summed by county, and written ONLY when the district's
rows add up to the certified total for both parties within 0.1% and every precinct row has a county.

The rows as they stood at the 2026 forecast lock go to data-entry/house_district_county_results_locked2026.csv,
which lib/locked2026HouseDistrictCounty.ts lays back over the file for the frozen model.

  python3 scripts/precincts/correct_site_house_counties.py --report | --write
"""
from __future__ import annotations

import csv
import sys
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
import build_results_medsl as M  # noqa: E402
import build_results_vest as V  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data-entry" / "house_district_county_results.csv"
LOCKED = ROOT / "data-entry" / "house_district_county_results_locked2026.csv"
TARGETS = [(2016, "NH", "1"), (2016, "NH", "2"), (2016, "MO", "5"), (2022, "IL", "3"), (2022, "IL", "4"), (2022, "IL", "6"),
           # added after the --survey of every district off its certified total: the ones the precinct returns rebuild exactly
           (2016, "CA", "24"), (2024, "NJ", "3"), (2024, "NJ", "5"), (2024, "NJ", "7"), (2024, "NJ", "8"), (2024, "NJ", "9"), (2024, "NJ", "10"),
           (2024, "NJ", "12"), (2024, "NY", "25")]
TOL = 0.001


def county_rows(year: int, st: str) -> dict[str, dict[str, list[int]]]:
    """district → county fips → [dem, gop, other], from the precinct source's own rows."""
    df = M.load_medsl(st, year)
    df["comp"] = M.slot_table(df)
    county = df["county"].copy()
    if (county[df["office"] == "USH"] == "").any():  # no county codes in the source: the county of the precinct each row was matched to
        old = V.load_old(st, year)
        vcounty = M.county_of(old, st)
        vsig, _ = M.vest_signature(old, year)
        mk2oid = M.match(df, df["comp"], old, vcounty, vsig, st)[0]
        oid = mk2oid[df["mk"].to_numpy()]
        vc = vcounty.to_numpy()
        county = county.where(county != "", [vc[i] if i >= 0 else "" for i in oid])
    # MEDSL files Kansas City's election board under its own code; the board covers the city's Jackson County part.
    county = county.replace({"29380": "29095"})
    u = df[df["office"] == "USH"].assign(county=county)
    out: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
    for (d, c, comp), v in u.groupby(["district", "county", "comp"])["votes"].sum().items():
        out[M.district_key(d)][c][int(comp)] += int(v)
    return out


def county_rows_2024(st: str) -> dict[str, dict[str, list[int]]]:
    """2024: from the Redistricting Data Hub precinct file (each precinct carries its county). Candidate columns name
    their district (New Jersey, Texas); New York and Wisconsin carry party totals and a district field per precinct."""
    import pandas as pd
    import pyogrio
    df = pyogrio.read_dataframe(B.rdh_layer(st), read_geometry=False)
    up = {c.upper(): c for c in df.columns}
    fips = V.B_FIPS[st] + pd.to_numeric(df[up["COUNTYFP"]], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(3)
    out: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))

    def add(d: str, dv: pd.Series, rv: pd.Series, ov: pd.Series) -> None:
        for c, a, b_, o in zip(fips, dv, rv, ov):
            if a or b_ or o:
                x = out[d][c]
                x[0] += int(round(a)); x[1] += int(round(b_)); x[2] += int(round(o))

    if st in ("NY", "WI"):
        dist = pd.to_numeric(df[up["CONGRESS" if st == "NY" else "CONG_DIST"]], errors="coerce").fillna(0).astype(int).astype(str)
        num = lambda c: pd.to_numeric(df[up[c]], errors="coerce").fillna(0)  # noqa: E731
        dv, rv = (num("G24COND"), num("G24CONR")) if st == "NY" else (num("USHDEM24"), num("USHREP24"))
        ov = num("G24CONO") if st == "NY" else num("USHTOT24") - dv - rv
        for d in sorted(set(dist)):
            m = dist == d
            for c, a, b_, o in zip(fips[m], dv[m], rv[m], ov[m]):
                if a or b_ or o:
                    x = out[d][c]
                    x[0] += int(round(a)); x[1] += int(round(b_)); x[2] += int(round(o))
        return out
    contests: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for c in df.columns:
        k = B.classify(st, c)
        if k and k[0] == "USH":
            contests[k[1]].append((c, k[2]))
    for d, cs in contests.items():
        v = df[[c for c, _ in cs]].apply(pd.to_numeric, errors="coerce").fillna(0)
        dc, rc = B.slot_columns([(c, p_, int(v[c].sum())) for c, p_ in cs])
        dv = v[dc] if dc else v.sum(axis=1) * 0
        rv = v[rc] if rc else v.sum(axis=1) * 0
        add(str(int(d)), dv, rv, v.sum(axis=1) - dv - rv)
    return out


def survey() -> None:
    """--survey: every district-year whose county rows differ from the certified total by more than 0.5%, with what
    the precinct returns would give. Nothing is written."""
    certified = B.house_certified()
    site: dict[tuple[int, str, str], list] = defaultdict(lambda: [0, 0, set(), set()])
    with open(OUT, newline="") as f:
        for r in csv.DictReader(f):
            k = (int(r["year"]), r["state"], r["district"])
            site[k][0] += B._num(r["dem"]); site[k][1] += B._num(r["gop"]); site[k][2].add(r["source"]); site[k][3].add(r["status"])
    off = [k for k, (cd, cr) in certified.items() if abs(site[k][0] - cd) + abs(site[k][1] - cr) > 0.005 * max(1, cd + cr)]
    cache: dict[tuple[int, str], dict | None] = {}
    for year, st, d in sorted(off):
        cd, cr = certified[(year, st, d)]
        if (year, st) not in cache:
            try:
                cache[(year, st)] = county_rows_2024(st) if year == 2024 else county_rows(year, st)
            except Exception as e:  # no precinct file for that state-year in this layout
                cache[(year, st)] = None
        rows_ = cache[(year, st)]
        got = (rows_ or {}).get(d, {})
        sd, sr = sum(v[0] for v in got.values()), sum(v[1] for v in got.values())
        nocounty = sum(sum(v) for c, v in got.items() if not c)
        verdict = "no precinct file" if rows_ is None else "no rows" if not got else "EXACT" if abs(sd - cd) <= TOL * max(cd, 1) and abs(sr - cr) <= TOL * max(cr, 1) and nocounty == 0 else f"precinct off {sd - cd:+,} / {sr - cr:+,}" + (f", {nocounty:,} without county" if nocounty else "")
        s_ = site[(year, st, d)]
        print(f"{year} {st}-{d:>2}: certified {cd:>7,} / {cr:>7,} | site rows {s_[0] - cd:+8,} / {s_[1] - cr:+8,} ({','.join(sorted(s_[2])) or 'none'}; {','.join(sorted(s_[3])) or '-'}) | {verdict}", flush=True)


def main() -> None:
    if "--survey" in sys.argv:
        survey()
        return
    write = "--write" in sys.argv
    certified = B.house_certified()
    with open(OUT, newline="") as f:
        rows = list(csv.DictReader(f))
        fields = list(rows[0].keys())
    names = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            names[r["county_id"].zfill(5)] = r["county_name"].replace(" County", "")
    # geometry / split flags of a (state, district, county) piece from any year on the same map
    flags = {(r["state"], r["district"], r["county_fips"], int(r["year"]) >= 2022): (r["geometry"], r["split"]) for r in rows}
    cache: dict[tuple[int, str], dict] = {}
    done, fresh, locked_rows, new_rows = [], [], [], []
    for year, st, d in TARGETS:
        if (year, st) not in cache:
            cache[(year, st)] = county_rows_2024(st) if year == 2024 else county_rows(year, st)
        got = cache[(year, st)].get(d, {})
        cd, cr = certified[(year, st, d)]
        sd, sr = sum(v[0] for v in got.values()), sum(v[1] for v in got.values())
        nocounty = sum(sum(v) for c, v in got.items() if not c)
        ok = abs(sd - cd) <= TOL * max(cd, 1) and abs(sr - cr) <= TOL * max(cr, 1) and nocounty == 0
        old = [r for r in rows if r["year"] == str(year) and r["state"] == st and r["district"] == d]
        print(f"{year} {st}-{d}: certified {cd:,} / {cr:,}; precinct sum {sd:,} / {sr:,}; site rows {sum(B._num(r['dem']) for r in old):,} / {sum(B._num(r['gop']) for r in old):,} "
              f"in {len(old)} counties; new rows in {len(got)} counties; votes with no county {nocounty:,} → {'OK' if ok else 'NOT WRITTEN'}")
        if not ok:
            continue
        others = defaultdict(set)
        for r in rows:
            if r["year"] == str(year) and r["state"] == st:
                others[r["county_fips"]].add(r["district"])
        for c, v in sorted(got.items()):
            if sum(v) == 0:
                continue
            geometry, split = flags.get((st, d, c, year >= 2022), ("yes", "yes" if len(others[c] | {d}) > 1 or len([1 for (yy, ss), cc in cache.items() if (yy, ss) == (year, st) for dd in cc if c in cc[dd] and sum(cc[dd][c]) > 0]) > 1 else "no"))
            new_rows.append({"year": str(year), "state": st, "district": d, "county_fips": c, "county_name": names.get(c, c), "dem": str(v[0]), "gop": str(v[1]), "oth": str(v[2]),
                             "total": str(sum(v)), "source": "precinct", "status": "exact", "geometry": geometry, "split": split})
            print(f"    {c} {names.get(c, c):14s} {v[0]:>8,} {v[1]:>8,} {v[2]:>7,}")
        if not (LOCKED.exists() and any(l.startswith(f"{year},{st},{d},") for l in LOCKED.read_text().splitlines())):
            locked_rows += old  # first run only: after that the file already holds the repaired rows
            fresh.append((str(year), st, d))
        done.append((str(year), st, d))
    if write and done:
        keep = [r for r in rows if (r["year"], r["state"], r["district"]) not in done]
        allrows = sorted(keep + new_rows, key=lambda r: (int(r["year"]), r["state"], int(r["district"]), r["county_fips"]))
        with open(OUT, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, lineterminator="\r\n")  # the generator's own line ending
            w.writeheader()
            w.writerows(allrows)
        # the generator's own input for these districts, so a later full rebuild of the file keeps them
        with open(ROOT / "data-entry" / "house_district_county_precinct.csv", "w", newline="") as f:
            cols = ["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total"]
            w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n", extrasaction="ignore")
            w.writeheader()
            w.writerows(new_rows)
        prior = []
        if LOCKED.exists():
            with open(LOCKED, newline="") as f:
                prior = [r for r in csv.DictReader(f) if (r["year"], r["state"], r["district"]) not in fresh]
        with open(LOCKED, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
            w.writeheader()
            w.writerows(prior + locked_rows)
            # a district with no rows at the lock is recorded by one marker row, so the overlay knows to drop today's rows
            for y, st, d in fresh:
                if not any((r["year"], r["state"], r["district"]) == (y, st, d) for r in locked_rows):
                    w.writerow({**{k: "" for k in fields}, "year": y, "state": st, "district": d, "status": "absent"})
        print(f"written: {len(new_rows)} rows for {len(done)} districts; {len(locked_rows)} rows kept for the lock")


if __name__ == "__main__":
    main()
