// Leakage-free window fit of the TPL model, shared by the calibration search
// (tplCalibrate.ts) and the forward backtest (forwardBacktest.ts).
//
// Extracts the raw per-race panel once (from the live model's race lists) and
// exposes a parameterized refit of environment/elasticity/lean/incumbency over
// any year window, plus the state TPL aggregation that mirrors lib/tplCompute.ts.
// The maths here must stay identical to getTplFit() / aggregateYears() — the
// tracking harness (tplBacktest.ts) is the guard for the live pipeline; this file
// is the guard for anything that needs "the model as of year Y".

import { calculateStateModel, IMPUTED_HOUSE_ROW_WEIGHT } from "@/lib/tplCompute";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { statesData } from "@/data/statesData";

export const TYPES = ["P", "G", "S", "H", "L"] as const;
export const ANCHOR = 2026;

export interface PanelRow {
  abbr: string;
  type: string;
  race: string; // "Senate" · "Senate Special" · "Governor" · "President" · "House AL-01" · "State Legislature"
  district?: string;
  year: number;
  value: number | null; // eligible: raw margin · imputed: imputed lean
  imputed: boolean;
  eligibility: string;
  srcYear: number | null;
  incumbent: string;
  incumbentAppointed: boolean;
  demCandidate?: string;
  repCandidate?: string;
  demParty?: string;
  repParty?: string;
  ffGapPct: number | null; // (R$ − D$)/(R$ + D$) × 100, where both receipts known
  turnoutWeight: number; // House rows: total votes relative to the state-year mean (1 otherwise)
}

export interface Theta {
  lambda: number;
  huberC: number;
  impW: number;
  impWHouse: number; // imputed House rows (turnout-weighted shares of the state; live = IMPUTED_HOUSE_ROW_WEIGHT)
  betaShrink: number;
  sparseK: number;
  typeW: Record<string, number>;
  inc: Record<string, number | null>; // null = estimated inside each window's fit (S/G); number = fixed prior (H)
  ffK: number;
  ffCap: number;
}

// The pre-calibration baseline the coordinate search starts from (kept verbatim
// from the 2026-09-07 run so its printed objective stays comparable).
export const CURRENT: Theta = {
  lambda: 0.87,
  huberC: G.HUBER_C,
  impW: 0.5,
  impWHouse: IMPUTED_HOUSE_ROW_WEIGHT,
  betaShrink: G.BETA_SHRINK,
  sparseK: G.SPARSE_YEAR_K,
  typeW: { ...G.RACE_TYPE_WEIGHTS },
  inc: { H: 3, S: null, G: null }, // S/G fitted since 2026-09-08 (FL Gov 2022 sanity check); H fixed
  ffK: 0.02, // adopted 2026-09-07 (FF sweep: clean P-target optimum; S/H targets are
  ffCap: 2,  // biased against strips — see the IF note in tplCalibrate; forward model shares these)
};

// The constants the live model actually runs with (data/tplModelData.ts).
export const LIVE: Theta = {
  ...CURRENT,
  lambda: G.YEAR_WEIGHTS[2025] / G.YEAR_WEIGHTS[2024],
  typeW: { ...G.RACE_TYPE_WEIGHTS },
};

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── panel extraction (θ-independent, done once) ──────────────────────────────

export const panel: PanelRow[] = [];
export const targets: Record<string, Record<string, number | null>> = {};
for (const { abbr, name } of statesData) {
  const { races } = calculateStateModel(abbr, name);
  for (const r of races) {
    panel.push({
      abbr,
      type: r.raceType,
      race: r.race,
      district: r.district,
      year: r.year,
      value: r.adjustedMargin,
      imputed: r.imputed,
      eligibility: r.eligibility,
      srcYear: r.imputedSourceYear,
      incumbent: r.incumbent,
      incumbentAppointed: !!r.incumbentAppointed,
      demCandidate: r.demCandidate,
      repCandidate: r.repCandidate,
      demParty: r.demParty,
      repParty: r.repParty,
      ffGapPct: r.ffDetail && r.ffDetail.dem + r.ffDetail.rep > 0
        ? ((r.ffDetail.rep - r.ffDetail.dem) / (r.ffDetail.rep + r.ffDetail.dem)) * 100
        : null,
      turnoutWeight: r.turnoutWeight ?? 1,
    });
  }
  const firstRaw = (t: string, y: number) => races.find((r) => r.raceType === t && r.year === y)?.rawMargin ?? null;
  const hMean = (y: number) => {
    const vals = races.filter((r) => r.raceType === "H" && r.year === y && r.adjustedMargin != null).map((r) => r.adjustedMargin!);
    return vals.length ? mean(vals) : null;
  };
  targets[abbr] = { p24: firstRaw("P", 2024), s24: firstRaw("S", 2024), h24: hMean(2024), s22: firstRaw("S", 2022), h22: hMean(2022) };
}

