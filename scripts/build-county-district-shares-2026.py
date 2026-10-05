#!/usr/bin/env python3
"""
How each county splits across the 2026 U.S. House districts — the allocation the 2026 turnout
estimate on /analysis/turnout uses to turn county-level projections into district totals.
Writes data-entry/county_district_shares_2026.csv (state, district race id, county FIPS, share of
the county's electorate in that district, basis).

Two bases:
  pieces2024   states whose 2026 lines are the 2024 lines: the share is the county piece's share
               of the county's 2024 House votes (data-entry/house_district_county_results.csv,
               exact official counts). A county whose 2024 pieces recorded no votes (an unopposed
               Florida/Oklahoma seat) falls back to tracts.
  tracts       the states that redrew for 2026 (AL CA FL LA NC OH TN TX UT, the same list
               scripts/build-cd-demographics-2026-lines.py uses): every 2020 census tract is
               placed in a 2026 district by its internal point with that script's two-pass method
               (Census 119th lines for districts the redraw kept, the site's 2026 boundary file for
               the rest), and the share is the tract-summed CVAP (ACS 2020-24 B05003) in the
               district over the county's tract-summed CVAP. Shares under 0.5% are dropped and the
               rest renormalised: the site's 2026 file is simplified to a few dozen vertices per
               district, and a sliver that small is almost always a border tract on the wrong side.

Requires CENSUS_API_KEY, shapely and mapshaper (both already used by the demographics script).
Tract pulls and boundary conversions are cached in the OS temp dir. Run from project root:
  python3 scripts/build-county-district-shares-2026.py
"""
import csv, importlib.util, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/county_district_shares_2026.csv")
PIECES = os.path.join(ROOT, "data-entry/house_district_county_results.csv")
MIN_SHARE = 0.005

spec = importlib.util.spec_from_file_location("cd2026", os.path.join(ROOT, "scripts/build-cd-demographics-2026-lines.py"))
cd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cd)

CVAP_VARS = ["B05003_008E", "B05003_012E", "B05003_019E", "B05003_023E"]


