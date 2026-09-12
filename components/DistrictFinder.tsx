"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { feature as topoFeature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import { useDarkMode } from "@/lib/useDarkMode";
import { DARK_THEME, LIGHT_THEME, type Theme } from "@/components/ForecastMap";
import { statesData } from "@/data/statesData";
import { houseData, electionYear, senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";
import { officeholders } from "@/data/officeholders";
import { findRepresentingDistricts } from "@/lib/districtLookup";
import type { StateLegDistrict } from "@/data/stateLegDistricts";

const DistrictFinderMap = dynamic(() => import("@/components/DistrictFinderMap"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#888", fontSize: 14 }}>
      Loading map…
    </div>
  ),
});

/**
 * One office in the result panel: who holds it and the year it is next contested. The year is the
 * point of the panel, so a seat on this cycle's ballot is called out rather than left as a number
 * among numbers.
 */
function OfficeRow({
  label,
  name,
  party,
  nextElection,
  href,
  t,
}: {
  label: string;
  name: string;
  party?: string | null;
  nextElection?: number | null;
  /** The race or chamber page this seat belongs to. Omitted where there is no page to go to. */
  href?: string | null;
  t: Theme;
}) {
  const partyColor = party === "D" ? t.demText : party === "R" ? t.repText : t.textMuted;
  const isThisCycle = nextElection === electionYear;
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={`flex items-baseline justify-between gap-2 py-1${href ? " group" : ""}`}
    >
      <div className="min-w-0">
        <div className="truncate text-[9px] font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>
          {label}
        </div>
        <div
          className={`truncate text-[13px] font-semibold leading-snug${href ? " group-hover:underline" : ""}`}
          style={{ color: t.textPrimary }}
        >
          {name}
          {party && <span className="ml-1 font-bold" style={{ color: partyColor }}>({party})</span>}
        </div>
      </div>
      {nextElection != null && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={
            isThisCycle
              ? { background: t.tabBg, color: t.textPrimary }
              : { color: t.textVeryMuted }
          }
          title={isThisCycle ? `On the ballot in ${nextElection}` : `Next up in ${nextElection}`}
        >
          {nextElection}
        </span>
      )}
    </Tag>
  );
}

/**
 * The Senate race page for a sitting senator.
 *
 * A state's two seats live in three different exports depending on when they are next up — this
 * cycle's races in senateData, the class after in senateHoldovers, the one after that in
 * senateNoElection — and the URL differs per bucket ("co" vs "co2"). Matching on the seat holder's
 * name is what ties an officeholders.ts row to whichever bucket holds it; every one of the 100
 * senators resolves to a distinct page this way.
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
function chamberRows(districts: StateLegDistrict[], chamberLabel: string, href: string | null) {
  const rows: { label: string; name: string; party?: string | null; nextElection?: number | null; href?: string | null }[] = [];
  for (const d of districts) {
    // An overlay district is named as such: a New Hampshire address really is represented twice
    // over in the same chamber, and two State House rows would otherwise read as a duplicate.
    // Boundary labels spell the chamber several ways — "State House District 1", "State
    // Legislative District 46" (MD), "Delegate District 54" (WV) — and the chamber is already the
    // first half of this row's label. Named districts ("3rd Suffolk District", "Merrimack 18")
    // match nothing here and are left whole.
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

interface GeocodeResult {
  lat: number;
  lng: number;
  matchedAddress: string;
  state: string | null;
  stateFIPS: string | null;
  cdName: string | null;
  cdGEOID: string | null;
  sldlName: string | null;
  sldlGEOID: string | null;
  /** The district in the state's own spelling — the New Hampshire fallback in lib/districtLookup. */
  sldlBasename: string | null;
  slduName: string | null;
  slduGEOID: string | null;
  slduBasename: string | null;
}

// Module-level caches so data is loaded at most once per page session
let statesGeoJSONCache: FeatureCollection | null = null;
let districtsGeoJSONCache: FeatureCollection | null = null;

