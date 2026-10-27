// Client-safe shapes for the election-night Results page (/results). The priors are built on the
// server (lib/resultsPriors.ts) and served as a static JSON slice; the live feed and the needle
// (lib/resultsFeed.ts, lib/resultsNeedle.ts) run in the browser against civicAPI.

export type ResultsOffice = "senate" | "governor" | "house";
export type Party = "D" | "R" | "I";

export const RESULTS_OFFICES: ResultsOffice[] = ["senate", "governor", "house"];
export const OFFICE_LABEL: Record<ResultsOffice, string> = { senate: "Senate", governor: "Governor", house: "House" };
export const ELECTION_DATE = "2026-11-03";
/** The Results page reads nothing from civicAPI before this (5 PM ET on election day, an hour
 *  before the first polls close); before it the feed only serves test data the page hides.
 *  ?test=1 and the replay control bypass it. */
export const FEED_OPENS_AT = Date.parse("2026-11-03T22:00:00Z");

/** One county (or, for a House race, the district's piece of a county) of the pre-election projection. */
export type CountyPrior = {
  fips: string;
  name: string;
  /** House: the district's share of the county's electorate (1 for a whole county). */
  share: number;
  /** Expected votes (the 2026 turnout estimate). */
  votes: number;
  /** Expected margin, R-positive, in points of all votes. */
  margin: number;
  /** Expected third-party share, in points. */
  other: number;
  /** The county's TPL (the whole county's, for a House piece), R-positive; null without one. */
  tpl: number | null;
  /** The county's margin if the race finishes tied (lib/countyProjection.ts), R-positive; null unless contested D vs R. */
  benchmark: number | null;
};

/** `photo`: a /candidates/ path, looked up at build so the client never loads the photo table. */
export type PriorCandidate = { name: string; party: Party; incumbent: boolean; photo: string | null };

export type RacePrior = {
  office: ResultsOffice;
  /** The forecast id: "TX-2", "GA", "4823". */
  id: string;
  /** civicAPI race id (null when the mapping file has none). */
  civicId: number | null;
  /** "Texas", "Ohio (special)", "TX-23". */
  label: string;
  state: string;
  stateName: string;
  /** The race page. */
  href: string;
  dem: PriorCandidate;
  rep: PriorCandidate;
  seatParty: Party | null;
  seatHolder: string | null;
  special: boolean;
  /** Ranked-choice general (AK, ME): the feed carries first choices, the forecast the final round. */
  rcv: boolean;
  /** Louisiana House: Nov 3 is the jungle round. */
  jungle: boolean;
  /** House: the district's TPL (lib/tplCompute.ts), R-positive; null elsewhere. */
  tpl: number | null;
  forecast: {
    /** R-positive. */
    margin: number;
    sigma: number;
    /** Democratic win probability. */
    probability: number;
    rating: string;
    contest: "contested" | "uncontested-D" | "uncontested-R" | "same-party-D" | "same-party-R";
    interval80: [number, number];
  };
  /** Poll closing in Eastern time, "19:00"; `last` where part of the state closes later. */
  pollsClose: { first: string; last: string; note: string | null };
  /** Expected total votes. */
  votes: number;
  counties: CountyPrior[];
};

export type PriorsSlice = { office: ResultsOffice; builtAt: string; races: RacePrior[] };

// ── Live feed, normalized ─────────────────────────────────────────────────────

export type LiveCandidate = { name: string; party: string; votes: number; percent: number; winner: boolean; incumbent: boolean };

export type LiveCounty = {
  fips: string | null;
  name: string;
  /** The feed's own reporting figure for the county, when it sends one. */
  pct: number | null;
  /** The feed's region type ("County", "City", "Planning Region"…), when it says. */
  type?: string;
  dem: number;
  rep: number;
  oth: number;
  total: number;
};

export type LiveRace = {
  civicId: number;
  /** ms, when this payload was fetched. */
  fetchedAt: number;
  lastUpdated: string | null;
  /** The feed's race-level figure (precinct-based: it runs well ahead of the vote). */
  percentReporting: number;
  called: boolean;
  calledAt: string | null;
  /** The called winner's party, by the feed's `winner` flag. */
  winner: Party | null;
  testData: boolean;
  dem: number;
  rep: number;
  oth: number;
  total: number;
  candidates: LiveCandidate[];
  /** null while only the topline has been fetched. */
  counties: LiveCounty[] | null;
};

// ── The needle's output ───────────────────────────────────────────────────────

export type CountyProjection = {
  fips: string;
  name: string;
  counted: number;
  /** Expected votes after the turnout correction. */
  expected: number;
  done: boolean;
  /** Completeness, 0–1. */
  f: number;
  /** R-positive; null with nothing counted. */
  observedMargin: number | null;
  priorMargin: number;
  projectedTotal: number;
  projectedMargin: number;
};

export type RaceProjection = {
  /** county: county detail drove it; topline: only the race total was available; none: nothing counted. */
  tier: "county" | "topline" | "none";
  counted: number;
  projectedTotal: number;
  /** counted / projectedTotal. */
  countedShare: number;
  /** R-positive margin of the votes counted so far; null with nothing counted. */
  currentMargin: number | null;
  /** The shared swing against the prior, R-positive points, after shrinkage. */
  swing: number;
  /** Turnout running at this multiple of the expectation, from finished counties. */
  turnoutFactor: number;
  /** Projected final margin, R-positive. */
  margin: number;
  sigma: number;
  /** Democratic win probability (1/0 once called). */
  probD: number;
  /** The feed has called it. */
  locked: boolean;
  winner: Party | null;
  counties: CountyProjection[];
};

/** One moment of the needle's chamber projection: expected Democratic seats with the 80% band. */
export type SeatPoint = { t: number; mean: number; lo: number; hi: number };
export type SeatSeries = Record<ResultsOffice, SeatPoint[]>;
/** Each race's projection at every point of a replayed archive's timeline (the SeatSeries'
 *  times), by raceHash: [margin R-positive, sigma], to one decimal. */
export type RaceMarginSeries = Record<string, [number, number][]>;
/** A replayed archive's series: the chambers' seats and, where the source has them, every race's margin. */
export type ArchiveSeries = SeatSeries & { races?: RaceMarginSeries };