def fetch_tract_cvap(state_fips, key):
    path = os.path.join(cd.CACHE, f"tracts_cvap_{cd.VINTAGE}_{state_fips}.json")
    if os.path.exists(path):
        return json.load(open(path))
    params = {"get": ",".join(CVAP_VARS), "for": "tract:*", "in": f"state:{state_fips}", "key": key}
    url = f"{cd.BASE}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=180) as resp:
                data = json.load(resp)
            break
        except (OSError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise SystemExit(f"Census API failed for state {state_fips}: {e}")
            time.sleep(2 + 3 * attempt)
    json.dump(data, open(path, "w"))
    return data


def main():
    os.makedirs(cd.CACHE, exist_ok=True)
    key = cd.load_env_key()
    redrawn = set(cd.redrawn_states())
    fips_by_abbr = {v: k for k, v in cd.ABBR_BY_FIPS.items()}
    print("redrawn:", " ".join(sorted(cd.ABBR_BY_FIPS[s] for s in redrawn)))

    out = []  # (state, district, county_fips, share, basis)

    # ── pieces2024 for unchanged states ──
    by_county = {}
    for r in csv.DictReader(open(PIECES)):
        if r["year"] != "2024" or r["status"] == "missing":
            continue
        st = fips_by_abbr[r["state"]]
        if st in redrawn:
            continue
        d = st + r["district"].zfill(2)
        by_county.setdefault((st, r["county_fips"]), []).append((d, float(r["total"] or 0)))
    tract_fallback = set()
    for (st, fips), pieces in by_county.items():
        tot = sum(t for _, t in pieces)
        if tot <= 0:
            tract_fallback.add(fips)
            continue
        if len(pieces) == 1:
            out.append((st, pieces[0][0], fips, 1.0, "pieces2024"))
            continue
        for d, t in pieces:
            if t / tot >= MIN_SHARE:
                out.append((st, d, fips, t / tot, "pieces2024"))
    if tract_fallback:
        print("counties with no 2024 votes in any piece, falling back to tracts:", sorted(tract_fallback))

    # ── tracts for redrawn states (and the fallback counties) ──
    need_states = redrawn | {f[:2] for f in tract_fallback}
    gaz = cd.load_gazetteer()
    districts = cd.load_districts(need_states)
    precise = cd.load_districts(need_states, cd.load_cd119())
    old_tot = {r["district_id"].zfill(4): int(r["total_votes"]) for r in csv.DictReader(open(cd.PRES_OLD)) if r["boundary_year"] == "2024" and r["pres_year"] == "2024"}
    new_tot = {r["district_id"].zfill(4): int(r["pres24_total"]) for r in csv.DictReader(open(cd.PRES_NEW))}
    unchanged = {k for k in new_tot if k[:2] in need_states and k in old_tot and abs(old_tot[k] - new_tot[k]) <= 0.001 * old_tot[k]}

    for st in sorted(need_states):
        data = fetch_tract_cvap(st, key)
        header, rows = data[0], data[1:]
        col = {h: i for i, h in enumerate(header)}
        pts = {}
        for r in rows:
            geoid = r[col["state"]] + r[col["county"]] + r[col["tract"]]
            if geoid in gaz:
                pts[geoid] = gaz[geoid]
        if st in redrawn:
            placed, _ = cd.assign(pts, [d for d in precise[st] if d[0] in unchanged], fallback_nearest=False)
            rest = {g: p for g, p in pts.items() if g not in placed}
            placed_rest, nearest = cd.assign(rest, [d for d in districts[st] if d[0] not in unchanged] or districts[st])
            placed.update(placed_rest)
        else:
            # Unchanged state: the Census 119th lines are exact.
            placed, nearest = cd.assign(pts, precise[st])
        sums = {}
        for r in rows:
            geoid = r[col["state"]] + r[col["county"]] + r[col["tract"]]
            if geoid not in placed:
                continue
            v = [max(0.0, float(r[col[x]] or 0)) for x in CVAP_VARS]
            cvap = v[0] + v[2] - v[1] - v[3]
            fips = geoid[:5]
            sums.setdefault(fips, {})
            sums[fips][placed[geoid]] = sums[fips].get(placed[geoid], 0.0) + cvap
        n_split = 0
        for fips, per_d in sums.items():
            if st not in redrawn and fips not in tract_fallback:
                continue
            tot = sum(per_d.values())
            if tot <= 0:
                # Uninhabited county (no CVAP): give it to the district with the most tracts.
                best = max(per_d, key=per_d.get)
                out.append((st, best, fips, 1.0, "tracts"))
                continue
            kept = {d: c for d, c in per_d.items() if c / tot >= MIN_SHARE}
            ktot = sum(kept.values())
            if len(kept) > 1:
                n_split += 1
            for d, c in kept.items():
                out.append((st, d, fips, c / ktot, "tracts"))
        print(f"  {cd.ABBR_BY_FIPS[st]}: {len(rows)} tracts, {nearest} placed by nearest district, {n_split} split counties")

    out.sort(key=lambda r: (r[0], r[2], r[1]))
    with open(DST, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["state", "district", "county_fips", "share", "basis"])
        for st, d, fips, share, basis in out:
            w.writerow([cd.ABBR_BY_FIPS[st], d, fips, f"{share:.5f}", basis])
    print(f"wrote {len(out)} rows to {DST}")
    # Check: every 2026 House race id should appear.
    src = open(cd.FORECAST_SRC).read()
    i = src.index("export const houseData"); j = src.index("\n];", i)
    import re
    ids = set(re.findall(r'"id": "(\d{4})"', src[i:j]))
    have = {d for _, d, _, _, _ in out}
    print("2026 districts with no county share:", sorted(ids - have) or "none")
    print("shares for unknown districts:", sorted(have - ids) or "none")


if __name__ == "__main__":
    main()
