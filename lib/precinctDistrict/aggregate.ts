// Pure helpers over a district's precinct results: sums, margins, subdivision rollups and the
// era crosswalk. No React, no fetch — the page and the explorer both build on these.
//
// Margin convention matches the rest of the site: R-positive (R+5 → +5, D+5 → −5), computed on
// the two-party vote. fmtMargin / getRaceColor in lib/colorScale.ts render it.

import type {
  DistrictResults, EraCrosswalk, OfficeKey, PrecinctYear, RaceVotes, YearResults, DistrictConfig,
} from "./types";

export interface Tally { d: number; r: number; t: number }

export const EMPTY_TALLY: Tally = { d: 0, r: 0, t: 0 };

export function marginOf(t: { d: number; r: number }): number | null {
  const two = t.d + t.r;
  return two > 0 ? ((t.r - t.d) / two) * 100 : null;
}

export function pctD(t: { d: number; r: number }): number | null {
  const two = t.d + t.r;
  return two > 0 ? (t.d / two) * 100 : null;
}

export function addTally(a: Tally, b: { d: number; r: number; t: number }): Tally {
  return { d: a.d + b.d, r: a.r + b.r, t: a.t + b.t };
}

/** Sum one office across a set of precinct rows. */
export function sumOffice(rows: PrecinctYear[], office: OfficeKey): Tally {
  let d = 0, r = 0, t = 0;
  for (const p of rows) {
    const v = p.races[office];
    if (!v) continue;
    d += v.d; r += v.r; t += v.t;
  }
  return { d, r, t };
}

export function sumBallots(rows: PrecinctYear[]): { ballots: number; reg: number; turnout: number | null } {
  let ballots = 0, reg = 0;
  for (const p of rows) { ballots += p.ballots; reg += p.reg; }
  return { ballots, reg, turnout: reg > 0 ? (ballots / reg) * 100 : null };
}

export function yearOffices(year: YearResults): OfficeKey[] {
  return Object.keys(year.offices);
}

/** The office that headed the ticket that year: President in presidential years, Governor otherwise. */
export function topOfTicket(year: YearResults): OfficeKey | null {
  if (year.offices.pres) return "pres";
  if (year.offices.gov) return "gov";
  return null;
}

/** True when a district-level office was more than one race across the footprint that year. */
export function isPatchwork(year: YearResults, office: OfficeKey): boolean {
  const m = year.offices[office];
  return !!m?.districts && Object.keys(m.districts).length > 1;
}

export function subdivisionRows(year: YearResults, sub: string): PrecinctYear[] {
  return year.precincts.filter((p) => p.sub === sub);
}

// ── Crosswalk ─────────────────────────────────────────────────────────────────
// Carries an older era's precinct rows onto the current era's precincts. Votes, ballots and
// registration are all spread by the same weights. Rows that come out of this are ESTIMATES
// and every consumer should say so (the UI flags them); subdivision totals are never taken
// from crosswalked rows — those come straight from the year's own precincts.

export interface CrosswalkedPrecinct extends PrecinctYear {
  estimated: true;
  /** share of this precinct's estimate that came from its single largest source precinct */
  dominantShare: number;
  dominantSource: string;
}

export function crosswalkYear(
  year: YearResults,
  xw: EraCrosswalk,
  currentPrecincts: { id: string; sub: string }[],
): CrosswalkedPrecinct[] {
  const acc = new Map<string, { reg: number; ballots: number; races: Record<string, { d: number; r: number; t: number }>; sources: Map<string, number> }>();
  for (const cp of currentPrecincts) {
    acc.set(cp.id, { reg: 0, ballots: 0, races: {}, sources: new Map() });
  }
  for (const p of year.precincts) {
    const targets = xw.forward[p.id];
    if (!targets) continue;
    for (const [to, w] of targets) {
      const a = acc.get(to);
      if (!a) continue;
      a.reg += p.reg * w;
      a.ballots += p.ballots * w;
      a.sources.set(p.id, (a.sources.get(p.id) ?? 0) + p.ballots * w);
      for (const [office, v] of Object.entries(p.races)) {
        const t = a.races[office] ?? (a.races[office] = { d: 0, r: 0, t: 0 });
        t.d += v.d * w; t.r += v.r * w; t.t += v.t * w;
      }
    }
  }
  const out: CrosswalkedPrecinct[] = [];
  for (const cp of currentPrecincts) {
    const a = acc.get(cp.id)!;
    let dominantSource = "", dominantShare = 0;
    for (const [src, b] of a.sources) {
      if (b > dominantShare) { dominantShare = b; dominantSource = src; }
    }
    const races: Record<string, RaceVotes> = {};
    for (const [office, v] of Object.entries(a.races)) {
      races[office] = { d: Math.round(v.d), r: Math.round(v.r), t: Math.round(v.t) };
    }
    out.push({
      id: cp.id,
      sub: cp.sub,
      reg: Math.round(a.reg),
      ballots: Math.round(a.ballots),
      races,
      estimated: true,
      dominantShare: a.ballots > 0 ? dominantShare / a.ballots : 0,
      dominantSource,
    });
  }
  return out;
}

// ── Convenience views ─────────────────────────────────────────────────────────

export interface DistrictYearSummary {
  year: number;
  era: string;
  ballots: number;
  reg: number;
  turnout: number | null;
  offices: { office: OfficeKey; label: string; short: string; tally: Tally; margin: number | null; patchwork: boolean; districts: string[] }[];
}

export function summarizeYears(config: DistrictConfig, results: DistrictResults): DistrictYearSummary[] {
  return Object.entries(results.years)
    .map(([y, yr]) => {
      const { ballots, reg, turnout } = sumBallots(yr.precincts);
      const offices = yearOffices(yr).map((office) => {
        const tally = sumOffice(yr.precincts, office);
        return {
          office,
          label: yr.offices[office].label,
          short: yr.offices[office].short,
          tally,
          margin: marginOf(tally),
          patchwork: isPatchwork(yr, office),
          districts: Object.keys(yr.offices[office].districts ?? {}),
        };
      });
      return { year: Number(y), era: yr.era, ballots, reg, turnout, offices };
    })
    .sort((a, b) => b.year - a.year);
}

export function currentEra(config: DistrictConfig) {
  return config.eras.find((e) => e.current) ?? config.eras[config.eras.length - 1];
}

export function eraOfYear(config: DistrictConfig, year: number) {
  return config.eras.find((e) => e.years.includes(year)) ?? currentEra(config);
}

export function subdivisionName(config: DistrictConfig, id: string): string {
  return config.subdivisions.find((s) => s.id === id)?.name ?? id;
}
