"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { fmt1, marginColor } from "./format";

// The hub's choropleth: states or 2026 House districts, filled by any R-positive value (the
// blended TPL, or one cycle's WRS under the year lens). Click opens a small panel with a link
// to the place's page; on phones the panel sits under the map instead of over it.

const STATES_GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
// congressional-districts-2026.json pre-clipped to us-land.json (Great Lakes and coastal water
// removed) and 20%-simplified, so the map needs no runtime SVG mask and a quarter of the path
// data — both made the district view lag on phones. Regenerate with:
//   npx mapshaper public/congressional-districts-2026.json -filter 'CD119FP != "ZZ"' -clip public/us-land.json \
//     -simplify 20% keep-shapes -o public/congressional-districts-2026-lite.json format=topojson quantization=1e5 force
const DISTRICTS_GEO_URL = "/congressional-districts-2026-lite.json";

// Each topology is fetched and parsed once per page load and handed to <Geographies> as an
// object, so toggling the geography never re-downloads or re-parses it.
const topoCache = new Map<string, Promise<object | null>>();
function loadTopo(url: string): Promise<object | null> {
  let p = topoCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    topoCache.set(url, p);
  }
  return p;
}
function useTopo(url: string): object | null {
  const [topo, setTopo] = useState<object | null>(null);
  useEffect(() => {
    let live = true;
    loadTopo(url).then((t) => { if (live) setTopo(t); });
    return () => { live = false; };
  }, [url]);
  return topo;
}

export type MapRow = { key: string; name: string; value: number; href: string };

type GeoFeature = { rsmKey: string; properties?: { name?: string; GEOID?: string } };

// GeoJSON GEOID → districtPresidentialData key. At-large districts use "00" in GeoJSON but
// "01" in the data, so replace before stripping leading zeros.
function geoidToDistrictKey(geoid: string): string {
  const adjusted = geoid.endsWith("00") ? geoid.slice(0, -2) + "01" : geoid;
  return String(parseInt(adjusted, 10));
}

const LEGEND: { label: string; color: string }[] = [
  { label: "Safe D", color: "#1b408c" }, { label: "Likely D", color: "#587ccc" }, { label: "Lean D", color: "#8bafff" }, { label: "Tilt D", color: "#959bb3" },
  { label: "Tilt R", color: "#cf8980" }, { label: "Lean R", color: "#ff8b98" }, { label: "Likely R", color: "#ff5864" }, { label: "Safe R", color: "#be1c29" },
];

export function MapLegend() {
  return (
    <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label="Map legend: Safe D to Safe R">
      <span>D+15</span>
      {LEGEND.map((l) => <span key={l.label} title={l.label} className="inline-block h-2 w-3.5" style={{ background: l.color }} />)}
      <span>R+15</span>
    </div>
  );
}

