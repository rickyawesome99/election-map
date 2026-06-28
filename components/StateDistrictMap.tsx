"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";
import type { RaceForecast } from "@/data/forecastData";
import { useDarkMode } from "@/lib/useDarkMode";

const DISTRICTS_URL = "/congressional-districts-2026.json";

type DistrictGeometry = {
  rsmKey: string;
  properties?: {
    GEOID?: string;
  };
};

// [center_lon, center_lat, mercator_scale] per state abbreviation
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

export default function StateDistrictMap({
  houseRaces,
  stateAbbr,
  stateName,
  selected,
  onSelect,
}: {
  houseRaces: RaceForecast[];
  stateAbbr: string;
  stateName: string;
  selected: RaceForecast | null;
  onSelect: (race: RaceForecast | null) => void;
}) {
  const [hovered, setHovered] = useState<RaceForecast | null>(null);
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

  // Build lookup by race id; also alias Census at-large GEOIDs (end in "00") → our new "01" ids
  const raceById = new Map(houseRaces.map((r) => [r.id, r]));
  for (const r of houseRaces) {
    if (r.id.endsWith("01")) raceById.set(r.id.slice(0, -2) + "00", r);
  }
  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];

  if (houseRaces.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 360, background: "var(--app-bg)" }}>
        <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
          No House districts found for {stateName}.
        </p>
      </div>
    );
  }

  return (
    <div>
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
          const demPct = Math.max(0, Math.min(100, 50 - hovered.margin / 2));
          const repPct = Math.max(0, Math.min(100, 50 + hovered.margin / 2));
          const marginAbs = Math.abs(hovered.margin);
          const marginLabel = hovered.margin <= 0 ? `D+${marginAbs.toFixed(1)}` : `R+${marginAbs.toFixed(1)}`;
          const marginColor = hovered.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
          const { bg: badgeColor, text: badgeText } = getRatingColors(hovered.rating);
          const tipW = 190;
          const tipH = hovered.candidates ? 115 : 88;
          const offset = 16;
          const edgePad = 8;
          let left = mousePos.x + offset;
          let top = mousePos.y + offset;
          const containerW = mapSize.w || 800;
          const containerH = mapSize.h || 600;
          if (left + tipW + edgePad > containerW) left = mousePos.x - tipW - offset;
          if (top + tipH + edgePad > containerH) top = mousePos.y - tipH - offset;
          if (left < edgePad) left = edgePad;
          if (top < edgePad) top = edgePad;
          return (
            <div
              className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
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
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs">{hovered.name}</span>
                  <span
                    className="font-semibold px-1 py-0.5 rounded"
                    style={{ background: badgeColor, color: badgeText, whiteSpace: "nowrap", fontSize: 10 }}
                  >
                    {hovered.rating}
                  </span>
                </div>
                <span className="font-bold shrink-0" style={{ fontSize: 15, color: marginColor }}>
                  {marginLabel}
                </span>
              </div>
              {hovered.candidates ? (
                <div className="mb-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="truncate mr-1" style={{ color: "var(--party-dem)", fontSize: 11 }}>{hovered.candidates.dem.name}{hovered.candidates.dem.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}</span>
                    <span className="font-semibold shrink-0" style={{ color: "var(--party-dem)", fontSize: 11 }}>{demPct.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="truncate mr-1" style={{ color: "var(--party-rep)", fontSize: 11 }}>{hovered.candidates.rep.name}{hovered.candidates.rep.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}</span>
                    <span className="font-semibold shrink-0" style={{ color: "var(--party-rep)", fontSize: 11 }}>{repPct.toFixed(1)}%</span>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mb-1.5">
                  <span className="font-semibold" style={{ color: "var(--party-dem)", fontSize: 11 }}>D {demPct.toFixed(1)}%</span>
                  <span className="font-semibold" style={{ color: "var(--party-rep)", fontSize: 11 }}>R {repPct.toFixed(1)}%</span>
                </div>
              )}
              <div className="flex rounded-full overflow-hidden" style={{ height: 3 }}>
                <div style={{ width: `${demPct}%`, background: "var(--party-dem)" }} />
                <div style={{ width: `${repPct}%`, background: "var(--party-rep)" }} />
              </div>
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
          <Geographies geography={DISTRICTS_URL}>
            {({ geographies }: { geographies: DistrictGeometry[] }) =>
              geographies.map((geo) => {
                const geoId = geo.properties?.GEOID as string | undefined;
                const race = geoId ? raceById.get(geoId) : undefined;
                if (!race) return null;
                const fill = getRaceColor(race.margin);
                const isSelected = selected?.id === race.id;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setHovered(race)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onSelect(isSelected ? null : race)}
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
                        cursor: "pointer",
                      },
                      pressed: {
                        fill,
                        stroke: hoverStroke,
                        strokeWidth: 1.5,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* District count badge */}
        <div
          className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-md"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 }}
        >
          {houseRaces.length} district{houseRaces.length !== 1 ? "s" : ""}
        </div>

        {/* Reset zoom button */}
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
    </div>
  );
}
