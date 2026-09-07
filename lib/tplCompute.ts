import {
  presPastResults,
  senateData,
  senateHoldovers,
  senateNoElection,
  governorData,
  governorNoElection,
  houseData,
  houseStatewideResults,
  houseDistrictInfo,
  stateLegData,
  type PastResult,
} from "@/data/forecastData";
import { GOVERNOR_MANUAL_MARGINS } from "@/data/manualOverrides";
import { statesData } from "@/data/statesData";
import {
  TPL_GLOBAL_CONSTANTS as G,
  STATE_RACE_INPUTS,
  WQ_VALUES,
  LQ_VALUES,
  type RaceModelInputs,
  type CQTier,
} from "@/data/tplModelData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { popVoteData, presIncParty } from "@/data/popVoteData";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { FIPS_TO_STATE } from "@/lib/fips";
import { classifyEligibility, type RaceEligibility } from "@/data/raceEligibility";

// ── Generic ballot ────────────────────────────────────────────────────────────
// R-positive convention: negative = D-favored (e.g. D+5.3 → -5.3).
// Sourced live from the weighted polling average (§lib/genericBallotAverage) — the
// same number shown in the "Generic Ballot Polling Average" box on the Overview tab.

export const GENERIC_BALLOT = computeGenericBallotAverage().diff;

// ── Presidential CQ inputs by cycle ─────────────────────────────────────────

const PRESIDENTIAL_INPUTS_BY_YEAR: Record<number, { wqTier: CQTier; lqTier: CQTier }> = {
  2016: { wqTier: "Generic", lqTier: "Generic" },
  2020: { wqTier: "Generic", lqTier: "Generic" },
  2024: { wqTier: "Strong", lqTier: "Weak" },
};

// ── Race stub type ────────────────────────────────────────────────────────────

export interface RaceStub {
  race: string;
  district?: string;
  raceType: "P" | "S" | "G" | "H" | "L";
  detailHref?: string;
  year: number;
  eligibility: RaceEligibility;
  incumbent: string;
  FF: number;
  historicalMargins: { year: number; margin: number }[];
}

// ── Computed race types ───────────────────────────────────────────────────────

export interface ComputedRace extends RaceStub {
  rawMargin: number | null;
  incumbencyPts: number | null; // additive strip: R incumbent → −pts, D incumbent → +pts
  FF_pts: number | null;
  adjustedMargin: number | null;
  imputed: boolean;
  imputedSourceYear: number | null;
  imputedSourceDesc: string | null;
  minValidYear: number;
  envPts: number | null; // −β*(state) × E(year): strips the fitted national environment
  aggWeight: number; // weight in aggregation: ×0.5 if imputed, × Huber factor vs the fitted lean (state model)
  NM: number | null;
  inAggregation: boolean;
}

export interface YearAggregation {
  year: number;
  racesPresent: string[];
  redistributedWeights: Record<string, number>;
  typeNMs: Record<string, number | null>;
  WRS: number;
  coverage: number;    // Σ base type weights of types present — scales the year weight
  finalWeight: number; // normalized share of TPL contributed by this year
}

export interface StateModelCalculation {
  races: ComputedRace[];
  yearAggregations: YearAggregation[];
  tpl: number;
}

// ── District TPL types ────────────────────────────────────────────────────────

export interface DistrictComputedRace {
  year: number;
  rawMargin: number;
  IF: number;
  wqTier: CQTier;
  lqTier: CQTier;
  CQ: number;
  candidateFactor_pts: number;
  NM: number;
}

export interface DistrictModelCalculation {
  races: DistrictComputedRace[];
  tpl: number;
}

// ── Race eligibility & imputation ─────────────────────────────────────────────
// An ineligible race (missing major-party nominee, or a same-party general such
// as a CA/WA top-two or LA runoff) has no usable R-vs-D margin. Instead of the
// old ≥50-pt competitiveness blend, the seat's structural lean is imputed from
// the nearest presidential result (boundary-vintage-aware for House districts)
// and the row enters aggregation at IMPUTED_RACE_WEIGHT. Imputed rows skip
// IF/CQ/FF/WA entirely — the imputed value is already a lean, not an outcome.

export const IMPUTED_RACE_WEIGHT = 0.5;

interface ImputedLean {
  margin: number;
  year: number;
  desc: string;
}

function byNearestYear(raceYear: number) {
  return (a: { year: number }, b: { year: number }) =>
    Math.abs(a.year - raceYear) - Math.abs(b.year - raceYear) || b.year - a.year;
}

