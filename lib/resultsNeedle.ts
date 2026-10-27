// The election-night needle: a race's projected final margin and total from the votes counted so
// far and the pre-election county projection (lib/countyProjection.ts, served as the priors).
// Pure and client-safe; the page runs it in the browser on every feed refresh.
//
// Per county c, with prior expected votes E and margin m, and counted votes v at margin o:
//   turnout factor  τ  = (Σ v + k_T) / (Σ E + k_T) over the counties that have finished, shrunk to 1
//   completeness    f  = min(1, v / (τ E)), 1 once the county is done
//   total           T  = v if done, else max(v, τ E)
//   shared swing    s  = Σ w (o − m) / (Σ w + k_S), with w = v f: a county weighs its counted votes
//                        times its completeness, so a county a fifth in counts a fifth of its votes
//   remainder       r  = m + s + f (o − m − s): the uncounted votes start from the prior plus the
//                        shared swing and trust the county's own deviation in proportion to how
//                        complete it is
//   margin          M  = (v o + (T − v) r) / T
// The race is the vote-weighted sum. Its sigma has a shared part — the forecast's sigma shrunk by
// the same ratio as the swing, applied to the uncounted share — and a county part, the residual
// dispersion of county swings on each county's uncounted remainder, independent across counties.
// A county the feed marks 100% reported, or whose count has reached NEAR_DONE of its corrected
// expectation, is done. Without county detail the same arithmetic runs on the race's one total.
//
// The feed's race-level "percent reporting" is precinct-based and runs far ahead of the vote (in
// the real 2025 Virginia snapshots 70% reporting was 42% of the final vote), so it is not the
// basis of anything here beyond the race-is-complete case.
//
// Calibrated 2026-10-25 on civicAPI's snapshot histories of the 2025 Virginia and New Jersey
// governor races (scripts/resultsNeedleBacktest.ts): the shared and county terms alone covered
// the final margin 8% of the time at the 80% band, because the votes counted last are unlike the
// rest (VA's last 2% ran ~D+80); a late-vote sigma proportional to the uncounted share fixes it.
// Recalibrated 2026-10-26 once Virginia's 34 independent cities (sent as "Alexandria City" with
// no FIPS) matched their priors: unmatched, they had looked like a fifth of the state still out,
// and that phantom remainder was what kept the late band wide. Matched, the late votes land after
// every county looks done, so a floor of SIGMA_FLOOR holds until the race is complete (coverage
// 92%, 97% in the last tenth; RMS z 0.83; MAE 2.1).

import type { CountyPrior, CountyProjection, LiveCounty, LiveRace, Party, RacePrior, RaceProjection } from "@/lib/resultsTypes";

/** Shrinkage on the shared swing, as a share of the race's expected votes (prior-equivalent votes). */
export const K_SWING_SHARE = 0.1;
/** Shrinkage on the turnout factor, as a share of the race's expected votes. */
export const K_TURNOUT_SHARE = 0.1;
/** Residual dispersion of one county's swing around the shared swing, in points. */
export const SIGMA_COUNTY = 6;
/** A county whose count has reached this share of its corrected expectation is treated as done. */
export const NEAR_DONE = 0.97;
/** Below this counted share the race-level projection is just the prior. */
export const MIN_SHARE = 0.002;
/** Floor on a projected race's sigma, in points, until the race is complete: the late mail and
 *  provisionals land after the counties look done. */
export const SIGMA_FLOOR = 1.5;
/** Floor once the feed has the race complete (100% reporting, or called at 99%+). */
export const SIGMA_FLOOR_DONE = 0.3;
/** How fast a county's uncounted remainder trusts the county's own deviation from prior + swing:
 *  the weight is completeness ^ OWN_WEIGHT_EXP (1 = in proportion to completeness; smaller = sooner). */
export const OWN_WEIGHT_EXP = 1;
/** The late-vote term: sigma added per unit of uncounted share, in points, for the votes counted
 *  last being unlike the rest (mail, provisionals, the big counties' final batches). */
export const SIGMA_LATE = 10;
/** Above this share of the county rows' votes in rows that match no prior county, the race is
 *  projected from its topline (the feed's geography doesn't line up with the priors'). */
export const MAX_EXTRA_SHARE = 0.25;

