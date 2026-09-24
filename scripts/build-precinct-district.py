#!/usr/bin/env python3
"""
Build the data layer for one precinct-district analysis page.

    python3 scripts/build-precinct-district.py <slug>          # e.g. oh-hd-31

Reads   data-entry/precinct-districts/<slug>/district.json      hand-authored config
        data-entry/precinct-districts/<slug>/<year>.csv          one precinct CSV per election year
        data-entry/precinct-districts/<slug>/geo/*.geojson       one precinct geography per boundary era
                                                                 (+ the demographics layer, keyed by current-era precinct)
Writes  data/precinct-districts/<slug>/district.json             config as the page needs it + derived facts
        data/precinct-districts/<slug>/results.json              long-format results, one row per precinct-year
        data/precinct-districts/<slug>/demographics.json         current-era precinct -> demographic fields
        data/precinct-districts/<slug>/crosswalk.json            older era -> current era population weights
        public/precinct-districts/<slug>/precincts-<era>.geojson geometry with {id, subdivision} only

The crosswalk is block-population weighted: every 2020 census block (TIGER/Line PL file for the
district's county, POP20) is assigned to the older-era precinct and the current-era precinct its
representative point falls in; an older precinct's votes are then spread over current precincts in
proportion to the 2020 population it shares with each. Older precincts with no populated block fall
back to area weights. Subdivision (township / city) totals are never crosswalked - they are exact.
"""

import io
import json
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
EQUAL_AREA_CRS = 3734  # NAD83 / Ohio North (ftUS) - fine for area shares in a single county


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def to_int(v) -> int:
    try:
        return int(float(str(v).replace(",", "").strip() or 0))
    except ValueError:
        return 0


