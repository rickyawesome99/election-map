import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The district-by-county U.S. House rows as the 2026 model read them. Six districts were repaired from
// precinct returns after the lock (scripts/precincts/correct_site_house_counties.py: New Hampshire 1 and 2
// and Missouri 5 in 2016, Illinois 3, 4 and 6 in 2022). The model is locked and graded as published, so it
// keeps the rows it was built on: today's file with those districts put back as they stood (a district that
// had no rows at the lock has none here). Pages about past elections read the corrected file directly.

export type HouseDistrictCountyCsvRow = Record<string, string>;

function parse(text: string): HouseDistrictCountyCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

let cache: HouseDistrictCountyCsvRow[] | null = null;

export function houseDistrictCountyRowsAtLock(): HouseDistrictCountyCsvRow[] {
  if (cache) return cache;
  const now = parse(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8"));
  const locked = parse(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results_locked2026.csv"), "utf8"));
  const key = (r: HouseDistrictCountyCsvRow) => `${r.year}|${r.state}|${r.district}`;
  const repaired = new Set(locked.map(key));
  cache = [...now.filter((r) => !repaired.has(key(r))), ...locked.filter((r) => r.status !== "absent")];
  return cache;
}
