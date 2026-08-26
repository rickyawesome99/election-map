"""
Derives 2024 presidential results per CURRENT state legislative district for states where
scripts/crosswalk-state-leg-pres2024.py's method can't apply at all - no simultaneous Nov 2024
state-legislative race exists to borrow a district label from, either because the state elects
its legislature in ODD years (LA, NJ, VA - Tier 1b) or because the CURRENT map postdates the 2024
election entirely (MS, MI Senate - Tier 2). Unlike those states, there's no shortcut through
another chamber's same-year data either (checked: LA/NJ/VA's House and Senate are BOTH odd-year;
MS's 2025 remedial map has no matching election at all yet).

Method: a real spatial join, precinct-by-precinct, using 2020 Census VTDs (Census's official
precinct-equivalent geometry, from the once-per-decade redistricting release - there is no VTD
product for any other year) as the geometry source, joined to MEDSL's 2024 precinct-level
US PRESIDENT vote counts by precinct number, then overlaid onto the CURRENT (2026-effective)
district boundaries. This is a genuine improvement in precision over the House-district-overlay
estimate used to fill staggered-Senate gaps elsewhere in this project (real precincts are far
smaller than House districts, so the "uniform density within the unit" assumption this method
still relies on for any SPLIT precinct is far safer here).

Join key discovery (Virginia, confirmed): MEDSL's VA precinct names are "NNN - NAME" (e.g.
"102 - CERES"); the VTD shapefile's VTDST20 field for the same real-world precinct is "000102"
in the same county - i.e. the leading number IS the VTD code, just differently padded. This
naming convention needs re-verification per state (not assumed to generalize) - LA/NJ/MS may
each use a different scheme, matching the pattern of gotchas already hit for the direct
crosswalk. A small fraction of precincts (VA: ~5%) don't have a clean numeric-prefix name (e.g.
"COUNTY PROVISIONALS" aggregates) and are simply left unmatched - same graceful-degradation
convention as an unmatched precinct anywhere else in this project.

Usage: python3 scripts/spatial-join-state-leg-pres2024.py <ABBR> <medsl-precinct-csv> <vtd-shapefile-dir>
Writes data-entry/state-leg-pres2024/{ABBR}.json (both chambers, from scratch - this fully
replaces the direct-crosswalk output for a Tier 1b/Tier 2 state, since none exists for these).
"""
import importlib.util
import json
import os
import re
import sys
from collections import defaultdict

import geopandas as gpd
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")
HOUSE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-house-districts-2026.json"
SENATE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json"

# Reuse the crosswalk script's mode-collapsing/party-bucketing/non-candidate-row logic instead of
# duplicating it - both scripts face the identical MEDSL US PRESIDENT row quirks.
_xw_spec = importlib.util.spec_from_file_location("xw", os.path.join(os.path.dirname(__file__), "crosswalk-state-leg-pres2024.py"))
xw = importlib.util.module_from_spec(_xw_spec)
_xw_spec.loader.exec_module(xw)

sys.path.insert(0, os.path.dirname(__file__))
_fg_spec = importlib.util.spec_from_file_location("fg", os.path.join(os.path.dirname(__file__), "fill-state-leg-pres2024-gaps.py"))
fg = importlib.util.module_from_spec(_fg_spec)
_fg_spec.loader.exec_module(fg)


# Per-state: how to turn a MEDSL precinct name AND a VTD row into the SAME join key. Confirmed
# by direct inspection that each state's convention is genuinely different (same pattern as
# every other per-state quirk in this project) - VTDST20's own encoding scheme isn't always
# usable directly, so some states match on a key parsed from each side's NAME field instead:
#   VA: precinct "102 - CERES" -> leading number 102, matched against VTDST20 "000102" as int.
#   LA: precinct "01 04" (ward, precinct) -> "0001-4", matched against VTDST20 verbatim (LA's
#       VTDST20 is NOT purely numeric and NOT internally consistent across parishes - some use
#       "WWWW-P", others a flat run-together number - unresolved, LA's match rate is currently
#       very poor and needs more per-parish work, not attempted further here).
#   NJ: VTDST20 packs muni-code+ward+district into one opaque number neither side exposes
#       directly - instead parse (municipality, ward, district) out of BOTH the MEDSL precinct
#       string ("Franklin W 1 D 10") and the VTD's NAME20 ("Franklin township ward 2 voting
#       district 12"), and match on that normalized tuple instead of any numeric code.
def _va_precinct_key(precinct, county_fips=None):
    m = re.match(r"^(\d+)\s*-?\s*", precinct.strip())
    return int(m.group(1)) if m else None


