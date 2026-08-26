"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useDarkMode } from "@/lib/useDarkMode";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { normalizeGeographyWinding } from "@/lib/geoWinding";
import { ABBR_TO_FIPS } from "@/lib/fips";
import { getRaceColor, getRatingColors, fmtMargin } from "@/lib/colorScale";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";

const COUNTIES_URL = "/us-counties.json";
const PARTY_LABEL: Record<string, string> = { D: "Democratic", R: "Republican", I: "Independent", O: "Other" };
// Per-state, per-chamber TopoJSON — split from the combined national source files by
// scripts/split-state-leg-districts.mjs so a state page only fetches its own districts instead
// of every state's (previously 10.9 MB house / 6.5 MB senate on every load).
const DISTRICTS_DIR: Record<Chamber, string> = {
  house: "/state-leg-districts/house",
  senate: "/state-leg-districts/senate",
};

type CountyGeometry = {
  rsmKey: string;
  id?: string | number;
};

type DistrictGeometry = {
  rsmKey: string;
  properties?: {
    GEOID?: string;
    STATEFP?: string;
    DISTRICT?: string;
    NAMELSAD?: string;
  };
  geometry?: {
    type: "Polygon" | "MultiPolygon" | string;
    coordinates: [number, number][][] | [number, number][][][];
  };
};

// Mirrors BOUNDARY_CODE_OVERRIDES/extractDistrictCode in scripts/build-state-leg-incumbents.mjs —
// that script computes each StateLegDistrict's `number` from the boundary file's DISTRICT/NAMELSAD
// properties (not a plain DISTRICT lookup), because DISTRICT alone is truncated to a plain integer
// and can collapse two real districts (e.g. ND House "4A"/"4B" both report DISTRICT "4") or, for a
// few states, doesn't correspond to Open States' numbering scheme at all (MA's named districts, AK
// Senate's lettered districts). The map must key off the same computed code as `number`, or split
// districts fall through to the default fill with no hover tooltip. Keep in sync with the build
// script if a future state needs a new override there.
const BOUNDARY_CODE_OVERRIDES: Record<string, (properties: { NAMELSAD?: string }) => string | undefined> = {
  MA_house: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  MA_senate: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  AK_senate: (properties) => properties.NAMELSAD?.trim().split(/\s+/).pop(),
  // VT districts are named, not numbered — DISTRICT is "NaN". Confirmed via research, 2026-08-26.
  VT_house: (properties) => properties.NAMELSAD?.replace(/\s+State House District$/, ""),
  VT_senate: (properties) => properties.NAMELSAD?.replace(/\s+Senatorial District$/, ""),
};

function extractDistrictCode(stateAbbr: string, chamber: Chamber, properties: { DISTRICT?: string; NAMELSAD?: string }): string | undefined {
  const override = BOUNDARY_CODE_OVERRIDES[`${stateAbbr}_${chamber}`];
  if (override) return override(properties);
  const { DISTRICT, NAMELSAD } = properties;
  const lastToken = NAMELSAD?.trim().split(/\s+/).pop();
  if (lastToken && DISTRICT && new RegExp(`^0*${DISTRICT}[A-Za-z]+$`).test(lastToken)) {
    return lastToken;
  }
  return DISTRICT;
}

const CHAMBER_LABEL: Record<Chamber, string> = {
  house: "State House",
  senate: "State Senate",
};

// I/O and the mixed-party "SPLIT" case have no site-wide CSS var, so they keep hardcoded
// light/dark hex pairs. D/R fills use var(--party-dem)/var(--party-rep) directly (see
// fillForDistrict) so they always match the "Safe D"/"Safe R" colors used elsewhere on the site.
const PRES_LEGEND = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map(
  (label) => ({ label, ...getRatingColors(label) })
);
// Deliberately NOT a pale blue/red (every real margin bucket, including the lightest Tilt D/R,
// already lives in that hue range) - a partially-sourced chamber (e.g. a staggered Senate where
// only the half up in 2024 has a same-year race to crosswalk against) needs "no data" to read as
// unambiguously neutral, not as a faint lean either direction.
const NO_PRES_DATA_FILL = { light: "#c7cad1", dark: "#454b57" };

const OTHER_FILL: Record<string, { light: string; dark: string }> = {
  I: { light: "#c9b98a", dark: "#8a7a4a" },
  O: { light: "#c3aee0", dark: "#6a4f8a" },
  SPLIT: { light: "#d4b96a", dark: "#8a7a4a" },
};

