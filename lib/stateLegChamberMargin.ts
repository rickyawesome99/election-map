import "server-only";

import { stateLegResults } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";

/**
 * The corrected state-legislative chamber margin behind the State TPL's "State Legislature" rows.
 *
 * The raw chamber aggregate — every district's votes summed — reports the margin of whichever
 * seats happened to be contested: a chamber where 40% of seats were unopposed is measured on the
 * other 60%, and the unopposed seats are not a random sample. The House rows of the state model
 * solved this per district (an uncontested seat is imputed from its presidential lean on the lines
 * it was run on, and enters at its turnout share); this module applies the same rule to every
 * state legislative district and re-aggregates.
 *
 * Per chamber-year, each district is one of:
 *   contested  both major parties drew votes → its own margin and total vote;
 *   imputed    no count, or one major party absent → the district's presidential margin on the
 *              map it was run on (data/stateLegPresByEra.ts, the presidential year nearest the
 *              race, later on a tie), weighted by that presidential total scaled to the chamber's
 *              legislative/presidential turnout ratio among its contested seats;
 *   skipped    ineligible with no presidential figure on its lines (New Hampshire floterials,
 *              a key the boundary data does not carry) — counted, not guessed.
 *
 * The state model carries the two pools as two rows per year: the contested pool is an ordinary
 * eligible row (raw margin, environment of its own year); the imputed pool is an ineligible row
 * whose imputation is preset here, so it strips the environment of its SOURCE presidential year
 * exactly as an imputed House seat does. One source year per chamber-year keeps that well-defined.
 */

export interface ChamberPool {
  /** R-positive margin as a share of the full total, or null when the pool is empty. */
  margin: number | null;
  /** Turnout behind the pool: votes cast (contested) or scaled presidential votes (imputed). */
  weight: number;
  districts: number;
}

export interface ChamberMarginDetail {
  chamber: Chamber;
  era: string;
  srcYear: number | null;
  /** Legislative votes per presidential vote among the contested seats (1 when none). */
  turnoutRatio: number;
  contested: ChamberPool;
  imputed: ChamberPool;
  skipped: number;
  rawMargin: number | null;
}

export interface ChamberMarginYear {
  year: number;
  contested: ChamberPool;
  imputed: ChamberPool & { srcYear: number | null };
  skipped: number;
  /** The old aggregate — every counted district's votes summed — for the ledger's comparison. */
  rawMargin: number | null;
  /** Contested and imputed pools combined on their weights: the corrected chamber margin. */
  correctedMargin: number | null;
  chambers: ChamberMarginDetail[];
}

const PRES_YEARS = [2016, 2020, 2024] as const;

function nearestPresYear(year: number, available: number[]): number | null {
  if (available.length === 0) return null;
  return [...available].sort((a, b) => Math.abs(a - year) - Math.abs(b - year) || b - a)[0];
}

function pool(dem: number, rep: number, total: number, districts: number): ChamberPool {
  return { margin: total > 0 ? ((rep - dem) / total) * 100 : null, weight: total, districts };
}

function combine(a: ChamberPool, b: ChamberPool): ChamberPool {
  const weight = a.weight + b.weight;
  const margin = weight > 0 ? ((a.margin ?? 0) * a.weight + (b.margin ?? 0) * b.weight) / weight : null;
  return { margin, weight, districts: a.districts + b.districts };
}

const _cache = new Map<string, Record<number, ChamberMarginYear>>();

