"use client";

import type { ReactNode } from "react";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { getRaceColor } from "@/lib/colorScale";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { countyDisplayName } from "@/lib/countyName";
import { isRealName } from "@/lib/personName";
import CountyTooltip, { CountyCardClose, CountyCardLink, type CountyTooltipProps } from "@/components/CountyTooltip";

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
  /** Shown in the county card's upper right, e.g. "50% in" (the Results page's live counts). */
  reporting?: string;
  /** The Results page's projected final margin, R-positive, shown beside the counted one. */
  projectedMargin?: number;
};

export type CountyMapEntry = { fips: string; name: string; result: CountyMapResult };

const countiesUrl = (stateAbbr: string) => `/state-counties/${stateAbbr}.json`;

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
  reservePanel = false,
  panelSize = "compact",
  fill = false,
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
  /** Keep the selected-county panel's space even when nothing is selected (an invisible stand-in). */
  reservePanel?: boolean;
  /** The click panel's layout: "wide" where the map has the page's full width (race pages). */
  panelSize?: "compact" | "wide" | "small";
  /** Desktop only: fill a parent of fixed height (a flex column) instead of setting it. The map
   *  takes `height` when there's room and gives up space down to 180px when the selected
   *  county's panel needs it, so opening a panel never makes the column taller. */
  fill?: boolean;
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
  // With reservePanel the panel's space is held open by an invisible stand-in stacked in the
  // same grid cell as the real panel, so opening a county can grow the space but never shrink
  // it (the state page sizes its counties table to this column). The stand-in is the tallest
  // shape there is: a county with an Other row.
  const standIn: Hovered | null = reservePanel
    ? counties.find((c) => c.result.totalVotes - c.result.demVotes - c.result.repVotes > 0) ?? counties[0] ?? null
    : null;
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
  const mapStroke = "var(--app-bg)";
  const hoverStroke = "var(--app-text-primary)";

  // One description of a county, drawn as the hover popup and as the click panel.
  const card = (c: Hovered): CountyTooltipProps => {
    const title = countyDisplayName(c.fips, c.name);
    if (!c.result) return { kind: "message", title, message: "No county result on file." };
    return {
      kind: "result", title,
      dem: { name: demName, link: isRealName(demName), state: stateAbbr, party: demParty, pct: c.result.demPct, votes: c.result.demVotes },
      rep: { name: repName, link: isRealName(repName), state: stateAbbr, party: repParty, pct: c.result.repPct, votes: c.result.repVotes },
      margin: c.result.margin, totalVotes: c.result.totalVotes, reporting: c.result.reporting, projectedMargin: c.result.projectedMargin,
    };
  };

  return (
    <div className={fill ? "md:flex md:h-full md:flex-col" : undefined}>
      <div ref={containerRef} className={`relative${fill ? " md:min-h-[180px] md:shrink" : ""}`} style={{ height, background: "var(--app-bg)" }} onMouseMove={onTooltipMove}>
        {hovered && <CountyTooltip {...card(hovered)} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />}

        <ComposableMap
          width={mapViewport.width}
          height={mapViewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? { scale: proj[2], center: [proj[0], proj[1]] }}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Keyed on the viewport too: when the map resizes (a panel opening under a `fill` map,
              a window resize) the zoom layer keeps its old transform and the state lands off-screen,
              so it starts fresh at the new size instead. Only a move the reader made (a d3 event
              with a sourceEvent) offers Reset; the remount's own move does not. */}
          <ZoomableGroup
            key={`${mapKey}:${mapViewport.width}x${mapViewport.height}`}
            filterZoomEvent={filterMapZoomEvent}
            onMoveEnd={(_: unknown, e?: { sourceEvent?: unknown }) => { if (e?.sourceEvent) setViewChanged(true); }}
          >
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
      {(selected || standIn) && (
        <div className={`grid px-1 ${panelSize === "small" ? "mt-1 pt-2" : "mt-2 py-3"}`} style={{ borderTop: "1px solid var(--app-border)", visibility: selected ? undefined : "hidden" }} aria-hidden={!selected}>
          {[standIn, selected].map((c, i) => c && (
            <div key={i} className={`col-start-1 row-start-1${i === 0 ? " invisible" : ""}`} aria-hidden={i === 0 || undefined}>
              <CountyTooltip
                {...card(c)}
                variant="panel"
                size={panelSize}
                subtitle={`${stateName} · FIPS ${c.fips}`}
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
