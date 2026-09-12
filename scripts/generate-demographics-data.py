#!/usr/bin/env python3
"""
Generates data/demographics.ts (states + congressional districts) and
data/stateLegDemographics.ts (both legislative chambers) from data-entry/demographics.csv,
the ACS 2020-24 5-year pull written by fetch-acs-demographics.py.

Two files, not one, because the legislative set is ~14x the size of the other two together and
nothing on the site imports it yet - keeping it separate means a district or state page never
drags 6,800 legislative districts into its bundle.

Keys are the ones the rest of the site already uses, so each map is a drop-in lookup:
- states: two-letter abbreviation ("CA"), as in data/statesData.ts
- congressional districts: the 4-digit house race id ("0612"), as in forecastData's houseData -
  which means at-large states are "XX01" here and "XX00" in a TIGER boundary file (use
  withAtLargeAlias from lib/congressionalDistricts.ts to join against a map). DC's non-voting
  delegate district is included as "1198" - it has no house race but the national District map
  draws it.
- legislative districts: state abbr -> chamber -> district NUMBER ("12", "BE1", "3rd Essex"),
  exactly how data/stateLegPres2024.ts is keyed.

Run from project root, after fetch-acs-demographics.py:
  python3 scripts/generate-demographics-data.py
"""
import csv, json, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "data-entry/demographics.csv")
DISTRICTS_SRC = os.path.join(ROOT, "data/stateLegDistricts.ts")
DST = os.path.join(ROOT, "data/demographics.ts")
LEG_DST = os.path.join(ROOT, "data/stateLegDemographics.ts")

FORECAST_SRC = os.path.join(ROOT, "data/forecastData.ts")

FIELDS = [
    ("population", "population", int),
    ("college_pct", "collegePct", float),
    ("white_pct", "whitePct", float),
    ("black_pct", "blackPct", float),
    ("hispanic_pct", "hispanicPct", float),
    ("asian_pct", "asianPct", float),
    ("median_household_income", "medianHouseholdIncome", int),
]

ABBR_BY_FIPS = dict(re.findall(r'"(\d{2})": \{ abbr: "([A-Z]{2})"', open(os.path.join(ROOT, "lib/fips.ts")).read()))

# The cycle whose map the site is forecasting; a houseDistrictInfo entry for this year means the
# state's lines moved since the ACS vintage.
ELECTION_YEAR = 2026


def redrawn_for_2026():
    """States whose congressional map was redrawn after the 119th Congress convened - the geography
    the 2024 ACS measures, and for now the geography public/congressional-districts-2026.json still
    draws. Their district figures describe the previous lines, which the UI says on the page.

    Read out of forecastData's houseDistrictInfo rather than listed here, because that is where the
    site already records a redraw (an entry for a year IS the redraw) and a hand-kept copy would
    quietly fall out of date the next time a state moves its lines."""
    src = open(FORECAST_SRC).read()
    match = re.search(r"export const houseDistrictInfo[^=]*= (\{.*?\n\});", src, re.S)
    if not match:
        raise SystemExit(f"could not find houseDistrictInfo in {FORECAST_SRC}")
    info = json.loads(match.group(1))
    abbrs = {
        ABBR_BY_FIPS[race_id[:2]]
        for race_id, entries in info.items()
        for entry in entries
        if entry.get("year") == ELECTION_YEAR
    }
    return sorted(abbrs)


def load_app_districts():
    """data/stateLegDistricts.ts's object literal. It is pure JSON after the `= `, and this is
    read-only use - the file itself stays owned by build-state-leg-incumbents.mjs."""
    src = open(DISTRICTS_SRC).read()
    start = src.index("= {", src.index("export const stateLegDistricts")) + 2
    try:
        return json.loads(src[start:src.rindex("};") + 1])
    except json.JSONDecodeError as e:
        raise SystemExit(f"could not parse {DISTRICTS_SRC} as JSON (did its shape change?): {e}")


def normalize_nh(text):
    """New Hampshire's House districts are named, not numbered, and the site's geoids for them are
    synthesized rather than the Census's (see data/stateLegDistricts.ts), so they join on the name
    instead: the ACS's "State House District Belknap 01" and our "Belknap 1" both reduce here."""
    text = re.sub(r"\s*\(\d{4}\).*$", "", text)
    text = re.sub(r"^State House District\s*", "", text)
    text = re.sub(r"\b0+(\d)", r"\1", text)  # "Belknap 01" -> "Belknap 1"
    return re.sub(r"[^a-z0-9]", "", text.lower())


def demographics(row):
    out = {}
    for col, key, cast in FIELDS:
        raw = row[col]
        if raw == "":
            continue
        out[key] = cast(round(float(raw))) if cast is int else round(float(raw), 1)
    return out


