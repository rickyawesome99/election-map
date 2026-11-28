"use client";

import { useMapTooltip } from "@/lib/useMapTooltip";
import { useRef, useState } from "react";
import { ComposableMap, Geography, ZoomableGroup } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import PinnedMapCard, { PinnedCardClose, PinnedCardLink, pinFromEvent, type MapPin } from "./maps/PinnedMapCard";

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

/** The state's hover card: its name, then the figure for the mode on the map. The phone's pinned
 *  card is this same body with a close button (`aside`) and a link to the state page (`footer`). */
export function StateCardBody({ row, mode, t, aside, footer }: { row: StateRow; mode: MapMode; t: Theme; aside?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs font-bold" style={{ color: t.textPrimary }}>{row.name}</div>
        {aside}
      </div>
      {mode === "governor" && <PartyBadge party={row.govParty} t={t} />}
      {mode === "senate" && (
        <div className="text-[10px]" style={{ color: t.textMuted }}>
          Senate: <span style={{ color: t.demText }}>{row.senateDem}D</span> / <span style={{ color: t.repText }}>{row.senateRep}R</span>
          {row.senateInd > 0 && <span style={{ color: "#b8a020" }}> / {row.senateInd}I</span>}
        </div>
      )}
      {mode === "house" && (
        <div className="text-[10px]" style={{ color: t.textMuted }}>
          House: <span style={{ color: t.demText }}>{row.houseDem}D</span> / <span style={{ color: t.repText }}>{row.houseRep}R</span>
        </div>
      )}
      {mode === "legislature" && (
        <div className="text-[10px] flex flex-col gap-0.5" style={{ color: t.textMuted }}>
          <span>St. House: <span style={{ color: t.demText }}>{row.stateLegHouseDem ?? "—"}D</span> / <span style={{ color: t.repText }}>{row.stateLegHouseRep ?? "—"}R</span></span>
          <span>St. Senate: <span style={{ color: t.demText }}>{row.stateLegSenateDem ?? "—"}D</span> / <span style={{ color: t.repText }}>{row.stateLegSenateRep ?? "—"}R</span></span>
        </div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </>
  );
}

export const STATE_CARD_BOX = (t: Theme) => ({ padding: "7px 10px", background: t.panel, border: `1px solid ${t.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" });
/** The pinned card is wider than the hover box, to fit its button. */
export const STATE_PIN_WIDTH = 190;
export const stateHref = (row: StateRow, mode: MapMode) => (mode === "legislature" ? `/states/${row.id}#legislature` : `/states/${row.id}`);

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
  const tip = useMapTooltip(14, 8);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  // Where the press that selected a state landed: a phone shows the hover card pinned there.
  const [pin, setPin] = useState<{ abbr: string; at: MapPin } | null>(null);
  const pick = (row: StateRow, isSelected: boolean, e: { clientX: number; clientY: number; target: EventTarget | null }) => {
    const at = pinFromEvent(e);
    setPin(isSelected || !at ? null : { abbr: row.abbr, at });
    onSelect(isSelected ? null : row);
  };

  const rowByName = Object.fromEntries(rows.map((r) => [r.name, r]));

  return (
    <div
      className="relative w-full h-full"
      data-map-pin=""
      onMouseMove={tip.onMouseMove}
    >
      {/* Phones: the hover card, pinned where the tap landed (the desktop list column shows the selection instead) */}
      {selected && pin?.abbr === selected.abbr && (
        <PinnedMapCard pin={pin.at} width={STATE_PIN_WIDTH} label={selected.name} className="md:hidden">
          <div className="rounded-lg" style={STATE_CARD_BOX(t)}>
            <StateCardBody row={selected} mode={mode} t={t}
              aside={<PinnedCardClose onClick={() => onSelect(null)} />}
              footer={<PinnedCardLink href={stateHref(selected, mode)}>Go to {selected.name}</PinnedCardLink>} />
          </div>
        </PinnedMapCard>
      )}
      {/* Hover tooltip */}
      {hovered && (() => {
        const tipW = 160;
        return (
          <div ref={tip.tooltipRef}
            className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
            style={{
              width: tipW,
              ...STATE_CARD_BOX(t),
            }}
          >
            <StateCardBody row={hovered} mode={mode} t={t} />
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
                    onClick={(e: React.MouseEvent) => {
                      if (Date.now() < ignoreClickUntilRef.current) return;
                      if (row) pick(row, isSelected, e);
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
                      pick(row, isSelected, e);
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
