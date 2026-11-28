import "server-only";

import { stateLegResults } from "@/lib/locked2026StateLegResults";
import { stateLegPresByEra, type PresByEraVote } from "@/data/stateLegPresByEra";
import { stateLegPres2024 } from "@/data/stateLegPres2024";
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
 *              legislative/presidential turnout ratio among its contested seats. On the current
 *              map the 2024 figure falls back to data/stateLegPres2024.ts where the era table has
 *              none (the eleven states Dave's Redistricting carries no 2024 data for; until
 *              2026-11-19 their 2024 and 2026 seats were imputed from 2020);
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
  /**
   * The imputed (unopposed) seats in the same summary, so the State TPL can add the contested
   * seats' gap to their presidential margin as it does for the seats not up; null when there are
   * none or no chamber supplies a gap (the State TPL then keeps them at the presidential margin).
   */
  unopposed: NotUpPool | null;
  /** The adjusted vote shown on the chamber pages: the U.S. House rule (see AdjustedVote). */
  adjusted: AdjustedVote;
}

/**
 * The chamber's adjusted vote, by the rule the U.S. House adjusted popular vote uses
 * (lib/genericBallotPopularVote.ts yearVote, lib/results2026Page.ts houseVote2026), with the
 * chamber in the House's place:
 *   contested  D and R both drew votes and neither is at write-in scale (under 5% while the
 *              other clears 90%, or under 2%: the House's seatKind) → its own votes;
 *   filled     every other seat on the ballot, including an unreported one → presidential margin
 *              on its lines + the chamber-year's offset, clamped to ±95, at the chamber's median
 *              contested votes per seat × its seats. Presidential margin = the mean of the
 *              presidential years nearest the race on that map (both for a midterm on a map that
 *              carries both, as the House averages the years measured on its map; 2024 for 2026);
 *   offset     the contested seats' vote-weighted mean of (legislative − presidential margin);
 *   no pres    a filled seat with no presidential figure keeps its recorded vote (none if unprinted).
 * Seats not up are not in it. The State TPL reads correctedMargin / the pools above, not this.
 */
export interface AdjustedVote {
  /** R-positive margin as a share of the adjusted total, or null with no votes. */
  margin: number | null;
  /** The adjusted total: contested votes plus the filled seats' median turnout. */
  votes: number;
  /** Seats given a two-party race from the presidential margin. */
  filled: number;
  /** Contested legislative margin minus presidential margin, vote-weighted (points). */
  offset: number;
  /** The presidential years the filled seats' margin is read from. */
  presYears: number[];
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
  /** The chambers' adjusted votes summed (the U.S. House rule, per chamber). */
  adjusted: { margin: number | null; votes: number; filled: number };
  chambers: ChamberMarginDetail[];
}

const WRITE_IN_SCALE = (own: number, other: number) => own < 5 && (other >= 90 || own < 2);

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

type YearChambers = (typeof stateLegResults)[string][string];

/**
 * One election year's chamber margins from that year's district results. getChamberMargins runs it
 * over the results on file; lib/stateLegResults2026.ts runs it over the 2026 count, which is kept
 * out of that file (the locked 2026 projection reads it).
 */
