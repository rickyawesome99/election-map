// TPL calibration (Phase 4 of the rebuild).
//
// Run:  npx tsx scripts/tplCalibrate.ts
//
// Leakage-free coordinate search over the model's free constants. Unlike the
// tracking harness (tplBacktest.ts), which reads the live model's NMs (whose
// E/β saw every year), this script re-extracts the raw per-race panel once and
// REFITS environment/elasticity from scratch inside each holdout window:
//
//   round A: fit + aggregate on years ≤ 2022 → predict 2024 President/Senate/House
//   round B: fit + aggregate on years ≤ 2020 → predict 2022 Senate/House
//
// Objective = mean of the five target MAEs (uniform-shift removed per target).
// A knob change is only worth adopting if it helps the objective materially and
// doesn't get all its gain from a single round (that's tuning to one year).
//
// ADOPTED 2026-09-07 (now the live constants in data/tplModelData.ts):
//   λ = 0.75 (monotone gain 1.0→0.75 on both rounds; 0.65–0.70 no better)
//   type weights = P.60/S.10/H.20/L.07/G.03 (knee of the P-weight curve; the
//     objective marginally preferred P.65 (−0.056) / P.70 (−0.076), driven
//     almost entirely by the 2024 presidential target — declined for identity
//     and single-regime-overfit reasons, floors P.20/H.10/S.05/L.03/G.02)
//   kept: HUBER_C 7, impW 0.5, betaShrink 0.5, sparseK 4 (all ≤0.01 effects);
//   Huber-off rejected by design; IF constants excluded from tuning (see below).

import { calculateStateModel } from "@/lib/tplCompute";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { statesData } from "@/data/statesData";

const TYPES = ["P", "G", "S", "H", "L"] as const;
const ANCHOR = 2026;

interface PanelRow {
  abbr: string;
  type: string;
  year: number;
  value: number | null; // eligible: raw margin · imputed: imputed lean
  imputed: boolean;
  srcYear: number | null;
  incumbent: string;
  ffGapPct: number | null; // (R$ − D$)/(R$ + D$) × 100, where both receipts known
}

interface Theta {
  lambda: number;
  huberC: number;
  impW: number;
  betaShrink: number;
  sparseK: number;
  typeW: Record<string, number>;
  inc: Record<string, number | null>; // null = estimated inside each window's fit (S/G); number = fixed prior (H)
  ffK: number;
  ffCap: number;
}

const CURRENT: Theta = {
  lambda: 0.87,
  huberC: G.HUBER_C,
  impW: 0.5,
  betaShrink: G.BETA_SHRINK,
  sparseK: G.SPARSE_YEAR_K,
  typeW: { ...G.RACE_TYPE_WEIGHTS },
  inc: { H: 3, S: null, G: null }, // S/G fitted since 2026-09-08 (FL Gov 2022 sanity check); H fixed
  ffK: 0.02, // adopted 2026-09-07 (FF sweep: clean P-target optimum; S/H targets are
  ffCap: 2,  // biased against strips — see the IF note below; forward model shares these)
};

