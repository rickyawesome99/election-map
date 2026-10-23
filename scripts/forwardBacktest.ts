// Forward backtest (Phase 1 of the 2026 forecast revamp).
//
// Run:  npx tsx scripts/forwardBacktest.ts
//       npx tsx scripts/forwardBacktest.ts --years 2018,2020,2022,2024 --env all|fitted|gb|mapped|final
//       npx tsx scripts/forwardBacktest.ts --ablate        (drop each forward term under env=mapped)
//       npx tsx scripts/forwardBacktest.ts --money         (Phase 6: structural imputation of missing receipts vs the old zero)
//       npx tsx scripts/forwardBacktest.ts --sept-money    (Phase 6: mid-September receipts vs full-cycle receipts; fits PARTIAL_CYCLE_GAP_SCALE)
//       npx tsx scripts/forwardBacktest.ts --seat-status   (Phase 7: open-seat carryover, freshman effect, House incumbency sweep)
//       npx tsx scripts/forwardBacktest.ts --env struct --polls --half-life 14   (race-poll recency half-life override for every office)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizons   (horizon-matched: every past year replayed N days before ITS election)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizon-ablate     (every factor dropped / varied, horizon-matched, with LOYO)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizon-pollshift  (uniform vs lean-scaled race-poll shifts, all and competitive races)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizon-polldump   (per polled race: model, poll avg, nEff, pollsters, sponsors → CSV)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizon-undecided  (allocate undecided voters in race polls: 0 / half / full)
//       npx tsx scripts/forwardBacktest.ts --env struct --horizon-pollrules  (max poll age, trust in high-undecided polls)
//       npx tsx scripts/forwardBacktest.ts --lambda        (forward environment term × λ per office, fitted / pv / struct environments)
//       npx tsx scripts/forwardBacktest.ts --dump         (per-race predictions CSV in the OS temp dir)
//       npx tsx scripts/forwardBacktest.ts --env struct --emit   (write data/forecastCalibration.ts — the Calibration tables on /methodology)
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
import { computeRacePollAverage, pollAgingShift, pollWeight, allocateUndecided, type RaceAverageRules } from "@/lib/racePollAverage";
import { genericBallotSeries } from "@/lib/genericBallotAverage";
import { computeHouseEffects } from "@/lib/pollsterHouseEffects";
import type { GenericBallotPoll } from "@/data/genericBallotPolls";
import type { RacePoll } from "@/data/racePolls";
import { marginToProbability, fitWarMoneyModel, type WarMoneyModel, solveCandidateEffects, buildObservablePrior, warCandidateKey, recencyDecayFor, WAR_RECENCY_DECAY, priorOfficeTier, type EffectRace, type ObservableFeature, type ObservablePrior } from "@/lib/tplCompute";

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
const EMIT = argv.includes("--emit");
const POLLS = argv.includes("--polls");
const POLLSTERS = argv.includes("--pollsters");
const MONEY = argv.includes("--money");
const SEPT_MONEY = argv.includes("--sept-money");
const SEAT_STATUS = argv.includes("--seat-status");
// --half-life N: score every office's race polls with half-life N instead of the live per-office values.
let halfLifeOverride: number | null = argOf("--half-life") != null ? Number(argOf("--half-life")) : null;
const HORIZONS = argv.includes("--horizons");
const HORIZON_ABLATE = argv.includes("--horizon-ablate");
const HORIZON_POLLSHIFT = argv.includes("--horizon-pollshift");
const HORIZON_POLLDUMP = argv.includes("--horizon-polldump");
const HORIZON_UNDECIDED = argv.includes("--horizon-undecided");
const HORIZON_POLLRULES = argv.includes("--horizon-pollrules");
const halfLifeOf = (office: "H" | "S" | "G") => halfLifeOverride ?? F.POLL_HALF_LIFE_DAYS[office];
const NO_PARTISAN = argv.includes("--no-partisan");
// Shift applied to party/campaign-sponsored polls toward the sponsor's opponent (pts of margin).
const PARTISAN_SHIFT = Number(argOf("--partisan-shift") ?? 0);
const THETA: Theta = LIVE;
let H_INC = 3; // fixed House incumbency prior (INCUMBENT_ADVANTAGE_FIXED); --seat-status sweeps it

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
  // Seat status (Phase 7). sign: +1 R / −1 D — the incumbent's party, or for an open seat the party
  // that held it going in (0 = unknown / independent holder).
  seat: { status: "veteran" | "freshman" | "appointed" | "open"; sign: number };
  gap: number | null; // money gap %, null where a side's receipts are unknown
  incSign: number;    // +1 R incumbent · −1 D incumbent · 0 open (the structural money model's regressor)
}
const fitCache = new Map<number, Fit>();
const fitUpTo = (y: number) => { if (!fitCache.has(y)) fitCache.set(y, fitWindow(THETA, y)); return fitCache.get(y)!; };
const fitFull = fitUpTo(2025);

