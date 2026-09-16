// Forward backtest (Phase 1 of the 2026 forecast revamp).
//
// Run:  npx tsx scripts/forwardBacktest.ts
//       npx tsx scripts/forwardBacktest.ts --years 2018,2020,2022,2024 --env all|fitted|gb|mapped|final
//       npx tsx scripts/forwardBacktest.ts --ablate        (drop each forward term under env=mapped)
//       npx tsx scripts/forwardBacktest.ts --dump          (per-race predictions CSV in the OS temp dir)
//
// Predicts every eligible Senate / Governor race (and, where the district lines
// in force are the ones we hold presidential data for, every House race) in a
// target year Y the way the site would have in mid-September of that year:
//
//   pred = lean(as of Y−1) + β*(state) × E_hat(Y) + incumbency + fundraising
//
// with lean/β*/E/incumbency REFIT on years ≤ Y−1 (scripts/tplWindowFit.ts, the
// same leakage-free refit the calibration search uses). Unlike the tracking
// harness (tplBacktest.ts), NO uniform shift is removed before scoring, so the
// environment term, the bias and the probability curve are all on trial.
//
// Environment modes for E_hat(Y):
//   fitted   oracle: E(Y) from a fit that includes year Y (upper bound)
//   gb       today's site rule: the mid-September generic ballot margin itself
//   pv       structural conversion applied to the ACTUAL House vote (isolates the
//            scale/centering conversion from polling error)
//   mapped   E_hat = a + b × GB_mid_sept(Y), a/b fitted on the OTHER even years
//   final    same mapping but on the election-eve generic ballot
//   struct   the Phase 2 rule: E_hat = c + s × (GB_mid_sept + ½ × mean poll miss),
//            c/s fitted from E against the House vote on the OTHER even years
//
// Inputs: data-entry/national_environment_history.csv (mid-September and final
// generic-ballot averages per year — the mid-September values are approximate
// and flagged in the file; refine them before trusting the mapped mode).
//
// House: district presidential data is on the 2026 lines only, so a House race in
// year Y is scored only where no redraw is on file after Y — 2022/2024 in states
// without a 2026 redraw, and 2018/2020 only in the handful of districts whose
// lines survived the 2022 redistricting. Fundraising uses full-cycle receipts (a
// mild optimism versus a September snapshot).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { panel, fitWindow, stateTpl, LIVE, incPts, ffPts, mean, type Fit, type Theta } from "./tplWindowFit";
import { houseData, houseDistrictInfo, type PastResult } from "@/data/forecastData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { fundraisingData } from "@/data/fundraisingData";
import { classifyEligibility } from "@/data/raceEligibility";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { marginToProbability, solveCandidateEffects, buildObservablePrior, warCandidateKey, type EffectRace } from "@/lib/tplCompute";

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const YEARS = (argOf("--years") ?? "2018,2020,2022,2024").split(",").map(Number);
const ENV = argOf("--env") ?? "all";
const ABLATE = argv.includes("--ablate");
const QUALITY_SWEEP = argv.includes("--quality");
const NO_QUALITY = argv.includes("--no-quality");
const NO_PRIOR = argv.includes("--no-prior");
const APPOINTED = argv.includes("--appointed");
const DUMP = argv.includes("--dump");
const THETA: Theta = LIVE;
const H_INC = 3; // fixed House incumbency prior (INCUMBENT_ADVANTAGE_FIXED)

