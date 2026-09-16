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

import { statesData } from "@/data/statesData";

import { type Theta, CURRENT, mean, targets, fitWindow, stateTpl, median } from "./tplWindowFit";

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
if (process.argv.includes("--baseline")) process.exit(0);

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