function forwardIncS(fit: Fit, type: string, incumbent: string, appointed = false): number { return -incPts(fit.inc, type, incumbent, appointed); }
let fwdMoney: { k: number; cap: number } | null = null; // --money sweep override of the forward FF_K / FF_MAX
function forwardFf(gapPct: number | null): number { return fwdMoney ? (gapPct == null ? 0 : Math.max(-fwdMoney.cap, Math.min(fwdMoney.cap, gapPct * fwdMoney.k))) : -ffPts(THETA, gapPct); }
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
// Structural money model as of Y (Phase 6): gap% ~ 1 + incSign + pre-money expected margin,
// fitted per office on races ≤ Y−1 with both receipts known — the same regression as
// getWarMoneyModel() in lib/tplCompute.ts, rebuilt without year Y. It prices the receipts
// gap a generic pair in this situation would have, so a race with unknown receipts can
// carry that instead of a silent 0 (rejected on masked receipts — see --money) and, live, so
// the money term can be paid on the gap BEYOND it (the residual basis).
// Money basis under test (default: the live FORECAST_CONSTANTS rule). "residual" = gap minus the
// structural gap, with the per-office MONEY_K / MONEY_CAP; "raw" = the old rule (backward k / cap).
let moneyBasis: "raw" | "residual" = F.MONEY_BASIS;
const clampPts = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v));
function moneyPts(office: string, gap: number | null, sg: number | null): number {
  if (gap == null) return 0;
  if (moneyBasis === "raw") return forwardFf(gap);
  const o = office as "H" | "S" | "G";
  return clampPts((fwdMoney?.k ?? F.MONEY_K[o] ?? 0) * (gap - (sg ?? 0)), fwdMoney?.cap ?? F.MONEY_CAP[o] ?? 0);
}
const moneyModelCache = new Map<number, Record<string, WarMoneyModel>>();
const structuralGap = (m: WarMoneyModel | undefined, incSign: number, base: number) => (m && m.n >= 5 ? Math.max(-100, Math.min(100, m.intercept + m.incSign * incSign + m.base * base)) : null);
const incSignOf = (incumbent: string) => (incumbent === "R" ? 1 : incumbent === "D" ? -1 : 0);
interface HistRace { er: EffectRace; office: string; base: number; incSign: number; gap: number | null; actual: number; }
function historyBefore(Y: number): HistRace[] {
  const fit = fitUpTo(Y - 1);
  const out: HistRace[] = [];
  for (const r of panel) {
    if (r.year > Y - 1 || r.imputed || r.value == null || r.eligibility !== "eligible") continue;
    if (r.type !== "S" && r.type !== "G" && r.type !== "P") continue;
    const lean = fit.lean[r.abbr]; if (lean == null) continue;
    const base = lean + (fit.beta[r.abbr] ?? 1) * (fit.E[r.year] ?? 0) + forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed);
    const er: EffectRace = { r: 0, year: r.year, actual: r.value, inc: r.incumbent === "R" ? "R" : r.incumbent === "D" ? "D" : null, office: r.type };
    if (r.demCandidate) er.D = warCandidateKey(r.abbr, r.demParty ?? "D", r.demCandidate);
    if (r.repCandidate) er.R = warCandidateKey(r.abbr, r.repParty ?? "R", r.repCandidate);
    out.push({ er, office: r.type, base, incSign: incSignOf(r.incumbent), gap: r.type === "P" ? null : r.ffGapPct, actual: r.value });
  }
  for (const race of houseData) {
    const dp = districtPresidentialData[String(parseInt(race.id, 10))]; if (!dp) continue;
    const lean = districtLeanAsOf(race, Y, fit); if (lean == null) continue;
    const beta = fit.beta[dp.state] ?? 1;
    for (const pr of race.pastResults ?? []) {
      if (pr.year > Y - 1 || pr.year < 2016 || classifyEligibility(pr, dp.state) !== "eligible") continue;
      const x = pr as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
      const incumbent = pr.demIncumbent ? "D" : pr.repIncumbent ? "R" : "Open";
      const base = lean + beta * (fit.E[pr.year] ?? 0) - incPts({ H: H_INC }, "H", incumbent);
      const er: EffectRace = { r: 0, year: pr.year, actual: pr.repPct - pr.demPct, inc: incumbent === "R" ? "R" : incumbent === "D" ? "D" : null, office: "H" };
      if (x.demCandidate) er.D = warCandidateKey(dp.state, x.demParty ?? "D", x.demCandidate);
      if (x.repCandidate) er.R = warCandidateKey(dp.state, x.repParty ?? "R", x.repCandidate);
      out.push({ er, office: "H", base, incSign: incSignOf(incumbent), gap: gapOf(fundraisingData[`H:${race.name}:${pr.year}`]), actual: pr.repPct - pr.demPct });
    }
  }
  return out;
}
const historyCache = new Map<number, HistRace[]>();
const historyOf = (Y: number) => { if (!historyCache.has(Y)) historyCache.set(Y, historyBefore(Y)); return historyCache.get(Y)!; };
function moneyModelAsOf(Y: number): Record<string, WarMoneyModel> {
  if (!moneyModelCache.has(Y)) {
    const hist = historyOf(Y);
    const m: Record<string, WarMoneyModel> = {};
    for (const office of ["S", "G", "H"]) m[office] = fitWarMoneyModel(hist.filter((h) => h.office === office && h.gap != null).map((h) => ({ gap: h.gap!, incSign: h.incSign, base: h.base })));
    moneyModelCache.set(Y, m);
  }
  return moneyModelCache.get(Y)!;
}
function candidateEffectsAsOf(Y: number): Map<string, number> {
  const ck = `${Y}:${statewideDecayOverride ?? "live"}:${priorFeatures().join(",")}:${moneyBasis}:${fwdMoney ? `${fwdMoney.k}/${fwdMoney.cap}` : ""}`;
  if (effectsCache.has(ck)) return effectsCache.get(ck)!;
  const money = moneyModelAsOf(Y);
  const races: EffectRace[] = [];
  for (const h of historyOf(Y)) {
    if (!h.er.D && !h.er.R) continue;
    const sg = h.office !== "P" ? structuralGap(money[h.office], h.incSign, h.base) : null;
    races.push({ ...h.er, r: h.actual - (h.base + moneyPts(h.office, h.gap, sg)) });
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


// ── seat status (Phase 7: open-seat carryover and freshman effect) ───────────
// Party holding each OPEN Senate / Governor seat going into the election. The results on
// file start in 2016, so the outgoing holder of a 2018–2024 open seat is entered by hand.
const OPEN_SEAT_HOLDER: Record<string, "R" | "D" | "I"> = {
  "2018 AZ Senate": "R", "2018 TN Senate": "R", "2018 UT Senate": "R",
  "2020 KS Senate": "R", "2020 NM Senate": "D", "2020 TN Senate": "R", "2020 WY Senate": "R",
  "2022 AL Senate": "R", "2022 MO Senate": "R", "2022 NC Senate": "R", "2022 OH Senate": "R", "2022 OK Senate Special": "R", "2022 PA Senate": "R", "2022 VT Senate": "D",
  "2024 AZ Senate": "D", "2024 CA Senate": "D", "2024 DE Senate": "D", "2024 IN Senate": "R", "2024 MD Senate": "D", "2024 MI Senate": "D", "2024 NJ Senate": "D", "2024 UT Senate": "R", "2024 WV Senate": "D",
  "2018 AK Governor": "I", "2018 CA Governor": "D", "2018 CO Governor": "D", "2018 CT Governor": "D", "2018 FL Governor": "R", "2018 GA Governor": "R", "2018 ID Governor": "R", "2018 KS Governor": "R",
  "2018 ME Governor": "R", "2018 MI Governor": "R", "2018 MN Governor": "D", "2018 NV Governor": "R", "2018 NM Governor": "R", "2018 OH Governor": "R", "2018 OK Governor": "R", "2018 SD Governor": "R",
  "2018 TN Governor": "R", "2018 WY Governor": "R", "2020 MT Governor": "D", "2020 UT Governor": "R",
  "2022 AZ Governor": "R", "2022 AR Governor": "R", "2022 HI Governor": "D", "2022 MD Governor": "R", "2022 MA Governor": "R", "2022 NE Governor": "R", "2022 OR Governor": "D", "2022 PA Governor": "D",
  "2024 DE Governor": "D", "2024 IN Governor": "R", "2024 MO Governor": "R", "2024 NH Governor": "R", "2024 NC Governor": "D", "2024 ND Governor": "R", "2024 WA Governor": "D", "2024 WV Governor": "R",
};
// First-term Senate / Governor incumbents whose first election predates the results on file
// (first elected 2012/2014, or seated by special election since). Everyone else not derivable
// from the file is a veteran. Appointed incumbents are their own status.
const FRESHMAN_BY_HAND = new Set([
  "2018 AZ Governor", "2018 AR Governor", "2018 HI Governor", "2018 IL Governor", "2018 MD Governor", "2018 MA Governor", "2018 NE Governor", "2018 OR Governor", "2018 PA Governor", "2018 RI Governor", "2018 TX Governor",
  "2018 MA Senate", "2018 TX Senate", "2018 ND Senate", "2018 IN Senate", "2018 WI Senate", "2018 VA Senate", "2018 CT Senate", "2018 HI Senate", "2018 NM Senate", "2018 ME Senate", "2018 NE Senate", "2018 NV Senate",
  "2020 AR Senate", "2020 MT Senate", "2020 IA Senate", "2020 CO Senate", "2020 GA Senate", "2020 MI Senate", "2020 SD Senate", "2020 NE Senate", "2020 AK Senate", "2020 NC Senate", "2020 WV Senate", "2020 LA Senate",
  "2020 MN Senate", "2020 MS Senate", "2020 AL Senate",
]);
const TERM: Record<string, number> = { H: 2, S: 6, G: 4 };
const normName = (x?: string) => (x ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
// Statewide: a first-term incumbent won the seat as a NON-incumbent within one term before Y (on file), or is on the hand list.
function statewideSeat(r: (typeof panel)[number]): Pred["seat"] {
  const key = `${r.year} ${r.abbr} ${r.race}`;
  if (r.incumbent !== "R" && r.incumbent !== "D") { const h = OPEN_SEAT_HOLDER[key]; return { status: "open", sign: h === "R" ? 1 : h === "D" ? -1 : 0 }; }
  const sign = r.incumbent === "R" ? 1 : -1;
  if (r.incumbentAppointed) return { status: "appointed", sign };
  const name = normName(r.incumbent === "R" ? r.repCandidate : r.demCandidate);
  const firstWin = panel.some((q) => q.type === r.type && q.abbr === r.abbr && q.year < r.year && q.year >= r.year - TERM[r.type] && q.value != null && !q.imputed
    && normName(q.value > 0 ? q.repCandidate : q.demCandidate) === name && (q.incumbent !== r.incumbent || q.incumbentAppointed));
  return { status: firstWin || FRESHMAN_BY_HAND.has(key) ? "freshman" : "veteran", sign };
}
// House: winners by state and year. A first-term incumbent won at Y−2 as a non-incumbent, or is not
// among the Y−2 winners at all (seated by a special election since). An open seat's holder is the
// party that won the same-numbered district at Y−2 (approximate across the 2022 renumbering).
const houseWinners = new Map<string, Map<string, boolean>>(); // `${state}:${year}` → name → won as incumbent
for (const race of houseData) {
  const st = districtPresidentialData[String(parseInt(race.id, 10))]?.state; if (!st) continue;
  for (const pr of race.pastResults ?? []) {
    const x = pr as PastResult & { demCandidate?: string; repCandidate?: string };
    const rWon = pr.repPct > pr.demPct; const name = normName(rWon ? x.repCandidate : x.demCandidate); if (!name) continue;
    const m = houseWinners.get(`${st}:${pr.year}`) ?? new Map<string, boolean>(); m.set(name, !!(rWon ? pr.repIncumbent : pr.demIncumbent)); houseWinners.set(`${st}:${pr.year}`, m);
  }
}
function houseSeat(race: typeof houseData[number], state: string, pr: PastResult, Y: number): Pred["seat"] {
  const x = pr as PastResult & { demCandidate?: string; repCandidate?: string };
  if (!pr.demIncumbent && !pr.repIncumbent) { const prev = (race.pastResults ?? []).find((q) => q.year === Y - 2); return { status: "open", sign: prev ? (prev.repPct > prev.demPct ? 1 : -1) : 0 }; }
  const sign = pr.repIncumbent ? 1 : -1;
  const wonAsInc = houseWinners.get(`${state}:${Y - 2}`)?.get(normName(pr.repIncumbent ? x.repCandidate : x.demCandidate));
  return { status: wonAsInc === true ? "veteran" : "freshman", sign };
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
      lean, beta: fit.beta[r.abbr] ?? 1, inc: forwardIncS(fit, r.type, r.incumbent, r.incumbentAppointed), ff: forwardFf(r.ffGapPct), gap: r.ffGapPct, incSign: incSignOf(r.incumbent), seat: statewideSeat(r),
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
      lean, beta: fit.beta[dp.state] ?? 1, inc: -incPts({ H: H_INC }, "H", incumbent), ff: forwardFf(gapOf(fundraisingData[`H:${race.name}:${Y}`])), gap: gapOf(fundraisingData[`H:${race.name}:${Y}`]), incSign: incSignOf(incumbent), seat: houseSeat(race, dp.state, pr, Y),
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
// National error on the E scale at the mid-September horizon, without year `exclude`:
// the structural shared error (NATIONAL_SIGMA_STRUCTURAL) ⊕ the generic ballot's own error.
function sigmaE(exclude: number): number {
  const m = structModel(exclude);
  return Math.hypot(F.NATIONAL_SIGMA_STRUCTURAL, Math.abs(m.s) * Math.sqrt(m.sdMiss ** 2 + m.sdDrift ** 2));
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
// Money term of a prediction. "live" = receipts where known, else the structural imputation
// (0 where a side is unknown); "zero"/"structural"/"slope-only" mask the receipts entirely
// (the --money test: how much of the receipts signal the imputation recovers).
let moneyVariant: "live" | "zero" | "structural" | "slope-only" = "live";
const structuralFf = (x: Pred, E: number, noIntercept = false) => { const m = moneyModelAsOf(x.year)[x.office]; return forwardFf(structuralGap(noIntercept ? { ...m, intercept: 0 } : m, x.incSign, x.lean + x.beta * E + x.inc)); };
const sgOf = (x: Pred, E: number) => structuralGap(moneyModelAsOf(x.year)[x.office], x.incSign, x.lean + x.beta * E + x.inc);
const ffOf = (x: Pred, E: number) =>
  moneyVariant === "zero" ? 0 : moneyVariant === "slope-only" ? structuralFf(x, E, true) : moneyVariant === "structural" ? structuralFf(x, E)
  : moneyPts(x.office, x.gap, sgOf(x, E));
const predOf = (x: Pred, E: number, drop: { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean } = {}, qw: number | null = null) =>
  x.lean + (drop.env ? 0 : x.beta * E) + (drop.inc ? 0 : x.inc) + (drop.ff ? 0 : ffOf(x, E)) + (drop.quality ? 0 : (qw ?? qwOf(x.office)) * x.quality);
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
  const coverAt = (sig: number) => mean(rows.map((r) => (Math.abs(r.res) <= 1.2816 * Math.sqrt((r.beta * sigmaE(r.year)) ** 2 + sig ** 2) ? 1 : 0)));
  console.log(`    ${LABEL[office]} 80% coverage by RACE_SIGMA: ` + [wr, F.RACE_SIGMA[office], 5, 5.5, 6, 6.5, 9, 9.5].map((v) => `${v.toFixed(1)}→${(coverAt(v) * 100).toFixed(0)}%`).join("  "));
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

// --lambda: the forward environment term β*·E × λ per office, scored with no shift removed.
// fitted = the oracle E(Y); pv = the actual House vote through the structural line (no polling
// error); struct = the live rule from the mid-September generic ballot. The lean's own strip
// (fitted on years ≤ Y−1) is untouched, so this is the forward response alone.
if (argv.includes("--lambda")) {
  const lambdas = [0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6];
  console.log("\nEnvironment scale λ on the forward term — MAE (bias), no shift removed");
  for (const mode of ["fitted", "pv", "struct"] as EnvMode[]) {
    for (const office of OFFICES) {
      for (const years of [YEARS, ...YEARS.map((y) => [y])]) {
        const cells: string[] = [];
        let n = 0, Es: string[] = [];
        for (const lambda of lambdas) {
          const res: number[] = [];
          Es = [];
          for (const Y of years) {
            const E = envEstimate(mode, Y); if (E == null) continue;
            Es.push(fmt(E, 2));
            for (const x of predsByYear.get(Y)!) if (x.office === office) res.push(x.actual - predOf(x, lambda * E));
          }
          n = res.length;
          cells.push(res.length ? `λ${lambda}: ${mean(res.map(Math.abs)).toFixed(2)} (${fmt(mean(res), 2)})` : `λ${lambda}: —`);
        }
        if (n === 0) continue;
        console.log(`  ${mode.padEnd(6)} ${LABEL[office].padEnd(8)} ${(years.length > 1 ? "pooled" : String(years[0])).padEnd(6)} n ${String(n).padStart(4)}  E ${Es.join("/").padEnd(years.length > 1 ? 24 : 6)}  ${cells.join("  ")}`);
      }
    }
  }
}

if (MONEY) {
  // Phase 6 — what the money term should read (env=struct, pooled over the target years).
  //   raw        the old rule: clamp(FF_K × gap%), 0 where a side's receipts are unknown
  //   structural "impute, never zero": the gap a generic pair in this situation would have
  //              (gap% ~ 1 + incSign + pre-money expected, fitted ≤ Y−1), tested by masking
  //              every race's receipts — does the imputation recover any of the signal?
  //   residual   clamp(k × (gap% − structural gap%)): only the money beyond the situation
  // Candidate effects are re-solved on the same basis as the forward term in every row.
  console.log("\nMoney basis (env=struct). Structural money model as of each target year:");
  for (const Y of YEARS) { const m = moneyModelAsOf(Y); console.log(`  ${Y}  ` + OFFICES.map((o) => `${o}: gap = ${fmt(m[o].intercept, 1)} ${fmt(m[o].incSign, 1)}×inc ${fmt(m[o].base, 2)}×base (n ${m[o].n}, R² ${m[o].r2.toFixed(2)})`).join("   ")); }
  type Cell = { n: number; mae: number; bias: number };
  const pooled = (years: number[] = YEARS): Record<string, Cell> => {
    const out: Record<string, Cell> = {};
    for (const office of OFFICES) {
      const res: number[] = [];
      for (const Y of years) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of buildPreds(Y)) if (x.office === office) res.push(x.actual - predOf(x, E)); }
      out[office] = { n: res.length, mae: res.length ? mean(res.map(Math.abs)) : NaN, bias: res.length ? mean(res) : NaN };
    }
    return out;
  };
  const show = (label: string, r: Record<string, Cell>) => console.log(`  ${label.padEnd(44)}` + OFFICES.map((o) => `${LABEL[o]} n ${String(r[o].n).padStart(3)} MAE ${r[o].mae.toFixed(2)} bias ${fmt(r[o].bias, 2)}`.padEnd(40)).join(""));
  const missing = YEARS.reduce((t, Y) => t + buildPreds(Y).filter((x) => x.gap == null).length, 0);
  console.log(`  (scored races with a side's receipts unknown: ${missing} — so the imputation is judged on masked receipts)\n`);
  moneyBasis = "raw";
  show("raw gap (old rule)", pooled());
  moneyVariant = "zero"; show("no money term", pooled());
  moneyVariant = "structural"; show("receipts masked → structural gap", pooled());
  moneyVariant = "slope-only"; show("receipts masked → structural, no intercept", pooled());
  moneyVariant = "live";
  moneyBasis = "residual";
  fwdMoney = { k: THETA.ffK, cap: THETA.ffCap }; show(`residual gap, k ${THETA.ffK} cap ${THETA.ffCap}`, pooled());
  for (const Y of YEARS) show(`    ${Y}`, pooled([Y]));
  moneyBasis = "raw"; fwdMoney = null;
  for (const Y of YEARS) show(`    ${Y} raw gap, for comparison`, pooled([Y]));
  moneyBasis = "residual";
  console.log("\n  residual gap: k × cap sweep (full-cycle receipts — see --sept-money for the mid-September view)");
  for (const cap of [2, 3, 4, 6]) for (const k of [0.02, 0.03, 0.04, 0.06, 0.08]) { fwdMoney = { k, cap }; show(`k ${k} cap ${cap}`, pooled()); }
  fwdMoney = null;
  show(`LIVE constants (k ${OFFICES.map((o) => F.MONEY_K[o]).join("/")} cap ${OFFICES.map((o) => F.MONEY_CAP[o]).join("/")})`, pooled());
  moneyBasis = F.MONEY_BASIS;
}

if (SEPT_MONEY) {
  // Phase 6 — partial-cycle scaling. The site reads mid-September receipts, but FF_K was
  // calibrated on (and this harness otherwise scores with) full-cycle receipts. With the
  // September snapshot (scripts/fetch-fec-september-snapshot.py) the forward money term is
  // rebuilt the way the site would have seen it, and a scale on the September gap is swept:
  //   pts = clamp(FF_K × scale × gap_sept)
  const file = path.join(process.cwd(), "data-entry", "fundraising_sept_snapshot.csv");
  if (!fs.existsSync(file)) { console.log("\n--sept-money: data-entry/fundraising_sept_snapshot.csv not found (run scripts/fetch-fec-september-snapshot.py)"); }
  else {
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    const head = lines[0].split(",");
    const col = (n: string) => head.indexOf(n);
    const snap = new Map<string, { D?: number; R?: number }>();
    for (const line of lines.slice(1)) {
      const c = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const v = c[col("receipts_sept")]; if (v === "") continue;
      const key = c[col("office")] === "H" ? `H:${c[col("race")]}:${c[col("year")]}` : `S:${c[col("state")]} ${c[col("election_type")] === "Special" ? "Senate Special" : "Senate"}:${c[col("year")]}`;
      const e = snap.get(key) ?? {}; e[c[col("party")] as "D" | "R"] = Number(v); snap.set(key, e);
    }
    // September gap for a prediction row: both nominees need a snapshot (a nominee with no FEC id is absent, as on the live site).
    const septGap = (x: Pred): number | null => { const e = snap.get(`${x.office}:${x.key}:${x.year}`); return e?.D != null && e.R != null && e.D + e.R > 0 ? ((e.R - e.D) / (e.R + e.D)) * 100 : null; };
    moneyBasis = "raw"; // first the old raw-gap rule, as calibrated
    const rows: { x: Pred; E: number; sept: number }[] = [];
    for (const Y of YEARS) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of buildPreds(Y)) { const g = septGap(x); if (g != null && x.gap != null) rows.push({ x, E, sept: g }); } }
    console.log("\nPartial-cycle money (env=struct), races with both a September snapshot and full-cycle receipts:");
    for (const office of ["S", "H"] as const) {
      const rs = rows.filter((r) => r.x.office === office); if (rs.length < 5) continue;
      const m = ols(rs.map((r) => r.sept), rs.map((r) => r.x.gap!));
      const thru = rs.reduce((t, r) => t + r.sept * r.x.gap!, 0) / rs.reduce((t, r) => t + r.sept ** 2, 0);
      const open = rs.filter((r) => Math.abs(r.sept) < 60);
      const thruOpen = open.length ? open.reduce((t, r) => t + r.sept * r.x.gap!, 0) / open.reduce((t, r) => t + r.sept ** 2, 0) : NaN;
      console.log(`  ${LABEL[office]} n ${rs.length} (${[...new Set(rs.map((r) => r.x.year))].join("/")}):  gap_final = ${fmt(m.a, 1)} + ${m.b.toFixed(2)} × gap_sept (R² ${m.r2.toFixed(2)})  ·  through origin ${thru.toFixed(2)}  ·  |gap_sept| < 60 only: ${thruOpen.toFixed(2)} (n ${open.length})  ·  mean |gap| sept ${mean(rs.map((r) => Math.abs(r.sept))).toFixed(1)} → final ${mean(rs.map((r) => Math.abs(r.x.gap!))).toFixed(1)}`);
      const maeWith = (ffOfRow: (r: typeof rs[number]) => number) => mean(rs.map((r) => Math.abs(r.x.actual - (predOf(r.x, r.E, { ff: true }) + ffOfRow(r)))));
      let line = `    MAE  no money ${maeWith(() => 0).toFixed(3)}  ·  full-cycle receipts ${maeWith((r) => r.x.ff).toFixed(3)}  ·  September gap × scale:`;
      for (const k of [0.5, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2]) line += `  ${k}→${maeWith((r) => forwardFf(k * r.sept)).toFixed(3)}`;
      console.log(line);
    }
    // Residual basis (money beyond the structural gap), candidate effects solved on the same
    // basis: September vs full-cycle receipts over forward k × cap, September gap × 0.9 and × 1.
    console.log("  Residual gap (gap − structural), MAE by forward k / cap — no money · full-cycle receipts | September × 1 | September × 0.9:");
    moneyBasis = "residual";
    const residualRow = (label: string) => {
      let line = `    ${label.padEnd(16)}`;
      for (const office of ["S", "H"] as const) {
        const rs: { x: Pred; E: number; sept: number; sg: number | null }[] = [];
        for (const Y of YEARS) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of buildPreds(Y)) { const g = septGap(x); if (x.office === office && g != null && x.gap != null) rs.push({ x, E, sept: g, sg: sgOf(x, E) }); } }
        if (rs.length < 5) continue;
        const mae = (f: (r: typeof rs[number]) => number) => mean(rs.map((r) => Math.abs(r.x.actual - (predOf(r.x, r.E, { ff: true }) + f(r))))).toFixed(3);
        line += `${LABEL[office]} n ${rs.length}: none ${mae(() => 0)} · full ${mae((r) => moneyPts(office, r.x.gap, r.sg))} | sept ${mae((r) => moneyPts(office, r.sept, r.sg))} | sept×.9 ${mae((r) => moneyPts(office, 0.9 * r.sept, r.sg))}     `;
      }
      console.log(line);
    };
    for (const cap of [2, 3, 4]) for (const k of [0.02, 0.03, 0.04, 0.06, 0.08]) { fwdMoney = { k, cap }; residualRow(`k ${k} cap ${cap}`); }
    fwdMoney = null; residualRow("LIVE constants");
    moneyBasis = F.MONEY_BASIS;
  }
}