// ── national environment history (data/nationalEnvironmentHistory.ts) ───────
interface EnvRow { year: number; gbSept: number; gbFinal: number; housePv: number; }
const envHistory: Record<number, EnvRow> = {};
for (const r of nationalEnvironmentHistory) {
  if (r.gbMidSept == null || r.gbFinal == null || r.housePv == null) continue;
  envHistory[r.year] = { year: r.year, gbSept: r.gbMidSept, gbFinal: r.gbFinal, housePv: r.housePv };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0; const a = my - b * mx;
  const ssRes = ys.reduce((s, y, i) => s + (y - a - b * xs[i]) ** 2, 0); const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { a, b, r2: ssTot ? 1 - ssRes / ssTot : 0 };
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x: number): number { // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const fmt = (v: number, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d);

// ── per-race prediction rows ─────────────────────────────────────────────────
interface Pred {
  office: "S" | "G" | "H"; year: number; key: string;
  actual: number; lean: number; beta: number; inc: number; ff: number;
  quality: number; // R-positive: effect_R − effect_D, solved as of Y from races ≤ Y−1 (0 without a record)
}
const fitCache = new Map<number, Fit>();
const fitUpTo = (y: number) => { if (!fitCache.has(y)) fitCache.set(y, fitWindow(THETA, y)); return fitCache.get(y)!; };
const fitFull = fitUpTo(2025);

function forwardIncS(fit: Fit, type: string, incumbent: string, appointed = false): number { return -incPts(fit.inc, type, incumbent, appointed); }
function forwardFf(gapPct: number | null): number { return -ffPts(THETA, gapPct); }
const gapOf = (m: { dem: number | null; rep: number | null } | undefined) =>
  m && m.dem != null && m.rep != null && m.dem + m.rep > 0 ? ((m.rep - m.dem) / (m.rep + m.dem)) * 100 : null;

// District lean as of year Y−1 on the district's current lines, mirroring
// calculateDistrictModel: presidential rows before Y plus eligible House rows of
// the boundary era, stripped, decay- and coverage-weighted with two-pass Huber.
function districtLeanAsOf(race: typeof houseData[number], Y: number, fit: Fit): number | null {
  const dp = districtPresidentialData[String(parseInt(race.id, 10))];
  if (!dp) return null;
  const infoYears = (houseDistrictInfo[race.id] ?? []).map((e) => e.year);
  // The presidential data is on the 2026 lines; a district is scorable for year Y only
  // if no redraw is on file after Y (2022 redraws exclude 2018/2020; 2026 redraws exclude 2022/2024).
  if (infoYears.some((y) => y > Y)) return null;
  const eraStart = infoYears.filter((y) => y <= Y).length ? Math.max(...infoYears.filter((y) => y <= Y)) : 2016;
  const beta = fit.beta[dp.state] ?? 1;
  const rows: { year: number; type: "P" | "H"; nm: number; w: number }[] = [];
  for (const [year, margin] of [[2016, dp.pres16RepPct - dp.pres16DemPct], [2020, dp.pres20RepPct - dp.pres20DemPct], [2024, dp.pres24RepPct - dp.pres24DemPct]] as [number, number][]) {
    if (year >= Y) continue;
    rows.push({ year, type: "P", nm: margin - beta * (fit.E[year] ?? 0), w: 1 });
  }
  for (const r of race.pastResults ?? []) {
    if (r.year < Math.max(2016, eraStart) || r.year > Y - 1) continue;
    if (classifyEligibility(r, dp.state) !== "eligible") continue;
    const incumbent = r.demIncumbent ? "D" : r.repIncumbent ? "R" : "Open";
    const gap = gapOf(fundraisingData[`H:${race.name}:${r.year}`]);
    const nm = r.repPct - r.demPct + incPts({ H: H_INC }, "H", incumbent) + ffPts(THETA, gap) - beta * (fit.E[r.year] ?? 0);
    rows.push({ year: r.year, type: "H", nm, w: 1 });
  }
  if (rows.length === 0) return null;
  const aggregate = () => {
    const years = [...new Set(rows.map((r) => r.year))];
    let num = 0, den = 0;
    for (const year of years) {
      const typeMeans: Partial<Record<"P" | "H", number>> = {};
      for (const type of ["P", "H"] as const) {
        const rs = rows.filter((r) => r.year === year && r.type === type);
        const w = rs.reduce((a, r) => a + r.w, 0);
        if (w > 0) typeMeans[type] = rs.reduce((a, r) => a + r.w * r.nm, 0) / w;
      }
      const present = (["P", "H"] as const).filter((t) => typeMeans[t] != null);
      const coverage = present.reduce((a, t) => a + G.RACE_TYPE_WEIGHTS[t], 0);
      const wrs = present.reduce((a, t) => a + (G.RACE_TYPE_WEIGHTS[t] / coverage) * typeMeans[t]!, 0);
      const yw = THETA.lambda ** (Y - year) * coverage;
      num += yw * wrs; den += yw;
    }
    return num / den;
  };
  const lean0 = aggregate();
  for (const r of rows) { const res = Math.abs(r.nm - lean0); r.w = res <= THETA.huberC ? 1 : THETA.huberC / res; }
  return aggregate();
}

// Candidate effects as of Y from races through Y−1 only, anchored on the window fit
// (state lean / β / E / incumbency as of Y−1; House anchored on the district lean as
// of Y−1) with the FULL money gap in the expected margin — the forward model's
// quality term, rebuilt without any information from year Y.
const effectsCache = new Map<number, Map<string, number>>();
const priorCoefByYear = new Map<number, { priorWin: number; priorLoss: number; n: number }>();
function candidateEffectsAsOf(Y: number): Map<string, number> {
  if (effectsCache.has(Y)) return effectsCache.get(Y)!;
  const fit = fitUpTo(Y - 1);
  const races: EffectRace[] = [];
  for (const r of panel) {
    if (r.year > Y - 1 || r.imputed || r.value == null || r.eligibility !== "eligible") continue;
    if (r.type !== "S" && r.type !== "G" && r.type !== "P") continue;
    const lean = fit.lean[r.abbr]; if (lean == null) continue;
    const expected = lean + (fit.beta[r.abbr] ?? 1) * (fit.E[r.year] ?? 0) + forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed) + forwardFf(r.ffGapPct);
    const race: EffectRace = { r: r.value - expected, year: r.year, actual: r.value, inc: r.incumbent === "R" ? "R" : r.incumbent === "D" ? "D" : null };
    if (r.demCandidate) race.D = warCandidateKey(r.abbr, r.demParty ?? "D", r.demCandidate);
    if (r.repCandidate) race.R = warCandidateKey(r.abbr, r.repParty ?? "R", r.repCandidate);
    if (race.D || race.R) races.push(race);
  }
  for (const race of houseData) {
    const dp = districtPresidentialData[String(parseInt(race.id, 10))]; if (!dp) continue;
    const lean = districtLeanAsOf(race, Y, fit); if (lean == null) continue;
    const beta = fit.beta[dp.state] ?? 1;
    for (const pr of race.pastResults ?? []) {
      if (pr.year > Y - 1 || pr.year < 2016 || classifyEligibility(pr, dp.state) !== "eligible") continue;
      const x = pr as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
      const incumbent = pr.demIncumbent ? "D" : pr.repIncumbent ? "R" : "Open";
      const expected = lean + beta * (fit.E[pr.year] ?? 0) - incPts({ H: H_INC }, "H", incumbent) + forwardFf(gapOf(fundraisingData[`H:${race.name}:${pr.year}`]));
      const er: EffectRace = { r: pr.repPct - pr.demPct - expected, year: pr.year, actual: pr.repPct - pr.demPct, inc: incumbent === "R" ? "R" : incumbent === "D" ? "D" : null };
      if (x.demCandidate) er.D = warCandidateKey(dp.state, x.demParty ?? "D", x.demCandidate);
      if (x.repCandidate) er.R = warCandidateKey(dp.state, x.repParty ?? "R", x.repCandidate);
      if (er.D || er.R) races.push(er);
    }
  }
  const ob = buildObservablePrior(races, Y);
  priorCoefByYear.set(Y, { ...ob.coef, n: ob.n });
  const { a } = solveCandidateEffects(races, Y, undefined, NO_PRIOR ? undefined : ob.prior);
  effectsCache.set(Y, a);
  return a;
}
function qualityOf(effects: Map<string, number>, abbr: string, dem?: { name?: string; party?: string }, rep?: { name?: string; party?: string }): number {
  const eD = dem?.name ? effects.get(warCandidateKey(abbr, dem.party ?? "D", dem.name)) ?? 0 : 0;
  const eR = rep?.name ? effects.get(warCandidateKey(abbr, rep.party ?? "R", rep.name)) ?? 0 : 0;
  return eR - eD;
}