def blend(parts, weights):
    """Population-weighted average of each field across `parts`; used only to recombine a
    geography out of the pieces it is exactly made of."""
    out = {}
    for _, key, cast in FIELDS:
        if key == "population":
            continue
        pairs = [(p[key], w) for p, w in zip(parts, weights) if p.get(key) is not None and w]
        total = sum(w for _, w in pairs)
        if not pairs or total == 0:
            continue
        value = sum(v * w for v, w in pairs) / total
        out[key] = int(round(value)) if cast is int else round(value, 1)
    pops = [p.get("population") for p in parts]
    if all(p is not None for p in pops):
        out["population"] = sum(pops)
    return out


def render(value):
    return json.dumps(value)


def fields_literal(d):
    # Always the FIELDS order, so a hand-blended row reads the same as a straight one.
    parts = [f"{key}: {render(d[key])}" for _, key, _ in FIELDS if d.get(key) is not None]
    return "{ " + ", ".join(parts) + " }"


REDRAWN_FOR_2026 = redrawn_for_2026()

rows = list(csv.DictReader(open(SRC)))
by_level = {}
for row in rows:
    by_level.setdefault(row["level"], []).append(row)

# ---- nation -------------------------------------------------------------------------------
national = demographics(by_level["nation"][0])

# ---- states -------------------------------------------------------------------------------
state_out = {}
for row in by_level["state"]:
    abbr = ABBR_BY_FIPS[row["state_fips"]]
    state_out[abbr] = demographics(row)

# ---- congressional districts --------------------------------------------------------------
cd_out = {}
for row in by_level["cd"]:
    code = row["code"]
    # At-large states report "00"; every dataset on the site writes them "01".
    key = row["state_fips"] + ("01" if code == "00" else code)
    cd_out[key] = demographics(row)

# ---- state legislative districts ----------------------------------------------------------
app = load_app_districts()
CHAMBER_OF_LEVEL = {"sldu": "senate", "sldl": "house"}

# (chamber, geoid) -> (abbr, number), plus NH House's name-keyed fallback. The chamber has to be
# part of the key: a TIGER legislative GEOID is state FIPS + the district's own code, so an upper
# and a lower district numbered the same in the same state carry the SAME geoid.
by_geoid, nh_house_by_name, overlays = {}, {}, []
for abbr, chambers in app.items():
    for chamber, districts in chambers.items():
        for d in districts:
            if d.get("overlay"):
                overlays.append((abbr, chamber, d))
                continue
            if d.get("geoid"):
                by_geoid[(chamber, d["geoid"])] = (abbr, d["number"])
            if abbr == "NH" and chamber == "house":
                nh_house_by_name[normalize_nh(d["label"])] = d["number"]

leg_out, unmatched = {}, []
for level in ("sldu", "sldl"):
    chamber = CHAMBER_OF_LEVEL[level]
    for row in by_level.get(level, []):
        # The ACS files DC's 8 city wards as an upper chamber. DC has no state legislature and the
        # site carries no districts for it, so they are dropped rather than reported as a gap.
        if row["state_fips"] == "11":
            continue
        target = by_geoid.get((chamber, row["geoid"]))
        if target is None and row["state_fips"] == "33" and chamber == "house":
            number = nh_house_by_name.get(normalize_nh(row["name"].split(";")[0]))
            target = ("NH", number) if number else None
        if target is None:
            unmatched.append((level, row["geoid"], row["name"]))
            continue
        abbr, number = target
        leg_out.setdefault(abbr, {}).setdefault(chamber, {})[number] = demographics(row)

# New Hampshire's 39 floterial districts have no boundary of their own - each is exactly the union
# of the base districts it overlays, so it is recombined from them rather than left empty. Same
# reasoning as the retired-county blend in generate-county-demographics-data.py: an exact
# recomposition of the same ground, not an estimate across different geographies.
synthesized = 0
for abbr, chamber, d in overlays:
    parts = [leg_out.get(abbr, {}).get(chamber, {}).get(c) for c in d.get("components") or []]
    if not parts or any(p is None for p in parts):
        continue
    weights = [p.get("population") for p in parts]
    if any(w is None for w in weights):
        continue
    leg_out.setdefault(abbr, {}).setdefault(chamber, {})[d["number"]] = blend(parts, weights)
    synthesized += 1

# ---- write --------------------------------------------------------------------------------
HEADER_TYPE = """export type Demographics = {
  population?: number;
  collegePct?: number; // % of adults 25+ with a bachelor's degree or higher
  whitePct?: number; // % White alone, not Hispanic or Latino
  blackPct?: number; // % Black or African American alone, not Hispanic or Latino
  hispanicPct?: number; // % Hispanic or Latino (any race)
  asianPct?: number; // % Asian alone, not Hispanic or Latino
  medianHouseholdIncome?: number; // dollars
};"""

