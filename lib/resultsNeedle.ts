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
//   remainder       r  = m + s + f² (o − m − s): the uncounted votes start from the prior plus the
//                        shared swing and trust the county's own deviation by the square of how
//                        complete it is (a county a third in gets a tenth of it)
//   margin          M  = (v o + (T − v) r) / T
// The race is the vote-weighted sum. Its sigma has a shared part — the forecast's sigma shrunk by
// the same ratio as the swing, applied to the uncounted share — and a county part, the residual
// dispersion of county swings on each county's uncounted remainder, independent across counties.
//
// Since 2026-11-01 the prior margin m is first moved by the night model (lib/resultsNight.ts): the
// shift the counties finished elsewhere imply for this race (national swing × β, the state's shared
// miss, the office's offset, the demographic slopes at each county), fitted once per refresh over
// every race. The swing s above is then the race's OWN residual against that baseline, and the
// forecast sigma is split into the part the night model explains (replaced by the fit's standard
// error for this race) and the race's own part (shrunk by its own counted votes as before). A race
// with nothing counted is its prior plus the shift.
// Since 2026-11-02 the fit also carries each state's early-vote skew s (the votes a county posts
// first run about s (1 − f) more Democratic than its final, positive s): a part-counted county's
// implied final is o + s (1 − f) and its remainder o + s, so the needle stops chasing the mirage.
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
// Made less sensitive 2026-11-02: the first votes a county posts lean more Democratic than its
// final (mail counted first), and the needle followed them — the simulated night's projections
// dipped several points on a race's first fifth and came back. Doubling the swing shrinkage and
// squaring the completeness weight (K_SWING_SHARE 0.2, OWN_WEIGHT_EXP 2) cut the real VA/NJ error
// at 10–60% counted by a quarter (MAE 2.1 → 1.9 overall, coverage 94%) and left the 2018–24
// replay unchanged; only the first tenth, where the prior is all there is, gets slightly worse.

import type { CountyPrior, CountyProjection, LiveCounty, LiveRace, Party, RacePrior, RaceProjection } from "@/lib/resultsTypes";
import type { NightFit, NightObservation, NightShift } from "@/lib/resultsNight";

/** Shrinkage on the shared swing, as a share of the race's expected votes (prior-equivalent votes). */
export const K_SWING_SHARE = 0.2;
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
 *  the weight is completeness ^ OWN_WEIGHT_EXP (1 = in proportion to completeness; larger = later,
 *  against the early-vote mirage). */
export const OWN_WEIGHT_EXP = 2;
/** The late-vote term: sigma added per unit of uncounted share, in points, for the votes counted
 *  last being unlike the rest (mail, provisionals, the big counties' final batches). */
export const SIGMA_LATE = 10;
/** Above this share of the county rows' votes in rows that match no prior county, the race is
 *  projected from its topline (the feed's geography doesn't line up with the priors'). */
export const MAX_EXTRA_SHARE = 0.25;

/** The share of the forecast variance the night model (lib/resultsNight.ts) may claim as shared: its
 *  prior for a race's shared terms, times this, is what the fit can take off the race's sigma. Below 1
 *  because the fit also explains county-prior noise that is not the race's own miss. */
export const NIGHT_SHARE = 0.5;

/** The tunable constants, overridable for the backtests (scripts/resultsNeedleBacktest.ts, scripts/resultsNightBacktest.ts). */
export type NeedleParams = { kSwing: number; kTurnout: number; sigmaCounty: number; nearDone: number; sigmaFloor: number; ownExp: number; sigmaLate: number; maxExtraShare: number; nightShare: number };
export const DEFAULT_PARAMS: NeedleParams = { kSwing: K_SWING_SHARE, kTurnout: K_TURNOUT_SHARE, sigmaCounty: SIGMA_COUNTY, nearDone: NEAR_DONE, sigmaFloor: SIGMA_FLOOR, ownExp: OWN_WEIGHT_EXP, sigmaLate: SIGMA_LATE, maxExtraShare: MAX_EXTRA_SHARE, nightShare: NIGHT_SHARE };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

const marginOf = (dem: number, rep: number, total: number) => (total > 0 ? ((rep - dem) / total) * 100 : null);

