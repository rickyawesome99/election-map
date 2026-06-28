"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import type { RaceForecast, PastResult } from "@/data/forecastData";
import { useDarkMode } from "@/lib/useDarkMode";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";

const ELECTION_YEARS = [2024, 2022, 2020, 2018, 2016];

function getGeoUrl(year: number): string {
  if (year <= 2017) return "/congressional-districts-2016.json";
  if (year <= 2019) return "/congressional-districts-2018.json";
  if (year <= 2021) return "/congressional-districts-pre2022.json";
  if (year <= 2022) return "/congressional-districts-2022.json";
  return "/congressional-districts-2024.json";
}

const STATE_PROJ: Record<string, [number, number, number]> = {
  AL: [-86.8, 32.8, 4800],  AK: [-153.0, 64.0, 900],   AZ: [-111.7, 34.3, 3600],
  AR: [-92.4, 34.9, 5500],  CA: [-119.5, 37.2, 2200],  CO: [-105.5, 39.0, 4200],
  CT: [-72.7, 41.6, 16000], DE: [-75.5, 39.0, 22000],  FL: [-81.5, 27.8, 3400],
  GA: [-83.4, 32.7, 4000],  HI: [-156.3, 20.3, 5500],  ID: [-114.5, 44.5, 3200],
  IL: [-89.2, 40.0, 3600],  IN: [-86.1, 40.2, 5500],   IA: [-93.5, 42.0, 5500],
  KS: [-98.4, 38.5, 4800],  KY: [-85.3, 37.5, 4400],   LA: [-92.4, 31.2, 5000],
  ME: [-69.3, 45.4, 4800],  MD: [-77.0, 38.8, 10000],  MA: [-71.5, 42.1, 11000],
  MI: [-85.6, 44.2, 3200],  MN: [-94.3, 46.4, 3600],   MS: [-89.7, 32.7, 4800],
  MO: [-92.5, 38.5, 4200],  MT: [-110.3, 46.9, 3000],  NE: [-99.9, 41.5, 4800],
  NV: [-116.5, 38.8, 3200], NH: [-71.6, 43.7, 9000],   NJ: [-74.5, 40.1, 11000],
  NM: [-106.1, 34.5, 3800], NY: [-75.5, 42.8, 3800],   NC: [-79.4, 35.5, 4400],
  ND: [-100.5, 47.5, 5200], OH: [-82.8, 40.4, 5000],   OK: [-97.5, 35.5, 4500],
  OR: [-120.5, 43.9, 3600], PA: [-77.2, 40.9, 5000],   RI: [-71.5, 41.7, 26000],
  SC: [-80.9, 33.8, 5800],  SD: [-100.2, 44.4, 5200],  TN: [-86.7, 35.9, 4600],
  TX: [-99.5, 31.5, 1700],  UT: [-111.5, 39.5, 4400],  VT: [-72.7, 44.0, 11000],
  VA: [-79.4, 37.5, 4400],  WA: [-120.5, 47.5, 4200],  WV: [-80.5, 38.9, 6000],
  WI: [-89.8, 44.6, 4200],  WY: [-107.5, 43.0, 4800],
};