/** The tunable constants, overridable for the backtest (scripts/resultsNeedleBacktest.ts). */
export type NeedleParams = { kSwing: number; kTurnout: number; sigmaCounty: number; nearDone: number; sigmaFloor: number; ownExp: number; sigmaLate: number; maxExtraShare: number };
export const DEFAULT_PARAMS: NeedleParams = { kSwing: K_SWING_SHARE, kTurnout: K_TURNOUT_SHARE, sigmaCounty: SIGMA_COUNTY, nearDone: NEAR_DONE, sigmaFloor: SIGMA_FLOOR, ownExp: OWN_WEIGHT_EXP, sigmaLate: SIGMA_LATE, maxExtraShare: MAX_EXTRA_SHARE };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

const marginOf = (dem: number, rep: number, total: number) => (total > 0 ? ((rep - dem) / total) * 100 : null);

function emptyProjection(prior: RacePrior): RaceProjection {
  return {
    tier: "none", counted: 0, projectedTotal: prior.votes, countedShare: 0, currentMargin: null, swing: 0, turnoutFactor: 1,
    margin: prior.forecast.margin, sigma: prior.forecast.sigma, probD: prior.forecast.probability, locked: false, winner: null,
    counties: prior.counties.map((c) => ({ fips: c.fips, name: c.name, counted: 0, expected: c.votes, done: false, f: 0, observedMargin: null, priorMargin: c.margin, projectedTotal: c.votes, projectedMargin: c.margin })),
  };
}

function lock(p: RaceProjection, live: LiveRace): RaceProjection {
  if (!live.called || !live.winner) return p;
  return { ...p, locked: true, winner: live.winner, probD: live.winner === "D" ? 1 : live.winner === "R" ? 0 : p.probD };
}