def _la_precinct_key(precinct, county_fips=None):
    m = re.match(r"^(\d+)\s+(\d+)$", precinct.strip())
    if not m:
        return None
    ward, prec = int(m.group(1)), int(m.group(2))
    return f"{ward:04d}-{prec}"


def _nj_precinct_key(precinct, county_fips=None):
    s = precinct.strip()
    m = re.match(r"^(.+?)\s+W\s*(\d+)\s+D\s*(\d+)$", s, re.IGNORECASE)
    if m:
        muni, ward, dist = m.group(1), int(m.group(2)), int(m.group(3))
    else:
        m = re.match(r"^(.+?)\s+D\s*(\d+)$", s, re.IGNORECASE)
        if not m:
            return None
        muni, ward, dist = m.group(1), 0, int(m.group(2))
    return (muni.strip().lower(), ward, dist)


def _nj_vtd_key(name20):
    s = (name20 or "").strip().lower()
    s = re.sub(r"\s+(township|borough|city|town|village)\b", "", s)
    m = re.search(r"ward\s+(\d+)", s)
    ward = int(m.group(1)) if m else 0
    m = re.search(r"voting district\s+(\d+)", s)
    if not m:
        return None
    dist = int(m.group(1))
    muni = re.split(r"\s+ward\b|\s+voting district\b", s)[0].strip()
    return (muni, ward, dist)


# Mississippi: precincts are NAMED (real place names, e.g. "Bellemont"), not numbered - MEDSL
# reports these under at least THREE different prefix conventions ("Dist. 1, Bellemont
# Precinct", "127 - Bailey", or a bare name), while the VTD's NAME20 for the same real precinct
# is just "Bellemont" - normalize both sides to strip whichever prefix/generic facility word is
# present, then match on the resulting bare name WITHIN THE SAME COUNTY (names aren't unique
# statewide, but are locally). A THIRD wrinkle found in some counties (e.g. Lauderdale, 28075):
# some precincts are numbered rather than named, and MEDSL spells the number out ("One", "Five")
# while the VTD side gives the bare digit ("1", "5") - converted via _MS_WORD_TO_NUM.
_MS_STRIP_WORDS = r"(precinct|fire\s*precinct|fire\s*station|firestation|multi\s*purpose|bldg\.?|building|school|community\s*center|center|hgts\.?|heights)"
_MS_WORD_TO_NUM = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
    "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20", "zero": "0",
}


def _ms_normalize_name(s):
    s = (s or "").strip().lower()
    s = re.sub(r"^dist\.?\s*\d+,\s*", "", s)          # "Dist. 1, " prefix
    s = re.sub(r"^\d+(st|nd|rd|th)\s+district\s+", "", s)  # "2nd District " prefix
    s = re.sub(r"^\(\s*\d+\s*\)\s*", "", s)           # "(01) " parenthesized-number prefix
    s = re.sub(r"^\d+\s*[-\s]\s*", "", s)             # "127 - " or "1 " leading-number prefix
    s = re.sub(rf"\b{_MS_STRIP_WORDS}\b", "", s)
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return _MS_WORD_TO_NUM.get(s, s)


def _ms_precinct_key(precinct, county_fips=None):
    key = _ms_normalize_name(precinct)
    return key or None


def _ms_vtd_key(name20):
    key = _ms_normalize_name(name20)
    return key or None


