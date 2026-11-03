// The election-night swing model: what the counties that have (mostly) finished counting, across
// every race, say about the ones still out. Pure and client-safe; the Results page fits it once
// per feed refresh, before any race is projected (lib/resultsNeedle.ts reads the fit).
//
// Each finished county's swing against its prior, y = o − m, is explained by terms the races share:
//
//   y = β_state · g  +  d_office  +  s_state  +  b_nw · x_nw + b_col · x_col + b_lean · x_lean  +  ε
//
//   g        the national swing, carried into every state through its elasticity β (the forecast's)
//   d_office an office's own offset (the House running redder than the Senate)
//   s_state  the state's shared miss, which the Senate, governor and House races in a state all see
//   b·x      how the swing varies with a county's electorate: its nonwhite share, college share and
//            prior lean, each centered on the national electorate and in units of 10 pts
//
// Every term is a Bayesian ridge: a zero-mean prior with its own sigma (the constants below), so a
// state with two counties in borrows the national swing and a demographic slope stays near zero until
// counties of varied makeup are in. The fit is weighted least squares with a county counting up to
// one (VOTES_SAT votes or more) and only once it is at least MIN_COMPLETE counted — the votes counted
// first are unlike the rest. The posterior covariance gives each race's implied shift a standard error,
// wider for a state no county of which has reported and for electorates unlike the ones observed.
//
// A race with nothing counted is projected at its prior plus this fit's shift for it; a race that is
// counting starts its uncounted counties from the same baseline and then adds its own residual swing
// the way the needle always has (lib/resultsNeedle.ts).
//
// The early-vote term (2026-11-02). The votes a county posts first are unlike its final count — the
// mail, counted first in most states, leans more Democratic; where election-day votes come first the
// first count leans Republican and the mail lands later — so a county's counted margin at completeness
// f is its final less about s (1 − f), with s the state's skew. Read naively, every part-counted county
// pulls a race the wrong way until it finishes. s is learned per state from the counties with votes in
// (all of them, not only the ones in the main fit): within each race, counties further along show less
// of the skew, so s is the within-race weighted regression of a county's residual on (f − 1). It is
// hierarchical: a national skew pooled over every state (shrunk toward zero, SIGMA_MIRAGE), and each
// state's own shrunk toward that, so a state whose counties are just starting is read with what the
// earlier states showed. The needle then reads a part-counted county's remainder as o + s rather than
// o, and its implied final as o + s (1 − f). Positive s = the first votes lean Democratic.
//
// Calibrated on a replay of the 2018–2024 Senate, governor and House results reported in a simulated
// order (scripts/resultsNightBacktest.ts); see /analysis/internal-methodology/turnout#results-night.

import type { CountyPrior, RacePrior, ResultsOffice } from "@/lib/resultsTypes";

/** Prior sigma on the national swing (per unit of β), in points. Below the size of a poll miss (the
 *  forecast's σ_E 3) so the term stays nearer zero while few states are in: at 3 the band ran
 *  over-confident late in the replay, at 2 the error is the same and the coverage is back. */
export const SIGMA_NATIONAL = 2;
/** Prior sigma on a state's shared miss beyond the national swing. */
export const SIGMA_STATE = 2.5;
/** Prior sigma on an office's offset from the national swing. */
export const SIGMA_OFFICE = 1;
/** Prior sigma on the swing's slope per 10 pts of a county's nonwhite share. Half the forecast's
 *  demographic shock: on the replay, slopes free to reach it cost calibration without lowering the error. */
export const SIGMA_NONWHITE = 0.75;
/** Prior sigma on the slope per 10 pts of college share. */
export const SIGMA_COLLEGE = 0.5;
/** Prior sigma on the slope per 10 pts of the county's prior margin. */
export const SIGMA_LEAN = 0.5;
/** Noise sigma of one fully-weighted county's swing around the shared terms. */
export const SIGMA_FIT_COUNTY = 6;
/** Counted votes at which a county carries full weight in the fit (smaller counties pro rata). */
export const VOTES_SAT = 20_000;
/** Prior sigma on a state's early-vote skew s, in points: how far the votes a county posts first run from
 *  its final count. */
