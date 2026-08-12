#!/usr/bin/env python3
"""
Generates data/countyDemographics.ts from two no-API-key public sources, merged by
5-digit county FIPS:
- data-entry/county_health_rankings_2025.csv: County Health Rankings & Roadmaps 2025
  national analytic data file (ACS-sourced). Race/ethnicity shares and median household
  income come from here.
- data-entry/usda_ers_education_2019_23.csv: USDA ERS county-level education dataset,
  2019-23 ACS 5-year vintage. Bachelor's-degree-or-higher share comes from here.
Plus a third, CT-only source requiring a Census API key (see fetch-ct-town-acs.py):
- data-entry/ct_town_acs_2019_23.csv: ACS 5-year town-level estimates, aggregated back
  up to CT's 8 legacy counties via data-entry/ct_town_to_planning_region.csv (neither
  of the two main sources reports below CT's 2022 planning-region reorg).
Run from project root: python3 scripts/generate-county-demographics-data.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
CHR_SRC = os.path.join(ROOT, "data-entry/county_health_rankings_2025.csv")
EDU_SRC = os.path.join(ROOT, "data-entry/usda_ers_education_2019_23.csv")
CT_TOWN_ACS_SRC = os.path.join(ROOT, "data-entry/ct_town_acs_2019_23.csv")
CT_CROSSWALK_SRC = os.path.join(ROOT, "data-entry/ct_town_to_planning_region.csv")
DST = os.path.join(ROOT, "data/countyDemographics.ts")

EDU_ATTR = "Percent of adults with a bachelor's degree or higher, 2019-23"


def read_chr():
    """fips -> {white, black, hispanic, asian, income, population}, pcts already *100."""
    out = {}
    with open(CHR_SRC, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        next(r)  # human-readable label row
        codes = next(r)  # machine variable-code row (the real header)
        idx = {c: i for i, c in enumerate(codes)}
        for row in r:
            fips = row[idx["fipscode"]]
            if fips.endswith("000"):  # state-level rollup row, not a county
                continue

            def pct(col):
                v = row[idx[col]]
                return round(float(v) * 100, 1) if v else None

            income_raw = row[idx["v063_rawvalue"]]
            pop_raw = row[idx["v051_rawvalue"]]
            out[fips] = {
                "white": pct("v126_rawvalue"),
                "black": pct("v054_rawvalue"),
                "hispanic": pct("v056_rawvalue"),
                "asian": pct("v081_rawvalue"),
                "income": int(round(float(income_raw))) if income_raw else None,
                "population": int(round(float(pop_raw))) if pop_raw else None,
            }
    return out


def weighted_avg(pairs):
    """pairs = [(value, weight), ...]; skips any pair with a None value or weight."""
    usable = [(v, w) for v, w in pairs if v is not None and w is not None]
    total_w = sum(w for _, w in usable)
    if not usable or total_w == 0:
        return None
    return sum(v * w for v, w in usable) / total_w


def synthesize_ak_valdez_cordova(chr_data, edu_data):
    """AK's Valdez-Cordova (02261) was split into Chugach (02063) and Copper River
    (02066) in 2019 - neither source reports it under the old FIPS anymore, but both
    successor areas are fully covered, so reconstruct it as their population-weighted
    blend (an exact recombination of the same historical geography, not an estimate
    across different geographies like CT's planning-region gap)."""
    parts = ["02063", "02066"]
    weights = [chr_data.get(f, {}).get("population") for f in parts]
    if any(w is None for w in weights) or "02261" in chr_data:
        return

    def blend(field):
        return weighted_avg([(chr_data[f].get(field), w) for f, w in zip(parts, weights)])

    chr_data["02261"] = {
        "white": round(blend("white"), 1) if blend("white") is not None else None,
        "black": round(blend("black"), 1) if blend("black") is not None else None,
        "hispanic": round(blend("hispanic"), 1) if blend("hispanic") is not None else None,
        "asian": round(blend("asian"), 1) if blend("asian") is not None else None,
        "income": int(round(blend("income"))) if blend("income") is not None else None,
        "population": sum(weights),
    }
    edu_vals = [(edu_data.get(f), w) for f, w in zip(parts, weights)]
    edu_blend = weighted_avg(edu_vals)
    if edu_blend is not None:
        edu_data["02261"] = round(edu_blend, 1)


def synthesize_ct_counties(chr_data, edu_data):
    """CT retired its 8 counties for 9 planning regions in 2022; neither main source
    reports below that new geography. Reconstructs each old county by aggregating real
    ACS town-level data (data-entry/ct_town_acs_2019_23.csv, fetched via
    scripts/fetch-ct-town-acs.py - requires a Census API key) up through
    data-entry/ct_town_to_planning_region.csv's town -> old-county crosswalk, weighted
    by each town's own ACS population. This is an exact bottom-up reconstruction from
    the towns that actually made up each old county, not an estimate from the new
    regions (which was evaluated and declined - see project memory)."""
    if not os.path.exists(CT_TOWN_ACS_SRC):
        return  # no Census API key on hand yet; leave CT's 8 counties as a gap

    town_stats = {}  # cousub -> {college, white, black, hispanic, asian, income, population}
    with open(CT_TOWN_ACS_SRC, newline="") as f:
        for row in csv.DictReader(f):

            def val(col):
                v = row[col]
                return float(v) if v not in ("", None) and float(v) >= 0 else None

            town_stats[row["county subdivision"]] = {
                "college": val("DP02_0068PE"),
                "white": val("DP05_0082PE"),
                "black": val("DP05_0083PE"),
                "hispanic": val("DP05_0076PE"),
                "asian": val("DP05_0085PE"),
                "income": val("DP03_0062E"),
                "population": val("DP05_0001E"),
            }

    county_towns = {}  # old 3-digit county code -> [cousub, ...]
    with open(CT_CROSSWALK_SRC, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            old_fips = row["town_fips_2020"].zfill(10)
            old_county = old_fips[2:5]
            new_fips = row["town_fips_2022"].zfill(10)
            cousub = new_fips[5:10]
            county_towns.setdefault(old_county, []).append(cousub)

    for old_county, cousubs in county_towns.items():
        towns = [town_stats[c] for c in cousubs if c in town_stats]
        if not towns:
            continue
        fips = f"09{old_county}"

        def blend(field):
            v = weighted_avg([(t[field], t["population"]) for t in towns])
            return round(v, 1) if v is not None else None

        chr_data[fips] = {
            "white": blend("white"),
            "black": blend("black"),
            "hispanic": blend("hispanic"),
            "asian": blend("asian"),
            "income": int(round(blend("income"))) if blend("income") is not None else None,
            "population": sum(t["population"] for t in towns if t["population"] is not None),
        }
        college = blend("college")
        if college is not None:
            edu_data[fips] = college


def read_edu():
    """fips -> % bachelor's degree or higher (2019-23 ACS vintage)."""
    out = {}
    with open(EDU_SRC, newline="", encoding="latin-1") as f:
        for row in csv.DictReader(f):
            if row["Attribute"] != EDU_ATTR:
                continue
            fips = row["FIPS Code"].zfill(5)
            if fips.endswith("000"):  # state/national rollup row, not a county
                continue
            out[fips] = round(float(row["Value"]), 1)
    return out


chr_data = read_chr()
edu_data = read_edu()
synthesize_ak_valdez_cordova(chr_data, edu_data)
synthesize_ct_counties(chr_data, edu_data)

all_fips = sorted(set(chr_data) | set(edu_data))

out = [
    "// Auto-generated by scripts/generate-county-demographics-data.py",
    "// Sources: County Health Rankings & Roadmaps 2025 national analytic data file",
    "// (race/ethnicity shares, median household income) and USDA ERS's county-level",
    "// education dataset, 2019-23 ACS 5-year vintage (bachelor's-degree-or-higher share).",
    "// Both are ACS-derived, no API key required. Key = 5-digit county FIPS (matches",
    "// public/us-counties.json's geo.id). Fields are omitted (not zero) where the source",
    "// has no value for that county. AK's retired Valdez-Cordova (02261, split into",
    "// Chugach/Copper River in 2019) is synthesized as a population-weighted blend of its",
    "// two successor areas (see synthesize_ak_valdez_cordova) - an exact recombination of",
    "// the same historical geography, not a cross-geography estimate. CT's 8 legacy",
    "// counties (09001-09015, retired for 9 planning regions in 2022 - neither main",
    "// source reports below that new geography) are reconstructed via a THIRD source,",
    "// data-entry/ct_town_acs_2019_23.csv (real ACS town-level data, Census API, key",
    "// required - see fetch-ct-town-acs.py), aggregated back up through each old county's",
    "// actual constituent towns (data-entry/ct_town_to_planning_region.csv), population-",
    "// weighted (see synthesize_ct_counties). If that source file is absent, CT's 8",
    "// counties are left with no entry rather than guessed.",
    "",
    "export type CountyDemographics = {",
    "  collegePct?: number; // % of adults 25+ with a bachelor's degree or higher",
    "  whitePct?: number; // % White, not Hispanic or Latino",
    "  blackPct?: number; // % Black or African American, not Hispanic or Latino",
    "  hispanicPct?: number; // % Hispanic or Latino (any race)",
    "  asianPct?: number; // % Asian alone",
    "  medianHouseholdIncome?: number; // dollars",
    "};",
    "",
    "export const countyDemographics: Record<string, CountyDemographics> = {",
]

for fips in all_fips:
    chr_row = chr_data.get(fips, {})
    edu_pct = edu_data.get(fips)
    fields = []
    if edu_pct is not None:
        fields.append(f"collegePct: {edu_pct}")
    if chr_row.get("white") is not None:
        fields.append(f'whitePct: {chr_row["white"]}')
    if chr_row.get("black") is not None:
        fields.append(f'blackPct: {chr_row["black"]}')
    if chr_row.get("hispanic") is not None:
        fields.append(f'hispanicPct: {chr_row["hispanic"]}')
    if chr_row.get("asian") is not None:
        fields.append(f'asianPct: {chr_row["asian"]}')
    if chr_row.get("income") is not None:
        fields.append(f'medianHouseholdIncome: {chr_row["income"]}')
    if not fields:
        continue
    out.append(f'  "{fips}": {{ {", ".join(fields)} }},')

out += ["};", ""]

with open(DST, "w") as f:
    f.write("\n".join(out))

print(f"Written {len(all_fips)} counties -> {DST}")