function nearestPresidentialLean(
  stateAbbr: string,
  district: string | undefined,
  raceYear: number,
  minValidYear: number,
  maxValidYear: number
): ImputedLean | null {
  if (district) {
    const districtId = houseData.find((race) => race.name === district)?.id;
    const entry = districtId
      ? (houseStatewideResults[districtId] ?? [])
          .filter((e) => e.race === "President" && e.year >= minValidYear && e.year < maxValidYear)
          .sort(byNearestYear(raceYear))[0]
      : undefined;
    if (entry) return { margin: entry.repPct - entry.demPct, year: entry.year, desc: "district presidential result" };
  }
  const entry = (presPastResults[stateAbbr] ?? []).slice().sort(byNearestYear(raceYear))[0];
  return entry
    ? { margin: entry.repPct - entry.demPct, year: entry.year, desc: "statewide presidential result" }
    : null;
}

// ── Additive incumbency (shared with the forward projection) ─────────────────
// Points the incumbent's party is worth on the margin. Stripping subtracts them
// (R incumbent → −pts toward D); forecasting adds them back via computeIncumbentPts.
// P: national approval effects belong to E(y). L: chamber aggregate, no single incumbent.

function incumbencyPtsFor(raceType: string, incumbent: string): number {
  const pts = INCUMBENT_ADVANTAGE[raceType] ?? 0;
  if (incumbent === "R") return -pts;
  if (incumbent === "D") return pts;
  return 0;
}

// ── Helper: incumbent from past result ────────────────────────────────────────

function incumbentFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent">): string {
  if (result?.demIncumbent) return "D";
  if (result?.repIncumbent) return "R";
  return "Open";
}

// ── aggregateYears ────────────────────────────────────────────────────────────
// Shared by the state and county models: redistributes race-type weights among whichever
// types are actually present each year, then produces the recency-weighted TPL.

function aggregateYears(races: ComputedRace[]): { yearAggregations: YearAggregation[]; tpl: number } {
  const yearAggregations = G.YEARS.map((year) => {
    const yearRaces = races.filter((race) => race.year === year && race.NM != null);
    const typeNMs: Record<string, number | null> = {};
    for (const type of ["P", "G", "S", "H", "L"]) {
      const typeRaces = yearRaces.filter((race) => race.raceType === type);
      const typeWeight = typeRaces.reduce((sum, race) => sum + race.aggWeight, 0);
      typeNMs[type] = typeWeight > 0
        ? typeRaces.reduce((sum, race) => sum + race.aggWeight * (race.NM ?? 0), 0) / typeWeight
        : null;
    }
    const racesPresent = ["P", "G", "S", "H", "L"].filter((t) => typeNMs[t] != null);
    const totalBase = racesPresent.reduce((sum, type) => sum + (G.RACE_TYPE_WEIGHTS[type] ?? 0), 0);
    const redistributedWeights: Record<string, number> = {};
    for (const type of racesPresent) {
      redistributedWeights[type] = (G.RACE_TYPE_WEIGHTS[type] ?? 0) / totalBase;
    }
    const WRS = racesPresent.reduce((sum, type) => sum + redistributedWeights[type] * (typeNMs[type] ?? 0), 0);
    return { year, racesPresent, redistributedWeights, typeNMs, WRS, coverage: totalBase, finalWeight: 0 };
  });

  // Year weight = recency decay × base type-weight coverage, so a sparse year
  // (an odd-year governor race alone) cannot dominate via redistribution.
  const yearsPresent = yearAggregations.filter((agg) => agg.racesPresent.length > 0);
  const totalYearWeight = yearsPresent.reduce(
    (sum, agg) => sum + (G.YEAR_WEIGHTS[agg.year] ?? 0) * agg.coverage,
    0
  );
  for (const agg of yearsPresent) {
    agg.finalWeight = totalYearWeight > 0 ? ((G.YEAR_WEIGHTS[agg.year] ?? 0) * agg.coverage) / totalYearWeight : 0;
  }
  const tpl = yearsPresent.reduce((sum, agg) => sum + agg.finalWeight * agg.WRS, 0);
  return { yearAggregations, tpl };
}

// ── getRawMargin ──────────────────────────────────────────────────────────────