if (SEAT_STATUS) {
  // Phase 7 — does the model miss by seat status? Residual = actual − predicted (env=struct),
  // centered on the office-year mean (so a year's national miss cannot masquerade as a seat
  // effect) and signed TOWARD the incumbent's / outgoing holder's party: a positive mean is
  // an advantage the model is not crediting.
  console.log("\nSeat status (env=struct): mean residual signed toward the incumbent's / holder's party, after removing the office-year mean");
  console.log("  office    status       n    mean    se     | by year");
  const all: { x: Pred; res: number }[] = [];
  for (const Y of YEARS) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of predsByYear.get(Y)!) all.push({ x, res: x.actual - predOf(x, E) }); }
  for (const office of OFFICES) {
    const rs = all.filter((r) => r.x.office === office);
    const yearMean = new Map(YEARS.map((y) => [y, mean(rs.filter((r) => r.x.year === y).map((r) => r.res))]));
    for (const status of ["veteran", "freshman", "appointed", "open"] as const) {
      const g = rs.filter((r) => r.x.seat.status === status && r.x.seat.sign !== 0).map((r) => ({ y: r.x.year, v: (r.res - (yearMean.get(r.x.year) ?? 0)) * r.x.seat.sign }));
      if (g.length < 2) continue;
      const m = mean(g.map((q) => q.v)); const se = sd(g.map((q) => q.v)) / Math.sqrt(g.length);
      const byYear = YEARS.map((y) => { const v = g.filter((q) => q.y === y).map((q) => q.v); return v.length ? `${y} ${fmt(mean(v), 1)} (n ${v.length})` : null; }).filter(Boolean).join("  ");
      console.log(`  ${LABEL[office].padEnd(8)}  ${status.padEnd(10)} ${String(g.length).padStart(4)}  ${fmt(m, 2).padStart(6)}  ${se.toFixed(2).padStart(5)}   | ${byYear}`);
    }
  }

  // Leave-one-year-out: fit the seat coefficient(s) on the OTHER years' residuals (year fixed
  // effects, so the national miss is out), apply to the held-out year, compare MAE.
  //   carry    = pts toward the outgoing holder's party in an open seat
  //   freshman = pts toward a first-term incumbent, on top of the office's incumbency
  //   incumb.  = pts toward ANY elected incumbent (a correction to the incumbency term itself)
  const xOf: Record<string, (x: Pred) => number> = {
    carry: (x) => (x.seat.status === "open" ? x.seat.sign : 0),
    freshman: (x) => (x.seat.status === "freshman" ? x.seat.sign : 0),
    "incumb.": (x) => (x.seat.status === "veteran" || x.seat.status === "freshman" ? x.seat.sign : 0),
  };
  const fitFE = (rows: { x: Pred; res: number }[], names: string[]): number[] => {
    const ym = new Map<number, { r: number; x: number[]; n: number }>();
    for (const q of rows) { const e = ym.get(q.x.year) ?? { r: 0, x: names.map(() => 0), n: 0 }; e.r += q.res; names.forEach((nm, i) => (e.x[i] += xOf[nm](q.x))); e.n += 1; ym.set(q.x.year, e); }
    const k = names.length; const A = names.map(() => names.map(() => 0)); const bv = names.map(() => 0);
    for (const q of rows) { const e = ym.get(q.x.year)!; const xr = names.map((nm, i) => xOf[nm](q.x) - e.x[i] / e.n); const rr = q.res - e.r / e.n; for (let i = 0; i < k; i++) { bv[i] += xr[i] * rr; for (let j = 0; j < k; j++) A[i][j] += xr[i] * xr[j]; } }
    if (k === 1) return [A[0][0] > 0 ? bv[0] / A[0][0] : 0];
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]; if (Math.abs(det) < 1e-9) return [0, 0];
    return [(bv[0] * A[1][1] - bv[1] * A[0][1]) / det, (A[0][0] * bv[1] - A[1][0] * bv[0]) / det];
  };
  console.log("\n  Leave-one-year-out: coefficient fitted on the other years (full-sample value in brackets), pooled MAE before → after");
  for (const office of OFFICES) {
    const rs = all.filter((r) => r.x.office === office);
    const years = YEARS.filter((y) => rs.filter((r) => r.x.year === y).length >= 3);
    const before = mean(rs.filter((r) => years.includes(r.x.year)).map((r) => Math.abs(r.res)));
    for (const names of [["carry"], ["freshman"], ["incumb."], ["carry", "freshman"], ["carry", "incumb."]]) {
      const after: number[] = []; const perYear: string[] = [];
      for (const Y of years) {
        const b = fitFE(rs.filter((r) => r.x.year !== Y && years.includes(r.x.year)), names);
        const held = rs.filter((r) => r.x.year === Y);
        after.push(...held.map((r) => Math.abs(r.res - names.reduce((t, nm, i) => t + b[i] * xOf[nm](r.x), 0))));
        perYear.push(`${Y}: ${b.map((v) => fmt(v, 1)).join("/")}`);
      }
      const full = fitFE(rs.filter((r) => years.includes(r.x.year)), names);
      console.log(`  ${LABEL[office].padEnd(8)}  ${names.join(" + ").padEnd(18)} [${full.map((v) => fmt(v, 2)).join(" / ")}]`.padEnd(52) + `MAE ${before.toFixed(3)} → ${mean(after).toFixed(3)}   fitted without ${perYear.join("  ")}`);
    }
  }
  // House incumbency: the fixed prior, swept in the district-lean strip, the candidate effects and the forward term together.
  console.log("\n  House incumbency sweep (strip + candidate effects + forward term), pooled House MAE / bias, and open-seat / incumbent split:");
  for (const h of [0, 1, 2, 2.5, 3, 3.5, 4, 5, 6]) {
    H_INC = h; effectsCache.clear(); historyCache.clear(); moneyModelCache.clear(); priorByYear.clear();
    const res: { r: number; open: boolean; y: number }[] = [];
    for (const Y of YEARS) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of buildPreds(Y)) if (x.office === "H") res.push({ r: x.actual - predOf(x, E), open: x.seat.status === "open", y: Y }); }
    const by = (f: (q: typeof res[number]) => boolean) => mean(res.filter(f).map((q) => Math.abs(q.r))).toFixed(3);
    console.log(`    H_INC ${String(h).padEnd(4)} MAE ${by(() => true)}  bias ${fmt(mean(res.map((q) => q.r)), 2)}  | incumbent races ${by((q) => !q.open)} · open seats ${by((q) => q.open)} | 2022 ${by((q) => q.y === 2022)} · 2024 ${by((q) => q.y === 2024)}`);
  }
  H_INC = 3; effectsCache.clear(); historyCache.clear(); moneyModelCache.clear(); priorByYear.clear();
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
  //   m(w) = (1 − w) × model + w × pollAvg,   w = min(POLL_W_MAX, nEff / (nEff + k))
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
  console.log(`\nRace polls (env=struct; ${pollsByRace.size} race-years with polls${NO_PARTISAN ? ", partisan polls dropped" : ""}${PARTISAN_SHIFT ? `, partisan polls shifted ${PARTISAN_SHIFT} pts toward the opponent` : ""}): blend m = (1−w)·model + w·poll, w = min(${F.POLL_W_MAX}, nEff/(nEff+k)), k fitted leave-one-year-out`);
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
          const avg = computeRacePollAverage(pollsByRace.get(pollKeyOf(x)) ?? [], asOf, undefined, undefined, halfLifeOf(office));
          if (!avg) continue;
          rows.push({ office, year: Y, model: predOf(x, E), poll: avg.diff, nEff: avg.nEff, actual: x.actual });
        }
      }
      if (rows.length < 10) continue;
      const blend = (r: PRow, k: number) => { const w = k === Infinity ? 0 : Math.min(F.POLL_W_MAX, r.nEff / (r.nEff + k)); return (1 - w) * r.model + w * r.poll; };
      const maeAt = (rs: PRow[], k: number) => mean(rs.map((r) => Math.abs(r.actual - blend(r, k))));
      const bestK = (rs: PRow[]) => ks.reduce((b, k) => (maeAt(rs, k) < maeAt(rs, b) ? k : b), ks[0]);
      const kStar = bestK(rows);
      // leave-one-year-out: k chosen on the other years, applied to this one
      const looErr: number[] = [];
      for (const Y of YEARS) { const train = rows.filter((r) => r.year !== Y), test = rows.filter((r) => r.year === Y); if (!train.length || !test.length) continue; const k = bestK(train); looErr.push(...test.map((r) => Math.abs(r.actual - blend(r, k)))); }
      const resPoll = rows.map((r) => r.actual - r.poll), resBlend = rows.map((r) => r.actual - blend(r, kStar));
      const wMean = mean(rows.map((r) => Math.min(F.POLL_W_MAX, r.nEff / (r.nEff + kStar))));
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

  // ── Poll aging ──────────────────────────────────────────────────────────────
  // Each poll moved by share × β*(state) × (GB on asOf − GB on its end date), GB from the
  // same-cycle 538 generic-ballot polls averaged with the live recipe
  // (data-entry/generic_ballot_polls_history.csv). Scored at the LIVE POLL_K, so the
  // sweep isolates the shift; share 0 reproduces the un-aged blend.
  const gbFile = path.join(process.cwd(), "data-entry", "generic_ballot_polls_history.csv");
  if (fs.existsSync(gbFile)) {
    const gbLines = fs.readFileSync(gbFile, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const gbHdr = split(gbLines[0]);
    const gbByYear = new Map<number, GenericBallotPoll[]>();
    for (const line of gbLines.slice(1)) {
      const r = split(line); const c = (k: string) => r[gbHdr.indexOf(k)] ?? "";
      const dem = Number(c("dem")), rep = Number(c("rep")), y = Number(c("year"));
      (gbByYear.get(y) ?? gbByYear.set(y, []).get(y)!).push({ pollster: c("pollster"), startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem });
    }
    const gbAt = new Map([...gbByYear].map(([y, ps]) => [y, genericBallotSeries(ps)] as const));
    const shares = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
    console.log(`\nPoll aging (blend at the live POLL_K ${OFFICES.map((o) => `${o} ${F.POLL_K[o]}`).join(" · ")}): MAE of the blend / of the poll average alone, by aging share`);
    console.log("  horizon   office    n      mean |shift| @1   " + shares.map((a) => `share ${a}`.padStart(15)).join(""));
    for (const [hname, mmdd] of horizons) {
      for (const office of OFFICES) {
        const cells: string[] = []; let n = 0, absShift = 0;
        for (const share of shares) {
          const errBlend: number[] = [], errPoll: number[] = []; let sh = 0;
          for (const Y of YEARS) {
            const E = envEstimate("struct", Y); const series = gbAt.get(Y); if (E == null || !series) continue;
            const asOf = new Date(`${Y}-${mmdd}T12:00:00Z`);
            for (const x of predsByYear.get(Y)!) {
              if (x.office !== office) continue;
              const avg = computeRacePollAverage(pollsByRace.get(pollKeyOf(x)) ?? [], asOf, pollAgingShift(series, x.beta, asOf, share), undefined, halfLifeOf(office));
              if (!avg) continue;
              const w = pollWeight(avg.nEff, office);
              errBlend.push(Math.abs(x.actual - ((1 - w) * predOf(x, E) + w * avg.diff)));
              errPoll.push(Math.abs(x.actual - avg.diff));
              sh += Math.abs(avg.aging);
            }
          }
          if (share === 1) { n = errBlend.length; absShift = errBlend.length ? sh / errBlend.length : 0; }
          cells.push(errBlend.length ? `${mean(errBlend).toFixed(3)} / ${mean(errPoll).toFixed(2)}`.padStart(15) : "—".padStart(15));
        }
        console.log(`  ${hname.padEnd(9)} ${LABEL[office].padEnd(8)} ${String(n).padStart(4)}   ${absShift.toFixed(2).padStart(15)}   ${cells.join("")}`);
      }
    }
  } else console.log("\n(poll aging sweep skipped: run python3 scripts/build-generic-ballot-history.py)");

  console.log(`Recommended FORECAST_CONSTANTS.POLL_K by horizon: ${horizons.map(([h]) => `${h}: ${OFFICES.map((o) => `${o} ${chosen[h][o] ?? "—"}`).join(" · ")}`).join("   |   ")}`);
}


