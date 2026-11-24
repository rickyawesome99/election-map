import { candidateSlug } from "@/lib/candidateSlug";
import "server-only";

// ── /model page data slices ───────────────────────────────────────────────────
// The TPL tab is three prerendered pages — the map hub (/model), one page per state
// (/model/oh, with that state's districts inside it) and the candidates view
// (/war) — all client components that must never import lib/tplCompute
// (it drags the compute hub and every dataset behind it into the browser bundle). Everything
// they show is computed here at build time and passed as props; the two selections a reader
// makes on the page (another district, the full WAR table) come from the static routes under
// app/api/model/.

import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countyDisplayName } from "@/lib/countyName";
import { presPastResults } from "@/data/forecastData";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { stateLeanTrend, districtLeanTrend } from "@/lib/leanTrend";
import { pastElectionHref, type PastElectionOffice } from "@/lib/pastElections";
import {
  calculateStateModel,
  calculateDistrictModel,
  calculateCountyModel,
  computeWarTable,
  getTplFit,
  leanAsOf,
  raceTypeWeightsFor,
  incumbentAdvantage,
  type ComputedRace,
  type YearAggregation,
  type WarRow,
} from "@/lib/tplCompute";
import type {
  CountyScore, DistrictPageData, DistrictScore, HubCandidate, ModelSummary, NationalYear, StatePageData, TplAsOf, StateScore, TplRace, WarSlim,
} from "@/components/tpl/types";

export type { CountyScore, ModelSummary, StatePageData, DistrictPageData, WarSlim } from "@/components/tpl/types";

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

// Races in the aggregation per lens year — the Races column under a year lens.
function yearRacesOf(races: { year: number; inAggregation: boolean }[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of races) if (r.inAggregation && LENS_YEARS.includes(r.year)) out[r.year] = (out[r.year] ?? 0) + 1;
  return out;
}

const OFFICE_OF: Record<WarRow["office"], PastElectionOffice> = { P: "president", S: "senate", G: "governor", H: "house" };

const r2 = (v: number) => Math.round(v * 100) / 100;
function slimWar(r: WarRow): WarSlim {
  return {
    candidate: r.candidate, party: r.party, office: r.office, race: r.race, state: r.state, year: r.year,
    actual: r.actual, expected: r.expected, vsOpp: r.expectedVsOpponent, residual: r.residual, incumb: r.replacementPts, effect: r.effect, effectN: r.effectN,
    oppEffect: r.opponentEffect, war: r.war, seatId: r.seatId,
    base: r.generic == null ? null : r2(r.generic), baseW: r2(r.genericWeight), leanBase: r2(r.leanBaseline), houseOthers: r2(r.houseOthers),
    moneyPts: r2(r.ffStructuralPts), record: r2(r.record ?? 0), effectW: r2(r.effectW),
    pastHref: r.seatId ? pastElectionHref(OFFICE_OF[r.office], r.seatId, r.year) : undefined,
  };
}

let warCache: WarSlim[] | null = null;
/** Every scored candidate-performance, slimmed to what the pages show (~half the full row). */
export function warSlice(): WarSlim[] {
  return (warCache ??= computeWarTable().map(slimWar));
}

// One candidate's WAR rows, oldest first — the /candidates/[slug] profile's WAR section.
let warByCandidate: Map<string, WarSlim[]> | null = null;
export function warForCandidate(name: string, state?: string | null): WarSlim[] {
  if (!warByCandidate) {
    warByCandidate = new Map();
    for (const r of warSlice()) {
      const list = warByCandidate.get(r.candidate);
      if (list) list.push(r); else warByCandidate.set(r.candidate, [r]);
    }
    for (const list of warByCandidate.values()) list.sort((a, b) => a.year - b.year);
  }
  // Two people can share a name (lib/candidateSlug.ts): keep the rows from this person's own state.
  const slug = candidateSlug(name, state);
  return (warByCandidate.get(name) ?? []).filter((r) => candidateSlug(r.candidate, r.state) === slug);
}

// WAR looked up by (state, office, race label, year, candidate name) — the join key the race
// stubs and the WAR rows share.
let warIndex: Map<string, WarSlim> | null = null;
function warFor(state: string, office: string, race: string, year: number, candidate: string | undefined): number | null {
  if (!candidate) return null;
  warIndex ??= new Map(warSlice().map((r) => [`${r.state}|${r.office}|${r.race}|${r.year}|${r.candidate}`, r]));
  return warIndex.get(`${state}|${office}|${race}|${year}|${candidate}`)?.war ?? null;
}

/** A TPL row's individual past-election page (/senate/oh/2022), when one exists. Shared with the county page's TPL table. */
export function pastHrefOf(stateAbbr: string, r: ComputedRace): string | undefined {
  const stateId = statesData.find((s) => s.abbr === stateAbbr)?.id ?? stateAbbr.toLowerCase();
  switch (r.raceType) {
    case "P": return pastElectionHref("president", stateId, r.year);
    case "S": return r.detailHref ? pastElectionHref("senate", r.detailHref.split("/").pop()!, r.year) : undefined;
    case "G": return pastElectionHref("governor", stateId, r.year);
    case "H": return pastElectionHref("house", r.race.replace(/^House /, "").toLowerCase(), r.year);
    default: return undefined;
  }
}

