"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { feature as topoFeature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import { useDarkMode } from "@/lib/useDarkMode";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { statesData } from "@/data/statesData";
import { houseData } from "@/data/forecastData";

const DistrictFinderMap = dynamic(() => import("@/components/DistrictFinderMap"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#888", fontSize: 14 }}>
      Loading map…
    </div>
  ),
});

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
  slduName: string | null;
  slduGEOID: string | null;
}

// Module-level caches so data is loaded at most once per page session
let statesGeoJSONCache: FeatureCollection | null = null;

async function loadStatesGeoJSON(): Promise<FeatureCollection> {
  if (statesGeoJSONCache) return statesGeoJSONCache;
  const topo = (await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(r => r.json())) as Topology;
  const geo = topoFeature(topo, topo.objects["states"]) as unknown as FeatureCollection;
  statesGeoJSONCache = geo;
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

  const slduKey = Object.keys(geo).find(k => k.includes("Legislative Districts") && k.endsWith("- Upper"));
  const slduEntry = slduKey ? (geo[slduKey] ?? [])[0] : null;
  const slduGEOID: string | null = slduEntry?.GEOID ?? null;
  const slduName: string | null = slduEntry?.NAME ?? null;

  return { state: stateName, stateFIPS, cdName, cdGEOID, sldlName, sldlGEOID, slduName, slduGEOID };
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

  return (
    <div
      className="mt-1 flex flex-col overflow-hidden"
      style={{ height: "calc(100svh - 162px)" }}
    >
      <div className="mb-2 flex shrink-0 items-baseline gap-3">
        <h2 className="text-lg font-bold" style={{ color: t.textPrimary }}>
          District Finder
        </h2>
        <span className="text-xs" style={{ color: t.textMuted }}>
          Look up any US address to find its districts
        </span>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-2 flex shrink-0 gap-2" style={{ position: "relative", zIndex: 2 }}>
        <div ref={searchWrapperRef} className="relative min-w-0 flex-1">
          <input
            type="text"
            value={address}
            onChange={e => { setAddress(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter any US address (e.g. 123 Main St, Springfield, IL)"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{
              background: t.panel,
              border: `1px solid ${showSuggestions && suggestions.length > 0 ? "#4275b5" : t.border}`,
              borderRadius: showSuggestions && suggestions.length > 0 ? "8px 8px 0 0" : "8px",
              color: t.textPrimary,
              fontSize: "16px",
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
          className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold"
          style={{
            background: "#4275b5",
            color: "#ffffff",
            opacity: loading ? 0.65 : 1,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Map — flex-1 fills all remaining space */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl"
        style={{
          border: `1px solid ${t.border}`,
          zIndex: 0,
        }}
      >
        <DistrictFinderMap
          darkMode={darkMode}
          pinPosition={pinPosition}
          flyTarget={flyTarget}
          statesGeoJSON={statesGeoJSON}
          highlightCdGEOID={result?.cdGEOID ?? null}
          resetTrigger={resetTrigger}
          onMoved={setMapMoved}
          onMapClick={handleMapClick}
        />

        {/* Empty-state hint */}
        {!pinPosition && !loading && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-medium shadow-md"
            style={{ zIndex: 800, background: t.panel, border: `1px solid ${t.border}`, color: t.textMuted, whiteSpace: "nowrap" }}
          >
            Search above or click the map to find districts
          </div>
        )}

        {/* Reset view button — shown when map has moved or a result is selected */}
        {(mapMoved || !!result) && (
          <button
            onClick={() => {
              setResetTrigger(n => n + 1);
              setMapMoved(false);
              setResult(null);
              setPinPosition(null);
              setFlyTarget(null);
              setAddress("");
              setError(null);
            }}
            className="absolute right-3 top-3 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-sm"
            style={{
              zIndex: 800,
              background: t.legendBg,
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            Reset
          </button>
        )}

      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-2 shrink-0 rounded-lg px-4 py-2.5 text-sm"
          style={{ background: t.candidateRepBg, color: t.repText, border: `1px solid ${t.border}` }}
        >
          {error}
        </div>
      )}

      {/* District info box — below the map */}
      {result && (() => {
        const cdRace = result.cdGEOID ? houseData.find(r => r.id === result.cdGEOID) : undefined;
        return (
        <div className="mt-2 shrink-0 rounded-xl px-3 pb-3 pt-2.5" style={{ background: t.panel, border: `1px solid ${t.border}` }}>
          <div
            className="mb-2 truncate text-[10px] font-medium uppercase tracking-wider"
            style={{ color: t.textMuted }}
          >
            {result.matchedAddress}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InfoBox
              label="State"
              value={result.state ?? "—"}
              href={statesData.find(s => s.name === result.state) ? `/states/${statesData.find(s => s.name === result.state)!.id}` : undefined}
              t={t}
            />
            <InfoBox
              label="Congressional District"
              value={result.cdName ?? "—"}
              href={cdRace ? `/house/${cdRace.name.toLowerCase()}` : undefined}
              t={t}
            />
            <InfoBox label="State House District" value={result.sldlName ?? "—"} t={t} />
            <InfoBox label="State Senate District" value={result.slduName ?? "—"} t={t} />
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function InfoBox({ label, value, href, t }: { label: string; value: string; href?: string; t: typeof DARK_THEME }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: t.tabBg, border: `1px solid ${t.border}` }}>
      <div
        className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: t.textMuted }}
      >
        {label}
      </div>
      {href ? (
        <a
          href={href}
          className="text-xs font-semibold leading-snug underline-offset-2 hover:underline"
          style={{ color: t.demText }}
        >
          {value}
        </a>
      ) : (
        <div className="text-xs font-semibold leading-snug" style={{ color: t.textPrimary }}>
          {value}
        </div>
      )}
    </div>
  );
}
