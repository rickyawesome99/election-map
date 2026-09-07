// TPL backtest harness — Phase 1 of the TPL rebuild.
//
// Run:  npx tsx scripts/tplBacktest.ts            (holdout + ablation vs baselines)
//       npx tsx scripts/tplBacktest.ts --matrix   (cross-office predictiveness matrix)
//
// Protocol: hold out the most recent cycle (2024), build each predictor from
// information through 2022, predict the held-out results after removing a uniform
// national shift (the median residual), and report MAE + Pearson r per target.
//
// Acceptance test: the default mode must reproduce the reference numbers below,
// re-baselined after each intentional model change. History:
//   2026-09 review (pre-rebuild, scraped):  P 3.01/3.14/3.31/1.93 · S 5.04/4.90/4.74/4.95 · H 3.96/2.91/2.60/2.85
//   Phase 2 (eligibility gate + imputation): P 2.93/3.13/3.34/1.93 · S 4.97/4.83/4.75/4.95 · H 3.45/2.56/2.62/2.83
//     — improved every full-pipeline cell; House target definition changed
//       (imputed districts now enter at presidential lean, not the old blend).
//   Phase 3 (fitted E/β*, additive IF, 2016+odd years, coverage-scaled weights,
//   Huber race weights in aggregation): P 3.21/3.54/3.69/1.93 · S 4.96/5.09/5.11/4.95 ·
//   H 3.07/2.85/2.91/2.83 — NM beats its own ablations on P and S; Senate NM now ties
//   pres-only. Two Phase 4 knobs identified: decay λ (the 2016–17 window extension cost
//   ~0.3 on Senate before Huber) and HUBER_C (static-lean anchoring also dampens genuine
//   realignment — raising C trades robustness for responsiveness on the P target).
//   Phase 4 (calibration via scripts/tplCalibrate.ts: λ 0.87 → 0.75, type weights →
//   P.60/S.10/H.20/L.07/G.03; all other knobs kept — see tplModelData comments):
//       P 3.02/3.31/3.42/1.93 · S 4.81/4.98/5.00/4.95 · H 3.04/2.76/2.83/2.83
//     — Senate NM now beats presidential-only outright (4.81 vs 4.95).
// The 0.10 tolerance catches any real formula change, which moves these by far more.

import { calculateStateModel, getTplFit, type ComputedRace } from "@/lib/tplCompute";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { statesData } from "@/data/statesData";

type Maybe = number | null;

const TYPES = ["P", "G", "S", "H", "L"] as const;

// ── small stats helpers ──────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clip = (v: number, c: number) => Math.max(-c, Math.min(c, v));

interface EvalResult { n: number; shift: number; mae: number; r: number; }

// Score predictor vs target across states: remove the median residual (a uniform
// national shift the lean is not expected to know), then MAE around it.
function evaluate(pred: Maybe[], tgt: Maybe[]): EvalResult | null {
  const pairs: [number, number][] = [];
  pred.forEach((p, i) => { const t = tgt[i]; if (p != null && t != null) pairs.push([p, t]); });
  if (pairs.length < 8) return null;
  const res = pairs.map(([p, t]) => t - p);
  const shift = median(res);
  const mae = mean(res.map((x) => Math.abs(x - shift)));
  const xs = pairs.map(([p]) => p), ys = pairs.map(([, t]) => t);
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const vx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const vy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { n: pairs.length, shift, mae, r: vx && vy ? cov / Math.sqrt(vx * vy) : 0 };
}

// ── aggregation mirroring aggregateYears(), but on a chosen per-race value ───
// (lets us ablate the pipeline: NM = full model, adjusted = no strips, raw = nothing)
// Year weight = recency decay × base type-weight coverage, matching the model.
// Caveat: NM values embed E/β fitted on ALL years incl. the held-out one — mild
// leakage; a strict refit-per-holdout is a Phase 4 harness upgrade.

