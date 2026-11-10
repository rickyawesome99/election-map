import type { LiveRace, PriorCandidate, RacePrior, RaceProjection, ResultsOffice } from "@/lib/resultsTypes";

/** The 2026 page's offices, plus the president on a presidential year's page. */
export type PostElectionOffice = ResultsOffice | "president";

/** Past years with a page (lib/pastPostElection.ts), newest first. Each needs its offices in the
 *  past-results files and its legislatures in state_leg.csv. */
export const PAST_POST_ELECTION_YEARS = [2024, 2022, 2020, 2018, 2016];

export type LegSeats = { dem: number; rep: number; oth: number };

/** One state legislative chamber on /analysis/post-election. `seats` are settled: called, or not up
 *  (with no 2026 election, the chamber's current seats). `leading` are uncalled, by who is ahead. */
export type LegChamberResult = {
  chamber: "house" | "senate";
  total: number;
  up: number;
  calledSeats: number;
  noElection: boolean;
  seats: LegSeats;
  leading: LegSeats;
  /** Of `seats`, the called ones won from another party. */
  flipped: LegSeats;
  /** Each party's seat change among the called seats. */
  net: LegSeats;
  /** The sitting governor's party: breaks a tied chamber in a state with no governor's race. */
  incumbentGovernor: string;
  /** Who ran the chamber going into the election; null for a tie or a bipartisan coalition. */
  priorControl: "D" | "R" | null;
  /** A past year's chamber with no earlier election on file: no net change or change of control to show. */
  noPrior?: boolean;
};

/** One race on /analysis/post-election, as lib/resultsSnapshot.ts reads it from the saved CSV. */
export type PostElectionRow = {
  prior: Pick<RacePrior, "id" | "label" | "state" | "stateName" | "special" | "seatParty"> & {
    office: PostElectionOffice;
    dem: Pick<PriorCandidate, "name" | "party" | "incumbent">;
    rep: Pick<PriorCandidate, "name" | "party" | "incumbent">;
    forecast: Pick<RacePrior["forecast"], "margin" | "rating" | "contest">;
  };
  live: Pick<LiveRace, "dem" | "rep" | "oth" | "total"> | null;
  proj: Pick<RaceProjection, "locked" | "winner" | "currentMargin" | "margin" | "countedShare" | "projectedTotal">;
  /** House: the district's margin two years before (R-positive) the card's swing is measured from;
   *  `estimated` when its lines moved since. Null when either year has no D vs R race to compare. */
  housePrev: { margin: number; estimated: boolean } | null;
  /** A past year's race (lib/pastPostElection.ts): its past-election page, and the seat's previous result. */
  past?: { href: string | null; prev: { year: number; margin: number } | null };
};
