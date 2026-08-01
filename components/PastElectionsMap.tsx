"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import type { HouseStatewideResult } from "@/data/forecastData";
import { useDarkMode } from "@/lib/useDarkMode";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { WisconsinLandClip, WisconsinLandMask } from "./WisconsinLandClip";

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

type ElectionOption = { year: number; race: string; key: string };
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

export default function PastElectionsMap({
  stateAbbr,
  stateName,
  stateFips,
  pastElectionResults,
  selectedKey,
  onSelectedKeyChange,
}: {
  stateAbbr: string;
  stateName: string;
  stateFips: string;
  pastElectionResults: Record<string, HouseStatewideResult[]>;
  selectedKey: string;
  onSelectedKeyChange: (key: string) => void;
}) {
  const availableElections = useMemo<ElectionOption[]>(() => {
    const seen = new Set<string>();
    const out: ElectionOption[] = [];
    const MAJOR = new Set(["President", "Governor", "Senate"]);
    for (const results of Object.values(pastElectionResults)) {
      for (const r of results) {
        if (!MAJOR.has(r.race)) continue;
        const key = `${r.year}-${r.race}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ year: r.year, race: r.race, key });
        }
      }
    }
    return out.sort((a, b) => b.year - a.year || a.race.localeCompare(b.race));
  }, [pastElectionResults]);

  const sel = availableElections.find(e => e.key === selectedKey) ?? availableElections[0] ?? null;

  const geoUrl = sel ? getGeoUrl(sel.year) : "/congressional-districts-pre2022.json";

  const resultByGeoid = useMemo(() => {
    const map = new Map<string, HouseStatewideResult>();
    if (!sel) return map;
    for (const [geoid, results] of Object.entries(pastElectionResults)) {
      const r = results.find(r => r.year === sel.year && r.race === sel.race);
      if (!r) continue;
      map.set(geoid, r);
      // At-large districts: data uses "XX01", Census uses "XX00"
      if (geoid.endsWith("01")) map.set(geoid.slice(0, -2) + "00", r);
      if (geoid.endsWith("00")) map.set(geoid.slice(0, -2) + "01", r);
    }
    return map;
  }, [sel, pastElectionResults]);

  const [hovered, setHovered] = useState<{ geoid: string; result: HouseStatewideResult } | null>(null);
  const [selected, setSelected] = useState<{ geoid: string; result: HouseStatewideResult } | null>(null);
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

  const mapStroke = darkMode ? "#0d1117" : "#f6f8fa";
  const hoverStroke = darkMode ? "#ffffff" : "#333333";
  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];

  if (availableElections.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 360, background: "var(--app-bg)" }}>
        <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
          No past election data available for {stateName}.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Election selector */}
      <div
        className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        {availableElections.map(e => (
          <button
            key={e.key}
            onClick={() => { onSelectedKeyChange(e.key); setSelected(null); }}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors shrink-0"
            style={
              e.key === sel?.key
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
            }
          >
            {e.year} {e.race}
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
          const { geoid, result } = hovered;
          const margin = result.repPct - result.demPct;
          const marginLabel = margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
          const marginColor = margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
          const cdNum = parseInt(geoid.slice(-2), 10);
          const distLabel = cdNum === 0 ? "At-Large" : `CD-${cdNum}`;
          const tipW = 175;
          const tipH = result.demVotes ? 96 : 76;
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
                <span className="font-bold text-xs">{stateAbbr} {distLabel}</span>
                <span className="font-bold shrink-0" style={{ fontSize: 14, color: marginColor }}>{marginLabel}</span>
              </div>
              <div className="flex gap-2 mb-1.5">
                <span className="font-semibold" style={{ color: "var(--party-dem)", fontSize: 11 }}>D {result.demPct.toFixed(1)}%</span>
                <span className="font-semibold" style={{ color: "var(--party-rep)", fontSize: 11 }}>R {result.repPct.toFixed(1)}%</span>
              </div>
              <div className="flex rounded-full overflow-hidden mb-1.5" style={{ height: 3 }}>
                <div style={{ width: `${result.demPct}%`, background: "#1b408c" }} />
                <div style={{ width: `${result.repPct}%`, background: "#be1c29" }} />
              </div>
              {result.demVotes != null && result.repVotes != null && (
                <div className="flex justify-between text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                  <span>{result.demVotes.toLocaleString()}</span>
                  <span>{result.repVotes.toLocaleString()}</span>
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
          {stateAbbr === "WI" && <WisconsinLandClip />}
          <ZoomableGroup key={mapKey} onMoveEnd={() => setViewChanged(true)}>
            <WisconsinLandMask enabled={stateAbbr === "WI"}>
            <Geographies
              key={geoUrl}
              geography={geoUrl}
              parseGeographies={(geographies: DistrictGeo[]) => geographies.map(normalizeDistrictGeography)}
            >
                {({ geographies }: { geographies: DistrictGeo[] }) =>
                  geographies.map(geo => {
                    const geoId = geo.properties?.GEOID as string | undefined;
                    if (!isCongressionalDistrictGeoid(geoId, stateFips)) return null;
                    const result = geoId ? resultByGeoid.get(geoId) : undefined;
                    const fill = result
                      ? getRaceColor(result.repPct - result.demPct)
                      : "var(--app-tab-bg)";
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => result && geoId && setHovered({ geoid: geoId, result })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => {
                          if (!result || !geoId) return;
                          setSelected(selected?.geoid === geoId ? null : { geoid: geoId, result });
                        }}
                        style={{
                          default: {
                            fill,
                            stroke: selected?.geoid === geoId ? hoverStroke : mapStroke,
                            strokeWidth: selected?.geoid === geoId ? 1.5 : 0.5,
                            outline: "none",
                          },
                          hover: {
                            fill,
                            stroke: hoverStroke,
                            strokeWidth: 1,
                            outline: "none",
                            cursor: result ? "pointer" : "default",
                          },
                          pressed: { fill, stroke: hoverStroke, strokeWidth: 1.5, outline: "none" },
                        }}
                      />
                    );
                  })
                }
            </Geographies>
            </WisconsinLandMask>
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
        const { geoid, result } = selected;
        const margin = result.repPct - result.demPct;
        const marginLabel = margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
        const marginColor = margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
        const cdNum = parseInt(geoid.slice(-2), 10);
        const distLabel = cdNum === 0 ? "At-Large" : `CD-${cdNum}`;
        return (
          <div
            className="px-3 py-3"
            style={{ borderTop: "1px solid var(--app-border)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--app-text-muted)" }}>
                  Selected District
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
                    {stateAbbr} {distLabel}
                  </span>
                  <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                    {sel?.year} {sel?.race}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-lg" style={{ color: marginColor }}>{marginLabel}</span>
                <button
                  onClick={() => setSelected(null)}
                  style={{ color: "var(--app-text-very-muted)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span style={{ color: "var(--party-dem)" }}>D {result.demPct.toFixed(1)}%</span>
              <span style={{ color: "var(--party-rep)" }}>R {result.repPct.toFixed(1)}%</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-2" style={{ background: "var(--app-tab-bg)" }}>
              <div style={{ width: `${result.demPct}%`, background: "#1b408c" }} />
              <div style={{ width: `${result.repPct}%`, background: "#be1c29" }} />
            </div>
            {result.demVotes != null && result.repVotes != null && (
              <div className="flex justify-between text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                <span>{result.demVotes.toLocaleString()} votes</span>
                <span>{result.repVotes.toLocaleString()} votes</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