function aggregate(
  races: ComputedRace[],
  value: (r: ComputedRace) => Maybe,
  years: number[]
): Maybe {
  const yearSignals: { year: number; wrs: number; coverage: number }[] = [];
  for (const year of years) {
    const typeNMs: Partial<Record<string, number>> = {};
    for (const t of TYPES) {
      const pairs = races
        .filter((r) => r.year === year && r.raceType === t)
        .map((r) => [value(r), r.aggWeight] as const)
        .filter((pair): pair is readonly [number, number] => pair[0] != null);
      const wsum = pairs.reduce((a, [, w]) => a + w, 0);
      if (wsum > 0) typeNMs[t] = pairs.reduce((a, [v, w]) => a + v * w, 0) / wsum;
    }
    const present = TYPES.filter((t) => typeNMs[t] != null);
    if (present.length === 0) continue;
    const totalW = present.reduce((s, t) => s + (G.RACE_TYPE_WEIGHTS[t] ?? 0), 0);
    yearSignals.push({
      year,
      wrs: present.reduce((s, t) => s + ((G.RACE_TYPE_WEIGHTS[t] ?? 0) / totalW) * typeNMs[t]!, 0),
      coverage: totalW,
    });
  }
  if (yearSignals.length === 0) return null;
  const totalYw = yearSignals.reduce((s, y) => s + (G.YEAR_WEIGHTS[y.year] ?? 0) * y.coverage, 0);
  if (totalYw === 0) return null;
  return yearSignals.reduce((s, y) => s + (((G.YEAR_WEIGHTS[y.year] ?? 0) * y.coverage) / totalYw) * y.wrs, 0);
}

// ── per-state data ───────────────────────────────────────────────────────────

interface StateRow {
  abbr: string;
  races: ComputedRace[];
  // predictors (info through 2022)
  nmHold: Maybe; adjHold: Maybe; rawHold: Maybe; pres2020: Maybe;
  // held-out 2024 targets
  p24: Maybe; s24: Maybe; h24: Maybe;
}

function buildRows(): StateRow[] {
  const HOLD_YEARS = G.YEARS.filter((y) => y <= 2022); // 2016–2022 incl. odd years
  return statesData.map(({ abbr, name }) => {
    const { races } = calculateStateModel(abbr, name);
    const firstRaw = (t: string, year: number): Maybe =>
      races.find((r) => r.raceType === t && r.year === year)?.rawMargin ?? null;
    const h24s = races
      .filter((r) => r.raceType === "H" && r.year === 2024 && r.adjustedMargin != null)
      .map((r) => r.adjustedMargin!) ;
    return {
      abbr,
      races,
      nmHold: aggregate(races, (r) => r.NM, HOLD_YEARS),
      adjHold: aggregate(races, (r) => r.adjustedMargin, HOLD_YEARS),
      rawHold: aggregate(races, (r) => (r.rawMargin == null ? null : clip(r.rawMargin, 50)), HOLD_YEARS),
      pres2020: firstRaw("P", 2020),
      p24: firstRaw("P", 2024),
      s24: firstRaw("S", 2024),
      h24: h24s.length ? mean(h24s) : null,
    };
  });
}

// ── default mode: holdout + ablation vs baselines ────────────────────────────

const EXPECTED: Record<string, Record<string, number>> = {
  // reference values (post-Phase-4 calibration, measured in-harness): target → predictor → MAE
  p24: { nmHold: 3.02, adjHold: 3.31, rawHold: 3.42, pres2020: 1.93 },
  s24: { nmHold: 4.81, adjHold: 4.98, rawHold: 5.0, pres2020: 4.95 },
  h24: { nmHold: 3.04, adjHold: 2.76, rawHold: 2.83, pres2020: 2.83 },
};

function runHoldout(): void {
  const rows = buildRows();
  const predictors: [keyof StateRow, string][] = [
    ["nmHold", "TPL holdout (full NM pipeline)"],
    ["adjHold", "Adjusted only (no IF/CQ/WA)"],
    ["rawHold", "Raw, clipped ±50"],
    ["pres2020", "2020 presidential alone"],
  ];
  const targets: [keyof StateRow, string][] = [
    ["p24", "2024 President"],
    ["s24", "2024 Senate"],
    ["h24", "2024 House avg (adjusted)"],
  ];
  let pass = true;
  for (const [tKey, tLabel] of targets) {
    console.log(`\n${tLabel}`);
    for (const [pKey, pLabel] of predictors) {
      const e = evaluate(rows.map((r) => r[pKey] as Maybe), rows.map((r) => r[tKey] as Maybe));
      if (!e) { console.log(`  ${pLabel.padEnd(34)} insufficient data`); continue; }
      const expected = EXPECTED[tKey as string]?.[pKey as string];
      const drift = expected != null ? Math.abs(e.mae - expected) : null;
      const ok = drift == null || drift < 0.10;
      if (!ok) pass = false;
      console.log(
        `  ${pLabel.padEnd(34)} n=${String(e.n).padStart(2)}  MAE=${e.mae.toFixed(2)}  r=${e.r.toFixed(3)}  shift=${e.shift >= 0 ? "+" : ""}${e.shift.toFixed(2)}` +
        (expected != null ? `  [ref: ${expected.toFixed(2)} ${ok ? "OK" : "DRIFT"}]` : "")
      );
    }
  }
  console.log(`\nAcceptance vs reference numbers: ${pass ? "PASS" : "FAIL — harness no longer reproduces the review; investigate before trusting comparisons"}`);
  process.exitCode = pass ? 0 : 1;
}

