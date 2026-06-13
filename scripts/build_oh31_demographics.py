"""
Build OH-31 precinct-level demographic GeoJSON.

Sources:
  - RDH: oh_2024_gen_sldl_prec  (precinct boundaries, SLDL_DIST filter)
  - RDH: oh_2024_gen_2020_blocks (block→precinct crosswalk via PRECINCTID=UNIQUE_ID)
  - RDH: oh_dhc_2020_b           (block-level age/population)
  - RDH: oh_cvap_2024_2020_b     (block-level race/ethnicity)
  - NHGIS: nhgis0001_ds272_20245_blck_grp (block-group ACS: income, education)

Output: public/oh31-demographics.geojson
"""

import geopandas as gpd
import pandas as pd
import numpy as np
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
RDH = DOWNLOADS / "rdh_extracted"
NHGIS = DOWNLOADS / "nhgis_extracted" / "nhgis0001_csv"
OUT = Path(__file__).parent.parent / "public" / "oh31-demographics.geojson"

DISTRICT = "031"

# ── 1. Load OH-31 precinct boundaries ────────────────────────────────────────
print("Loading SLDL precinct shapefile...")
prec = gpd.read_file(RDH / "oh_2024_gen_sldl_prec" / "oh_2024_gen_sldl_prec.shp")
oh31 = prec[prec["SLDL_DIST"] == DISTRICT].copy()
print(f"  OH-31 precincts: {len(oh31)}")
# Some split precincts have "-(SLDL-31)" appended to UNIQUE_ID; strip it for crosswalk lookup
oh31["LOOKUP_ID"] = oh31["UNIQUE_ID"].str.replace(r"-\(SLDL-\d+\)$", "", regex=True)
oh31_ids = set(oh31["LOOKUP_ID"].values)

# ── 2. Load block→precinct crosswalk, filter to OH-31 ────────────────────────
print("Loading block crosswalk (large file, may take a minute)...")
blocks_gdf = gpd.read_file(
    RDH / "oh_2024_gen_2020_blocks" / "oh_2024_gen_2020_blocks.shp"
)
oh31_blocks = blocks_gdf[blocks_gdf["PRECINCTID"].isin(oh31_ids)][["GEOID20", "PRECINCTID"]].copy()
# Map base PRECINCTID back to UNIQUE_ID (handles split precincts with -(SLDL-31) suffix)
lookup_to_unique = dict(zip(oh31["LOOKUP_ID"], oh31["UNIQUE_ID"]))
oh31_blocks["PRECINCTID"] = oh31_blocks["PRECINCTID"].map(lookup_to_unique).fillna(oh31_blocks["PRECINCTID"])
oh31_blocks.reset_index(drop=True, inplace=True)
del blocks_gdf
print(f"  OH-31 blocks: {len(oh31_blocks)}")
oh31_geoids = set(oh31_blocks["GEOID20"].values)

# ── 3. DHC blocks: age / total population ────────────────────────────────────
print("Loading DHC block data...")
dhc = pd.read_csv(RDH / "oh_dhc_2020_b.csv", dtype={"GEOID20": str})
dhc = dhc[dhc["GEOID20"].isin(oh31_geoids)].copy()

age_pairs = [
    ("age_under18", ["U5_M","5_9_M","10_14_M","15_17_M","U5_F","5_9_F","10_14_F","15_17_F"]),
    ("age_18_34",   ["18_19_M","20_M","21_M","22_24_M","25_29_M","30_34_M",
                     "18_19_F","20_F","21_F","22_24_F","25_29_F","30_34_F"]),
    ("age_35_64",   ["35_39_M","40_44_M","45_49_M","50_54_M","55_59_M","60_61_M","62_64_M",
                     "35_39_F","40_44_F","45_49_F","50_54_F","55_59_F","60_61_F","62_64_F"]),
    ("age_65plus",  ["65_66_M","67_69_M","70_74_M","75_79_M","80_84_M","85_O_M",
                     "65_66_F","67_69_F","70_74_F","75_79_F","80_84_F","85_O_F"]),
]
dhc["total_pop"] = pd.to_numeric(dhc["TOT_POP"], errors="coerce").fillna(0)
for label, cols in age_pairs:
    present = [c for c in cols if c in dhc.columns]
    dhc[label] = dhc[present].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1)

agg_cols = ["total_pop"] + [p[0] for p in age_pairs]
dhc_by_prec = (
    oh31_blocks.merge(dhc[["GEOID20"] + agg_cols], on="GEOID20", how="left")
    .groupby("PRECINCTID")[agg_cols]
    .sum()
    .reset_index()
)
print(f"  DHC aggregated to {len(dhc_by_prec)} precincts")

# ── 4. CVAP blocks: race/ethnicity ───────────────────────────────────────────
print("Loading CVAP block data...")
cvap = pd.read_csv(RDH / "oh_cvap_2024_2020_b.csv", dtype={"GEOID20": str})
cvap = cvap[cvap["GEOID20"].isin(oh31_geoids)].copy()

race_map = {
    "pop_total":    "C_TOT24",
    "pop_hispanic": "C_HSP24",
    "pop_white":    "C_WHT24",
    "pop_black":    "C_BLA24",
    "pop_asian":    "C_ASI24",
    "pop_native":   "C_AMI24",
    "pop_pacific":  "C_NHP24",
    "pop_multi":    "C_2OM24",
}
for new_col, src_col in race_map.items():
    cvap[new_col] = pd.to_numeric(cvap.get(src_col, 0), errors="coerce").fillna(0)