// ── parameterized fit + aggregation (mirrors lib/tplCompute.ts) ──────────────

// Strip of the incumbency advantage present in the margin (R incumbent → −pts).
export function incPts(inc: Record<string, number>, raceType: string, incumbent: string, appointed = false): number {
  const pts = (inc[raceType] ?? 0) * (appointed ? F.APPOINTED_INCUMBENCY_SHARE : 1);
  if (incumbent === "R") return -pts;
  if (incumbent === "D") return pts;
  return 0;
}

// Strip of the fundraising advantage present in the margin (0 when unknown).
export function ffPts(t: Theta, gapPct: number | null): number {
  if (gapPct == null) return 0;
  return -Math.max(-t.ffCap, Math.min(t.ffCap, gapPct * t.ffK));
}

export interface Fit { E: Record<number, number>; beta: Record<string, number>; lean: Record<string, number>; inc: Record<string, number>; }

export function fitWindow(t: Theta, maxYear: number): Fit {
  const src = panel.filter((r) => !r.imputed && r.value != null && r.year <= maxYear);
  const typeCount: Record<string, number> = {};
  for (const r of src) { const k = `${r.abbr}:${r.year}:${r.type}`; typeCount[k] = (typeCount[k] ?? 0) + 1; }
  // Incumbency: fixed entries are used as-is; null entries (S/G) are estimated each
  // round from the incumbent-signed residual, exactly as getTplFit does.
  const fittedInc = Object.keys(t.inc).filter((k) => t.inc[k] == null);
  const inc: Record<string, number> = {};
  for (const k of Object.keys(t.inc)) inc[k] = t.inc[k] ?? (k === "S" ? 2 : k === "G" ? 7 : 0);
  const rows = src.map((r) => ({
    abbr: r.abbr, year: r.year, type: r.type,
    incSign: (r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0) * (r.incumbentAppointed ? F.APPOINTED_INCUMBENCY_SHARE : 1),
    raw: r.value! + ffPts(t, r.ffGapPct),
    adj: r.value! + incPts(inc, r.type, r.incumbent, r.incumbentAppointed) + ffPts(t, r.ffGapPct),
    base: (t.typeW[r.type] ?? 0.05) / typeCount[`${r.abbr}:${r.year}:${r.type}`],
    w: 1,
  }));
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const E: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const lean: Record<string, number> = {};
  const beta: Record<string, number> = {};
  const byState: Record<string, typeof rows> = {};
  const byYear: Record<number, typeof rows> = {};
  for (const r of rows) { (byState[r.abbr] ??= []).push(r); (byYear[r.year] ??= []).push(r); }
  for (const abbr of Object.keys(byState)) {
    lean[abbr] = mean(byState[abbr].map((r) => r.adj));
    beta[abbr] = 1;
  }
  for (let it = 0; it < G.FIT_ITERATIONS; it += 1) {
    for (const r of rows) {
      const res = r.adj - lean[r.abbr] - beta[r.abbr] * E[r.year];
      r.w = r.base * (Math.abs(res) <= t.huberC ? 1 : t.huberC / Math.abs(res));
    }
    for (const y of years) {
      let num = 0, den = 0;
      for (const r of byYear[y]) { const b = beta[r.abbr]; num += r.w * b * (r.adj - lean[r.abbr]); den += r.w * b * b; }
      E[y] = den > 0 ? (num / den) * (byYear[y].length / (byYear[y].length + t.sparseK)) : 0;
    }
    for (const abbr of Object.keys(byState)) {
      let num = 0, den = 0;
      for (const r of byState[abbr]) { const e = E[r.year]; num += r.w * e * (r.adj - lean[abbr]); den += r.w * e * e; }
      const raw = den > 0 ? num / den : 1;
      beta[abbr] = Math.max(G.BETA_MIN, Math.min(G.BETA_MAX, 1 + t.betaShrink * (raw - 1)));
    }
    for (const abbr of Object.keys(byState)) {
      let num = 0, den = 0;
      for (const r of byState[abbr]) { num += r.w * (r.adj - beta[abbr] * E[r.year]); den += r.w; }
      if (den > 0) lean[abbr] = num / den;
    }
    for (const type of fittedInc) {
      let num = 0, den = 0;
      for (const r of rows) {
        if (r.type !== type || r.incSign === 0) continue;
        num += r.w * r.incSign * (r.raw - lean[r.abbr] - beta[r.abbr] * E[r.year]); den += r.w;
      }
      if (den > 0) inc[type] = num / den;
    }
    for (const r of rows) r.adj = r.raw - r.incSign * (inc[r.type] ?? 0);
  }
  return { E, beta, lean, inc };
}

