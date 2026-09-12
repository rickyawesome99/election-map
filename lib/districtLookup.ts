import { stateLegDistricts, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { normalizeDistrictKey } from "@/lib/stateLegDistrictKey";

/**
 * Resolving a Census geocoder hit to the state legislative district the app knows about.
 *
 * The Census returns a TIGER GEOID and a BASENAME (the district in the state's own spelling).
 * GEOID is the join key: it is exact, and it survives the several states whose district CODE is
 * spelled differently on each side or is not a number at all — Massachusetts names its districts
 * ("3rd Suffolk"), Alaska letters its Senate ones, Minnesota splits House districts into 34A/34B.
 * The district-code field in the boundary data is lossy for exactly those states, which is why the
 * build script now emits the GEOID alongside it.
 *
 * New Hampshire is the one state where GEOID does not work: its boundary data came from the state's
 * own GRANIT files rather than TIGER, so its ids are synthesized ("33BE1") and do not match the
 * Census's ("33618"). There the BASENAME does line up once its county name is abbreviated the way
 * NH's own numbering does — "Merrimack 18" is ME18.
 */

/**
 * NH House district codes are a county abbreviation plus a number. Kept in step with
 * NH_HOUSE_COUNTY_CODES in scripts/build-state-leg-incumbents.mjs and COUNTY_CODES in
 * scripts/build-nh-house-district-structure.mjs, which do the same conversion at build time.
 */
const NH_COUNTY_CODES: Record<string, string> = {
  belknap: "BE", carroll: "CA", cheshire: "CH", coos: "CO", grafton: "GR",
  hillsborough: "HI", merrimack: "ME", rockingham: "RO", strafford: "ST", sullivan: "SU",
};

/** "Merrimack 18" -> "ME18". Hillsborough 3-9 are zero-padded, an NH numbering quirk. */
function nhHouseCode(basename: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d+)$/.exec(basename.trim());
  if (!m) return null;
  const county = NH_COUNTY_CODES[m[1].toLowerCase()];
  if (!county) return null;
  const num = parseInt(m[2], 10);
  const padded = county === "HI" && num >= 3 && num <= 9;
  return `${county}${padded ? String(num).padStart(2, "0") : String(num)}`;
}

/**
 * The district an address sits in, or null where the state isn't sourced or nothing matches.
 * `basename` is the Census BASENAME and is only needed for the New Hampshire fallback.
 */
export function findStateLegDistrict(
  abbr: string,
  chamber: Chamber,
  geoid: string | null,
  basename: string | null,
): StateLegDistrict | null {
  const districts = stateLegDistricts[abbr]?.[chamber];
  if (!districts || districts.length === 0) return null;

  if (geoid) {
    const byGeoid = districts.find((d) => d.geoid === geoid);
    if (byGeoid) return byGeoid;
  }
  if (!basename) return null;

  const wanted = normalizeDistrictKey(abbr === "NH" && chamber === "house" ? nhHouseCode(basename) ?? basename : basename);
  return districts.find((d) => normalizeDistrictKey(d.number) === wanted) ?? null;
}

/**
 * Overlay districts covering a base district — New Hampshire's floterials, which elect extra
 * representatives from several base districts combined. A NH voter is represented by BOTH their
 * base district's members and their floterial's, and the Census only ever returns the base one,
 * since an overlay district cannot belong to a non-overlapping polygon layer.
 */
export function findOverlayDistricts(abbr: string, chamber: Chamber, baseNumber: string): StateLegDistrict[] {
  const districts = stateLegDistricts[abbr]?.[chamber];
  if (!districts) return [];
  return districts.filter((d) => d.overlay && d.components?.includes(baseNumber));
}

/** A district plus any overlay districts layered on it, in the order they should be listed. */
export function findRepresentingDistricts(
  abbr: string,
  chamber: Chamber,
  geoid: string | null,
  basename: string | null,
): StateLegDistrict[] {
  const base = findStateLegDistrict(abbr, chamber, geoid, basename);
  if (!base) return [];
  return [base, ...findOverlayDistricts(abbr, chamber, base.number)];
}
