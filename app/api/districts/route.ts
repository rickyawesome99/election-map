import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { statesData } from "@/data/statesData";
import { houseData, electionYear, senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";
import { officeholders } from "@/data/officeholders";
import { findRepresentingDistricts } from "@/lib/districtLookup";
import type { StateLegDistrict } from "@/data/stateLegDistricts";

/**
 * Who represents one address, resolved on the server so the district finder's client bundle
 * carries none of the datasets behind it (the 2.7 MB state-leg district file above all).
 * Shapes match what DistrictFinder.tsx renders directly as office rows.
 */
export type OfficeRowData = {
  label: string;
  name: string;
  party?: string | null;
  nextElection?: number | null;
  href?: string | null;
};

export type AddressLookup = {
  state: { id: string; name: string; abbr: string } | null;
  /** Governor, then the two senators in race-page order (/senate/{abbr} before /senate/{abbr}2). */
  statewide: OfficeRowData[];
  usHouse: OfficeRowData | null;
  /** State senate (or Nebraska's single chamber), then state house. */
  legislature: OfficeRowData[];
  isUnicameral: boolean;
};

export type DistrictsResponse = {
  result?: { geographies?: Record<string, Record<string, string>[]> };
  lookup: AddressLookup | null;
  /** Present on an address lookup only: where the Census placed the address. */
  match?: { lat: number; lng: number; matchedAddress: string };
};

type Geographies = Record<string, Record<string, string>[]>;

/**
 * The Senate race page for a sitting senator. A state's two seats live in three different
 * exports depending on when they are next up — this cycle's races in senateData, the class after
 * in senateHoldovers, the one after that in senateNoElection — and the URL differs per bucket.
 */
function senateHref(abbr: string, name: string): string | null {
  const race = senateData.find((r) => r.id.slice(0, 2) === abbr && r.seatHolder === name);
  if (race) return `/senate/${race.id.toLowerCase().replace(/-2$/, "2")}`;
  if (senateNoElection.some((e) => e.abbr === abbr && e.incumbent === name)) return `/senate/${abbr.toLowerCase()}`;
  if (senateHoldovers.some((e) => e.abbr === abbr && e.incumbent === name)) return `/senate/${abbr.toLowerCase()}2`;
  return null;
}

/** A chamber's seats for one address — a district can elect more than one member, and in New
 *  Hampshire an address is also covered by a floterial district that elects more on top. */
function chamberRows(districts: StateLegDistrict[], chamberLabel: string, href: string | null): OfficeRowData[] {
  const rows: OfficeRowData[] = [];
  for (const d of districts) {
    const name = (d.label ?? d.number)
      .replace(/^(State\s+)?(House|Senate|Legislative|Delegate|Assembly)\s+(Sub)?District\s+/i, "District ")
      .replace(/\s+(State\s+(House|Senate)\s+)?(Senatorial\s+)?District$/i, "");
    const label = `${chamberLabel} · ${name}${d.overlay ? " (floterial)" : ""}`;
    const incumbents = d.incumbents ?? [];
    if (incumbents.length === 0) {
      rows.push({ label, name: "Vacant", party: null, nextElection: d.nextElection, href });
      continue;
    }
    for (const inc of incumbents) {
      rows.push({ label, name: inc.name, party: inc.party, nextElection: inc.nextElection ?? d.nextElection, href });
    }
  }
  return rows;
}

function firstEntry(geo: Record<string, Record<string, string>[]>, match: (key: string) => boolean) {
  const key = Object.keys(geo).find(match);
  return key ? (geo[key] ?? [])[0] ?? null : null;
}

function resolveLookup(geo: Record<string, Record<string, string>[]>): AddressLookup | null {
  const stateName = (geo["States"] ?? [])[0]?.NAME ?? null;
  const stateMatch = stateName ? statesData.find((s) => s.name === stateName) : undefined;
  if (!stateMatch) return null;
  const abbr = stateMatch.abbr;

  const cdEntry = firstEntry(geo, isCongressional);
  const cdGEOID = cdEntry?.GEOID ?? null;
  const cdRace = cdGEOID ? houseData.find((r) => r.id === cdGEOID) : undefined;

  const sldl = firstEntry(geo, (k) => k.includes("Legislative Districts") && k.endsWith("- Lower"));
  const sldu = firstEntry(geo, (k) => k.includes("Legislative Districts") && k.endsWith("- Upper"));
  // Nebraska's one chamber is filed under "senate" in the district data, and the Census returns it
  // as the upper chamber too.
  const senateDistricts = findRepresentingDistricts(abbr, "senate", sldu?.GEOID ?? null, sldu?.BASENAME ?? null);
  const houseDistricts = findRepresentingDistricts(abbr, "house", sldl?.GEOID ?? null, sldl?.BASENAME ?? null);
  const isUnicameral = abbr === "NE";
  const legislatureHref = (chamber: "house" | "senate") => `/states/${stateMatch.id}/legislature#${chamber}`;

  const statewideData = officeholders[abbr];
  const statewide: OfficeRowData[] = [];
  if (statewideData) {
    statewide.push({
      label: "Governor",
      name: statewideData.governor.name,
      party: statewideData.governor.party,
      nextElection: statewideData.governor.nextElection,
      href: `/governor/${abbr.toLowerCase()}`,
    });
    // The seat whose page is /senate/{abbr} leads, then /senate/{abbr}2.
    const senators = statewideData.senators
      .map((sen) => ({ sen, href: senateHref(abbr, sen.name) }))
      .sort((a, b) => Number(!!a.href?.endsWith("2")) - Number(!!b.href?.endsWith("2")));
    for (const { sen, href } of senators) {
      statewide.push({ label: "US Senate", name: sen.name, party: sen.party, nextElection: sen.nextElection, href });
    }
  }

  return {
    state: { id: stateMatch.id, name: stateMatch.name, abbr },
    statewide,
    // Every US House seat is up every cycle, so the year here is always the current one.
    usHouse: cdRace
      ? { label: `US House · ${cdRace.name}`, name: cdRace.seatHolder ?? "Vacant", party: cdRace.seatParty, nextElection: electionYear, href: `/house/${cdRace.name.toLowerCase()}` }
      : null,
    legislature: [
      ...chamberRows(senateDistricts, isUnicameral ? "Legislature" : "State Senate", legislatureHref("senate")),
      ...(isUnicameral ? [] : chamberRows(houseDistricts, "State House", legislatureHref("house"))),
    ],
    isUnicameral,
  };
}

const CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies";
const CENSUS_PARAMS = { benchmark: "Public_AR_Current", vintage: "Current_Current", format: "json" };
/** The districts at a point change only with a redraw, so a Census answer is kept for a week. */
const CACHE_SECONDS = 7 * 24 * 60 * 60;
/** Four decimals is about 11 m — coarse enough that nearby lookups share a cache entry. */
const COORD_DECIMALS = 4;

/** One Census call with a timeout and a single retry — the service is slow at times and drops
 *  requests at times. Throws on failure, so a failure is never written to the cache. */
async function censusJson(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${CENSUS}/${endpoint}?${new URLSearchParams({ ...CENSUS_PARAMS, ...params })}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`Census geocoder ${res.status}: ${text.slice(0, 300)}`);
      const result = (JSON.parse(text) as { result?: Record<string, unknown> }).result;
      if (!result) throw new Error(`Census returned no result: ${text.slice(0, 300)}`);
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * States where the Census's current congressional layer (the 120th Congress) carries lines that
 * are not the ones on the 2026 ballot, keyed by state FIPS, with the Census vintage that does
 * carry them. Missouri: the Census drew the 2025 redraw, which the Missouri Supreme Court threw
 * out on 2026-09-03 — the election runs on the 2022 lines, which the 119th-Congress vintages hold.
 * scripts/audit-district-finder-lines.mjs checks every state against the site's own 2026 map.
 */
const CD_VINTAGE_OVERRIDE: Record<string, string> = { "29": "ACS2025_Current" };

const isCongressional = (key: string) => key.toLowerCase().includes("congressional district");

/** Swaps in the congressional district on the lines actually in force, where the Census's differ. */
async function withBallotLines(geographies: Geographies, lat: string, lng: string): Promise<Geographies> {
  const vintage = CD_VINTAGE_OVERRIDE[(geographies["States"] ?? [])[0]?.STATE ?? ""];
  if (!vintage) return geographies;
  const result = await censusJson("coordinates", { x: lng, y: lat, vintage });
  const inForce = Object.entries((result.geographies ?? {}) as Geographies).find(([key]) => isCongressional(key));
  if (!inForce) throw new Error(`Census ${vintage} returned no congressional district`);
  const kept = Object.fromEntries(Object.entries(geographies).filter(([key]) => !isCongressional(key)));
  return { ...kept, [inForce[0]]: inForce[1] };
}

const geographiesAt = unstable_cache(
  async (lat: string, lng: string): Promise<Geographies> => {
    const result = await censusJson("coordinates", { x: lng, y: lat });
    if (!result.geographies) throw new Error("Census returned no geographies");
    return withBallotLines(result.geographies as Geographies, lat, lng);
  },
  ["census-geographies-at-v2"],
  { revalidate: CACHE_SECONDS },
);

type AddressMatch = { lat: number; lng: number; matchedAddress: string; geographies: Geographies };

/** The Census's own address geocoder — the finder's fallback when Nominatim is down or finds
 *  nothing. It places a street address and returns its districts in one call. null = no match. */
const geographiesForAddress = unstable_cache(
  async (address: string): Promise<AddressMatch | null> => {
    const result = await censusJson("onelineaddress", { address });
    const match = (result.addressMatches as { matchedAddress: string; coordinates: { x: number; y: number }; geographies?: Geographies }[] | undefined)?.[0];
    if (!match) return null;
    const geographies = await withBallotLines(match.geographies ?? {}, String(match.coordinates.y), String(match.coordinates.x));
    return { lat: match.coordinates.y, lng: match.coordinates.x, matchedAddress: match.matchedAddress, geographies };
  },
  ["census-geographies-for-address-v2"],
  { revalidate: CACHE_SECONDS },
);

/** "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500" → "1600 Pennsylvania Ave NW, Washington, DC 20500". */
function tidyCensusAddress(matched: string): string {
  const parts = matched.split(", ");
  const zip = /^\d{5}/.test(parts[parts.length - 1] ?? "") ? parts.pop() : null;
  const tidy = parts.map((part) =>
    /^[A-Z]{2}$/.test(part) ? part : part.replace(/[A-Z0-9]+/g, (w) => (/^(N|S|E|W|NE|NW|SE|SW)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase())),
  );
  return tidy.join(", ") + (zip ? ` ${zip}` : "");
}

// The CDN keeps an answer for a day; a deploy (new officeholder data, new lines) clears it.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address")?.trim().replace(/\s+/g, " ");

  if (address) {
    try {
      const match = await geographiesForAddress(address.toLowerCase());
      if (!match) return NextResponse.json({ error: "Address not found" }, { status: 404 });
      return NextResponse.json(
        {
          result: { geographies: match.geographies },
          lookup: resolveLookup(match.geographies),
          match: { lat: match.lat, lng: match.lng, matchedAddress: tidyCensusAddress(match.matchedAddress) },
        } satisfies DistrictsResponse,
        { headers: CACHE_HEADERS },
      );
    } catch (err) {
      console.error("Census address geocoder error:", err);
      return NextResponse.json({ error: "Census geocoder error" }, { status: 502 });
    }
  }

  const lat = Number(searchParams.get("lat") ?? NaN);
  const lng = Number(searchParams.get("lng") ?? NaN);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) {
    return NextResponse.json({ error: "lat and lng (or address) are required" }, { status: 400 });
  }

  try {
    const geographies = await geographiesAt(lat.toFixed(COORD_DECIMALS), lng.toFixed(COORD_DECIMALS));
    return NextResponse.json(
      { result: { geographies }, lookup: resolveLookup(geographies) } satisfies DistrictsResponse,
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    console.error("Census geocoder error:", err);
    return NextResponse.json({ error: "Census geocoder error" }, { status: 502 });
  }
}
