import { presPastResults } from "@/data/forecastData";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegPres2024 } from "@/data/stateLegPres2024";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import type { Chamber } from "@/data/stateLegDistricts";

/**
 * Aggregation for /audit/state-leg-results section 4, computed on the server: the presidential-
 * by-era table is several megabytes of per-district rows and the audit needs one row per
 * chamber-era. Two checks per row:
 *
 *   1. The era's district sum against the certified statewide presidential result, per election.
 *      The overlay allocates every VTD in full, so a non-zero diff means Dave's Redistricting's own
 *      statewide figure differs from the certified one (a few states are a handful of precincts
 *      short), not that the overlay lost votes.
 *   2. For the CURRENT map only, the overlay's 2024 margin per district against the precinct-exact
 *      figure in data/stateLegPres2024.ts. That is the one cell with an independent answer, so it
 *      measures the method's error for the state; the superseded eras inherit it. Districts whose
 *      2024 figure is itself an estimate are excluded, and a state whose pres2024 file came from
 *      the same DRA overlay reads 0.00 by construction.
 */

export type PresByEraElectionDiff = {
  year: 2016 | 2020 | 2024;
  demDiff: number | null;
  repDiff: number | null;
  totalDiff: number | null;
};

export type PresByEraAuditRow = {
  abbr: string;
  chamber: Chamber;
  chamberLabel: string;
  /** "current" or the boundary vintage. */
  era: string;
  /** Election years held on these lines (empty for the current map, which the index leaves implicit). */
  years: number[];
  districts: number;
  pop2020: number;
  /** Median share of a district's presidential votes that came through split VTDs. */
  medianSplitPct: number;
  diffs: PresByEraElectionDiff[];
  holdout: { n: number; mae: number; max: number } | null;
};

const CHAMBER_LABEL: Record<Chamber, string> = { house: "House", senate: "Senate" };

function certified(abbr: string, year: number): { dem: number; rep: number; total: number } | null {
  const r = (presPastResults[abbr] ?? []).find((x) => x.year === year);
  if (!r || r.demVotes == null || r.repVotes == null || r.totalVotes == null) return null;
  return { dem: r.demVotes, rep: r.repVotes, total: r.totalVotes };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function buildPresByEraAuditRows(): PresByEraAuditRow[] {
  const rows: PresByEraAuditRow[] = [];
  for (const [abbr, chambers] of Object.entries(stateLegPresByEra)) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const eras = chambers[chamber];
      if (!eras) continue;
      const yearIndex = stateLegHistoricalMaps[abbr]?.[chamber] ?? {};
      for (const [era, districts] of Object.entries(eras)) {
        const entries = Object.values(districts);
        const diffs: PresByEraElectionDiff[] = [];
        for (const year of [2016, 2020, 2024] as const) {
          const key = String(year) as "2016" | "2020" | "2024";
          const present = entries.filter((e) => e[key]);
          if (present.length === 0) continue;
          const dem = present.reduce((s, e) => s + e[key]!.demVotes, 0);
          const rep = present.reduce((s, e) => s + e[key]!.repVotes, 0);
          const total = present.reduce((s, e) => s + e[key]!.totalVotes, 0);
          const cert = certified(abbr, year);
          diffs.push({
            year,
            demDiff: cert ? dem - cert.dem : null,
            repDiff: cert ? rep - cert.rep : null,
            totalDiff: cert ? total - cert.total : null,
          });
        }
        let holdout: PresByEraAuditRow["holdout"] = null;
        if (era === "current") {
          const exact = stateLegPres2024[abbr]?.[chamber] ?? {};
          const errs: number[] = [];
          for (const [code, e] of Object.entries(exact)) {
            const ov = districts[code]?.["2024"];
            if (e.estimated || !ov) continue;
            errs.push(Math.abs(ov.margin - e.margin));
          }
          if (errs.length) holdout = { n: errs.length, mae: errs.reduce((a, b) => a + b, 0) / errs.length, max: Math.max(...errs) };
        }
        rows.push({
          abbr,
          chamber,
          chamberLabel: CHAMBER_LABEL[chamber],
          era,
          years: Object.entries(yearIndex).filter(([, v]) => String(v) === era).map(([y]) => Number(y)).sort(),
          districts: entries.length,
          pop2020: entries.reduce((s, e) => s + e.pop2020, 0),
          medianSplitPct: median(entries.map((e) => e.splitPct)),
          diffs,
          holdout,
        });
      }
    }
  }
  rows.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamber.localeCompare(b.chamber) || (a.era === "current" ? 1 : b.era === "current" ? -1 : a.era.localeCompare(b.era)));
  return rows;
}
