import "server-only";

// ── /model page data slices ───────────────────────────────────────────────────
// The TPL tab is three prerendered pages — the map hub (/model), one page per state
// (/model/states/oh, with that state's districts inside it) and the candidates view
// (/model/candidates) — all client components that must never import lib/tplCompute
// (it drags the compute hub and every dataset behind it into the browser bundle). Everything
// they show is computed here at build time and passed as props; the two selections a reader
// makes on the page (another district, the full WAR table) come from the static routes under
// app/api/model/.

import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { pastElectionHref, type PastElectionOffice } from "@/lib/pastElections";
import {
  calculateStateModel,
  calculateDistrictModel,
  computeWarTable,
  getTplFit,
  incumbentAdvantage,
  type ComputedRace,
  type YearAggregation,
  type TplFitStateBeta,
  type WarRow,
} from "@/lib/tplCompute";
import type {
  DistrictPageData, DistrictScore, HubCandidate, ModelSummary, StatePageData, StateScore, TplRace, WarSlim,
} from "@/components/tpl/types";

export type { ModelSummary, StatePageData, DistrictPageData, WarSlim } from "@/components/tpl/types";

/** The cycles every state has a result for — what the map's year lens can switch between. */
export const LENS_YEARS = [2016, 2018, 2020, 2022, 2024];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
}

function yearWrsOf(aggs: YearAggregation[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const a of aggs) if (a.finalWeight > 0 && LENS_YEARS.includes(a.year)) out[a.year] = a.WRS;
  return out;
}

const OFFICE_OF: Record<WarRow["office"], PastElectionOffice> = { P: "president", S: "senate", G: "governor", H: "house" };

function slimWar(r: WarRow): WarSlim {
  return {
    candidate: r.candidate, party: r.party, office: r.office, race: r.race, state: r.state, year: r.year,
    actual: r.actual, expected: r.expected, vsOpp: r.expectedVsOpponent, effect: r.effect, effectN: r.effectN,
    oppEffect: r.opponentEffect, war: r.war, seatId: r.seatId,
    pastHref: r.seatId ? pastElectionHref(OFFICE_OF[r.office], r.seatId, r.year) : undefined,
  };
}

let warCache: WarSlim[] | null = null;
/** Every scored candidate-performance, slimmed to what the pages show (~half the full row). */
export function warSlice(): WarSlim[] {
  return (warCache ??= computeWarTable().map(slimWar));
}

// WAR looked up by (state, office, race label, year, candidate name) — the join key the race
// stubs and the WAR rows share.
let warIndex: Map<string, WarSlim> | null = null;
function warFor(state: string, office: string, race: string, year: number, candidate: string | undefined): number | null {
  if (!candidate) return null;
  warIndex ??= new Map(warSlice().map((r) => [`${r.state}|${r.office}|${r.race}|${r.year}|${r.candidate}`, r]));
  return warIndex.get(`${state}|${office}|${race}|${year}|${candidate}`)?.war ?? null;
}

function pastHrefOf(stateAbbr: string, r: ComputedRace): string | undefined {
  const stateId = statesData.find((s) => s.abbr === stateAbbr)?.id ?? stateAbbr.toLowerCase();
  switch (r.raceType) {
    case "P": return pastElectionHref("president", stateId, r.year);
    case "S": return r.detailHref ? pastElectionHref("senate", r.detailHref.split("/").pop()!, r.year) : undefined;
    case "G": return pastElectionHref("governor", stateId, r.year);
    case "H": return pastElectionHref("house", r.race.replace(/^House /, "").toLowerCase(), r.year);
    default: return undefined;
  }
}

function toTplRace(stateAbbr: string, r: ComputedRace, presNames?: { dem?: string; rep?: string }): TplRace {
  // District presidential rows carry no nominee names; the state's row for that year does.
  const dem = r.demCandidate ?? presNames?.dem;
  const rep = r.repCandidate ?? presNames?.rep;
  const office = r.raceType === "L" ? null : r.raceType;
  return {
    race: r.race, raceType: r.raceType, year: r.year, eligibility: r.eligibility, incumbent: r.incumbent,
    demCandidate: dem, repCandidate: rep, demParty: r.demParty, repParty: r.repParty,
    rawMargin: r.rawMargin, adjustedMargin: r.adjustedMargin, incumbencyPts: r.incumbencyPts, FF_pts: r.FF_pts,
    ffDetail: r.ffDetail, envPts: r.envPts, BS_pts: r.BS_pts ?? null, boundaryShift: r.boundaryShift ?? null,
    NM: r.NM, aggWeight: r.aggWeight, inAggregation: r.inAggregation,
    imputed: r.imputed, imputedSourceYear: r.imputedSourceYear, imputedSourceDesc: r.imputedSourceDesc, minValidYear: r.minValidYear,
    detailHref: r.detailHref, pastHref: pastHrefOf(stateAbbr, r),
    // Presidential WAR is a statewide number, so a district's presidential row shows the nominees without it.
    demWar: office && r.demCandidate ? warFor(stateAbbr, office, r.race, r.year, r.demCandidate) : null,
    repWar: office && r.repCandidate ? warFor(stateAbbr, office, r.race, r.year, r.repCandidate) : null,
  };
}

// ── Summary (the map hub) ─────────────────────────────────────────────────────