// The pages show margins BEFORE the environment is removed and take it off once, on the year's
// total. Every row of a year then carries the same E(year): an imputed row, whose stand-in
// presidential margin comes from another year, is first carried into the race year's environment
// (envCarry), which is the same arithmetic as stripping E(source year) from it directly.
const envOf = (year: number) => getTplFit().E[year] ?? 0;
const withEnv = (aggs: YearAggregation[]): YearAggregation[] => aggs.map((a) => ({ ...a, env: envOf(a.year) }));

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
    NM: r.NM, preEnv: r.NM == null ? null : r.NM + envOf(r.year), envCarry: r.imputed && r.envPts != null ? r.envPts + envOf(r.year) : 0, aggWeight: r.aggWeight, inAggregation: r.inAggregation,
    imputed: r.imputed, imputedSourceYear: r.imputedSourceYear, imputedSourceDesc: r.imputedSourceDesc, minValidYear: r.minValidYear,
    detailHref: r.detailHref, pastHref: pastHrefOf(stateAbbr, r), legPools: r.legPools,
    // Presidential WAR is a statewide number, so a district's presidential row shows the nominees without it.
    demWar: office && r.demCandidate ? warFor(stateAbbr, office, r.race, r.year, r.demCandidate) : null,
    repWar: office && r.repCandidate ? warFor(stateAbbr, office, r.race, r.year, r.repCandidate) : null,
  };
}

// ── Summary (the map hub) ─────────────────────────────────────────────────────

// "Since 2024": the lean now minus the lean as it stood after the 2024 election, both under today's model.
const SINCE_YEAR = 2024;
const since = (now: number, then: number | null) => (then == null ? null : now - then);

// ── The nation, graded as a state ─────────────────────────────────────────────
// A reference for reading the fitted environment: the same neutralized margins the states are
// built from (incumbency and money removed, missing contests filled in), before any environment
// is removed, averaged across the states that held each office. A state counts by its total
// presidential vote in the nearest presidential year (ties to the later one), so every office uses
// the same state sizes and an uncontested race's thin turnout cannot shrink a state. The offices
// are then combined with the year's office weights, redistributed among the offices present,
// and the years weighted by recency × coverage, exactly as a state's are.
const OFFICES = ["P", "H", "S", "L", "G"];
function stateSize(abbr: string, year: number): number {
  const rows = (presPastResults[abbr] ?? []).filter((r) => (r.totalVotes ?? 0) > 0);
  const nearest = rows.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || b.year - a.year)[0];
  return nearest?.totalVotes ?? 0;
}
function nationalReference(stateAggs: Record<string, YearAggregation[]>): NationalYear[] {
  const fit = getTplFit();
  const housePv = new Map((fit.neutral?.points ?? []).map((p) => [p.year, p.housePv]));
  const years: NationalYear[] = [];
  for (const year of G.YEARS) {
    const env = fit.E[year] ?? 0;
    const cells: NationalYear["cells"] = {};
    for (const type of OFFICES) {
      let num = 0, den = 0, n = 0;
      for (const [abbr, aggs] of Object.entries(stateAggs)) {
        const nm = aggs.find((a) => a.year === year)?.typeNMs[type];
        const size = stateSize(abbr, year);
        if (nm == null || size <= 0) continue;
        num += size * (nm + env); den += size; n += 1;
      }
      if (den > 0) cells[type] = { nm: num / den, states: n };
    }
    const present = OFFICES.filter((t) => cells[t]);
    if (present.length === 0) continue;
    const W = raceTypeWeightsFor(year);
    const coverage = present.reduce((sum, t) => sum + (W[t] ?? 0), 0);
    if (coverage <= 0) continue;
    const shares = Object.fromEntries(present.map((t) => [t, (W[t] ?? 0) / coverage]));
    const margin = present.reduce((sum, t) => sum + shares[t] * cells[t].nm, 0);
    years.push({ year, cells, shares, margin, env, housePv: housePv.get(year) ?? null, weight: (G.YEAR_WEIGHTS[year] ?? 0) * coverage });
  }
  const total = years.reduce((sum, y) => sum + y.weight, 0);
  for (const y of years) y.weight = total > 0 ? y.weight / total : 0;
  return years;
}

// Every county with a County TPL, for the hub's Counties map and ranked table. Values are rounded
// to two decimals to keep the file small (~3,100 rows); the county pipeline has no 2026 rows yet,
// so this is the lean as of the county files' last year.
let countyCache: CountyScore[] | null = null;
export function countySlice(): CountyScore[] {
  if (countyCache) return countyCache;
  const round = (v: number) => Math.round(v * 100) / 100;
  const out: CountyScore[] = [];
  for (const [fips, county] of Object.entries(countyPresidentialData)) {
    const calc = calculateCountyModel(fips);
    if (!calc || !calc.races.some((race) => race.NM != null)) continue;
    const wrs = yearWrsOf(calc.yearAggregations);
    out.push({ fips, name: countyDisplayName(fips, county.countyName), state: county.state, tpl: round(calc.tpl), yearWrs: Object.fromEntries(Object.entries(wrs).map(([y, v]) => [y, round(v)])) });
  }
  countyCache = out;
  return out;
}

