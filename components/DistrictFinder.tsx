"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { feature as topoFeature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import { useDarkMode } from "@/lib/useDarkMode";
import { DARK_THEME, LIGHT_THEME, type Theme } from "@/components/ForecastMap";
import { ELECTION_YEAR as electionYear } from "@/lib/electionYear";
import type { AddressLookup, DistrictsResponse } from "@/app/api/districts/route";

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
  /** Who represents the address — resolved by /api/districts so the district datasets stay on the server. */
  lookup: AddressLookup | null;
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

type DistrictInfo = Omit<GeocodeResult, "lat" | "lng" | "matchedAddress" | "lookup">;

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

const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Long enough for a slow answer, short enough that a dead service hands over to the fallback. */
const GEOCODER_TIMEOUT_MS = 6000;

async function lookupByCoordinates(lat: number, lng: number): Promise<DistrictInfo & { lookup: AddressLookup | null }> {
  // Rounded to the precision the server caches at (about 11 m), so repeat lookups share one URL.
  const res = await fetch(`/api/districts?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`);
  if (!res.ok) throw new Error("District lookup failed");
  const data = (await res.json()) as DistrictsResponse;
  return { ...parseCensusGeographies(data?.result?.geographies ?? {}), lookup: data.lookup ?? null };
}

/** The address shown for a clicked point. Cosmetic, so any failure is an empty string. */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({ format: "json", lat: String(lat), lon: String(lng) });
  try {
    const res = await fetch(`${NOMINATIM}/reverse?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
    });
    if (!res.ok) return "";
    const data: { address?: NominatimAddress; display_name?: string } = await res.json();
    if (data.address) return formatUSAddress(data.address) || data.display_name?.replace(/, United States$/, "") || "";
    return data.display_name?.replace(/, United States$/, "") ?? "";
  } catch {
    return "";
  }
}

/** Nominatim's best match for a typed address — null when it is unreachable or finds nothing. */
async function nominatimSearch(address: string): Promise<{ lat: number; lng: number; matchedAddress: string } | null> {
  const params = new URLSearchParams({
    format: "json", q: address, countrycodes: "us", limit: "1", addressdetails: "0",
  });
  try {
    const res = await fetch(`${NOMINATIM}/search?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data: { lat: string; lon: string; display_name: string }[] = await res.json();
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), matchedAddress: data[0].display_name.replace(/, United States$/, "") };
  } catch {
    return null;
  }
}

/** The Census address geocoder behind /api/districts, which places a street address and returns
 *  its districts in one call. It knows street addresses only, not place names. null when it is
 *  unreachable or has no match. */
async function censusAddressSearch(address: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(`/api/districts?${new URLSearchParams({ address })}`);
    if (!res.ok) return null;
    const data = (await res.json()) as DistrictsResponse;
    if (!data.match) return null;
    return { ...data.match, ...parseCensusGeographies(data.result?.geographies ?? {}), lookup: data.lookup ?? null };
  } catch {
    return null;
  }
}

async function nominatimAddressSearch(address: string): Promise<GeocodeResult | null> {
  const found = await nominatimSearch(address);
  return found ? { ...found, ...(await lookupByCoordinates(found.lat, found.lng)) } : null;
}

// Nominatim's usage policy requires results to be cached, so a repeated search costs it nothing.
const geocodeCache = new Map<string, GeocodeResult>();

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const key = address.toLowerCase().replace(/\s+/g, " ");
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  // A query that opens with a house number goes to the Census first: it is the authority on US
  // street addresses, where Nominatim can land on a same-named street in another city. Anything
  // else (a city, a landmark) is Nominatim's to answer. Each is the other's fallback.
  const order = /^\d/.test(address) ? [censusAddressSearch, nominatimAddressSearch] : [nominatimAddressSearch, censusAddressSearch];
  const result = (await order[0](address)) ?? (await order[1](address));
  if (!result) throw new Error("Address not found. Try a more specific address including city and state.");
  geocodeCache.set(key, result);
  return result;
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

// Suggestions come from Photon, a search-as-you-type geocoder on the same OpenStreetMap data.
// Nominatim's usage policy forbids autocomplete against its public server.
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
}

async function fetchSuggestions(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const key = query.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({ q: query, limit: "8", lang: "en", bbox: US_BBOX });
  const res = await fetch(`${PHOTON}?${params}`, { signal });
  if (!res.ok) return [];
  const data: { features?: { properties: PhotonProperties }[] } = await res.json();
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const { properties: p } of data.features ?? []) {
    if (p.countrycode !== "US") continue;
    const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : "";
    // A place with no street of its own (a city, a county) is its own first line.
    const first = street || (p.name !== p.city && p.name !== p.state ? p.name : "") || "";
    const shortName = [first, p.city ?? p.county, p.state].filter(Boolean).join(", ");
    if (!shortName || seen.has(shortName)) continue;
    seen.add(shortName);
    suggestions.push({ displayName: [p.name, shortName].filter(Boolean).join(", "), shortName });
    if (suggestions.length === 6) break;
  }
  suggestionCache.set(key, suggestions);
  return suggestions;
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
  const suggestAbortRef = useRef<AbortController | null>(null);
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
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    debounceRef.current = setTimeout(async () => {
      if (suppressSuggestionsRef.current) {
        suppressSuggestionsRef.current = false;
        return;
      }
      const results = await fetchSuggestions(address.trim(), controller.signal).catch(() => null);
      // A request overtaken by more typing is dropped, not shown late.
      if (controller.signal.aborted || !results) return;
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
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
    // Suggestions still on their way for the text just searched would reopen the list over the result.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    suggestAbortRef.current?.abort();
    setShowSuggestions(false);

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

  const lookup = result?.lookup ?? null;
  const stateMatch = lookup?.state ?? null;
  // Nothing to head a year column with when the address resolved to no offices at all (DC).
  const hasOffices = !!lookup && (lookup.statewide.length > 0 || !!lookup.usHouse || lookup.legislature.length > 0);

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
            {lookup?.statewide.map((row) => (
              <OfficeRow key={`${row.label}-${row.name}`} {...row} t={t} />
            ))}
            {/* Every US House seat is up every cycle, so the year here is always the current one. */}
            {lookup?.usHouse && <OfficeRow {...lookup.usHouse} t={t} />}
            {lookup?.legislature.map((r, i) => (
              <OfficeRow key={`leg${i}`} {...r} t={t} />
            ))}
            {/* Fall back to naming the districts when the state's per-seat data isn't sourced. */}
            {(!lookup || lookup.legislature.length === 0) && (
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