const ZERO_SHIFT: NightShift = { shift: 0, national: 0, state: 0, office: 0, demo: 0, se: 0, priorSe: 0, countyDemo: () => 0 };
const NO_MIRAGE = { value: 0, se: 0 };
const nightOf = (s: NightShift, mirage = NO_MIRAGE): RaceProjection["night"] => ({ shift: s.shift, national: s.national, state: s.state, office: s.office, demo: s.demo, se: s.se, mirage });

/** The parts of a race's forecast sigma: what the night model's shared terms may explain (NIGHT_SHARE
 *  of its prior variance for this race) and what is the race's own. Keeps at least a quarter of the
 *  variance for the race itself. With nothing in anywhere the two add back to the forecast sigma. */
function raceSigmaParts(prior: RacePrior, shift: NightShift, P: NeedleParams): { own: number; shared: number } {
  const total = prior.forecast.sigma ** 2;
  const own = Math.sqrt(Math.max(0.25 * total, total - P.nightShare * shift.priorSe ** 2));
  return { own, shared: Math.sqrt(P.nightShare) * shift.se };
}

/** Nothing counted in this race: the prior shifted by what the rest of the night implies. */
function emptyProjection(prior: RacePrior, shift: NightShift, P: NeedleParams): RaceProjection {
  const decided = prior.forecast.contest !== "contested";
  const s = decided ? ZERO_SHIFT : shift;
  const { own, shared } = raceSigmaParts(prior, s, P);
  const margin = prior.forecast.margin + s.shift;
  const sigma = decided ? prior.forecast.sigma : Math.sqrt(own * own + shared * shared);
  return {
    tier: "none", counted: 0, projectedTotal: prior.votes, countedShare: 0, currentMargin: null, swing: 0, turnoutFactor: 1,
    margin, sigma, probD: decided ? prior.forecast.probability : normalCdf(-margin / sigma), locked: false, winner: null, night: nightOf(s),
    counties: prior.counties.map((c) => ({ fips: c.fips, name: c.name, counted: 0, expected: c.votes, done: false, f: 0, observedMargin: null, priorMargin: c.margin, projectedTotal: c.votes, projectedMargin: c.margin + s.shift + s.countyDemo(c) })),
  };
}

/** A called race: locked to the feed's winner, and the projected margin conditioned on that call
 *  (the needle's normal truncated to the winner's side of even), so a race called for one party never
 *  shows a projection for the other. FL-22 on election night: called D at 79% counted while the needle,
 *  reading a big early-vote skew, sat at R+3.0 ± 2.5; conditioned, D+1.2. */
function lock(p: RaceProjection, live: LiveRace, prior: RacePrior): RaceProjection {
  if (!live.called || !live.winner) return p;
  const locked = { ...p, locked: true, winner: live.winner, probD: live.winner === "D" ? 1 : live.winner === "R" ? 0 : p.probD };
  // R-positive margins: the Republican side's winner is above even, the Democratic side's below.
  const side = live.winner === prior.rep.party && live.winner !== prior.dem.party ? 1 : live.winner === prior.dem.party && live.winner !== prior.rep.party ? -1 : 0;
  if (!side || !(p.sigma > 0)) return locked;
  return { ...locked, ...truncatedToSide(p.margin, p.sigma, side) };
}

/** Mean and sd of N(mu, sigma) given it falls on `side` of zero (1 = above, −1 = below). */
function truncatedToSide(mu: number, sigma: number, side: 1 | -1): { margin: number; sigma: number } {
  // Mirror to the "above zero" case: X = side · M > 0, X ~ N(side · mu, sigma).
  const m = side * mu, a = -m / sigma;
  const tail = 1 - normalCdf(a);
  // Far in the wrong tail the ratio is unstable: the conditional mean is then just past even.
  if (tail < 1e-9) return { margin: side * Math.min(sigma * 0.1, 0.5), sigma: Math.max(0.3, sigma * 0.1) };
  const lambda = (0.3989422804014327 * Math.exp(-0.5 * a * a)) / tail;
  const mean = m + sigma * lambda;
  const variance = sigma * sigma * Math.max(0, 1 + a * lambda - lambda * lambda);
  return { margin: side * mean, sigma: Math.sqrt(variance) };
}