race_cols = list(race_map.keys())
cvap_by_prec = (
    oh31_blocks.merge(cvap[["GEOID20"] + race_cols], on="GEOID20", how="left")
    .groupby("PRECINCTID")[race_cols]
    .sum()
    .reset_index()
)
for col in race_cols[1:]:
    pct_col = col.replace("pop_", "pct_")
    cvap_by_prec[pct_col] = (
        cvap_by_prec[col] / cvap_by_prec["pop_total"].replace(0, np.nan) * 100
    ).round(1)
print(f"  CVAP aggregated to {len(cvap_by_prec)} precincts")

# ── 5. NHGIS ACS: income + education (block group → precinct) ────────────────
print("Loading NHGIS ACS block group data...")
acs = pd.read_csv(NHGIS / "nhgis0001_ds272_20245_blck_grp.csv", dtype=str, low_memory=False)
acs = acs[acs["STUSAB"] == "OH"].copy()
acs["blkgrp_geoid"] = acs["GEO_ID"].str[9:]  # strip "1500000US" prefix → 12-digit FIPS

acs["med_hh_income"] = pd.to_numeric(acs["AURUE001"], errors="coerce")
acs.loc[acs["med_hh_income"] < 0, "med_hh_income"] = np.nan

edu_cols = [f"AUQ8E{str(i).zfill(3)}" for i in range(1, 26)]
for c in edu_cols:
    acs[c] = pd.to_numeric(acs[c], errors="coerce").fillna(0)
acs["edu_total"] = acs["AUQ8E001"]
acs["edu_bachelors_plus"] = acs[["AUQ8E022","AUQ8E023","AUQ8E024","AUQ8E025"]].sum(axis=1)
acs["pct_bachelors_plus"] = (
    acs["edu_bachelors_plus"] / acs["edu_total"].replace(0, np.nan) * 100
).round(1)

# No HS diploma: no schooling (002) through 12th grade no diploma (016)
no_hs_cols = [f"AUQ8E{str(i).zfill(3)}" for i in range(2, 17)]
acs["edu_no_hs"] = acs[no_hs_cols].sum(axis=1)
acs["pct_no_hs_diploma"] = (
    acs["edu_no_hs"] / acs["edu_total"].replace(0, np.nan) * 100
).round(1)

# Some college or associate's: some college <1yr (019), 1+yr no degree (020), associate's (021)
acs["edu_some_college"] = acs[["AUQ8E019","AUQ8E020","AUQ8E021"]].sum(axis=1)
acs["pct_some_college"] = (
    acs["edu_some_college"] / acs["edu_total"].replace(0, np.nan) * 100
).round(1)

acs_lookup = acs.set_index("blkgrp_geoid")[["med_hh_income", "pct_bachelors_plus", "pct_no_hs_diploma", "pct_some_college"]].copy()

oh31_blocks["blkgrp_geoid"] = oh31_blocks["GEOID20"].str[:12]
oh31_blocks_acs = oh31_blocks.join(acs_lookup, on="blkgrp_geoid", how="left")
oh31_blocks_acs = oh31_blocks_acs.merge(
    dhc[["GEOID20", "total_pop"]], on="GEOID20", how="left"
)
oh31_blocks_acs["total_pop"] = oh31_blocks_acs["total_pop"].fillna(0)

def pop_weighted_mean(group, val_col):
    vals = group[val_col]
    wts = group["total_pop"]
    valid = vals.notna()
    if not valid.any():
        return np.nan
    return np.average(vals[valid], weights=wts[valid].clip(lower=0).replace(0, 1))

acs_by_prec = (
    oh31_blocks_acs.groupby("PRECINCTID")
    .apply(lambda g: pd.Series({
        "med_hh_income":      pop_weighted_mean(g, "med_hh_income"),
        "pct_bachelors_plus": pop_weighted_mean(g, "pct_bachelors_plus"),
        "pct_no_hs_diploma":  pop_weighted_mean(g, "pct_no_hs_diploma"),
        "pct_some_college":   pop_weighted_mean(g, "pct_some_college"),
    }))
    .reset_index()
)
acs_by_prec["med_hh_income"] = acs_by_prec["med_hh_income"].round(0)
print(f"  ACS aggregated to {len(acs_by_prec)} precincts")

# ── 6. Merge all data onto OH-31 precinct geometries ─────────────────────────
print("Merging onto precinct geometries...")
result = oh31.merge(dhc_by_prec, left_on="UNIQUE_ID", right_on="PRECINCTID", how="left")
result = result.merge(
    cvap_by_prec[["PRECINCTID","pop_hispanic","pop_white","pop_black","pop_asian",
                  "pct_hispanic","pct_white","pct_black","pct_asian","pct_native","pct_multi"]],
    left_on="UNIQUE_ID", right_on="PRECINCTID", how="left"
)
result = result.merge(acs_by_prec, left_on="UNIQUE_ID", right_on="PRECINCTID", how="left")

# ── 7. Select output columns and export ──────────────────────────────────────
out_cols = [
    "UNIQUE_ID","PRECNAME","PRECCODE","COUNTYFP","County","SLDL_DIST",
    "total_pop",
    "age_under18","age_18_34","age_35_64","age_65plus",
    "pop_hispanic","pop_white","pop_black","pop_asian",
    "pct_hispanic","pct_white","pct_black","pct_asian","pct_native","pct_multi",
    "med_hh_income","pct_bachelors_plus","pct_no_hs_diploma","pct_some_college",
    "geometry",
]
result_out = result[[c for c in out_cols if c in result.columns]].copy()
result_out = result_out.to_crs(epsg=4326)

print(f"Writing to {OUT}...")
result_out.to_file(OUT, driver="GeoJSON")
print(f"\nDone. {len(result_out)} precincts written.")
print(result_out[["PRECNAME","total_pop","pct_white","pct_black","med_hh_income"]].head(8).to_string())
