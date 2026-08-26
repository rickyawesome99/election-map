"""
Fills state legislative districts that had NO Nov 2024 election to crosswalk against (the
"off-cycle" half of a staggered Senate - see scripts/crosswalk-state-leg-pres2024.py's docstring
for why those are structurally absent from the direct precinct crosswalk) by estimating their
2024 presidential vote from the CURRENT boundary geometry instead: overlay the current House
district polygons (House is virtually never staggered, so its precinct crosswalk already covers
the whole chamber) onto the current Senate district polygons, and apportion each House district's
already-crosswalked votes across the Senate district(s) it overlaps, weighted by the fraction of
the House district's AREA inside each Senate district.

This is an AREA-weighted approximation, not a precinct-exact result (real voter density isn't
uniform across a House district's area) - every entry this script fills is marked
`"estimated": true` so the map/table can present it distinctly from the exact precinct-crosswalk
numbers. Validated against Ohio's 17 directly-crosswalked Senate districts (computing them BOTH
ways and comparing): mean absolute margin error 0.68 points, max 4.2 points, every district's
sign/rough magnitude correct - a usable estimate, not a substitute for real precinct-level data.

Usage: python3 scripts/fill-state-leg-pres2024-gaps.py <ABBR>
Reads/writes data-entry/state-leg-pres2024/{ABBR}.json in place.
"""
import json
import re
import sys
from collections import defaultdict

import geopandas as gpd
from shapely.geometry import shape

# Port of BOUNDARY_CODE_OVERRIDES/extractDistrictCode in components/StateLegDistrictMap.tsx -
# must stay in sync with that file. Needed because some states' boundary features have a
# meaningless DISTRICT value (VT/MA: literally "NaN", since their districts are NAMED, not
# numbered) and the real code has to come from NAMELSAD instead. Without this, VT/MA crash
# geopandas' set_index (every row collapses onto the same "NaN" key) and any other named-
# district state would silently produce wrong house<->senate pairings.
BOUNDARY_CODE_OVERRIDES = {
    ("MA", "house"): lambda p: re.sub(r"\s+District$", "", p.get("NAMELSAD") or ""),
    ("MA", "senate"): lambda p: re.sub(r"\s+District$", "", p.get("NAMELSAD") or ""),
    ("AK", "senate"): lambda p: (p.get("NAMELSAD") or "").strip().split()[-1] if p.get("NAMELSAD") else None,
    ("VT", "house"): lambda p: re.sub(r"\s+State House District$", "", p.get("NAMELSAD") or ""),
    ("VT", "senate"): lambda p: re.sub(r"\s+Senatorial District$", "", p.get("NAMELSAD") or ""),
}


def extract_district_code(abbr, chamber, props):
    override = BOUNDARY_CODE_OVERRIDES.get((abbr, chamber))
    if override:
        return override(props)
    district, namelsad = props.get("DISTRICT"), props.get("NAMELSAD")
    if namelsad and district:
        last_token = namelsad.strip().split()[-1]
        if re.match(rf"^0*{re.escape(str(district))}[A-Za-z]+$", last_token):
            return last_token
    return district

ROOT = __file__.rsplit("/scripts/", 1)[0]
HOUSE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-house-districts-2026.json"
SENATE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json"

# Standard state FIPS codes.
ABBR_TO_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09",
    "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17",
    "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24",
    "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54",
    "WI": "55", "WY": "56",
}


def load_gdf(path, stfp, abbr, chamber):
    fc = json.load(open(path))
    # A handful of source features have a null geometry (confirmed: IL House district 103) -
    # a real defect in the combined boundary source file, unrelated to this script. That
    # district's VOTE data is unaffected (it came from the direct precinct crosswalk, not this
    # overlay) - it just can't participate in the spatial overlay used to fill OTHER districts.
    feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    geoms = [shape(f["geometry"]).buffer(0) for f in feats]
    props = [f["properties"] for f in feats]
    gdf = gpd.GeoDataFrame(props, geometry=geoms, crs="EPSG:4326")
    gdf["CODE"] = [extract_district_code(abbr, chamber, p) for p in props]
    return gdf


def fill_gaps(abbr):
    path = f"{ROOT}/data-entry/state-leg-pres2024/{abbr}.json"
    data = json.load(open(path))
    house_votes = data.get("house")
    senate_votes = data.get("senate")
    if not house_votes or not senate_votes:
        print(f"{abbr}: missing house or senate data entirely - nothing to fill from overlay")
        return

    stfp = ABBR_TO_FIPS[abbr]
    house = load_gdf(HOUSE_SRC, stfp, abbr, "house").to_crs(epsg=5070)
    senate = load_gdf(SENATE_SRC, stfp, abbr, "senate").to_crs(epsg=5070)
    if house.empty or senate.empty:
        print(f"{abbr}: no boundary features found for STATEFP {stfp}")
        return
    house = house.dropna(subset=["CODE"])
    senate = senate.dropna(subset=["CODE"])
    house["h_area"] = house.geometry.area

    all_senate_districts = set(senate["CODE"])
    missing = sorted(all_senate_districts - set(senate_votes.keys()))
    if not missing:
        print(f"{abbr}: senate already complete ({len(senate_votes)} districts), nothing to fill")
        return

    overlay = gpd.overlay(house, senate, how="intersection", keep_geom_type=False)
    overlay["frac"] = overlay.geometry.area / overlay["CODE_1"].map(
        house.drop_duplicates("CODE").set_index("CODE")["h_area"]
    )
    overlay = overlay[overlay["frac"] > 0.005]

    est = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "tot": 0.0})
    for _, row in overlay.iterrows():
        hd, sd = row["CODE_1"], row["CODE_2"]
        if sd not in missing:
            continue
        hv = house_votes.get(hd)
        if not hv:
            continue
        frac = row["frac"]
        est[sd]["dem"] += hv["demVotes"] * frac
        est[sd]["rep"] += hv["repVotes"] * frac
        est[sd]["tot"] += hv["totalVotes"] * frac

    filled = 0
    for sd, v in est.items():
        if v["tot"] <= 0:
            continue
        dem_pct = round(v["dem"] / v["tot"] * 100, 1)
        rep_pct = round(v["rep"] / v["tot"] * 100, 1)
        senate_votes[sd] = {
            "demPct": dem_pct,
            "repPct": rep_pct,
            "margin": round(rep_pct - dem_pct, 1),
            "demVotes": round(v["dem"]),
            "repVotes": round(v["rep"]),
            "totalVotes": round(v["tot"]),
            "estimated": True,
        }
        filled += 1

    still_missing = sorted(all_senate_districts - set(senate_votes.keys()))
    print(f"{abbr}: filled {filled}/{len(missing)} missing senate districts via House overlay"
          + (f" - still missing: {still_missing}" if still_missing else ""))

    json.dump(data, open(path, "w"), indent=2, sort_keys=True)


if __name__ == "__main__":
    for abbr in sys.argv[1:]:
        fill_gaps(abbr.upper())
