"use client";

import { useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { getRaceColor, getRatingColors, marginToRating } from "@/lib/colorScale";
import { FIPS_TO_STATE } from "@/lib/fips";

const YEARS = [2008, 2012, 2016, 2020, 2024] as const;
type Year = (typeof YEARS)[number];

const COUNTIES_URL = "/us-counties.json";
const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type GeoFeature = {
  rsmKey: string;
  id?: string | number;
  properties?: Record<string, string | undefined>;
};

function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

type County = { fips: string; name: string; stateAbbr: string; stateName: string };

function marginLabel(margin: number): string {
  return margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
}

export default function NationalCountyMap({ theme: t }: { theme: Theme }) {
  const [hovered, setHovered] = useState<County | null>(null);
  const [selected, setSelected] = useState<County | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const [year, setYear] = useState<Year>(2024);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);

  return (
    <div className="w-full">
    <div className="w-full h-[320px] sm:h-[400px] md:h-[520px] flex flex-col">
      {/* Year toggle */}
      <div className="flex justify-center py-2 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
        <nav className="flex rounded-lg p-1 gap-0.5" style={{ background: t.tabBg }}>
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={
                y === year
                  ? { background: t.panel, color: t.textPrimary }
                  : { color: t.textMuted }
              }
            >
              {y}
            </button>
          ))}
        </nav>
      </div>

      <div
        className="relative w-full flex-1 min-h-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMapSize({ w: rect.width, h: rect.height });
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
      {/* Hover tooltip */}
      {hovered && (() => {
        const result = countyPresidentialData[hovered.fips]?.years[year] ?? null;
        const tipW = 180;
        const tipH = result ? 84 : 66;
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
            {result ? (
              <>
                <div className="text-xs font-bold mt-1" style={{ color: result.margin <= 0 ? t.demText : t.repText }}>
                  {marginLabel(result.margin)}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: t.textMuted }}>
                  {result.totalVotes.toLocaleString()} votes ({year})
                </div>
              </>
            ) : (
              <div className="text-[10px] mt-1" style={{ color: t.textVeryMuted }}>
                No {year} data
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
          <Geographies geography={COUNTIES_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo) => {
                const fips = String(geo.id ?? "");
                const statePrefix = fips.slice(0, 2);
                const stateInfo = FIPS_TO_STATE[statePrefix];
                const result = countyPresidentialData[fips]?.years[year] ?? null;
                const county: County = {
                  fips,
                  name: geo.properties?.name ?? "",
                  stateAbbr: stateInfo?.abbr ?? "",
                  stateName: stateInfo?.name ?? "",
                };
                const isSelected = selected?.fips === fips;
                const fill = result ? getRaceColor(result.margin) : t.mapUnfilled;

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
                        fill,
                        stroke: isSelected ? t.hoverStroke : t.mapStroke,
                        strokeWidth: isSelected ? 1.75 : 0.3,
                        outline: "none",
                      },
                      hover: {
                        fill: result ? fill : t.hoverUnfilled,
                        stroke: t.hoverStroke,
                        strokeWidth: 0.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill,
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
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo) => (
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
            {(() => {
              const result = countyPresidentialData[selected.fips]?.years[year] ?? null;
              if (!result) {
                return <div className="mt-1.5 text-[9px]" style={{ color: t.textVeryMuted }}>No {year} data</div>;
              }
              const { bg, text } = getRatingColors(marginToRating(result.margin));
              return (
                <>
                  <div
                    className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: bg, color: text }}
                  >
                    {marginLabel(result.margin)}
                  </div>
                  <div className="mt-1.5 text-[9px]" style={{ color: t.textMuted }}>
                    {result.demVotes.toLocaleString()} D · {result.repVotes.toLocaleString()} R
                  </div>
                  <div className="text-[9px]" style={{ color: t.textVeryMuted }}>
                    {result.totalVotes.toLocaleString()} total votes ({year})
                  </div>
                </>
              );
            })()}
            <a
              href={`/counties/${selected.fips}`}
              className="mt-2 flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
              style={{ background: t.tabBg, color: t.textMuted }}
            >
              More Info
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      )}

      </div>
    </div>

      {/* Mobile selected strip — normal document flow below the map, not overlapping/shrinking it */}
      {selected && (
        <div
          className="md:hidden flex items-center h-12 px-3 gap-3"
          style={{ background: t.panel, borderTop: `1px solid ${t.border}` }}
        >
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight truncate" style={{ color: t.textPrimary }}>
              {selected.name} {getAreaLabel(selected.stateAbbr)}
            </span>
            <span className="text-[10px]" style={{ color: t.textMuted }}>
              {selected.stateName}
              {(() => {
                const result = countyPresidentialData[selected.fips]?.years[year] ?? null;
                return result ? ` · ${marginLabel(result.margin)} (${year})` : ` · No ${year} data`;
              })()}
            </span>
          </div>
          <a
            href={`/counties/${selected.fips}`}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-md"
            style={{ background: t.tabBg, color: t.textMuted }}
          >
            More Info
          </a>
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
