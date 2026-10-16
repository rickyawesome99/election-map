"use client";

import { useMapTooltip } from "@/lib/useMapTooltip";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { countyDisplayName } from "@/lib/countyName";
import CountyTooltip, { CountyCardClose, CountyCardLink, type CountyTooltipProps } from "@/components/CountyTooltip";
import { useState, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { getRaceColor } from "@/lib/colorScale";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

// Per-state TopoJSON, split from public/us-counties.json by scripts/split-national-maps.mjs —
// a state page only fetches its own counties instead of every state's (previously 3.0 MB
// national file on every load).
const countiesUrl = (stateAbbr: string) => `/state-counties/${stateAbbr}.json`;

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
  countyTpl,
  countyVotes,
  reservePanel = false,
}: {
  stateAbbr: string;
  stateName: string;
  height?: number;
  highlightFips?: string;
  showTpl?: boolean;
  showLabel?: boolean;
  /** fips → county TPL, from lib/countyTpl.ts on the server; required when showTpl is on. */
  countyTpl?: Record<string, number | null>;
  /** fips → the county's 2024 presidential ballots, shown beside the TPL in the hover popup. */
  countyVotes?: Record<string, number | null>;
  /** Keep the selected-county panel's space even when nothing is selected (an invisible stand-in). */
  reservePanel?: boolean;
}) {
  const [hovered, setHovered] = useState<County | null>(null);
  const [selected, setSelected] = useState<County | null>(null);
  // With reservePanel an invisible stand-in holds the panel's space, stacked in the same grid
  // cell as the real panel so a selection can grow the space but never shrink it.
  const standIn: County | null = reservePanel ? { fips: "00000", name: stateName, tpl: 0 } : null;
  const tip = useMapTooltip(12, 8);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapViewport, setMapViewport] = useState({ width: 800, height: 600 });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);
  const getCountyTpl = useCallback((fips: string): number | null => {
    if (!showTpl) return null;
    return countyTpl?.[fips] ?? null;
  }, [showTpl, countyTpl]);
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

  const mapStroke = "var(--app-bg)";
  const hoverStroke = "var(--app-text-primary)";
  const defaultFill = "var(--map-unfilled)";
  const highlightFill = "#eab308";

  // One description of a county, drawn as the hover popup and as the click panel. Without the
  // TPL layer (the county page's locator map) it is just the name and FIPS.
  const card = (c: County): CountyTooltipProps => {
    const base = { title: countyDisplayName(c.fips, c.name), subtitle: `${stateName} · FIPS ${c.fips}` };
    return showTpl ? { ...base, kind: "tpl", tpl: c.tpl, votes: countyVotes?.[c.fips] ?? null } : { ...base, kind: "message" };
  };

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        style={{ height, background: "var(--app-bg)" }}
        onMouseMove={tip.onMouseMove}
      >
        {/* Hover tooltip */}
        {hovered && <CountyTooltip {...card(hovered)} boxRef={tip.tooltipRef} className="absolute z-20 hidden md:block" />}

        <ComposableMap
          width={mapViewport.width}
          height={mapViewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? { scale: proj[2], center: [proj[0], proj[1]] }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
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
      {(selected || standIn) && (
        <div
          className="grid px-4 py-3"
          style={{ borderTop: "1px solid var(--app-border)", visibility: selected ? undefined : "hidden" }}
          aria-hidden={!selected}
        >
          {[standIn, selected].map((c, i) => c && (
            <div key={i} className={`col-start-1 row-start-1${i === 0 ? " invisible" : ""}`} aria-hidden={i === 0 || undefined}>
              <CountyTooltip
                {...card(c)}
                variant="panel"
                aside={<CountyCardClose onClick={() => setSelected(null)} />}
                footer={<CountyCardLink href={`/historical/${c.fips}`} />}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