function buildPreds(Y: number): Pred[] {
  const fit = fitUpTo(Y - 1);
  const effects = candidateEffectsAsOf(Y);
  const out: Pred[] = [];
  for (const r of panel) {
    if (r.year !== Y || r.imputed || r.value == null || r.eligibility !== "eligible") continue;
    if (r.type !== "S" && r.type !== "G") continue;
    const lean = stateTpl(THETA, fit, r.abbr, Y - 1);
    if (lean == null) continue;
    out.push({
      office: r.type, year: Y, key: `${r.abbr} ${r.race}`, actual: r.value,
      lean, beta: fit.beta[r.abbr] ?? 1, inc: forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed), ff: forwardFf(r.ffGapPct),
      quality: qualityOf(effects, r.abbr, { name: r.demCandidate, party: r.demParty }, { name: r.repCandidate, party: r.repParty }),
    });
  }
  for (const race of houseData) {
    const pr = (race.pastResults ?? []).find((x) => x.year === Y) as PastResult | undefined;
    if (!pr) continue;
    const dp = districtPresidentialData[String(parseInt(race.id, 10))];
    if (!dp || classifyEligibility(pr, dp.state) !== "eligible") continue;
    const lean = districtLeanAsOf(race, Y, fit);
    if (lean == null) continue;
    const incumbent = pr.demIncumbent ? "D" : pr.repIncumbent ? "R" : "Open";
    const x = pr as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
    out.push({
      office: "H", year: Y, key: race.name, actual: pr.repPct - pr.demPct,
      lean, beta: fit.beta[dp.state] ?? 1, inc: -incPts({ H: H_INC }, "H", incumbent), ff: forwardFf(gapOf(fundraisingData[`H:${race.name}:${Y}`])),
      quality: qualityOf(effects, dp.state, { name: x.demCandidate, party: x.demParty }, { name: x.repCandidate, party: x.repParty }),
    });
  }
  return out;
}

