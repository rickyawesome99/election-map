import type { LiveRace, PriorCandidate, RacePrior, RaceProjection } from "@/lib/resultsTypes";

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
};

/** One race on /analysis/post-election, as lib/resultsSnapshot.ts reads it from the saved CSV. */
export type PostElectionRow = {
  prior: Pick<RacePrior, "office" | "id" | "label" | "state" | "stateName" | "special" | "seatParty"> & {
    dem: Pick<PriorCandidate, "name" | "party" | "incumbent">;
    rep: Pick<PriorCandidate, "name" | "party" | "incumbent">;
    forecast: Pick<RacePrior["forecast"], "margin" | "rating" | "contest">;
  };
  live: Pick<LiveRace, "dem" | "rep" | "oth" | "total"> | null;
  proj: Pick<RaceProjection, "locked" | "winner" | "currentMargin" | "margin" | "countedShare" | "projectedTotal">;
  /** House: the district's 2024 margin (R-positive) the card's swing is measured from; `estimated`
   *  when its lines moved for 2026. Null when either year has no D vs R race to compare. */
  house24: { margin: number; estimated: boolean } | null;
};
