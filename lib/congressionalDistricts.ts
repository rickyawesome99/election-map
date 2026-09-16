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
 * actually matters since those are the states with real 2023 governor races).
 *
 * Each file's vintage was verified county-by-county against the matching Census
 * cartographic boundary release on 2026-09-16 (see the audit note below); two of them
 * had been built from the wrong Congress and were rebuilt then:
 *
 *   2016.json     115th  cb_2016_us_cd115_500k   (was the 114th — FL/NC/VA all redrew
 *                                                 for 2016 and were showing 2014 lines)
 *   2018.json     116th  cb_2018_us_cd116_500k
 *   pre2022.json  117th  cb_2020_us_cd116_500k   (116th as of 2020, i.e. NC's 2019 redraw)
 *   2022.json     118th  cb_2022_us_cd118_500k   (was the 119th — GA/LA/NC/NY were
 *                                                 showing 2024 lines; AL was already right)
 *   2024.json     119th
 *
 * Verifying one of these: compare county representative points, NOT polygon IoU —
 * these files are simplified to ~50 vertices per district, which drops IoU against a
 * full-resolution reference far enough (Louisiana scored 0.47 against its own correct
 * map) to hide a wholesale wrong-map substitution. */
export function getCongressionalDistrictsGeoUrl(year: number): string {
  if (year <= 2017) return "/congressional-districts-2016.json";
  if (year <= 2019) return "/congressional-districts-2018.json";
  if (year <= 2021) return "/congressional-districts-pre2022.json";
  if (year <= 2023) return "/congressional-districts-2022.json";
  if (year <= 2025) return "/congressional-districts-2024.json";
  return "/congressional-districts-2026.json";
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
