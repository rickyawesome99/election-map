import { statesData } from "@/data/statesData";
import { stateLegData } from "@/data/forecastData";
import { UNICAMERAL_STATES } from "@/data/stateLegDistricts";

/**
 * How many chamber-years are in scope for the 2016-2025 project — the denominator the audit page's
 * district-coverage line is measured against. Kept here rather than imported from the coverage
 * table so the aggregate section does not have to pull in a client component to count rows.
 */
export function buildCoverageChamberYearCount(): number {
  let n = 0;
  for (const state of statesData) {
    if (state.abbr === "DC") continue;
    for (const e of stateLegData[state.name] ?? []) {
      if (e.year < 2016 || e.year > 2025) continue;
      // Nebraska's unicameral body lives in the "House" rows; its "Senate" rows are placeholders.
      if (UNICAMERAL_STATES.has(state.abbr) && e.type === "Senate") continue;
      n += 1;
    }
  }
  return n;
}
