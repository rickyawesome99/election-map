"use client";

import { useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";

const COUNTIES_URL = "/us-counties.json";
const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const FIPS_TO_STATE: Record<string, { abbr: string; name: string }> = {
  "01": { abbr: "AL", name: "Alabama" },
  "02": { abbr: "AK", name: "Alaska" },
  "04": { abbr: "AZ", name: "Arizona" },
  "05": { abbr: "AR", name: "Arkansas" },
  "06": { abbr: "CA", name: "California" },
  "08": { abbr: "CO", name: "Colorado" },
  "09": { abbr: "CT", name: "Connecticut" },
  "10": { abbr: "DE", name: "Delaware" },
  "11": { abbr: "DC", name: "District of Columbia" },
  "12": { abbr: "FL", name: "Florida" },
  "13": { abbr: "GA", name: "Georgia" },
  "15": { abbr: "HI", name: "Hawaii" },
  "16": { abbr: "ID", name: "Idaho" },
  "17": { abbr: "IL", name: "Illinois" },
  "18": { abbr: "IN", name: "Indiana" },
  "19": { abbr: "IA", name: "Iowa" },
  "20": { abbr: "KS", name: "Kansas" },
  "21": { abbr: "KY", name: "Kentucky" },
  "22": { abbr: "LA", name: "Louisiana" },
  "23": { abbr: "ME", name: "Maine" },
  "24": { abbr: "MD", name: "Maryland" },
  "25": { abbr: "MA", name: "Massachusetts" },
  "26": { abbr: "MI", name: "Michigan" },
  "27": { abbr: "MN", name: "Minnesota" },
  "28": { abbr: "MS", name: "Mississippi" },
  "29": { abbr: "MO", name: "Missouri" },
  "30": { abbr: "MT", name: "Montana" },
  "31": { abbr: "NE", name: "Nebraska" },
  "32": { abbr: "NV", name: "Nevada" },
  "33": { abbr: "NH", name: "New Hampshire" },
  "34": { abbr: "NJ", name: "New Jersey" },
  "35": { abbr: "NM", name: "New Mexico" },
  "36": { abbr: "NY", name: "New York" },
  "37": { abbr: "NC", name: "North Carolina" },
  "38": { abbr: "ND", name: "North Dakota" },
  "39": { abbr: "OH", name: "Ohio" },
  "40": { abbr: "OK", name: "Oklahoma" },
  "41": { abbr: "OR", name: "Oregon" },
  "42": { abbr: "PA", name: "Pennsylvania" },
  "44": { abbr: "RI", name: "Rhode Island" },
  "45": { abbr: "SC", name: "South Carolina" },
  "46": { abbr: "SD", name: "South Dakota" },
  "47": { abbr: "TN", name: "Tennessee" },
  "48": { abbr: "TX", name: "Texas" },
  "49": { abbr: "UT", name: "Utah" },
  "50": { abbr: "VT", name: "Vermont" },
  "51": { abbr: "VA", name: "Virginia" },
  "53": { abbr: "WA", name: "Washington" },
  "54": { abbr: "WV", name: "West Virginia" },
  "55": { abbr: "WI", name: "Wisconsin" },
  "56": { abbr: "WY", name: "Wyoming" },
};

function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

type County = { fips: string; name: string; stateAbbr: string; stateName: string };

export default function NationalCountyMap({ theme: t }: { theme: Theme }) {
  const [hovered, setHovered] = useState<County | null>(null);
  const [selected, setSelected] = useState<County | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);

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
        const tipW = 170;
        const tipH = 52;
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
        const areaLabel = getAreaLabel(hovered.stateAbbr);
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
            <div className="font-bold text-xs" style={{ color: t.textPrimary }}>
              {hovered.name} {areaLabel}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: t.textMuted }}>
              {hovered.stateName} · FIPS {hovered.fips}
            </div>
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
          <Geographies geography={COUNTIES_URL}>
            {({ geographies }: any) =>
              geographies.map((geo: any) => {
                const fips = String(geo.id ?? "");
                const statePrefix = fips.slice(0, 2);
                const stateInfo = FIPS_TO_STATE[statePrefix];
                const county: County = {
                  fips,
                  name: geo.properties?.name ?? "",
                  stateAbbr: stateInfo?.abbr ?? "",
                  stateName: stateInfo?.name ?? "",
                };
                const isSelected = selected?.fips === fips;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setHovered(county)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (Date.now() < ignoreClickUntilRef.current) return;
                      setSelected(isSelected ? null : county);
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
                      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;

                      ignoreClickUntilRef.current = Date.now() + 500;
                      setSelected(isSelected ? null : county);
                    }}
                    style={{
                      default: {
                        fill: isSelected ? t.hoverUnfilled : t.mapUnfilled,
                        stroke: isSelected ? t.hoverStroke : t.mapStroke,
                        strokeWidth: isSelected ? 1.75 : 0.3,
                        outline: "none",
                      },
                      hover: {
                        fill: t.hoverUnfilled,
                        stroke: t.hoverStroke,
                        strokeWidth: 0.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: t.hoverUnfilled,
                        stroke: t.hoverStroke,
                        strokeWidth: 1.75,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* State outlines overlay */}
          <Geographies geography={STATES_URL}>
            {({ geographies }: any) =>
              geographies.map((geo: any) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: "none", stroke: t.mapStroke, strokeWidth: 0.8, outline: "none", pointerEvents: "none" },
                    hover:   { fill: "none", stroke: t.mapStroke, strokeWidth: 0.8, outline: "none", pointerEvents: "none" },
                    pressed: { fill: "none", stroke: t.mapStroke, strokeWidth: 0.8, outline: "none", pointerEvents: "none" },
                  }}
                />
              ))
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Reset zoom */}
      {viewChanged && (
        <div
          className="absolute rounded-xl p-1.5 backdrop-blur-sm z-10"
          style={{ top: "1rem", left: "1rem", background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
        >
          <nav className="flex rounded-lg p-1" style={{ background: t.tabBg }}>
            <button
              onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
              className="px-2 py-1 rounded-md text-xs font-medium"
              style={{ color: t.textMuted }}
            >
              Reset
            </button>
          </nav>
        </div>
      )}

      {/* Selected county panel */}
      {selected && (
        <div
          className="hidden md:flex flex-col absolute z-30 rounded-xl"
          style={{
            right: "1.25rem",
            bottom: "12px",
            width: 172,
            background: t.legendBg,
            border: `1px solid ${t.border}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            color: t.textPrimary,
          }}
        >
          <div className="p-2.5 pb-2" style={{ borderBottom: `1px solid ${t.border}` }}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="text-[11px] font-bold leading-tight" style={{ color: t.textPrimary }}>
                  {selected.name} {getAreaLabel(selected.stateAbbr)}
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: t.textMuted }}>
                  {selected.stateName}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="shrink-0 mt-0.5" style={{ color: t.textVeryMuted }}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[9px]" style={{ color: t.textVeryMuted }}>FIPS {selected.fips}</div>
            <div className="mt-1.5 text-[9px]" style={{ color: t.textVeryMuted }}>Election data coming soon</div>
          </div>
        </div>
      )}

      {/* Mobile selected strip */}
      {selected && (
        <div
          className="md:hidden absolute bottom-0 left-0 right-0 z-30 flex items-center h-12 px-3 gap-3"
          style={{ background: t.panel, borderTop: `1px solid ${t.border}` }}
        >
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight truncate" style={{ color: t.textPrimary }}>
              {selected.name} {getAreaLabel(selected.stateAbbr)}
            </span>
            <span className="text-[10px]" style={{ color: t.textMuted }}>{selected.stateName} · FIPS {selected.fips}</span>
          </div>
          <button onClick={() => setSelected(null)} className="shrink-0" style={{ color: t.textVeryMuted }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