type Cell = { c: CountyPrior; v: number; expected: number; done: boolean; f: number; o: number | null };
type CountyPass = { tau: number; cells: Cell[]; counted: number; extraV: number; extraNetR: number };

/** The county pass shared by the projection and the night fit: turnout factor, completeness and
 *  counted margin per prior county. Null where the race has to run on its topline. */
function countyPass(prior: RacePrior, live: LiveRace, raceDone: boolean, P: NeedleParams): CountyPass | null {
  const E = Math.max(1, prior.votes);
  const kT = P.kTurnout * E;
  const liveCounties = live.counties;
  const byFips = liveCounties ? new Map(liveCounties.filter((c) => c.fips).map((c) => [c.fips!, c])) : null;
  // County detail counts when it covers most of the race's expected vote (a township-only state
  // or a feed hiccup falls back to the topline).
  const covered = byFips ? prior.counties.reduce((a, c) => a + (byFips.has(c.fips) ? c.votes : 0), 0) / E : 0;
  if (!byFips || covered < 0.6) return null;

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
  // County rows adding to clearly less than the race's own count are older than it (the intake stores a
  // fresh topline over the last county detail while a big state's full payload keeps timing out): the
  // topline is the current basis.
  if (extraV > P.maxExtraShare * (matchedV + extraV) || listedDR > twoParty(live) * 1.02 + 100 || listedDR < twoParty(live) * 0.9 - 100) return null;
  let tau = 1;
  for (let pass = 0; pass < 2; pass++) {
    let v = 0, e = 0;
    for (const { prior: c, live: l } of rows) {
      const counted = countedOf(l, c);
      const done = raceDone || (l?.pct != null && l.pct >= 100 && counted >= FEED_DONE_MIN_SHARE * c.votes) || counted >= P.nearDone * tau * c.votes;
      if (done && counted > 0) { v += counted; e += c.votes; }
    }
    tau = e > 0 ? (v + kT) / (e + kT) : 1;
  }
  tau = clamp(tau, 0.5, 1.6);

  let counted = 0;
  const cells: Cell[] = rows.map(({ prior: c, live: l }) => {
    const v = countedOf(l, c);
    const expected = tau * c.votes;
    const done = raceDone || (l?.pct != null && l.pct >= 100 && v >= FEED_DONE_MIN_SHARE * c.votes) || v >= P.nearDone * expected;
    const f = done ? 1 : clamp(v / Math.max(1, expected), 0, 1);
    const o = l ? marginOf(l.dem, l.rep, l.total) : null;
    counted += v;
    return { c, v, expected, done, f, o };
  });
  return { tau, cells, counted: counted + extraV, extraV, extraNetR };
}

/** The feed's 100% counts only once the count is at least this share of the expected vote: civicAPI's
 *  percent is over the regions it lists so far, so a town-reporting state (Vermont on election night:
 *  4 towns, ~3k votes, "100%") can read complete with a sliver counted. */
export const FEED_DONE_MIN_SHARE = 0.5;
const isRaceDone = (prior: RacePrior, live: LiveRace) => (live.percentReporting >= 100 || live.called && live.percentReporting >= 99) && live.total >= FEED_DONE_MIN_SHARE * prior.votes;

/** A race's counties as observations for the night fit (lib/resultsNight.ts): every prior county with
 *  votes in, its completeness and its swing against the prior. Empty for decided races and races on their topline. */
export function nightObservations(prior: RacePrior, live: LiveRace | null, P: NeedleParams = DEFAULT_PARAMS): NightObservation[] {
  if (!live || live.total <= 0 || prior.forecast.contest !== "contested") return [];
  const pass = countyPass(prior, live, isRaceDone(prior, live), P);
  if (!pass) return [];
  const out: NightObservation[] = [];
  const race = `${prior.office}-${prior.id}`;
  for (const { c, v, f, o } of pass.cells) if (o != null && v > 0) out.push({ office: prior.office, state: prior.state, race, beta: prior.beta, county: c, votes: v, f, swing: o - c.margin });
  return out;
}

/** Project one race. `live` null or with nothing counted returns the prior shifted by the night fit
 *  (the prior itself without one). */