# Michigan: MEDSL precincts read "{MUNICIPALITY} {TOWNSHIP|CITY|CHARTER TOWNSHIP|TWP} {precinct
# num} Ward {ward num}{optional split-letter}" (e.g. "HOLLAND CITY 11 Ward 5",
# "LIVONIA CITY 14 Ward 0A"). The VTD shapefile's NAME20 is NOT the muni name at all - it's an
# opaque compound numeric code: COUNTYFP(3) + the county subdivision's COUSUBFP with its
# (always-present) trailing zero dropped (4) + ward(3, zero-padded) + precinct(3-4, zero-padded,
# with a trailing split-letter for the ~1% of precincts split across polling locations, e.g.
# Livonia's "1634900000014A" = county 163 + Livonia's COUSUBFP 49000->"4900" + ward "000" +
# precinct "014" + split "A"). Confirmed by cross-referencing tl_2020_26_cousub.shp's
# (COUNTYFP, NAME, LSAD, COUSUBFP) against known precinct names - LSAD "25" is an MI city MCD,
# "44"/"49" is a township/charter township (charter status doesn't change the code, just the
# LSAD digit and MEDSL's optional "CHARTER" word). A city and a township of the SAME name can
# coexist as separate MCDs in the same county (e.g. Allegan county has both "Allegan city" and
# "Allegan township") so the join key must carry county+name+type together, not just name.
# Detroit (Wayne county, COUSUBFP 22000) is a confirmed exception - its real VTDs don't decode to
# small ward/precinct numbers this way (its own internal precinct-numbering scheme, unresolved) -
# left unmatched, same graceful-degradation convention as every other state's residual gap.
_MI_MUNI_TYPE_RE = re.compile(
    r"^(.+?)\s+(CHARTER\s+TOWNSHIP|CHARTER\s+TWP|TOWNSHIP|TWP|CITY)\s+(\d+)\s+WARD\s+(\d+)([A-Za-z]*)$",
    re.IGNORECASE,
)

MI_MUNI_CODE = {}  # (county_fips, muni_name upper, "CITY"|"TOWNSHIP") -> 4-digit COUSUBFP code


def load_mi_muni_codes(cousub_shp):
    gdf = gpd.read_file(cousub_shp)
    for _, row in gdf.iterrows():
        if row["LSAD"] == "25":
            mtype = "CITY"
        elif row["LSAD"] in ("44", "49"):
            mtype = "TOWNSHIP"
        else:
            continue
        county_fips = "26" + row["COUNTYFP"]
        MI_MUNI_CODE[(county_fips, row["NAME"].strip().upper(), mtype)] = row["COUSUBFP"][:4]
    print(f"MI: loaded {len(MI_MUNI_CODE)} county-subdivision codes")


def _mi_precinct_key(precinct, county_fips=None):
    m = _MI_MUNI_TYPE_RE.match(precinct.strip())
    if not m:
        return None
    name, mtype_raw, precinct_num, ward_num, suffix = m.groups()
    mtype = "CITY" if mtype_raw.strip().upper() == "CITY" else "TOWNSHIP"
    code4 = MI_MUNI_CODE.get((county_fips, name.strip().upper(), mtype))
    if code4 is None:
        return None
    return f"{code4}-{int(ward_num)}-{int(precinct_num)}{suffix.upper()}"


def _mi_vtd_key(name20):
    s = name20.strip()
    if len(s) == 13 and s.isdigit():
        code4, ward, precinct, suffix = s[3:7], int(s[7:10]), int(s[10:13]), ""
    elif len(s) == 14 and s[:-1].isdigit() and s[-1].isalpha():
        code4, ward, precinct, suffix = s[3:7], int(s[7:10]), int(s[10:13]), s[13].upper()
    else:
        return None
    return f"{code4}-{ward}-{precinct}{suffix}"


