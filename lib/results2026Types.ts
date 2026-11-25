// Client-safe shapes for the 2026 Results page (/results). Everything is built on the server by
// lib/results2026Page.ts from the saved results files; the page shows what those files hold.
// Margins are R-positive points of all votes cast, as everywhere on the site.

export type R26Office = "senate" | "governor" | "house";
export const R26_OFFICES: [R26Office, string][] = [["house", "House"], ["senate", "Senate"], ["governor", "Governor"]];

export type R26Votes = { d: number; r: number; total: number; margin: number };

/** One Senate, governor or House race with what it is compared against. */
export type R26Race = {
  office: R26Office;
  id: string;
  /** "Alaska", "Florida (special)", "AK-01". */
  label: string;
  state: string;
  stateName: string;
  href: string;
  /** The map's key: the state's name, or the House district's numeric id ("201"). */
  mapKey: string;
  demName: string;
  repName: string;
  /** Votes for Democratic and Republican candidates (every candidate of the party), and all votes cast. */
  d: number;
  r: number;
  total: number;
  /** Null with no count on file. */
  margin: number | null;
  /** A Democrat faced a Republican: the race has a two-party margin to swing. */
  twoParty: boolean;
  /** The party ran a candidate whose votes can be set against an earlier year's. */
  dRan: boolean;
  rRan: boolean;
  /** Why the race has no two-party margin, for the tables ("two Democrats", "no Republican", "independent vs R"). */
  note?: string;
  called: boolean;
  winner: "D" | "R" | "I" | null;
  /** The 2024 presidential vote on the race's 2026 geography. */
  pres: R26Votes | null;
  /** The last time this exact seat was up: 2024 for the House, the seat's own last election for
   *  the Senate, the last governor's race. `margin` null where that race had no Democrat-versus-
   *  Republican contest. `estimated`: a House seat whose lines moved, its 2024 margin carried onto
   *  the new lines by the presidential shift; its 2024 votes are then not comparable (`moved`). */
  prev: { year: number; special: boolean; d: number; r: number; total: number; dRan: boolean; rRan: boolean; margin: number | null; estimated: boolean; moved: boolean } | null;
};

/** A county on the swing map: [fips, name, state, dem, rep, total, pres24 margin or null]. */
export type R26County = [string, string, string, number, number, number, number | null];
export type R26CountySlice = Record<R26Office, R26County[]>;
export const R26_COUNTIES_URL = "/api/results-2026/counties";

export type R26StateRow = {
  abbr: string;
  name: string;
  href: string;
  pres: number;
  senate: number | null;
  governor: number | null;
  /** The House vote with every seat contested (uncontested and same-party seats filled in), 2026 and 2024. */
  house: number;
  house24: number;
  /** As counted, every vote. */
  houseRaw: number;
  houseRaw24: number;
  seats: number;
  /** Seats with no Democrat-versus-Republican race in 2026 / 2024. */
  dropped: string[];
  dropped24: string[];
  /** The state's House lines changed between 2024 and 2026. */
  redrawn: boolean;
};

export type R26GenericBallot = {
  /** National House margin on each basis. */
  y2024: { raw: number; contested: number; imputed: number; seatsFilled: number };
  y2026: { raw: number; contested: number; imputed: number; seatsFilled: number };
};

export type R26CloseRace = {
  office: R26Office | "state_senate" | "state_house";
  state: string;
  label: string;
  href: string;
  /** Winner (or leader) and the nearest loser. */
  first: { name: string; party: string };
  second: { name: string; party: string };
  /** The lead in votes and as a share of all votes cast. */
  votes: number;
  pct: number;
  total: number;
  called: boolean;
  /** Seats filled by the race, when more than one. */
  seats?: number;
  recount?: boolean;
};

export type R26Recount = {
  state: string;
  office: string;
  seat: string;
  candidates: string;
  marginVotes: number | null;
  type: string;
  status: string;
  statusDate: string;
  result: string;
  source: string;
  note: string;
};

export type R26Certification = {
  abbr: string;
  name: string;
  href: string;
  /** "certified": a source confirms the state certified. "pending": not yet. */
  status: "certified" | "pending";
  /** ISO date certified, or the scheduled date / deadline. */
  date: string;
  dateKind: "actual" | "scheduled" | "deadline";
  source: string;
  note: string;
  recounts: R26Recount[];
};

export type Results2026Data = {
  asOf: number;
  certificationAsOf: string;
  races: R26Race[];
  states: R26StateRow[];
  genericBallot: R26GenericBallot;
  closest: R26CloseRace[];
  certification: R26Certification[];
};

/** Swing: 2026 margin less the baseline's, R-positive (negative = toward Democrats). */
export const swingOf = (now: number | null | undefined, base: number | null | undefined) => (now == null || base == null ? null : now - base);
