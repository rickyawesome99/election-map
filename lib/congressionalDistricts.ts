export function isCongressionalDistrictGeoid(
  geoid: string | undefined,
  stateFips?: string,
): geoid is string {
  return typeof geoid === "string"
    && /^\d{4}$/.test(geoid)
    && (!stateFips || geoid.startsWith(stateFips));
}

/** Picks the congressional map in effect for a given election year. Off-cycle years (e.g.
 * odd-year governor races) use whichever map was current at the time — the boundary is
 * the next even redistricting-cycle year, not the year itself, so 2023 must still resolve
 * to the 2022 map (no redistricting occurred between them) rather than falling through to
 * 2024's map, which does differ for several states (confirmed for KY/MS/LA, which is what
 * actually matters since those are the states with real 2023 governor races). */
export function getCongressionalDistrictsGeoUrl(year: number): string {
  if (year <= 2017) return "/congressional-districts-2016.json";
  if (year <= 2019) return "/congressional-districts-2018.json";
  if (year <= 2021) return "/congressional-districts-pre2022.json";
  if (year <= 2023) return "/congressional-districts-2022.json";
  return "/congressional-districts-2024.json";
}

/**
 * At-large districts: our data (house_past_results.csv etc.) always keys them "XX01",
 * but the Census TIGER GEOID uses "XX00". Adds the missing alias to a geoid->value map
 * so lookups succeed regardless of which convention the caller used.
 */
export function withAtLargeAlias<T>(map: Map<string, T>, geoid: string, value: T): void {
  map.set(geoid, value);
  if (geoid.endsWith("01")) map.set(geoid.slice(0, -2) + "00", value);
  if (geoid.endsWith("00")) map.set(geoid.slice(0, -2) + "01", value);
}
