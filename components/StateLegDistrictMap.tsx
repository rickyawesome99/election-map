"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useDarkMode } from "@/lib/useDarkMode";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { normalizeGeographyWinding } from "@/lib/geoWinding";
import { ABBR_TO_FIPS } from "@/lib/fips";
import { getRaceColor, getRatingColors, fmtMargin } from "@/lib/colorScale";
import { districtDisplayLabel, indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { districtResultMargin } from "@/lib/useStateLegResults";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";

const COUNTIES_URL = "/us-counties.json";
const PARTY_LABEL: Record<string, string> = { D: "Democratic", R: "Republican", I: "Independent", O: "Other" };

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
// script if a future state needs a new override there, and with the copy in
// scripts/verify-state-leg-historical-maps.mjs, which checks the same join for past years.
//
// The suffixes are matched loosely because TIGER has renamed these layers across vintages: a
// Vermont Senate district is "Bennington Senatorial District" in the current file and "Bennington
// State Senate District" in the 2020 one, and the historical maps go through this same function.
const BOUNDARY_CODE_OVERRIDES: Record<string, (properties: { NAMELSAD?: string }) => string | undefined> = {
  MA_house: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  MA_senate: (properties) => properties.NAMELSAD?.replace(/\s+District$/, ""),
  AK_senate: (properties) => properties.NAMELSAD?.trim().split(/\s+/).pop(),
  // VT districts are named, not numbered — DISTRICT is "NaN". Confirmed via research, 2026-08-26.
  // NH numbers its House districts within each county. The current (custom-sourced) file already
  // carries them as "BE1"/"CH14" in DISTRICT, but TIGER spells the same district out as "State
  // House District Belknap County No. 1" with a DISTRICT of "6" that repeats across counties -
  // so the county's first two letters are put back in front, which is exactly the state's own
  // code. Returns nothing for the current file, which falls through to its DISTRICT.
  NH_house: (properties) => {
    const parts = properties.NAMELSAD?.match(/District\s+(\S+)\s+County\s+No\.\s*(\d+)$/);
    return parts ? `${parts[1].slice(0, 2).toUpperCase()}${Number(parts[2])}` : undefined;
  },
  VT_house: (properties) => properties.NAMELSAD?.replace(/\s+(State\s+)?House\s+District$/, ""),
  VT_senate: (properties) => properties.NAMELSAD?.replace(/\s+((State\s+)?Senate|Senatorial)\s+District$/, ""),
};

function extractDistrictCode(stateAbbr: string, chamber: Chamber, properties: { DISTRICT?: string; NAMELSAD?: string }): string | undefined {
  // An override that returns nothing falls through to the default rules - NH_house needs that,
  // because only the historical files carry the county-phrased name it rewrites.
  const overridden = BOUNDARY_CODE_OVERRIDES[`${stateAbbr}_${chamber}`]?.(properties);
  if (overridden) return overridden;
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
const MARGIN_LEGEND = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map(
  (label) => ({ label, ...getRatingColors(label) })
);
// Deliberately NOT a pale blue/red (every real margin bucket, including the lightest Tilt D/R,
// already lives in that hue range) - a partially-sourced chamber (e.g. a staggered Senate where
// only the half up in 2024 has a same-year race to crosswalk against) needs "no data" to read as
// unambiguously neutral, not as a faint lean either direction.
const NO_DATA_FILL = { light: "#c7cad1", dark: "#454b57" };
// A district that WAS elected but whose race was never counted (an unopposed candidate declared
// elected in OK/FL/TX/HI). Warm rather than the cool "no data" gray, because the two mean
// genuinely different things and a reader should not have to consult the legend twice: this seat
// has a known holder and no ballots, that one has no row at all.
const NO_COUNT_FILL = { light: "#d9d0bd", dark: "#57503f" };

/** The three shapes the fine print under the map takes, one per view. */
const NOTE_VARIANTS = ["seats", "president", "results"] as const;

const OTHER_FILL: Record<string, { light: string; dark: string }> = {
  I: { light: "#c9b98a", dark: "#8a7a4a" },
  O: { light: "#c3aee0", dark: "#6a4f8a" },
  // Multi-member districts whose seats are held by different parties (e.g. NH House) reuse the
  // indigo the States tab uses for a split delegation (SPLIT_FILL in StatesOverviewMap.tsx) so
  // "split control" reads the same site-wide. Kept as a literal rather than an import so this
  // page doesn't pull the national overview map into its bundle - keep the two in sync.
  SPLIT: { light: "#4B0082", dark: "#4B0082" },
};

export default function StateLegDistrictMap({
  stateAbbr,
  stateName,
  chamber,
  isUnicameral = false,
  mapInfo = null,
  boundaryUrl,
  boundaryNote = null,
  districts = [],
  pres2024 = {},
  results = null,
  resultsYear = null,
  resultsSource = null,
  resultsLoading = false,
  viewMode = "seats",
  selectedKey = null,
  onSelect,
  overlay = null,
}: {
  stateAbbr: string;
  stateName: string;
  chamber: Chamber;
  isUnicameral?: boolean;
  mapInfo?: ChamberMapInfo | null;
  /** Boundary file for the year on screen — the current map, or a superseded era's. */
  boundaryUrl: string;
  /** Shown under the map when those boundaries aren't the present-day ones. */
  boundaryNote?: string | null;
  districts?: StateLegDistrict[];
  pres2024?: Record<string, StateLegPres2024>;
  results?: Record<string, StateLegDistrictResult> | null;
  resultsYear?: number | null;
  resultsSource?: string | null;
  resultsLoading?: boolean;
  viewMode?: MapViewMode;
  /** The selected district's code, which is all the three views have in common. */
  selectedKey?: string | null;
  onSelect?: (districtNumber: string | null) => void;
  /** Floated over the map's bottom-left corner, where the click that opened it happened.
   *  Used for the selected-district panel on desktop, so opening it costs no page layout. */
  overlay?: ReactNode;
}) {
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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

  const stateFips = ABBR_TO_FIPS[stateAbbr];
  const districtFill = darkMode ? "#3a4a72" : "#c3d0ea";
  const districtStroke = darkMode ? "#0d1117" : "#f6f8fa";
  const hoverStroke = darkMode ? "#ffffff" : "#333333";
  const outlineFill = darkMode ? "#2a3550" : "#dbe3f0";
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[chamber];
  const isResultsView = viewMode === "results";

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
  // Results are keyed by whatever the canvass called the district, which is the same district but
  // not always the same string as the boundary file's code — see lib/stateLegDistrictKey.ts.
  const resultsByKey = useMemo(() => (results ? indexByNormalizedKey(results) : null), [results]);
  const resultFor = useCallback(
    (districtNumber?: string) =>
      districtNumber && resultsByKey ? lookupByDistrictCode(resultsByKey, stateAbbr, chamber, districtNumber) : undefined,
    [resultsByKey, stateAbbr, chamber]
  );

  const hasPres2024 = Object.keys(pres2024).length > 0;
  const hasResults = !!results && Object.keys(results).length > 0;
  const fillForDistrict = useCallback((districtNumber?: string) => {
    if (!districtNumber) return districtFill;
    if (isResultsView) {
      const result = resultFor(districtNumber);
      if (!result) return hasResults ? (darkMode ? NO_DATA_FILL.dark : NO_DATA_FILL.light) : districtFill;
      const margin = districtResultMargin(result);
      // A seat filled with no count published is not a 0–0 tie; it gets its own fill rather than
      // the dead centre of the margin scale.
      if (margin == null) return darkMode ? NO_COUNT_FILL.dark : NO_COUNT_FILL.light;
      return getRaceColor(margin);
    }
    if (viewMode === "president") {
      const result = pres2024[districtNumber];
      if (result) return getRaceColor(result.margin);
      return hasPres2024 ? (darkMode ? NO_DATA_FILL.dark : NO_DATA_FILL.light) : districtFill;
    }
    const party = partyByNumber[districtNumber];
    if (!party) return districtFill;
    if (party === "D") return "var(--party-dem)";
    if (party === "R") return "var(--party-rep)";
    const colors = OTHER_FILL[party];
    if (!colors) return districtFill;
    return darkMode ? colors.dark : colors.light;
  }, [isResultsView, resultFor, hasResults, viewMode, pres2024, hasPres2024, partyByNumber, darkMode, districtFill]);

  const handleHoverEnter = useCallback((key: string) => setHoveredKey(key), []);
  const handleHoverLeave = useCallback(() => setHoveredKey(null), []);
  const handleClick = useCallback(
    (key: string) => onSelect?.(selectedKey === key ? null : key),
    [onSelect, selectedKey]
  );

  // The district SVG paths are expensive to reconcile (up to ~150 per state, filtered down from
  // a national geography file with thousands of features). Memoizing this element means React
  // bails out of re-rendering it on hover/mousemove-driven re-renders — only real data changes
  // (chamber switch, year switch, dark mode, sourced districts) recompute it.
  const districtsLayer = useMemo(() => (
    <Geographies
      key={boundaryUrl}
      geography={boundaryUrl}
      parseGeographies={(geographies: DistrictGeometry[]) => geographies.map(normalizeGeographyWinding)}
    >
      {({ geographies }: { geographies: DistrictGeometry[] }) => {
        // Each file already holds just this state's districts (split by scripts/split-state-leg-
        // districts.mjs, or built per era by build-state-leg-districts-historical.mjs), so no
        // STATEFP filtering is needed here. A missing state/chamber file 404s, react-simple-maps
        // swallows the fetch error, and geographies comes back empty — that's what drives the
        // "coming soon" fallback below.
        if (hasDistricts !== (geographies.length > 0)) {
          // Defer the state update out of render.
          queueMicrotask(() => setHasDistricts(geographies.length > 0));
        }
        return geographies.map((geo) => {
          const districtNumber = geo.properties ? extractDistrictCode(stateAbbr, chamber, geo.properties) : undefined;
          const fill = fillForDistrict(districtNumber);
          // In the two present-day views a polygon is only interactive when it maps to a known
          // district; in the results view the result itself is what makes it interactive, since
          // a superseded era's districts have no StateLegDistrict record at all.
          const interactive = !!districtNumber && (isResultsView ? !!resultFor(districtNumber) : !!districtByNumber[districtNumber]);
          const isSelected = !!districtNumber && selectedKey === districtNumber;
          // Estimated (not precinct-exact) districts get a dashed outline in president view — see
          // NO_DATA_FILL comment above for why "no data" and "real but light" already need to
          // stay visually distinct; "estimated" is a third state on top of a real color, so it's
          // signaled via stroke style instead of yet another fill color.
          const isEstimated = viewMode === "president" && !!districtNumber && !!pres2024[districtNumber]?.estimated;
          return (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              onMouseEnter={() => interactive && districtNumber && handleHoverEnter(districtNumber)}
              onMouseLeave={handleHoverLeave}
              onClick={() => interactive && districtNumber && handleClick(districtNumber)}
              style={{
                default: { fill, stroke: isSelected ? hoverStroke : districtStroke, strokeWidth: isSelected ? 1.75 : 0.75, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none", cursor: interactive ? "pointer" : "default" },
                hover: { fill, stroke: interactive ? hoverStroke : districtStroke, strokeWidth: interactive ? 1.5 : 1, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none", cursor: interactive ? "pointer" : "default" },
                pressed: { fill, stroke: interactive ? hoverStroke : districtStroke, strokeWidth: interactive ? 1.5 : 1, strokeDasharray: isEstimated ? "2,1.5" : undefined, outline: "none" },
              }}
            />
          );
        });
      }}
    </Geographies>
  ), [boundaryUrl, chamber, stateAbbr, fillForDistrict, districtByNumber, isResultsView, resultFor, districtStroke, hoverStroke, handleHoverEnter, handleHoverLeave, handleClick, selectedKey, hasDistricts, viewMode, pres2024]);

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

  const hoveredDistrict = hoveredKey ? districtByNumber[hoveredKey] : undefined;
  const hoveredLabel = hoveredKey ? hoveredDistrict?.label ?? districtDisplayLabel(hoveredKey, chamberLabel) : "";
  const showMarginLegend = !!hasDistricts && ((viewMode === "president" && hasPres2024) || (isResultsView && hasResults));
  const hasEstimatedPres = Object.values(pres2024).some((p) => p.estimated);

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
        {hoveredKey && (() => {
          const incumbents = hoveredDistrict?.incumbents ?? [];
          const hoveredPres = pres2024[hoveredKey];
          const hoveredResult = resultFor(hoveredKey);
          const hoveredMargin = districtResultMargin(hoveredResult);
          // Names where the source carried them (2024 only); zero-vote bookkeeping lines
          // ("Blank Ballots") are not candidacies and are dropped. See StateLegSection.
          const hoveredCandidates = isResultsView
            ? (hoveredResult?.candidates ?? []).filter((c) => c.votes > 0)
            : [];
          // Wider only when it has names to fit — a 190px box truncates most of them.
          const tipW = hoveredCandidates.length > 0 ? 240 : 190;
          const resultLines = hoveredCandidates.length || 2 + (hoveredResult?.othVotes ? 1 : 0);
          const tipH = isResultsView
            ? (hoveredMargin == null ? 62 : 46 + resultLines * 16)
            : viewMode === "president"
              ? (hoveredPres?.estimated ? 76 : 62)
              : 46 + Math.max(incumbents.length, 1) * 16;
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
              <div className="font-bold text-xs mb-1.5">{hoveredLabel}</div>
              {isResultsView ? (
                hoveredResult ? (
                  hoveredMargin == null ? (
                    <div className="italic" style={{ fontSize: 11, color: "var(--app-text-very-muted)" }}>
                      Seat filled, no vote count published
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {hoveredCandidates.length > 0 ? (
                        hoveredCandidates.map((c, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-2">
                            <span
                              className="truncate"
                              style={{ fontSize: 11, color: `var(--party-${c.party === "D" ? "dem" : c.party === "R" ? "rep" : "ind"})` }}
                            >
                              {c.name}
                            </span>
                            <span className="font-semibold tabular-nums shrink-0" style={{ fontSize: 11 }}>{c.votes.toLocaleString()}</span>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-2">
                            <span style={{ fontSize: 11, color: "var(--party-dem)" }}>Democratic</span>
                            <span className="font-semibold tabular-nums" style={{ fontSize: 11 }}>{(hoveredResult.demVotes ?? 0).toLocaleString()}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span style={{ fontSize: 11, color: "var(--party-rep)" }}>Republican</span>
                            <span className="font-semibold tabular-nums" style={{ fontSize: 11 }}>{(hoveredResult.repVotes ?? 0).toLocaleString()}</span>
                          </div>
                          {!!hoveredResult.othVotes && (
                            <div className="flex items-baseline justify-between gap-2">
                              <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>Other</span>
                              <span className="font-semibold tabular-nums" style={{ fontSize: 11 }}>{hoveredResult.othVotes.toLocaleString()}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="mt-1 pt-1 flex items-baseline justify-between gap-2" style={{ borderTop: "1px solid var(--app-border)" }}>
                        <span className="font-bold tabular-nums" style={{ fontSize: 11, color: hoveredMargin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                          {fmtMargin(hoveredMargin)}
                        </span>
                        {hoveredResult.uncontested && (
                          <span className="italic" style={{ fontSize: 9, color: "var(--app-text-very-muted)" }}>unopposed</span>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="italic" style={{ fontSize: 11, color: "var(--app-text-very-muted)" }}>No {resultsYear} result for this district</div>
                )
              ) : viewMode === "president" ? (
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
              {viewMode === "seats" && hoveredDistrict?.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
                <div className="mt-1 pt-1" style={{ fontSize: 10, color: "var(--app-text-very-muted)", borderTop: "1px solid var(--app-border)" }}>
                  Last elected {hoveredDistrict.lastElection}
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
                {isResultsView
                  ? `${chamberLabel} boundaries for ${resultsYear} aren't sourced yet`
                  : `${chamberLabel} district boundaries coming soon`}
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {isResultsView
                  ? "The district table below still has every result for this year"
                  : `${stateName} 2026 map in progress`}
              </div>
            </div>
          </div>
        )}

        {hasDistricts && isResultsView && !hasResults && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div
              className="pointer-events-auto rounded-lg px-4 py-2.5 text-center"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              <div className="text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
                {resultsLoading ? `Loading ${resultsYear} results…` : `${resultsYear} results not available`}
              </div>
              {!resultsLoading && (
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                  Not yet sourced for {stateName} {chamberLabel} districts
                </div>
              )}
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

        {/* Shrink-wraps its content rather than holding a fixed 280px: a two-line panel over the
            map should cover as little of it as the text actually needs. */}
        {overlay && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-30 w-max max-w-[230px] sm:max-w-[260px]">
            {overlay}
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

      {/* Seats view has no margin scale to explain, so this row used to vanish there and come back
          in the other two — shifting everything below it by a line every time the view changed, and
          on a phone that is the composition cards. Every chip is therefore always laid out; the row
          only turns invisible. Same for the "no count published" chip, which otherwise changes the
          wrap within results view from one year to the next. Height is then identical in all three
          views at every width. */}
      <div
        className={`mt-2 flex h-5 items-center gap-x-3 overflow-x-auto scrollbar-none md:h-auto md:flex-wrap md:gap-y-1${showMarginLegend ? "" : " invisible"}`}
        aria-hidden={!showMarginLegend}
      >
        {MARGIN_LEGEND.map(({ label, bg }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bg }} />
            <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</span>
          </div>
        ))}
        <div
          className={`flex items-center gap-1${isResultsView && Object.values(results ?? {}).some((r) => r.totalVotes == null) ? "" : " invisible"}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: darkMode ? NO_COUNT_FILL.dark : NO_COUNT_FILL.light }} />
          <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>No count published</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: darkMode ? NO_DATA_FILL.dark : NO_DATA_FILL.light }} />
          <span className="whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>No data</span>
        </div>
      </div>

      {/* Every variant of the fine print stacked in one grid cell: the one for the current view is
          visible, the rest are laid out invisibly behind it. The block is therefore always as tall
          as this map's tallest note and never changes height when the view does — which matters
          because on a phone it sits directly above the composition cards, so a note that grew from
          two lines to three moved the card the reader had just tapped. Sized by the browser, so
          there is no dead space beyond the real worst case and no note is ever clipped. The
          mobile min-height is a floor under the one thing the stack cannot measure ahead of
          time: a past year's source string, which only exists once that year has been fetched. */}
      {hasDistricts && (
        <div className="mt-2 grid min-h-[3.4rem] md:min-h-0">
          {NOTE_VARIANTS.map((variant) => {
            const active = variant === (isResultsView ? "results" : viewMode === "president" ? "president" : "seats");
            return (
              <div
                key={variant}
                className={`col-start-1 row-start-1 flex flex-col gap-1${active ? "" : " invisible"}`}
                aria-hidden={!active}
              >
                {variant === "president" && hasEstimatedPres && (
                  <div className="text-[10px] italic" style={{ color: "var(--app-text-very-muted)" }}>
                    Dashed outline = estimated (no 2024 election in that district; modeled from overlapping House-district results)
                  </div>
                )}
                {variant === "results" ? (
                  <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                    {boundaryNote ?? `${chamberLabel} boundaries as used in ${resultsYear}`}
                    {resultsSource && <> · {resultsSource}</>}
                  </div>
                ) : (
                  mapInfo && (
                    <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                      {chamberLabel} boundaries enacted {mapInfo.enactedDate} · first used {mapInfo.firstCycle} ({mapInfo.source})
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