async function loadStatesGeoJSON(): Promise<FeatureCollection> {
  if (statesGeoJSONCache) return statesGeoJSONCache;
  const topo = (await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(r => r.json())) as Topology;
  const geo = topoFeature(topo, topo.objects["states"]) as unknown as FeatureCollection;
  statesGeoJSONCache = geo;
  return geo;
}

// congressional-districts-2026.json is TopoJSON (scripts/split-national-maps.mjs) — MapLibre's
// GeoJSON source only understands GeoJSON, so it's converted client-side instead of handed to
// MapLibre as a source URL directly (see DistrictFinderMap's districts-source effect).
async function loadDistrictsGeoJSON(): Promise<FeatureCollection> {
  if (districtsGeoJSONCache) return districtsGeoJSONCache;
  const topo = (await fetch("/congressional-districts-2026.json").then(r => r.json())) as Topology;
  const geo = topoFeature(topo, topo.objects["congressional-districts-2026"]) as unknown as FeatureCollection;
  districtsGeoJSONCache = geo;
  return geo;
}

type DistrictInfo = Omit<GeocodeResult, "lat" | "lng" | "matchedAddress">;

function parseCensusGeographies(geo: Record<string, Record<string, string>[]>): DistrictInfo {
  const stateEntry = (geo["States"] ?? [])[0];
  const stateName: string | null = stateEntry?.NAME ?? null;
  const stateFIPS: string | null = stateEntry?.STATE ?? null;

  const cdKey = Object.keys(geo).find(k => k.toLowerCase().includes("congressional district"));
  const cdEntry = cdKey ? (geo[cdKey] ?? [])[0] : null;
  let cdName: string | null = null;
  let cdGEOID: string | null = null;
  if (cdEntry) {
    cdGEOID = cdEntry.GEOID ?? null;
    const cdNumField = Object.keys(cdEntry).find(k => /^CD\d+$/.test(k));
    const cdNum = cdNumField ? cdEntry[cdNumField] : (cdEntry.BASENAME ?? null);
    if (cdNum === "00" || cdNum === "98") {
      cdName = "At-Large";
    } else if (cdEntry.NAME) {
      cdName = cdEntry.NAME;
    } else if (cdNum && /^\d+$/.test(cdNum)) {
      cdName = `Congressional District ${parseInt(cdNum, 10)}`;
    } else if (cdEntry.NAMELSAD) {
      cdName = cdEntry.NAMELSAD;
    }
  }

  const sldlKey = Object.keys(geo).find(k => k.includes("Legislative Districts") && k.endsWith("- Lower"));
  const sldlEntry = sldlKey ? (geo[sldlKey] ?? [])[0] : null;
  const sldlGEOID: string | null = sldlEntry?.GEOID ?? null;
  const sldlName: string | null = sldlEntry?.NAME ?? null;
  const sldlBasename: string | null = sldlEntry?.BASENAME ?? null;

  const slduKey = Object.keys(geo).find(k => k.includes("Legislative Districts") && k.endsWith("- Upper"));
  const slduEntry = slduKey ? (geo[slduKey] ?? [])[0] : null;
  const slduGEOID: string | null = slduEntry?.GEOID ?? null;
  const slduName: string | null = slduEntry?.NAME ?? null;
  const slduBasename: string | null = slduEntry?.BASENAME ?? null;

  return { state: stateName, stateFIPS, cdName, cdGEOID, sldlName, sldlGEOID, sldlBasename, slduName, slduGEOID, slduBasename };
}

