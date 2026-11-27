import "server-only";
/**
 * Legislative-district TPL: the partisan baseline of every state House / Senate district on TODAY's
 * lines, built the way County TPL is built (lib/tplCompute.ts calculateCountyModel) with a Legislature
 * row added. Not the frozen 2026 state-legislative lean (lib/stateLegForecast.ts), which stays as published.
 *
 * Rows (lib/stateLegDistrictRows.ts: precinct returns placed on today's lines):
 *   P   President: the district's margin + environment.
 *   S/G Senate (regular and special), Governor: the district's margin; eligibility, incumbent, appointed
 *       flag and money come from the statewide race (generateRaceList), as County TPL does. An ineligible
 *       race (independent, same-party, unopposed) is imputed from the district's nearest presidential
 *       margin with that year's environment, at IMPUTED_RACE_WEIGHT.
 *   H   U.S. House: no incumbency or money strip (County TPL). The part of the district in a Democrat-v-
 *       Republican race counts as cast; the uncontested part is imputed from its own presidential margin
 *       (user decision 2026-11-26), blended by coverage c: NM = c·(m_c + env(Y)) + (1−c)·(m_u + env(Y_pres)).
 *       c = 0: the whole row is imputed from the district's nearest presidential margin.
 *   L   The chamber's own race, summed onto today's lines from each year's precinct votes. Candidate terms
 *       as in the U.S. House district TPL (user decision 2026-11-26): an incumbency strip and a money strip
 *       for the seats the district's votes came from, vote-weighted; the legislature's own magnitudes
 *       (STATE_LEG_FORECAST_CONSTANTS.INCUMBENCY_PTS, raceMoneyTerm). Coverage blending as for the House.
 *
 * Aggregation: aggregateYears with the House AND Legislature years outlier-checked against the district's
 * own statewide lean (P/S/G rows aggregated alone), as County TPL checks its House years. No quality weight
 * for rows placed by precinct name or town (user decision 2026-11-26).
 */
import type { Chamber } from "../data/stateLegDistricts";
import { stateLegResults } from "../data/stateLegResults";
import { statesData } from "../data/statesData";
import { TPL_GLOBAL_CONSTANTS as G } from "../data/tplModelData";
import {
  aggregateYears, ffStripPts, generateRaceList, getTplFit, incumbencyPtsFor, IMPUTED_RACE_WEIGHT, leanAsOf, raceFundraisingFor,
  type ComputedRace, type RaceStub, type YearAggregation,
} from "./tplCompute";
import { STATE_LEG_FORECAST_CONSTANTS as LC } from "./stateLegForecast";
import { raceMoneyTerm } from "./stateLegMoneyModel";
import { indexByNormalizedKey, lookupByDistrictCode } from "./stateLegDistrictKey";
import { districtRaceRows, voteMargin, type DistrictRaceRow, type RosterEntry } from "./stateLegDistrictRows";

/** The legislative-district model's row: a County TPL row plus its coverage. */
export type LegComputedRace = ComputedRace & {
  office: DistrictRaceRow["office"];
  /** Share of the row's votes in Democrat-v-Republican contests (1 for statewide races). */
  coverage: number;
  /** The uncontested part's imputed presidential margin and its year, where coverage < 1. */
  uncontestedPres?: { year: number; margin: number } | null;
  /** Legislature rows: incumbent sign of the contributing seats, vote-weighted (R +1, D −1). */
  incSign?: number;
  note?: string;
};

export type LegDistrictModel = {
  races: LegComputedRace[];
  yearAggregations: YearAggregation[];
  tpl: number;
  /** The district's statewide lean (P/S/G rows alone): the anchor of the House / Legislature outlier check. */
  anchor: number | null;
  tplOverTime: { year: number; tpl: number }[];
};

const CHECKED = ["H", "L"] as const;
const stubCache = new Map<string, RaceStub[]>();
function statewideStubs(abbr: string): RaceStub[] {
  if (!stubCache.has(abbr)) {
    const name = statesData.find((s) => s.abbr === abbr)?.name ?? abbr;
    stubCache.set(abbr, generateRaceList(abbr, name).filter((s) => s.raceType === "S" || s.raceType === "G"));
  }
  return stubCache.get(abbr)!;
}