/** Project one race. `live` null or with nothing counted returns the prior itself. */
export function projectRace(prior: RacePrior, live: LiveRace | null, P: NeedleParams = DEFAULT_PARAMS): RaceProjection {
  if (!live || live.total <= 0) return live ? lock(emptyProjection(prior), live) : emptyProjection(prior);
  const decided = prior.forecast.contest !== "contested";
  const raceDone = live.percentReporting >= 100 || live.called && live.percentReporting >= 99;
  const E = Math.max(1, prior.votes);
  const kS = P.kSwing * E, kT = P.kTurnout * E;
  const sigmaF = prior.forecast.sigma;
  const liveCounties = live.counties;
  const byFips = liveCounties ? new Map(liveCounties.filter((c) => c.fips).map((c) => [c.fips!, c])) : null;
  // County detail counts when it covers most of the race's expected vote (a township-only state
  // or a feed hiccup falls back to the topline).
  const covered = byFips ? prior.counties.reduce((a, c) => a + (byFips.has(c.fips) ? c.votes : 0), 0) / E : 0;
  if (!byFips || covered < 0.6) return lock(projectTopline(prior, live, raceDone, kS, sigmaF, decided, P), live);

  // Pass 1: turnout factor from finished counties (feed flag or ≥ NEAR_DONE of the expectation, which
  // is circular in τ, so two passes).
  const rows = prior.counties.map((c) => ({ prior: c, live: byFips.get(c.fips) ?? null }));
  const countedOf = (l: LiveCounty | null, c: CountyPrior) => (l ? l.total * (c.share < 0.999 && WHOLE_COUNTY_FEED ? c.share : 1) : 0);
  // Feed rows that match no prior county (a county the district's pieces leave out, a region the
  // parser doesn't know) still hold counted votes: carried as they are, at their own margin, so the
  // count adds up to the race's. If they are a large share of the county rows the feed's
  // geography isn't ours, and county rows adding to clearly more than the race's own count are the
  // same votes listed twice (New England sends counties and towns side by side): either way the
  // topline is the safer basis.
  const priorFips = new Set(prior.counties.map((c) => c.fips));
  // Only rows of a type that also matched count: a level the priors don't use at all (Connecticut's
  // planning regions beside its counties) is the same votes again.
  const matchedTypes = new Set(liveCounties!.filter((c) => c.fips && priorFips.has(c.fips)).map((c) => c.type));
  const extras = liveCounties!.filter((c) => !(c.fips && priorFips.has(c.fips)) && c.total > 0 && matchedTypes.has(c.type));
  const extraV = extras.reduce((a, c) => a + c.total, 0), extraNetR = extras.reduce((a, c) => a + (c.rep - c.dem) * 100, 0);
  const matchedV = rows.reduce((a, { prior: c, live: l }) => a + countedOf(l, c), 0);
  // The double-listing test is on the two-party vote: the race-level and county lists can differ
  // on minor candidates and write-ins, never on these two.
  const twoParty = (l: { dem: number; rep: number } | null) => (l ? l.dem + l.rep : 0);
  const listedDR = rows.reduce((a, { live: l }) => a + twoParty(l), 0) + extras.reduce((a, c) => a + twoParty(c), 0);
  if (extraV > P.maxExtraShare * (matchedV + extraV) || listedDR > twoParty(live) * 1.02 + 100) return lock(projectTopline(prior, live, raceDone, kS, sigmaF, decided, P), live);
  let tau = 1;
  for (let pass = 0; pass < 2; pass++) {
    let v = 0, e = 0;
    for (const { prior: c, live: l } of rows) {
      const counted = countedOf(l, c);
      const done = raceDone || (l?.pct != null && l.pct >= 100) || counted >= P.nearDone * tau * c.votes;
      if (done && counted > 0) { v += counted; e += c.votes; }
    }
    tau = e > 0 ? (v + kT) / (e + kT) : 1;
  }
  tau = clamp(tau, 0.5, 1.6);

  // Pass 2: completeness, weights, shared swing.
  let sumW = 0, sumWD = 0, counted = 0;
  const cells = rows.map(({ prior: c, live: l }) => {
    const v = countedOf(l, c);
    const expected = tau * c.votes;
    const done = raceDone || (l?.pct != null && l.pct >= 100) || v >= P.nearDone * expected;
    const f = done ? 1 : clamp(v / Math.max(1, expected), 0, 1);
    const o = l ? marginOf(l.dem, l.rep, l.total) : null;
    counted += v;
    if (o != null && v > 0 && !decided) { const w = v * f; sumW += w; sumWD += w * (o - c.margin); }
    return { c, v, expected, done, f, o };
  });
  const swing = decided ? 0 : sumWD / (sumW + kS);
  const shrink = Math.sqrt(kS / (kS + sumW));

  let total = 0, netR = 0, countyVar = 0;
  const counties: CountyProjection[] = cells.map(({ c, v, expected, done, f, o }) => {
    const T = done ? v : Math.max(v, expected);
    const remainder = o == null ? c.margin + swing : c.margin + swing + Math.pow(f, P.ownExp) * (o - c.margin - swing);
    const M = T > 0 ? (v * (o ?? 0) + (T - v) * clamp(remainder, -100, 100)) / T : c.margin;
    total += T; netR += T * M;
    countyVar += Math.pow((T - v) * P.sigmaCounty, 2);
    return { fips: c.fips, name: c.name, counted: Math.round(v), expected: Math.round(expected), done, f, observedMargin: o, priorMargin: c.margin, projectedTotal: Math.round(T), projectedMargin: M };
  });
  counted += extraV; total += extraV; netR += extraNetR;
  // A finished race is its feed total, whatever the county rows add to (a lagging or partial
  // county breakdown must not leave it "48% of ~N projected" at 100% reporting).
  if (raceDone) total = counted = live.total;
  const margin = total > 0 ? netR / total : prior.forecast.margin;
  const uncounted = total > 0 ? clamp((total - counted) / total, 0, 1) : 1;
  const sharedSigma = sigmaF * shrink * uncounted;
  const countySigma = total > 0 ? Math.sqrt(countyVar) / total : 0;
  const lateSigma = P.sigmaLate * uncounted;
  const sigma = Math.max(raceDone ? SIGMA_FLOOR_DONE : P.sigmaFloor, Math.sqrt(sharedSigma * sharedSigma + countySigma * countySigma + lateSigma * lateSigma));
  const probD = decided ? prior.forecast.probability : normalCdf(-margin / sigma);
  return lock({
    tier: "county", counted: Math.round(counted), projectedTotal: Math.round(total), countedShare: total > 0 ? counted / total : 0,
    currentMargin: marginOf(live.dem, live.rep, live.total), swing, turnoutFactor: tau, margin, sigma, probD, locked: false, winner: null, counties,
  }, live);
}

// A House race's feed county is the district's piece already (the feed lists the counties the
// district touches with the district's own votes), so its count is never scaled by the share.
// Set for a feed that sends whole-county totals instead.
const WHOLE_COUNTY_FEED = false;