export function getRawMargin(
  race: string,
  district: string | undefined,
  year: number,
  stateAbbr: string,
  stateName: string
): number | null {
  if (race === "President") {
    const e = (presPastResults[stateAbbr] ?? []).find((r) => r.year === year);
    return e != null ? e.repPct - e.demPct : null;
  }

  if (race === "Senate" || race === "Senate Special") {
    const isSpecial = race === "Senate Special";
    const all = [
      ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
      ...senateNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find(
        (r) => r.year === year && (isSpecial ? r.electionType === "Special" : r.electionType !== "Special")
      );
      if (e != null) return e.repPct - e.demPct;
    }
    return null;
  }

  if (race === "Governor") {
    const all = [
      ...governorData.filter((d) => d.id === stateAbbr),
      ...governorNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find((r) => r.year === year);
      if (e != null) return e.repPct - e.demPct;
    }
    return null;
  }

  if (district) {
    const dist = houseData.find((r) => r.name === district);
    const e = (dist?.pastResults ?? []).find((r) => r.year === year);
    return e != null ? e.repPct - e.demPct : null;
  }

  if (race === "State Legislature") {
    const entries = (stateLegData[stateName] ?? []).filter((e) => e.year === year);
    let dem = 0, rep = 0;
    for (const e of entries) {
      if (e.demVotes != null && e.repVotes != null) {
        dem += e.demVotes;
        rep += e.repVotes;
      }
    }
    const total = dem + rep;
    return total > 0 ? ((rep - dem) / total) * 100 : null;
  }

  return null;
}

// ── generateRaceList ──────────────────────────────────────────────────────────

export function generateRaceList(stateAbbr: string, stateName: string): RaceStub[] {
  const modelInputs: RaceModelInputs[] = STATE_RACE_INPUTS[stateAbbr] ?? [];
  const stubs: RaceStub[] = [];
  const stateId = statesData.find((state) => state.abbr === stateAbbr)?.id ?? stateAbbr.toLowerCase();
  const stateHref = `/states/${stateId}`;

  function overlay(race: string, year: number) {
    return modelInputs.find((i) => i.race === race && i.year === year);
  }

  function makeStub(
    race: string,
    raceType: RaceStub["raceType"],
    year: number,
    district?: string,
    incumbent = "Open",
    historicalMargins: RaceStub["historicalMargins"] = [],
    detailHref?: string,
    eligibility: RaceEligibility = "eligible"
  ): RaceStub {
    const inp = overlay(race, year);
    return {
      race,
      district,
      raceType,
      detailHref,
      year,
      eligibility,
      incumbent,
      FF: inp?.FF ?? 1.00,
      historicalMargins,
    };
  }

  // President
  const presidentialResults = presPastResults[stateAbbr] ?? [];
  const presidentialMargins = presidentialResults.map((result) => ({
    year: result.year,
    margin: result.repPct - result.demPct,
  }));
  for (const r of presidentialResults) {
    if (r.year >= 2016) {
      stubs.push(makeStub("President", "P", r.year, undefined, incumbentFromResult(r), presidentialMargins, stateHref, classifyEligibility(r)));
    }
  }

  function addSenateSeat(seat: { pastResults?: PastResult[] }, detailHref: string) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2016) {
        const raceName = r.electionType === "Special" ? "Senate Special" : "Senate";
        stubs.push(makeStub(raceName, "S", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref, classifyEligibility(r)));
      }
    }
  }

  for (const seat of senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-"))) {
    addSenateSeat(seat, `/senate/${seat.id.toLowerCase().replace(/-2$/, "2")}`);
  }
  for (const seat of senateHoldovers.filter((d) => d.abbr === stateAbbr)) {
    addSenateSeat(seat, `/senate/${seat.abbr.toLowerCase()}2`);
  }
  for (const seat of senateNoElection.filter((d) => d.abbr === stateAbbr)) {
    addSenateSeat(seat, `/senate/${seat.abbr.toLowerCase()}`);
  }

  function addGovernorSeat(seat: { pastResults?: PastResult[] }, detailHref: string) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2016) {
        stubs.push(makeStub("Governor", "G", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref, classifyEligibility(r)));
      }
    }
  }
  for (const seat of governorData.filter((d) => d.id === stateAbbr)) {
    addGovernorSeat(seat, `/governor/${seat.id.toLowerCase()}`);
  }
  for (const seat of governorNoElection.filter((d) => d.abbr === stateAbbr)) {
    addGovernorSeat(seat, `/governor/${seat.abbr.toLowerCase()}`);
  }

  // House
  for (const dist of houseData.filter((r) => r.state === stateName)) {
    const historicalMargins = (dist.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of dist.pastResults ?? []) {
      if (r.year >= 2016) {
        stubs.push(makeStub(`House ${dist.name}`, "H", r.year, dist.name, incumbentFromResult(r), historicalMargins, `/house/${dist.name.toLowerCase()}`, classifyEligibility(r)));
      }
    }
  }

  // State Legislature
  const legEntries = stateLegData[stateName] ?? [];
  const isUnicameral = stateName === "Nebraska";
  // A year counts once every chamber that WAS on the ballot has a vote total — not once both
  // chambers do. Staggered senates (MI, MN, SC, KS, NM) sit out specific even years, and demanding
  // a Senate figure for those years discarded the state's complete House result: Michigan 2024's
  // 5.4 million House votes were being thrown away because no Senate seat was up.
  //
  // The two cases are told apart by the shape of data-entry/state_leg.csv, which carries exactly
  // one row per chamber-year that actually happened (verified against data/stateLegCalendar.ts —
  // its election years and the CSV's chamber-years agree exactly). So a chamber that did not elect
  // has NO ROW, while a chamber that elected but is unsourced has a row with null votes. Requiring
  // every PRESENT row to carry votes therefore keeps a partially-sourced year out while letting a
  // genuine single-chamber year in.
  const legYears = [...new Set(legEntries.map((e) => e.year))]
    .filter((year) => {
      if (year < 2016) return false;
      const yearEntries = legEntries.filter((e) => e.year === year);
      const sourced = yearEntries.filter((e) => e.demVotes != null && e.repVotes != null);
      // Nebraska's unicameral body is stored under "House"; its "Senate" rows are deliberate
      // empty placeholders marked "Unicameral", so it can never satisfy the all-rows-sourced test.
      if (isUnicameral) return sourced.length > 0;
      return sourced.length > 0 && sourced.length === yearEntries.length;
    })
    .sort((a, b) => a - b);

  for (const year of legYears) {
    const historicalMargins = [
      ...new Set(legEntries.filter((e) => e.demVotes != null && e.repVotes != null).map((e) => e.year)),
    ].map((historicalYear) => {
      const entries = legEntries.filter((e) => e.year === historicalYear);
      const demVotes = entries.reduce((sum, e) => sum + (e.demVotes ?? 0), 0);
      const repVotes = entries.reduce((sum, e) => sum + (e.repVotes ?? 0), 0);
      return { year: historicalYear, margin: ((repVotes - demVotes) / (demVotes + repVotes)) * 100 };
    });
    stubs.push(makeStub("State Legislature", "L", year, undefined, "-", historicalMargins, stateHref));
  }

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };
  return stubs.sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