async function lookupByCoordinates(lat: number, lng: number): Promise<DistrictInfo> {
  const res = await fetch(`/api/districts?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error("District lookup failed");
  const data = await res.json();
  return parseCensusGeographies(data?.result?.geographies ?? {});
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({ format: "json", lat: String(lat), lon: String(lng) });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return "";
  const data: { address?: NominatimAddress; display_name?: string } = await res.json();
  if (data.address) return formatUSAddress(data.address) || data.display_name?.replace(/, United States$/, "") || "";
  return data.display_name?.replace(/, United States$/, "") ?? "";
}

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    format: "json", q: address, countrycodes: "us", limit: "1", addressdetails: "0",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Address lookup failed");
  const data: { lat: string; lon: string; display_name: string }[] = await res.json();
  if (!data[0]) throw new Error("Address not found. Try a more specific address including city and state.");
  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  const matchedAddress = data[0].display_name.replace(/, United States$/, "");
  const districts = await lookupByCoordinates(lat, lng);
  return { lat, lng, matchedAddress, ...districts };
}

interface NominatimAddress {
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

interface Suggestion {
  displayName: string;
  shortName: string;
}

function formatUSAddress(addr: NominatimAddress): string {
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality ?? addr.suburb ?? addr.county ?? "";
  // ISO3166-2-lvl4 is "US-IL" → "IL"; DC comes back as "US-DC" → "DC"
  const stateCode = addr["ISO3166-2-lvl4"]?.split("-").pop() ?? addr.state ?? "";
  const cityState = [city, stateCode].filter(Boolean).join(" ");
  return [street, cityState].filter(Boolean).join(", ");
}

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  const params = new URLSearchParams({
    format: "json",
    q: query,
    countrycodes: "us",
    limit: "6",
    dedupe: "1",
    addressdetails: "1",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data: { display_name: string; address: NominatimAddress }[] = await res.json();
  return data
    .map(item => {
      const shortName = formatUSAddress(item.address);
      if (!shortName) return null;
      return { displayName: item.display_name, shortName };
    })
    .filter((s): s is Suggestion => s !== null);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function DistrictFinder() {
  const darkMode = useDarkMode();
  const t = darkMode ? DARK_THEME : LIGHT_THEME;

  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeocodeResult | null>(null);
  const [pinPosition, setPinPosition] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [statesGeoJSON, setStatesGeoJSON] = useState<FeatureCollection | null>(null);
  const [districtsGeoJSON, setDistrictsGeoJSON] = useState<FeatureCollection | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSuggestionsRef = useRef(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStatesGeoJSON().then(setStatesGeoJSON).catch(() => {});
    loadDistrictsGeoJSON().then(setDistrictsGeoJSON).catch(() => {});
  }, []);

  // Prevent page scroll while this tab is active.
  // Setting both html and body is required to reliably lock scroll on iOS Safari.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Debounced suggestion fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (address.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (suppressSuggestionsRef.current) {
        suppressSuggestionsRef.current = false;
        return;
      }
      const results = await fetchSuggestions(address.trim()).catch(() => []);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [address]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectSuggestion = useCallback((s: Suggestion) => {
    setAddress(s.shortName);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const geocoded = await geocodeAddress(address.trim());
      setResult(geocoded);
      setPinPosition([geocoded.lat, geocoded.lng]);
      setFlyTarget([geocoded.lat, geocoded.lng]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find address");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleMapClick(lat: number, lng: number) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    setPinPosition([lat, lng]); // place pin immediately for instant feedback

    try {
      const [districts, addr] = await Promise.all([
        lookupByCoordinates(lat, lng),
        reverseGeocode(lat, lng),
      ]);
      const geocoded: GeocodeResult = { lat, lng, matchedAddress: addr, ...districts };
      setResult(geocoded);
      if (addr) {
        suppressSuggestionsRef.current = true;
        setAddress(addr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location not found");
      setResult(null);
      setPinPosition(null);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResetTrigger(n => n + 1);
    setMapMoved(false);
    setResult(null);
    setPinPosition(null);
    setFlyTarget(null);
    setAddress("");
    setError(null);
  }

  const cdRace = result?.cdGEOID ? houseData.find(r => r.id === result.cdGEOID) : undefined;
  const stateMatch = result?.state ? statesData.find(s => s.name === result.state) : undefined;
  const statewide = stateMatch ? officeholders[stateMatch.abbr] : undefined;
  // Nebraska's one chamber is filed under "senate" in the district data, and the Census returns it
  // as the upper chamber too, so no special-casing is needed here beyond the label.
  const senateDistricts = stateMatch
    ? findRepresentingDistricts(stateMatch.abbr, "senate", result?.slduGEOID ?? null, result?.slduBasename ?? null)
    : [];
  const houseDistricts = stateMatch
    ? findRepresentingDistricts(stateMatch.abbr, "house", result?.sldlGEOID ?? null, result?.sldlBasename ?? null)
    : [];
  const isUnicameral = stateMatch?.abbr === "NE";
  // Nothing to head a year column with when the address resolved to no offices at all (DC).
  const hasOffices = !!statewide || !!cdRace || senateDistricts.length > 0 || houseDistricts.length > 0;
  // The legislature page opens on whichever chamber the row belongs to; it reads the hash on load.
  const legislatureHref = (chamber: "house" | "senate") =>
    stateMatch ? `/states/${stateMatch.id}/legislature#${chamber}` : null;

  // Phones give the map the rest of the screen: 109px of header and tabs above it plus the
  // wrapper's 12px bottom padding is all the chrome there is, so subtracting 130 leaves a hair of
  // breathing room and no more. Wider screens keep the roomier original.
  const mapBoxHeight = "h-[calc(100svh_-_130px)] sm:h-[calc(100svh_-_162px)]";

  return (
    <div
      className={`relative mt-1 overflow-hidden rounded-xl ${mapBoxHeight}`}
      style={{
        border: `1px solid ${t.border}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
      }}
    >
      <DistrictFinderMap
        darkMode={darkMode}
        pinPosition={pinPosition}
        flyTarget={flyTarget}
        statesGeoJSON={statesGeoJSON}
        districtsGeoJSON={districtsGeoJSON}
        highlightCdGEOID={result?.cdGEOID ?? null}
        resetTrigger={resetTrigger}
        onMoved={setMapMoved}
        onMapClick={handleMapClick}
      />

      {/* Floating search bar — top-left, full width on mobile */}
      <div className="absolute left-3 right-3 top-3 sm:right-auto sm:w-96" style={{ zIndex: 800 }}>
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <div ref={searchWrapperRef} className="relative min-w-0 flex-1">
            <input
              type="text"
              value={address}
              onChange={e => { setAddress(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Enter any US address"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none backdrop-blur-sm"
              style={{
                background: t.legendBg,
                border: `1px solid ${showSuggestions && suggestions.length > 0 ? "#4275b5" : t.border}`,
                borderRadius: showSuggestions && suggestions.length > 0 ? "8px 8px 0 0" : "8px",
                color: t.textPrimary,
                fontSize: "16px",
                fontFamily: "var(--font-serif)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              }}
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul
                className="absolute left-0 right-0 z-50 overflow-hidden"
                style={{
                  top: "100%",
                  background: t.panel,
                  border: `1px solid #4275b5`,
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                }}
              >
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="cursor-pointer truncate px-4 py-2.5 text-sm"
                    style={{
                      background: i === activeIndex
                        ? (darkMode ? "#1e3a5f" : "#dbeafe")
                        : "transparent",
                      color: t.textPrimary,
                      borderTop: i > 0 ? `1px solid ${t.border}` : "none",
                    }}
                  >
                    {s.shortName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg px-3.5 py-2.5 text-sm font-semibold sm:px-5"
            style={{
              background: "#4275b5",
              color: "#ffffff",
              opacity: loading ? 0.65 : 1,
              cursor: loading ? "default" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            {loading ? "…" : "Search"}
          </button>
          {(mapMoved || !!result) && (
            <button
              type="button"
              onClick={handleReset}
              className="shrink-0 rounded-lg px-2.5 py-2.5 text-xs font-medium backdrop-blur-sm"
              style={{
                background: t.legendBg,
                border: `1px solid ${t.border}`,
                color: t.textMuted,
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              }}
              aria-label="Reset view"
            >
              Reset
            </button>
          )}
        </form>

        {error && (
          <div
            className="mt-2 rounded-lg px-4 py-2.5 text-sm backdrop-blur-sm"
            style={{ background: t.candidateRepBg, color: t.repText, border: `1px solid ${t.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Empty-state hint */}
      {!pinPosition && !loading && (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-medium shadow-md"
          style={{ zIndex: 800, background: t.panel, border: `1px solid ${t.border}`, color: t.textMuted, whiteSpace: "nowrap" }}
        >
          Search above or click the map to find districts
        </div>
      )}

      {/* Result hero panel — bottom-left, full width on mobile */}
      {result && (
        <div
          className="absolute bottom-3 left-3 right-3 rounded-xl p-4 backdrop-blur-sm sm:right-auto sm:w-80"
          style={{ zIndex: 700, background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
        >
          <div className="truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>
            {result.matchedAddress}
          </div>

          {/* The state and the year column's heading share a line: the heading has to sit outside
              the scrollbox to stay put while a long list moves, and giving it a row of its own cost
              the panel height it does not need on a phone. */}
          <div className="mt-1 flex items-baseline justify-between gap-2">
            {stateMatch ? (
              <a
                href={`/states/${stateMatch.id}`}
                className="block min-w-0 truncate text-[1.375rem] font-bold leading-tight hover:underline sm:text-2xl"
                style={{ fontFamily: "var(--font-serif)", color: t.textPrimary }}
              >
                {result.state}
              </a>
            ) : (
              <div className="min-w-0 truncate text-[1.375rem] font-bold leading-tight sm:text-2xl" style={{ fontFamily: "var(--font-serif)", color: t.textPrimary }}>
                {result.state ?? "—"}
              </div>
            )}
            {hasOffices && (
              <span
                className="shrink-0 pr-1.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: t.textMuted }}
              >
                Next Election
              </span>
            )}
          </div>

          {/* Who represents this address, and when each of those seats is next contested. Capped
              and scrollable: a New Hampshire address can be represented by a dozen people once its
              floterial district's members are counted alongside its base district's. */}
          <div className="mt-2 border-t" style={{ borderColor: t.border }}>
            <div
              className="divide-y overflow-y-auto"
              style={{ borderColor: t.border, maxHeight: "min(46svh, 20rem)" }}
            >
            {statewide && stateMatch && (
              <>
                <OfficeRow
                  label="Governor"
                  name={statewide.governor.name}
                  party={statewide.governor.party}
                  nextElection={statewide.governor.nextElection}
                  href={`/governor/${stateMatch.abbr.toLowerCase()}`}
                  t={t}
                />
                {/* The seat whose page is /senate/{abbr} leads, then /senate/{abbr}2 — the order
                    the race pages are numbered in. That already matches the seat column this data
                    is sorted by in all 50 states, but ordering on the resolved page rather than the
                    column is what actually holds the two in step. */}
                {statewide.senators
                  .map(sen => ({ sen, href: senateHref(stateMatch.abbr, sen.name) }))
                  .sort((a, b) => Number(!!a.href?.endsWith("2")) - Number(!!b.href?.endsWith("2")))
                  .map(({ sen, href }) => (
                    <OfficeRow
                      key={sen.seat}
                      label="US Senate"
                      name={sen.name}
                      party={sen.party}
                      nextElection={sen.nextElection}
                      href={href}
                      t={t}
                    />
                  ))}
              </>
            )}
            {/* Every US House seat is up every cycle, so the year here is always the current one. */}
            {cdRace && (
              <OfficeRow
                label={`US House · ${cdRace.name}`}
                name={cdRace.seatHolder ?? "Vacant"}
                party={cdRace.seatParty}
                nextElection={electionYear}
                href={`/house/${cdRace.name.toLowerCase()}`}
                t={t}
              />
            )}
            {chamberRows(senateDistricts, isUnicameral ? "Legislature" : "State Senate", legislatureHref("senate")).map((r, i) => (
              <OfficeRow key={`u${i}`} {...r} t={t} />
            ))}
            {!isUnicameral && chamberRows(houseDistricts, "State House", legislatureHref("house")).map((r, i) => (
              <OfficeRow key={`l${i}`} {...r} t={t} />
            ))}
            {/* Fall back to naming the districts when the state's per-seat data isn't sourced. */}
            {senateDistricts.length === 0 && houseDistricts.length === 0 && (
              <div className="py-2 text-[11px]" style={{ color: t.textMuted }}>
                {[result.slduName, result.sldlName].filter(Boolean).join(" · ") || "No state legislative districts found"}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
