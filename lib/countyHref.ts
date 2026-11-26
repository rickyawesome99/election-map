import { FIPS_TO_STATE } from "@/lib/fips";

/**
 * The URL of a county's page: /states/{state}/counties/{fips} (the pages lived at
 * /historical/{fips} until 2026-11-25; next.config.ts redirects the old URLs). Every link to a
 * county page goes through here so the shape lives in one place.
 */
export function countyHref(fips: string): string {
  const abbr = FIPS_TO_STATE[fips.slice(0, 2)]?.abbr;
  return abbr ? `/states/${abbr.toLowerCase()}/counties/${fips}` : `/historical/${fips}`;
}

/** Matches a county page's pathname. */
export const COUNTY_PATH = /^\/states\/[^/]+\/counties\/\d{5}$/;
