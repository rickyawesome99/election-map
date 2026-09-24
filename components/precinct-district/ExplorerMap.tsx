"use client";

// One SVG precinct map for every mode of the explorer. It knows nothing about elections: the
// parent hands it a FeatureCollection whose features carry {id, subdivision}, a unit key per
// feature (precinct id or subdivision id), a color per unit and a tooltip per unit.

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";

export type PrecinctFeatureProps = { id: string; subdivision: string };
export type PrecinctFC = FeatureCollection<Geometry, PrecinctFeatureProps>;

type Geo = { rsmKey: string; properties: PrecinctFeatureProps; geometry: Geometry };

const W = 800, H = 520, PAD = 14;

function filterZoom(event: { type?: string; ctrlKey?: boolean; button?: number }): boolean {
  return event.type !== "dblclick" && event.type !== "touchend" && (!event.ctrlKey || event.type === "wheel") && !event.button;
}

export interface ExplorerMapProps {
  fc: PrecinctFC | null;
  unitOf: (p: PrecinctFeatureProps) => string;
  colorFor: (unit: string) => string | null;
  isDimmed: (unit: string) => boolean;
  hoveredUnit: string | null;
  selectedUnit: string | null;
  onHover: (unit: string | null) => void;
  onSelect: (unit: string | null) => void;
  renderTooltip: (unit: string) => ReactNode;
  legend?: ReactNode;
  darkMode: boolean;
  height?: number | string;
}

export function useIsTouchMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const sync = () => {
      const narrow = window.matchMedia("(max-width: 767px)").matches;
      const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      setIsMobile(narrow && coarse);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return isMobile;
}

export default function ExplorerMap({
  fc, unitOf, colorFor, isDimmed, hoveredUnit, selectedUnit, onHover, onSelect, renderTooltip, legend, darkMode, height,
}: ExplorerMapProps) {
  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isMobile = useIsTouchMobile();
  const ref = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [moved, setMoved] = useState(false);

  // The viewBox follows the district's shape (a tall district gets a tall box) so the map fills
  // its frame instead of floating in the middle of a fixed 800×520 canvas.
  const { projection, vbW } = useMemo(() => {
    const p = geoMercator();
    if (!fc || !fc.features.length) return { projection: p, vbW: W };
    p.fitExtent([[0, 0], [W, H]], fc as FeatureCollection);
    const b = geoPath(p).bounds(fc as FeatureCollection);
    const aspect = (b[1][0] - b[0][0]) / Math.max(1, b[1][1] - b[0][1]);
    const w = Math.max(320, Math.min(W, Math.round((H - 2 * PAD) * aspect) + 2 * PAD));
    p.fitExtent([[PAD, PAD], [w - PAD, H - PAD]], fc as FeatureCollection);
    return { projection: p, vbW: w };
  }, [fc]);

  const displayUnit = selectedUnit ?? hoveredUnit;
  const tipW = 236;
  const tipH = 190;
  let tipLeft = mouse.x + 16, tipTop = mouse.y + 16;
  if (tipLeft + tipW + 8 > size.w) tipLeft = mouse.x - tipW - 16;
  if (tipTop + tipH + 8 > size.h) tipTop = mouse.y - tipH - 16;
  tipLeft = Math.max(8, tipLeft); tipTop = Math.max(8, tipTop);

  const mapHeight = height ?? (isMobile ? 460 : "min(70vh, 560px)");

  return (
    <div
      ref={ref}
      className="relative overflow-hidden"
      style={{ height: mapHeight }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
        setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => onHover(null)}
      onClick={() => { if (!isMobile) onSelect(null); }}
    >
      {fc ? (
        <ComposableMap projection={projection} width={vbW} height={H} style={{ width: "100%", height: "100%" }}>
          <ZoomableGroup key={mapKey} filterZoomEvent={filterZoom} onMoveEnd={() => setMoved(true)} minZoom={1} maxZoom={8}>
            <Geographies geography={fc}>
              {({ geographies }: { geographies: Geo[] }) => {
                // draw the emphasized units last so their stroke sits on top
                const ordered = [...geographies].sort((a, b) => {
                  const ua = unitOf(a.properties), ub = unitOf(b.properties);
                  const ra = ua === selectedUnit ? 2 : ua === hoveredUnit ? 1 : 0;
                  const rb = ub === selectedUnit ? 2 : ub === hoveredUnit ? 1 : 0;
                  return ra - rb;
                });
                return ordered.map((geo) => {
                  const unit = unitOf(geo.properties);
                  const dimmed = isDimmed(unit);
                  const fill = dimmed ? t.hoverUnfilled : (colorFor(unit) ?? "var(--map-unfilled)");
                  const emphasized = unit === selectedUnit || unit === hoveredUnit;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={emphasized ? t.hoverStroke : t.mapStroke}
                      strokeWidth={emphasized ? 1.6 : dimmed ? 0.25 : 0.5}
                      style={{
                        default: { outline: "none", transition: "fill 120ms" },
                        hover: { outline: "none", opacity: dimmed ? 1 : 0.88 },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => { if (!dimmed) onHover(unit); }}
                      onMouseLeave={() => onHover(null)}
                      onClick={(e: ReactMouseEvent<SVGPathElement>) => {
                        e.stopPropagation();
                        if (dimmed) return;
                        onSelect(selectedUnit === unit ? null : unit);
                      }}
                    />
                  );
                });
              }}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      ) : (
        <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading map…</div>
      )}

      {moved && (
        <button
          onClick={(e) => { e.stopPropagation(); setMapKey((k) => k + 1); setMoved(false); }}
          className="absolute right-2 top-2 z-10 rounded-md px-2 py-1 text-[10px] font-semibold"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 }}
        >
          Reset view
        </button>
      )}

      {legend && !(displayUnit && isMobile) && (
        <div
          className="absolute bottom-0 left-0 z-10 pr-3 pt-1.5 text-[10px]"
          style={{ background: "var(--map-legend-bg)", color: "var(--app-text-muted)" }}
        >
          {legend}
        </div>
      )}

      {displayUnit && !isMobile && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg"
          style={{ left: tipLeft, top: tipTop, width: tipW, padding: 12, background: t.panel, border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
        >
          {renderTooltip(displayUnit)}
        </div>
      )}
      {displayUnit && isMobile && (
        <div
          className="absolute bottom-2 left-2 right-2 z-20 rounded-lg"
          style={{ padding: "8px 10px", background: t.panel, border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close precinct details"
            onClick={(e) => { e.stopPropagation(); onSelect(null); onHover(null); }}
            className="absolute right-0.5 top-0.5 flex h-9 w-9 items-center justify-center rounded-md text-[15px] leading-none"
            style={{ color: "var(--app-text-muted)" }}
          >
            ✕
          </button>
          <div className="pr-8">{renderTooltip(displayUnit)}</div>
        </div>
      )}
    </div>
  );
}