export function projectRace(prior: RacePrior, live: LiveRace | null, P: NeedleParams = DEFAULT_PARAMS, fit: NightFit | null = null): RaceProjection {
  return settle(prior, projectCounted(prior, live, P, fit));
}

/** The party a race goes to before any vote is counted: an unopposed candidate's, or the party of a
 *  same-party contest. Null for a contested race. */
export function settledParty(prior: RacePrior): Party | null {
  const { contest } = prior.forecast;
  return contest === "contested" ? null : contest.endsWith("D") ? "D" : "R";
}

/** A race settled before the count (settledParty) is called for that party from the start, votes or
 *  none (Florida prints no unopposed race on the ballot, so many never report a vote). */
function settle(prior: RacePrior, p: RaceProjection): RaceProjection {
  const party = settledParty(prior);
  return party ? { ...p, locked: true, winner: party, probD: party === "D" ? 1 : 0 } : p;
}

function projectCounted(prior: RacePrior, live: LiveRace | null, P: NeedleParams, fit: NightFit | null): RaceProjection {
  const decided = prior.forecast.contest !== "contested";
  const shift = fit && !decided ? fit.shiftFor(prior) : ZERO_SHIFT;
  const mirage = fit && !decided ? fit.mirageFor(prior.state) : NO_MIRAGE;
  if (!live || live.total <= 0) return live ? lock(emptyProjection(prior, shift, P), live, prior) : emptyProjection(prior, shift, P);
  const raceDone = isRaceDone(prior, live);
  const E = Math.max(1, prior.votes);
  const kS = P.kSwing * E;
  const sigmaParts = raceSigmaParts(prior, shift, P);
  const pass = countyPass(prior, live, raceDone, P);
  if (!pass) return lock(projectTopline(prior, live, raceDone, kS, sigmaParts, shift, mirage, decided, P), live, prior);
  const { tau, cells, extraV, extraNetR } = pass;

  // Pass 2: weights and the race's own swing against its night baseline (the prior plus the shift
  // the rest of the night implies, with each county's own demographic term). A part-counted
  // county's margin is read as its implied final, o + s (1 − f), s the state's early-vote skew.
  let sumW = 0, sumWD = 0, counted = 0;
  const based = cells.map((cell) => {
    const base = cell.c.margin + shift.shift + shift.countyDemo(cell.c);
    counted += cell.v;
    if (cell.o != null && cell.v > 0 && !decided) { const w = cell.v * cell.f; sumW += w; sumWD += w * (cell.o + mirage.value * (1 - cell.f) - base); }
    return { ...cell, base };
  });
  const swing = decided ? 0 : sumWD / (sumW + kS);
  const shrink = Math.sqrt(kS / (kS + sumW));

  let total = 0, netR = 0, countyVar = 0, partial = 0;
  const counties: CountyProjection[] = based.map(({ c, v, expected, done, f, o, base }) => {
    const T = done ? v : Math.max(v, expected);
    // The remainder of a part-counted county runs s past its counted margin (the mirage fading).
    const remainder = o == null ? base + swing : base + swing + Math.pow(f, P.ownExp) * (o + mirage.value - base - swing);
    const M = T > 0 ? (v * (o ?? 0) + (T - v) * clamp(remainder, -100, 100)) / T : c.margin;
    total += T; netR += T * M;
    countyVar += Math.pow((T - v) * P.sigmaCounty, 2);
    if (o != null && !done) partial += T - v;
    return { fips: c.fips, name: c.name, counted: Math.round(v), expected: Math.round(expected), done, f, observedMargin: o, priorMargin: c.margin, projectedTotal: Math.round(T), projectedMargin: M };
  });
  counted += extraV; total += extraV; netR += extraNetR;
  // A finished race is its feed total, whatever the county rows add to (a lagging or partial
  // county breakdown must not leave it "48% of ~N projected" at 100% reporting).
  if (raceDone) total = counted = live.total;
  const margin = total > 0 ? netR / total : prior.forecast.margin + shift.shift;
  const uncounted = total > 0 ? clamp((total - counted) / total, 0, 1) : 1;
  // The shared part: the race's own forecast spread shrunk by its own counted votes, plus what the
  // night fit still leaves open for it, on the uncounted share.
  const sharedSigma = Math.sqrt((sigmaParts.own * shrink) ** 2 + sigmaParts.shared ** 2) * uncounted;
  const countySigma = total > 0 ? Math.sqrt(countyVar) / total : 0;
  const lateSigma = P.sigmaLate * uncounted;
  // The early-vote skew's own uncertainty, on the uncounted part of the part-counted counties.
  const mirageSigma = total > 0 && !raceDone ? mirage.se * partial / total : 0;
  const sigma = Math.max(raceDone ? SIGMA_FLOOR_DONE : P.sigmaFloor, Math.sqrt(sharedSigma * sharedSigma + countySigma * countySigma + lateSigma * lateSigma + mirageSigma * mirageSigma));
  const probD = decided ? prior.forecast.probability : normalCdf(-margin / sigma);
  return lock({
    tier: "county", counted: Math.round(counted), projectedTotal: Math.round(total), countedShare: total > 0 ? counted / total : 0,
    currentMargin: marginOf(live.dem, live.rep, live.total), swing, turnoutFactor: tau, margin, sigma, probD, locked: false, winner: null, night: nightOf(shift, mirage), counties,
  }, live, prior);
}