export function TplMap({ mode, rows, valueLabel, linkLabel }: { mode: "states" | "districts"; rows: MapRow[]; valueLabel: string; linkLabel: string }) {
  const isDark = useDarkMode();
  const mapUnfilled   = isDark ? "#1e2530" : "#c8cdd3";
  const mapStroke     = isDark ? "#0d1117" : "#f6f8fa";
  const hoverStroke   = isDark ? "#ffffff" : "#000000";
  const hoverUnfilled = isDark ? "#2a3441" : "#dde2e7";

  const [hovered, setHovered]   = useState<MapRow | null>(null);
  const [selected, setSelected] = useState<MapRow | null>(null);
  const { onMouseMove: onTipMove, tooltipRef } = useMapTooltip(14, 8);
  const [mapKey, setMapKey]     = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef  = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickRef = useRef(0);

  // Both topologies start loading on mount, so the first switch to Districts doesn't wait on
  // the network. The layers are memoized: hovering (tooltip state) doesn't re-render 435 paths.
  const statesTopo = useTopo(STATES_GEO_URL);
  const districtsTopo = useTopo(DISTRICTS_GEO_URL);
  const layers = useMemo(() => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const rowOf = (geo: GeoFeature): MapRow | undefined =>
      mode === "states" ? byKey.get(geo.properties?.name ?? "") : byKey.get(geoidToDistrictKey(geo.properties?.GEOID ?? ""));

    const shape = (geo: GeoFeature) => {
      const row = rowOf(geo);
      const isSelected = !!row && selected?.key === row.key;
      const fill = row ? getRaceColor(row.value) : mapUnfilled;
      const thin = mode === "districts";
      return (
        <Geography
          key={geo.rsmKey}
          geography={geo}
          onMouseEnter={() => row && setHovered(row)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => {
            if (Date.now() < ignoreClickRef.current) return;
            if (row) setSelected(isSelected ? null : row);
          }}
          onPointerDown={(e: React.PointerEvent) => {
            if (e.pointerType !== "touch") { touchStartRef.current = null; return; }
            touchStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e: React.PointerEvent) => {
            if (e.pointerType !== "touch") return;
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (!row || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
            ignoreClickRef.current = Date.now() + 500;
            setSelected(isSelected ? null : row);
          }}
          style={{
            default: { fill, stroke: isSelected ? hoverStroke : mapStroke, strokeWidth: isSelected ? (thin ? 2 : 3.5) : thin ? 0.5 : 1, outline: "none" },
            hover:   { fill: row ? fill : hoverUnfilled, stroke: hoverStroke, strokeWidth: thin ? 1 : 1.5, outline: "none", cursor: row ? "pointer" : "default" },
            pressed: { fill, stroke: hoverStroke, strokeWidth: thin ? 2 : 3.5, outline: "none" },
          }}
        />
      );
    };

    return (
      <ZoomableGroup key={`${mode}-${mapKey}`} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
        {!statesTopo ? null : mode === "states" ? (
          <Geographies geography={statesTopo}>
            {({ geographies }: { geographies: GeoFeature[] }) => geographies.map(shape)}
          </Geographies>
        ) : (
          districtsTopo && <>
            <Geographies geography={districtsTopo}>
              {({ geographies }: { geographies: GeoFeature[] }) => geographies.map(shape)}
            </Geographies>
            <Geographies geography={statesTopo}>
              {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} style={{
                  default: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                  hover: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                  pressed: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                }} />
              ))}
            </Geographies>
          </>
        )}
      </ZoomableGroup>
    );
  }, [mode, mapKey, rows, selected, statesTopo, districtsTopo, mapUnfilled, mapStroke, hoverStroke, hoverUnfilled]);

  const closeButton = (
    <button type="button" onClick={() => setSelected(null)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded" style={{ color: "var(--app-text-very-muted)" }} aria-label="Close">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  );

  const valueText = selected && (
    <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{valueLabel} <b style={{ color: marginColor(selected.value) }}>{fmt1(selected.value)}</b></span>
  );
  const openLink = selected && (
    <Link href={selected.href} className="whitespace-nowrap font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }} title={linkLabel}>Open ›</Link>
  );

  return (
    <>
      <div className="relative h-[300px] w-full overflow-hidden rounded-xl sm:h-[400px] md:h-[480px]" style={{ border: "1px solid var(--app-border)" }} onMouseMove={onTipMove}>
        {hovered && !selected && (
          <div ref={tooltipRef} className="pointer-events-none absolute z-20 hidden rounded-lg md:block" style={{ width: 160, padding: "7px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>
            <div className="mb-0.5 text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>{hovered.name}</div>
            <div className="text-[10px] font-semibold" style={{ color: marginColor(hovered.value) }}>{valueLabel}: {fmt1(hovered.value)}</div>
          </div>
        )}

        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }} style={{ width: "100%", height: "100%" }}>
          {layers}
        </ComposableMap>

        {viewChanged && (
          <button type="button" onClick={() => { setMapKey((k) => k + 1); setViewChanged(false); }} className="absolute bottom-3 left-3 z-10 rounded-lg px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            Reset
          </button>
        )}

        {selected && (
          <div className="absolute z-30 hidden rounded-lg px-2.5 py-1.5 md:block" style={{ right: 12, bottom: 12, width: 160, background: isDark ? "rgba(22,27,34,0.95)" : "rgba(255,255,255,0.95)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>{selected.name}</span>
              {closeButton}
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px]">{valueText}{openLink}</div>
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[11px] md:hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          <span className="min-w-0 truncate text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>{selected.name}</span>
          {valueText}
          <span className="ml-auto flex items-center gap-4">{openLink}{closeButton}</span>
        </div>
      )}
    </>
  );
}
