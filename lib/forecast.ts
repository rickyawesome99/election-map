// ── Derived race forecast ─────────────────────────────────────────────────────
// The single place a 2026 race's forecast is produced. Every consumer (map, race
// tables, state pages, candidate index, calendar, page metadata) reads margin,
// win probability, spread and rating from here, so nothing on the site carries a
// hand-entered forecast field any more (Phase 0 of the forecast revamp).
//
//   margin      R-positive projected margin, from projectRace: the structural model
//               blended with the race poll average by its evidence weight (Phase 5)
//   sigma       total spread: β*(state) × national σ_E ⊕ per-office race noise
//   probability P(Democrat wins) = normal tail of margin / sigma
//   interval80  margin ± 1.28 σ
//   rating      Safe/Likely/Lean/Tilt bucket of the margin (marginToRating)
//
// Chamber totals come from a seeded simulation that draws ONE national shock per
// run (shared through each state's β*), one shock per demographic axis (shared in
// proportion to how far a race's electorate sits from the average one) and independent
// race noise, so the seat intervals and control probabilities carry the correlation
// a sum of independent probabilities would miss.
//
// Specification: /methodology (components/methodology/ForecastMethodology.tsx). A change to how
// anything here is calculated updates that tab and adds an entry to data/methodologyChangelog.ts.