export const SIGMA_MIRAGE = 3;
/** A county enters the fit once this share of its corrected expectation is counted. 0.5 and 0.8 score
 *  alike under the replay's usual early-vote skew; with the skew doubled (a 2020-sized mail mirage)
 *  0.5 reads the national swing too Democratic and 0.8 holds. */
export const MIN_COMPLETE = 0.8;

export type NightParams = {
  sigmaNational: number; sigmaState: number; sigmaOffice: number;
  sigmaNonwhite: number; sigmaCollege: number; sigmaLean: number;
  sigmaFitCounty: number; votesSat: number; minComplete: number; sigmaMirage: number;
};
export const DEFAULT_NIGHT_PARAMS: NightParams = {
  sigmaNational: SIGMA_NATIONAL, sigmaState: SIGMA_STATE, sigmaOffice: SIGMA_OFFICE,
  sigmaNonwhite: SIGMA_NONWHITE, sigmaCollege: SIGMA_COLLEGE, sigmaLean: SIGMA_LEAN,
  sigmaFitCounty: SIGMA_FIT_COUNTY, votesSat: VOTES_SAT, minComplete: MIN_COMPLETE, sigmaMirage: SIGMA_MIRAGE,
};

/** One county's count so far against its prior: an observation for the fit (the shared terms read it
 *  once it is MIN_COMPLETE counted; the early-vote term reads every county with votes). */
export type NightObservation = {
  office: ResultsOffice;
  state: string;
  /** The race it belongs to (office + id), for the within-race contrast behind the early-vote term. */
  race: string;
  beta: number;
  county: CountyPrior;
  /** Counted votes. */
  votes: number;
  /** Completeness, 0–1. */
  f: number;
  /** Counted margin minus the prior margin, R-positive points. */
  swing: number;
};

/** A race's implied shift before its own counties count: the fit's prediction for it, by part. */
export type NightShift = {
  /** The whole shift, R-positive points: national + state + office + demo. */
  shift: number;
  national: number;
  state: number;
  office: number;
  /** The demographic terms at the race's vote-weighted average county. */
  demo: number;
  /** Posterior standard error of the shift. */
  se: number;
  /** The same terms' standard error before any county reported: what the prior said was shared. */
  priorSe: number;
  /** A county's demographic term (beyond the race average), for its own remainder. */
  countyDemo: (c: CountyPrior) => number;
};

export type NightFit = {
  /** Effective counties in the fit (weights summed) and the counted votes behind them. */
  n: number;
  votes: number;
  /** The national swing per unit of β, with its standard error. */
  national: { value: number; se: number };
  office: Record<ResultsOffice, { value: number; se: number }>;
  slopes: { nonwhite: { value: number; se: number }; college: { value: number; se: number }; lean: { value: number; se: number } };
  /** States with at least one county in the fit. */
  states: Record<string, { value: number; se: number; n: number }>;
  /** Each state's early-vote skew s (positive = the first votes lean Democratic), with its standard
   *  error and the weight of part-counted counties behind it. */
  mirage: Record<string, { value: number; se: number; n: number }>;
  /** The national early-vote skew every state's is shrunk toward. */
  mirageNational: { value: number; se: number; n: number };
  shiftFor: (race: RacePrior) => NightShift;
  /** A state's early-vote skew; the national one, with the prior's sigma added, where no county of it is part-counted. */
  mirageFor: (state: string) => { value: number; se: number };
};

const OFFICES: ResultsOffice[] = ["senate", "governor", "house"];

/** The fit with no counties in: every race's shift is zero with the prior's standard error. */
export function emptyNightFit(P: NightParams = DEFAULT_NIGHT_PARAMS): NightFit {
  return fitNight([], P);
}

/** Weight of one county's observation: full at VOTES_SAT votes, pro rata below, zero until MIN_COMPLETE counted. */
export function observationWeight(votes: number, f: number, P: NightParams = DEFAULT_NIGHT_PARAMS): number {
  if (f < P.minComplete || votes <= 0) return 0;
  return Math.min(1, votes / P.votesSat);
}

/**
 * Fit the shared terms to the counties in. Columns: national (β), the three offices, the three
 * demographic slopes, then one per state seen. Solved as a Bayesian ridge: Σ = (XᵀWX/σ_c² + K)⁻¹,
 * θ = Σ XᵀWy/σ_c², K the prior precisions.
 */