// A House race's feed county is the district's piece already (the feed lists the counties the
// district touches with the district's own votes), so its count is never scaled by the share.
// Set for a feed that sends whole-county totals instead.
const WHOLE_COUNTY_FEED = false;

function projectTopline(prior: RacePrior, live: LiveRace, raceDone: boolean, kS: number, sigmaParts: { own: number; shared: number }, shift: NightShift, mirage: { value: number; se: number }, decided: boolean, P: NeedleParams): RaceProjection {
  const E = Math.max(1, prior.votes);
  const v = live.total;
  const m = prior.forecast.margin + shift.shift;
  const o = marginOf(live.dem, live.rep, live.total) ?? m;
  const f = raceDone ? 1 : clamp(v / E, 0, 1);
  const T = raceDone ? v : Math.max(v, E);
  const w = decided ? 0 : v * f;
  const swing = w / (w + kS) * (o + mirage.value * (1 - f) - m);
  const shrink = Math.sqrt(kS / (kS + w));
  const remainder = m + swing + Math.pow(f, P.ownExp) * (o + mirage.value - m - swing);
  const margin = f < MIN_SHARE ? m : (v * o + (T - v) * clamp(remainder, -100, 100)) / T;
  const uncounted = clamp((T - v) / T, 0, 1);
  const sharedSigma = Math.sqrt((sigmaParts.own * shrink) ** 2 + sigmaParts.shared ** 2) * uncounted;
  const sigma = Math.max(raceDone ? SIGMA_FLOOR_DONE : P.sigmaFloor, Math.sqrt(sharedSigma * sharedSigma + Math.pow(P.sigmaCounty * uncounted * 0.5, 2) + Math.pow(P.sigmaLate * uncounted, 2) + Math.pow(mirage.se * uncounted, 2)));
  const probD = decided ? prior.forecast.probability : normalCdf(-margin / sigma);
  return {
    tier: "topline", counted: v, projectedTotal: Math.round(T), countedShare: T > 0 ? v / T : 0, currentMargin: marginOf(live.dem, live.rep, live.total),
    swing, turnoutFactor: 1, margin, sigma, probD, locked: false, winner: null, night: nightOf(shift, mirage),
    counties: prior.counties.map((c) => ({ fips: c.fips, name: c.name, counted: 0, expected: c.votes, done: false, f: 0, observedMargin: null, priorMargin: c.margin, projectedTotal: c.votes, projectedMargin: c.margin + shift.shift + shift.countyDemo(c) + swing })),
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
  /** Projected Democratic seats: called plus every race's projected winner (projected.dem), with an
   *  80% band from the races' win probabilities (normal approximation), widened to contain the count. */
  projectedDem: { seats: number; lo80: number; hi80: number };
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
    projectedDem: { seats: projected.dem, lo80: Math.min(projected.dem, holdover.dem + mean - 1.2816 * sd), hi80: Math.max(projected.dem, holdover.dem + mean + 1.2816 * sd) },
    flips, racesIn, racesCalled, popular,
  };
}
