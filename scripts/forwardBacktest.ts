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
import { computeRacePollAverage } from "@/lib/racePollAverage";
import type { RacePoll } from "@/data/racePolls";
import { marginToProbability, solveCandidateEffects, buildObservablePrior, warCandidateKey, recencyDecayFor, WAR_RECENCY_DECAY, priorOfficeTier, type EffectRace, type ObservableFeature, type ObservablePrior } from "@/lib/tplCompute";

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const YEARS = (argOf("--years") ?? "2018,2020,2022,2024").split(",").map(Number);
const ENV = argOf("--env") ?? "all";
const ABLATE = argv.includes("--ablate");
const QUALITY_SWEEP = argv.includes("--quality");
const NO_QUALITY = argv.includes("--no-quality");
const NO_PRIOR = argv.includes("--no-prior");
// Observable-prior feature set under test (default: the live FORECAST_CONSTANTS list; "none" = off).
const PRIOR_FEATURES: ObservableFeature[] = argOf("--prior-features") === "none" ? [] : ((argOf("--prior-features")?.split(",") as ObservableFeature[] | undefined) ?? (F.OBSERVABLE_PRIOR_FEATURES as ObservableFeature[]));
const PRIOR_SWEEP = argv.includes("--prior-sweep");
const APPOINTED = argv.includes("--appointed");
const DECAY_SWEEP = argv.includes("--decay-sweep");
const DUMP = argv.includes("--dump");
const POLLS = argv.includes("--polls");
const NO_PARTISAN = argv.includes("--no-partisan");
// Shift applied to party/campaign-sponsored polls toward the sponsor's opponent (pts of margin).
const PARTISAN_SHIFT = Number(argOf("--partisan-shift") ?? 0);
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
const effectsCache = new Map<string, Map<string, number>>();
let statewideDecayOverride: number | null = null;
const decayFn = (office?: string) => (statewideDecayOverride != null && (office === "S" || office === "G" || office === "P") ? statewideDecayOverride : recencyDecayFor(office));
const priorByYear = new Map<number, ObservablePrior>();
let priorFeaturesOverride: ObservableFeature[] | null = null;
const priorFeatures = () => priorFeaturesOverride ?? PRIOR_FEATURES;
// Incumbents in the year-Y races: their observable features are zero (incumbency is its own term).
function incumbentsIn(Y: number): Set<string> {
  const out = new Set<string>();
  for (const r of panel) {
    if (r.year !== Y || (r.type !== "S" && r.type !== "G")) continue;
    if (r.incumbent === "R" && r.repCandidate) out.add(warCandidateKey(r.abbr, r.repParty ?? "R", r.repCandidate));
    if (r.incumbent === "D" && r.demCandidate) out.add(warCandidateKey(r.abbr, r.demParty ?? "D", r.demCandidate));
  }
  for (const race of houseData) {
    const dp = districtPresidentialData[String(parseInt(race.id, 10))]; if (!dp) continue;
    const pr = (race.pastResults ?? []).find((x) => x.year === Y) as (PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string }) | undefined;
    if (!pr) continue;
    if (pr.repIncumbent && pr.repCandidate) out.add(warCandidateKey(dp.state, pr.repParty ?? "R", pr.repCandidate));
    if (pr.demIncumbent && pr.demCandidate) out.add(warCandidateKey(dp.state, pr.demParty ?? "D", pr.demCandidate));
  }
  return out;
}
function candidateEffectsAsOf(Y: number): Map<string, number> {
  const ck = `${Y}:${statewideDecayOverride ?? "live"}:${priorFeatures().join(",")}`;
  if (effectsCache.has(ck)) return effectsCache.get(ck)!;
  const fit = fitUpTo(Y - 1);
  const races: EffectRace[] = [];
  for (const r of panel) {
    if (r.year > Y - 1 || r.imputed || r.value == null || r.eligibility !== "eligible") continue;
    if (r.type !== "S" && r.type !== "G" && r.type !== "P") continue;
    const lean = fit.lean[r.abbr]; if (lean == null) continue;
    const expected = lean + (fit.beta[r.abbr] ?? 1) * (fit.E[r.year] ?? 0) + forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed) + forwardFf(r.ffGapPct);
    const race: EffectRace = { r: r.value - expected, year: r.year, actual: r.value, inc: r.incumbent === "R" ? "R" : r.incumbent === "D" ? "D" : null, office: r.type };
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
      const er: EffectRace = { r: pr.repPct - pr.demPct - expected, year: pr.year, actual: pr.repPct - pr.demPct, inc: incumbent === "R" ? "R" : incumbent === "D" ? "D" : null, office: "H" };
      if (x.demCandidate) er.D = warCandidateKey(dp.state, x.demParty ?? "D", x.demCandidate);
      if (x.repCandidate) er.R = warCandidateKey(dp.state, x.repParty ?? "R", x.repCandidate);
      if (er.D || er.R) races.push(er);
    }
  }
  const ob = buildObservablePrior(races, Y, incumbentsIn(Y), priorFeatures());
  priorByYear.set(Y, ob);
  const { a } = solveCandidateEffects(races, Y, undefined, NO_PRIOR ? undefined : ob.prior, decayFn);
  effectsCache.set(ck, a);
  return a;
}
// R-positive quality: a nominee with a record carries their ridge effect; one without
// any record is worth their observable prior (0 with the prior off or for an incumbent).
function qualityOf(Y: number, effects: Map<string, number>, abbr: string, incumbent: string, dem?: { name?: string; party?: string }, rep?: { name?: string; party?: string }): number {
  const ob = priorByYear.get(Y)!;
  const of = (c: { name?: string; party?: string } | undefined, party: "D" | "R") => {
    if (!c?.name) return 0;
    const key = warCandidateKey(abbr, c.party ?? party, c.name);
    return effects.get(key) ?? (NO_PRIOR ? 0 : ob.valueFor(key, Y, incumbent === party, incumbent === "Open"));
  };
  return of(rep, "R") - of(dem, "D");
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
      quality: qualityOf(Y, effects, r.abbr, r.incumbent, { name: r.demCandidate, party: r.demParty }, { name: r.repCandidate, party: r.repParty }),
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
      quality: qualityOf(Y, effects, dp.state, incumbent, { name: x.demCandidate, party: x.demParty }, { name: x.repCandidate, party: x.repParty }),
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
  const pc = priorByYear.get(Y);
  const priorTxt = pc && pc.features.length ? pc.features.map((f) => `${f} ${fmt(pc.coef[f], 2)}`).join(" · ") + ` (n=${pc.n})` : "off";
  console.log(`\n=== ${Y}  (fit ≤ ${Y - 1}; incumbency S ${fitY1.inc.S?.toFixed(1)} G ${fitY1.inc.G?.toFixed(1)} H ${H_INC}; observable prior: ${priorTxt}) ===`);
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

if (DECAY_SWEEP) {
  console.log(`\nStatewide recency-decay sweep (House fixed at ${WAR_RECENCY_DECAY}; env=struct): pooled MAE by office`);
  console.log("  decay    " + OFFICES.map((o) => LABEL[o].padStart(9)).join(""));
  for (const d of [0.8, 0.85, 0.9, 0.95, 1.0]) {
    statewideDecayOverride = d;
    let line = `  ${String(d).padEnd(8)}`;
    for (const office of OFFICES) {
      const errs: number[] = [];
      for (const Y of YEARS) {
        const E = envEstimate("struct", Y); if (E == null) continue;
        const ps = buildPreds(Y).filter((p) => p.office === office); if (ps.length < 3) continue;
        for (const x of ps) errs.push(Math.abs(x.actual - predOf(x, E)));
      }
      line += errs.length ? mean(errs).toFixed(2).padStart(9) : "        —";
    }
    console.log(line);
  }
  statewideDecayOverride = null;
}

if (argv.includes("--tier-diag")) {
  // Raw check: mean race residual (signed toward the NON-incumbent side, or toward R in open
  // seats) by that candidate's prior-office tier, from the 2024 solve's races (≤ 2023).
  candidateEffectsAsOf(2024);
  const fit = fitUpTo(2023);
  const races: EffectRace[] = [];
  for (const r of panel) {
    if (r.year > 2023 || r.imputed || r.value == null || r.eligibility !== "eligible" || (r.type !== "S" && r.type !== "G")) continue;
    const lean = fit.lean[r.abbr]; if (lean == null) continue;
    const expected = lean + (fit.beta[r.abbr] ?? 1) * (fit.E[r.year] ?? 0) + forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed) + forwardFf(r.ffGapPct);
    const race: EffectRace = { r: r.value - expected, year: r.year, actual: r.value, inc: r.incumbent === "R" ? "R" : r.incumbent === "D" ? "D" : null, office: r.type };
    if (r.demCandidate) race.D = warCandidateKey(r.abbr, r.demParty ?? "D", r.demCandidate);
    if (r.repCandidate) race.R = warCandidateKey(r.abbr, r.repParty ?? "R", r.repCandidate);
    races.push(race);
  }
  for (const race of houseData) {
    const dp = districtPresidentialData[String(parseInt(race.id, 10))]; if (!dp) continue;
    const lean = districtLeanAsOf(race, 2024, fit); if (lean == null) continue;
    for (const pr of race.pastResults ?? []) {
      if (pr.year > 2023 || pr.year < 2016 || classifyEligibility(pr, dp.state) !== "eligible") continue;
      const x = pr as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
      const incumbent = pr.demIncumbent ? "D" : pr.repIncumbent ? "R" : "Open";
      const expected = lean + (fit.beta[dp.state] ?? 1) * (fit.E[pr.year] ?? 0) - incPts({ H: H_INC }, "H", incumbent) + forwardFf(gapOf(fundraisingData[`H:${race.name}:${pr.year}`]));
      const er: EffectRace = { r: pr.repPct - pr.demPct - expected, year: pr.year, actual: pr.repPct - pr.demPct, inc: incumbent === "R" ? "R" : incumbent === "D" ? "D" : null, office: "H" };
      if (x.demCandidate) er.D = warCandidateKey(dp.state, x.demParty ?? "D", x.demCandidate);
      if (x.repCandidate) er.R = warCandidateKey(dp.state, x.repParty ?? "R", x.repCandidate);
      races.push(er);
    }
  }
  for (const office of ["H", "S", "G"]) {
    console.log(`\n${LABEL[office as "H"]}: challenger (vs incumbent) residual by challenger's prior-office tier, and open-seat R−D residual by tier difference`);
    const byTier: Record<number, number[]> = {}; const openByDiff: Record<string, number[]> = {};
    for (const rc of races) {
      if (rc.office !== office) continue;
      if (rc.inc === "R" && rc.D) { const t = priorOfficeTier(rc.D, rc.year); (byTier[t] ??= []).push(-rc.r); }
      else if (rc.inc === "D" && rc.R) { const t = priorOfficeTier(rc.R, rc.year); (byTier[t] ??= []).push(rc.r); }
      else if (!rc.inc && rc.R && rc.D) { const d = Math.sign(priorOfficeTier(rc.R, rc.year) - priorOfficeTier(rc.D, rc.year)); (openByDiff[d > 0 ? "R higher" : d < 0 ? "D higher" : "same"] ??= []).push(rc.r); }
    }
    for (const t of Object.keys(byTier).map(Number).sort()) console.log(`  challenger tier ${t}: n ${String(byTier[t].length).padStart(4)}  mean resid toward challenger ${fmt(mean(byTier[t]), 2)}  median ${fmt(median(byTier[t]), 2)}`);
    for (const k of ["R higher", "same", "D higher"]) if (openByDiff[k]) console.log(`  open seat, ${k.padEnd(9)}: n ${String(openByDiff[k].length).padStart(4)}  mean R−D resid ${fmt(mean(openByDiff[k]), 2)}`);
  }
}