// ── Horizon-matched backtest (2026-10-23) ────────────────────────────────────
// The rest of this harness scores the environment from the mid-September generic ballot. That
// is the right test for a forecast run in mid-September, but the live forecast moves toward
// election day, and by then most of the September→November drift is already inside the
// average. Here every past year is replayed at the SAME number of days before its own election
// as each horizon in the list (election dates differ: Nov 6 2018, Nov 3 2020, Nov 8 2022, Nov 5
// 2024), with every time-varying input rebuilt as of that day from the 538 archive:
//   generic ballot  the live recipe over that year's polls completed by then
//   E, σ_E          the live rule (struct, leave-one-year-out c / s / miss / drift) at that GB,
//                   σ_E's drift term scaled by days remaining exactly as getNationalEnvironment
//   race polls      live recipe: per-office half-life, aging by the GB's movement × β*, the
//                   current-cycle house effects as of that day, w = min(W_MAX, nEff/(nEff+k))
//   σ, P(D)         raceSigma's formula with the live RACE_SIGMA / POLL_SIGMA
// Lean, β*, incumbency and candidate effects are fitted on years ≤ Y−1 and do not depend on the
// horizon. Money uses full-cycle receipts at every horizon (only a September snapshot exists).
const ELECTION_DAY: Record<number, string> = { 2018: "2018-11-06", 2020: "2020-11-03", 2022: "2022-11-08", 2024: "2024-11-05" };
export interface HorizonRow { days: number; office: "S" | "G" | "H"; n: number; polled: number; maeModel: number; mae: number; biasModel: number; bias: number; nationalSd: number; cover80: number; brier: number; calledRight: number; meanW: number; gb: Record<number, number | null>; byYear: Record<number, { n: number; mae: number; bias: number; abs: number[]; res: number[] }>; }
interface HorizonOpts { drop?: { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean }; pollShift?: number; pollShiftPerLean?: number; noPolls?: boolean; competitiveOnly?: number; collect?: Record<string, unknown>[]; normalize?: number; undecidedCap?: number; rules?: Partial<Record<"S" | "G" | "H", RaceAverageRules>> }
const horizonCache: { polls?: Map<string, RacePoll[]>; gb?: Map<number, GenericBallotPoll[]>; he: Map<string, ReturnType<typeof computeHouseEffects>> } = { he: new Map() };
function horizonBacktest(days: number[], opt: HorizonOpts = {}): HorizonRow[] {
  const split = (line: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const readCsv = (name: string) => { const ls = fs.readFileSync(path.join(process.cwd(), "data-entry", name), "utf8").split(/\r?\n/).filter((l) => l.trim()); const h = split(ls[0]); return ls.slice(1).map((l) => { const r = split(l); return (k: string) => r[h.indexOf(k)] ?? ""; }); };
  const pollsByRace = horizonCache.polls ?? new Map<string, RacePoll[]>();
  if (!horizonCache.polls) for (const c of readCsv("race_polls_history.csv")) {
    const key = `${c("year")}|${c("office")}|${c("state")}|${c("race")}`;
    const dem = Number(c("dem")), rep = Number(c("rep"));
    (pollsByRace.get(key) ?? pollsByRace.set(key, []).get(key)!).push({ pollster: c("pollster"), partisan: (c("partisan") || null) as "D" | "R" | null, startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem });
  }
  horizonCache.polls = pollsByRace;
  const gbByYear = horizonCache.gb ?? new Map<number, GenericBallotPoll[]>();
  if (!horizonCache.gb) for (const c of readCsv("generic_ballot_polls_history.csv")) {
    const y = Number(c("year")), dem = Number(c("dem")), rep = Number(c("rep"));
    (gbByYear.get(y) ?? gbByYear.set(y, []).get(y)!).push({ pollster: c("pollster"), startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem });
  }
  horizonCache.gb = gbByYear;
  const pollKeyOf = (x: Pred) => x.office === "H" ? `${x.year}|H|${x.key.slice(0, 2)}|House ${x.key}` : `${x.year}|${x.office}|${x.key.slice(0, 2)}|${x.key.slice(3)}`;
  const out: HorizonRow[] = [];
  type Cell = { res: number; resModel: number; z: number; p: number; won: number; w: number; polled: boolean; year: number; called: boolean };
  for (const d of days) {
    const cells: Record<string, Cell[]> = { S: [], G: [], H: [] };
    const gbAtHorizon: Record<number, number | null> = {};
    for (const Y of YEARS) {
      const eday = ELECTION_DAY[Y]; const ps = gbByYear.get(Y); if (!eday || !ps) continue;
      const asOf = new Date(new Date(`${eday}T12:00:00Z`).getTime() - d * 86400000);
      const iso = asOf.toISOString().slice(0, 10);
      const series = genericBallotSeries(ps);
      const gb = series(iso); gbAtHorizon[Y] = gb;
      if (gb == null) continue;
      const m = structModel(Y);
      const E = m.c + m.s * (gb + F.ENV_MISS_SHRINK * m.meanMiss);
      const hf = Math.min(1.5, d / F.ENV_DAYS_MID_SEPT_TO_ELECTION);
      const sigE = Math.hypot(F.NATIONAL_SIGMA_STRUCTURAL, Math.abs(m.s) * Math.sqrt(m.sdMiss ** 2 + (hf * m.sdDrift) ** 2));
      const betaOf = new Map<string, number>(); for (const x of predsByYear.get(Y)!) betaOf.set(pollKeyOf(x), x.beta);
      // normalize: share of the undecided allocated in proportion to the decided shares (1 = full two-party).
      const nz = opt.normalize ?? F.POLL_UNDECIDED_ALLOCATION;
      const ucap = opt.undecidedCap ?? F.POLL_UNDECIDED_CAP;
      const normed = (ps: RacePoll[]) => ps.map((q) => allocateUndecided(q, nz, ucap)); // house effects are estimated on allocated margins
      const yearRaces = [...pollsByRace].filter(([k]) => k.startsWith(`${Y}|`)).map(([k, polls]) => ({ polls: normed(polls), shiftFor: pollAgingShift(series, betaOf.get(k) ?? 1, asOf) }));
      const heKey = `${Y}|${d}|${F.POLL_AGING_SHARE}|${F.HOUSE_EFFECT_K}|${nz}|${ucap}`;
      const he = F.HOUSE_EFFECTS ? (horizonCache.he.get(heKey) ?? horizonCache.he.set(heKey, computeHouseEffects(yearRaces, asOf)).get(heKey)!) : null;
      for (const x of predsByYear.get(Y)!) {
        const model = predOf(x, E, opt.drop ?? {});
        const avg = opt.noPolls ? null : computeRacePollAverage(pollsByRace.get(pollKeyOf(x)) ?? [], asOf, pollAgingShift(series, x.beta, asOf), he ? he.of : undefined, halfLifeOf(x.office), nz, ucap, opt.rules?.[x.office] ?? {});
        const w = avg ? pollWeight(avg.nEff, x.office) : 0;
        // pollShiftPerLean: pts toward R per 10 pts of the seat's R lean (negative in blue seats), lean capped at ±30
        const leanShift = (opt.pollShiftPerLean ?? 0) * Math.max(-3, Math.min(3, x.lean / 10));
        const margin = avg ? (1 - w) * model + w * (avg.diff + (opt.pollShift ?? 0) + leanShift) : model;
        if (opt.competitiveOnly != null && Math.abs(model) > opt.competitiveOnly) continue;
        if (opt.collect && avg) {
          const ps = avg.polls;
          opt.collect.push({ days: d, year: Y, office: x.office, race: x.key, actual: +x.actual.toFixed(2), model: +model.toFixed(2), poll: +avg.diff.toFixed(2), nEff: +avg.nEff.toFixed(3), n: avg.n,
            nD: ps.filter((q) => q.partisan === "D").length, nR: ps.filter((q) => q.partisan === "R").length, ageMin: Math.round(Math.min(...ps.map((q) => q.ageDays))), ageMean: Math.round(mean(ps.map((q) => q.ageDays))),
            inc: x.incSign, beta: +x.beta.toFixed(3), sigE: +sigE.toFixed(3) });
        }
        const sigma = Math.sqrt((x.beta * sigE) ** 2 + ((1 - w) * F.RACE_SIGMA[x.office]) ** 2 + (w * F.POLL_SIGMA[x.office]) ** 2);
        const p = Math.max(0.005, Math.min(0.995, Phi(-margin / sigma)));
        cells[x.office].push({ res: x.actual - margin, resModel: x.actual - model, z: Math.abs(x.actual - margin) / sigma, p, won: x.actual <= 0 ? 1 : 0, w, polled: !!avg, year: Y, called: (margin <= 0) === (x.actual <= 0) });
      }
    }
    for (const office of OFFICES) {
      const cs = cells[office]; if (cs.length < 3) continue;
      const years = YEARS.filter((y) => cs.filter((c) => c.year === y).length >= 3);
      const yearBias = years.map((y) => mean(cs.filter((c) => c.year === y).map((c) => c.res)));
      out.push({
        days: d, office, n: cs.length, polled: cs.filter((c) => c.polled).length,
        maeModel: mean(cs.map((c) => Math.abs(c.resModel))), mae: mean(cs.map((c) => Math.abs(c.res))), biasModel: mean(cs.map((c) => c.resModel)), bias: mean(cs.map((c) => c.res)),
        nationalSd: years.length > 1 ? sd(yearBias) : 0, cover80: mean(cs.map((c) => (c.z <= 1.2816 ? 1 : 0))),
        brier: mean(cs.map((c) => (c.p - c.won) ** 2)), calledRight: mean(cs.map((c) => (c.called ? 1 : 0))), meanW: mean(cs.map((c) => c.w)), gb: gbAtHorizon,
        byYear: Object.fromEntries(years.map((y) => { const yc = cs.filter((c) => c.year === y); return [y, { n: yc.length, mae: mean(yc.map((c) => Math.abs(c.res))), bias: mean(yc.map((c) => c.res)), abs: yc.map((c) => Math.abs(c.res)), res: yc.map((c) => c.res) }]; })),
      });
    }
  }
  return out;
}
// Days before each election the horizon table reports; the live forecast's own distance is added.
const HORIZON_DAYS = (() => {
  const base = [98, 84, 70, 56, 49, 42, 35, 28, 21, 14, 7, 1];
  const live = Math.round((new Date(Date.UTC(2026, 10, 3)).getTime() - Date.now()) / 86400000);
  return [...new Set([...base, ...(live >= 1 && live <= 120 ? [live] : [])])].sort((a, b) => b - a);
})();
if (HORIZONS) {
  const rows = horizonBacktest(HORIZON_DAYS);
  console.log("\nHorizon-matched backtest: each year replayed N days before its own election (blend of model and race polls, live constants; bias = actual − forecast, R-positive)");
  console.log("  days   office    n  polled   MAE model   MAE blend  bias model   bias   yr-bias sd   80% cover   Brier   called   mean w   GB by year");
  for (const r of rows) console.log(`  ${String(r.days).padStart(4)}   ${LABEL[r.office].padEnd(8)} ${String(r.n).padStart(4)}  ${String(r.polled).padStart(5)}   ${r.maeModel.toFixed(2).padStart(9)}   ${r.mae.toFixed(2).padStart(9)}   ${fmt(r.biasModel, 2).padStart(9)}   ${fmt(r.bias, 2).padStart(6)}   ${r.nationalSd.toFixed(2).padStart(10)}   ${(r.cover80 * 100).toFixed(0).padStart(8)}%   ${r.brier.toFixed(3)}   ${(r.calledRight * 100).toFixed(1).padStart(5)}%   ${r.meanW.toFixed(2).padStart(6)}   ${Object.entries(r.gb).map(([y, v]) => `${y} ${v == null ? "—" : fmt(v, 1)}`).join(" · ")}`);
}


if (HORIZON_ABLATE) {
  // Every factor dropped or varied, scored horizon-matched (model + polls blended as the site
  // runs). Constants are mutated in place and restored; per-year cells are kept for LOYO checks.
  const AB_DAYS = [49, 28, 11];
  type V = { name: string; opt?: HorizonOpts; set?: () => () => void };
  const setF = (patch: Record<string, unknown>) => () => { const prev: Record<string, unknown> = {}; for (const [k, v] of Object.entries(patch)) { prev[k] = (F as Record<string, unknown>)[k]; (F as Record<string, unknown>)[k] = v; } return () => { for (const [k, v] of Object.entries(prev)) (F as Record<string, unknown>)[k] = v; }; };
  const scaled = (o: Record<string, number>, m: number) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * m]));
  const variants: V[] = [
    { name: "LIVE" },
    { name: "no polls (model only)", opt: { noPolls: true } },
    { name: "drop environment", opt: { drop: { env: true } } },
    { name: "drop incumbency", opt: { drop: { inc: true } } },
    { name: "drop fundraising", opt: { drop: { ff: true } } },
    { name: "drop candidates", opt: { drop: { quality: true } } },
    { name: "candidates x 0.5", set: () => setF({ QUALITY_WEIGHT: scaled(F.QUALITY_WEIGHT, 0.5) })() },
    { name: "candidates x 1.5", set: () => setF({ QUALITY_WEIGHT: scaled(F.QUALITY_WEIGHT, 1.5) })() },
    { name: "GB shading 0", set: setF({ ENV_MISS_SHRINK: 0 }) },
    { name: "GB shading 1", set: setF({ ENV_MISS_SHRINK: 1 }) },
    { name: "GB shading 1.5", set: setF({ ENV_MISS_SHRINK: 1.5 }) },
    { name: "race polls +1 R", opt: { pollShift: 1 } },
    { name: "race polls +2 R", opt: { pollShift: 2 } },
    { name: "race polls +3 R", opt: { pollShift: 3 } },
    { name: "POLL_K x 0.5", set: () => setF({ POLL_K: scaled(F.POLL_K, 0.5) })() },
    { name: "POLL_K x 2", set: () => setF({ POLL_K: scaled(F.POLL_K, 2) })() },
    { name: "POLL_K fitted H1 S3 G0.1", set: setF({ POLL_K: { H: 1, S: 3, G: 0.1 } }) },
    { name: "POLL_W_MAX 0.6", set: setF({ POLL_W_MAX: 0.6 }) },
    { name: "POLL_W_MAX 0.9", set: setF({ POLL_W_MAX: 0.9 }) },
    { name: "POLL_W_MAX 1.0", set: setF({ POLL_W_MAX: 1.0 }) },
    { name: "half-life 14 all", set: () => { halfLifeOverride = 14; return () => { halfLifeOverride = null; }; } },
    { name: "half-life 45 all", set: () => { halfLifeOverride = 45; return () => { halfLifeOverride = null; }; } },
    { name: "Senate half-life 30", set: () => setF({ POLL_HALF_LIFE_DAYS: { ...F.POLL_HALF_LIFE_DAYS, S: 30 } })() },
    { name: "no house effects", set: setF({ HOUSE_EFFECTS: false }) },
    { name: "no poll aging", set: setF({ POLL_AGING_SHARE: 0 }) },
    { name: "national sigma struct 0 (old)", set: setF({ NATIONAL_SIGMA_STRUCTURAL: 0 }) },
    { name: "national sigma struct 3.5", set: setF({ NATIONAL_SIGMA_STRUCTURAL: 3.5 }) },
  ];
  const results: { name: string; rows: HorizonRow[] }[] = [];
  for (const v of variants) {
    const restore = v.set ? v.set() : null;
    effectsCache.clear();
    results.push({ name: v.name, rows: horizonBacktest(AB_DAYS, v.opt) });
    restore?.();
    process.stderr.write(`  done ${v.name}\n`);
  }
  effectsCache.clear();
  const live = results[0].rows;
  const cellOf = (rows: HorizonRow[], d: number, o: string) => rows.find((q) => q.days === d && q.office === o);
  console.log("\nHorizon-matched ablation: MAE (diff vs live) / bias / 80% cover / Brier, model + polls blended");
  for (const d of AB_DAYS) {
    console.log(`\n  ${d} days out`);
    console.log("  " + "variant".padEnd(32) + OFFICES.map((o) => LABEL[o].padEnd(38)).join(""));
    for (const r of results) {
      let line = "  " + r.name.padEnd(32);
      for (const o of OFFICES) {
        const x = cellOf(r.rows, d, o), b = cellOf(live, d, o);
        line += x && b ? `${x.mae.toFixed(2)} (${fmt(x.mae - b.mae, 2)}) ${fmt(x.bias, 1).padStart(5)} ${(x.cover80 * 100).toFixed(0)}% ${x.brier.toFixed(3)}`.padEnd(38) : "-".padEnd(38);
      }
      console.log(line);
    }
  }
  console.log("\n  11 days out, MAE by year (Senate / Governor / House)");
  for (const r of results) {
    const parts = YEARS.map((y) => `${y} ` + OFFICES.map((o) => { const c = cellOf(r.rows, 11, o)?.byYear[y]; return c ? c.mae.toFixed(2) : " - "; }).join("/"));
    console.log("  " + r.name.padEnd(32) + parts.join("   "));
  }
  const loyo = (names: string[], label: string) => {
    for (const d of AB_DAYS) {
      let line = `  ${label.padEnd(10)} @${String(d).padStart(2)}d: `;
      for (const o of OFFICES) {
        const cand = results.filter((r) => names.includes(r.name));
        const errs: number[] = []; const picks: string[] = [];
        for (const Y of YEARS) {
          const score = (r: (typeof cand)[number]) => { const x = cellOf(r.rows, d, o); if (!x) return Infinity; const all = YEARS.filter((y) => y !== Y && x.byYear[y]).flatMap((y) => x.byYear[y].abs); return all.length ? mean(all) : Infinity; };
          const best = cand.reduce((b, r) => (score(r) < score(b) ? r : b), cand[0]);
          const held = cellOf(best.rows, d, o)?.byYear[Y]; if (!held) continue;
          errs.push(...held.abs); picks.push(`${Y}:${best.name}`);
        }
        line += `${LABEL[o]} ${mean(errs).toFixed(3)} vs live ${cellOf(live, d, o)!.mae.toFixed(3)} [${picks.join(", ")}]   `;
      }
      console.log(line);
    }
  };
  console.log("\n  Leave-one-year-out choice among variants (chosen on 3 years, scored on the 4th):");
  loyo(["LIVE", "race polls +1 R", "race polls +2 R", "race polls +3 R"], "poll shift");
  loyo(["GB shading 0", "LIVE", "GB shading 1", "GB shading 1.5"], "GB shade");
  loyo(["LIVE", "POLL_K x 0.5", "POLL_K x 2", "POLL_K fitted H1 S3 G0.1"], "POLL_K");
  loyo(["LIVE", "half-life 14 all", "half-life 45 all", "Senate half-life 30"], "half-life");
  loyo(["LIVE", "candidates x 0.5", "candidates x 1.5", "drop candidates"], "candidates");
}


