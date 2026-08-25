"use client";

import { useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type GeoFeature = {
  rsmKey: string;
  id?: string | number;
  properties?: Record<string, string | undefined>;
};

export type StateRow = {
  id: string;       // URL slug, e.g. "california"
  name: string;
  abbr: string;
  govParty: "D" | "R" | "I" | null;
  senateDem: number;
  senateRep: number;
  senateInd: number;
  houseDem: number;
  houseRep: number;
  houseTotal: number;
  pres2024: number | null;  // positive = R margin, negative = D margin
  pvi2026: number | null;   // positive = R lean, negative = D lean
  stateLegHouseDem: number | null;
  stateLegHouseRep: number | null;
  stateLegSenateDem: number | null;
  stateLegSenateRep: number | null;
};

export type MapMode = "governor" | "senate" | "house" | "legislature";

export const DEM_FILL  = "#1b408c";
export const REP_FILL  = "#be1c29";
export const SPLIT_FILL = "#4B0082";

function chamberLean(dem: number | null, rep: number | null): "D" | "R" | "tie" | null {
  if (dem == null || rep == null) return null;
  if (dem > rep) return "D";
  if (rep > dem) return "R";
  return "tie";
}

export function legislatureControl(row: StateRow): Array<"D" | "R"> {
  const house = chamberLean(row.stateLegHouseDem, row.stateLegHouseRep);
  if (row.abbr === "NE") return house === "D" || house === "R" ? [house] : [];

  const senate = chamberLean(row.stateLegSenateDem, row.stateLegSenateRep);
  const houseControl = house === "tie" && (senate === "D" || senate === "R") ? senate : house;
  const senateControl = senate === "tie" && (house === "D" || house === "R") ? house : senate;
  return [houseControl, senateControl].filter((party): party is "D" | "R" => party === "D" || party === "R");
}

// `unfilled` is passed in so this can drive both the SVG map (real hex, theme-object based)
// and the cartogram grid (CSS custom properties) without either one depending on the other's theming.
export function stateFill(row: StateRow | undefined, mode: MapMode, unfilled: string): string {
  if (!row) return unfilled;
  if (mode === "governor") {
    if (row.govParty === "D") return DEM_FILL;
    if (row.govParty === "R") return REP_FILL;
    if (row.govParty === "I") return "#a08c20";
    return unfilled;
  }
  if (mode === "senate") {
    if (row.senateDem === 2) return DEM_FILL;
    if (row.senateRep === 2) return REP_FILL;
    return SPLIT_FILL;
  }
  if (mode === "house") {
    if (row.houseDem > row.houseRep) return DEM_FILL;
    if (row.houseRep > row.houseDem) return REP_FILL;
    return SPLIT_FILL;
  }
  if (mode === "legislature") {
    const h = chamberLean(row.stateLegHouseDem, row.stateLegHouseRep);
    const s = chamberLean(row.stateLegSenateDem, row.stateLegSenateRep);
    if (h == null && s == null) return unfilled;
    if (h === "D" && s === "D") return DEM_FILL;
    if (h === "R" && s === "R") return REP_FILL;
    if (h === "D" && s === "tie") return DEM_FILL;
    if (h === "R" && s === "tie") return REP_FILL;
    if (h === "tie" && s === "D") return DEM_FILL;
    if (h === "tie" && s === "R") return REP_FILL;
    if (h === "tie" && s === "tie") return SPLIT_FILL;
    if (h == null) return s === "D" ? DEM_FILL : s === "R" ? REP_FILL : SPLIT_FILL;
    if (s == null) return h === "D" ? DEM_FILL : h === "R" ? REP_FILL : SPLIT_FILL;
    return SPLIT_FILL;
  }
  return unfilled;
}

export function formatPvi(pvi: number | null): string {
  if (pvi == null) return "—";
  if (pvi === 0) return "EVEN";
  return pvi > 0 ? `R+${pvi}` : `D+${Math.abs(pvi)}`;
}

function PartyBadge({ party, t }: { party: "D" | "R" | "I" | null; t: Theme }) {
  if (!party) return <span style={{ color: t.textVeryMuted, fontSize: 10 }}>Unknown</span>;
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    D: { bg: "rgba(26,68,128,0.18)", text: t.demText,  label: "Democrat" },
    R: { bg: "rgba(139,26,26,0.18)", text: t.repText,  label: "Republican" },
    I: { bg: "rgba(120,106,26,0.18)", text: "#b8a020", label: "Independent" },
  };
  const c = colors[party];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

export default function StatesOverviewMap({
  rows,
  theme: t,
  mode,
  selected,
  onSelect,
}: {
  rows: StateRow[];
  theme: Theme;
  mode: MapMode;
  selected: StateRow | null;
  onSelect: (row: StateRow | null) => void;
}) {
  const [hovered, setHovered] = useState<StateRow | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);

  const rowByName = Object.fromEntries(rows.map((r) => [r.name, r]));

  return (
    <div
      className="relative w-full h-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {/* Hover tooltip */}
      {hovered && (() => {
        const tipW = 160;
        const tipH = 54;
        const offset = 14;
        const pad = 8;
        let left = mousePos.x + offset;
        let top = mousePos.y + offset;
        const cW = mapSize.w || 800;
        const cH = mapSize.h || 520;
        if (left + tipW + pad > cW) left = mousePos.x - tipW - offset;
        if (top + tipH + pad > cH) top = mousePos.y - tipH - offset;
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        return (
          <div
            className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
            style={{
              left, top, width: tipW,
              padding: "7px 10px",
              background: t.panel,
              border: `1px solid ${t.border}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <div className="font-bold text-xs mb-1" style={{ color: t.textPrimary }}>{hovered.name}</div>
            {mode === "governor" && <PartyBadge party={hovered.govParty} t={t} />}
            {mode === "senate" && (
              <div className="text-[10px]" style={{ color: t.textMuted }}>
                Senate: <span style={{ color: t.demText }}>{hovered.senateDem}D</span> / <span style={{ color: t.repText }}>{hovered.senateRep}R</span>
                {hovered.senateInd > 0 && <span style={{ color: "#b8a020" }}> / {hovered.senateInd}I</span>}
              </div>
            )}
            {mode === "house" && (
              <div className="text-[10px]" style={{ color: t.textMuted }}>
                House: <span style={{ color: t.demText }}>{hovered.houseDem}D</span> / <span style={{ color: t.repText }}>{hovered.houseRep}R</span>
              </div>
            )}
            {mode === "legislature" && (
              <div className="text-[10px] flex flex-col gap-0.5" style={{ color: t.textMuted }}>
                <span>St. House: <span style={{ color: t.demText }}>{hovered.stateLegHouseDem ?? "—"}D</span> / <span style={{ color: t.repText }}>{hovered.stateLegHouseRep ?? "—"}R</span></span>
                <span>St. Senate: <span style={{ color: t.demText }}>{hovered.stateLegSenateDem ?? "—"}D</span> / <span style={{ color: t.repText }}>{hovered.stateLegSenateRep ?? "—"}R</span></span>
              </div>
            )}
          </div>
        );
      })()}

      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1100 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          key={mapKey}
          filterZoomEvent={filterMapZoomEvent}
          onMoveEnd={() => setViewChanged(true)}
        >
          <Geographies geography={STATES_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo) => {
                const row = rowByName[geo.properties?.name ?? ""];
                const fill = stateFill(row, mode, t.mapUnfilled);
                const isSelected = selected?.abbr === row?.abbr;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => row && setHovered(row)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (Date.now() < ignoreClickUntilRef.current) return;
                      if (row) onSelect(isSelected ? null : row);
                    }}
                    onPointerDown={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") {
                        touchStartRef.current = null;
                        return;
                      }
                      touchStartRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerUp={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") return;
                      const start = touchStartRef.current;
                      touchStartRef.current = null;
                      if (!row || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;

                      ignoreClickUntilRef.current = Date.now() + 500;
                      onSelect(isSelected ? null : row);
                    }}
                    style={{
                      default: {
                        fill,
                        stroke: isSelected ? t.hoverStroke : t.mapStroke,
                        strokeWidth: isSelected ? 3.5 : 1,
                        outline: "none",
                      },
                      hover: {
                        fill: row ? fill : t.hoverUnfilled,
                        stroke: t.hoverStroke,
                        strokeWidth: 1.5,
                        outline: "none",
                        cursor: row ? "pointer" : "default",
                      },
                      pressed: {
                        fill,
                        stroke: t.hoverStroke,
                        strokeWidth: 3.5,
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

      {/* Reset zoom */}
      {viewChanged && (
        <button
          onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
          className="absolute z-10 bottom-3 left-2 md:bottom-auto md:top-3 md:left-3 rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{ background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