function projectTopline(prior: RacePrior, live: LiveRace, raceDone: boolean, kS: number, sigmaF: number, decided: boolean, P: NeedleParams): RaceProjection {
  const E = Math.max(1, prior.votes);
  const v = live.total;
  const o = marginOf(live.dem, live.rep, live.total) ?? prior.forecast.margin;
  const m = prior.forecast.margin;
  const f = raceDone ? 1 : clamp(v / E, 0, 1);
  const T = raceDone ? v : Math.max(v, E);
  const w = decided ? 0 : v * f;
  const swing = w / (w + kS) * (o - m);
  const shrink = Math.sqrt(kS / (kS + w));
  const remainder = m + swing + Math.pow(f, P.ownExp) * (o - m - swing);
  const margin = f < MIN_SHARE ? m : (v * o + (T - v) * clamp(remainder, -100, 100)) / T;
  const uncounted = clamp((T - v) / T, 0, 1);
  const sigma = Math.max(raceDone ? SIGMA_FLOOR_DONE : P.sigmaFloor, Math.sqrt(Math.pow(sigmaF * shrink * uncounted, 2) + Math.pow(P.sigmaCounty * uncounted * 0.5, 2) + Math.pow(P.sigmaLate * uncounted, 2)));
  const probD = decided ? prior.forecast.probability : normalCdf(-margin / sigma);
  return {
    tier: "topline", counted: v, projectedTotal: Math.round(T), countedShare: T > 0 ? v / T : 0, currentMargin: marginOf(live.dem, live.rep, live.total),
    swing, turnoutFactor: 1, margin, sigma, probD, locked: false, winner: null,
    counties: prior.counties.map((c) => ({ fips: c.fips, name: c.name, counted: 0, expected: c.votes, done: false, f: 0, observedMargin: null, priorMargin: c.margin, projectedTotal: c.votes, projectedMargin: c.margin + swing })),
  };
}

// ── Chamber roll-ups ──────────────────────────────────────────────────────────

export type ChamberTally = {
  /** Seats the feed has called. */
  called: { dem: number; rep: number; ind: number };
  /** Called plus the current leader of every race with votes in. */
  leading: { dem: number; rep: number; ind: number };
  /** Called plus the needle's projected winner of every other race (the prior where nothing is in). */
  projected: { dem: number; rep: number; ind: number };
  /** Expected Democratic seats by the needle's probabilities, with an 80% band from a normal approximation. */
  expectedDem: { mean: number; lo80: number; hi80: number };
  flips: { id: string; from: Party; to: Party; status: "called" | "projected" | "leading" }[];
  racesIn: number;
  racesCalled: number;
  popular: { dem: number; rep: number; oth: number; total: number; projectedTotal: number };
};

export function tallyChamber(rows: { prior: RacePrior; live: LiveRace | null; proj: RaceProjection }[], holdover: { dem: number; rep: number }): ChamberTally {
  const called = { dem: holdover.dem, rep: holdover.rep, ind: 0 }, leading = { dem: holdover.dem, rep: holdover.rep, ind: 0 }, projected = { dem: holdover.dem, rep: holdover.rep, ind: 0 };
  const flips: ChamberTally["flips"] = [];
  let mean = 0, variance = 0, racesIn = 0, racesCalled = 0;
  const popular = { dem: 0, rep: 0, oth: 0, total: 0, projectedTotal: 0 };
  const add = (t: { dem: number; rep: number; ind: number }, p: Party) => { if (p === "D") t.dem++; else if (p === "R") t.rep++; else t.ind++; };
  for (const { prior, live, proj } of rows) {
    const sideParty = (r: boolean) => (r ? prior.rep.party : prior.dem.party);
    const projWinner: Party = proj.locked && proj.winner ? proj.winner : sideParty(proj.margin > 0);
    add(projected, projWinner);
    if (proj.locked && proj.winner) { add(called, proj.winner); add(leading, proj.winner); racesCalled++; }
    else if (live && live.total > 0 && proj.currentMargin != null) add(leading, sideParty(proj.currentMargin > 0));
    if (live && live.total > 0) racesIn++;
    const pD = proj.locked && proj.winner ? (proj.winner === "D" ? 1 : 0) : proj.probD;
    mean += pD; variance += pD * (1 - pD);
    if (prior.seatParty && projWinner !== prior.seatParty && (proj.locked || (live && live.total > 0))) {
      flips.push({ id: prior.id, from: prior.seatParty, to: projWinner, status: proj.locked ? "called" : "projected" });
    }
    if (live) { popular.dem += live.dem; popular.rep += live.rep; popular.oth += live.oth; popular.total += live.total; }
    popular.projectedTotal += proj.projectedTotal;
  }
  const sd = Math.sqrt(variance);
  return {
    called, leading, projected,
    expectedDem: { mean: holdover.dem + mean, lo80: holdover.dem + mean - 1.2816 * sd, hi80: holdover.dem + mean + 1.2816 * sd },
    flips, racesIn, racesCalled, popular,
  };
}
