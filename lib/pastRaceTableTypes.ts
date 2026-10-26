// Client-safe shapes for the /historical "races" table: one row per past-election page for an
// office and year, built server-side by lib/pastElections.ts (pastRaceTableRows) and served as
// static JSON by app/api/past-races/[office]/[year]. The table depends on the office + year
// selection only, never on the map's county/district/state view.
import type { MapOffice } from "@/lib/mapSliceTypes";

export type PastRaceParty = "D" | "R" | "I";

export type PastRaceCandidate = {
  name: string | null;
  party: PastRaceParty;
  pct: number;
  incumbent: boolean;
};

export type PastRaceRow = {
  /** The race's past-election page. */
  href: string;
  /** "Pennsylvania", or "PA-01" for the House. */
  label: string;
  stateAbbr: string;
  stateName: string;
  district: number | null;
  special: boolean;
  /** House only: the district was redrawn for this election, so the previous result is a different map. */
  redrawn: boolean;
  dem: PastRaceCandidate;
  rep: PastRaceCandidate;
  /** R − D, so positive = Republican won. */
  margin: number;
  /** The same seat's previous election, for the swing column. */
  prevMargin: number | null;
  prevYear: number | null;
  /** Party of the previous election's winner, for the Flip tag (a same-party race keeps its true party). */
  prevWinnerParty: PastRaceParty | null;
  totalVotes: number | null;
  uncontested: boolean;
};

export type PastRaceTable = { office: MapOffice; year: number; rows: PastRaceRow[] };

export const pastRaceTableUrl = (office: MapOffice, year: number) => `/api/past-races/${office}/${year}`;