// ── Environment & elasticity fit ──────────────────────────────────────────────
// Alternating robust least squares over the full eligible race panel (all 50
// states, every office, 2016–2025 incl. odd years):
//
//   margin − incumbencyPts  ≈  lean(state) + β(state) × E(year)
//
// E(y) is the fitted national environment (R-positive; identified from
// within-state changes, so which seats happen to be up cannot skew it, and
// centered so the period average is ≈ 0). β̂ is each state's elasticity,
// shrunk (β* = 1 + BETA_SHRINK·(β̂−1)) and clamped to [BETA_MIN, BETA_MAX].
// Huber weights (w = min(1, HUBER_C/|residual|)) keep crossover outliers —
// Manchin, Scott, Hogan — from dragging a state's lean; those residuals are
// the raw material for WAR later.

export interface TplFitStateBeta {
  raw: number;
  shrunk: number;
  n: number;
}

export interface TplFit {
  E: Record<number, number>;
  beta: Record<string, TplFitStateBeta>;
  lean: Record<string, number>; // Huber-protected static lean — anchors race weights in aggregation
  years: number[];
  rowsUsed: number;
}

let _fitCache: TplFit | null = null;

export function getTplFit(): TplFit {
  if (_fitCache) return _fitCache;
  interface FitRow { abbr: string; year: number; adj: number; w: number; }
  const rows: FitRow[] = [];
  for (const { abbr, name } of statesData) {
    for (const stub of generateRaceList(abbr, name)) {
      if (stub.eligibility !== "eligible") continue;
      const margin = getRawMargin(stub.race, stub.district, stub.year, abbr, name);
      if (margin == null) continue;
      rows.push({ abbr, year: stub.year, adj: margin + incumbencyPtsFor(stub.raceType, stub.incumbent), w: 1 });
    }
  }
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const E: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const lean: Record<string, number> = {};
  const beta: Record<string, TplFitStateBeta> = {};
  const rowsByState: Record<string, FitRow[]> = {};
  const rowsByYear: Record<number, FitRow[]> = {};
  for (const r of rows) {
    (rowsByState[r.abbr] ??= []).push(r);
    (rowsByYear[r.year] ??= []).push(r);
  }
  for (const { abbr } of statesData) {
    const sr = rowsByState[abbr] ?? [];
    lean[abbr] = sr.length > 0 ? sr.reduce((a, r) => a + r.adj, 0) / sr.length : 0;
    beta[abbr] = { raw: 1, shrunk: 1, n: sr.length };
  }
  for (let iter = 0; iter < G.FIT_ITERATIONS; iter += 1) {
    for (const r of rows) {
      const res = r.adj - lean[r.abbr] - beta[r.abbr].shrunk * E[r.year];
      r.w = Math.abs(res) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(res);
    }
    for (const y of years) {
      const yr = rowsByYear[y] ?? [];
      let num = 0;
      let den = 0;
      for (const r of yr) {
        const b = beta[r.abbr].shrunk;
        num += r.w * b * (r.adj - lean[r.abbr]);
        den += r.w * b * b;
      }
      E[y] = den > 0 ? (num / den) * (yr.length / (yr.length + G.SPARSE_YEAR_K)) : 0;
    }
    for (const abbr of Object.keys(beta)) {
      const sr = rowsByState[abbr] ?? [];
      let num = 0;
      let den = 0;
      for (const r of sr) {
        const e = E[r.year];
        num += r.w * e * (r.adj - lean[abbr]);
        den += r.w * e * e;
      }
      const raw = den > 0 ? num / den : 1;
      beta[abbr] = {
        raw,
        shrunk: Math.max(G.BETA_MIN, Math.min(G.BETA_MAX, 1 + G.BETA_SHRINK * (raw - 1))),
        n: sr.length,
      };
    }
    for (const abbr of Object.keys(lean)) {
      const sr = rowsByState[abbr] ?? [];
      let num = 0;
      let den = 0;
      for (const r of sr) {
        num += r.w * (r.adj - beta[abbr].shrunk * E[r.year]);
        den += r.w;
      }
      if (den > 0) lean[abbr] = num / den;
    }
  }
  _fitCache = { E, beta, lean, years, rowsUsed: rows.length };
  return _fitCache;
}