// ── environment estimates ────────────────────────────────────────────────────
type EnvMode = "fitted" | "pv" | "gb" | "mapped" | "final" | "struct";
const EVEN_YEARS = [2016, 2018, 2020, 2022, 2024];
function envMapping(exclude: number, field: "gbSept" | "gbFinal") {
  const ys = EVEN_YEARS.filter((y) => y !== exclude && envHistory[y]);
  return ols(ys.map((y) => envHistory[y][field]), ys.map((y) => fitFull.E[y]));
}
// The Phase 2 decomposition, fitted without year `exclude`: E = c + s × PV (structural
// conversion), plus the generic-ballot miss and September→November drift statistics
// that become the national error. Mirrors getEnvironmentModel() in lib/tplCompute.ts.
interface StructModel { c: number; s: number; meanMiss: number; sdMiss: number; sdDrift: number; }
function structModel(exclude: number): StructModel {
  const ys = EVEN_YEARS.filter((y) => y !== exclude && envHistory[y]);
  const { a: c, b: s } = ols(ys.map((y) => envHistory[y].housePv), ys.map((y) => fitFull.E[y]));
  const miss = ys.map((y) => envHistory[y].housePv - envHistory[y].gbFinal);
  const drift = ys.map((y) => envHistory[y].gbFinal - envHistory[y].gbSept);
  const meanMiss = mean(miss);
  const sdMiss = Math.sqrt(miss.reduce((t, x) => t + (x - meanMiss) ** 2, 0) / Math.max(1, miss.length - 1));
  return { c, s, meanMiss, sdMiss, sdDrift: Math.sqrt(mean(drift.map((d) => d * d))) };
}
// National error on the E scale at the mid-September horizon, without year `exclude`.
function sigmaE(exclude: number): number {
  const m = structModel(exclude);
  return Math.abs(m.s) * Math.sqrt(m.sdMiss ** 2 + m.sdDrift ** 2);
}
function envEstimate(mode: EnvMode, Y: number): number | null {
  const h = envHistory[Y];
  if (mode === "fitted") return fitUpTo(Y).E[Y] ?? null;
  if (!h) return null;
  if (mode === "gb") return h.gbSept;
  if (mode === "mapped") { const m = envMapping(Y, "gbSept"); return m.a + m.b * h.gbSept; }
  if (mode === "final") { const m = envMapping(Y, "gbFinal"); return m.a + m.b * h.gbFinal; }
  const m = structModel(Y);
  if (mode === "pv") return m.c + m.s * h.housePv;
  return m.c + m.s * (h.gbSept + F.ENV_MISS_SHRINK * m.meanMiss);
}

// ── scoring ──────────────────────────────────────────────────────────────────
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Robust spread: 1.4826 × median absolute deviation (a Phil Scott does not set the Governor σ).
const rsd = (xs: number[]) => { const m = median(xs); return 1.4826 * median(xs.map((x) => Math.abs(x - m))); };
interface Score { n: number; mae: number; bias: number; r: number; sd: number; rsd: number; }
// Live per-office quality weights; the sweep below multiplies a uniform weight instead.
const qwOf = (office: Pred["office"]) => (NO_QUALITY ? 0 : F.QUALITY_WEIGHT[office]);
const predOf = (x: Pred, E: number, drop: { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean } = {}, qw: number | null = null) =>
  x.lean + (drop.env ? 0 : x.beta * E) + (drop.inc ? 0 : x.inc) + (drop.ff ? 0 : x.ff) + (drop.quality ? 0 : (qw ?? qwOf(x.office)) * x.quality);
