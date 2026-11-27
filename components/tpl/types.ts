// Client-safe shapes of the TPL pages' data — built by lib/modelSlices.ts on the server and
// passed as props or fetched from app/api/model/*. Only `import type` from the compute hub, so
// nothing here reaches the browser bundle.

import type { YearAggregation } from "@/lib/tplCompute";

/** Which way a place has been moving (lib/leanTrend.ts): its 2020→24 presidential shift (`from` → `to`) beyond the national environment's (`env`), R-positive. Shown beside TPL, never inside it. */
export type LeanTrend = { last: number; prior: number | null; from: number; to: number; env: number };

export type RaceType = "P" | "S" | "G" | "H" | "L";
export type WarOffice = "P" | "S" | "G" | "H";

/** One race in a state's or district's pipeline, with the two nominees' WAR and result link joined on. */
export type TplRace = {
  race: string;
  raceType: RaceType;
  year: number;
  eligibility: string;
  incumbent: string;
  demCandidate?: string;
  repCandidate?: string;
  demParty?: string;
  repParty?: string;
  rawMargin: number | null;
  adjustedMargin: number | null;
  incumbencyPts: number | null;
  FF_pts: number | null;
  ffDetail: { dem: number; rep: number } | null;
  envPts: number | null;
  BS_pts: number | null;
  boundaryShift: number | null;
  /** Neutral margin with the year's environment already removed (what the model aggregates). */
  NM: number | null;
  /** NM before the environment is removed: NM + E(year). What the race table and the matrix show; the environment comes off once, on the year's total. */
  preEnv: number | null;
  /** Imputed rows only: E(year) − E(source year), which carries the stand-in presidential margin into the race year's environment. 0 otherwise. */
  envCarry: number;
  aggWeight: number;
  inAggregation: boolean;
  imputed: boolean;
  imputedSourceYear: number | null;
  imputedSourceDesc: string | null;
  minValidYear: number;
  /** The seat page (/senate/oh2, /house/oh-09, /states/oh). */
  detailHref?: string;
  /** That election's own results page, when one exists (/senate/oh2/2022). */
  pastHref?: string;
  /** State Legislature row: seats counted on their votes, and seats estimated (unopposed; not up). */
  legPools?: { contested: number; unopposed: number; notUp: number };
  demWar: number | null;
  repWar: number | null;
};

export type StateScore = { abbr: string; id: string; name: string; tpl: number; yearWrs: Record<number, number>; trend: number | null; since24: number | null; races: number; yearRaces: Record<number, number> };
export type DistrictScore = { id: string; code: string; state: string; stateName: string; tpl: number; since24: number | null; yearWrs: Record<number, number> };
/** One county on the hub's Counties map: fetched on demand (/api/model/counties), never in the page payload. */
export type CountyScore = { fips: string; name: string; state: string; tpl: number; yearWrs: Record<number, number> };
export type HubCandidate = { candidate: string; party: string; office: WarOffice; race: string; state: string; year: number; war: number };

/** One year of the nation graded the way a state is: each office's neutralized margin (before the
 *  environment is removed) averaged over the states that held it, each state counting by its
 *  presidential turnout, then combined with the year's office weights. */
export type NationalYear = {
  year: number;
  /** Office → the national neutralized margin and how many states it rests on. */
  cells: Record<string, { nm: number; states: number }>;
  /** Office → its share of the year's margin (office weights redistributed among the offices present). */
  shares: Record<string, number>;
  /** The year's national margin before the environment is removed. */
  margin: number;
  /** The model's fitted environment E(year). */
  env: number;
  /** National U.S. House vote with every seat contested (even years), the quantity that pins E = 0. */
  housePv: number | null;
  /** Normalized year weight (recency × coverage), as a state's years are weighted. */
  weight: number;
};

export type ModelSummary = {
  states: StateScore[];
  medianStateTpl: number;
  districts: DistrictScore[];
  medianDistrictTpl: number;
  lensYears: number[];
  fitYears: number[];
  yearDecay: number;
  topWar: { year: number; rows: HubCandidate[] };
  racesScored: number;
  performances: number;
  national: NationalYear[];
  /** Σ weight × (margin − env): the nation's TPL under the state grading. */
  nationalTpl: number;
};