out = [
    "// Auto-generated by scripts/generate-demographics-data.py from data-entry/demographics.csv",
    "// (ACS 2020-24 5-year, Census API - see scripts/fetch-acs-demographics.py). Do not edit by",
    "// hand; rerun the scripts instead.",
    "//",
    "// One vintage and one source for every geography here, so a state and a district in it are",
    "// always measured the same way. County demographics are NOT from this pull - they predate it",
    "// and live in data/countyDemographics.ts on the 2019-23 vintage, from County Health Rankings",
    "// and USDA ERS. The field names and definitions match, but the years do not exactly.",
    "//",
    "// Race shares are the not-Hispanic-alone categories, so White + Black + Asian + Hispanic",
    "// never double-counts and does not sum to 100 (the remainder is AIAN, NHPI, other and",
    "// multiracial). A field is omitted, never zeroed, where the ACS publishes no value.",
    "",
    HEADER_TYPE,
    "",
    "// The country as a whole, on the same vintage - what a state or district figure reads against.",
    f"export const nationalDemographics: Demographics = {fields_literal(national)};",
    "",
    "// Keyed by two-letter state abbreviation, as in data/statesData.ts. Includes DC.",
    "export const stateDemographics: Record<string, Demographics> = {",
]
for abbr in sorted(state_out):
    out.append(f'  "{abbr}": {fields_literal(state_out[abbr])},')
out += [
    "};",
    "",
    "// Keyed by the 4-digit house race id (state FIPS + district), as in forecastData's houseData.",
    "// At-large states are \"XX01\" here but \"XX00\" in a TIGER boundary file - join through",
    "// withAtLargeAlias in lib/congressionalDistricts.ts. \"1198\" is DC's non-voting delegate",
    "// district: no house race, but the national District map draws it.",
    "export const districtDemographics: Record<string, Demographics> = {",
]
for key in sorted(cd_out):
    out.append(f'  "{key}": {fields_literal(cd_out[key])},')
out += [
    "};",
    "",
    "// The 2024 ACS reports congressional districts on 119th Congress lines, which is also what",
    "// public/congressional-districts-2026.json still draws. These states have since enacted a",
    "// different map for 2026 (see houseDistrictInfo's 2026 entries), so their figures describe",
    "// the district's previous lines until both the boundary file and this pull are refreshed.",
    "export const REDRAWN_SINCE_ACS_VINTAGE: ReadonlySet<string> = new Set([",
    "  " + ", ".join(f'"{a}"' for a in REDRAWN_FOR_2026),
    "]);",
    "",
]
open(DST, "w").write("\n".join(out))

leg = [
    "import type { Chamber } from \"./stateLegDistricts\";",
    "import type { Demographics } from \"./demographics\";",
    "",
    "// Auto-generated by scripts/generate-demographics-data.py from data-entry/demographics.csv",
    "// (ACS 2020-24 5-year). Do not edit by hand; rerun the scripts instead.",
    "//",
    "// Keyed state abbr -> chamber -> district NUMBER, exactly as data/stateLegPres2024.ts is, so",
    "// the two look up side by side. Nothing on the site reads this yet - it is here so a future",
    "// legislative demographics view has the data ready. Keep it out of a page's imports until",
    "// then; it is a large module.",
    "//",
    "// The ACS's district vintage is 2024, the same lines as the boundary files in",
    "// public/state-leg-districts. New Hampshire's 39 floterial House districts have no Census",
    "// geography of their own, so each is recombined from the base districts it overlays,",
    "// population-weighted - an exact recomposition, not a cross-geography estimate.",
    "",
    "export const stateLegDemographics: Record<string, Partial<Record<Chamber, Record<string, Demographics>>>> = {",
]
for abbr in sorted(leg_out):
    leg.append(f'  "{abbr}": {{')
    for chamber in sorted(leg_out[abbr]):
        leg.append(f'    "{chamber}": {{')
        for number in sorted(leg_out[abbr][chamber]):
            leg.append(f'      "{number}": {fields_literal(leg_out[abbr][chamber][number])},')
        leg.append("    },")
    leg.append("  },")
leg += ["};", ""]
open(LEG_DST, "w").write("\n".join(leg))

leg_count = sum(len(c) for s in leg_out.values() for c in s.values())
print(f"states {len(state_out)} | congressional districts {len(cd_out)} -> {DST}")
print(f"legislative districts {leg_count} ({synthesized} NH floterials recombined) -> {LEG_DST}")
if unmatched:
    print(f"UNMATCHED ACS districts ({len(unmatched)}):")
    for level, geoid, name in unmatched[:20]:
        print(f"  {level} {geoid} {name}")