function score(preds: Pred[], E: number, drop: { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean } = {}): Score | null {
  if (preds.length < 3) return null;
  const p = preds.map((x) => predOf(x, E, drop));
  const a = preds.map((x) => x.actual);
  const res = a.map((v, i) => v - p[i]);
  return { n: preds.length, mae: mean(res.map(Math.abs)), bias: mean(res), r: pearson(p, a), sd: sd(res), rsd: rsd(res) };
}

const OFFICES: ("S" | "G" | "H")[] = ["S", "G", "H"];
const LABEL = { S: "Senate", G: "Governor", H: "House" };
const predsByYear = new Map<number, Pred[]>();
for (const Y of YEARS) predsByYear.set(Y, buildPreds(Y));

console.log(`Forward backtest — model as of Y−1, no shift removal (R-positive; bias = actual − predicted); quality weight H ${qwOf("H")} · S ${qwOf("S")} · G ${qwOf("G")}\n`);
console.log("Fitted national environment E(y) (full panel) vs the generic ballot:");
console.log("  year   E(fit)   GB Sept   GB final   House PV");
for (const y of EVEN_YEARS) {
  const h = envHistory[y];
  console.log(`  ${y}   ${fmt(fitFull.E[y] ?? 0, 1).padStart(6)}   ${h ? fmt(h.gbSept, 1).padStart(7) : "     —"}   ${h ? fmt(h.gbFinal, 1).padStart(8) : "      —"}   ${h ? fmt(h.housePv, 1).padStart(8) : "      —"}`);
}
{
  const ms = envMapping(0, "gbSept"), mf = envMapping(0, "gbFinal"), st = structModel(0);
  console.log(`  poll mappings (all years):  E = ${fmt(ms.a, 2)} + ${ms.b.toFixed(2)} × GB_sept (R² ${ms.r2.toFixed(2)})   |   E = ${fmt(mf.a, 2)} + ${mf.b.toFixed(2)} × GB_final (R² ${mf.r2.toFixed(2)})`);
  console.log(`  structural (all years):     E = ${fmt(st.c, 2)} + ${st.s.toFixed(2)} × House PV   ·  poll miss (PV − GB_final) mean ${fmt(st.meanMiss, 1)} sd ${st.sdMiss.toFixed(1)}  ·  Sept→Nov drift rms ${st.sdDrift.toFixed(1)}  ·  σ_E(mid-Sept) ${sigmaE(0).toFixed(2)}`);
}

const modes: EnvMode[] = ENV === "all" ? ["fitted", "pv", "gb", "mapped", "struct"] : [ENV as EnvMode];
for (const Y of YEARS) {
  const preds = predsByYear.get(Y)!;
  const fitY1 = fitUpTo(Y - 1);
  const pc = priorCoefByYear.get(Y);
  console.log(`\n=== ${Y}  (fit ≤ ${Y - 1}; incumbency S ${fitY1.inc.S?.toFixed(1)} G ${fitY1.inc.G?.toFixed(1)} H ${H_INC}; observable prior: prior-win ${pc ? fmt(pc.priorWin, 2) : "—"} prior-loss ${pc ? fmt(pc.priorLoss, 2) : "—"} n=${pc?.n ?? 0}) ===`);
  const header = "  office    n  " + modes.map((m) => `| ${m.padEnd(6)} E=${"".padStart(5)} MAE   bias    r    sd   rsd `).join("");
  console.log(header);
  for (const office of OFFICES) {
    const ps = preds.filter((p) => p.office === office);
    if (ps.length < 3) continue;
    let line = `  ${LABEL[office].padEnd(8)} ${String(ps.length).padStart(3)}  `;
    for (const m of modes) {
      const E = envEstimate(m, Y);
      const s = E == null ? null : score(ps, E);
      line += s && E != null ? `| ${m.padEnd(6)} ${fmt(E, 1).padStart(6)}  ${s.mae.toFixed(2)}  ${fmt(s.bias, 2).padStart(6)}  ${s.r.toFixed(2)}  ${s.sd.toFixed(2)}  ${s.rsd.toFixed(2)} ` : `| ${m.padEnd(6)}      —                                 `;
    }
    console.log(line);
  }
}