export function getChamberMargins(abbr: string): Record<number, ChamberMarginYear> {
  const cached = _cache.get(abbr);
  if (cached) return cached;
  const out: Record<number, ChamberMarginYear> = {};
  const years = stateLegResults[abbr] ?? {};
  for (const [yearKey, chambers] of Object.entries(years)) {
    const year = Number(yearKey);
    const details: ChamberMarginDetail[] = [];
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const block = chambers[chamber];
      if (!block) continue;
      if (UNICAMERAL_STATES.has(abbr) && chamber === "house") continue;
      const era = String(stateLegHistoricalMaps[abbr]?.[chamber]?.[yearKey] ?? "current");
      const presEra = stateLegPresByEra[abbr]?.[chamber]?.[era] ?? {};
      const presIndex = indexByNormalizedKey(presEra);
      const available = PRES_YEARS.filter((y) => Object.values(presEra).some((d) => d[String(y) as "2016" | "2020" | "2024"]));
      const srcYear = nearestPresYear(year, available);
      const srcKey = srcYear == null ? null : (String(srcYear) as "2016" | "2020" | "2024");

      let cDem = 0, cRep = 0, cTot = 0, cN = 0, cPres = 0;
      let rawDem = 0, rawRep = 0, rawTot = 0;
      const imputedRows: { margin: number; presTotal: number }[] = [];
      let skipped = 0;
      for (const [key, r] of Object.entries(block.districts)) {
        if (isUnassignedResultKey(key)) {
          // MEDSL's unattributed "Statewide" votes belong in the raw aggregate but are no district.
          rawDem += r.demVotes ?? 0; rawRep += r.repVotes ?? 0; rawTot += r.totalVotes ?? 0;
          continue;
        }
        const pres = srcKey ? lookupByDistrictCode(presIndex, abbr, chamber, key)?.[srcKey] : undefined;
        const contested = !r.noCount && (r.demVotes ?? 0) > 0 && (r.repVotes ?? 0) > 0 && (r.totalVotes ?? 0) > 0;
        if (!r.noCount) { rawDem += r.demVotes ?? 0; rawRep += r.repVotes ?? 0; rawTot += r.totalVotes ?? 0; }
        if (contested) {
          cDem += r.demVotes!; cRep += r.repVotes!; cTot += r.totalVotes!; cN += 1;
          if (pres) cPres += pres.totalVotes;
        } else if (pres) {
          imputedRows.push({ margin: pres.margin, presTotal: pres.totalVotes });
        } else {
          skipped += 1;
        }
      }
      const turnoutRatio = cPres > 0 ? cTot / cPres : 1;
      let iW = 0, iM = 0;
      for (const row of imputedRows) { const w = row.presTotal * turnoutRatio; iW += w; iM += row.margin * w; }
      const contestedPool = pool(cDem, cRep, cTot, cN);
      const imputedPool: ChamberPool = { margin: iW > 0 ? iM / iW : null, weight: iW, districts: imputedRows.length };
      details.push({
        chamber, era, srcYear, turnoutRatio,
        contested: contestedPool, imputed: imputedPool, skipped,
        rawMargin: rawTot > 0 ? ((rawRep - rawDem) / rawTot) * 100 : null,
      });
    }
    if (details.length === 0) continue;
    const contested = details.map((d) => d.contested).reduce(combine);
    const imputedBase = details.map((d) => d.imputed).reduce(combine);
    // One source year for the year's imputed pool: the heaviest chamber's.
    const srcYear = details.filter((d) => d.imputed.weight > 0).sort((a, b) => b.imputed.weight - a.imputed.weight)[0]?.srcYear ?? null;
    // Raw aggregate across chambers, votes-weighted the way the old L row was.
    let rDem = 0, rTot = 0, rRep = 0;
    for (const d of details) {
      for (const r of Object.values(chambers[d.chamber]!.districts)) {
        if (r.noCount) continue;
        rDem += r.demVotes ?? 0; rRep += r.repVotes ?? 0; rTot += r.totalVotes ?? 0;
      }
    }
    const all = combine(contested, imputedBase);
    out[year] = {
      year,
      contested,
      imputed: { ...imputedBase, srcYear },
      skipped: details.reduce((s, d) => s + d.skipped, 0),
      rawMargin: rTot > 0 ? ((rRep - rDem) / rTot) * 100 : null,
      correctedMargin: all.margin,
      chambers: details,
    };
  }
  _cache.set(abbr, out);
  return out;
}