// ── calculateStateModel ───────────────────────────────────────────────────────

export function calculateStateModel(stateAbbr: string, stateName: string): StateModelCalculation {
  const fit = getTplFit();
  const beta = fit.beta[stateAbbr]?.shrunk ?? 1;
  const stubs = generateRaceList(stateAbbr, stateName);
  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = getRawMargin(stub.race, stub.district, stub.year, stateAbbr, stateName);
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    let minValidYear = 0;
    let maxValidYear = Number.POSITIVE_INFINITY;
    if (stub.raceType === "H" && stub.district) {
      const districtId = houseData.find((r) => r.name === stub.district)?.id;
      if (districtId) {
        const infoYears = (houseDistrictInfo[districtId] ?? []).map((e) => e.year);
        const pastYears = infoYears.filter((y) => y <= stub.year);
        if (pastYears.length > 0) minValidYear = Math.max(...pastYears);
        const futureYears = infoYears.filter((y) => y > stub.year);
        if (futureYears.length > 0) maxValidYear = Math.min(...futureYears);
      }
    }
    const ineligible = stub.eligibility !== "eligible";
    const imputation = ineligible
      ? nearestPresidentialLean(stateAbbr, stub.district, stub.year, minValidYear, maxValidYear)
      : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    // Imputed rows strip the environment of the SOURCE presidential year — the
    // imputed value inherits that year's national conditions, nothing else.
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(beta * (fit.E[envYear] ?? 0));
    const incumbencyPts = adjustedMargin == null ? null : imputed ? 0 : incumbencyPtsFor(stub.raceType, stub.incumbent);
    const FF_pts = adjustedMargin == null ? null : imputed ? 0 : adjustedMargin * (stub.FF - 1);
    const NM = adjustedMargin != null
      ? adjustedMargin + (incumbencyPts ?? 0) + (FF_pts ?? 0) + (envPts ?? 0)
      : null;
    // Aggregation weight: imputed rows enter at IMPUTED_RACE_WEIGHT, and every row is
    // Huber-downweighted by its residual against the state's fitted lean — so a
    // crossover outlier (Manchin, Scott, Hogan) cannot drag the headline TPL either.
    const stateLean = fit.lean[stateAbbr];
    const residual = NM != null && stateLean != null ? NM - stateLean : 0;
    const huberW = Math.abs(residual) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(residual);
    const aggWeight = (imputed ? IMPUTED_RACE_WEIGHT : 1) * huberW;
    return {
      ...stub,
      rawMargin,
      incumbencyPts,
      FF_pts,
      adjustedMargin,
      imputed,
      imputedSourceYear: imputation?.year ?? null,
      imputedSourceDesc: imputation?.desc ?? null,
      minValidYear,
      envPts,
      aggWeight,
      NM,
      inAggregation,
    };
  });

  const { yearAggregations, tpl } = aggregateYears(races);

  return { races, yearAggregations, tpl };
}