# Each entry: (precinct_key_func, vtd_key_func). precinct_key_func takes (precinct_string,
# county_fips) - only MI's needs county_fips, the rest ignore it. vtd_key_func takes the raw VTD
# row and returns a key of whatever type/shape precinct_key_func also produces for that state -
# VTDST20 as an int/string for VA/LA, a parsed (muni, ward, district) tuple from NAME20 for NJ.
PRECINCT_KEY_FUNCS = {
    "VA": (_va_precinct_key, lambda row: int(row["VTDST20"])),
    "LA": (_la_precinct_key, lambda row: row["VTDST20"]),
    "NJ": (_nj_precinct_key, lambda row: _nj_vtd_key(row["NAME20"])),
    "MS": (_ms_precinct_key, lambda row: _ms_vtd_key(row["NAME20"])),
    "MI": (_mi_precinct_key, lambda row: _mi_vtd_key(row["NAME20"])),
}


def load_vtd_precincts(vtd_dir, stfp, abbr):
    """vtd_key (see PRECINCT_KEY_FUNCS above) -> geometry, keyed by (county_fips, vtd_key)."""
    shp = [f for f in os.listdir(vtd_dir) if f.endswith(".shp")][0]
    gdf = gpd.read_file(os.path.join(vtd_dir, shp))
    _, vtd_key_func = PRECINCT_KEY_FUNCS[abbr]
    out = {}
    for _, row in gdf.iterrows():
        county_fips = stfp + row["COUNTYFP20"]
        vtd_key = vtd_key_func(row)
        if vtd_key is not None:
            out[(county_fips, vtd_key)] = row["geometry"]
    return out


def load_precinct_president_votes(medsl_path):
    """(county_fips, precinct) -> {dem, rep, oth} votes, using the crosswalk script's own
    mode-collapse/party-bucket/non-candidate-row logic for consistency."""
    delimiter = "\t" if medsl_path.endswith(".tab") else ","
    import csv
    raw = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    with open(medsl_path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=delimiter):
            if row["office"] != "US PRESIDENT":
                continue
            if xw._is_non_candidate_row(row["candidate"]):
                continue
            try:
                votes = int(float(row["votes"]))
            except (ValueError, TypeError):
                continue
            key = (row["county_fips"], row["precinct"].strip().upper())
            mode = row["mode"] or "TOTAL"
            bucket = xw.party_bucket(row["party_simplified"], row["party_detailed"], row["candidate"])
            raw[key][bucket][mode] += votes
    return {key: {b: xw._collapse_modes(m) for b, m in buckets.items()} for key, buckets in raw.items()}


def build_precinct_geodataframe(abbr, medsl_path, vtd_dir, stfp):
    vtd_geom = load_vtd_precincts(vtd_dir, stfp, abbr)
    key_func, _ = PRECINCT_KEY_FUNCS[abbr]
    pres_votes = load_precinct_president_votes(medsl_path)

    # Re-derive the ORIGINAL (non-uppercased) precinct string per key, since we need it to parse
    # the leading VTD number - pres_votes above was keyed on the uppercased join key used
    # elsewhere in this project, but that's fine since VTD numbers are digits either way.
    import csv
    delimiter = "\t" if medsl_path.endswith(".tab") else ","
    orig_precinct = {}
    with open(medsl_path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=delimiter):
            if row["office"] == "US PRESIDENT":
                key = (row["county_fips"], row["precinct"].strip().upper())
                orig_precinct[key] = row["precinct"]

    rows = []
    matched, unmatched = 0, 0
    for key, buckets in pres_votes.items():
        county_fips, _ = key
        vtd_key = key_func(orig_precinct[key], county_fips)
        geom = vtd_geom.get((county_fips, vtd_key)) if vtd_key is not None else None
        if geom is None:
            unmatched += 1
            continue
        matched += 1
        rows.append({
            "dem": buckets.get("dem", 0), "rep": buckets.get("rep", 0), "oth": buckets.get("oth", 0),
            "geometry": geom,
        })
    print(f"{abbr}: {matched} precincts matched to VTD geometry, {unmatched} unmatched")
    return gpd.GeoDataFrame(rows, crs="EPSG:4326")