import {
  senateData,
  governorData,
  houseData,
  type RaceForecast,
  type RaceType,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { projectRace, raceSigma, winProbabilityD, getTplFit, getNationalEnvironment } from "@/lib/tplCompute";
import { marginToRating } from "@/lib/colorScale";
import { alignedParty } from "@/data/raceEligibility";
import { districtDemographics, stateDemographics, type Demographics } from "@/data/demographics";

export type Office = "H" | "S" | "G";
const OFFICE_OF: Record<RaceType, Office> = { house: "H", senate: "S", governor: "G" };

// uncontested-X: the other major party fielded no nominee; same-party-X: both general-election
// slots belong to party X (CA/WA top-two, an incumbent-vs-incumbent redraw), so the seat is X's
// whoever wins. Both are "decided": probability pinned, rating Safe, no simulation noise.
export type Contest = "contested" | "uncontested-D" | "uncontested-R" | "same-party-D" | "same-party-R";
export const decidedFor = (c: Contest): "D" | "R" | null => (c === "uncontested-D" || c === "same-party-D" ? "D" : c === "uncontested-R" || c === "same-party-R" ? "R" : null);

export interface ForecastFields {
  margin: number;
  sigma: number;
  probability: number;
  interval80: [number, number];
  rating: string;
  office: Office;
  stateAbbr: string;
  beta: number;
  // Phase 5: the structural model margin and the poll average behind `margin`.
  model: number;
  pollMargin: number | null;
  pollWeight: number;
  pollCount: number;
  // uncontested-X: the other major party fielded no nominee (build.js placeholder name),
  // so the race is decided — probability pinned, rating Safe, no simulation noise.
  contest: Contest;
}

const PLACEHOLDER_NOMINEE = /^(Democratic|Republican) Candidate$/;
const UNCONTESTED_FLOOR = 20; // displayed margin magnitude floor for a decided race (Safe threshold is 15)

export function contestOf(race: RaceForecast): Contest {
  const c = race.candidates;
  if (!c) return "contested";
  const demMissing = PLACEHOLDER_NOMINEE.test(c.dem.name.trim());
  const repMissing = PLACEHOLDER_NOMINEE.test(c.rep.name.trim());
  if (demMissing && !repMissing) return "uncontested-R";
  if (repMissing && !demMissing) return "uncontested-D";
  if (demMissing && repMissing) return "contested"; // nominees unknown (e.g. a jungle primary), scored structurally
  const pD = alignedParty(c.dem), pR = alignedParty(c.rep);
  if (pD && pD === pR) return pD === "D" ? "same-party-D" : "same-party-R";
  // An unaligned independent standing in for a missing party (Osborn, Achilles, Bengs…) stays
  // contested: scored on the structural margin plus their own record (user decision 2026-09-16).
  return "contested";
}

export type ForecastedRace = RaceForecast & ForecastFields;

function stateAbbrOf(race: RaceForecast): string {
  if (race.raceType === "house") return statesData.find((s) => s.name === race.state)?.abbr ?? "";
  return race.id.replace(/-\d+$/, "");
}

export function forecastRace<T extends RaceForecast>(race: T): T & ForecastFields {
  const office = OFFICE_OF[race.raceType];
  const stateAbbr = stateAbbrOf(race);
  const contest = contestOf(race);
  const { model, polling, margin: structural } = projectRace(race);
  const sigma = raceSigma(office, stateAbbr, polling.weight);
  const pollFields = { model, pollMargin: polling.avg?.diff ?? null, pollWeight: polling.weight, pollCount: polling.avg?.n ?? 0 };
  const beta = getTplFit().beta[stateAbbr]?.shrunk ?? 1;
  if (contest !== "contested") {
    const sign = decidedFor(contest) === "R" ? 1 : -1;
    const margin = sign * Math.max(UNCONTESTED_FLOOR, sign * structural);
    return {
      ...race,
      margin,
      sigma,
      probability: sign > 0 ? 0.005 : 0.995,
      interval80: [margin, margin],
      rating: marginToRating(margin),
      office,
      stateAbbr,
      beta,
      ...pollFields,
      contest,
    };
  }
  return {
    ...race,
    margin: structural,
    sigma,
    probability: winProbabilityD(structural, sigma),
    interval80: [structural - 1.2816 * sigma, structural + 1.2816 * sigma],
    rating: marginToRating(structural),
    office,
    stateAbbr,
    beta,
    ...pollFields,
    contest,
  };
}

// Computed once per process; the TPL fit behind them is cached inside tplCompute.
export const senateForecasts: ForecastedRace[] = senateData.map(forecastRace);
export const governorForecasts: ForecastedRace[] = governorData.map(forecastRace);
export const houseForecasts: ForecastedRace[] = houseData.map(forecastRace);

export function forecastsFor(raceType: RaceType): ForecastedRace[] {
  if (raceType === "senate") return senateForecasts;
  if (raceType === "governor") return governorForecasts;
  return houseForecasts;
}

export function findForecast(raceType: RaceType, id: string): ForecastedRace | undefined {
  return forecastsFor(raceType).find((r) => r.id === id);
}

// ── Chambers ─────────────────────────────────────────────────────────────────

// Seats not on the 2026 ballot (Senate: independents caucusing with the Democrats
// are counted with them).
export const SEAT_HOLDOVERS: Record<RaceType, { dem: number; rep: number }> = {
  senate: { dem: 34, rep: 31 },
  governor: { dem: 6, rep: 8 },
  house: { dem: 0, rep: 0 },
};
export const TOTAL_SEATS_BY_TYPE: Record<RaceType, number> = { senate: 100, governor: 50, house: 435 };
// Democratic seats needed for control. The Senate tie goes to a Republican vice president.
const CONTROL_THRESHOLD: Partial<Record<RaceType, number>> = { house: 218, senate: 51 };

export interface SeatTotals {
  called: { dem: number; rep: number };
  expected: { dem: number; rep: number };
}

export function seatTotals(races: ForecastFields[], holdover: { dem: number; rep: number }): SeatTotals {
  let calledD = 0, expectedD = 0;
  for (const r of races) {
    if (r.margin <= 0) calledD += 1;
    expectedD += r.probability;
  }
  const n = races.length;
  return {
    called: { dem: holdover.dem + calledD, rep: holdover.rep + (n - calledD) },
    expected: { dem: holdover.dem + expectedD, rep: holdover.rep + (n - expectedD) },
  };
}

export interface ChamberSimulation {
  raceType: RaceType;
  sims: number;
  meanDem: number;
  lo80: number; // 10th percentile of Democratic seats
  hi80: number; // 90th percentile
  pDemControl: number | null; // null where "control" has no meaning (governors)
  controlThreshold: number | null; // Democratic seats needed for control (null for governors)
  histogram: Record<number, number>; // Democratic seats → share of simulations
}

// Deterministic PRNG so server and client render the same numbers.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number): number {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A race's electorate against the average electorate of its kind (the 435 districts for a
// House race, the 50 states for a statewide one), in units of 10 pts of the share — what the
// demographic shocks load on. Centered on the races' own geography, not the nation, because
// the national shock σ_E is measured as the year's mean miss ACROSS those races: whatever a
// demographic swing does to the average district or state is already inside it. House races
// read their district (tract-estimated on the 2026 lines where the state redrew); no data →
// no loading.
const meanOf = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
let demographicCenters: Record<"district" | "state", { white: number; college: number }> | null = null;
function getDemographicCenters() {
  if (!demographicCenters) {
    const districts = houseData.map((r) => districtDemographics[r.id]);
    const states = statesData.map((st) => stateDemographics[st.abbr]);
    demographicCenters = {
      district: { white: meanOf(districts.map((d) => d?.whitePct)), college: meanOf(districts.map((d) => d?.collegePct)) },
      state: { white: meanOf(states.map((d) => d?.whitePct)), college: meanOf(states.map((d) => d?.collegePct)) },
    };
  }
  return demographicCenters;
}
function demographicLoading(r: ForecastedRace): { nonwhite: number; college: number } {
  const house = r.raceType === "house";
  const d: Demographics | undefined = house ? districtDemographics[r.id] : stateDemographics[r.stateAbbr];
  const c = getDemographicCenters()[house ? "district" : "state"];
  return {
    nonwhite: d?.whitePct != null ? (c.white - d.whitePct) / 10 : 0,
    college: d?.collegePct != null ? (d.collegePct - c.college) / 10 : 0,
  };
}

// Least share of a race's own noise left once the demographic shock is carved out of it
// (only binds in electorates ~40+ pts from the average, all of them safe seats).
const MIN_IDIOSYNCRATIC_SHARE = 0.5;

export function simulateChamber(raceType: RaceType, races: ForecastedRace[] = forecastsFor(raceType), sims = 5000, seed = 20261103): ChamberSimulation {
  const rand = mulberry32(seed);
  const sigmaE = getNationalEnvironment().sigmaE;
  const holdover = SEAT_HOLDOVERS[raceType].dem;
  const counts = new Array<number>(sims);
  // Per race: the demographic loadings, and the noise left to the race itself. The race-level
  // spread is the one behind its win probability (raceSigma minus the national component: the
  // model/poll blend), and the demographic shock is carved OUT of it, so a race's total spread
  // — and its probability — is the same with or without the shock; only the co-movement changes.
  const shock = F.DEMOGRAPHIC_SHOCK;
  const parts = races.map((r) => {
    const load = demographicLoading(r);
    const raceVar = r.sigma ** 2 - (r.beta * sigmaE) ** 2;
    const demoVar = (load.nonwhite * shock.nonwhite) ** 2 + (load.college * shock.college) ** 2;
    return { load, idio: Math.sqrt(Math.max(MIN_IDIOSYNCRATIC_SHARE ** 2 * raceVar, raceVar - demoVar)) };
  });
  for (let k = 0; k < sims; k += 1) {
    const z = gaussian(rand) * sigmaE;
    const zNonwhite = gaussian(rand) * shock.nonwhite;
    const zCollege = gaussian(rand) * shock.college;
    let dem = holdover;
    for (let i = 0; i < races.length; i += 1) {
      const r = races[i];
      if (r.contest !== "contested") { if (decidedFor(r.contest) === "D") dem += 1; continue; }
      const { load, idio } = parts[i];
      const m = r.margin + r.beta * z + load.nonwhite * zNonwhite + load.college * zCollege + gaussian(rand) * idio;
      if (m <= 0) dem += 1;
    }
    counts[k] = dem;
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sims - 1, Math.floor(p * sims))];
  const histogram: Record<number, number> = {};
  for (const c of counts) histogram[c] = (histogram[c] ?? 0) + 1 / sims;
  const threshold = CONTROL_THRESHOLD[raceType];
  return {
    raceType,
    sims,
    meanDem: counts.reduce((a, b) => a + b, 0) / sims,
    lo80: q(0.1),
    hi80: q(0.9),
    pDemControl: threshold == null ? null : counts.filter((c) => c >= threshold).length / sims,
    controlThreshold: threshold ?? null,
    histogram,
  };
}

let chamberCache: Record<RaceType, ChamberSimulation> | null = null;
export function getChamberSimulations(): Record<RaceType, ChamberSimulation> {
  if (!chamberCache) {
    chamberCache = {
      house: simulateChamber("house"),
      senate: simulateChamber("senate"),
      governor: simulateChamber("governor"),
    };
  }
  return chamberCache;
}
