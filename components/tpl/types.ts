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
  NM: number | null;
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
export type HubCandidate = { candidate: string; party: string; office: WarOffice; race: string; state: string; year: number; war: number };

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
  seatId?: string;
  pastHref?: string;
};

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
  E: Record<number, number>;
  fitYears: number[];
  incumbentAdvantage: Record<string, number>;
  typeWeights: Record<string, number>;
  typeWeightsMidterm: Record<string, number>;
  yearDecay: number;
  races: TplRace[];
  yearAggregations: YearAggregation[];
  districts: { id: string; code: string; num: number; tpl: number }[];
  statewideWar: WarSlim[];
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
};

export type { YearAggregation };
