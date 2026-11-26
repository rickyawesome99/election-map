// Place search shared by the District Finder and /precincts: OpenStreetMap through Nominatim (a typed
// search) and Photon (suggestions as you type; Nominatim's usage policy forbids autocomplete on its
// public server). Client-side only. Both caches exist because Nominatim's policy requires caching.

export const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Long enough for a slow answer, short enough that a dead service hands over to the fallback. */
export const GEOCODER_TIMEOUT_MS = 6000;

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
  "ISO3166-2-lvl4"?: string; // e.g. "US-IL"
}

export function formatUSAddress(addr: NominatimAddress): string {
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality ?? addr.suburb ?? addr.county ?? "";
  // ISO3166-2-lvl4 is "US-IL" → "IL"; DC comes back as "US-DC" → "DC"
  const stateCode = addr["ISO3166-2-lvl4"]?.split("-").pop() ?? addr.state ?? "";
  const cityState = [city, stateCode].filter(Boolean).join(" ");
  return [street, cityState].filter(Boolean).join(", ");
}

/** Nominatim's best match for a typed address — null when it is unreachable or finds nothing.
 *  `state` is the two-letter code where Nominatim gives one. */
export async function nominatimSearch(address: string): Promise<{ lat: number; lng: number; matchedAddress: string; state: string | null } | null> {
  const params = new URLSearchParams({
    format: "json", q: address, countrycodes: "us", limit: "1", addressdetails: "1",
  });
  try {
    const res = await fetch(`${NOMINATIM}/search?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data: { lat: string; lon: string; display_name: string; address?: NominatimAddress }[] = await res.json();
    if (!data[0]) return null;
    const code = data[0].address?.["ISO3166-2-lvl4"]?.split("-").pop() ?? null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), matchedAddress: data[0].display_name.replace(/, United States$/, ""), state: code };
  } catch {
    return null;
  }
}

export interface Suggestion {
  displayName: string;
  shortName: string;
  /** Where the suggestion is, its state's full name, and what kind of place it is (Photon's type:
   *  house, street, city, county, state...). */
  lat: number;
  lng: number;
  state: string | null;
  kind: string | null;
}

const PHOTON = "https://photon.komoot.io/api/";
/** West, south, east, north — the fifty states, so suggestions stay in the country. */
const US_BBOX = "-179.2,17.8,-65.0,71.5";
const suggestionCache = new Map<string, Suggestion[]>();

interface PhotonProperties {
  countrycode?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  type?: string;
}

export async function fetchSuggestions(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const key = query.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({ q: query, limit: "8", lang: "en", bbox: US_BBOX });
  const res = await fetch(`${PHOTON}?${params}`, { signal });
  if (!res.ok) return [];
  const data: { features?: { properties: PhotonProperties; geometry?: { coordinates?: [number, number] } }[] } = await res.json();
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const { properties: p, geometry } of data.features ?? []) {
    if (p.countrycode !== "US") continue;
    const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : "";
    // A place with no street of its own (a city, a county) is its own first line.
    const first = street || (p.name !== p.city && p.name !== p.state ? p.name : "") || "";
    const shortName = [first, p.city ?? p.county, p.state].filter(Boolean).join(", ");
    if (!shortName || seen.has(shortName)) continue;
    seen.add(shortName);
    const [lng, lat] = geometry?.coordinates ?? [NaN, NaN];
    suggestions.push({ displayName: [p.name, shortName].filter(Boolean).join(", "), shortName, lat, lng, state: p.state ?? null, kind: p.type ?? null });
    if (suggestions.length === 6) break;
  }
  suggestionCache.set(key, suggestions);
  return suggestions;
}