export function fitNight(obs: NightObservation[], P: NightParams = DEFAULT_NIGHT_PARAMS): NightFit {
  const stateIndex = new Map<string, number>();
  const stateN: Record<string, number> = {};
  for (const o of obs) if (observationWeight(o.votes, o.f, P) > 0 && !stateIndex.has(o.state)) stateIndex.set(o.state, stateIndex.size);
  const FIXED = 7; // national, 3 offices, 3 slopes
  const k = FIXED + stateIndex.size;
  const colOf = (o: { office: ResultsOffice; state: string }) => ({ office: 1 + OFFICES.indexOf(o.office), state: stateIndex.has(o.state) ? FIXED + stateIndex.get(o.state)! : -1 });
  const row = (beta: number, office: number, state: number, c: { nonwhite: number; college: number; lean: number }): number[] => {
    const x = new Array<number>(k).fill(0);
    x[0] = beta; x[office] = 1; x[4] = c.nonwhite; x[5] = c.college; x[6] = c.lean;
    if (state >= 0) x[state] = 1;
    return x;
  };
  // Prior precisions.
  const prec = new Array<number>(k).fill(1 / (P.sigmaState * P.sigmaState));
  prec[0] = 1 / (P.sigmaNational * P.sigmaNational);
  prec[1] = prec[2] = prec[3] = 1 / (P.sigmaOffice * P.sigmaOffice);
  prec[4] = 1 / (P.sigmaNonwhite * P.sigmaNonwhite); prec[5] = 1 / (P.sigmaCollege * P.sigmaCollege); prec[6] = 1 / (P.sigmaLean * P.sigmaLean);
  // Normal equations.
  const A = Array.from({ length: k }, (_, i) => { const r = new Array<number>(k).fill(0); r[i] = prec[i]; return r; });
  const b = new Array<number>(k).fill(0);
  const noise = P.sigmaFitCounty * P.sigmaFitCounty;
  let n = 0, votes = 0;
  for (const o of obs) {
    const w = observationWeight(o.votes, o.f, P);
    if (w <= 0) continue;
    const { office, state } = colOf(o);
    const x = row(o.beta, office, state, o.county);
    const wn = w / noise;
    for (let i = 0; i < k; i++) {
      if (x[i] === 0) continue;
      const xi = x[i] * wn;
      b[i] += xi * o.swing;
      for (let j = 0; j < k; j++) if (x[j] !== 0) A[i][j] += xi * x[j];
    }
    n += w; votes += o.votes; stateN[o.state] = (stateN[o.state] ?? 0) + w;
  }
  const cov = invertSpd(A);
  const theta = cov.map((r) => r.reduce((a, v, j) => a + v * b[j], 0));
  const se = (i: number) => Math.sqrt(Math.max(0, cov[i][i]));
  const states: NightFit["states"] = {};
  for (const [st, i] of stateIndex) states[st] = { value: theta[FIXED + i], se: se(FIXED + i), n: stateN[st] ?? 0 };

  // The early-vote term: per state, the within-race weighted regression of each county's residual
  // (its swing less the shared terms' prediction for it) on x = f − 1, over every county with votes.
  // Finished counties (x = 0) anchor each race's level; the part-counted ones carry the contrast.
  const byRace = new Map<string, { state: string; rows: { x: number; e: number; w: number }[] }>();
  for (const o of obs) {
    if (o.votes <= 0) continue;
    const w = Math.min(1, o.votes / P.votesSat);
    const { office, state } = colOf(o);
    const pred = o.beta * theta[0] + theta[office] + (state >= 0 ? theta[state] : 0) + o.county.nonwhite * theta[4] + o.county.college * theta[5] + o.county.lean * theta[6];
    const g = byRace.get(o.race) ?? { state: o.state, rows: [] };
    g.rows.push({ x: Math.min(0, o.f - 1), e: o.swing - pred, w });
    byRace.set(o.race, g);
  }
  const acc: Record<string, { sxx: number; sxy: number; n: number }> = {};
  for (const { state, rows } of byRace.values()) {
    let W = 0, mx = 0, me = 0;
    for (const r of rows) { W += r.w; mx += r.w * r.x; me += r.w * r.e; }
    if (W <= 0) continue;
    mx /= W; me /= W;
    const a = (acc[state] ??= { sxx: 0, sxy: 0, n: 0 });
    for (const r of rows) { a.sxx += r.w * (r.x - mx) * (r.x - mx); a.sxy += r.w * (r.x - mx) * (r.e - me); if (r.x < 0) a.n += r.w; }
  }
  const lambda = noise / (P.sigmaMirage * P.sigmaMirage);
  let txx = 0, txy = 0, tn = 0;
  for (const a of Object.values(acc)) { txx += a.sxx; txy += a.sxy; tn += a.n; }
  const mirageNational = { value: txy / (txx + lambda), se: Math.sqrt(noise / (txx + lambda)), n: tn };
  const mirage: NightFit["mirage"] = {};
  for (const [st, a] of Object.entries(acc)) if (a.n > 0) {
    const pull = lambda / (a.sxx + lambda);
    mirage[st] = { value: mirageNational.value + (a.sxy - a.sxx * mirageNational.value) / (a.sxx + lambda), se: Math.sqrt(noise / (a.sxx + lambda) + (pull * mirageNational.se) ** 2), n: a.n };
  }
  const mirageFor = (state: string) => mirage[state] ?? { value: mirageNational.value, se: Math.sqrt(mirageNational.se ** 2 + P.sigmaMirage ** 2) };

  const quad = (x: number[], M: number[][]) => { let s = 0; for (let i = 0; i < x.length; i++) { if (x[i] === 0) continue; for (let j = 0; j < x.length; j++) if (x[j] !== 0) s += x[i] * M[i][j] * x[j]; } return s; };
  const shiftFor = (race: RacePrior): NightShift => {
    const { office, state } = colOf(race);
    // The race's average county, vote-weighted.
    let W = 0, nw = 0, col = 0, lean = 0;
    for (const c of race.counties) { W += c.votes; nw += c.votes * c.nonwhite; col += c.votes * c.college; lean += c.votes * c.lean; }
    const avg = W > 0 ? { nonwhite: nw / W, college: col / W, lean: lean / W } : { nonwhite: 0, college: 0, lean: 0 };
    const x = row(race.beta, office, state, avg);
    const national = race.beta * theta[0], off = theta[office];
    const demo = avg.nonwhite * theta[4] + avg.college * theta[5] + avg.lean * theta[6];
    const st = state >= 0 ? theta[state] : 0;
    // A state with nothing in keeps its prior variance (its column is not in the fit).
    const variance = quad(x, cov) + (state >= 0 ? 0 : P.sigmaState * P.sigmaState);
    const priorVar = x.reduce((a, v, i) => a + v * v / prec[i], 0) + (state >= 0 ? 0 : P.sigmaState * P.sigmaState);
    return {
      shift: national + off + st + demo, national, office: off, state: st, demo,
      se: Math.sqrt(Math.max(0, variance)), priorSe: Math.sqrt(priorVar),
      countyDemo: (c) => (c.nonwhite - avg.nonwhite) * theta[4] + (c.college - avg.college) * theta[5] + (c.lean - avg.lean) * theta[6],
    };
  };
  return {
    n, votes,
    national: { value: theta[0], se: se(0) },
    office: { senate: { value: theta[1], se: se(1) }, governor: { value: theta[2], se: se(2) }, house: { value: theta[3], se: se(3) } },
    slopes: { nonwhite: { value: theta[4], se: se(4) }, college: { value: theta[5], se: se(5) }, lean: { value: theta[6], se: se(6) } },
    states, mirage, mirageNational, shiftFor, mirageFor,
  };
}

/** Inverse of a symmetric positive-definite matrix by Cholesky (the ridge keeps it well away from singular). */
function invertSpd(A: number[][]): number[][] {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let m = 0; m < j; m++) s -= L[i][m] * L[j][m];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  // Solve L Lᵀ X = I column by column.
  const inv = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let c = 0; c < n; c++) {
    const y = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) { let s = i === c ? 1 : 0; for (let m = 0; m < i; m++) s -= L[i][m] * y[m]; y[i] = s / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let m = i + 1; m < n; m++) s -= L[m][i] * inv[m][c]; inv[i][c] = s / L[i][i]; }
  }
  return inv;
}