if (HORIZON_POLLSHIFT) {
  // Is the race-poll miss uniform, or does it grow with the seat's Republican lean (polls too
  // Democratic in red seats, too Republican in blue ones)? All races, and competitive races only
  // (|model| ≤ 10), MAE / bias / Brier at three horizons, with per-year MAE at 11 days.
  const D = [49, 28, 11];
  const vs: { name: string; opt: HorizonOpts }[] = [];
  for (const comp of [undefined, 10] as (number | undefined)[]) {
    const tag = comp == null ? "" : " [|model|≤10]";
    vs.push({ name: "LIVE" + tag, opt: { competitiveOnly: comp } });
    for (const u of [1, 2]) vs.push({ name: `uniform +${u}` + tag, opt: { pollShift: u, competitiveOnly: comp } });
    for (const b of [0.5, 1, 1.5, 2]) vs.push({ name: `per-lean ${b}/10pt` + tag, opt: { pollShiftPerLean: b, competitiveOnly: comp } });
    vs.push({ name: "uniform +1 & per-lean 1" + tag, opt: { pollShift: 1, pollShiftPerLean: 1, competitiveOnly: comp } });
  }
  const res = vs.map((v) => ({ name: v.name, rows: horizonBacktest(D, v.opt) }));
  for (const d of D) {
    console.log(`\n  ${d} days out — MAE / bias / Brier / called`);
    for (const r of res) console.log("  " + r.name.padEnd(36) + OFFICES.map((o) => { const x = r.rows.find((q) => q.days === d && q.office === o); return x ? `${LABEL[o]} n${x.n} ${x.mae.toFixed(2)} ${fmt(x.bias, 1)} ${x.brier.toFixed(3)} ${(x.calledRight * 100).toFixed(1)}%`.padEnd(42) : ""; }).join(""));
  }
  console.log("\n  11 days, MAE by year S/G/H");
  for (const r of res) console.log("  " + r.name.padEnd(36) + YEARS.map((y) => `${y} ` + OFFICES.map((o) => r.rows.find((q) => q.days === 11 && q.office === o)?.byYear[y]?.mae.toFixed(2) ?? " - ").join("/")).join("   "));
}


