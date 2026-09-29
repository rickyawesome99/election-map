// Client-safe half of lib/turnout.ts: the shapes the /analysis/turnout page and its map render,
// plus the office / level / year tables its controls are built from. The builders (and the
// datasets behind them) stay server-side in lib/turnout.ts and lib/turnoutModel.ts.

export type TurnoutOffice = "president" | "senate" | "governor" | "house";
export type TurnoutLevel = "state" | "district" | "county";

export const TURNOUT_OFFICES: TurnoutOffice[] = ["president", "senate", "governor", "house"];
export const TURNOUT_LEVELS: TurnoutLevel[] = ["state", "district", "county"];
export const OFFICE_LABEL: Record<TurnoutOffice, string> = { president: "President", senate: "Senate", governor: "Governor", house: "House" };
export const OFFICE_SHORT: Record<TurnoutOffice, string> = { president: "Pres", senate: "Sen", governor: "Gov", house: "House" };

/** Every general-election year on the page. Odd years hold governor races only. */
export const TURNOUT_YEARS: number[] = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
export const EVEN_YEARS: number[] = [2016, 2018, 2020, 2022, 2024];
export const PRESIDENTIAL_YEARS: number[] = [2016, 2020, 2024];
export const MIDTERM_YEARS: number[] = [2018, 2022];

export function yearsForTurnoutLevel(level: TurnoutLevel): number[] {
  // Districts have no odd-year races; state and county levels carry the off-year governors.
  return level === "district" ? EVEN_YEARS : TURNOUT_YEARS;
}
export const cycleTypeOf = (year: number): "presidential" | "midterm" | "off-year" =>
  year % 4 === 0 ? "presidential" : year % 2 === 0 ? "midterm" : "off-year";

/** One race's votes in one geography for one year. `votes` null = the race was on the ballot but
 * no count exists (an unopposed Florida/Oklahoma/Louisiana House seat, where no votes are
 * recorded). */
export type TurnoutRace = {
  votes: number | null;
  /** votes / CVAP, in percent. */
  rate: number | null;
  /** votes as a percent of the geography's top-of-the-ticket race that year (100 for the top race itself). */
  ofTop: number | null;
  /** rate change, in points, from the previous election of the same cycle type (4 years earlier). */
  change: number | null;
  /** Stored figure is the first round of a runoff or ranked-choice race (see the page's notes). */
  firstRound?: boolean;
  /** Senate: this entry is a special election (a state with both keeps the regular race here). */
  special?: boolean;
  /** House, district level: one major party was not on the ballot. State/county level: number of such seats. */
  uncontested?: boolean | number;
  /** House, state level: seats on the ballot. */
  seats?: number;
};

export type TurnoutEntry = {
  name: string;
  /** Two-letter state. */
  state: string;
  cvap: number | null;
  /** The office with the most votes here that year, and its votes. */
  top: { office: TurnoutOffice; votes: number } | null;
  /** This year's top-race votes as a percent of the previous presidential election's votes here
   * (a midterm's drop-off from the presidential electorate; ≈100 in a presidential year). */
  ofPriorPresidential: number | null;
  races: Partial<Record<TurnoutOffice, TurnoutRace>>;
  /** A second Senate race the same year (a special alongside the regular one). */
  senateSpecial?: TurnoutRace;
  moreInfoHref?: string | null;
};

export type TurnoutSlice = {
  level: TurnoutLevel;
  year: number;
  entries: Record<string, TurnoutEntry>;
  national: { cvap: number; votes: Partial<Record<TurnoutOffice, number>>; rate: Partial<Record<TurnoutOffice, number>> };
};

export const turnoutSliceUrl = (level: TurnoutLevel, year: number) => `/api/turnout/${level}/${year}`;

// ── Compact state series for the tables and trend charts ─────────────────────

export type StateYearRow = {
  year: number;
  cvap: number | null;
  /** US Elections Project voting-eligible population and total ballots counted (even years only). */
  vep: number | null;
  ballots: number | null;
  races: Partial<Record<TurnoutOffice, TurnoutRace>>;
  senateSpecial?: TurnoutRace;
  top: { office: TurnoutOffice; votes: number } | null;
  ofPriorPresidential: number | null;
};

export type StateSeries = { abbr: string; name: string; years: StateYearRow[] };

export type NationalYearRow = {
  year: number;
  cvap: number;
  votes: Partial<Record<TurnoutOffice, number>>;
  rate: Partial<Record<TurnoutOffice, number>>;
  /** States that held the race. */
  states: Partial<Record<TurnoutOffice, number>>;
};

// ── 2026 turnout estimate ────────────────────────────────────────────────────

export type ProjectedRace = {
  /** "S-GA", "G-OH", "H-0512"… */
  id: string;
  office: Exclude<TurnoutOffice, "president">;
  state: string;
  /** "Georgia", "OH-12"… */
  label: string;
  special?: boolean;
  votes: number;
  /** Each basis midterm alone: 2018-like and 2022-like electorates. */
  low: number;
  high: number;
  cvap: number | null;
  rate: number | null;
  /** The last comparable election's votes (the most recent midterm this office was held, House: this
   * district on its then-current lines only when the lines are unchanged), for context. */
  prior: { year: number; votes: number | null } | null;
  /** 2024 presidential votes in the geography (House: allocated by county share). */
  pres2024: number;
};

export type ProjectedCountyRow = {
  fips: string;
  name: string;
  pres2024: number;
  /** Blended midterm ratio applied (top-of-ticket midterm votes / prior presidential votes), after shrinkage. */
  midtermRatio: number;
  /** Office factor applied (this office's votes / top-of-ticket votes), after shrinkage. */
  officeFactor: number;
  /** House: the share of the county's electorate inside this district. */
  share: number;
  votes: number;
  low: number;
  high: number;
  cvap: number | null;
  rate: number | null;
};

export type ProjectedRaceDetail = ProjectedRace & { counties: ProjectedCountyRow[] };

/** One state's races with their county splits — served by /api/turnout/projection/[state]. */
export type ProjectionStateSlice = { state: string; races: ProjectedRaceDetail[] };

export const projectionSliceUrl = (state: string) => `/api/turnout/projection/${state}`;

/** Every county's 2026 estimate by office — served by /api/turnout/projection-counties. */
export type ProjectionCountySlice = {
  entries: Record<string, { name: string; state: string; cvap: number | null; votes: Partial<Record<Exclude<TurnoutOffice, "president">, number>>; low: Partial<Record<Exclude<TurnoutOffice, "president">, number>>; high: Partial<Record<Exclude<TurnoutOffice, "president">, number>> }>;
};
export const PROJECTION_COUNTY_URL = "/api/turnout/projection-counties";
export const PROJECTION_YEAR = 2026;

// ── Map metrics ──────────────────────────────────────────────────────────────

export type TurnoutMetric = "rate" | "votes" | "ofTop" | "change" | "ofPriorPresidential" | "projection";

export const METRIC_LABEL: Record<TurnoutMetric, string> = {
  rate: "Turnout rate",
  votes: "Votes cast",
  ofTop: "Share of top race",
  change: "Change vs. prior cycle",
  ofPriorPresidential: "Midterm vs. presidential",
  projection: "2026 estimate",
};