/** A slimmed WAR row: what the candidates view and the state page's candidates section show. */
export type WarSlim = {
  candidate: string;
  party: string;
  office: WarOffice;
  race: string;
  state: string;
  year: number;
  actual: number;
  expected: number;
  vsOpp: number;
  /** actual − expected, signed toward the candidate: the race's net two-candidate effect. */
  residual: number;
  /** What the candidate's own incumbency is worth vs a non-incumbent replacement (0 if not the incumbent). */
  incumb: number;
  effect: number;
  effectN: number;
  oppEffect: number;
  war: number;
  // The terms behind Expected and WAR, for the row's calculation on the WAR tab (rounded to 0.01).
  /** The state's (House: the district's) own vote that year with this race left out, R-positive; null where nothing else was on the ballot. */
  base?: number | null;
  /** 0–1: how much of the baseline is `base`; the modelled baseline (`leanBase`) carries the rest. */
  baseW?: number;
  leanBase?: number;
  /** House rows: points added to Expected for how the state's other House races ran that year. */
  houseOthers?: number;
  /** R-positive points of structural money in Expected. */
  moneyPts?: number;
  /** The candidate's record going into the race (their other races, recency-weighted and shrunk), signed toward them. */
  record?: number;
  /** Effective races behind the record: recency weights over the other races, plus one. */
  effectW?: number;
  seatId?: string;
  pastHref?: string;
};

export type TplAsOf = { year: number; tpl: number; wrs: number; weight: number };

export type StatePageData = {
  abbr: string;
  id: string;
  name: string;
  tpl: number;
  medianStateTpl: number;
  medianDistrictTpl: number;
  /** 1 = most Republican of the 50. */
  rank: number;
  trend: LeanTrend | null;
  /** TPL now minus TPL as it stood after 2024 under today's model (leanAsOf), R-positive. */
  since24: number | null;
  /** TPL as it stood after each weighted year under today's model (leanAsOf), oldest first, beside that year's WRS. */
  tplOverTime: TplAsOf[];
  E: Record<number, number>;
  fitYears: number[];
  incumbentAdvantage: Record<string, number>;
  typeWeights: Record<string, number>;
  typeWeightsMidterm: Record<string, number>;
  yearDecay: number;
  races: TplRace[];
  yearAggregations: YearAggregation[];
  districts: { id: string; code: string; num: number; tpl: number }[];
  /** County FIPS → County TPL (null where the county has none), for the county map at the foot of the page. */
  countyTpl: Record<string, number | null>;
  /** County FIPS → its 2024 presidential ballots, shown beside the TPL in the map's popup. */
  countyVotes: Record<string, number | null>;
};

export type DistrictPageData = {
  id: string;
  code: string;
  state: string;
  stateName: string;
  name: string;
  tpl: number;
  stateTpl: number;
  trend: LeanTrend | null;
  since24: number | null;
  eraStart: number;
  incumbent: { name: string; party: "D" | "R"; since: number } | null;
  seatHref: string;
  races: TplRace[];
  yearAggregations: YearAggregation[];
  tplOverTime: TplAsOf[];
};

/** A county page's TPL section: the same rows and year aggregations a state page gets. */
export type CountyPageData = {
  fips: string;
  /** "Franklin County". */
  name: string;
  state: string;
  stateId: string;
  stateName: string;
  tpl: number;
  stateTpl: number;
  medianStateTpl: number;
  E: Record<number, number>;
  incumbentAdvantage: Record<string, number>;
  races: TplRace[];
  yearAggregations: YearAggregation[];
  /** TPL as it stood after each weighted year under today's model, oldest first. */
  tplOverTime: TplAsOf[];
};

/** Row fields at their usual value, left out of the legislative-district TPL files and restored by the page. */
export const LEG_ROW_DEFAULTS: Record<string, unknown> = { eligibility: "eligible", incumbent: "Open", incumbencyPts: 0, FF_pts: 0, envCarry: 0, aggWeight: 1, inAggregation: true, imputed: false, minValidYear: 0 };

/** A state-legislative district's TPL section (lib/stateLegTplPage.ts), fetched from public/state-leg-tpl/. */
export type StateLegTplPageData = {
  state: string;
  stateId: string;
  stateName: string;
  chamber: "house" | "senate";
  tpl: number;
  stateTpl: number;
  /** The district's statewide lean (President, Senate, Governor alone): the anchor of the House / Legislature outlier check. */
  anchor: number | null;
  E: Record<number, number>;
  incumbentAdvantage: Record<string, number>;
  /** Rows as a county's, plus coverage (share of the votes in Democrat-v-Republican races) where under 1 and the round note. */
  races: (TplRace & { coverage?: number; note?: string })[];
  yearAggregations: YearAggregation[];
  tplOverTime: TplAsOf[];
};

export type { YearAggregation };
