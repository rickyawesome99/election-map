"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { getRaceColor } from "@/lib/colorScale";
import { calculateCountyModel } from "@/lib/tplCompute";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

// Per-state TopoJSON, split from public/us-counties.json by scripts/split-national-maps.mjs —
// a state page only fetches its own counties instead of every state's (previously 3.0 MB
// national file on every load).
const countiesUrl = (stateAbbr: string) => `/state-counties/${stateAbbr}.json`;

// Parish in Louisiana, Borough in Alaska, everything else is County
function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

// Same projection table as StateDistrictMap
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

type County = {
  fips: string;
  name: string;
  tpl: number | null;
};

function formatTpl(tpl: number | null): string {
  if (tpl == null) return "TPL unavailable";
  if (Math.abs(tpl) < 0.05) return "TPL: EVEN";
  return `TPL: ${tpl > 0 ? "R" : "D"}+${Math.abs(tpl).toFixed(1)}`;
}

type CountyGeometry = {
  rsmKey: string;
  id?: string | number;
  properties?: {
    name?: string;
  };
};

export default function StateCountyMap({
  stateAbbr,
  stateName,
  height = 360,
  highlightFips,
  showTpl = false,
  showLabel = true,
}: {
  stateAbbr: string;
  stateName: string;
  height?: number;
  highlightFips?: string;
  showTpl?: boolean;
  showLabel?: boolean;
}) {
  const [hovered, setHovered] = useState<County | null>(null);
  const [selected, setSelected] = useState<County | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapViewport, setMapViewport] = useState({ width: 800, height: 600 });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);
  const countyTplCache = useRef(new Map<string, number | null>());
  const getCountyTpl = useCallback((fips: string): number | null => {
    if (!showTpl) return null;
    const cached = countyTplCache.current.get(fips);
    if (cached !== undefined || countyTplCache.current.has(fips)) return cached ?? null;
    const calc = calculateCountyModel(fips);
    const tpl = calc && calc.races.some((race) => race.NM != null) ? calc.tpl : null;
    countyTplCache.current.set(fips, tpl);
    return tpl;
  }, [showTpl]);
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

  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];
  const areaLabel = getAreaLabel(stateAbbr);

  const mapStroke = "var(--app-bg)";
  const hoverStroke = "var(--app-text-primary)";
  const defaultFill = "var(--oh31-map-unfilled)";
  const highlightFill = "#eab308";

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        style={{ height, background: "var(--app-bg)" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
        {/* Hover tooltip */}
        {hovered && (() => {
          const tipW = 150;
          const tipH = showTpl ? 62 : 46;
          let left = mousePos.x + 12;
          let top = mousePos.y + 12;
          if (left + tipW > 430) left = mousePos.x - tipW - 12;
          if (top + tipH > 340) top = mousePos.y - tipH - 12;
          return (
            <div
              className="absolute z-20 hidden pointer-events-none rounded-lg md:block"
              style={{
                left,
                top,
                width: tipW,
                padding: "8px 10px",
                background: "var(--app-panel)",
                border: "1px solid var(--app-border)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              }}
            >
              <div className="font-bold text-xs" style={{ color: "var(--app-text-primary)" }}>
                {hovered.name} {areaLabel}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text-muted)" }}>
                {stateName} · {hovered.fips}
              </div>
              {showTpl && (
                <div className="text-[10px] mt-0.5 font-semibold" style={{ color: hovered.tpl == null ? "var(--app-text-very-muted)" : "var(--app-text-primary)" }}>
                  {formatTpl(hovered.tpl)}
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
          <Geographies geography={countiesUrl(stateAbbr)}>
            {({ geographies }: { geographies: CountyGeometry[] }) =>
              geographies
                .map((geo) => {
                  const fips = String(geo.id);
                  const name = geo.properties?.name ?? "";
                  const tpl = getCountyTpl(fips);
                  const county: County = { fips, name, tpl };
                  const isSelected = selected?.fips === fips;
                  const isHighlighted = !isSelected && fips === highlightFips;
                  const baseFill = showTpl && tpl != null ? getRaceColor(tpl) : defaultFill;
                  const fill = isHighlighted ? highlightFill : baseFill;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHovered(county)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(isSelected ? null : county)}
                      style={{
                        default: {
                          fill,
                          stroke: isSelected || isHighlighted ? hoverStroke : mapStroke,
                          strokeWidth: isSelected || isHighlighted ? 1.5 : 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: baseFill,
                          stroke: hoverStroke,
                          strokeWidth: 1,
                          outline: "none",
                          cursor: "pointer",
                        },
                        pressed: {
                          fill: baseFill,
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

        {/* State label badge */}
        {showLabel && (
          <div
            className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-md"
            style={{
              background: "var(--app-panel)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
              opacity: 0.92,
            }}
          >
            {stateName} · Counties
          </div>
        )}

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

      {/* Selected county info panel */}
      {selected && (
        <div
          className="px-4 py-3"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>
                {selected.name} {areaLabel}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>
                {stateName} · FIPS {selected.fips}
              </div>
              <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                {showTpl ? formatTpl(selected.tpl) : "Election data coming soon"}
              </div>
              <a
                href={`/historical/${selected.fips}`}
                className="mt-2 inline-block text-xs font-semibold hover:underline"
                style={{ color: "var(--app-text-primary)" }}
              >
                Go to county page →
              </a>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded text-xl leading-none"
              aria-label="Close county details"
              style={{ color: "var(--app-text-muted)", background: "var(--app-bg)" }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
