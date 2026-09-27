// Client-safe forecast shapes. lib/forecast.ts is server-only (it pulls the whole compute hub
// and every dataset behind it), so the map, ledger and sidebar receive these trimmed records
// as props from their server page instead of importing the forecasts themselves.
import type { RaceForecast, RaceType } from "@/data/forecastData";
import type { ForecastFields } from "@/lib/forecast";

/**
 * One 2026 race as the forecast pages and map need it: the identity, the two nominees and the
 * derived forecast — without pastResults, raceDesc or the market odds, which are only shown on
 * the race's own page. Roughly a quarter of the size of the full ForecastedRace.
 */
export type ForecastSummary = Pick<
  RaceForecast,
  "id" | "name" | "state" | "raceType" | "electionType" | "seat" | "seatClass" | "candidates" | "seatHolder" | "seatParty"
> &
  Pick<
    ForecastFields,
    "margin" | "sigma" | "probability" | "interval80" | "rating" | "office" | "stateAbbr" | "contest" | "model" | "pollMargin" | "pollWeight" | "pollCount"
  >;

// Seats not on the 2026 ballot (Senate: independents caucusing with the Democrats
// are counted with them).
export const SEAT_HOLDOVERS: Record<RaceType, { dem: number; rep: number }> = {
  senate: { dem: 34, rep: 31 },
  governor: { dem: 6, rep: 8 },
  house: { dem: 0, rep: 0 },
};
export const TOTAL_SEATS_BY_TYPE: Record<RaceType, number> = { senate: 100, governor: 50, house: 435 };

export const CHAMBER_LABEL: Record<RaceType, string> = { senate: "Senate", governor: "Governor", house: "House" };