type HistoricalDistrict = { id: string; name: string; pastResults: PastResult[] };
type HoveredDistrict = { geoid: string; district: HistoricalDistrict; result: PastResult };
type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];
type DistrictGeo = {
  rsmKey: string;
  properties?: { GEOID?: string };
  geometry?: {
    type: "Polygon" | "MultiPolygon" | string;
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
};

function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function normalizePolygonRings(coordinates: PolygonCoordinates): PolygonCoordinates {
  return coordinates.map((ring, index) => {
    const area = ringArea(ring);
    const shouldReverse = index === 0 ? area > 0 : area < 0;
    return shouldReverse ? [...ring].reverse() : ring;
  });
}

function normalizeDistrictGeography(geo: DistrictGeo): DistrictGeo {
  if (geo.geometry?.type === "Polygon") {
    return {
      ...geo,
      geometry: {
        ...geo.geometry,
        coordinates: normalizePolygonRings(geo.geometry.coordinates as PolygonCoordinates),
      },
    };
  }

  if (geo.geometry?.type === "MultiPolygon") {
    return {
      ...geo,
      geometry: {
        ...geo.geometry,
        coordinates: (geo.geometry.coordinates as MultiPolygonCoordinates).map(normalizePolygonRings),
      },
    };
  }

  return geo;
}

export default function HousePastMap({
  houseRaces,
  historicalResults,
  stateAbbr,
  stateName,
  stateFips,
}: {
  houseRaces: RaceForecast[];
  historicalResults: Record<string, PastResult[]>;
  stateAbbr: string;
  stateName: string;
  stateFips: string;
}) {
  const districts = useMemo<HistoricalDistrict[]>(() => {
    const byId = new Map<string, HistoricalDistrict>();
    for (const race of houseRaces) {
      byId.set(race.id, {
        id: race.id,
        name: race.name,
        pastResults: race.pastResults ?? [],
      });
    }
    for (const [id, pastResults] of Object.entries(historicalResults)) {
      byId.set(id, {
        id,
        name: `${stateAbbr}-${id.slice(-2)}`,
        pastResults,
      });
    }
    return [...byId.values()];
  }, [historicalResults, houseRaces, stateAbbr]);

  const availableYears = useMemo(() => {
    const found = new Set<number>();
    for (const district of districts) {
      for (const r of district.pastResults) {
        if (ELECTION_YEARS.includes(r.year)) found.add(r.year);
      }
    }
    return ELECTION_YEARS.filter(y => found.has(y));
  }, [districts]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0] ?? 2024);
  const [hovered, setHovered] = useState<HoveredDistrict | null>(null);
  const [selected, setSelected] = useState<HoveredDistrict | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const darkMode = useDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapViewport, setMapViewport] = useState({ width: 800, height: 600 });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);
  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nextViewport = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
    setMapViewport(nextViewport);
    const cfg = fitStateProjection(stateAbbr, nextViewport.width, nextViewport.height);
    if (cfg) setAutoProj(cfg);
  }, [stateAbbr]);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const geoUrl = getGeoUrl(selectedYear);
  const mapStroke = darkMode ? "#0d1117" : "#f6f8fa";
  const hoverStroke = darkMode ? "#ffffff" : "#333333";
  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];

  const resultByGeoid = useMemo(() => {
    const map = new Map<string, HoveredDistrict>();
    for (const district of districts) {
      const result = district.pastResults.find(r => r.year === selectedYear);
      if (!result) continue;
      const entry = { geoid: district.id, district, result };
      map.set(district.id, entry);
      if (district.id.endsWith("01")) map.set(district.id.slice(0, -2) + "00", entry);
      if (district.id.endsWith("00")) map.set(district.id.slice(0, -2) + "01", entry);
    }
    return map;
  }, [districts, selectedYear]);

  if (availableYears.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 360, background: "var(--app-bg)" }}>
        <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
          No past House results available for {stateName}.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Year selector */}
      <div
        className="flex flex-wrap gap-1 px-3 py-2"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        {availableYears.map(year => (
          <button
            key={year}
            onClick={() => { setSelectedYear(year); setSelected(null); }}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors"
            style={
              year === selectedYear
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
            }
          >
            {year}
          </button>
        ))}
      </div>

      {/* Map area */}
      <div
        ref={containerRef}
        className="relative"
        style={{ height: 360, background: "var(--app-bg)" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          setMapSize({ w: rect.width, h: rect.height });
        }}
      >
        {/* Hover tooltip */}
        {hovered && (() => {
          const { district, result } = hovered;
          const margin = result.repPct - result.demPct;
          const marginLabel = margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
          const marginColor = margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
          const hasVotes = result.demVotes != null && result.repVotes != null;
          const tipW = 190;
          const tipH = result.demCandidate ? (hasVotes ? 115 : 96) : 76;
          const offset = 16;
          const edgePad = 8;
          let left = mousePos.x + offset;
          let top = mousePos.y + offset;
          if (left + tipW + edgePad > mapSize.w) left = mousePos.x - tipW - offset;
          if (top + tipH + edgePad > mapSize.h) top = mousePos.y - tipH - offset;
          if (left < edgePad) left = edgePad;
          if (top < edgePad) top = edgePad;
          return (
            <div
              className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
              style={{
                left, top, width: tipW,
                padding: "6px 8px",
                background: "var(--app-panel)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text-primary)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="font-bold text-xs">{district.name}</span>
                <span className="font-bold shrink-0" style={{ fontSize: 14, color: marginColor }}>{marginLabel}</span>
              </div>
              {result.demCandidate || result.repCandidate ? (
                <div className="mb-1.5">
                  {result.demCandidate && (
                    <div className="flex justify-between items-baseline">
                      <span className="truncate mr-1" style={{ color: "var(--party-dem)", fontSize: 11 }}>
                        {result.demCandidate}{result.demIncumbent ? <span style={{ opacity: 0.7 }}> (inc)</span> : null}
                      </span>
                      <span className="font-semibold shrink-0" style={{ color: "var(--party-dem)", fontSize: 11 }}>{result.demPct.toFixed(1)}%</span>
                    </div>
                  )}
                  {result.repCandidate && (
                    <div className="flex justify-between items-baseline">
                      <span className="truncate mr-1" style={{ color: "var(--party-rep)", fontSize: 11 }}>
                        {result.repCandidate}{result.repIncumbent ? <span style={{ opacity: 0.7 }}> (inc)</span> : null}
                      </span>
                      <span className="font-semibold shrink-0" style={{ color: "var(--party-rep)", fontSize: 11 }}>{result.repPct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 mb-1.5">
                  <span className="font-semibold" style={{ color: "var(--party-dem)", fontSize: 11 }}>D {result.demPct.toFixed(1)}%</span>
                  <span className="font-semibold" style={{ color: "var(--party-rep)", fontSize: 11 }}>R {result.repPct.toFixed(1)}%</span>
                </div>
              )}
              <div className="flex rounded-full overflow-hidden mb-1.5" style={{ height: 3 }}>
                <div style={{ width: `${result.demPct}%`, background: "#1b408c" }} />
                <div style={{ width: `${result.repPct}%`, background: "#be1c29" }} />
              </div>
              {hasVotes && (
                <div className="flex justify-between text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                  <span>{result.demVotes!.toLocaleString()}</span>
                  <span>{result.repVotes!.toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })()}

        <ComposableMap
          width={mapViewport.width}
          height={mapViewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? { scale: proj[2], center: [proj[0], proj[1]] }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup key={mapKey} onMoveEnd={() => setViewChanged(true)}>
            <Geographies
              key={geoUrl}
              geography={geoUrl}
              parseGeographies={(geographies: DistrictGeo[]) => geographies.map(normalizeDistrictGeography)}
            >
              {({ geographies }: { geographies: DistrictGeo[] }) =>
                geographies.map(geo => {
                  const geoId = geo.properties?.GEOID as string | undefined;
                  if (!isCongressionalDistrictGeoid(geoId, stateFips)) return null;
                  const entry = geoId ? resultByGeoid.get(geoId) : undefined;
                  const margin = entry ? entry.result.repPct - entry.result.demPct : 0;
                  const fill = entry ? getRaceColor(margin) : "var(--app-tab-bg)";
                  const isSelected = selected?.geoid === entry?.geoid;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => entry && setHovered({ ...entry, geoid: geoId! })}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        if (!entry || !geoId) return;
                        setSelected(isSelected ? null : { ...entry, geoid: geoId });
                      }}
                      style={{
                        default: {
                          fill,
                          stroke: isSelected ? hoverStroke : mapStroke,
                          strokeWidth: isSelected ? 1.5 : 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill,
                          stroke: hoverStroke,
                          strokeWidth: 1,
                          outline: "none",
                          cursor: entry ? "pointer" : "default",
                        },
                        pressed: { fill, stroke: hoverStroke, strokeWidth: 1.5, outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {viewChanged && (
          <button
            onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
            className="absolute top-2 right-2 z-10 text-[10px] font-semibold px-2 py-1 rounded-md"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Selected district panel */}
      {selected && (() => {
        const { district, result } = selected;
        const margin = result.repPct - result.demPct;
        const marginLabel = margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
        const marginColor = margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
        const hasVotes = result.demVotes != null && result.repVotes != null;
        return (
          <div className="px-3 py-3" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--app-text-muted)" }}>
                  Selected District
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{district.name}</span>
                  <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{selectedYear} House</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-lg" style={{ color: marginColor }}>{marginLabel}</span>
                <button onClick={() => setSelected(null)} style={{ color: "var(--app-text-very-muted)" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {(result.demCandidate || result.repCandidate) && (
              <div className="flex flex-col gap-0.5 mb-2 text-xs">
                {result.demCandidate && (
                  <div className="flex justify-between">
                    <span style={{ color: "var(--party-dem)" }}>{result.demCandidate}{result.demIncumbent ? " (inc.)" : ""}</span>
                    <span className="font-semibold" style={{ color: "var(--party-dem)" }}>{result.demPct.toFixed(1)}%</span>
                  </div>
                )}
                {result.repCandidate && (
                  <div className="flex justify-between">
                    <span style={{ color: "var(--party-rep)" }}>{result.repCandidate}{result.repIncumbent ? " (inc.)" : ""}</span>
                    <span className="font-semibold" style={{ color: "var(--party-rep)" }}>{result.repPct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}
            {!result.demCandidate && !result.repCandidate && (
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span style={{ color: "var(--party-dem)" }}>D {result.demPct.toFixed(1)}%</span>
                <span style={{ color: "var(--party-rep)" }}>R {result.repPct.toFixed(1)}%</span>
              </div>
            )}
            <div className="flex h-2.5 rounded-full overflow-hidden mb-2" style={{ background: "var(--app-tab-bg)" }}>
              <div style={{ width: `${result.demPct}%`, background: "#1b408c" }} />
              <div style={{ width: `${result.repPct}%`, background: "#be1c29" }} />
            </div>
            {hasVotes && (
              <div className="flex justify-between text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                <span>{result.demVotes!.toLocaleString()} votes</span>
                <span>{result.repVotes!.toLocaleString()} votes</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
