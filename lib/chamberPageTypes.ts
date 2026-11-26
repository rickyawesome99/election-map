// Client-safe shapes for the /house, /senate and /governor pages (built by lib/chamberPage.ts).
import type { RaceType } from "@/data/forecastData";

export type SeatParty = "D" | "R" | "I";

export type ChamberSeat = {
  key: string;
  /** "OH-13" for a House seat; the state's name for a Senate seat or a governorship. */
  label: string;
  stateAbbr: string;
  stateName: string;
  /** House: the district's id in the 2026 district file ("3913"). */
  geoid: string | null;
  href: string;
  special: boolean;
  /** On the 2026 ballot. */
  up: boolean;
  /** A seat not up: the year it is next on the ballot. */
  nextElection: number | null;
  /** Who held the seat going into the election. */
  before: { name: string; party: SeatParty };
  /** The final forecast: R-positive margin, its rating and the party favored. Null for a seat not up. */
  projected: { margin: number; rating: string; party: SeatParty } | null;
  /** The count. `name`/`party` are the winner, or the leader where the race is not called. */
  result: {
    name: string | null;
    party: SeatParty | null;
    /** The two slots' margin in points of all votes, R-slot positive; null with no votes on file. */
    margin: number | null;
    called: boolean;
    unopposed: boolean;
    /** Both finalists are of one party (a top-two general). */
    sameParty: boolean;
  } | null;
  /** The party holding the seat after the election: the winner, the leader where uncalled, the holder where not up. */
  after: SeatParty;
  flip: boolean;
};

export type SeatSplit = { dem: number; rep: number; oth: number };

export type ChamberPageData = {
  office: RaceType;
  title: string;
  /** When the saved results were fetched (ms). */
  asOf: number;
  seats: ChamberSeat[];
  total: number;
  majority: number;
  racesUp: number;
  uncalled: number;
  before: SeatSplit;
  projected: SeatSplit;
  after: SeatSplit;
  flips: { toD: number; toR: number };
};

export type ChamberView = "results" | "projected" | "now";

/** The party a seat reads as in a map or table view. */
export function seatPartyIn(seat: ChamberSeat, view: ChamberView): SeatParty {
  if (view === "results") return seat.after;
  if (view === "projected") return seat.projected?.party ?? seat.before.party;
  return seat.before.party;
}
