"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31PrecinctCodeToName2022, oh31ByPrecinct2022 } from "@/data/oh31PrecinctData2022";
import { matchesTownshipFilter, type TownshipFilter } from "@/lib/oh31Analysis";

const GEO_URL = "/oh31_2022_precincts.geojson";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctGeography = {
  rsmKey: string;
  properties?: GeoJsonProperties & { PRECINCT?: string };
  geometry?: Geometry;
};

function filterMapZoomEvent(event: { type?: string; ctrlKey?: boolean; button?: number }): boolean {
  return event.type !== "dblclick" && event.type !== "touchend" && (!event.ctrlKey || event.type === "wheel") && !event.button;
}

interface Props {
  activeRace: RaceKey;
  darkMode: boolean;
  townshipFilter: TownshipFilter;
  raceLabel: string;
  onMobilePopupChange?: (visible: boolean) => void;
  swingLookup?: Record<string, { dPct: number; rPct: number; margin: number }> | null;
  swingLabel?: string;
}

type PropsMap = Record<string, number>;
const RACE_KEYS: RaceKey[] = ["stRep", "pres", "senate", "uSHouse"];

function getVotes(props: PropsMap, raceKey: RaceKey): { d: number; r: number } {
  if (raceKey === "pres") {
    return { d: props.G22GOVDWHA ?? 0, r: props.G22GOVRDEW ?? 0 };
  }
  if (raceKey === "senate") {
    return { d: props.G22USSDRYA ?? 0, r: props.G22USSRVAN ?? 0 };
  }
  let d = 0, r = 0;
  for (const [key, val] of Object.entries(props)) {
    if (typeof val !== "number" || val === 0) continue;
    if (raceKey === "uSHouse") {
      if (/^GCON\d+D/.test(key)) d += val;
      else if (/^GCON\d+R/.test(key)) r += val;
    } else {
      // stRep: State House (GSL fields)
      if (/^GSL\d+D/.test(key)) d += val;
      else if (/^GSL\d+R/.test(key)) r += val;
    }
  }
  return { d, r };
}

function getMarginAndPct(props: PropsMap, raceKey: RaceKey) {
  const { d, r } = getVotes(props, raceKey);
  const total = d + r;
  if (total === 0) return null;
  return {
    d, r,
    dPct: (d / total) * 100,
    rPct: (r / total) * 100,
    margin: ((d - r) / total) * 100,
  };
}


type HoveredPrecinct = {
  name: string;
  ballots: number;
  races: Record<RaceKey, { dVotes: number; rVotes: number; dPct: number; rPct: number }>;
};

