"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useDarkMode } from "@/lib/useDarkMode";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { normalizeGeographyWinding } from "@/lib/geoWinding";
import { ABBR_TO_FIPS } from "@/lib/fips";
import type { Chamber } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";

const COUNTIES_URL = "/us-counties.json";
const DISTRICTS_URL: Record<Chamber, string> = {
  house: "/state-house-districts-2026.json",
  senate: "/state-senate-districts-2026.json",
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
  };
  geometry?: {
    type: "Polygon" | "MultiPolygon" | string;
    coordinates: [number, number][][] | [number, number][][][];
  };
};

const CHAMBER_LABEL: Record<Chamber, string> = {
  house: "State House",
  senate: "State Senate",
};

export default function StateLegDistrictMap({
  stateAbbr,
  stateName,
  chamber,
  isUnicameral = false,
  mapInfo = null,
}: {
  stateAbbr: string;
  stateName: string;
  chamber: Chamber;
  isUnicameral?: boolean;
  mapInfo?: ChamberMapInfo | null;
}) {
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
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
  const outlineFill = darkMode ? "#2a3550" : "#dbe3f0";
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[chamber];

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        style={{ height: 360, background: "var(--app-bg)" }}
      >
        <ComposableMap
          width={mapViewport.width}
          height={mapViewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? undefined}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
            {/* Sourced district boundaries, when available for this state/chamber */}
            <Geographies
              geography={DISTRICTS_URL[chamber]}
              parseGeographies={(geographies: DistrictGeometry[]) => geographies.map(normalizeGeographyWinding)}
            >
              {({ geographies }: { geographies: DistrictGeometry[] }) => {
                const matches = stateFips ? geographies.filter((geo) => geo.properties?.STATEFP === stateFips) : [];
                if (hasDistricts !== (matches.length > 0)) {
                  // Defer the state update out of render.
                  queueMicrotask(() => setHasDistricts(matches.length > 0));
                }
                return matches.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: { fill: districtFill, stroke: districtStroke, strokeWidth: 0.75, outline: "none" },
                      hover: { fill: districtFill, stroke: districtStroke, strokeWidth: 1, outline: "none" },
                      pressed: { fill: districtFill, stroke: districtStroke, strokeWidth: 1, outline: "none" },
                    }}
                  />
                ));
              }}
            </Geographies>

            {/* Fallback: plain state outline + "coming soon" overlay while boundaries aren't sourced yet */}
            {hasDistricts === false && stateFips && (
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
            )}
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

      {hasDistricts && mapInfo && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
          {chamberLabel} boundaries enacted {mapInfo.enactedDate} · first used {mapInfo.firstCycle} ({mapInfo.source})
        </div>
      )}
    </div>
  );
}
