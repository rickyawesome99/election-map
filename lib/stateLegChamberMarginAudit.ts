import "server-only";

import { statesData } from "@/data/statesData";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { getChamberMargins } from "@/lib/stateLegChamberMargin";

/**
 * /audit/state-leg-results section 5: the raw chamber aggregate against the corrected margin that
 * feeds the State TPL (lib/stateLegChamberMargin.ts), one row per chamber-year, computed on the
 * server so only the few hundred summary rows reach the browser.
 */
export type ChamberMarginAuditRow = {
  abbr: string;
  state: string;
  chamber: Chamber;
  chamberLabel: string;
  year: number;
  era: string;
  districts: number;
  contested: number;
  imputed: number;
  skipped: number;
  srcYear: number | null;
  turnoutRatio: number;
  rawMargin: number | null;
  contestedMargin: number | null;
  imputedMargin: number | null;
  /** Imputed pool's share of the corrected margin's weight. */
  imputedShare: number;
  correctedMargin: number | null;
  /** corrected − raw, R-positive. */
  shift: number | null;
};

export function buildChamberMarginAuditRows(): ChamberMarginAuditRow[] {
  const rows: ChamberMarginAuditRow[] = [];
  for (const state of statesData) {
    const years = getChamberMargins(state.abbr);
    for (const y of Object.values(years)) {
      for (const d of y.chambers) {
        const corrected = d.contested.weight + d.imputed.weight > 0
          ? ((d.contested.margin ?? 0) * d.contested.weight + (d.imputed.margin ?? 0) * d.imputed.weight) / (d.contested.weight + d.imputed.weight)
          : null;
        rows.push({
          abbr: state.abbr, state: state.name, chamber: d.chamber,
          chamberLabel: UNICAMERAL_STATES.has(state.abbr) ? "Legislature" : d.chamber === "house" ? "House" : "Senate",
          year: y.year, era: d.era === "current" ? "current" : `${d.era} map`,
          districts: d.contested.districts + d.imputed.districts + d.skipped,
          contested: d.contested.districts, imputed: d.imputed.districts, skipped: d.skipped,
          srcYear: d.srcYear, turnoutRatio: d.turnoutRatio,
          rawMargin: d.rawMargin, contestedMargin: d.contested.margin, imputedMargin: d.imputed.margin,
          imputedShare: d.contested.weight + d.imputed.weight > 0 ? d.imputed.weight / (d.contested.weight + d.imputed.weight) : 0,
          correctedMargin: corrected,
          shift: corrected != null && d.rawMargin != null ? corrected - d.rawMargin : null,
        });
      }
    }
  }
  void stateLegDistricts;
  return rows.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamber.localeCompare(b.chamber) || a.year - b.year);
}
