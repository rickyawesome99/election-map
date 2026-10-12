// The district code of a boundary polygon, computed from its TIGER properties the same way the
// roster's `number` is. Shared by every map that keys polygons to district rows.
import type { Chamber } from "@/data/stateLegDistricts";

// Mirrors BOUNDARY_CODE_OVERRIDES/extractDistrictCode in scripts/build-state-leg-incumbents.mjs —
// that script computes each StateLegDistrict's `number` from the boundary file's DISTRICT/NAMELSAD
// properties (not a plain DISTRICT lookup), because DISTRICT alone is truncated to a plain integer
// and can collapse two real districts (e.g. ND House "4A"/"4B" both report DISTRICT "4") or, for a
// few states, doesn't correspond to Open States' numbering scheme at all (MA's named districts, AK
// Senate's lettered districts). The map must key off the same computed code as `number`, or split
// districts fall through to the default fill with no hover tooltip. Keep in sync with the build
// script if a future state needs a new override there, and with the copy in
// scripts/verify-state-leg-historical-maps.mjs, which checks the same join for past years.
//
// The suffixes are matched loosely because TIGER has renamed these layers across vintages: a
// Vermont Senate district is "Bennington Senatorial District" in the current file and "Bennington
// State Senate District" in the 2020 one, and the historical maps go through this same function.
const BOUNDARY_CODE_OVERRIDES: Record<string, (properties: { NAMELSAD?: string }) => string | undefined> = {
  MA_house: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  MA_senate: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  AK_senate: (properties) => properties.NAMELSAD?.trim().split(/\s+/).pop(),
  // VT districts are named, not numbered — DISTRICT is "NaN". Confirmed via research, 2026-08-26.
  // NH numbers its House districts within each county. The current (custom-sourced) file already
  // carries them as "BE1"/"CH14" in DISTRICT, but TIGER spells the same district out as "State
  // House District Belknap County No. 1" with a DISTRICT of "6" that repeats across counties -
  // so the county's first two letters are put back in front, which is exactly the state's own
  // code. Returns nothing for the current file, which falls through to its DISTRICT.
  NH_house: (properties) => {
    const parts = properties.NAMELSAD?.match(/District\s+(\S+)\s+County\s+No\.\s*(\d+)$/);
    return parts ? `${parts[1].slice(0, 2).toUpperCase()}${Number(parts[2])}` : undefined;
  },
  VT_house: (properties) => properties.NAMELSAD?.replace(/\s+(State\s+)?House\s+District$/, ""),
  VT_senate: (properties) => properties.NAMELSAD?.replace(/\s+((State\s+)?Senate|Senatorial)\s+District$/, ""),
};

export function extractDistrictCode(stateAbbr: string, chamber: Chamber, properties: { DISTRICT?: string; NAMELSAD?: string }): string | undefined {
  // An override that returns nothing falls through to the default rules - NH_house needs that,
  // because only the historical files carry the county-phrased name it rewrites.
  const overridden = BOUNDARY_CODE_OVERRIDES[`${stateAbbr}_${chamber}`]?.(properties);
  if (overridden) return overridden;
  const { DISTRICT, NAMELSAD } = properties;
  const lastToken = NAMELSAD?.trim().split(/\s+/).pop();
  if (lastToken && DISTRICT && new RegExp(`^0*${DISTRICT}[A-Za-z]+$`).test(lastToken)) {
    return lastToken;
  }
  return DISTRICT;
}
