import "server-only";

import { stateLegResults } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import type { NotUpPool } from "@/lib/chamberMargins";

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
 * A district on the year's map with NO row in the results is one of two things:
 *   unreported up, but the source prints no race (MEDSL 2024 and the Louisiana files omit an
 *              unopposed seat; Klarner lists it with noCount) → imputed like any unopposed seat.
 *              Every absent district of a chamber that elects all its seats at once, and in a
 *              staggered chamber one whose seat's last regular election (data/stateLegDistricts)
 *              was this year. Left out instead when some result key failed to match the map
 *              (MA Senate, VT House, NH House), since the absent district is most likely that row.
 *   not up     a staggered chamber's other seat class → the notUp summary below, which the
 *              State TPL turns into an estimate (lib/chamberMargins.ts notUpPool): the seat's
 *              presidential margin plus the gap the contested seats up that year ran from theirs.
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
  /** Absent districts imputed as unreported unopposed seats (already inside `imputed`). */
  unreported: number;
  /** The seats not up this year, summarized for the State TPL; null when none (or no gap). */
  notUp: NotUpPool | null;
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

/** Ablation for the change log: CHAMBER_MARGIN_NO_ABSENT=1 ignores districts with no results row. */
const NO_ABSENT = process.env.CHAMBER_MARGIN_NO_ABSENT === "1";

/** Fewest contested seats (with a presidential figure) a chamber needs to supply its own gap. */
export const MIN_GAP_SEATS = 5;

interface GapSeat { leg: number; pres: number; votes: number }

/** Vote-weighted fit of gap = legislative − presidential margin on the presidential margin. */
function fitGap(seats: GapSeat[]): NotUpPool["gap"] {
  const W = seats.reduce((a, s) => a + s.votes, 0);
  const center = seats.reduce((a, s) => a + s.votes * s.pres, 0) / W;
  const a = seats.reduce((acc, s) => acc + s.votes * (s.leg - s.pres), 0) / W;
  let sxy = 0, sxx = 0;
  for (const s of seats) { const dx = s.pres - center; sxy += s.votes * dx * (s.leg - s.pres - a); sxx += s.votes * dx * dx; }
  const pres = seats.map((s) => s.pres);
  return { a, b: sxx > 0 ? sxy / sxx : 0, n: seats.length, center, min: Math.min(...pres), max: Math.max(...pres), from: "own" };
}

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
    const gaps = new Map<Chamber, NotUpPool["gap"]>();
    const notUpRowsBy = new Map<Chamber, { margin: number; presTotal: number }[]>();
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

      let cDem = 0, cRep = 0, cTot = 0, cN = 0, cPres = 0, unmatched = 0;
      const gapSeats: GapSeat[] = [];
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
        if (!pres) unmatched += 1;
        if (contested) {
          cDem += r.demVotes!; cRep += r.repVotes!; cTot += r.totalVotes!; cN += 1;
          if (pres) {
            cPres += pres.totalVotes;
            gapSeats.push({ leg: ((r.repVotes! - r.demVotes!) / r.totalVotes!) * 100, pres: pres.margin, votes: r.totalVotes! });
          }
        } else if (pres) {
          imputedRows.push({ margin: pres.margin, presTotal: pres.totalVotes });
        } else {
          skipped += 1;
        }
      }
      // Districts on the year's map with no results row: unreported (imputed above) or not up.
      const staggered = stateLegCalendar[abbr]?.[chamber]?.staggered ?? false;
      const resultIndex = indexByNormalizedKey(block.districts);
      const seatIndex = indexByNormalizedKey(Object.fromEntries((stateLegDistricts[abbr]?.[chamber] ?? []).map((d) => [d.number, d])));
      const notUpRows: { margin: number; presTotal: number }[] = [];
      let unreported = 0;
      for (const [key, d] of Object.entries(presEra)) {
        if (NO_ABSENT || d.overlayOf || lookupByDistrictCode(resultIndex, abbr, chamber, key)) continue;
        const pres = srcKey ? d[srcKey] : undefined;
        const lastElection = era === "current" ? lookupByDistrictCode(seatIndex, abbr, chamber, key)?.lastElection : undefined;
        const wasUp = !staggered || lastElection === year;
        if (wasUp && unmatched > 0) continue; // most likely the unmatched row itself, already counted
        if (!pres) { skipped += 1; continue; }
        if (wasUp) { imputedRows.push({ margin: pres.margin, presTotal: pres.totalVotes }); unreported += 1; }
        else notUpRows.push({ margin: pres.margin, presTotal: pres.totalVotes });
      }
      const turnoutRatio = cPres > 0 ? cTot / cPres : 1;
      let iW = 0, iM = 0;
      for (const row of imputedRows) { const w = row.presTotal * turnoutRatio; iW += w; iM += row.margin * w; }
      const contestedPool = pool(cDem, cRep, cTot, cN);
      const imputedPool: ChamberPool = { margin: iW > 0 ? iM / iW : null, weight: iW, districts: imputedRows.length };
      const notUpPres = notUpRows.reduce((a, r) => a + r.presTotal, 0);
      details.push({
        chamber, era, srcYear, turnoutRatio,
        contested: contestedPool, imputed: imputedPool, skipped,
        rawMargin: rawTot > 0 ? ((rawRep - rawDem) / rawTot) * 100 : null,
        unreported,
        notUp: notUpRows.length === 0 ? null : {
          districts: notUpRows.length,
          weight: notUpPres * turnoutRatio,
          presMargin: notUpRows.reduce((a, r) => a + r.margin * r.presTotal, 0) / notUpPres,
          presMarginClamped: 0,
          gap: null,
        },
      });
      gaps.set(chamber, gapSeats.length >= MIN_GAP_SEATS ? fitGap(gapSeats) : null);
      notUpRowsBy.set(chamber, notUpRows);
    }
    if (details.length === 0) continue;
    // The not-up seats' gap: their own chamber's contested seats, else the other chamber's that
    // year (a senate with fewer than MIN_GAP_SEATS contested), else none and the pool is dropped.
    // The clamp holds each seat's presidential margin inside the range the gap was fitted on.
    for (const d of details) {
      if (!d.notUp) continue;
      const gap = gaps.get(d.chamber) ?? [...gaps.values()].find((g) => g != null) ?? null;
      if (!gap) { d.notUp = null; continue; }
      const rows = notUpRowsBy.get(d.chamber)!;
      const tot = rows.reduce((a, r) => a + r.presTotal, 0);
      d.notUp.presMarginClamped = rows.reduce((a, r) => a + Math.min(gap.max, Math.max(gap.min, r.margin)) * r.presTotal, 0) / tot;
      d.notUp.gap = { ...gap, from: gaps.get(d.chamber) ? "own" : "other" };
    }
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