if (HORIZON_POLLDUMP) {
  // Per polled race: model, poll average and the evidence behind it, at several horizons — for
  // studying how much weight a race's polls deserve given how many there are (OS temp dir CSV).
  const rows: Record<string, unknown>[] = [];
  horizonBacktest([49, 28, 21, 11, 1], { collect: rows });
  const file = path.join(os.tmpdir(), "horizon_polls.csv");
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(file, [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n"));
  console.log(`\nwrote ${rows.length} polled race-horizon rows to ${file}`);
}


if (HORIZON_UNDECIDED) {
  // Race polls with many undecided voters compress the leader's margin. Allocate a share of the
  // undecided in proportion to the decided shares (0 = raw margin; live = POLL_UNDECIDED_ALLOCATION; 1 = two-party).
  const D = [28, 11];
  const grid: [number, number][] = [[0, 100], [0.5, 100], [1, 100], [0.5, 15], [0.5, 10], [1, 15], [1, 10], [1, 7]];
  const res = grid.map(([nz, cap]) => ({ nz: `${nz} cap ${cap}`, rows: horizonBacktest(D, { normalize: nz, undecidedCap: cap }), comp: horizonBacktest(D, { normalize: nz, undecidedCap: cap, competitiveOnly: 10 }) }));
  for (const d of D) {
    console.log(`\n  ${d} days out — undecided allocation: MAE / bias / Brier, all races | competitive (|model| ≤ 10)`);
    for (const r of res) console.log(`  allocate ${String(r.nz).padEnd(12)}` + OFFICES.map((o) => { const x = r.rows.find((q) => q.days === d && q.office === o)!, c = r.comp.find((q) => q.days === d && q.office === o)!; return `${LABEL[o]} ${x.mae.toFixed(3)} ${fmt(x.bias, 2)} ${x.brier.toFixed(3)} | ${c.mae.toFixed(3)} ${fmt(c.bias, 2)} ${c.brier.toFixed(3)}`.padEnd(54); }).join(""));
    for (const r of res) console.log(`    by year, allocate ${r.nz}: ` + OFFICES.map((o) => `${LABEL[o]} ` + YEARS.map((y) => r.rows.find((q) => q.days === d && q.office === o)?.byYear[y]?.mae.toFixed(2) ?? "-").join("/")).join("   "));
  }
}


if (HORIZON_POLLRULES) {
  // Poll-age cutoff and trust in high-undecided polls, on top of the live recipe. Rules apply to
  // the offices named; the others run live. MAE / bias / Brier, all races and competitive.
  const D = [28, 11];
  const all3 = (r: RaceAverageRules) => ({ H: r, S: r, G: r });
  const vs: { name: string; rules: HorizonOpts["rules"] }[] = [
    { name: "LIVE", rules: {} },
    ...[60, 75, 90, 120].map((a) => ({ name: `House max age ${a} d`, rules: { H: { maxAgeDays: a } } })),
    { name: "all offices max age 90 d", rules: all3({ maxAgeDays: 90 }) },
    { name: "no allocation above 20% (all)", rules: all3({ noAllocationAbove: 20 }) },
    { name: "no allocation above 15% (all)", rules: all3({ noAllocationAbove: 15 }) },
    ...[1, 2, 4].map((p) => ({ name: `decided^${p} weight (all)`, rules: all3({ decidedPower: p }) })),
    ...[2, 4].map((p) => ({ name: `decided^${p} weight + evidence (all)`, rules: all3({ decidedPower: p, decidedInEvidence: true }) })),
    { name: "House: decided^2 + evid + no alloc >20", rules: { H: { decidedPower: 2, decidedInEvidence: true, noAllocationAbove: 20 } } },
    { name: "combo: H age 90 + no alloc >20 (all)", rules: { H: { maxAgeDays: 90, noAllocationAbove: 20 }, S: { noAllocationAbove: 20 }, G: { noAllocationAbove: 20 } } },
  ];
  const res = vs.map((v) => ({ name: v.name, rows: horizonBacktest(D, { rules: v.rules }), comp: horizonBacktest(D, { rules: v.rules, competitiveOnly: 10 }) }));
  for (const d of D) {
    console.log(`\n  ${d} days out — MAE / bias / Brier, all races | competitive (|model| ≤ 10)`);
    for (const r of res) console.log("  " + r.name.padEnd(40) + OFFICES.map((o) => { const x = r.rows.find((q) => q.days === d && q.office === o)!, c = r.comp.find((q) => q.days === d && q.office === o)!; return `${LABEL[o][0]} ${x.mae.toFixed(3)} ${fmt(x.bias, 2)} ${x.brier.toFixed(3)} | ${c.mae.toFixed(3)}`.padEnd(36); }).join(""));
    for (const r of res) console.log("    by year " + r.name.padEnd(40) + OFFICES.map((o) => `${LABEL[o][0]} ` + YEARS.map((y) => r.rows.find((q) => q.days === d && q.office === o)?.byYear[y]?.mae.toFixed(2) ?? "-").join("/")).join("  "));
  }
}

if (EMIT) {
  // ── data/forecastCalibration.ts: the numbers behind /methodology's Calibration section ──
  // Everything under env=struct (the live environment rule) and the LIVE constants, so the page
  // always describes the model as it is. Re-run after any change to the model or its data.
  const r2 = (v: number) => +v.toFixed(2), r3 = (v: number) => +v.toFixed(3);
  const liveSigma = (office: "S" | "G" | "H", r: Row) => Math.sqrt((r.beta * sigmaE(r.year)) ** 2 + F.RACE_SIGMA[office] ** 2);
  const byYear = YEARS.flatMap((Y) => {
    const E = envEstimate("struct", Y); if (E == null) return [];
    return OFFICES.flatMap((office) => {
      const sc = score(predsByYear.get(Y)!.filter((p) => p.office === office), E);
      return sc ? [{ year: Y, office, n: sc.n, E: r2(E), mae: r2(sc.mae), bias: r2(sc.bias), r: r2(sc.r) }] : [];
    });
  });
  const pooled = OFFICES.flatMap((office) => {
    const rows = rowsByOffice[office]; if (rows.length < 3) return [];
    const years = YEARS.filter((y) => rows.filter((r) => r.year === y).length >= 3);
    const yearBias = years.map((y) => mean(rows.filter((r) => r.year === y).map((r) => r.res)));
    const brier = (pOf: (r: Row) => number) => mean(rows.map((r) => (pOf(r) - (r.actual <= 0 ? 1 : 0)) ** 2));
    return [{
      office, n: rows.length, mae: r2(mean(rows.map((r) => Math.abs(r.res)))), bias: r2(mean(rows.map((r) => r.res))),
      meanAbsYearBias: r2(mean(yearBias.map(Math.abs))), withinRsd: r2(withinRsd(rows, years)), nationalSd: r2(years.length > 1 ? sd(yearBias) : 0),
      liveRaceSigma: F.RACE_SIGMA[office],
      cover80: r3(mean(rows.map((r) => (Math.abs(r.res) <= 1.2816 * liveSigma(office, r) ? 1 : 0)))),
      brier: r3(brier((r) => Phi(-r.pred / liveSigma(office, r)))), brierCoinFlip: 0.25,
      calledRight: r3(mean(rows.map((r) => ((r.pred <= 0) === (r.actual <= 0) ? 1 : 0)))),
    }];
  });
  // Probability calibration: races binned by the forecast P(D), against how often the Democrat won.
  const edges = [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1.0001];
  const calibration = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const inBin = OFFICES.flatMap((office) => rowsByOffice[office].map((r) => ({ p: Math.max(0.005, Math.min(0.995, Phi(-r.pred / liveSigma(office, r)))), won: r.actual <= 0 ? 1 : 0 }))).filter((x) => x.p >= lo && x.p < hi);
    return { lo, hi: Math.min(1, hi), n: inBin.length, meanP: inBin.length ? r3(mean(inBin.map((x) => x.p))) : null, demWon: inBin.length ? r3(mean(inBin.map((x) => x.won))) : null };
  });
  const variants: [string, { inc?: boolean; ff?: boolean; env?: boolean; quality?: boolean }][] = [
    ["Full model", {}], ["No candidates", { quality: true }], ["No fundraising", { ff: true }], ["No incumbency", { inc: true }], ["No environment", { env: true }], ["Lean only", { inc: true, ff: true, env: true, quality: true }],
  ];
  const ablation = variants.map(([name, drop]) => {
    const mae: Record<string, number | null> = {};
    for (const office of OFFICES) {
      const errs: number[] = [];
      for (const Y of YEARS) { const E = envEstimate("struct", Y); if (E == null) continue; for (const x of predsByYear.get(Y)!.filter((p) => p.office === office)) errs.push(Math.abs(x.actual - predOf(x, E, drop))); }
      mae[office] = errs.length ? r2(mean(errs)) : null;
    }
    return { variant: name, mae };
  });
  // Model / poll average / blend at the LIVE POLL_K, polls averaged as of three dates (no aging, no house effects).
  const pollFile = path.join(process.cwd(), "data-entry", "race_polls_history.csv");
  const polls: { horizon: string; office: string; polled: number; all: number; maeModel: number; maePoll: number; maeBlend: number; meanW: number }[] = [];
  if (fs.existsSync(pollFile)) {
    const split = (line: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
    const lines = fs.readFileSync(pollFile, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const hdr = split(lines[0]);
    const pollsByRace = new Map<string, RacePoll[]>();
    for (const line of lines.slice(1)) {
      const r = split(line); const c = (k: string) => r[hdr.indexOf(k)] ?? "";
      const key = `${c("year")}|${c("office")}|${c("state")}|${c("race")}`;
      const dem = Number(c("dem")), rep = Number(c("rep"));
      (pollsByRace.get(key) ?? pollsByRace.set(key, []).get(key)!).push({ pollster: c("pollster"), partisan: (c("partisan") || null) as "D" | "R" | null, startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem });
    }
    const pollKeyOf = (x: Pred) => x.office === "H" ? `${x.year}|H|${x.key.slice(0, 2)}|House ${x.key}` : `${x.year}|${x.office}|${x.key.slice(0, 2)}|${x.key.slice(3)}`;
    for (const [horizon, mmdd] of [["Mid-September", "09-15"], ["Mid-October", "10-15"], ["November 1", "11-01"]]) {
      for (const office of OFFICES) {
        const eM: number[] = [], eP: number[] = [], eB: number[] = [], ws: number[] = []; let all = 0;
        for (const Y of YEARS) {
          const E = envEstimate("struct", Y); if (E == null) continue;
          const asOf = new Date(`${Y}-${mmdd}T12:00:00Z`);
          for (const x of predsByYear.get(Y)!) {
            if (x.office !== office) continue; all++;
            const avg = computeRacePollAverage(pollsByRace.get(pollKeyOf(x)) ?? [], asOf, undefined, undefined, halfLifeOf(office)); if (!avg) continue;
            const w = pollWeight(avg.nEff, office), model = predOf(x, E);
            eM.push(Math.abs(x.actual - model)); eP.push(Math.abs(x.actual - avg.diff)); eB.push(Math.abs(x.actual - ((1 - w) * model + w * avg.diff))); ws.push(w);
          }
        }
        if (eM.length >= 10) polls.push({ horizon, office, polled: eM.length, all, maeModel: r2(mean(eM)), maePoll: r2(mean(eP)), maeBlend: r2(mean(eB)), meanW: r2(mean(ws)) });
      }
    }
  }
  const st = structModel(0);
  const out = {
    generatedAt: new Date().toISOString().slice(0, 10), years: YEARS,
    environment: { c: r2(st.c), s: r2(st.s), meanMiss: r2(st.meanMiss), sdMiss: r2(st.sdMiss), sdDrift: r2(st.sdDrift), sigmaEMidSept: r2(sigmaE(0)) },
    byYear, pooled, calibration, ablation, polls,
    horizons: horizonBacktest(HORIZON_DAYS).map((r) => ({ days: r.days, office: r.office, n: r.n, polled: r.polled, maeModel: r2(r.maeModel), mae: r2(r.mae), biasModel: r2(r.biasModel), bias: r2(r.bias), nationalSd: r2(r.nationalSd), cover80: r3(r.cover80), brier: r3(r.brier), calledRight: r3(r.calledRight), meanW: r2(r.meanW) })),
  };
  const file = path.join(process.cwd(), "data", "forecastCalibration.ts");
  fs.writeFileSync(file, `// GENERATED by \`npx tsx scripts/forwardBacktest.ts --env struct --emit\` — do not edit by hand.\n// The forward backtest behind the Calibration section of /methodology: every eligible Senate / Governor race\n// (and House races on stable lines) predicted as of mid-September from a fit on years ≤ Y−1, under the live\n// constants. Re-run after any change to the model or its data so the page keeps describing the model as it is.\nexport const FORECAST_CALIBRATION = ${JSON.stringify(out, null, 2)} as const;\n`);
  console.log(`\nwrote ${file}`);
}

if (DUMP) {
  const file = path.join(os.tmpdir(), "forwardBacktest_predictions.csv");
  // money = the live money term inside pred; gap / sg = receipts gap % and structural gap % behind it.
  const lines = ["year,office,race,actual,lean,beta,E_struct,inc,ff,quality,pred,resid,money,gap,sg,inc_sign"];
  for (const Y of YEARS) {
    const E = envEstimate("struct", Y) ?? 0;
    for (const x of predsByYear.get(Y)!) {
      const pred = predOf(x, E);
      lines.push([Y, x.office, x.key, x.actual.toFixed(2), x.lean.toFixed(2), x.beta.toFixed(3), E.toFixed(2), x.inc.toFixed(2), x.ff.toFixed(2), x.quality.toFixed(2), pred.toFixed(2), (x.actual - pred).toFixed(2),
        ffOf(x, E).toFixed(2), x.gap == null ? "" : x.gap.toFixed(2), sgOf(x, E)?.toFixed(2) ?? "", x.incSign].join(","));
    }
  }
  fs.writeFileSync(file, lines.join("\n"));
  console.log(`\nwrote ${lines.length - 1} predictions to ${file}`);
}

if (POLLSTERS) {
  // ── Pollster quality and house effects ──────────────────────────────────────
  // Does anything known about a pollster BEFORE the election improve the race poll average?
  //   · rating weights: weight × exp(−λ × score), score = the pollster's accuracy rating as it
  //     stood before year Y (data-entry/pollster_ratings_vintages.csv — never the live table,
  //     which has already seen Y's results);
  //   · historical house effect: the vintage rating's lean vs the field, subtracted;
  //   · current-cycle house effect (lib/pollsterHouseEffects.ts): the lean measured from year
  //     Y's own polls up to the as-of date, shrunk by k, optional partisan-poll prior.
  // Scored like --polls: the poll average alone and the blend at the live POLL_K, no aging.
  const split = (line: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const readCsv = (name: string) => { const ls = fs.readFileSync(path.join(process.cwd(), "data-entry", name), "utf8").split(/\r?\n/).filter((l) => l.trim()); const h = split(ls[0]); return ls.slice(1).map((l) => { const r = split(l); return (k: string) => r[h.indexOf(k)] ?? ""; }); };
  const ratingIdOf = new Map<RacePoll, string>();
  const pollsByRace = new Map<string, RacePoll[]>();
  for (const c of readCsv("race_polls_history.csv")) {
    const key = `${c("year")}|${c("office")}|${c("state")}|${c("race")}`;
    const dem = Number(c("dem")), rep = Number(c("rep"));
    const poll: RacePoll = { pollster: c("pollster"), partisan: (c("partisan") || null) as "D" | "R" | null, startDate: c("start"), endDate: c("end"), sample: c("sample") ? Number(c("sample")) : null, population: c("population") || null, dem, rep, diff: rep - dem };
    ratingIdOf.set(poll, c("pollster_id"));
    (pollsByRace.get(key) ?? pollsByRace.set(key, []).get(key)!).push(poll);
  }
  const vintage = new Map<string, { score: number; house: number; n: number }>();
  for (const c of readCsv("pollster_ratings_vintages.csv")) vintage.set(`${c("as_of")}|${c("pollster_id")}`, { score: Number(c("score")), house: Number(c("house")), n: Number(c("n")) });
  const pollKeyOf = (x: Pred) => x.office === "H" ? `${x.year}|H|${x.key.slice(0, 2)}|House ${x.key}` : `${x.year}|${x.office}|${x.key.slice(0, 2)}|${x.key.slice(3)}`;
  const horizons: [string, string][] = [["mid-Sept", "09-15"], ["mid-Oct", "10-15"], ["Nov 1", "11-01"]];
  interface Variant { name: string; lambda?: number; histHouse?: number; cycle?: { k: number; partisanPrior: number; windowDays?: number; cap?: number } }
  const variants: Variant[] = [
    { name: "baseline (no pollster information)" },
    { name: "rating weights λ 0.5", lambda: 0.5 }, { name: "rating weights λ 1", lambda: 1 }, { name: "rating weights λ 2", lambda: 2 },
    { name: "historical house effect × 1", histHouse: 1 },
    ...[1, 2, 3, 5].map((k) => ({ name: `cycle house effect k ${k}`, cycle: { k, partisanPrior: 0, cap: 99 } })),
    ...[2, 3].map((pp) => ({ name: `cycle house effect k 2 · partisan prior ${pp}`, cycle: { k: 2, partisanPrior: pp, cap: 99 } })),
    ...[[2, 200], [3, 200], [2, 300], [3, 300]].map(([k, windowDays]) => ({ name: `cycle house effect k ${k} · window ${windowDays} d`, cycle: { k, partisanPrior: 0, windowDays, cap: 99 } })),
    ...[3, 4, 5, 6, 99].map((cap) => ({ name: `cycle house effect k 2 · window 200 d · cap ${cap}`, cycle: { k: 2, partisanPrior: 0, windowDays: 200, cap } })),
    { name: "cycle house effect k 2 + rating weights λ 1", lambda: 1, cycle: { k: 2, partisanPrior: 0, cap: 99 } },
  ];
  console.log(`\nPollster information in the race poll average (${pollsByRace.size} race-years; ratings as of the start of each cycle): MAE of the poll average alone / of the blend at the live POLL_K`);
  console.log("  " + "variant".padEnd(46) + horizons.map(([h]) => OFFICES.map((o) => `${h} ${o}`.padStart(16)).join("")).join(""));
  for (const v of variants) {
    const cells: string[] = [];
    for (const [, mmdd] of horizons) {
      const heCache = new Map<number, ReturnType<typeof computeHouseEffects>>();
      for (const office of OFFICES) {
        const errPoll: number[] = [], errBlend: number[] = [];
        for (const Y of YEARS) {
          const E = envEstimate("struct", Y); if (E == null) continue;
          const asOf = new Date(`${Y}-${mmdd}T12:00:00Z`);
          if (v.cycle && !heCache.has(Y)) heCache.set(Y, computeHouseEffects([...pollsByRace].filter(([k]) => k.startsWith(`${Y}|`)).map(([, polls]) => ({ polls })), asOf, v.cycle));
          const he = heCache.get(Y);
          const rating = (p: RacePoll) => vintage.get(`${Y}|${ratingIdOf.get(p)}`);
          for (const x of predsByYear.get(Y)!) {
            if (x.office !== office) continue;
            let polls = pollsByRace.get(pollKeyOf(x)) ?? [];
            // a rating weight rides on the sample term (weight ∝ √sample), normalised so no multiplier exceeds 1
            if (v.lambda) { const lam = v.lambda; polls = polls.map((p) => { const q = { ...p, sample: Math.min(p.sample ?? 800, 3000) * Math.exp(-lam * ((rating(p)?.score ?? 0) + 1.5)) ** 2 }; ratingIdOf.set(q, ratingIdOf.get(p)!); return q; }); }
            const avg = computeRacePollAverage(polls, asOf, undefined, (p) => (v.histHouse ? v.histHouse * (rating(p)?.house ?? 0) : 0) + (he ? he.of(p) : 0), halfLifeOf(office));
            if (!avg) continue;
            const w = pollWeight(avg.nEff, office);
            errPoll.push(Math.abs(x.actual - avg.diff)); errBlend.push(Math.abs(x.actual - ((1 - w) * predOf(x, E) + w * avg.diff)));
          }
        }
        cells.push(errPoll.length ? `${mean(errPoll).toFixed(2)} / ${mean(errBlend).toFixed(3)}`.padStart(16) : "—".padStart(16));
      }
    }
    console.log("  " + v.name.padEnd(46) + cells.join(""));
  }
}
