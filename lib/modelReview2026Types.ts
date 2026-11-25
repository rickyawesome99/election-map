// Client-safe shapes for the 2026 Model Review (/analysis/model-review). Built on the server by
// lib/modelReview2026.ts. Margins are R-positive points of all votes cast, as everywhere on the
// site; a "miss" is result minus forecast, so a negative miss means Democrats beat the forecast.

export type MrOffice = "house" | "senate" | "governor";
export const MR_OFFICES: [MrOffice, string][] = [["house", "House"], ["senate", "Senate"], ["governor", "Governor"]];
export const MR_OFFICE_NAME: Record<MrOffice, string> = { house: "House", senate: "Senate", governor: "Governor" };
export type MrGrade = "A" | "B" | "C" | "D" | "F";
export const MR_GRADES: MrGrade[] = ["A", "B", "C", "D", "F"];

/** One contested race: the frozen final forecast beside the result on file. */
export type MrRace = {
  office: MrOffice;
  id: string;
  /** "Alaska", "Florida (special)", "AK-01". */
  label: string;
  abbr: string;
  href: string;
  /** The map's key: the state's name, or the House district's numeric id ("201"). */
  mapKey: string;
  dem: string;
  rep: string;
  /** The party letter of the candidate in the Democratic slot ("I" for an independent standing in). */
  demParty: string;
  /** Forecast margin, its 80% range, and the Democratic slot's win probability. */
  f: number;
  lo: number;
  hi: number;
  pDem: number;
  rating: string;
  /** The fundamentals-only margin, the poll average at face value (null with no polls) and the weight the polls got. */
  model: number;
  poll: number | null;
  w: number;
  nPoll: number;
  /** Result margin and whether the race has been called. */
  a: number;
  called: boolean;
  demWon: boolean;
  right: boolean;
  /** Result minus forecast; and the same with the office's average miss taken out. */
  err: number;
  rel: number;
  grade: MrGrade;
  gradeRel: MrGrade;
  /** The seat's partisan lean (TPL) and the forecast with the real House vote fed in (November 10 rerun). */
  lean: number | null;
  cf: number | null;
};

export type MrScore = {
  n: number;
  right: number;
  /** Mean absolute miss, signed mean miss, median absolute miss. */
  mae: number;
  bias: number;
  median: number;
  /** Share of results inside the forecast's 80% range. */
  cov80: number;
  brier: number;
  pearson: number;
  /** Races where Democrats did better than forecast. */
  dBeat: number;
  /** With the office's average miss removed from every race. */
  netMae: number;
  netRight: number;
  netCov80: number;
  /** Races forecast within 10 points. */
  closeN: number;
  closeRight: number;
  closeMae: number;
  /** The same model's average error replayed on 2018 to 2024. */
  pastMae: number;
};

export type MrSeats = {
  total: number;
  majority: number;
  mean: number;
  lo: number;
  hi: number;
  pControl: number | null;
  /** Democratic seats: called for Democrats, and called plus current leaders. */
  called: number;
  actual: number;
  /** The forecast's simulated chance of `actual` or more Democratic seats. */
  pAtLeast: number;
  inRange: boolean;
  hist: [number, number][];
  uncalled: { label: string; a: number }[];
};

export type MrRatingRow = { rating: string; n: number; dWins: number; expD: number; bias: number };
export type MrProbBucket = { label: string; lo: number; hi: number; n: number; won: number; meanP: number };
export type MrBucket = { label: string; n: number; bias: number; biasFixed: number | null };
export type MrStateRow = { abbr: string; n: number; bias: number; resid: number };

export type MrPolled = {
  n: number;
  meanW: number;
  model: { mae: number; bias: number; right: number };
  poll: { mae: number; bias: number; right: number };
  blend: { mae: number; bias: number; right: number };
};

export type MrForecaster = {
  id: string;
  name: string;
  kind: "model" | "ratings";
  ours?: boolean;
  houseSeats: number | null;
  senateSeats: number | null;
  /** Brier score and calls right on the House races every listed forecaster covered. */
  brier: number | null;
  right: number | null;
};

/** One scenario row of the November 10 reruns: the same figures the scorecard carries, per office. */
export type MrScenarioOffice = { n: number; right: number; mae: number; bias: number; fav: number; exp: number };
export type MrScenario = { label: string; H: MrScenarioOffice; S: MrScenarioOffice; G: MrScenarioOffice; pv: number };