def round_coords(obj, nd=6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


def main() -> None:
    if len(sys.argv) < 2:
        die("usage: build-precinct-district.py <slug>")
    slug = sys.argv[1]
    src = ROOT / "data-entry" / "precinct-districts" / slug
    out_data = ROOT / "data" / "precinct-districts" / slug
    out_pub = ROOT / "public" / "precinct-districts" / slug
    cache = ROOT / "data-entry" / "precinct-districts" / ".cache"
    for p in (out_data, out_pub, cache):
        p.mkdir(parents=True, exist_ok=True)

    cfg = json.loads((src / "district.json").read_text())
    subdivisions = {s["id"]: s for s in cfg["subdivisions"]}
    aliases = {k.lower(): v for k, v in cfg.get("subdivisionAliases", {}).items()}
    prefixes = cfg.get("subdivisionByPrecinctPrefix", {})
    eras = {e["id"]: e for e in cfg["eras"]}
    current_era = next(e for e in cfg["eras"] if e.get("current"))

    def subdivision_for(raw: str, precinct: str) -> str:
        for prefix, sid in prefixes.items():
            if precinct.startswith(prefix):
                return sid
        sid = aliases.get(raw.strip().lower())
        if sid is None:
            die(f"unknown subdivision '{raw}' (precinct {precinct}); add it to subdivisionAliases")
        return sid

    # ── 1. Results ────────────────────────────────────────────────────────────
    years_out: dict[str, dict] = {}
    era_precincts: dict[str, dict[str, str]] = defaultdict(dict)  # era -> precinct id -> subdivision
    for year, ycfg in sorted(cfg["years"].items()):
        df = pd.read_csv(src / ycfg["file"], dtype=str).fillna("")
        cols = ycfg["columns"]
        dprefix = ycfg.get("districtPrefix", {})
        fixed = ycfg.get("fixedDistricts", {})
        rows = []
        seen = set()
        for _, r in df.iterrows():
            pid = str(r[cols["precinct"]]).strip().upper()
            if not pid:
                continue
            if pid in seen:
                die(f"{year}: duplicate precinct {pid}")
            seen.add(pid)
            sid = subdivision_for(str(r[cols["subdivision"]]), pid)
            races = {}
            for office, rc in ycfg["races"].items():
                d, rr = to_int(r[rc["d"]]), to_int(r[rc["r"]])
                total = to_int(r[rc["total"]]) if rc.get("total") and rc["total"] in r else d + rr
                race = {"d": d, "r": rr, "t": max(total, d + rr)}
                if office in fixed:
                    race["dist"] = fixed[office]
                elif rc.get("district"):
                    lab = str(r[rc["district"]]).strip()
                    if lab:
                        race["dist"] = f"{dprefix.get(office, '')}{lab}"
                races[office] = race
            rows.append({
                "id": pid,
                "sub": sid,
                "reg": to_int(r[cols["registered"]]),
                "ballots": to_int(r[cols["ballots"]]),
                "races": races,
            })
            era_precincts[ycfg["era"]][pid] = sid
        # per-office metadata: label, candidates, district composition
        cands = cfg.get("candidates", {}).get(year, {})
        offices = {}
        for office in ycfg["races"]:
            meta = dict(cfg["offices"][office])
            comp = defaultdict(int)
            for row in rows:
                dist = row["races"][office].get("dist")
                if dist:
                    comp[dist] += 1
            c = cands.get(office)
            if comp:
                meta["districts"] = {k: {"precincts": v, **(c.get(k, {}) if isinstance(c, dict) and k in c else {})}
                                     for k, v in sorted(comp.items())}
                if len(comp) == 1 and isinstance(c, dict):
                    only = next(iter(comp))
                    meta.update({k: v for k, v in c.get(only, {}).items()})
            elif isinstance(c, dict):
                meta.update(c)
            offices[office] = meta
        years_out[year] = {"era": ycfg["era"], "offices": offices, "precincts": rows}
        print(f"  {year}: {len(rows)} precincts, offices {list(ycfg['races'])}")

    # ── 2. Geography per era ─────────────────────────────────────────────────
    era_gdfs: dict[str, gpd.GeoDataFrame] = {}
    era_counts = {}
    for era_id, era in eras.items():
        g = gpd.read_file(src / era["geography"]["file"])
        idp = era["geography"]["idProperty"]
        g["id"] = g[idp].astype(str).str.strip().str.upper()
        wanted = era_precincts[era_id]
        missing = sorted(set(wanted) - set(g["id"]))
        if missing:
            die(f"era {era_id}: {len(missing)} precincts in the CSVs have no polygon: {missing[:8]}")
        g = g[g["id"].isin(wanted)].copy()
        g["subdivision"] = g["id"].map(wanted)
        if g["id"].duplicated().any():
            g = g.dissolve(by="id", as_index=False, aggfunc={"subdivision": "first"})
        g = g[["id", "subdivision", "geometry"]].to_crs(4326)
        era_gdfs[era_id] = g
        era_counts[era_id] = len(g)
        def write_layer(gdf: gpd.GeoDataFrame, name: str) -> None:
            fc = json.loads(gdf.to_json())
            for f in fc["features"]:
                f["geometry"]["coordinates"] = round_coords(f["geometry"]["coordinates"])
                f.pop("id", None)
            (out_pub / f"{name}-{era_id}.geojson").write_text(json.dumps(fc, separators=(",", ":")))

        write_layer(g, "precincts")
        # Precincts dissolved into their subdivision, so the Areas view of the map draws township
        # and city outlines instead of precinct ones. Keyed by "id" like the precinct layer so the
        # page reads both the same way.
        sub = g.dissolve(by="subdivision", as_index=False)
        # repair only what needs repairing: a valid dissolve is exact, and buffer(0) on lat/lon
        # geometry would otherwise be a silent no-op at best and a distortion at worst
        sub["geometry"] = sub.geometry.apply(lambda geom: geom if geom.is_valid else geom.buffer(0))
        sub["id"] = sub["subdivision"]
        write_layer(sub[["id", "subdivision", "geometry"]], "subdivisions")
        print(f"  geography {era_id}: {len(g)} precinct polygons, {len(sub)} subdivision polygons -> public/precinct-districts/{slug}/")

    # ── 3. Demographics (current era) ─────────────────────────────────────────
    dcfg = cfg["demographics"]
    dg = gpd.read_file(src / dcfg["file"])
    dg["id"] = dg[dcfg["idProperty"]].astype(str).str.strip().str.upper()
    keep = ["total_pop", "age_under18", "age_18_34", "age_35_64", "age_65plus",
            "pop_white", "pop_black", "pop_hispanic", "pop_asian",
            "pct_white", "pct_black", "pct_hispanic", "pct_asian", "pct_native", "pct_multi",
            "med_hh_income", "pct_bachelors_plus", "pct_no_hs_diploma", "pct_some_college"]
    demo = {}
    for _, r in dg.iterrows():
        if r["id"] not in era_precincts[dcfg["era"]]:
            continue
        rec = {}
        for k in keep:
            if k in dg.columns and pd.notna(r[k]):
                v = float(r[k])
                if k.startswith("pct_"):
                    v = min(100.0, max(0.0, v))  # source shares occasionally exceed 100 (CVAP-based numerators)
                rec[k] = int(v) if k.startswith(("total_", "age_", "pop_")) else round(v, 2)
        demo[r["id"]] = rec
    missing_demo = sorted(set(era_precincts[dcfg["era"]]) - set(demo))
    if missing_demo:
        print(f"  WARNING: {len(missing_demo)} current precincts lack demographics: {missing_demo[:6]}")
    (out_data / "demographics.json").write_text(json.dumps({"era": dcfg["era"], "source": dcfg.get("source"), "precincts": demo}, indent=1))
    print(f"  demographics: {len(demo)} precincts")

    # ── 4. Crosswalk: each older era -> current era ──────────────────────────
    xcfg = cfg["crosswalk"]
    bcfg = xcfg["blocks"]
    zip_path = cache / Path(bcfg["url"]).name
    if not zip_path.exists():
        print(f"  downloading {bcfg['url']} ...")
        urllib.request.urlretrieve(bcfg["url"], zip_path)
    with zipfile.ZipFile(zip_path) as z:
        shp = next(n for n in z.namelist() if n.endswith(".shp"))
    blocks = gpd.read_file(f"zip://{zip_path}!{shp}")
    # Block populations come from the 2020 PL API (the PL TIGER geometry carries no counts).
    # Needs CENSUS_API_KEY in .env.local; the response is cached next to the geometry.
    pcfg = bcfg["population"]
    pop_path = cache / f"pl2020_blocks_{pcfg['state']}{pcfg['county']}.json"
    if not pop_path.exists():
        key = ""
        env = ROOT / ".env.local"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("CENSUS_API_KEY="):
                    key = line.split("=", 1)[1].strip()
        if not key:
            die("CENSUS_API_KEY missing from .env.local (needed once to fetch block populations)")
        url = f"{pcfg['api']}?get={pcfg['variable']}&for=block:*&in=state:{pcfg['state']}%20county:{pcfg['county']}&key={key}"
        print(f"  fetching block populations from {pcfg['api']} ...")
        with urllib.request.urlopen(url) as resp:
            pop_path.write_bytes(resp.read())
    rows = json.loads(pop_path.read_text())
    hdr = rows[0]
    iv, ist, ico, itr, ibl = (hdr.index(k) for k in (pcfg["variable"], "state", "county", "tract", "block"))
    pop_by_geoid = {f"{r[ist]}{r[ico]}{r[itr]}{r[ibl]}": to_int(r[iv]) for r in rows[1:]}
    blocks["pop"] = blocks["GEOID20"].map(pop_by_geoid).fillna(0).astype(int)
    if blocks["pop"].sum() == 0:
        die("block populations did not join to the block geometry (GEOID20 mismatch)")
    cur = era_gdfs[current_era["id"]].to_crs(EQUAL_AREA_CRS)
    blocks = blocks.to_crs(EQUAL_AREA_CRS)
    minx, miny, maxx, maxy = cur.total_bounds
    blocks = blocks.cx[minx - 5000: maxx + 5000, miny - 5000: maxy + 5000].copy()
    pts = blocks.copy()
    pts["geometry"] = blocks.representative_point()
    cur_join = gpd.sjoin(pts[["GEOID20", "pop", "geometry"]], cur[["id", "geometry"]], how="inner", predicate="within").rename(columns={"id": "new"})
    cur_join = cur_join[["GEOID20", "pop", "new"]]

    crosswalk = {"to": current_era["id"], "method": xcfg["method"], "blocks": bcfg["label"], "eras": {}}
    new_sub = dict(zip(cur["id"], cur["subdivision"]))
    for era_id, g in era_gdfs.items():
        if era_id == current_era["id"]:
            continue
        old = g.to_crs(EQUAL_AREA_CRS)
        old_sub = dict(zip(old["id"], old["subdivision"]))
        old_join = gpd.sjoin(pts[["GEOID20", "pop", "geometry"]], old[["id", "geometry"]], how="inner", predicate="within").rename(columns={"id": "old"})[["GEOID20", "old"]]
        both = old_join.merge(cur_join, on="GEOID20", how="left")
        forward: dict[str, list] = {}
        coverage: dict[str, float] = {}
        fallback: list[str] = []
        excluded: list[dict] = []

        def restrict_to_subdivision(oid: str, w: dict) -> dict:
            # Precincts nest inside municipalities, so a share that lands in a neighbouring
            # subdivision is block-placement noise at the border; fold it back into the
            # same-subdivision targets (subdivision totals then stay exact).
            same = {k: v for k, v in w.items() if new_sub.get(k) == old_sub.get(oid)}
            if not same:
                return w
            total = sum(w.values()); s_same = sum(same.values())
            return {k: v * total / s_same for k, v in same.items()}

        for oid, grp in both.groupby("old"):
            total_pop = int(grp["pop"].sum())
            matched = grp.dropna(subset=["new"])
            matched_pop = int(matched["pop"].sum())
            if total_pop > 0:
                # weights are shares of the old precinct's WHOLE population: population that sits
                # outside the current district is dropped, not redistributed
                w = (matched.groupby("new")["pop"].sum() / total_pop).to_dict()
                coverage[oid] = round(matched_pop / total_pop, 4)
            else:
                inter = gpd.overlay(old[old["id"] == oid][["id", "geometry"]], cur[["id", "geometry"]].rename(columns={"id": "new"}), how="intersection")
                inter["a"] = inter.area
                w = (inter.groupby("new")["a"].sum() / float(old[old["id"] == oid].area.iloc[0])).to_dict()
                coverage[oid] = round(sum(w.values()), 4)
                fallback.append(oid)
            w = restrict_to_subdivision(oid, w)
            forward[oid] = [[k, round(float(v), 5)] for k, v in sorted(w.items(), key=lambda kv: -kv[1]) if v >= 0.0005]
        for oid in set(old["id"]) - set(forward):  # no block point at all inside: area shares
            inter = gpd.overlay(old[old["id"] == oid][["id", "geometry"]], cur[["id", "geometry"]].rename(columns={"id": "new"}), how="intersection")
            inter["a"] = inter.area
            w = (inter.groupby("new")["a"].sum() / float(old[old["id"] == oid].area.iloc[0])).to_dict()
            w = restrict_to_subdivision(oid, w)
            forward[oid] = [[k, round(float(v), 5)] for k, v in sorted(w.items(), key=lambda kv: -kv[1]) if v >= 0.0005]
            coverage[oid] = round(sum(w.values()), 4)
            fallback.append(oid)
        for oid, cov in coverage.items():
            if cov < 0.5:
                excluded.append({"precinct": oid, "subdivision": old_sub.get(oid), "coverage": cov})
        comp_pop = both.dropna(subset=["new"]).groupby(["new", "old"])["pop"].sum()
        composition: dict[str, list] = {}
        for nid, grp in comp_pop.groupby(level=0):
            tot = grp.sum()
            if tot <= 0:
                continue
            items = sorted(((o, float(p) / tot) for (_, o), p in grp.items()), key=lambda kv: -kv[1])
            composition[nid] = [[o, round(s, 4)] for o, s in items if s >= 0.005]
        single = sum(1 for v in forward.values() if v and v[0][1] >= 0.95)
        crosswalk["eras"][era_id] = {
            "forward": forward, "composition": composition, "coverage": coverage,
            "areaFallback": sorted(fallback), "excluded": excluded,
            "summary": {"oldPrecincts": len(forward), "newPrecincts": len(cur),
                        "oldMappingMostlyToOne": single, "areaFallback": len(fallback), "excluded": len(excluded)},
        }
        print(f"  crosswalk {era_id} -> {current_era['id']}: {len(forward)} old precincts, {single} map >=95% to one new precinct, "
              f"{len(fallback)} area fallbacks, {len(excluded)} mostly outside the current lines: {[e['precinct'] for e in excluded]}")
    (out_data / "crosswalk.json").write_text(json.dumps(crosswalk, separators=(",", ":")))

    # ── 5. district.json (as the page consumes it) ───────────────────────────
    composition_by_year = {}
    for year, y in years_out.items():
        composition_by_year[year] = {o: sorted(m["districts"]) for o, m in y["offices"].items() if m.get("districts")}
    district_out = {
        "slug": slug,
        "state": cfg["state"], "stateName": cfg["stateName"], "chamber": cfg["chamber"], "number": cfg["number"],
        "name": cfg["name"], "shortName": cfg["shortName"], "county": cfg["county"], "blurb": cfg.get("blurb", ""),
        "stateLegDistrictId": cfg.get("stateLegDistrictId"),
        "subdivisions": cfg["subdivisions"],
        "offices": cfg["offices"],
        "eras": [{"id": e["id"], "label": e["label"], "years": e["years"], "current": bool(e.get("current")),
                  "precincts": era_counts[e["id"]],
                  "geography": f"/precinct-districts/{slug}/precincts-{e['id']}.geojson",
                  "geographySubdivisions": f"/precinct-districts/{slug}/subdivisions-{e['id']}.geojson"} for e in cfg["eras"]],
        "years": sorted(int(y) for y in years_out),
        "composition": composition_by_year,
        "election2026": cfg.get("election2026"),
        "sources": cfg.get("sources", []),
        "crosswalk": {"method": xcfg["method"], "blocks": bcfg["label"]},
        "generated": date.today().isoformat(),
    }
    (out_data / "district.json").write_text(json.dumps(district_out, indent=1))
    (out_data / "results.json").write_text(json.dumps({"slug": slug, "years": years_out}, separators=(",", ":")))
    print(f"✓ wrote data/precinct-districts/{slug}/{{district,results,demographics,crosswalk}}.json")


if __name__ == "__main__":
    main()
