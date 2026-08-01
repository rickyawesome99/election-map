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
  STATE_MODEL_CONSTANTS,
  STATE_RACE_INPUTS,
  WQ_VALUES,
  LQ_VALUES,
  type RaceModelInputs,
  type CQTier,
} from "@/data/tplModelData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { popVoteData, presIncParty } from "@/data/popVoteData";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";

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
  incumbent: string;
  wqTier: CQTier;
  lqTier: CQTier;
  CQ: number;
  FF: number;
  historicalMargins: { year: number; margin: number }[];
}

// ── Computed race types ───────────────────────────────────────────────────────

export interface ComputedRace extends RaceStub {
  rawMargin: number | null;
  IF: number;
  candidateFactor_pts: number | null;
  FF_pts: number | null;
  adjustedMargin: number | null;
  competitivenessAdjusted: boolean;
  blanketApplied: boolean;
  priorContestedMargin: number | null;
  priorContestedYear: number | null;
  presidentialBaselineMargin: number | null;
  presidentialBaselineYear: number | null;
  minValidYear: number;
  WA: number;
  WFCapped: boolean;
  NM: number | null;
  inAggregation: boolean;
}

export interface YearAggregation {
  year: number;
  racesPresent: string[];
  redistributedWeights: Record<string, number>;
  typeNMs: Record<string, number | null>;
  WRS: number;
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

// ── Competitiveness adjustment constants ──────────────────────────────────────

const NONCOMPETITIVE_MARGIN_THRESHOLD = 50;
const PRIOR_CONTESTED_WEIGHT = 0.6;
const PRESIDENTIAL_BASELINE_WEIGHT = 0.4;
const BLANKET_ADJUSTMENT_MULTIPLIER = 0.8;

interface CompetitivenessAdjustment {
  adjustedMargin: number;
  adjusted: boolean;
  blanketApplied: boolean;
  priorContestedMargin: number | null;
  priorContestedYear: number | null;
  presidentialBaselineMargin: number | null;
  presidentialBaselineYear: number | null;
}

// ── IF lookup tables ──────────────────────────────────────────────────────────

const IF_INCUMBENT_WINS: Record<string, number> = { P: 0.935, S: 0.875, G: 0.835, H: 0.80, L: 0.875 };
const IF_CHALLENGER_WINS: Record<string, number> = { P: 1.07, S: 1.14, G: 1.20, H: 1.25, L: 1.14 };

// ── Helper: incumbent from past result ────────────────────────────────────────

function incumbentFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent">): string {
  if (result?.demIncumbent) return "D";
  if (result?.repIncumbent) return "R";
  return "Open";
}

// ── getPriorPresidentialResult ────────────────────────────────────────────────

function getPriorPresidentialResult(
  stateAbbr: string,
  district: string | undefined,
  year: number,
  minValidYear = 0
): { margin: number; year: number } | null {
  if (district) {
    const districtId = houseData.find((race) => race.name === district)?.id;
    const entry = districtId
      ? (houseStatewideResults[districtId] ?? [])
          .filter((e) => e.race === "President" && e.year <= year && e.year >= minValidYear)
          .sort((a, b) => b.year - a.year)[0]
      : undefined;
    return entry ? { margin: entry.repPct - entry.demPct, year: entry.year } : null;
  }

  const entry = (presPastResults[stateAbbr] ?? [])
    .filter((e) => e.year < year)
    .sort((a, b) => b.year - a.year)[0];
  return entry ? { margin: entry.repPct - entry.demPct, year: entry.year } : null;
}

// ── computeCompetitivenessAdjustment ─────────────────────────────────────────

function computeCompetitivenessAdjustment(
  rawMargin: number,
  stub: RaceStub,
  stateAbbr: string,
  minValidYear = 0
): CompetitivenessAdjustment {
  if (Math.abs(rawMargin) < NONCOMPETITIVE_MARGIN_THRESHOLD) {
    return {
      adjustedMargin: rawMargin,
      adjusted: false,
      blanketApplied: false,
      priorContestedMargin: null,
      priorContestedYear: null,
      presidentialBaselineMargin: null,
      presidentialBaselineYear: null,
    };
  }

  const priorResults = stub.historicalMargins
    .filter((result) => result.year < stub.year && result.year >= minValidYear)
    .sort((a, b) => b.year - a.year);
  const priorContested = priorResults.find(
    (result) => Math.abs(result.margin) < NONCOMPETITIVE_MARGIN_THRESHOLD
  );
  const presidentialResult = getPriorPresidentialResult(
    stateAbbr,
    stub.district,
    stub.year,
    minValidYear
  );

  if (priorContested == null && presidentialResult == null) {
    return {
      adjustedMargin: rawMargin * BLANKET_ADJUSTMENT_MULTIPLIER,
      adjusted: true,
      blanketApplied: true,
      priorContestedMargin: null,
      priorContestedYear: null,
      presidentialBaselineMargin: null,
      presidentialBaselineYear: null,
    };
  }

  const priorContestedMargin = priorContested?.margin ?? presidentialResult!.margin;
  const presidentialMargin = presidentialResult?.margin ?? priorContested!.margin;
  const blendedMargin =
    PRIOR_CONTESTED_WEIGHT * priorContestedMargin +
    PRESIDENTIAL_BASELINE_WEIGHT * presidentialMargin;
  const adjustedMargin =
    Math.abs(blendedMargin) > Math.abs(rawMargin) ? rawMargin : blendedMargin;

  return {
    adjustedMargin,
    adjusted: true,
    blanketApplied: false,
    priorContestedMargin: priorContested?.margin ?? null,
    priorContestedYear: priorContested?.year ?? null,
    presidentialBaselineMargin: presidentialResult?.margin ?? null,
    presidentialBaselineYear: presidentialResult?.year ?? null,
  };
}