// ── calculateDistrictModel ────────────────────────────────────────────────────

export function calculateDistrictModel(districtId: string): DistrictModelCalculation {
  const d = districtPresidentialData[districtId];
  if (!d) return { races: [], tpl: 0 };

  const marginsById: Record<number, number> = {
    2016: d.pres16Margin,
    2020: d.pres20Margin,
    2024: d.pres24Margin,
  };

  const races: DistrictComputedRace[] = G.DISTRICT_YEARS.map((year) => {
    const rawMargin = marginsById[year];
    const pifRow = popVoteData.find((r) => r.type === "President" && r.year === year);
    const IF = pifRow
      ? 1 + pifRow.presMargin * G.k_pif * (presIncParty(pifRow.presInc) === "dem" ? 1 : -1)
      : 1.00;
    const presBase = PRESIDENTIAL_INPUTS_BY_YEAR[year];
    const wqTier: CQTier = presBase?.wqTier ?? "Generic";
    const lqTier: CQTier = presBase?.lqTier ?? "Generic";
    const CQ = WQ_VALUES[wqTier] * LQ_VALUES[lqTier];
    const cappedAdj = Math.sign(rawMargin) * Math.min(Math.abs(rawMargin), G.CQ_MARGIN_CAP);
    const candidateFactor_pts = rawMargin * (IF - 1) + cappedAdj * (CQ - 1);
    const NM = rawMargin + candidateFactor_pts;
    return { year, rawMargin, IF, wqTier, lqTier, CQ, candidateFactor_pts, NM };
  });

  const tpl = races.reduce((sum, r) => sum + (G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0) * r.NM, 0);
  return { races, tpl };
}

// ── County TPL ────────────────────────────────────────────────────────────────
// Reuses the exact same per-race formula pipeline as the state model (competitiveness
// blend, IF, CQ, FF, WA, year aggregation — via the shared helpers above), so a change
// to the state TPL formula automatically applies here too. Only the inputs differ:
// - President/Senate/Governor are genuinely the same statewide race, just measured at
//   county granularity, so incumbent + WQ/LQ/FF inputs are reused from the parent
//   state's race list (STATE_RACE_INPUTS) — but raw margins, historical margins, and
//   the presidential baseline used for the competitiveness blend all come from the
//   county's own results, so the county TPL updates whenever county data changes.
// - House: county data is already a same-year aggregate across every district touching
//   the county (see data/countyHouseData.ts), so there's no single incumbent/candidate
//   to attribute — IF and CQ default to neutral (Open / Generic / Generic).
// - Wave Adjustment reuses the parent state's S (Wave Sensitivity Coefficient); no
//   separate county-level S is computed.

function getCountyHistoricalMargins(race: string, fips: string): { year: number; margin: number }[] {
  const years =
    race === "President" ? countyPresidentialData[fips]?.years
    : race === "Senate" || race === "Senate Special" ? countySenateData[fips]?.years
    : race === "Governor" ? countyGovernorData[fips]?.years
    : undefined;
  if (!years) return [];
  const out: { year: number; margin: number }[] = [];
  for (const [year, result] of Object.entries(years)) {
    if (result) out.push({ year: Number(year), margin: result.margin });
  }
  return out;
}

function getCountyNearestPresidential(fips: string, raceYear: number): ImputedLean | null {
  const entry = getCountyHistoricalMargins("President", fips).sort(byNearestYear(raceYear))[0];
  return entry ? { margin: entry.margin, year: entry.year, desc: "county presidential result" } : null;
}

