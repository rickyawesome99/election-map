/**
 * Constants of lib/stateLegDistrictRows.ts that pages document (Internal Methodology → Legislative TPL). Kept in a
 * module with no file reads: importing stateLegDistrictRows.ts itself would make Vercel's file tracer ship every
 * precinct file it can read (public/precincts, data-entry/precincts) with the importing page's function.
 */

/** A district row is dropped when more than this share of the district has no votes for the race. */
export const MAX_MISSING = 0.5;