// ── computeWF ────────────────────────────────────────────────────────────────

function computeWF(
  base: number,
  NES: number,
  S: number,
  k_mult: number
): { wf: number; capped: boolean } {
  if (base === 0) return { wf: 1.0, capped: false };
  const sign = base > 0 ? 1 : -1;
  const unclamped = 1 / (1 + NES * S * k_mult * sign);
  const clamped = Math.max(0.6, Math.min(1.6, unclamped));
  return { wf: clamped, capped: Math.abs(unclamped - clamped) > 0.0001 };
}

// ── computeIF ────────────────────────────────────────────────────────────────

export function computeIF(raceType: string, incumbent: string, rawMargin: number | null): number {
  if (raceType === "P" || incumbent === "Open" || incumbent === "-" || rawMargin === null) return 1.00;
  const incumbentWon = (incumbent === "R" && rawMargin > 0) || (incumbent === "D" && rawMargin < 0);
  return incumbentWon ? (IF_INCUMBENT_WINS[raceType] ?? 1.00) : (IF_CHALLENGER_WINS[raceType] ?? 1.00);
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
    detailHref?: string
  ): RaceStub {
    const inp = overlay(race, year);
    const presBase = raceType === "P" ? PRESIDENTIAL_INPUTS_BY_YEAR[year] : undefined;
    const wqTier = inp?.wqTier ?? presBase?.wqTier ?? "Generic";
    const lqTier = inp?.lqTier ?? presBase?.lqTier ?? "Generic";
    return {
      race,
      district,
      raceType,
      detailHref,
      year,
      incumbent,
      wqTier,
      lqTier,
      CQ: WQ_VALUES[wqTier] * LQ_VALUES[lqTier],
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
    if (r.year >= 2017) {
      stubs.push(makeStub("President", "P", r.year, undefined, incumbentFromResult(r), presidentialMargins, stateHref));
    }
  }

  function addSenateSeat(seat: { pastResults?: PastResult[] }, detailHref: string) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2017) {
        const raceName = r.electionType === "Special" ? "Senate Special" : "Senate";
        stubs.push(makeStub(raceName, "S", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref));
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
      if (r.year >= 2017) {
        stubs.push(makeStub("Governor", "G", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref));
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
      if (r.year >= 2017) {
        stubs.push(makeStub(`House ${dist.name}`, "H", r.year, dist.name, incumbentFromResult(r), historicalMargins, `/house/${dist.name.toLowerCase()}`));
      }
    }
  }

  // State Legislature
  const legEntries = stateLegData[stateName] ?? [];
  const isUnicameral = stateName === "Nebraska";
  const legYears = [...new Set(legEntries.map((e) => e.year))]
    .filter((year) => {
      if (year < 2018) return false;
      const yearEntries = legEntries.filter((e) => e.year === year);
      if (isUnicameral) return yearEntries.some((e) => e.demVotes != null && e.repVotes != null);
      const hasHouseData = yearEntries.some((e) => e.type === "House" && e.demVotes != null && e.repVotes != null);
      const hasSenateData = yearEntries.some((e) => e.type === "Senate" && e.demVotes != null && e.repVotes != null);
      return hasHouseData && hasSenateData;
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

// ── calculateStateModel ───────────────────────────────────────────────────────

export function calculateStateModel(stateAbbr: string, stateName: string): StateModelCalculation {
  const S = STATE_MODEL_CONSTANTS[stateAbbr]?.S ?? null;
  const stubs = generateRaceList(stateAbbr, stateName);
  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = getRawMargin(stub.race, stub.district, stub.year, stateAbbr, stateName);
    const NES = G.NES_BY_YEAR[stub.year] ?? null;
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    let minValidYear = 0;
    if (stub.raceType === "H" && stub.district) {
      const districtId = houseData.find((r) => r.name === stub.district)?.id;
      if (districtId) {
        const validEntries = (houseDistrictInfo[districtId] ?? []).filter((e) => e.year <= stub.year);
        if (validEntries.length > 0) minValidYear = Math.max(...validEntries.map((e) => e.year));
      }
    }
    const competitiveness =
      rawMargin == null ? null : computeCompetitivenessAdjustment(rawMargin, stub, stateAbbr, minValidYear);
    const adjustedMargin = competitiveness?.adjustedMargin ?? null;
    let IF: number;
    if (stub.raceType === "P") {
      const pifRow = popVoteData.find((r) => r.type === "President" && r.year === stub.year);
      IF = pifRow ? 1 + pifRow.presMargin * G.k_pif * (presIncParty(pifRow.presInc) === "dem" ? 1 : -1) : 1.00;
    } else {
      IF = computeIF(stub.raceType, stub.incumbent, rawMargin);
    }
    const cappedAdj = adjustedMargin != null
      ? Math.sign(adjustedMargin) * Math.min(Math.abs(adjustedMargin), G.CQ_MARGIN_CAP)
      : null;
    const candidateFactor_pts = adjustedMargin != null
      ? stub.raceType === "P"
        ? adjustedMargin * (IF - 1) + (cappedAdj ?? 0) * (stub.CQ - 1)
        : adjustedMargin * (IF * stub.CQ - 1)
      : null;
    const FF_pts = adjustedMargin != null ? adjustedMargin * (stub.FF - 1) : null;
    let WA = 0;
    let wfCapped = false;
    if (adjustedMargin != null && S != null && NES != null) {
      const WA_add = NES * S * G.k_add;
      const { wf, capped } = computeWF(adjustedMargin, NES, S, G.k_mult);
      const WA_mult = adjustedMargin * (1 - wf);
      WA = -(0.70 * WA_add + 0.30 * WA_mult);
      wfCapped = capped;
    }
    const NM = adjustedMargin != null
      ? stub.raceType === "P"
        ? adjustedMargin + (candidateFactor_pts ?? 0) + (FF_pts ?? 0) + WA
        : adjustedMargin * IF * stub.CQ + (FF_pts ?? 0) + WA
      : null;
    return {
      ...stub,
      rawMargin,
      IF,
      candidateFactor_pts,
      FF_pts,
      adjustedMargin,
      competitivenessAdjusted: competitiveness?.adjusted ?? false,
      blanketApplied: competitiveness?.blanketApplied ?? false,
      priorContestedMargin: competitiveness?.priorContestedMargin ?? null,
      priorContestedYear: competitiveness?.priorContestedYear ?? null,
      presidentialBaselineMargin: competitiveness?.presidentialBaselineMargin ?? null,
      presidentialBaselineYear: competitiveness?.presidentialBaselineYear ?? null,
      minValidYear,
      WA,
      WFCapped: wfCapped,
      NM,
      inAggregation,
    };
  });

  const yearAggregations = G.YEARS.map((year) => {
    const yearRaces = races.filter((race) => race.year === year && race.NM != null);
    const typeNMs: Record<string, number | null> = {};
    for (const type of ["P", "G", "S", "H", "L"]) {
      const typeRaces = yearRaces.filter((race) => race.raceType === type);
      typeNMs[type] = typeRaces.length > 0
        ? typeRaces.reduce((sum, race) => sum + (race.NM ?? 0), 0) / typeRaces.length
        : null;
    }
    const racesPresent = ["P", "G", "S", "H", "L"].filter((t) => typeNMs[t] != null);
    const totalBase = racesPresent.reduce((sum, type) => sum + (G.RACE_TYPE_WEIGHTS[type] ?? 0), 0);
    const redistributedWeights: Record<string, number> = {};
    for (const type of racesPresent) {
      redistributedWeights[type] = (G.RACE_TYPE_WEIGHTS[type] ?? 0) / totalBase;
    }
    const WRS = racesPresent.reduce((sum, type) => sum + redistributedWeights[type] * (typeNMs[type] ?? 0), 0);
    return { year, racesPresent, redistributedWeights, typeNMs, WRS };
  });

  const tpl = yearAggregations.reduce(
    (sum, agg) => sum + (G.YEAR_WEIGHTS[agg.year] ?? 0) * agg.WRS,
    0
  );

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

// ── Public convenience functions ──────────────────────────────────────────────

export function calculateStateTpl(stateAbbr: string, stateName: string): number {
  return calculateStateModel(stateAbbr, stateName).tpl;
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

// ── Effective generic ballot (GB × state S) ──────────────────────────────────

const GB_BLEND_K = 0.3;

export function effectiveGenericBallot(stateAbbr: string): number {
  const S = STATE_MODEL_CONSTANTS[stateAbbr]?.S ?? 1;
  return GENERIC_BALLOT * (1 + (S - 1) * GB_BLEND_K);
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
