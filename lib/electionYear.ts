// The cycle every page is about. data/forecastData.ts (generated) exports the same number as
// `electionYear`; client components read it from here so that importing one integer does not
// pull the 1.9 MB forecast dataset into their bundle. lib/forecast.ts asserts the two agree.
export const ELECTION_YEAR = 2026;
