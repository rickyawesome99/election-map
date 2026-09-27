import "server-only";

import { countyPresidentialData } from "@/data/countyPresidentialData";
import { calculateCountyModel } from "@/lib/tplCompute";
import { ABBR_TO_FIPS } from "@/lib/fips";

/** County TPL for every county of one state (fips → TPL, or null where the model has no
 * neutralized margin to rest on) — what StateCountyMap paints when `showTpl` is on. */
export function countyTplForState(stateAbbr: string): Record<string, number | null> {
  const prefix = ABBR_TO_FIPS[stateAbbr];
  const out: Record<string, number | null> = {};
  if (!prefix) return out;
  for (const fips of Object.keys(countyPresidentialData)) {
    if (!fips.startsWith(prefix)) continue;
    const calc = calculateCountyModel(fips);
    out[fips] = calc && calc.races.some((race) => race.NM != null) ? calc.tpl : null;
  }
  return out;
}