if (PRIOR_SWEEP) {
  console.log("\nObservable-prior feature sweep (env=struct, live quality weights): pooled MAE by office; coefficients from the 2024 solve");
  console.log("  features                                   " + OFFICES.map((o) => LABEL[o].padStart(9)).join("") + "   coef (2024)");
  const sets: ObservableFeature[][] = [[], ["priorWin"], ["legislator"], ["openLegislator"], ["openLegislator", "priorWin"], ["legislator", "federalStatewide"], ["legislator", "federalStatewide", "local"], ["legislator", "federalStatewide", "local", "priorWin"], ["legislator", "federalStatewide", "priorWin"]];
  for (const fs of sets) {
    priorFeaturesOverride = fs;
    let line = `  ${(fs.length ? fs.join(",") : "none").padEnd(42)}`;
    for (const office of OFFICES) {
      const errs: number[] = [];
      for (const Y of YEARS) {
        const E = envEstimate("struct", Y); if (E == null) continue;
        const ps = buildPreds(Y).filter((p) => p.office === office); if (ps.length < 3) continue;
        for (const x of ps) errs.push(Math.abs(x.actual - predOf(x, E)));
      }
      line += errs.length ? mean(errs).toFixed(2).padStart(9) : "        —";
    }
    const pc = priorByYear.get(2024);
    console.log(line + "   " + (pc && fs.length ? fs.map((f) => `${f} ${fmt(pc.coef[f], 2)}`).join(" · ") + ` n=${pc.n}` : ""));
  }
  priorFeaturesOverride = null;
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

if (POLLS) {
  // ── Phase 5: poll weight by horizon ─────────────────────────────────────────
  // Historical race polls (data-entry/race_polls_history.csv, from the 538 archive)
  // averaged as of three dates in year Y with the live recipe; the blend
  //   m(w) = (1 − w) × model + w × pollAvg,   w = nEff / (nEff + k)
  // is scored against the actual margin and k chosen per office and horizon by
  // leave-one-year-out MAE over the polled races. The model side stays the
  // mid-September prediction at every horizon (only the polls get fresher).
  const split = (line: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const lines = fs.readFileSync(path.join(process.cwd(), "data-entry", "race_polls_history.csv"), "utf8").split(/\r?\n/).filter((l) => l.trim());
  const hdr = split(lines[0]);
  const pollsByRace = new Map<string, RacePoll[]>();
  for (const line of lines.slice(1)) {
    const r = split(line); const c = (k: string) => r[hdr.indexOf(k)] ?? "";
    if (NO_PARTISAN && c("partisan")) continue;
    const key = `${c("year")}|${c("office")}|${c("state")}|${c("race")}`;
    // A D-sponsored poll is moved R-ward by PARTISAN_SHIFT (and vice versa), split across the two shares.
    const adj = c("partisan") === "D" ? PARTISAN_SHIFT / 2 : c("partisan") === "R" ? -PARTISAN_SHIFT / 2 : 0;
    const dem = Number(c("dem")) - adj, rep = Number(c("rep")) + adj;
    (pollsByRace.get(key) ?? pollsByRace.set(key, []).get(key)!).push({ pollster: c("pollster"), partisan: (c("partisan") || null) as "D" | "R" | null, startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem });
  }
  const pollKeyOf = (x: Pred) => x.office === "H" ? `${x.year}|H|${x.key.slice(0, 2)}|House ${x.key}` : `${x.year}|${x.office}|${x.key.slice(0, 2)}|${x.key.slice(3)}`;
  const horizons: [string, string][] = [["mid-Sept", "09-15"], ["mid-Oct", "10-15"], ["Nov 1", "11-01"]];
  const ks = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8];
  interface PRow { office: string; year: number; model: number; poll: number; nEff: number; actual: number; }
  console.log(`\nRace polls (env=struct; ${pollsByRace.size} race-years with polls${NO_PARTISAN ? ", partisan polls dropped" : ""}${PARTISAN_SHIFT ? `, partisan polls shifted ${PARTISAN_SHIFT} pts toward the opponent` : ""}): blend m = (1−w)·model + w·poll, w = nEff/(nEff+k), k fitted leave-one-year-out`);
  console.log("  horizon   office    n polled/all   MAE model   MAE poll   k*(LOO)   MAE blend(k*)   MAE blend LOO   σ_poll rsd   σ_blend rsd   mean w");
  const chosen: Record<string, Record<string, number>> = {};
  for (const [hname, mmdd] of horizons) {
    chosen[hname] = {};
    for (const office of OFFICES) {
      const rows: PRow[] = []; let all = 0;
      for (const Y of YEARS) {
        const E = envEstimate("struct", Y); if (E == null) continue;
        const asOf = new Date(`${Y}-${mmdd}T12:00:00Z`);
        for (const x of predsByYear.get(Y)!) {
          if (x.office !== office) continue; all++;
          const avg = computeRacePollAverage(pollsByRace.get(pollKeyOf(x)) ?? [], asOf);
          if (!avg) continue;
          rows.push({ office, year: Y, model: predOf(x, E), poll: avg.diff, nEff: avg.nEff, actual: x.actual });
        }
      }
      if (rows.length < 10) continue;
      const blend = (r: PRow, k: number) => { const w = k === Infinity ? 0 : r.nEff / (r.nEff + k); return (1 - w) * r.model + w * r.poll; };
      const maeAt = (rs: PRow[], k: number) => mean(rs.map((r) => Math.abs(r.actual - blend(r, k))));
      const bestK = (rs: PRow[]) => ks.reduce((b, k) => (maeAt(rs, k) < maeAt(rs, b) ? k : b), ks[0]);
      const kStar = bestK(rows);
      // leave-one-year-out: k chosen on the other years, applied to this one
      const looErr: number[] = [];
      for (const Y of YEARS) { const train = rows.filter((r) => r.year !== Y), test = rows.filter((r) => r.year === Y); if (!train.length || !test.length) continue; const k = bestK(train); looErr.push(...test.map((r) => Math.abs(r.actual - blend(r, k)))); }
      const resPoll = rows.map((r) => r.actual - r.poll), resBlend = rows.map((r) => r.actual - blend(r, kStar));
      const wMean = mean(rows.map((r) => r.nEff / (r.nEff + kStar)));
      chosen[hname][office] = kStar;
      console.log(`  ${hname.padEnd(9)} ${LABEL[office].padEnd(8)} ${String(rows.length).padStart(5)}/${String(all).padEnd(5)}   ${mean(rows.map((r) => Math.abs(r.actual - r.model))).toFixed(2).padStart(9)}   ${mean(resPoll.map(Math.abs)).toFixed(2).padStart(8)}   ${String(kStar).padStart(7)}   ${maeAt(rows, kStar).toFixed(2).padStart(13)}   ${(looErr.length ? mean(looErr) : NaN).toFixed(2).padStart(13)}   ${rsd(resPoll).toFixed(2).padStart(10)}   ${rsd(resBlend).toFixed(2).padStart(11)}   ${wMean.toFixed(2).padStart(6)}`);
      if (hname === "mid-Sept") {
        // evidence check: residual of the blend by nEff bucket, and the k grid
        const buckets: [string, (n: number) => boolean][] = [["nEff < 1", (n) => n < 1], ["1–2", (n) => n >= 1 && n < 2], ["2–4", (n) => n >= 2 && n < 4], ["≥ 4", (n) => n >= 4]];
        console.log("            " + buckets.map(([b, f]) => { const rs = rows.filter((r) => f(r.nEff)); return rs.length ? `${b}: n ${rs.length} model ${mean(rs.map((r) => Math.abs(r.actual - r.model))).toFixed(1)} poll ${mean(rs.map((r) => Math.abs(r.actual - r.poll))).toFixed(1)} blend ${maeAt(rs, kStar).toFixed(1)}` : `${b}: —`; }).join("  ·  "));
        console.log("            k grid MAE: " + ks.map((k) => `${k}→${maeAt(rows, k).toFixed(2)}`).join("  "));
      }
    }
  }
  console.log("  (σ_poll rsd = robust sd of actual − poll average over polled races; σ_blend rsd = the same for the blend at k*.)");
  console.log(`Recommended FORECAST_CONSTANTS.POLL_K by horizon: ${horizons.map(([h]) => `${h}: ${OFFICES.map((o) => `${o} ${chosen[h][o] ?? "—"}`).join(" · ")}`).join("   |   ")}`);
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