function stubFor(abbr: string, office: DistrictRaceRow["office"], year: number): RaceStub | undefined {
  const stubs = statewideStubs(abbr).filter((s) => s.year === year);
  if (office === "GOV") return stubs.find((s) => s.raceType === "G");
  if (office === "USSS") return stubs.find((s) => s.race === "Senate Special");
  // USS: the regular race; a special that was the state's only Senate race that year (AZ 2020) sits in the file as USS.
  return stubs.find((s) => s.race === "Senate") ?? stubs.find((s) => s.race === "Senate Special");
}

function incumbentSign(r: { candidates?: { party: string; incumbent?: boolean }[] } | undefined): number {
  const inc = (r?.candidates ?? []).filter((c) => c.incumbent);
  const parties = new Set(inc.map((c) => c.party));
  if (parties.size !== 1) return 0;
  const p = [...parties][0];
  return p === "R" ? 1 : p === "D" ? -1 : 0;
}

type SeatResult = { key: string; row: { candidates?: { party: string; incumbent?: boolean }[] } };
const seatIndexCache = new Map<string, { index: Record<string, SeatResult>; }>();
/** A precinct file's seat code ("007", "BE1") → that year's result row and its key in the results file. */
function seatResult(abbr: string, chamber: Chamber, year: number, code: string): SeatResult | undefined {
  const ck = `${abbr}|${chamber}|${year}`;
  if (!seatIndexCache.has(ck)) {
    const districts = (stateLegResults as Record<string, Record<string, Partial<Record<Chamber, { districts: Record<string, SeatResult["row"]> }>>>>)[abbr]?.[String(year)]?.[chamber]?.districts ?? {};
    const withKeys: Record<string, SeatResult> = {};
    for (const [key, row] of Object.entries(districts)) withKeys[key] = { key, row };
    seatIndexCache.set(ck, { index: indexByNormalizedKey(withKeys) });
  }
  const { index } = seatIndexCache.get(ck)!;
  return lookupByDistrictCode(index, abbr, chamber, code) ?? lookupByDistrictCode(index, abbr, chamber, code.replace(/^0+(?=\d)/, ""));
}

const LABEL: Record<DistrictRaceRow["office"], string> = { PRES: "President", USS: "Senate", USSS: "Senate Special", GOV: "Governor", USH: "U.S. House", L: "" };
const TYPE: Record<DistrictRaceRow["office"], ComputedRace["raceType"]> = { PRES: "P", USS: "S", USSS: "S", GOV: "G", USH: "H", L: "L" };

