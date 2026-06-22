"use client";

import { useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import Link from "next/link";
import type { Theme } from "./ForecastMap";
import type { StateRow } from "./StatesTable";
import { getRaceColor } from "@/lib/colorScale";
import { filterMapZoomEvent } from "@/lib/mapZoom";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export type MapMode = "default" | "governor" | "senate" | "house" | "legislature";

const DEM_FILL  = "#1b408c";
const REP_FILL  = "#be1c29";
const SPLIT_FILL = "#4B0082";

function chamberLean(dem: number | null, rep: number | null): "D" | "R" | "tie" | null {
  if (dem == null || rep == null) return null;
  if (dem > rep) return "D";
  if (rep > dem) return "R";
  return "tie";
}

function stateFill(row: StateRow | undefined, t: Theme, mode: MapMode): string {
  if (!row) return t.mapUnfilled;
  // PVI uses positive values for Republicans, while the shared race color
  // scale uses positive values for Democrats.
  if (mode === "default") {
    if (row.pvi2026 == null) return t.mapUnfilled;
    if (row.pvi2026 === 0) return t.textMuted;
    return getRaceColor(-row.pvi2026);
  }
  if (mode === "governor") {
    if (row.govParty === "D") return DEM_FILL;
    if (row.govParty === "R") return REP_FILL;
    if (row.govParty === "I") return "#a08c20";
    return t.mapUnfilled;
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
    if (h == null && s == null) return t.mapUnfilled;
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
  return t.mapUnfilled;
}

function formatPvi(pvi: number | null): string {
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
  onSelect,
  onModeChange,
}: {
  rows: StateRow[];
  theme: Theme;
  onSelect?: (row: StateRow | null) => void;
  onModeChange?: (mode: MapMode) => void;
}) {
  const [mode, setMode] = useState<MapMode>("default");
  const [hovered, setHovered] = useState<StateRow | null>(null);
  const [selected, setSelected] = useState<StateRow | null>(null);

  function updateMode(m: MapMode) { setMode(m); onModeChange?.(m); }
  function updateSelected(row: StateRow | null) { setSelected(row); onSelect?.(row); }
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
            {mode === "default" && (
              <div className="text-[10px] font-semibold" style={{ color: hovered.pvi2026 == null ? t.textVeryMuted : hovered.pvi2026 > 0 ? t.repText : hovered.pvi2026 < 0 ? t.demText : t.textMuted }}>
                PVI: {formatPvi(hovered.pvi2026)}
              </div>
            )}
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
        projectionConfig={{ scale: 1200 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          key={mapKey}
          filterZoomEvent={filterMapZoomEvent}
          onMoveEnd={() => setViewChanged(true)}
        >
          <Geographies geography={STATES_URL}>
            {({ geographies }: any) =>
              geographies.map((geo: any) => {
                const row = rowByName[geo.properties?.name ?? ""];
                const fill = stateFill(row, t, mode);
                const isSelected = selected?.abbr === row?.abbr;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => row && setHovered(row)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (Date.now() < ignoreClickUntilRef.current) return;
                      if (row) updateSelected(isSelected ? null : row);
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
                      updateSelected(isSelected ? null : row);
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

      {/* Mode toggle — mobile */}
      <div
        className="absolute left-1/2 top-2 -translate-x-1/2 rounded-lg p-1 md:hidden"
        style={{ background: t.legendBg, border: `1px solid ${t.border}` }}
      >
        <nav className="flex gap-0.5">
          {(["default", "governor", "senate", "house", "legislature"] as MapMode[]).map((m) => (
            <button
              key={m}
              onClick={() => updateMode(m)}
              className="rounded-md px-2.5 py-1 text-[10px] font-medium transition-all"
              style={mode === m ? { background: "#388bfd", color: "#ffffff" } : { color: t.textMuted }}
            >
              {m === "default" ? "PVI" : m === "governor" ? "Governor" : m === "senate" ? "Senate" : m === "house" ? "House" : "Legislature"}
            </button>
          ))}
        </nav>
      </div>

      {/* Mode toggle — bottom left */}
      <div
        className="hidden md:block absolute rounded-xl p-1.5 backdrop-blur-sm"
        style={{ top: "1rem", right: "1.25rem", background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
      >
        <nav className="flex rounded-lg p-1 gap-0.5" style={{ background: t.tabBg }}>
          {(["default", "governor", "senate", "house", "legislature"] as MapMode[]).map((m) => (
            <button
              key={m}
              onClick={() => updateMode(m)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
              style={mode === m ? { background: "#388bfd", color: "#ffffff" } : { color: t.textMuted }}
            >
              {m === "default" ? "PVI" : m === "governor" ? "G" : m === "senate" ? "S" : m === "house" ? "H" : "Leg."}
            </button>
          ))}
        </nav>
      </div>

      {/* Reset zoom */}
      {viewChanged && (
        <button
          onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
          className="absolute z-10 bottom-3 left-2 md:bottom-auto md:top-4 md:left-4 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-sm"
          style={{ background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        >
          Reset
        </button>
      )}

      {/* Selected state panel (desktop) */}
      {selected && (
        <div
          className="absolute z-30 hidden md:flex flex-col overflow-hidden rounded-xl"
          style={{
            right: "1.25rem", bottom: "12px", width: 172,
            background: t.legendBg,
            border: `1px solid ${t.border}`,
            boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
            color: t.textPrimary,
          }}
        >
          {/* Header */}
          <div className="shrink-0 p-2 pb-1.5" style={{ borderBottom: `1px solid ${t.border}` }}>
            <div className="flex items-center justify-between gap-1.5">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold leading-tight" style={{ color: t.textPrimary }}>
                {selected.name}
              </h2>
              <button
                onClick={() => updateSelected(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
                style={{ color: t.textVeryMuted, background: t.tabBg }}
                aria-label="Close"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* Body */}
          <div className="p-2 flex flex-col gap-1.5">
            {mode === "default" && (
              <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>PVI</div>
                <div
                  className="text-[11px] font-bold"
                  style={{ color: selected.pvi2026 == null ? t.textVeryMuted : selected.pvi2026 > 0 ? t.repText : selected.pvi2026 < 0 ? t.demText : t.textMuted }}
                >
                  {formatPvi(selected.pvi2026)}
                </div>
              </div>
            )}
            {mode === "governor" && (
              <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>Governor</div>
                <PartyBadge party={selected.govParty} t={t} />
              </div>
            )}
            {mode === "senate" && (
              <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>Senate Seats</div>
                <div className="text-[11px] font-bold">
                  <span style={{ color: t.demText }}>{selected.senateDem}D</span>
                  <span style={{ color: t.textVeryMuted }}> / </span>
                  <span style={{ color: t.repText }}>{selected.senateRep}R</span>
                  {selected.senateInd > 0 && <><span style={{ color: t.textVeryMuted }}> / </span><span style={{ color: "#b8a020" }}>{selected.senateInd}I</span></>}
                </div>
              </div>
            )}
            {mode === "house" && (
              <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>House Delegation</div>
                <div className="text-[11px] font-bold">
                  <span style={{ color: t.demText }}>{selected.houseDem}D</span>
                  <span style={{ color: t.textVeryMuted }}> / </span>
                  <span style={{ color: t.repText }}>{selected.houseRep}R</span>
                </div>
              </div>
            )}
            {mode === "legislature" && (
              <>
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>State House</div>
                  <div className="text-[11px] font-bold">
                    <span style={{ color: t.demText }}>{selected.stateLegHouseDem ?? "—"}D</span>
                    <span style={{ color: t.textVeryMuted }}> / </span>
                    <span style={{ color: t.repText }}>{selected.stateLegHouseRep ?? "—"}R</span>
                  </div>
                </div>
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>State Senate</div>
                  <div className="text-[11px] font-bold">
                    <span style={{ color: t.demText }}>{selected.stateLegSenateDem ?? "—"}D</span>
                    <span style={{ color: t.textVeryMuted }}> / </span>
                    <span style={{ color: t.repText }}>{selected.stateLegSenateRep ?? "—"}R</span>
                  </div>
                </div>
              </>
            )}
            <Link
              href={`/states/${selected.id}?from=${encodeURIComponent("/?tab=states")}`}
              className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
              style={{ background: t.tabBg, color: t.textMuted }}
            >
              More Info
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