export default function OH31MapSimple2022({ activeRace, darkMode, townshipFilter, raceLabel, onMobilePopupChange, swingLookup, swingLabel }: Props) {
  const [hovered, setHovered] = useState<HoveredPrecinct | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [pinned, setPinned] = useState<{ precinct: HoveredPrecinct; pos: { x: number; y: number } } | null>(null);
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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;

  const tipW = swingLookup != null ? 220 : 200;
  const tipH = swingLookup != null ? 170 : 110;
  const offset = 16;
  const edgePad = 8;
  const mapHeight = isMobile ? 520 : "min(72vh, 520px)";
  const mapScale = isMobile ? 110000 : 65000;

  const displayPrecinct = pinned?.precinct ?? hovered;
  const tooltipAnchor = pinned?.pos ?? mousePos;
  const activeRaceData = displayPrecinct ? displayPrecinct.races[activeRace] : null;
  const currentPctMargin = activeRaceData ? activeRaceData.dPct - activeRaceData.rPct : null;
  const swingEntry = (swingLookup != null && displayPrecinct) ? (swingLookup[displayPrecinct.name] ?? null) : null;
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

  useEffect(() => {
    onMobilePopupChange?.(Boolean(displayPrecinct && isMobile));
  }, [displayPrecinct, isMobile, onMobilePopupChange]);

  function buildHovered(props: PropsMap, name: string): HoveredPrecinct {
    const govData = getMarginAndPct(props, "pres");
    const ballots = govData ? govData.d + govData.r : 0;
    const races = {} as HoveredPrecinct["races"];
    for (const key of RACE_KEYS) {
      const data = getMarginAndPct(props, key);
      races[key] = data
        ? { dVotes: data.d, rVotes: data.r, dPct: data.dPct, rPct: data.rPct }
        : { dVotes: 0, rVotes: 0, dPct: 0, rPct: 0 };
    }
    return { name, ballots, races };
  }

  return (
    <div
      ref={mapRef}
      className="relative rounded-xl overflow-hidden"
      style={{ height: mapHeight, zIndex: 0 }}
      onClick={() => {
        if (!isMobile) {
          setPinned(null);
          setHovered(null);
        }
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
        <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: PrecinctGeography[] }) =>
            geographies.map((geo) => {
              const props = (geo.properties ?? {}) as PropsMap;
              const code = (geo.properties?.PRECINCT as string) ?? "";
              const name = oh31PrecinctCodeToName2022[code] ?? code;
              const data = getMarginAndPct(props, activeRace);
              const isHovered = displayPrecinct?.name === name;
              const township = oh31ByPrecinct2022[name]?.township ?? "";
              const matches = !township || matchesTownshipFilter(township, townshipFilter);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={(() => {
                    if (!matches) return t.hoverUnfilled;
                    if (!data) return "var(--oh31-simple-map-bg)";
                    if (swingLookup != null) {
                      const entry = swingLookup[name];
                      return entry !== undefined ? getRaceColor(entry.margin - data.margin) : "var(--oh31-simple-map-bg)";
                    }
                    return getRaceColor(-data.margin);
                  })()}
                  stroke={t.mapStroke}
                  strokeWidth={isHovered ? 1.5 : matches ? 0.4 : 0.2}
                  style={{
                    default: { outline: "none" },
                    hover:   { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => {
                    if (!pinned && matches) setHovered(buildHovered(props, name));
                  }}
                  onMouseLeave={() => {
                    if (!pinned) setHovered(null);
                  }}
                  onClick={(e: ReactMouseEvent<SVGPathElement>) => {
                    e.stopPropagation();
                    if (isMobile || !matches) return;
                    const rect = mapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const pos = {
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    };
                    const precinct = buildHovered(props, name);
                    const isSamePinned = pinned?.precinct.name === precinct.name;
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
            {displayPrecinct.name}
          </div>
          <div className="text-[11px] mb-3" style={{ color: t.textMuted }}>
            {raceLabel} · {displayPrecinct.ballots.toLocaleString()} ballots
          </div>
          {activeRaceData && (
            <>
              <div className="inline-grid grid-cols-[auto_auto_auto] items-start gap-2 mb-1">
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: t.demText }}>
                    D {activeRaceData.dVotes.toLocaleString()}
                  </div>
                  <div className="text-[11px]" style={{ color: t.demText, opacity: 0.9 }}>
                    ({activeRaceData.dPct.toFixed(1)}%)
                  </div>
                </div>
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: t.repText }}>
                    R {activeRaceData.rVotes.toLocaleString()}
                  </div>
                  <div className="text-[11px]" style={{ color: t.repText, opacity: 0.9 }}>
                    ({activeRaceData.rPct.toFixed(1)}%)
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
      {displayPrecinct && isMobile && activeRaceData && (
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
            {displayPrecinct.name}
          </div>
          <div className="flex items-center gap-x-1 text-[10px] leading-none">
            <span className="whitespace-nowrap" style={{ color: t.textMuted }}>
              {displayPrecinct.ballots.toLocaleString()} bal
            </span>
            <span className="whitespace-nowrap font-semibold tracking-tight" style={{ color: t.demText }}>
              D {activeRaceData.dVotes.toLocaleString()}
            </span>
            <span className="whitespace-nowrap font-semibold tracking-tight" style={{ color: t.repText }}>
              R {activeRaceData.rVotes.toLocaleString()}
            </span>
            <span className="whitespace-nowrap tracking-tight" style={{ color: t.demText }}>
              {activeRaceData.dPct.toFixed(1)}%
            </span>
            <span className="whitespace-nowrap tracking-tight" style={{ color: t.repText }}>
              {activeRaceData.rPct.toFixed(1)}%
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
        </div>
      )}
    </div>
  );
}