/** One district's model from its race rows. */
export function legDistrictModel(abbr: string, chamber: Chamber, rows: DistrictRaceRow[]): LegDistrictModel {
  const fit = getTplFit();
  const env = (y: number) => -(fit.E[y] ?? 0);
  const pres = rows.filter((r) => r.office === "PRES").map((r) => ({ year: r.year, margin: voteMargin(r.all) }));
  const nearestPres = (y: number) => [...pres].sort((a, b) => Math.abs(a.year - y) - Math.abs(b.year - y) || b.year - a.year)[0];
  const chamberLabel = chamber === "house" ? "State House" : "State Senate";
  const races: LegComputedRace[] = [];

  for (const r of rows) {
    if (!(r.year in G.YEAR_WEIGHTS)) continue;
    const raceType = TYPE[r.office];
    const base = {
      race: r.office === "L" ? chamberLabel : LABEL[r.office], raceType, year: r.year, office: r.office,
      historicalMargins: [], minValidYear: 0, inAggregation: true, coverage: r.coverage, note: r.note,
    };
    const imputedRow = (eligibility: RaceStub["eligibility"], incumbent = "Open"): LegComputedRace | null => {
      const src = nearestPres(r.year);
      if (!src) return null;
      return {
        ...base, eligibility, incumbent, rawMargin: voteMargin(r.all), adjustedMargin: src.margin, incumbencyPts: 0, FF_pts: 0, ffDetail: null,
        imputed: true, imputedSourceYear: src.year, imputedSourceDesc: "district presidential result", envPts: env(src.year),
        aggWeight: IMPUTED_RACE_WEIGHT, NM: src.margin + env(src.year), coverage: 0,
      };
    };

    if (r.office === "PRES") {
      const m = voteMargin(r.all);
      races.push({ ...base, eligibility: "eligible", incumbent: "-", rawMargin: m, adjustedMargin: m, incumbencyPts: 0, FF_pts: 0, ffDetail: null,
        imputed: false, imputedSourceYear: null, imputedSourceDesc: null, envPts: env(r.year), aggWeight: 1, NM: m + env(r.year) });
      continue;
    }

    if (raceType === "S" || raceType === "G") {
      const stub = stubFor(abbr, r.office, r.year);
      if (!stub) continue;  // County TPL: a statewide row needs the state's race
      const eligibility = r.sameParty ? "same-party" : stub.eligibility;
      const who = { incumbent: stub.incumbent, incumbentAppointed: stub.incumbentAppointed, demCandidate: stub.demCandidate, repCandidate: stub.repCandidate, demParty: stub.demParty, repParty: stub.repParty };
      if (eligibility !== "eligible") {
        const row = imputedRow(eligibility, stub.incumbent);
        if (row) races.push({ ...row, ...who, race: stub.race });
        continue;
      }
      const m = voteMargin(r.all);
      const incumbencyPts = incumbencyPtsFor(raceType, stub.incumbent, stub.incumbentAppointed);
      const money = raceFundraisingFor(raceType, abbr, undefined, stub.race, r.year);
      const FF_pts = ffStripPts(money);
      races.push({ ...base, ...who, race: stub.race, eligibility, rawMargin: m, adjustedMargin: m, incumbencyPts, FF_pts, ffDetail: money,
        imputed: false, imputedSourceYear: null, imputedSourceDesc: null, envPts: env(r.year), aggWeight: 1, NM: m + incumbencyPts + FF_pts + env(r.year) });
      continue;
    }

    // U.S. House and the Legislature: contested part as cast, uncontested part imputed.
    let c = r.coverage;
    const u = r.uncontestedPres;
    if (c < 1 && !u) c = c > 0 ? 1 : 0;  // no presidential file to impute from: the contested part alone
    if (c <= 0) {
      const row = imputedRow("unopposed");
      if (row) races.push(row);
      continue;
    }
    const mc = voteMargin(r.contested);
    let incumbencyPts = 0, FF_pts = 0, incSignW = 0, incumbent = "Open";
    if (r.office === "L" && r.seats?.length) {
      let moneyW = 0;
      for (const s of r.seats) {
        const seat = seatResult(abbr, chamber, r.year, s.code);
        const sign = incumbentSign(seat?.row);
        incSignW += s.share * sign;
        const term = seat ? raceMoneyTerm(abbr, chamber, seat.key, r.year, sign, LC.MONEY_K, LC.MONEY_CAP) : null;
        moneyW += s.share * (term?.pts ?? 0);
      }
      incumbencyPts = -LC.INCUMBENCY_PTS * incSignW;
      FF_pts = -moneyW;
      incumbent = incSignW > 0.5 ? "R" : incSignW < -0.5 ? "D" : "Open";
    }
    const contestedNM = mc + incumbencyPts + FF_pts + env(r.year);
    const uNM = u ? u.margin + env(u.year) : 0;
    const NM = c * contestedNM + (1 - c) * uNM;
    races.push({
      ...base, eligibility: "eligible", incumbent, rawMargin: mc,
      adjustedMargin: c * mc + (1 - c) * (u?.margin ?? 0),
      incumbencyPts: c * incumbencyPts, FF_pts: c * FF_pts, ffDetail: null,
      imputed: c < 1, imputedSourceYear: c < 1 ? u?.year ?? null : null, imputedSourceDesc: c < 1 ? "uncontested part: its presidential result" : null,
      envPts: c * env(r.year) + (1 - c) * (u ? env(u.year) : 0),
      aggWeight: c + (1 - c) * IMPUTED_RACE_WEIGHT, NM, coverage: c, uncontestedPres: c < 1 ? u : null,
      ...(r.office === "L" ? { incSign: +incSignW.toFixed(3) } : {}),
    });
  }

  const statewide = races.filter((x) => x.raceType === "P" || x.raceType === "S" || x.raceType === "G");
  const anchor = statewide.length ? aggregateYears(statewide).tpl : null;
  const { yearAggregations, tpl } = aggregateYears(races, anchor, CHECKED);
  const tplOverTime = G.YEARS
    .filter((y) => races.some((x) => x.year === y))
    .map((y) => ({ year: y, tpl: leanAsOf(races, y, anchor, CHECKED) }))
    .filter((p): p is { year: number; tpl: number } => p.tpl != null);
  return { races, yearAggregations, tpl, anchor, tplOverTime };
}

/** Every district of a chamber, keyed by normalized atlas district key. */
export function legChamberModels(abbr: string, chamber: Chamber, roster: RosterEntry[]): Map<string, LegDistrictModel> {
  const out = new Map<string, LegDistrictModel>();
  for (const [key, rows] of districtRaceRows(abbr, chamber, roster)) out.set(key, legDistrictModel(abbr, chamber, rows));
  return out;
}