export function chamberMarginYear(abbr: string, yearKey: string, chambers: YearChambers): ChamberMarginYear | null {
  const year = Number(yearKey);
  const details: ChamberMarginDetail[] = [];
  const gaps = new Map<Chamber, NotUpPool["gap"]>();
  const notUpRowsBy = new Map<Chamber, { margin: number; presTotal: number }[]>();
  const imputedRowsBy = new Map<Chamber, { margin: number; presTotal: number }[]>();
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const block = chambers[chamber];
    if (!block) continue;
    if (UNICAMERAL_STATES.has(abbr) && chamber === "house") continue;
    const era = String(stateLegHistoricalMaps[abbr]?.[chamber]?.[yearKey] ?? "current");
    const presEra = stateLegPresByEra[abbr]?.[chamber]?.[era] ?? {};
    const presIndex = indexByNormalizedKey(presEra);
    // The current map's precinct-built 2024 figures, for a district the era table has no 2024 for.
    const pres24Index = era === "current" ? indexByNormalizedKey(stateLegPres2024[abbr]?.[chamber] ?? {}) : null;
    const pres24Of = (key: string): PresByEraVote | undefined => {
      const p = pres24Index ? lookupByDistrictCode(pres24Index, abbr, chamber, key) : undefined;
      if (!p || !p.totalVotes || p.demVotes == null || p.repVotes == null) return undefined;
      return { demVotes: p.demVotes, repVotes: p.repVotes, othVotes: p.totalVotes - p.demVotes - p.repVotes, totalVotes: p.totalVotes, demPct: p.demPct, repPct: p.repPct, margin: ((p.repVotes - p.demVotes) / p.totalVotes) * 100 };
    };
    const presOf = (d: (typeof presEra)[string] | undefined, key: string, y: "2016" | "2020" | "2024"): PresByEraVote | undefined =>
      d?.[y] ?? (y === "2024" ? pres24Of(key) : undefined);
    const available = PRES_YEARS.filter((y) => Object.entries(presEra).some(([key, d]) => presOf(d, key, String(y) as "2016" | "2020" | "2024")));
    const srcYear = nearestPresYear(year, available);
    const srcKey = srcYear == null ? null : (String(srcYear) as "2016" | "2020" | "2024");
    // The adjusted vote's presidential margin: every year tied for nearest, averaged.
    const nearestGap = available.length ? Math.min(...available.map((y) => Math.abs(y - year))) : null;
    const adjYears = available.filter((y) => Math.abs(y - year) === nearestGap);
    const adjPres = (d: (typeof presEra)[string] | undefined, key: string): number | null => {
      const ms = adjYears.map((y) => presOf(d, key, String(y) as "2016" | "2020" | "2024")?.margin).filter((m): m is number => m != null);
      return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    };
    const seatIndex = indexByNormalizedKey(Object.fromEntries((stateLegDistricts[abbr]?.[chamber] ?? []).map((d) => [d.number, d])));
    const seatsOf = (key: string, r?: (typeof block.districts)[string]) => {
      const won = (r?.candidates ?? []).filter((c) => c.winner).length;
      if (won > 0) return won;
      // The roster leaves `seats` blank for most multi-member districts: its members say how many
      // (the 2026 loader's rule). The 2026 count carries no winner marks, so this is its source.
      const d = era === "current" ? lookupByDistrictCode(seatIndex, abbr, chamber, key) : undefined;
      return d ? d.seats ?? Math.max(d.incumbents?.length ?? 0, 1) : 1;
    };
    type AdjRow = { contested: boolean; dem: number; rep: number; total: number; seats: number; pres: number | null };
    const adjRows: AdjRow[] = [];

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
      const pres = srcKey ? presOf(lookupByDistrictCode(presIndex, abbr, chamber, key), key, srcKey) : undefined;
      const contested = !r.noCount && (r.demVotes ?? 0) > 0 && (r.repVotes ?? 0) > 0 && (r.totalVotes ?? 0) > 0;
      if (!r.noCount) { rawDem += r.demVotes ?? 0; rawRep += r.repVotes ?? 0; rawTot += r.totalVotes ?? 0; }
      {
        const dv = r.demVotes ?? 0, rv = r.repVotes ?? 0, tv = Math.max(r.totalVotes ?? 0, dv + rv);
        const dPct = tv > 0 ? (dv / tv) * 100 : 0, rPct = tv > 0 ? (rv / tv) * 100 : 0;
        const twoParty = contested && !WRITE_IN_SCALE(dPct, rPct) && !WRITE_IN_SCALE(rPct, dPct);
        adjRows.push({ contested: twoParty, dem: r.noCount ? 0 : dv, rep: r.noCount ? 0 : rv, total: r.noCount ? 0 : tv, seats: seatsOf(key, r), pres: adjPres(lookupByDistrictCode(presIndex, abbr, chamber, key), key) });
      }
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
    const notUpRows: { margin: number; presTotal: number }[] = [];
    let unreported = 0;
    for (const [key, d] of Object.entries(presEra)) {
      if (NO_ABSENT || d.overlayOf || lookupByDistrictCode(resultIndex, abbr, chamber, key)) continue;
      const pres = srcKey ? presOf(d, key, srcKey) : undefined;
      const lastElection = era === "current" ? lookupByDistrictCode(seatIndex, abbr, chamber, key)?.lastElection : undefined;
      const wasUp = !staggered || lastElection === year;
      if (wasUp && unmatched > 0) continue; // most likely the unmatched row itself, already counted
      if (!pres) { skipped += 1; continue; }
      if (wasUp) {
        imputedRows.push({ margin: pres.margin, presTotal: pres.totalVotes }); unreported += 1;
        adjRows.push({ contested: false, dem: 0, rep: 0, total: 0, seats: seatsOf(key), pres: adjPres(d, key) });
      }
      else notUpRows.push({ margin: pres.margin, presTotal: pres.totalVotes });
    }
    const turnoutRatio = cPres > 0 ? cTot / cPres : 1;
    let iW = 0, iM = 0;
    for (const row of imputedRows) { const w = row.presTotal * turnoutRatio; iW += w; iM += row.margin * w; }
    const contestedPool = pool(cDem, cRep, cTot, cN);
    const imputedPool: ChamberPool = { margin: iW > 0 ? iM / iW : null, weight: iW, districts: imputedRows.length };
    const notUpPres = notUpRows.reduce((a, r) => a + r.presTotal, 0);
    // The adjusted vote (the U.S. House rule).
    let offNum = 0, offDen = 0;
    for (const a of adjRows) if (a.contested && a.pres != null) { offNum += (((a.rep - a.dem) / a.total) * 100 - a.pres) * a.total; offDen += a.total; }
    const offset = offDen > 0 ? offNum / offDen : 0;
    const perSeat = adjRows.filter((a) => a.contested).map((a) => a.total / a.seats).sort((x, y) => x - y);
    const medianPerSeat = perSeat.length ? perSeat[Math.floor(perSeat.length / 2)] : 0;
    let aD = 0, aR = 0, aT = 0, filled = 0;
    for (const a of adjRows) {
      if (a.contested || a.pres == null || medianPerSeat <= 0) { aD += a.dem; aR += a.rep; aT += a.total; continue; }
      filled += 1;
      const m = Math.max(-95, Math.min(95, a.pres + offset));
      const v = medianPerSeat * a.seats;
      aD -= (v * m) / 200; aR += (v * m) / 200; aT += v;
    }
    const adjusted: AdjustedVote = { margin: aT > 0 ? ((aR - aD) / aT) * 100 : null, votes: aT, filled, offset, presYears: adjYears };
    details.push({
      adjusted,
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
      unopposed: null,
    });
    gaps.set(chamber, gapSeats.length >= MIN_GAP_SEATS ? fitGap(gapSeats) : null);
    notUpRowsBy.set(chamber, notUpRows);
    imputedRowsBy.set(chamber, imputedRows);
  }
  if (details.length === 0) return null;
  // The not-up seats' gap: their own chamber's contested seats, else the other chamber's that
  // year (a senate with fewer than MIN_GAP_SEATS contested), else none and the pool is dropped.
  // The clamp holds each seat's presidential margin inside the range the gap was fitted on.
  // The unopposed seats get the same gap from the same place (2026-11-19).
  for (const d of details) {
    const gap = gaps.get(d.chamber) ?? [...gaps.values()].find((g) => g != null) ?? null;
    const from = gaps.get(d.chamber) ? "own" as const : "other" as const;
    const clamped = (rows: { margin: number; presTotal: number }[], tot: number) =>
      rows.reduce((a, r) => a + Math.min(gap!.max, Math.max(gap!.min, r.margin)) * r.presTotal, 0) / tot;
    if (d.notUp) {
      if (!gap) d.notUp = null;
      else {
        const rows = notUpRowsBy.get(d.chamber)!;
        d.notUp.presMarginClamped = clamped(rows, rows.reduce((a, r) => a + r.presTotal, 0));
        d.notUp.gap = { ...gap, from };
      }
    }
    const imputedRows = imputedRowsBy.get(d.chamber)!;
    const tot = imputedRows.reduce((a, r) => a + r.presTotal, 0);
    if (gap && tot > 0 && d.imputed.margin != null) {
      d.unopposed = { districts: imputedRows.length, weight: d.imputed.weight, presMargin: d.imputed.margin, presMarginClamped: clamped(imputedRows, tot), gap: { ...gap, from } };
    }
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
  // Each chamber's adjusted margin weighted by its adjusted votes (the sum of its D−R and its total).
  const adjVotes = details.reduce((s, d) => s + d.adjusted.votes, 0);
  const adjMargin = adjVotes > 0 ? details.reduce((s, d) => s + (d.adjusted.margin ?? 0) * d.adjusted.votes, 0) / adjVotes : null;
  return {
    adjusted: { margin: adjMargin, votes: adjVotes, filled: details.reduce((s, d) => s + d.adjusted.filled, 0) },
    year,
    contested,
    imputed: { ...imputedBase, srcYear },
    skipped: details.reduce((s, d) => s + d.skipped, 0),
    rawMargin: rTot > 0 ? ((rRep - rDem) / rTot) * 100 : null,
    correctedMargin: all.margin,
    chambers: details,
  };
}

const _cache = new Map<string, Record<number, ChamberMarginYear>>();

export function getChamberMargins(abbr: string): Record<number, ChamberMarginYear> {
  const cached = _cache.get(abbr);
  if (cached) return cached;
  const out: Record<number, ChamberMarginYear> = {};
  for (const [yearKey, chambers] of Object.entries(stateLegResults[abbr] ?? {})) {
    const y = chamberMarginYear(abbr, yearKey, chambers);
    if (y) out[y.year] = y;
  }
  _cache.set(abbr, out);
  return out;
}
