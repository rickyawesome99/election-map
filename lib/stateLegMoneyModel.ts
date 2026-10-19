import "server-only";

import { stateLegFinance } from "@/data/stateLegFinance";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import type { Chamber } from "@/data/stateLegDistricts";
import { indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { stateLegMoney } from "@/lib/stateLegMoney";

/**
 * The money term's expected gap: how far apart a state legislative race's two sides usually are in
 * fundraising given who holds the seat and how the district votes, so that only the money beyond it
 * moves the projection (the federal forecast's residual basis, lib/tplCompute.ts structuralMoneyGap).
 *
 *   gap%        = (R − D) / (R + D) × 100 over the two sides' cycle contributions (lib/stateLegMoney.ts)
 *   structural% = a(year) + b × incumbent sign + c × presidential margin on that year's lines
 *   residual%   = scale × gap% − structural%
 *
 * Fitted by least squares, pooled over every chamber, on every contested D-vs-R race with both
 * sides' money on file (every cycle, 2026's to-date receipts included). It uses no election result,
 * so the backtest may fit it on all years without leaking an outcome; the year intercept absorbs a
 * cycle's party-wide money tilt (and 2026's partial-cycle level). It is refitted from whatever
 * data/stateLegFinance.ts holds at build time: new money joins the fit and the term with no other step.
 */

const PRES_YEARS = ["2016", "2020", "2024"] as const;

export interface MoneyRace { abbr: string; chamber: Chamber; key: string; year: number; gap: number; incSign: number; pres: number }

export interface StructuralMoneyModel {
  /** Intercept per election year; `pooled` for a year with no money on file. */
  intercept: Record<number, number>;
  pooled: number;
  incSign: number;
  pres: number;
  n: number;
  nByYear: Record<number, number>;
  r2: number;
}

function eraOf(abbr: string, chamber: Chamber, year: number): string {
  const v = stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)];
  return v == null ? "current" : String(v);
}

/** The presidential margin (R-positive) on the district's lines in force in `year`, nearest presidential year. */
export function presMarginOn(abbr: string, chamber: Chamber, key: string, year: number): number | null {
  const era = eraOf(abbr, chamber, year);
  const block = stateLegPresByEra[abbr]?.[chamber]?.[era];
  if (!block) return null;
  const d = lookupByDistrictCode(indexByNormalizedKey(block), abbr, chamber, key);
  if (!d) return null;
  const ps = PRES_YEARS.filter((p) => d[p]).sort((a, b) => Math.abs(Number(a) - year) - Math.abs(Number(b) - year) || Number(b) - Number(a));
  return ps.length ? d[ps[0]]!.margin : null;
}

function incumbentSign(cands: { party: string; incumbent?: boolean }[]): number {
  const parties = new Set(cands.filter((c) => c.incumbent).map((c) => c.party));
  if (parties.size !== 1) return 0;
  const p = [...parties][0];
  return p === "R" ? 1 : p === "D" ? -1 : 0;
}

let _races: MoneyRace[] | null = null;

/** Every past contested D-vs-R race with both sides' money on file (the fit's rows). */
export function moneyRaces(): MoneyRace[] {
  if (_races) return _races;
  const out: MoneyRace[] = [];
  for (const [abbr, cycles] of Object.entries(stateLegFinance)) {
    for (const [cy, chambers] of Object.entries(cycles)) {
      const year = Number(cy);
      for (const [chamber, block] of Object.entries(chambers) as [Chamber, Record<string, unknown>][]) {
        if (!block) continue;
        const results = stateLegResults[abbr]?.[cy]?.[chamber];
        const index = results ? indexByNormalizedKey(results.districts) : null;
        for (const key of Object.keys(block)) {
          const m = stateLegMoney(abbr, chamber, key, year);
          if (m?.gapPct == null) continue;
          let incSign: number;
          if (index) {
            const r = lookupByDistrictCode(index, abbr, chamber, key);
            if (!r || !r.demVotes || !r.repVotes) continue;   // past race: contested D vs R only
            incSign = incumbentSign(r.candidates ?? []);
          } else {
            if (!m.candidates.some((c) => c.party === "D") || !m.candidates.some((c) => c.party === "R")) continue;
            incSign = incumbentSign(m.candidates);
          }
          const pres = presMarginOn(abbr, chamber, key, year);
          if (pres == null) continue;
          out.push({ abbr, chamber, key, year, gap: m.gapPct, incSign, pres });
        }
      }
    }
  }
  _races = out;
  return out;
}

/** Least squares by the normal equations (small systems: one intercept per year + 2 slopes). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

let _model: StructuralMoneyModel | null = null;

export function structuralMoneyModel(): StructuralMoneyModel {
  if (_model) return _model;
  const races = moneyRaces();
  const years = [...new Set(races.map((r) => r.year))].sort((a, b) => a - b);
  const p = years.length + 2;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (const r of races) {
    const x = new Array(p).fill(0);
    x[years.indexOf(r.year)] = 1;
    x[p - 2] = r.incSign;
    x[p - 1] = r.pres;
    for (let i = 0; i < p; i++) { b[i] += x[i] * r.gap; for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j]; }
  }
  const beta = solve(A, b);
  const intercept: Record<number, number> = {};
  const nByYear: Record<number, number> = {};
  years.forEach((y, i) => { intercept[y] = beta[i]; nByYear[y] = races.filter((r) => r.year === y).length; });
  const pooled = races.length ? years.reduce((s, y) => s + intercept[y] * nByYear[y], 0) / races.length : 0;
  const m: StructuralMoneyModel = { intercept, pooled, incSign: beta[p - 2] ?? 0, pres: beta[p - 1] ?? 0, n: races.length, nByYear, r2: 0 };
  const mean = races.reduce((s, r) => s + r.gap, 0) / Math.max(1, races.length);
  const ssTot = races.reduce((s, r) => s + (r.gap - mean) ** 2, 0);
  const ssRes = races.reduce((s, r) => s + (r.gap - structuralGap(m, r.year, r.incSign, r.pres)) ** 2, 0);
  m.r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  _model = m;
  return m;
}

export function structuralGap(m: StructuralMoneyModel, year: number, incSign: number, pres: number): number {
  const a = m.intercept[year] ?? m.pooled;
  return Math.max(-100, Math.min(100, a + m.incSign * incSign + m.pres * pres));
}

export interface RaceMoneyTerm {
  gapPct: number;
  structuralGapPct: number;
  /** scale × gap% − structural%. */
  residualGapPct: number;
  scale: number;
  pts: number;
}

/**
 * The money term of one race (R-positive points): clamp(k × (scale × gap% − structural%), ±cap),
 * or null where either side's money is not on file (the term is then 0: the typical gap for the
 * race's situation, not "no money").
 */
export function raceMoneyTerm(abbr: string, chamber: Chamber, key: string, year: number, incSign: number, k: number, cap: number, scale = 1): RaceMoneyTerm | null {
  if (k === 0) return null;
  const m = stateLegMoney(abbr, chamber, key, year);
  if (m?.gapPct == null) return null;
  const pres = presMarginOn(abbr, chamber, key, year);
  if (pres == null) return null;
  const structuralGapPct = structuralGap(structuralMoneyModel(), year, incSign, pres);
  const residualGapPct = scale * m.gapPct - structuralGapPct;
  return { gapPct: m.gapPct, structuralGapPct, residualGapPct, scale, pts: Math.max(-cap, Math.min(cap, k * residualGapPct)) };
}
