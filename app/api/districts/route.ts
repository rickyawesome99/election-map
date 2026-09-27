import { NextRequest, NextResponse } from "next/server";
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
};

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

  const cdEntry = firstEntry(geo, (k) => k.toLowerCase().includes("congressional district"));
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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    x: lng,
    y: lat,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  const res = await fetch(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${params}`
  );

  const text = await res.text();

  if (!res.ok) {
    console.error("Census geocoder error:", res.status, text.slice(0, 300));
    return NextResponse.json({ error: "Census geocoder error" }, { status: 500 });
  }

  try {
    const census = JSON.parse(text) as DistrictsResponse;
    const geographies = census?.result?.geographies ?? {};
    return NextResponse.json({ ...census, lookup: resolveLookup(geographies) } satisfies DistrictsResponse);
  } catch {
    console.error("Census returned non-JSON:", text.slice(0, 300));
    return NextResponse.json({ error: "Invalid response from Census" }, { status: 500 });
  }
}