// Weight-vector candidates all respect the decided floors: P.20 H.10 S.05 L.03 G.02
const WEIGHT_CANDIDATES: Record<string, number>[] = [
  { P: 0.45, S: 0.2, H: 0.25, L: 0.07, G: 0.03 }, // current
  { P: 0.5, S: 0.15, H: 0.25, L: 0.07, G: 0.03 },
  { P: 0.55, S: 0.1, H: 0.25, L: 0.07, G: 0.03 },
  { P: 0.6, S: 0.1, H: 0.2, L: 0.07, G: 0.03 },
  { P: 0.4, S: 0.25, H: 0.25, L: 0.07, G: 0.03 },
  { P: 0.35, S: 0.2, H: 0.3, L: 0.1, G: 0.05 },
  { P: 0.45, S: 0.15, H: 0.3, L: 0.07, G: 0.03 },
  { P: 0.3, S: 0.3, H: 0.3, L: 0.05, G: 0.05 }, // pre-rebuild
  { P: 0.47, S: 0.21, H: 0.26, L: 0.04, G: 0.02 },
  { P: 0.2, S: 0.25, H: 0.35, L: 0.1, G: 0.1 },
  { P: 0.65, S: 0.1, H: 0.15, L: 0.07, G: 0.03 },
  { P: 0.7, S: 0.08, H: 0.12, L: 0.07, G: 0.03 },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── panel extraction (θ-independent, done once) ──────────────────────────────

const panel: PanelRow[] = [];
const targets: Record<string, Record<string, number | null>> = {};
for (const { abbr, name } of statesData) {
  const { races } = calculateStateModel(abbr, name);
  for (const r of races) {
    panel.push({
      abbr,
      type: r.raceType,
      year: r.year,
      value: r.adjustedMargin,
      imputed: r.imputed,
      srcYear: r.imputedSourceYear,
      incumbent: r.incumbent,
      ffGapPct: r.ffDetail && r.ffDetail.dem + r.ffDetail.rep > 0
        ? ((r.ffDetail.rep - r.ffDetail.dem) / (r.ffDetail.rep + r.ffDetail.dem)) * 100
        : null,
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

function incPts(inc: Record<string, number>, raceType: string, incumbent: string): number {
  const pts = inc[raceType] ?? 0;
  if (incumbent === "R") return -pts;
  if (incumbent === "D") return pts;
  return 0;
}

// Strip of the fundraising advantage present in the margin (0 when unknown).
function ffPts(t: Theta, gapPct: number | null): number {
  if (gapPct == null) return 0;
  return -Math.max(-t.ffCap, Math.min(t.ffCap, gapPct * t.ffK));
}

interface Fit { E: Record<number, number>; beta: Record<string, number>; lean: Record<string, number>; inc: Record<string, number>; }

function fitWindow(t: Theta, maxYear: number): Fit {
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
    incSign: r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0,
    raw: r.value! + ffPts(t, r.ffGapPct),
    adj: r.value! + incPts(inc, r.type, r.incumbent) + ffPts(t, r.ffGapPct),
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

function stateTpl(t: Theta, fit: Fit, abbr: string, maxYear: number): number | null {
  const rows = panel.filter((r) => r.abbr === abbr && r.value != null && r.year <= maxYear);
  const beta = fit.beta[abbr] ?? 1;
  const lean = fit.lean[abbr];
  interface YearAgg { wrs: number; coverage: number; year: number; }
  const yearAggs: YearAgg[] = [];
  for (const year of [...new Set(rows.map((r) => r.year))]) {
    const typeNMs: Partial<Record<string, number>> = {};
    for (const type of TYPES) {
      let num = 0, den = 0;
      for (const r of rows.filter((x) => x.year === year && x.type === type)) {
        const envYear = r.imputed ? r.srcYear ?? r.year : r.year;
        const nm = r.imputed
          ? r.value! - beta * (fit.E[envYear] ?? 0)
          : r.value! + incPts(fit.inc, r.type, r.incumbent) + ffPts(t, r.ffGapPct) - beta * (fit.E[year] ?? 0);
        const resid = lean != null ? nm - lean : 0;
        const huber = Math.abs(resid) <= t.huberC ? 1 : t.huberC / Math.abs(resid);
        const w = (r.imputed ? t.impW : 1) * huber;
        num += w * nm; den += w;
      }
      if (den > 0) typeNMs[type] = num / den;
    }
    const present = TYPES.filter((x) => typeNMs[x] != null);
    if (present.length === 0) continue;
    const coverage = present.reduce((a, x) => a + (t.typeW[x] ?? 0), 0);
    const wrs = present.reduce((a, x) => a + ((t.typeW[x] ?? 0) / coverage) * typeNMs[x]!, 0);
    yearAggs.push({ year, wrs, coverage });
  }
  if (yearAggs.length === 0) return null;
  const tot = yearAggs.reduce((a, y) => a + t.lambda ** (ANCHOR - y.year) * y.coverage, 0);
  return yearAggs.reduce((a, y) => a + ((t.lambda ** (ANCHOR - y.year) * y.coverage) / tot) * y.wrs, 0);
}

// ── objective ────────────────────────────────────────────────────────────────

function roundMae(t: Theta, fitMax: number, tgtKeys: string[]): Record<string, number> {
  const fit = fitWindow(t, fitMax);
  const preds: Record<string, number | null> = {};
  for (const { abbr } of statesData) preds[abbr] = stateTpl(t, fit, abbr, fitMax);
  const out: Record<string, number> = {};
  for (const k of tgtKeys) {
    const pairs: [number, number][] = [];
    for (const { abbr } of statesData) {
      const p = preds[abbr]; const y = targets[abbr][k];
      if (p != null && y != null) pairs.push([p, y]);
    }
    const res = pairs.map(([p, y]) => y - p);
    const shift = median(res);
    out[k] = mean(res.map((x) => Math.abs(x - shift)));
  }
  return out;
}

function objective(t: Theta): { obj: number; parts: Record<string, number> } {
  const a = roundMae(t, 2022, ["p24", "s24", "h24"]);
  const b = roundMae(t, 2020, ["s22", "h22"]);
  const parts = { ...a, ...b };
  return { obj: mean(Object.values(parts)), parts };
}

// ── coordinate search ────────────────────────────────────────────────────────

const fmtParts = (p: Record<string, number>) =>
  Object.entries(p).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ");

const theta: Theta = JSON.parse(JSON.stringify(CURRENT));
let best = objective(theta);
console.log(`baseline  obj=${best.obj.toFixed(3)}  ${fmtParts(best.parts)}\n`);

type Setter = (t: Theta, v: unknown) => void;
const knobs: { name: string; cands: unknown[]; get: (t: Theta) => unknown; set: Setter }[] = [
  { name: "lambda", cands: [0.75, 0.8, 0.83, 0.87, 0.9, 0.94, 1.0], get: (t) => t.lambda, set: (t, v) => { t.lambda = v as number; } },
  // Huber stays ON by design (decision 8): disabling it wins ~0.02 on P-targets by
  // sacrificing robustness (and Senate accuracy) — not adoptable. Only C is tuned.
  { name: "huberC", cands: [4, 5.5, 7, 10], get: (t) => t.huberC, set: (t, v) => { t.huberC = v as number; } },
  { name: "impW", cands: [0.25, 0.5, 1.0], get: (t) => t.impW, set: (t, v) => { t.impW = v as number; } },
  { name: "betaShrink", cands: [0.3, 0.5, 0.7], get: (t) => t.betaShrink, set: (t, v) => { t.betaShrink = v as number; } },
  { name: "sparseK", cands: [2, 4, 8], get: (t) => t.sparseK, set: (t, v) => { t.sparseK = v as number; } },
  { name: "typeW", cands: WEIGHT_CANDIDATES, get: (t) => t.typeW, set: (t, v) => { t.typeW = v as Record<string, number>; } },
  // Incumbency is NOT tuned against this objective: the S/H targets are raw margins
  // that still contain incumbency, so it structurally rewards under-stripping.
  // Senate/Governor are instead estimated inside each window's fit (inc: null above),
  // the same way E and β are; House keeps the fixed prior of 3.
];

for (let pass = 1; pass <= 2; pass += 1) {
  console.log(`── pass ${pass} ──`);
  for (const knob of knobs) {
    let bestV = knob.get(theta);
    let bestObj = best;
    const lines: string[] = [];
    for (const v of knob.cands) {
      const trial: Theta = JSON.parse(JSON.stringify(theta));
      knob.set(trial, v);
      const r = objective(trial);
      const label = typeof v === "object" ? Object.entries(v as object).map(([k2, x]) => `${k2}${x}`).join("/") : String(v);
      lines.push(`    ${label.padEnd(28)} obj=${r.obj.toFixed(3)}  ${fmtParts(r.parts)}`);
      if (r.obj < bestObj.obj - 1e-9) { bestObj = r; bestV = v; }
    }
    const changed = JSON.stringify(bestV) !== JSON.stringify(knob.get(theta));
    console.log(`  ${knob.name}${changed ? `  →  ${typeof bestV === "object" ? JSON.stringify(bestV) : bestV}  (obj ${best.obj.toFixed(3)} → ${bestObj.obj.toFixed(3)})` : "  (keep)"}`);
    if (pass === 1) for (const l of lines) console.log(l);
    if (changed) { knob.set(theta, bestV); best = bestObj; }
  }
}

console.log(`\nfinal theta: ${JSON.stringify(theta)}`);
console.log(`final  obj=${best.obj.toFixed(3)}  ${fmtParts(best.parts)}`);
const cur = objective(CURRENT);
console.log(`current obj=${cur.obj.toFixed(3)}  ${fmtParts(cur.parts)}`);