def overlay_onto_districts(abbr, chamber, precincts_gdf, boundary_src, stfp):
    fc = json.load(open(boundary_src))
    feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    if not feats:
        return {}
    geoms = [shape(f["geometry"]).buffer(0) for f in feats]
    props = [f["properties"] for f in feats]
    districts = gpd.GeoDataFrame(props, geometry=geoms, crs="EPSG:4326")
    districts["CODE"] = [fg.extract_district_code(abbr, chamber, p) for p in props]
    districts = districts.dropna(subset=["CODE"])

    precincts = precincts_gdf.to_crs(epsg=5070)
    districts = districts.to_crs(epsg=5070)
    precincts["p_area"] = precincts.geometry.area

    overlay = gpd.overlay(precincts.reset_index(), districts, how="intersection", keep_geom_type=False)
    overlay["frac"] = overlay.geometry.area / overlay["p_area"]
    overlay = overlay[overlay["frac"] > 0.005]

    dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "tot": 0.0})
    for _, row in overlay.iterrows():
        frac = row["frac"]
        dist_votes[row["CODE"]]["dem"] += row["dem"] * frac
        dist_votes[row["CODE"]]["rep"] += row["rep"] * frac
        dist_votes[row["CODE"]]["tot"] += (row["dem"] + row["rep"] + row["oth"]) * frac

    # A district whose matched precincts add up to far fewer votes than a typical district in
    # this chamber almost certainly means most of its real precincts failed the join (a "stale
    # VTD" or naming-mismatch county overlapping this specific district) - the votes it DOES
    # have aren't a representative sample of the district, just whichever few precincts happened
    # to match. Confirmed on Mississippi: 11/121 House districts came in under 3,000 total votes
    # against a ~6,900 median - dropping those (rather than showing a skewed color from a
    # handful of precincts) is safer, matching this project's "no data" over "misleading data"
    # rule used when LA/NJ's overall match rate was too low to ship at all.
    import statistics
    totals = [v["tot"] for v in dist_votes.values() if v["tot"] > 0]
    coverage_floor = statistics.median(totals) * 0.4 if totals else 0

    out = {}
    dropped_low_coverage = 0
    for d, v in dist_votes.items():
        if v["tot"] <= 0:
            continue
        if v["tot"] < coverage_floor:
            dropped_low_coverage += 1
            continue
        dem_pct = round(v["dem"] / v["tot"] * 100, 1)
        rep_pct = round(v["rep"] / v["tot"] * 100, 1)
        out[d] = {
            "demPct": dem_pct, "repPct": rep_pct,
            "margin": round(rep_pct - dem_pct, 1),
            "demVotes": round(v["dem"]), "repVotes": round(v["rep"]), "totalVotes": round(v["tot"]),
        }
    if dropped_low_coverage:
        print(f"{abbr} {chamber}: dropped {dropped_low_coverage} low-coverage district(s) "
              f"(< 40% of median matched votes)")
    return out


if __name__ == "__main__":
    abbr = sys.argv[1].upper()
    medsl_path = sys.argv[2]
    vtd_dir = sys.argv[3]
    stfp = fg.ABBR_TO_FIPS[abbr]

    # MI's House was already sourced via the direct crosswalk (its map is unchanged since 2024) -
    # only its Senate map postdates the 2024 election (Tier 2), so this run must compute Senate
    # ONLY and merge into the existing MI.json rather than overwriting the good House data.
    chambers = (("house", HOUSE_SRC), ("senate", SENATE_SRC))
    if abbr == "MI":
        load_mi_muni_codes(sys.argv[4])
        chambers = (("senate", SENATE_SRC),)

    precincts_gdf = build_precinct_geodataframe(abbr, medsl_path, vtd_dir, stfp)
    tot = precincts_gdf[["dem", "rep", "oth"]].sum()
    print(f"{abbr} statewide president totals from matched VTDs: dem={tot['dem']:,.0f} "
          f"rep={tot['rep']:,.0f} oth={tot['oth']:,.0f} total={tot.sum():,.0f}")

    out_path = os.path.join(OUT_DIR, f"{abbr}.json")
    result = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for chamber, src in chambers:
        out = overlay_onto_districts(abbr, chamber, precincts_gdf, src, stfp)
        if out:
            result[chamber] = out
            print(f"{abbr} {chamber}: {len(out)} districts")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, sort_keys=True)
    print(f"wrote {out_path}")
