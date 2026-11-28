// Client-safe types for the county turnout graph (lib/countyTurnout.ts builds the data).

export type TurnoutRace = "President" | "Senate" | "Senate Special" | "Governor" | "House";

export type CountyTurnoutYear = {
  year: number;
  /** Every vote cast in the year's largest race in the county. */
  votes: number;
  race: TurnoutRace;
  /** Citizen voting-age population, or null where no ACS figure is on file. */
  cvap: number | null;
  /** The last year of the ACS 5-year release the CVAP comes from. */
  cvapRelease: number | null;
  /** votes / CVAP, in percent (one decimal). */
  rate: number | null;
};