export default function StateLegDistrictMap({
  stateAbbr,
  stateName,
  chamber,
  isUnicameral = false,
  mapInfo = null,
  districts = [],
  pres2024 = {},
  viewMode = "seats",
  selected = null,
  onSelect,
}: {
  stateAbbr: string;
  stateName: string;
  chamber: Chamber;
  isUnicameral?: boolean;
  mapInfo?: ChamberMapInfo | null;
  districts?: StateLegDistrict[];
  pres2024?: Record<string, StateLegPres2024>;
  viewMode?: MapViewMode;
  selected?: StateLegDistrict | null;
  onSelect?: (d: StateLegDistrict | null) => void;
}) {
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const [hovered, setHovered] = useState<StateLegDistrict | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  // Whether the currently selected state/chamber has sourced district boundaries. Recomputed
  // from the (cached, nationally-fetched) geography list on every render via the Geographies
  // render-prop below, so it always reflects the current stateAbbr/chamber without needing a
  // separate reset effect.
  const [hasDistricts, setHasDistricts] = useState<boolean | null>(null);
  const darkMode = useDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapViewport, setMapViewport] = useState({ width: 800, height: 600 });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nextViewport = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
    setMapViewport(nextViewport);
    const cfg = fitStateProjection(stateAbbr, nextViewport.width, nextViewport.height);
    if (cfg) setAutoProj(cfg);
  }, [stateAbbr]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const selectedId = selected?.id ?? null;
  const stateFips = ABBR_TO_FIPS[stateAbbr];
  const districtFill = darkMode ? "#3a4a72" : "#c3d0ea";
  const districtStroke = darkMode ? "#0d1117" : "#f6f8fa";
  const hoverStroke = darkMode ? "#ffffff" : "#333333";
  const outlineFill = darkMode ? "#2a3550" : "#dbe3f0";
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[chamber];

  // A shared district boundary can have more than one incumbent (multi-member districts, e.g.
  // AZ/WA House). If they're all the same party, color by that party; if they split, use a
  // distinct "split control" color rather than arbitrarily picking one seat's party.
  // Memoized on `districts` alone (not darkMode/hover state) so mouse movement over the map —
  // which updates hovered/mousePos every frame — never recomputes these lookups.
  const partyByNumber = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of districts) {
      const parties = new Set((d.incumbents ?? []).map((inc) => inc.party));
      if (parties.size === 1) map[d.number] = [...parties][0];
      else if (parties.size > 1) map[d.number] = "SPLIT";
    }
    return map;
  }, [districts]);
  const districtByNumber = useMemo(() => {
    const map: Record<string, StateLegDistrict> = {};
    for (const d of districts) map[d.number] = d;
    return map;
  }, [districts]);
  const hasPres2024 = Object.keys(pres2024).length > 0;
  const fillForDistrict = useCallback((districtNumber?: string) => {
    if (!districtNumber) return districtFill;
    if (viewMode === "president") {
      const result = pres2024[districtNumber];
      if (result) return getRaceColor(result.margin);
      return hasPres2024 ? (darkMode ? NO_PRES_DATA_FILL.dark : NO_PRES_DATA_FILL.light) : districtFill;
    }
    const party = partyByNumber[districtNumber];
    if (!party) return districtFill;
    if (party === "D") return "var(--party-dem)";
    if (party === "R") return "var(--party-rep)";
    const colors = OTHER_FILL[party];
    if (!colors) return districtFill;
    return darkMode ? colors.dark : colors.light;
  }, [viewMode, pres2024, hasPres2024, partyByNumber, darkMode, districtFill]);
  const handleHoverEnter = useCallback((d: StateLegDistrict) => setHovered(d), []);
  const handleHoverLeave = useCallback(() => setHovered(null), []);
  const handleClick = useCallback(
    (d: StateLegDistrict) => onSelect?.(selected?.id === d.id ? null : d),
    [onSelect, selected]
  );

  // The district SVG paths are expensive to reconcile (up to ~150 per state, filtered down from
  // a national geography file with thousands of features). Memoizing this element means React
  // bails out of re-rendering it on hover/mousemove-driven re-renders — only real data changes
  // (chamber switch, dark mode, sourced districts) recompute it.
  const districtsLayer = useMemo(() => (
    <Geographies
      geography={`${DISTRICTS_DIR[chamber]}/${stateAbbr}.json`}
      parseGeographies={(geographies: DistrictGeometry[]) => geographies.map(normalizeGeographyWinding)}
    >
      {({ geographies }: { geographies: DistrictGeometry[] }) => {
        // Each file already holds just this state's districts (split by scripts/split-state-leg-
        // districts.mjs), so no STATEFP filtering is needed here. A missing state/chamber file
        // 404s, react-simple-maps swallows the fetch error, and geographies comes back empty —
        // that's what drives the "coming soon" fallback below.
        if (hasDistricts !== (geographies.length > 0)) {
          // Defer the state update out of render.
          queueMicrotask(() => setHasDistricts(geographies.length > 0));
        }
        return geographies.map((geo) => {
          const districtNumber = geo.properties ? extractDistrictCode(stateAbbr, chamber, geo.properties) : undefined;
          const fill = fillForDistrict(districtNumber);
          const d = districtNumber ? districtByNumber[districtNumber] : undefined;
          const isSelected = !!d && selectedId === d.id;
          // Estimated (not precinct-exact) districts get a dashed outline in president view — see
          // NO_PRES_DATA_FILL comment above for why "no data" and "real but light" already need to
          // stay visually distinct; "estimated" is a third state on top of a real color, so it's
          // signaled via stroke style instead of yet another fill color.
          const isEstimated = viewMode === "president" && !!districtNumber && !!pres2024[districtNumber]?.estimated;
          return (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              onMouseEnter={() => d && handleHoverEnter(d)}
              onMouseLeave={handleHoverLeave}
              onClick={() => d && handleClick(d)}
              style={{
                default: { fill, stroke: isSelected ? hoverStroke : districtStroke, strokeWidth: isSelected ? 1.75 : 0.75, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none", cursor: d ? "pointer" : "default" },
                hover: { fill, stroke: d ? hoverStroke : districtStroke, strokeWidth: d ? 1.5 : 1, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none", cursor: d ? "pointer" : "default" },
                pressed: { fill, stroke: d ? hoverStroke : districtStroke, strokeWidth: d ? 1.5 : 1, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none" },
              }}
            />
          );
        });
      }}
    </Geographies>
  ), [chamber, stateAbbr, fillForDistrict, districtByNumber, districtStroke, hoverStroke, handleHoverEnter, handleHoverLeave, handleClick, selectedId, hasDistricts, viewMode, pres2024]);

  // Fallback plain-outline layer is likewise memoized so it isn't rebuilt on every hover tick
  // while it's showing (rare: only for states/chambers without sourced boundaries yet).
  const fallbackLayer = useMemo(() => (
    hasDistricts === false && stateFips ? (
      <Geographies geography={COUNTIES_URL}>
        {({ geographies }: { geographies: CountyGeometry[] }) =>
          geographies
            .filter((geo) => String(geo.id ?? "").padStart(5, "0").startsWith(stateFips))
            .map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                style={{
                  default: { fill: outlineFill, stroke: outlineFill, strokeWidth: 0.75, outline: "none" },
                  hover: { fill: outlineFill, stroke: outlineFill, strokeWidth: 0.75, outline: "none" },
                  pressed: { fill: outlineFill, stroke: outlineFill, strokeWidth: 0.75, outline: "none" },
                }}
              />
            ))
        }
      </Geographies>
    ) : null
  ), [hasDistricts, stateFips, outlineFill]);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        style={{ height: 360, background: "var(--app-bg)" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          setMapSize({ w: rect.width, h: rect.height });
        }}
      >
        {/* Hover tooltip */}
        {hovered && (() => {
          const incumbents = hovered.incumbents ?? [];
          const hoveredPres = pres2024[hovered.number];
          const tipW = 190;
          const tipH = viewMode === "president" ? (hoveredPres?.estimated ? 76 : 62) : 46 + Math.max(incumbents.length, 1) * 16;
          const offset = 16;
          const edgePad = 8;
          let left = mousePos.x + offset;
          let top = mousePos.y + offset;
          const containerW = mapSize.w || 800;
          const containerH = mapSize.h || 600;
          if (left + tipW + edgePad > containerW) left = mousePos.x - tipW - offset;
          if (top + tipH + edgePad > containerH) top = mousePos.y - tipH - offset;
          if (left < edgePad) left = edgePad;
          if (top < edgePad) top = edgePad;
          return (
            <div
              className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
              style={{
                left, top, width: tipW,
                padding: "6px 8px",
                background: "var(--app-panel)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text-primary)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <div className="font-bold text-xs mb-1.5">{hovered.label}</div>
              {viewMode === "president" ? (
                hoveredPres ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ fontSize: 11, color: "var(--party-rep)" }}>Trump</span>
                      <span className="font-semibold tabular-nums" style={{ fontSize: 11 }}>{hoveredPres.repPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ fontSize: 11, color: "var(--party-dem)" }}>Harris</span>
                      <span className="font-semibold tabular-nums" style={{ fontSize: 11 }}>{hoveredPres.demPct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 pt-1 font-bold tabular-nums" style={{ fontSize: 11, color: hoveredPres.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)", borderTop: "1px solid var(--app-border)" }}>
                      {fmtMargin(hoveredPres.margin)}
                    </div>
                    {hoveredPres.estimated && (
                      <div className="italic" style={{ fontSize: 9, color: "var(--app-text-very-muted)" }}>
                        Estimated — no 2024 election in this district
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="italic" style={{ fontSize: 11, color: "var(--app-text-very-muted)" }}>2024 result not yet sourced</div>
                )
              ) : incumbents.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {incumbents.map((inc, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2">
                      <span className="truncate" style={{ fontSize: 11 }}>{inc.name}</span>
                      <span className="flex items-baseline gap-1.5 shrink-0">
                        {/* Per-incumbent lastElection override (currently WV Senate only, where
                            the district's 2 seats stagger independently) shown inline instead of
                            the shared footer below, which would otherwise misreport one seat. */}
                        {inc.lastElection != null && (
                          <span style={{ fontSize: 9, color: "var(--app-text-very-muted)" }}>{inc.lastElection}</span>
                        )}
                        <span className="font-semibold" style={{ fontSize: 11, color: `var(--party-${inc.party === "D" ? "dem" : inc.party === "R" ? "rep" : "ind"})` }} title={PARTY_LABEL[inc.party]}>
                          {inc.party}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="italic" style={{ fontSize: 11, color: "var(--app-text-very-muted)" }}>Vacant</div>
              )}
              {viewMode !== "president" && hovered.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
                <div className="mt-1 pt-1" style={{ fontSize: 10, color: "var(--app-text-very-muted)", borderTop: "1px solid var(--app-border)" }}>
                  Last elected {hovered.lastElection}
                </div>
              )}
            </div>
          );
        })()}

        <ComposableMap
          width={mapViewport.width}
          height={mapViewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? undefined}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
            {/* Sourced district boundaries, when available for this state/chamber */}
            {districtsLayer}
            {/* Fallback: plain state outline + "coming soon" overlay while boundaries aren't sourced yet */}
            {fallbackLayer}
          </ZoomableGroup>
        </ComposableMap>

        {hasDistricts === false && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div
              className="pointer-events-auto rounded-lg px-4 py-2.5 text-center"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              <div className="text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
                {chamberLabel} district boundaries coming soon
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {stateName} 2026 map in progress
              </div>
            </div>
          </div>
        )}

        {hasDistricts && viewMode === "president" && !hasPres2024 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div
              className="pointer-events-auto rounded-lg px-4 py-2.5 text-center"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              <div className="text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
                2024 presidential results coming soon
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                Not yet sourced for {stateName} {chamberLabel} districts
              </div>
            </div>
          </div>
        )}

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

      {hasDistricts && viewMode === "president" && hasPres2024 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {PRES_LEGEND.map(({ label, bg }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bg }} />
              <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: darkMode ? NO_PRES_DATA_FILL.dark : NO_PRES_DATA_FILL.light }} />
            <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>No data</span>
          </div>
        </div>
      )}

      {hasDistricts && viewMode === "president" && Object.values(pres2024).some((p) => p.estimated) && (
        <div className="mt-1 text-[10px] italic" style={{ color: "var(--app-text-very-muted)" }}>
          Dashed outline = estimated (no 2024 election in that district; modeled from overlapping House-district results)
        </div>
      )}

      {hasDistricts && mapInfo && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
          {chamberLabel} boundaries enacted {mapInfo.enactedDate} · first used {mapInfo.firstCycle} ({mapInfo.source})
        </div>
      )}
    </div>
  );
}