let summaryCache: ModelSummary | null = null;
export function buildModelSummary(): ModelSummary {
  if (summaryCache) return summaryCache;
  const fit = getTplFit();
  const states: StateScore[] = statesData.map((s) => {
    const calc = calculateStateModel(s.abbr, s.name);
    return { abbr: s.abbr, id: s.id, name: s.name, tpl: calc.tpl, yearWrs: yearWrsOf(calc.yearAggregations), beta: fit.beta[s.abbr]?.shrunk ?? 1, races: calc.races.filter((r) => r.inAggregation).length };
  });
  const districts: DistrictScore[] = Object.entries(districtPresidentialData).map(([id, d]) => {
    const calc = calculateDistrictModel(id);
    return { id, code: d.code, state: d.state, stateName: d.stateName, tpl: calc.tpl, yearWrs: yearWrsOf(calc.yearAggregations) };
  });
  const war = warSlice();
  // The newest full cycle: odd years hold only a handful of governor races.
  const latestYear = Math.max(...war.map((r) => r.year).filter((y) => y % 2 === 0));
  const latest = war.filter((r) => r.year === latestYear).sort((a, b) => b.war - a.war);
  const toHub = (r: WarSlim): HubCandidate => ({ candidate: r.candidate, party: r.party, office: r.office, race: r.race, state: r.state, year: r.year, war: r.war });
  summaryCache = {
    states,
    medianStateTpl: median(states.map((s) => s.tpl)),
    districts,
    medianDistrictTpl: median(districts.map((d) => d.tpl)),
    lensYears: LENS_YEARS,
    fitYears: fit.years,
    yearDecay: G.YEAR_WEIGHTS[2023] / G.YEAR_WEIGHTS[2024], // 0.75: each year back is worth this much of the next
    topWar: { year: latestYear, rows: [...latest.slice(0, 4), ...latest.slice(-1).filter((r) => !latest.slice(0, 4).includes(r))].map(toHub) },
    racesScored: new Set(war.map((r) => `${r.state}|${r.office}|${r.race}|${r.year}`)).size,
    performances: war.length,
  };
  return summaryCache;
}

// ── State page ────────────────────────────────────────────────────────────────

function districtsOf(abbr: string): StatePageData["districts"] {
  const summary = buildModelSummary();
  return summary.districts
    .filter((d) => d.state === abbr)
    .map((d) => ({ id: d.id, code: d.code, num: parseInt(d.code.split("-")[1], 10), tpl: d.tpl }))
    .sort((a, b) => a.num - b.num);
}

export function stateModelSlice(abbrRaw: string): StatePageData | null {
  const state = statesData.find((s) => s.abbr === abbrRaw.toUpperCase());
  if (!state) return null;
  const summary = buildModelSummary();
  const fit = getTplFit();
  const calc = calculateStateModel(state.abbr, state.name);
  const rank = [...summary.states].sort((a, b) => b.tpl - a.tpl).findIndex((s) => s.abbr === state.abbr) + 1;
  const beta: TplFitStateBeta | null = fit.beta[state.abbr] ?? null;
  return {
    abbr: state.abbr, id: state.id, name: state.name,
    tpl: calc.tpl, medianStateTpl: summary.medianStateTpl, medianDistrictTpl: summary.medianDistrictTpl, rank,
    beta, E: fit.E, fitYears: fit.years, incumbentAdvantage: incumbentAdvantage(),
    typeWeights: G.RACE_TYPE_WEIGHTS, yearDecay: summary.yearDecay,
    races: calc.races.map((r) => toTplRace(state.abbr, r)),
    yearAggregations: calc.yearAggregations,
    districts: districtsOf(state.abbr),
    statewideWar: warSlice().filter((r) => r.state === state.abbr && r.office !== "H").sort((a, b) => b.year - a.year || b.war - a.war),
  };
}

// ── District (fetched into the state page's district section) ────────────────

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function districtModelSlice(id: string): DistrictPageData | null {
  const d = districtPresidentialData[id];
  if (!d) return null;
  const calc = calculateDistrictModel(id);
  const state = statesData.find((s) => s.abbr === d.state);
  const stateCalc = state ? calculateStateModel(state.abbr, state.name) : null;
  const presNames = (year: number) => {
    const p = stateCalc?.races.find((r) => r.raceType === "P" && r.year === year);
    return { dem: p?.demCandidate, rep: p?.repCandidate };
  };
  const num = parseInt(d.code.split("-")[1], 10);
  const atLarge = Object.values(districtPresidentialData).filter((x) => x.state === d.state).length === 1;
  const races = calc.races.map((r) => toTplRace(d.state, r, r.raceType === "P" ? presNames(r.year) : undefined));
  const latestHouse = races.filter((r) => r.raceType === "H" && r.rawMargin != null).sort((a, b) => b.year - a.year)[0];
  return {
    id, code: d.code, state: d.state, stateName: d.stateName,
    name: atLarge ? `${d.stateName} At-Large` : `${d.stateName}'s ${ordinal(num)}`,
    tpl: calc.tpl, stateTpl: stateCalc?.tpl ?? 0, eraStart: calc.eraStart,
    incumbent: latestHouse ? { name: (latestHouse.rawMargin! > 0 ? latestHouse.repCandidate : latestHouse.demCandidate) ?? "", party: latestHouse.rawMargin! > 0 ? "R" : "D", since: latestHouse.year } : null,
    seatHref: `/house/${d.code.toLowerCase()}`,
    races, yearAggregations: calc.yearAggregations,
  };
}

export const modelStateParams = () => statesData.map((s) => ({ abbr: s.id }));
export const modelDistrictParams = () => Object.keys(districtPresidentialData).map((id) => ({ id }));