// ── pooled summary (env=struct), probability calibration, recommended constants ──
// Phase 3 structure: σ_race² = (β × σ_E)² + RACE_SIGMA[office]², with σ_E and the
// office spread both estimated WITHOUT the scored year (leave-one-year-out).
interface Row { res: number; pred: number; actual: number; beta: number; year: number; }
const rowsByOffice: Record<string, Row[]> = { S: [], G: [], H: [] };
for (const Y of YEARS) {
  const E = envEstimate("struct", Y); if (E == null) continue;
  for (const x of predsByYear.get(Y)!) {
    const pred = predOf(x, E);
    rowsByOffice[x.office].push({ res: x.actual - pred, pred, actual: x.actual, beta: x.beta, year: Y });
  }
}
// Robust within-year spread pooled over the given years (residuals centered per year).
function withinRsd(rows: Row[], years: number[]): number {
  const centered: number[] = [];
  for (const y of years) { const rs = rows.filter((r) => r.year === y); if (rs.length < 3) continue; const b = mean(rs.map((r) => r.res)); centered.push(...rs.map((r) => r.res - b)); }
  return centered.length >= 3 ? rsd(centered) : NaN;
}
console.log("\nPooled across years (env=struct — the Phase 2 rule): error decomposition and probability calibration");
console.log("  office    n   MAE   |bias|/yr   within-sd  within-rsd  national-sd   Brier logit(.13)   Brier normal(sd)   Brier Phase-3 LOO   80% cover P3");
const recommended: Record<string, number> = {};
for (const office of OFFICES) {
  const rows = rowsByOffice[office];
  const years = YEARS.filter((y) => rows.filter((r) => r.year === y).length >= 3);
  if (rows.length < 3 || years.length === 0) continue;
  const yearBias = years.map((y) => mean(rows.filter((r) => r.year === y).map((r) => r.res)));
  const yearVar = years.map((y) => sd(rows.filter((r) => r.year === y).map((r) => r.res)) ** 2);
  const within = Math.sqrt(mean(yearVar)); const wr = withinRsd(rows, years); const national = years.length > 1 ? sd(yearBias) : 0;
  const total = Math.sqrt(within ** 2 + national ** 2);
  recommended[office] = wr;
  const brier = (pOf: (r: Row) => number) => mean(rows.map((r) => (pOf(r) - (r.actual <= 0 ? 1 : 0)) ** 2));
  const bLogit = brier((r) => marginToProbability(r.pred));
  const bNorm = brier((r) => Phi(-r.pred / total));
  const sigmaP3 = (r: Row) => Math.sqrt((r.beta * sigmaE(r.year)) ** 2 + withinRsd(rows, years.filter((y) => y !== r.year)) ** 2);
  const bP3 = brier((r) => Phi(-r.pred / sigmaP3(r)));
  const coverP3 = mean(rows.map((r) => (Math.abs(r.res) <= 1.2816 * sigmaP3(r) ? 1 : 0)));
  console.log(`  ${LABEL[office].padEnd(8)} ${String(rows.length).padStart(3)}  ${mean(rows.map((r) => Math.abs(r.res))).toFixed(2)}   ${mean(yearBias.map(Math.abs)).toFixed(2).padStart(8)}   ${within.toFixed(2).padStart(8)}   ${wr.toFixed(2).padStart(8)}   ${national.toFixed(2).padStart(10)}   ${bLogit.toFixed(3).padStart(14)}   ${bNorm.toFixed(3).padStart(15)}   ${bP3.toFixed(3).padStart(16)}   ${(coverP3 * 100).toFixed(0).padStart(9)}%`);
}
console.log("  (within-rsd = 1.4826 × MAD of per-year-centered residuals; national-sd = sd of the yearly biases; Phase-3 LOO uses σ_E and the office spread estimated without the scored year.)");
console.log(`\nRecommended FORECAST_CONSTANTS.RACE_SIGMA (robust within-year spread, env=struct): ${OFFICES.map((o) => `${o} ${(recommended[o] ?? NaN).toFixed(1)}`).join(" · ")}   — live: ${OFFICES.map((o) => `${o} ${F.RACE_SIGMA[o]}`).join(" · ")}`);
console.log(`Mid-September σ_E from the full history: ${sigmaE(0).toFixed(2)} (E scale)`);