let summaryCache: ModelSummary | null = null;
export function buildModelSummary(): ModelSummary {
  if (summaryCache) return summaryCache;
  const fit = getTplFit();
  const stateAggs: Record<string, YearAggregation[]> = {};
  const states: StateScore[] = statesData.map((s) => {
    const calc = calculateStateModel(s.abbr, s.name);
    stateAggs[s.abbr] = calc.yearAggregations;
    return { abbr: s.abbr, id: s.id, name: s.name, tpl: calc.tpl, since24: since(calc.tpl, leanAsOf(calc.races, SINCE_YEAR, fit.lean[s.abbr])), yearWrs: yearWrsOf(calc.yearAggregations), trend: stateLeanTrend(s.abbr)?.last ?? null, races: calc.races.filter((r) => r.inAggregation).length, yearRaces: yearRacesOf(calc.races) };
  });
  const districts: DistrictScore[] = Object.entries(districtPresidentialData).map(([id, d]) => {
    const calc = calculateDistrictModel(id);
    return { id, code: d.code, state: d.state, stateName: d.stateName, tpl: calc.tpl, since24: since(calc.tpl, leanAsOf(calc.races, SINCE_YEAR)), yearWrs: yearWrsOf(calc.yearAggregations) };
  });
  const war = warSlice();
  // The newest full cycle: odd years hold only a handful of governor races.
  const latestYear = Math.max(...war.map((r) => r.year).filter((y) => y % 2 === 0));
  const latest = war.filter((r) => r.year === latestYear).sort((a, b) => b.war - a.war);
  const toHub = (r: WarSlim): HubCandidate => ({ candidate: r.candidate, party: r.party, office: r.office, race: r.race, state: r.state, year: r.year, war: r.war });
  const national = nationalReference(stateAggs);
  summaryCache = {
    national,
    nationalTpl: national.reduce((sum, y) => sum + y.weight * (y.margin - y.env), 0),
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

/** TPL as it stood after each weighted year under today's model, oldest first. Pass the state's fitted lean for a state. */
function tplOverTime(calc: { races: Parameters<typeof leanAsOf>[0]; yearAggregations: YearAggregation[] }, houseAnchor?: number | null): TplAsOf[] {
  return calc.yearAggregations
    .filter((y) => y.finalWeight > 0)
    .sort((a, b) => a.year - b.year)
    .flatMap((y) => {
      const asOf = leanAsOf(calc.races, y.year, houseAnchor);
      return asOf == null ? [] : [{ year: y.year, tpl: asOf, wrs: y.WRS, weight: y.finalWeight }];
    });
}

export function stateModelSlice(abbrRaw: string): StatePageData | null {
  const state = statesData.find((s) => s.abbr === abbrRaw.toUpperCase());
  if (!state) return null;
  const summary = buildModelSummary();
  const fit = getTplFit();
  const calc = calculateStateModel(state.abbr, state.name);
  const rank = [...summary.states].sort((a, b) => b.tpl - a.tpl).findIndex((s) => s.abbr === state.abbr) + 1;
  return {
    abbr: state.abbr, id: state.id, name: state.name,
    tpl: calc.tpl, medianStateTpl: summary.medianStateTpl, medianDistrictTpl: summary.medianDistrictTpl, rank,
    trend: stateLeanTrend(state.abbr), since24: summary.states.find((s) => s.abbr === state.abbr)?.since24 ?? null, E: fit.E, fitYears: fit.years, incumbentAdvantage: incumbentAdvantage(),
    typeWeights: G.RACE_TYPE_WEIGHTS, typeWeightsMidterm: G.RACE_TYPE_WEIGHTS_MIDTERM, yearDecay: summary.yearDecay,
    races: calc.races.map((r) => toTplRace(state.abbr, r)),
    yearAggregations: withEnv(calc.yearAggregations),
    tplOverTime: tplOverTime(calc, fit.lean[state.abbr]),
    districts: districtsOf(state.abbr),
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
    tpl: calc.tpl, stateTpl: stateCalc?.tpl ?? 0, trend: districtLeanTrend(id), since24: since(calc.tpl, leanAsOf(calc.races, SINCE_YEAR)), eraStart: calc.eraStart,
    incumbent: latestHouse ? { name: (latestHouse.rawMargin! > 0 ? latestHouse.repCandidate : latestHouse.demCandidate) ?? "", party: latestHouse.rawMargin! > 0 ? "R" : "D", since: latestHouse.year } : null,
    seatHref: `/house/${d.code.toLowerCase()}`,
    races, yearAggregations: withEnv(calc.yearAggregations), tplOverTime: tplOverTime(calc),
  };
}

export const modelStateParams = () => statesData.map((s) => ({ abbr: s.id }));
export const modelDistrictParams = () => Object.keys(districtPresidentialData).map((id) => ({ id }));