function generateCountyRaceList(fips: string, stateAbbr: string, stateName: string): RaceStub[] {
  const statewideStubs: RaceStub[] = generateRaceList(stateAbbr, stateName)
    .filter((stub) => stub.raceType === "P" || stub.raceType === "S" || stub.raceType === "G")
    .map((stub) => ({ ...stub, historicalMargins: getCountyHistoricalMargins(stub.race, fips) }));

  const houseYears = countyHouseData[fips]?.years;
  const houseHistoricalMargins: { year: number; margin: number }[] = [];
  if (houseYears) {
    for (const [year, result] of Object.entries(houseYears)) {
      if (result) houseHistoricalMargins.push({ year: Number(year), margin: result.margin });
    }
  }
  const houseStubs: RaceStub[] = houseHistoricalMargins
    .filter((m) => m.year >= 2016)
    .map((m) => ({
      race: "House",
      raceType: "H",
      year: m.year,
      eligibility: "eligible" as const,
      incumbent: "Open",
      FF: 1.00,
      historicalMargins: houseHistoricalMargins,
    }));

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3 };
  return [...statewideStubs, ...houseStubs].sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

export function calculateCountyModel(fips: string): StateModelCalculation | null {
  const county = countyPresidentialData[fips];
  if (!county) return null;
  const stateAbbr = county.state;
  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? stateAbbr;
  const fit = getTplFit();
  const beta = fit.beta[stateAbbr]?.shrunk ?? 1; // county reuses the parent state's elasticity
  const stubs = generateCountyRaceList(fips, stateAbbr, stateName);

  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = stub.historicalMargins.find((m) => m.year === stub.year)?.margin ?? null;
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    const ineligible = stub.eligibility !== "eligible";
    const imputation = ineligible ? getCountyNearestPresidential(fips, stub.year) : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(beta * (fit.E[envYear] ?? 0));
    const incumbencyPts = adjustedMargin == null ? null : imputed ? 0 : incumbencyPtsFor(stub.raceType, stub.incumbent);
    const FF_pts = adjustedMargin == null ? null : imputed ? 0 : adjustedMargin * (stub.FF - 1);
    const NM = adjustedMargin != null
      ? adjustedMargin + (incumbencyPts ?? 0) + (FF_pts ?? 0) + (envPts ?? 0)
      : null;
    return {
      ...stub,
      rawMargin,
      incumbencyPts,
      FF_pts,
      adjustedMargin,
      imputed,
      imputedSourceYear: imputation?.year ?? null,
      imputedSourceDesc: imputation?.desc ?? null,
      minValidYear: 0,
      envPts,
      // County rows measure the county, so a residual vs the STATE lean is not an
      // outlier signal — only the imputed discount applies at county granularity.
      aggWeight: imputed ? IMPUTED_RACE_WEIGHT : 1,
      NM,
      inAggregation,
    };
  });

  const { yearAggregations, tpl } = aggregateYears(races);
  return { races, yearAggregations, tpl };
}

export function calculateCountyTpl(fips: string): number {
  return calculateCountyModel(fips)?.tpl ?? 0;
}

// ── Public convenience functions ──────────────────────────────────────────────

export function calculateStateTpl(stateAbbr: string, stateName: string): number {
  return calculateStateModel(stateAbbr, stateName).tpl;
}

// There's no national TPL - the model is built state/district/county-up, not
// aggregated from a national race. The median state TPL is used as a stand-in "how does
// this compare to a typical state" baseline (median, not mean, so no single blowout state
// skews it). Memoized since it's the same computation for every one of this app's ~3,100
// county pages.
let _medianStateTplCache: number | null = null;
export function getMedianStateTpl(): number {
  if (_medianStateTplCache != null) return _medianStateTplCache;
  const tpls = statesData
    .map(({ abbr, name }) => calculateStateTpl(abbr, name))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const mid = Math.floor(tpls.length / 2);
  _medianStateTplCache = tpls.length % 2 !== 0 ? tpls[mid] : (tpls[mid - 1] + tpls[mid]) / 2;
  return _medianStateTplCache;
}

export function calculateDistrictTpl(districtId: string): number {
  // houseData ids are zero-padded ("0804") but districtPresidentialData keys strip leading zeros ("804")
  const normalizedId = parseInt(districtId, 10).toString();
  return calculateDistrictModel(normalizedId).tpl;
}

// Weight given to polling (RCP Average) vs. the structural forecast in the final blend.
export const POLL_WEIGHT = 0.2;

// RCP Average vote shares are stored as 0–1 decimals; convert to an R-positive margin (%).
export function computeRcpMargin(rcpDem?: number | null, rcpRep?: number | null): number | null {
  if (rcpDem == null || rcpRep == null) return null;
  return (rcpRep - rcpDem) * 100;
}