if (ABLATE) {
  console.log("\nAblation (env=struct): pooled MAE by office when a term is dropped");
  console.log("  variant       " + OFFICES.map((o) => LABEL[o].padStart(9)).join(""));
  const variants: [string, { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean }][] = [
    ["full", {}], ["no quality", { quality: true }], ["no incumbency", { inc: true }], ["no fundraising", { ff: true }], ["no environment", { env: true }], ["lean only", { inc: true, ff: true, env: true, quality: true }],
  ];
  for (const [name, drop] of variants) {
    let line = `  ${name.padEnd(14)}`;
    for (const office of OFFICES) {
      const errs: number[] = [];
      for (const Y of YEARS) {
        const E = envEstimate("struct", Y); if (E == null) continue;
        const ps = predsByYear.get(Y)!.filter((p) => p.office === office); if (ps.length < 3) continue;
        for (const x of ps) errs.push(Math.abs(x.actual - predOf(x, E, drop)));
      }
      line += errs.length ? mean(errs).toFixed(2).padStart(9) : "        —";
    }
    console.log(line);
  }
}

if (APPOINTED) {
  console.log("\nAppointed / successor incumbents (residual = actual − predicted, env=struct) under incumbency shares 0 · 0.5 · 1");
  for (const Y of YEARS) {
    const E = envEstimate("struct", Y); if (E == null) continue;
    const fit = fitUpTo(Y - 1);
    for (const r of panel) {
      if (r.year !== Y || !r.incumbentAppointed || r.imputed || r.value == null || (r.type !== "S" && r.type !== "G")) continue;
      const x = predsByYear.get(Y)!.find((p) => p.office === r.type && p.key === `${r.abbr} ${r.race}`); if (!x) continue;
      const full = -incPts(fit.inc, r.type, r.incumbent);
      const base = predOf(x, E) - x.inc;
      console.log(`  ${Y} ${r.abbr} ${r.race.padEnd(14)} ${(r.incumbent === "R" ? r.repCandidate : r.demCandidate) ?? ""}`.padEnd(48) + ` actual ${fmt(r.value, 1).padStart(6)}  resid@0 ${fmt(r.value - base, 1).padStart(6)}  @0.5 ${fmt(r.value - base - 0.5 * full, 1).padStart(6)}  @1 ${fmt(r.value - base - full, 1).padStart(6)}`);
    }
  }
}

if (QUALITY_SWEEP) {
  console.log("\nQuality weight sweep (env=struct): pooled MAE by office, and share of rows with a non-zero quality term");
  console.log("  weight   " + OFFICES.map((o) => LABEL[o].padStart(9)).join("") + "   covered");
  for (const qw of [0, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
    let line = `  ${String(qw).padEnd(8)}`; let covered = 0, total = 0;
    for (const office of OFFICES) {
      const errs: number[] = [];
      for (const Y of YEARS) {
        const E = envEstimate("struct", Y); if (E == null) continue;
        const ps = predsByYear.get(Y)!.filter((p) => p.office === office); if (ps.length < 3) continue;
        for (const x of ps) { errs.push(Math.abs(x.actual - predOf(x, E, {}, qw))); total += 1; if (x.quality !== 0) covered += 1; }
      }
      line += errs.length ? mean(errs).toFixed(2).padStart(9) : "        —";
    }
    console.log(line + `   ${(100 * covered / Math.max(1, total) / OFFICES.length * OFFICES.length / OFFICES.length).toFixed(0)}%`);
  }
}

if (DUMP) {
  const file = path.join(os.tmpdir(), "forwardBacktest_predictions.csv");
  const lines = ["year,office,race,actual,lean,beta,E_struct,inc,ff,quality,pred,resid"];
  for (const Y of YEARS) {
    const E = envEstimate("struct", Y) ?? 0;
    for (const x of predsByYear.get(Y)!) {
      const pred = predOf(x, E);
      lines.push([Y, x.office, x.key, x.actual.toFixed(2), x.lean.toFixed(2), x.beta.toFixed(3), E.toFixed(2), x.inc.toFixed(2), x.ff.toFixed(2), x.quality.toFixed(2), pred.toFixed(2), (x.actual - pred).toFixed(2)].join(","));
    }
  }
  fs.writeFileSync(file, lines.join("\n"));
  console.log(`\nwrote ${lines.length - 1} predictions to ${file}`);
}
