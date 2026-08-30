/**
 * Joining a state legislative ELECTION RESULT to the POLYGON it was won in.
 *
 * The two sides are spelled by different people: the result key comes from whichever canvass or
 * dataset supplied that chamber-year (Klarner, MEDSL, a state PDF), the polygon's code from the
 * Census TIGER boundary file. For a numbered chamber they agree exactly. For the states that name
 * their districts they do not - Klarner writes Vermont's two-county Senate district "essexorleans"
 * where TIGER writes "Essex-Orleans", and a hyphen or a capital is not a different district.
 *
 * So the join is done on a normalized form, with an explicit alias table for the handful of cases
 * where the two sources genuinely use different NAMES rather than different punctuation. Anything
 * that still fails to join is a real gap and is reported by
 * scripts/verify-state-leg-historical-maps.mjs, which normalizes with these same rules.
 */

/**
 * Case, spaces, hyphens, periods and the conjunction joining two county names carry no meaning in
 * a district name; digits and letters do. The conjunction has to go because TIGER has switched
 * between spellings across vintages - Massachusetts's "Bristol and Norfolk District" is
 * "Bristol & Norfolk District" in the 2020 files, and stripping punctuation alone would leave
 * "bristolandnorfolk" against "bristolnorfolk". Only a standalone "and" is dropped, so "Grand
 * Isle" survives intact.
 */
export function normalizeDistrictKey(code: string): string {
  return code.toLowerCase().replace(/\band\b/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Genuine name differences, keyed `${abbr}_${chamber}` then by the NORMALIZED polygon code,
 * mapping to the normalized result key that means the same district.
 *
 * Only consulted when the polygon's own code finds nothing, so an alias can never override a
 * direct hit - the same name can be spelled one way in one map era and another way in the next.
 */
const DISTRICT_KEY_ALIASES: Record<string, Record<string, string>> = {
  // Massachusetts pairs its two-county senate districts as "First"/"Second"; Klarner puts the
  // ordinal on the end as a digit. (The three MA keys that carry no ordinal at all - Hampden and
  // Hampshire, Middlesex and Norfolk, Suffolk and Middlesex - are left unjoined on purpose: each
  // covers BOTH the First and the Second district, so there is no district-level figure to paint.)
  MA_senate: {
    firstplymouthbristol: "plymouthbristol1",
    secondplymouthbristol: "plymouthbristol2",
  },
  // Vermont's Grand Isle senate district reached into Chittenden County under the 2012 map, which
  // TIGER wrote into the name; the state and every results source call it just "Grand Isle".
  VT_senate: { grandislechittenden: "grandisle" },
};

export function aliasDistrictKey(abbr: string, chamber: string, normalizedPolygonCode: string): string | undefined {
  return DISTRICT_KEY_ALIASES[`${abbr}_${chamber}`]?.[normalizedPolygonCode];
}

/**
 * Indexes a district-keyed record so it can be looked up by a boundary file's district code.
 * Returns a plain object rather than a Map so it stays cheap to memoize in a render.
 */
export function indexByNormalizedKey<T>(byDistrict: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(byDistrict)) out[normalizeDistrictKey(key)] = value;
  return out;
}

/** Looks a boundary file's district code up in results indexed by indexByNormalizedKey. */
export function lookupByDistrictCode<T>(index: Record<string, T>, abbr: string, chamber: string, code: string): T | undefined {
  const normalized = normalizeDistrictKey(code);
  const direct = index[normalized];
  if (direct !== undefined) return direct;
  const alias = aliasDistrictKey(abbr, chamber, normalized);
  return alias ? index[alias] : undefined;
}

/**
 * True for a results row that is NOT a district: MEDSL's Rhode Island 2024 returns carry a
 * "Statewide" row holding the votes it could not attribute to any district. Those votes are real
 * and belong in the chamber total (the statewide reconciliation counts them), but the row must
 * never be tallied as a district won or looked for on the map.
 */
export function isUnassignedResultKey(code: string): boolean {
  return normalizeDistrictKey(code) === "statewide";
}

/**
 * How a district reads in a tooltip or a panel heading. Numbered districts get the chamber's own
 * phrasing ("State House District 12"); named ones (VT, MA, NH) are already a full name and would
 * read as "State House District Chittenden-6-4" if that prefix were forced onto them.
 */
export function districtDisplayLabel(code: string, chamberLabel: string): string {
  return /^\d+[A-Za-z]?$/.test(code) ? `${chamberLabel} District ${code}` : code;
}