// State TPL as of `maxYear`, from a fit over the same window: the recency-decayed,
// coverage-weighted blend of per-year type means of stripped margins. Mirrors
// calculateStateModel + aggregateYears: statewide rows carry a row-level Huber factor vs
// the fitted lean; House rows are turnout-weighted with ONE Huber factor on the House
// year's type weight instead.
export function stateTpl(t: Theta, fit: Fit, abbr: string, maxYear: number): number | null {
  const rows = panel.filter((r) => r.abbr === abbr && r.value != null && r.year <= maxYear);
  const beta = fit.beta[abbr] ?? 1;
  const lean = fit.lean[abbr];
  interface YearAgg { wrs: number; coverage: number; year: number; }
  const yearAggs: YearAgg[] = [];
  for (const year of [...new Set(rows.map((r) => r.year))]) {
    const typeNMs: Partial<Record<string, number>> = {};
    const typeFactor: Record<string, number> = {};
    for (const type of TYPES) {
      let num = 0, den = 0;
      for (const r of rows.filter((x) => x.year === year && x.type === type)) {
        const envYear = r.imputed ? r.srcYear ?? r.year : r.year;
        const nm = r.imputed
          ? r.value! - beta * (fit.E[envYear] ?? 0)
          : r.value! + incPts(fit.inc, r.type, r.incumbent, r.incumbentAppointed) + ffPts(t, r.ffGapPct) - beta * (fit.E[year] ?? 0);
        const resid = lean != null ? nm - lean : 0;
        const huber = type === "H" ? 1 : Math.abs(resid) <= t.huberC ? 1 : t.huberC / Math.abs(resid);
        const w = (r.imputed ? (type === "H" ? t.impWHouse : t.impW) : 1) * huber * (type === "H" ? r.turnoutWeight : 1);
        num += w * nm; den += w;
      }
      if (den > 0) {
        typeNMs[type] = num / den;
        const tr = type === "H" && lean != null ? Math.abs(typeNMs[type]! - lean) : 0;
        typeFactor[type] = tr <= t.huberC ? 1 : t.huberC / tr;
      }
    }
    const present = TYPES.filter((x) => typeNMs[x] != null);
    if (present.length === 0) continue;
    const coverage = present.reduce((a, x) => a + (t.typeW[x] ?? 0) * typeFactor[x], 0);
    const wrs = present.reduce((a, x) => a + (((t.typeW[x] ?? 0) * typeFactor[x]) / coverage) * typeNMs[x]!, 0);
    yearAggs.push({ year, wrs, coverage });
  }
  if (yearAggs.length === 0) return null;
  const tot = yearAggs.reduce((a, y) => a + t.lambda ** (ANCHOR - y.year) * y.coverage, 0);
  return yearAggs.reduce((a, y) => a + ((t.lambda ** (ANCHOR - y.year) * y.coverage) / tot) * y.wrs, 0);
}
