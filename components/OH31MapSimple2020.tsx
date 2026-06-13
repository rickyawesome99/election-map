"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31ByPrecinct2020 } from "@/data/oh31PrecinctData2020";
import { OH31Precinct } from "@/data/oh31PrecinctData";
import { matchesTownshipFilter, type TownshipFilter } from "@/lib/oh31Analysis";

const GEO_URL = "/oh31_2020_precincts.geojson";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctGeography = {
  rsmKey: string;
  properties?: GeoJsonProperties & { NAME20?: string };
  geometry?: Geometry;
};

interface Props {
  activeRace: RaceKey;
  darkMode: boolean;
  townshipFilter: TownshipFilter;
  raceLabel: string;
  onMobilePopupChange?: (visible: boolean) => void;
  swingLookup?: Record<string, { dPct: number; rPct: number; margin: number }> | null;
  swingLabel?: string;
}

export default function OH31MapSimple2020({ activeRace, darkMode, townshipFilter, raceLabel, onMobilePopupChange, swingLookup, swingLabel }: Props) {
  const [hovered, setHovered] = useState<OH31Precinct | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [pinned, setPinned] = useState<{ precinct: OH31Precinct; pos: { x: number; y: number } } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      const mobileViewport = window.matchMedia("(max-width: 767px)").matches;
      const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      setIsMobile(mobileViewport && coarsePointer);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    onMobilePopupChange?.(Boolean((pinned?.precinct ?? hovered) && isMobile));
  }, [pinned, hovered, isMobile, onMobilePopupChange]);

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const tipW = swingLookup != null ? 220 : 200;
  const tipH = swingLookup != null ? 170 : 110;
  const offset = 16;
  const edgePad = 8;
  const mapHeight = isMobile ? 520 : "min(72vh, 520px)";
  const mapScale = isMobile ? 110000 : 65000;
  const displayPrecinct = pinned?.precinct ?? hovered;
  const tooltipAnchor = pinned?.pos ?? mousePos;
  const activeRaceResult = displayPrecinct ? displayPrecinct[activeRace] : null;
  const currentPctMargin = activeRaceResult ? activeRaceResult.dPct - activeRaceResult.rPct : null;
  const swingEntry = (swingLookup != null && displayPrecinct) ? (swingLookup[displayPrecinct.precinct] ?? null) : null;
  const swingMargin = currentPctMargin != null && swingEntry != null ? currentPctMargin - swingEntry.margin : null;
  const absMarginLabel = currentPctMargin != null
    ? (currentPctMargin >= 0 ? `D+${currentPctMargin.toFixed(1)}%` : `R+${Math.abs(currentPctMargin).toFixed(1)}%`)
    : null;
  const absMarginColor = currentPctMargin != null ? (currentPctMargin >= 0 ? t.demText : t.repText) : t.textMuted;
  const activeRaceMargin = swingMargin != null
    ? (swingMargin >= 0 ? `D+${swingMargin.toFixed(1)}%` : `R+${Math.abs(swingMargin).toFixed(1)}%`)
    : absMarginLabel;
  const activeRaceMarginColor = swingMargin != null
    ? (swingMargin >= 0 ? t.demText : t.repText)
    : absMarginColor;

  let tipLeft = tooltipAnchor.x + offset;
  let tipTop  = tooltipAnchor.y + offset;
  if (tipLeft + tipW + edgePad > mapSize.w) tipLeft = tooltipAnchor.x - tipW - offset;
  if (tipTop  + tipH + edgePad > mapSize.h) tipTop  = tooltipAnchor.y - tipH - offset;
  if (tipLeft < edgePad) tipLeft = edgePad;
  if (tipTop  < edgePad) tipTop  = edgePad;

  return (
    <div
      ref={mapRef}
      className="relative rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--app-border)", background: darkMode ? t.bg : t.panel, height: mapHeight, zIndex: 0 }}
      onClick={() => {
        if (!isMobile) { setPinned(null); setHovered(null); }
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => {
        if (!pinned) setHovered(null);
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-81.5692, 41.1295], scale: mapScale }}
        width={800}
        height={520}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup key={mapKey} onMoveEnd={() => setViewChanged(true)}>
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: PrecinctGeography[] }) =>
            geographies.map((geo) => {
              const name = (geo.properties?.NAME20 as string) ?? "";
              const precinct = oh31ByPrecinct2020[name];
              const race = precinct?.[activeRace];
              const isHovered = displayPrecinct?.precinct === name;
              const matches = !precinct || matchesTownshipFilter(precinct.township, townshipFilter);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={(() => {
                    if (!matches) return t.hoverUnfilled;
                    if (!race) return darkMode ? t.bg : t.panel;
                    const absMargin = race.dPct - race.rPct;
                    if (swingLookup != null) {
                      const entry = swingLookup[name];
                      return entry !== undefined ? getRaceColor(absMargin - entry.margin) : (darkMode ? t.bg : t.panel);
                    }
                    return getRaceColor(absMargin);
                  })()}
                  stroke={t.mapStroke}
                  strokeWidth={isHovered ? 1.5 : matches ? 0.4 : 0.2}
                  style={{
                    default: { outline: "none" },
                    hover:   { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => {
                    if (!pinned && matches && precinct) setHovered(precinct);
                  }}
                  onMouseLeave={() => {
                    if (!pinned) setHovered(null);
                  }}
                  onClick={(e: ReactMouseEvent<SVGPathElement>) => {
                    e.stopPropagation();
                    if (isMobile || !matches || !precinct) return;
                    const rect = mapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                    const isSamePinned = pinned?.precinct.precinct === precinct.precinct;
                    setMapSize({ w: rect.width, h: rect.height });
                    setMousePos(pos);
                    if (isSamePinned) {
                      setPinned(null);
                      setHovered(null);
                    } else {
                      setHovered(precinct);
                      setPinned({ precinct, pos });
                    }
                  }}
                />
              );
            })
          }
        </Geographies>
        </ZoomableGroup>
      </ComposableMap>

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

      {/* Desktop tooltip */}
      {displayPrecinct && !isMobile && (
        <div
          className="absolute pointer-events-none rounded-lg"
          style={{
            left: tipLeft, top: tipTop, width: tipW,
            padding: "12px",
            background: t.panel,
            border: "1px solid var(--app-border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 1,
          }}
        >
          <div className="text-[12px] font-bold tracking-[0.04em] uppercase mb-2" style={{ color: t.textPrimary }}>
            {displayPrecinct.precinct}
          </div>
          <div className="text-[11px] mb-3" style={{ color: t.textMuted }}>
            {raceLabel} · {displayPrecinct.ballotsCast.toLocaleString()} ballots
          </div>
          {activeRaceResult && (
            <>
              <div className="inline-grid grid-cols-[auto_auto_auto] items-start gap-2 mb-1">
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: t.demText }}>
                    D {activeRaceResult.dVotes.toLocaleString()}
                  </div>
                  <div className="text-[11px]" style={{ color: t.demText, opacity: 0.9 }}>
                    ({activeRaceResult.dPct.toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: t.repText }}>
                    R {activeRaceResult.rVotes.toLocaleString()}
                  </div>
                  <div className="text-[11px]" style={{ color: t.repText, opacity: 0.9 }}>
                    ({activeRaceResult.rPct.toFixed(1)}%)
                  </div>
                </div>
                <div className="pt-[1px] text-[13px] leading-none font-bold whitespace-nowrap" style={{ color: absMarginColor }}>
                  {absMarginLabel}
                </div>
              </div>
              {swingEntry && (
                <>
                  <div className="text-[10px] mt-2 mb-0.5" style={{ color: t.textMuted }}>vs {swingLabel}</div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-medium" style={{ color: t.demText }}>D {swingEntry.dPct.toFixed(1)}%</span>
                    <span className="text-[11px] font-medium" style={{ color: t.repText }}>R {swingEntry.rPct.toFixed(1)}%</span>
                    <span className="text-[11px] font-bold" style={{ color: swingEntry.margin >= 0 ? t.demText : t.repText }}>
                      {swingEntry.margin >= 0 ? `D+${swingEntry.margin.toFixed(1)}%` : `R+${Math.abs(swingEntry.margin).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="pt-1.5" style={{ borderTop: "1px solid var(--app-border)" }}>
                    <span className="text-[10px] mr-1" style={{ color: t.textMuted }}>Swing</span>
                    <span className="text-[14px] font-bold" style={{ color: activeRaceMarginColor }}>{activeRaceMargin}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Mobile tooltip */}
      {displayPrecinct && isMobile && (
        <div
          className="absolute left-3 right-3 bottom-3 pointer-events-none rounded-lg"
          style={{
            padding: "8px 10px",
            background: t.panel,
            border: "1px solid var(--app-border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            zIndex: 5,
          }}
        >
          <div className="text-[11px] font-semibold mb-1 truncate" style={{ color: t.textPrimary }}>
            {displayPrecinct.precinct}
          </div>
          {activeRaceResult && (
            <>
              <div className="flex items-center gap-x-1 text-[10px] leading-none">
                <span className="whitespace-nowrap" style={{ color: t.textMuted }}>
                  {displayPrecinct.ballotsCast.toLocaleString()} bal
                </span>
                <span className="whitespace-nowrap font-semibold tracking-tight" style={{ color: t.demText }}>
                  D {activeRaceResult.dVotes.toLocaleString()}
                </span>
                <span className="whitespace-nowrap font-semibold tracking-tight" style={{ color: t.repText }}>
                  R {activeRaceResult.rVotes.toLocaleString()}
                </span>
                <span className="whitespace-nowrap tracking-tight" style={{ color: t.demText }}>
                  {activeRaceResult.dPct.toFixed(1)}%
                </span>
                <span className="whitespace-nowrap tracking-tight" style={{ color: t.repText }}>
                  {activeRaceResult.rPct.toFixed(1)}%
                </span>
                <span className="ml-auto whitespace-nowrap text-[18px] leading-none font-semibold tracking-tight" style={{ color: absMarginColor }}>
                  {absMarginLabel}
                </span>
              </div>
              {swingEntry && (
                <div className="flex items-center gap-x-1 text-[9px] mt-1 leading-none" style={{ color: t.textMuted }}>
                  <span>vs {swingLabel}:</span>
                  <span style={{ color: t.demText }}>D {swingEntry.dPct.toFixed(1)}%</span>
                  <span style={{ color: t.repText }}>R {swingEntry.rPct.toFixed(1)}%</span>
                  <span style={{ color: swingEntry.margin >= 0 ? t.demText : t.repText }}>
                    {swingEntry.margin >= 0 ? `D+${swingEntry.margin.toFixed(1)}%` : `R+${Math.abs(swingEntry.margin).toFixed(1)}%`}
                  </span>
                  <span className="ml-auto font-semibold" style={{ color: t.textMuted }}>Swing</span>
                  <span className="font-bold text-[13px]" style={{ color: activeRaceMarginColor }}>{activeRaceMargin}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