export type MrSnapshot = {
  fetched: string;
  /** The published forecast on the November 10 count, the baseline every rerun is compared with. */
  locked: Record<"H" | "S" | "G", MrScenarioOffice>;
  national: { gb: number; pvHat: number; eHat: number; s: number; mult: number; actualPv: number; contestedPv: number; imputedPv: number; modelPv: number; history: { year: number; gb: number; pv: number }[] };
  envWanted: Record<"H" | "S" | "G", { wanted: number; se: number; applied: number }>;
  decomp: MrScenario[];
  counterfactual: MrScenario[];
  ladder: MrScenario[];
  gbMiss: { byYear: [number, number][]; mean5: number; mean6: number; sd5: number; sd6: number; mid: number; pres: number };
  pollWeight: {
    ws: number[];
    meanW: Record<"H" | "S" | "G", number>;
    locked: Record<"H" | "S" | "G", { mae: number[]; best: number; bestMae: number; n: number }>;
    true: Record<"H" | "S" | "G", { mae: number[]; best: number; bestMae: number; n: number }>;
    hist: Record<"H" | "S" | "G", { mae: number[]; best: number; bestMae: number; n: number }>;
    five: Record<"H" | "S" | "G", { best: number }>;
    grid: Record<"H" | "S" | "G", { byYear: Record<string, { n: number; modelBias: number; pollBias: number; modelMae: number; pollMae: number }>; wStar: number; rmsYearModel: number; rmsYearPoll: number }>;
  };
  components: Record<"H" | "S" | "G", {
    coef: Record<string, number | null>; se: Record<string, number | null>; pollW: number; pollWse: number;
    ablate: Record<string, { trueMae: number }>; meanAbs: Record<string, number>;
  }>;
  incBuckets: { label: string; locked: { n: number; bias: number }; true: { n: number; bias: number } }[];
  demo: { nonwhite: number; college: number };
  raceCal: Record<"H" | "S" | "G", { ownSigma: number; realSd: number; cov: number; natZ: number; sigE: number }>;
  shade26: { shade: Record<"H" | "S" | "G", MrScenarioOffice>; noShade: Record<"H" | "S" | "G", MrScenarioOffice> };
  hist: Record<"shade" | "noShade" | "pollEnv", Record<"H" | "S" | "G", Record<string, { mae: number; bias: number; n: number }>>>;
  pollEnv26: MrScenario[];
  pollWeightHist: Record<"H" | "S" | "G", { live: number; new: number; n: number }>;
  pollGap: { locked: number };
  sRefit: { sOld: number; sNew: number };
  stateSd: number;
};

export type ModelReviewData = {
  asOf: number;
  lockedAt: string;
  races: MrRace[];
  score: Record<MrOffice, MrScore>;
  all: { n: number; right: number; dBeat: number; uncontested: number; wrongTowardD: number };
  seats: Record<MrOffice, MrSeats>;
  ratings: MrRatingRow[];
  probBuckets: MrProbBucket[];
  leanBuckets: MrBucket[];
  states: MrStateRow[];
  stateSd: number;
  polled: Record<MrOffice, MrPolled>;
  forecasters: MrForecaster[];
  forecasterRaces: number;
  /** National House vote: every vote, contested seats only, every seat contested. */
  houseVote: { raw: number; contested: number; imputed: number };
  gpa: Record<MrOffice, { counts: Record<MrGrade, number>; countsRel: Record<MrGrade, number>; gpa: number; gpaRel: number }>;
  snap: MrSnapshot;
};

/** A grade-point average back to a letter. */
export const gradeOf = (gpa: number): MrGrade => (gpa >= 3.5 ? "A" : gpa >= 2.5 ? "B" : gpa >= 1.5 ? "C" : gpa >= 0.5 ? "D" : "F");

/** A miss (result minus forecast) by who beat the forecast: "D+5.8". Plain module, so the server page can call it. */
export const fmtMiss = (v: number, digits = 1) => (Math.abs(v) < 0.05 ? "0.0" : `${v < 0 ? "D" : "R"}+${Math.abs(v).toFixed(digits)}`);
export const missInk = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v < 0 ? "var(--party-dem)" : "var(--party-rep)");