// ── matrix mode: how well does each office predict each future office? ───────
// Conventions match the 2026-09-07 predictiveness matrix: predictor = mean of
// (adjusted ?? raw) clipped ±60 over the info window; targets = per-office mean
// of raw margins in the target year (House: mean of adjusted, clipped ±60).

function officeSignal(races: ComputedRace[], t: string, ylo: number, yhi: number): Maybe {
  const vals = races
    .filter((r) => r.raceType === t && r.year >= ylo && r.year <= yhi)
    .map((r) => r.adjustedMargin ?? r.rawMargin)
    .filter((v): v is number => v != null)
    .map((v) => clip(v, 60));
  return vals.length ? mean(vals) : null;
}

function officeTarget(races: ComputedRace[], t: string, year: number): Maybe {
  const vals = races
    .filter((r) => r.raceType === t && r.year === year)
    .map((r) => (t === "H" ? r.adjustedMargin : r.rawMargin))
    .filter((v): v is number => v != null)
    .map((v) => (t === "H" ? clip(v, 60) : v));
  return vals.length ? mean(vals) : null;
}

function runMatrix(): void {
  const all = statesData.map(({ abbr, name }) => ({ abbr, races: calculateStateModel(abbr, name).races }));
  const scenarios: { label: string; window: [number, number]; presYear: number; targetYear: number }[] = [
    { label: "2024 targets (info thru 2022)", window: [2017, 2022], presYear: 2020, targetYear: 2024 },
    { label: "2022 targets (info thru 2020)", window: [2017, 2020], presYear: 2020, targetYear: 2022 },
  ];
  for (const sc of scenarios) {
    console.log(`\n== ${sc.label} ==`);
    console.log("pred  " + TYPES.map((t) => `→${t}`.padStart(24)).join(""));
    for (const p of TYPES) {
      let line = `${p}     `;
      for (const t of TYPES) {
        const pred = all.map(({ races }) =>
          p === "P" ? officeSignal(races, "P", sc.presYear, sc.presYear) : officeSignal(races, p, sc.window[0], sc.window[1])
        );
        const tgt = all.map(({ races }) => officeTarget(races, t, sc.targetYear));
        const e = evaluate(pred, tgt);
        line += e ? `  n=${String(e.n).padStart(2)} mae=${e.mae.toFixed(1).padStart(4)} r=${(e.r >= 0 ? "+" : "") + e.r.toFixed(2)}` : "                       —";
      }
      console.log(line);
    }
  }
}

// ── fit mode: print fitted E(y) and β* for sanity checks ─────────────────────

function runFit(): void {
  const fit = getTplFit();
  console.log(`rows used: ${fit.rowsUsed}`);
  console.log("\nE(y) — fitted national environment (R-positive):");
  for (const y of fit.years) {
    const n = Object.keys(fit.beta).length;
    console.log(`  ${y}  E=${fit.E[y] >= 0 ? "+" : ""}${fit.E[y].toFixed(2)}`);
    void n;
  }
  const betas = Object.entries(fit.beta).sort((a, b) => b[1].shrunk - a[1].shrunk);
  console.log("\nβ* extremes (shrunk · raw · races):");
  for (const [abbr, b] of [...betas.slice(0, 6), ...betas.slice(-6)]) {
    console.log(`  ${abbr}  β*=${b.shrunk.toFixed(2)}  β̂=${b.raw.toFixed(2)}  n=${b.n}`);
  }
}

if (process.argv.includes("--matrix")) runMatrix();
else if (process.argv.includes("--fit")) runFit();
else runHoldout();
