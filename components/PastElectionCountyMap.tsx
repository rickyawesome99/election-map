"use client";

import type { ReactNode } from "react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { getRaceColor } from "@/lib/colorScale";
import { useMapTooltip } from "@/lib/useMapTooltip";

// County choropleth of ONE past statewide election. Results arrive as props from the server
// page (never imported here — the county data files are server-only), the geometry is the
// same per-state TopoJSON StateCountyMap uses, so a visitor coming from the seat page already
// has it cached.

export type CountyMapResult = {
  demVotes: number;
  repVotes: number;
  totalVotes: number;
  demPct: number;
  repPct: number;
  /** R-positive. */
  margin: number;
};

export type CountyMapEntry = { fips: string; name: string; result: CountyMapResult };

const countiesUrl = (stateAbbr: string) => `/state-counties/${stateAbbr}.json`;

function areaLabelFor(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
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

type CountyGeometry = { rsmKey: string; id?: string | number; properties?: { name?: string } };
type Hovered = { fips: string; name: string; result: CountyMapResult | null };

function fmtSigned(margin: number, demParty: string, repParty: string): string {
  if (Math.abs(margin) < 0.05) return "EVEN";
  const letter = margin > 0 ? repParty : demParty;
  return `${letter}+${Math.abs(margin).toFixed(1)}`;
}

export default function PastElectionCountyMap({
  stateAbbr,
  stateName,
  counties,
  demName,
  repName,
  demParty = "D",
  repParty = "R",
  height = 300,
  caption,
}: {
  stateAbbr: string;
  stateName: string;
  counties: CountyMapEntry[];
  demName: string;
  repName: string;
  demParty?: "D" | "R" | "I";
  repParty?: "D" | "R" | "I";
  height?: number;
  /** Rendered between the map and the selected-county panel. */
  caption?: ReactNode;
}) {
  const byFips = useMemo(() => new Map(counties.map((c) => [c.fips, c.result])), [counties]);
  // A same-party contest (CA 2016/2018 Senate: two Democrats) is shaded in that party's colour
  // by margin size, so the map never shows a Republican win that did not happen.
  const sameParty = demParty === repParty;
  const fillFor = useCallback((r: CountyMapResult | null): string => {
    if (!r) return "var(--map-unfilled)";
    if (!sameParty) return getRaceColor(r.margin);
    const size = Math.abs(r.margin);
    return getRaceColor(demParty === "R" ? size : -size);
  }, [sameParty, demParty]);

  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [selected, setSelected] = useState<Hovered | null>(null);
  const { onMouseMove: onTooltipMove, tooltipRef } = useMapTooltip(12, 8);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapViewport, setMapViewport] = useState({ width: 800, height: 600 });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const next = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    setMapViewport(next);
    const cfg = fitStateProjection(stateAbbr, next.width, next.height);
    if (cfg) setAutoProj(cfg);
  }, [stateAbbr]);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];
  const areaLabel = areaLabelFor(stateAbbr);
  const mapStroke = "var(--app-bg)";
  const hoverStroke = "var(--app-text-primary)";

  const detail = (c: Hovered) => c.result ? (
    <>
      <div className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: c.result.margin > 0 ? (repParty === "D" ? "var(--party-dem)" : "var(--party-rep)") : (demParty === "R" ? "var(--party-rep)" : "var(--party-dem)") }}>
        {fmtSigned(c.result.margin, demParty, repParty)}
      </div>
      <div className="mt-0.5 text-[10px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
        <div className="flex justify-between gap-3"><span className="truncate">{demName}</span><span>{c.result.demPct.toFixed(1)}% · {c.result.demVotes.toLocaleString()}</span></div>
        <div className="flex justify-between gap-3"><span className="truncate">{repName}</span><span>{c.result.repPct.toFixed(1)}% · {c.result.repVotes.toLocaleString()}</span></div>
      </div>
    </>
  ) : (
    <div className="mt-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>No county result on file</div>
  );

  return (
    <div>
      <div ref={containerRef} className="relative" style={{ height, background: "var(--app-bg)" }} onMouseMove={onTooltipMove}>
        {hovered && (
          <div
            ref={tooltipRef}
            className="absolute z-20 hidden pointer-events-none rounded-lg md:block"
            style={{ width: 200, padding: "8px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}
          >
            <div className="font-bold text-xs" style={{ color: "var(--app-text-primary)" }}>{hovered.name} {areaLabel}</div>
            {detail(hovered)}
          </div>
        )}

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
                geographies.map((geo) => {
                  const fips = String(geo.id);
                  const result = byFips.get(fips) ?? null;
                  const county: Hovered = { fips, name: geo.properties?.name ?? "", result };
                  const isSelected = selected?.fips === fips;
                  const fill = fillFor(result);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHovered(county)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(isSelected ? null : county)}
                      style={{
                        default: { fill, stroke: isSelected ? hoverStroke : mapStroke, strokeWidth: isSelected ? 1.5 : 0.5, outline: "none" },
                        hover: { fill, stroke: hoverStroke, strokeWidth: 1, outline: "none", cursor: "pointer" },
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
            onClick={() => { setMapKey((k) => k + 1); setViewChanged(false); }}
            className="absolute top-2 right-2 z-10 text-[10px] font-semibold px-2 py-1 rounded-md"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 }}
          >
            Reset
          </button>
        )}
      </div>

      {caption}
      {selected && (
        <div className="mt-2 px-1 py-3" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>{selected.name} {areaLabel}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>{stateName} · FIPS {selected.fips}</div>
              <div className="text-xs">{detail(selected)}</div>
              <a href={`/historical/${selected.fips}`} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
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