// Single source of truth for a race's projected margin: structural forecast (TPL + generic
// ballot + incumbent, plus fundraising/candidate points once that data exists) blended with the
// RCP Average when available. Every consumer (map, table, state page, race detail pages) should
// read margin off this function so changing an input here updates margin everywhere.
export function computeProjectedMargin(race: {
  id: string;
  state: string;
  raceType: string;
  candidates?: { dem: { party: "D" | "R" | "I"; incumbent: boolean }; rep: { party: "D" | "R" | "I"; incumbent: boolean } };
  rcpDem?: number;
  rcpRep?: number;
}): number {
  const raceTypeMap: Record<string, "H" | "S" | "G"> = { house: "H", senate: "S", governor: "G" };
  const shortType = raceTypeMap[race.raceType];
  const incumbentCandidate = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = (incumbentCandidate?.party === "D" || incumbentCandidate?.party === "R") ? incumbentCandidate.party : null;
  const incumbentPts = shortType ? computeIncumbentPts(shortType, incumbentParty) : 0;

  let structuralMargin: number;
  if (race.raceType === "house") {
    const stateAbbr = statesData.find((s) => s.name === race.state)?.abbr ?? "";
    structuralMargin = calculateDistrictTpl(race.id) + effectiveGenericBallot(stateAbbr) + incumbentPts;
  } else {
    // senate/governor: id may have a numeric suffix (e.g. "DE-2"); strip it to get state abbr
    const stateAbbr = race.id.replace(/-\d+$/, "");
    const effectiveIncumbentPts = race.raceType === "governor" && GOVERNOR_MANUAL_MARGINS[stateAbbr] != null
      ? GOVERNOR_MANUAL_MARGINS[stateAbbr]
      : incumbentPts;
    structuralMargin = calculateStateTpl(stateAbbr, race.state) + effectiveGenericBallot(stateAbbr) + effectiveIncumbentPts;
  }

  const pollingAvg = computeRcpMargin(race.rcpDem, race.rcpRep);
  return pollingAvg != null
    ? (1 - POLL_WEIGHT) * structuralMargin + POLL_WEIGHT * pollingAvg
    : structuralMargin;
}

// ── Effective generic ballot (GB × fitted elasticity β*) ─────────────────────

export function effectiveGenericBallot(stateAbbr: string): number {
  return GENERIC_BALLOT * (getTplFit().beta[stateAbbr]?.shrunk ?? 1);
}

// ── Candidate quality (forward projection) ───────────────────────────────────

export const WQ_ADDITIVE: Record<CQTier, number> = {
  Elite: 4, Strong: 2, Generic: 0, Weak: -2, Sacrificial: -4,
};

export const LQ_ADDITIVE: Record<CQTier, number> = {
  Elite: -4, Strong: -2, Generic: 0, Weak: 2, Sacrificial: 4,
};

export function computeCandidatePts(wqTier: CQTier, lqTier: CQTier): number {
  return WQ_ADDITIVE[wqTier] + LQ_ADDITIVE[lqTier];
}

// ── Fundraising factor (forward projection) ───────────────────────────────────

const FF_K = 0.06;
const FF_MAX = 4;

// rCash and dCash in any consistent unit (dollars, thousands, etc.)
// Returns R-positive pts: positive = R fundraising advantage
export function computeFundraisingPts(rCash: number, dCash: number): number {
  const total = rCash + dCash;
  if (total === 0) return 0;
  const gapPct = ((rCash - dCash) / total) * 100;
  return Math.max(-FF_MAX, Math.min(FF_MAX, gapPct * FF_K));
}

// ── Incumbent factor (forward projection) ────────────────────────────────────

export const INCUMBENT_ADVANTAGE: Record<string, number> = { H: 3, S: 2, G: 7 };

export function computeIncumbentPts(raceType: "H" | "S" | "G", incumbentParty: "D" | "R" | null): number {
  if (!incumbentParty) return 0;
  const pts = INCUMBENT_ADVANTAGE[raceType] ?? 0;
  return incumbentParty === "R" ? pts : -pts;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatForecastMargin(v: number, decimals = 1): string {
  if (Math.abs(v) < 0.05) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(decimals)}`;
}

// Logistic curve: P(D wins) = 1 / (1 + e^(0.13 × margin))
// margin is R-positive convention; result clamped to [0.02, 0.98]
export function marginToProbability(margin: number): number {
  const raw = 1 / (1 + Math.exp(0.13 * margin));
  return Math.max(0.02, Math.min(0.98, raw));
}
