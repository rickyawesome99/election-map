"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { fitStateProjection, type ProjectionConfig } from "@/lib/mapProjection";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { getRaceColor } from "@/lib/colorScale";
import { useMapTooltip } from "@/lib/useMapTooltip";

type DistrictGeo = {
  rsmKey: string;
  type?: string;
  properties?: { GEOID?: string; STATEFP?: string };
  geometry?: { type: string; coordinates: unknown };
};

export type RedistrictDistrict = { id: string; name: string; pviOld: number | null; pviNew: number | null };

function pviLabel(pvi: number | null): string {
  if (pvi == null) return "—";
  if (pvi === 0) return "EVEN";
  return `${pvi > 0 ? "R" : "D"}+${Math.abs(pvi)}`;
}

/** "4207" → "7", "4200" / "4201" for an at-large seat → "AL". */
function districtNumber(geoid: string, atLarge: boolean): string {
  if (atLarge) return "AL";
  return String(parseInt(geoid.slice(2), 10));
}

/**
 * One state's House districts on one map vintage, each filled by its PVI on those lines and
 * labelled with its number. Grey means the entry has no PVI for that side (a district that only
 * existed on the other map, or lines the data describes without a figure).
 */
function MapPanel({
  stateAbbr,
  stateFips,
  url,
  title,
  pviByGeoid,
  nameByGeoid,
  selectedId,
  onSelect,
  height,
}: {
  stateAbbr: string;
  stateFips: string;
  url: string;
  title: string;
  pviByGeoid: Map<string, number | null>;
  nameByGeoid: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height });
  const [autoProj, setAutoProj] = useState<ProjectionConfig | null>(null);
  const [hovered, setHovered] = useState<{ geoid: string; name: string; pvi: number | null } | null>(null);
  const { onMouseMove: onTooltipMove, tooltipRef } = useMapTooltip(12, 8);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height: h } = el.getBoundingClientRect();
    const next = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(h)) };
    setViewport(next);
    const cfg = fitStateProjection(stateAbbr, next.width, next.height);
    if (cfg) setAutoProj(cfg);
  }, [stateAbbr]);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // The data keys an at-large seat "XX01" and the Census "XX00"; both resolve to the same entry.
  const lookup = (geoid: string) => {
    const alias = geoid.endsWith("00") ? geoid.slice(0, -2) + "01" : geoid.endsWith("01") ? geoid.slice(0, -2) + "00" : null;
    const id = pviByGeoid.has(geoid) || nameByGeoid.has(geoid) ? geoid : alias && (pviByGeoid.has(alias) || nameByGeoid.has(alias)) ? alias : geoid;
    return { id, pvi: pviByGeoid.get(id) ?? null, name: nameByGeoid.get(id) ?? `${stateAbbr}-${districtNumber(geoid, geoid.endsWith("00")).padStart(2, "0")}` };
  };

  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{title}</div>
      <div ref={containerRef} className="relative rounded" style={{ height, background: "var(--app-tab-bg)" }} onMouseMove={onTooltipMove}>
        {hovered && (
          <div
            ref={tooltipRef}
            className="absolute z-20 hidden pointer-events-none rounded-lg md:block"
            style={{ width: 150, padding: "6px 8px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}
          >
            <div className="text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>{hovered.name}</div>
            <div className="text-[11px] font-semibold tabular-nums" style={{ color: hovered.pvi == null ? "var(--app-text-very-muted)" : hovered.pvi > 0 ? "var(--party-rep)" : hovered.pvi < 0 ? "var(--party-dem)" : "var(--app-text-muted)" }}>
              PVI {pviLabel(hovered.pvi)}
            </div>
          </div>
        )}
        <ComposableMap
          width={viewport.width}
          height={viewport.height}
          projection="geoMercator"
          projectionConfig={autoProj ?? { scale: 800, center: [-96, 38] }}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies key={url} geography={url}>
            {({ geographies }: { geographies: DistrictGeo[] }) => {
              const mine = geographies.filter((g) => isCongressionalDistrictGeoid(g.properties?.GEOID, stateFips));
              return (
                <>
                  {mine.map((geo) => {
                    const geoid = geo.properties!.GEOID!;
                    const { id, pvi, name } = lookup(geoid);
                    const fill = pvi != null ? getRaceColor(pvi) : "var(--map-unfilled)";
                    const isSelected = selectedId === id;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => setHovered({ geoid, name, pvi })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSelect(isSelected ? null : id)}
                        style={{
                          default: { fill, stroke: isSelected ? "var(--app-text-primary)" : "var(--app-bg)", strokeWidth: isSelected ? 1.75 : 0.6, outline: "none" },
                          hover: { fill, stroke: "var(--app-text-primary)", strokeWidth: 1.25, outline: "none", cursor: "pointer" },
                          pressed: { fill, stroke: "var(--app-text-primary)", strokeWidth: 1.75, outline: "none" },
                        }}
                      />
                    );
                  })}
                  {mine.map((geo) => {
                    const geoid = geo.properties!.GEOID!;
                    const [lon, lat] = geoCentroid(geo as unknown as Parameters<typeof geoCentroid>[0]);
                    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
                    return (
                      <Marker key={`label-${geo.rsmKey}`} coordinates={[lon, lat]}>
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ fontSize: 9, fontWeight: 700, fill: "#fff", paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 2, pointerEvents: "none" }}
                        >
                          {districtNumber(geoid, geoid.endsWith("00"))}
                        </text>
                      </Marker>
                    );
                  })}
                </>
              );
            }}
          </Geographies>
        </ComposableMap>
      </div>
    </div>
  );
}

/**
 * The lines before and after one redraw, side by side, each district coloured by its PVI on
 * those lines. A 2016 redraw has no earlier map on file, so it shows the new lines alone.
 */
export default function RedistrictingMaps({
  stateAbbr,
  stateFips,
  year,
  districts,
  selectedId,
  onSelect,
}: {
  stateAbbr: string;
  stateFips: string;
  year: number;
  districts: RedistrictDistrict[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hasBefore = year >= 2018;
  const { before, after, names } = useMemo(() => {
    const before = new Map<string, number | null>();
    const after = new Map<string, number | null>();
    const names = new Map<string, string>();
    for (const d of districts) { before.set(d.id, d.pviOld); after.set(d.id, d.pviNew); names.set(d.id, d.name); }
    return { before, after, names };
  }, [districts]);
  const height = 250;
  return (
    <div className={`grid grid-cols-1 gap-4 ${hasBefore ? "md:grid-cols-2" : "md:max-w-xl"}`}>
      {hasBefore && (
        <MapPanel
          stateAbbr={stateAbbr}
          stateFips={stateFips}
          url={getCongressionalDistrictsGeoUrl(year - 1)}
          title={`Before · ${year - 2} lines`}
          pviByGeoid={before}
          nameByGeoid={names}
          selectedId={selectedId}
          onSelect={onSelect}
          height={height}
        />
      )}
      <MapPanel
        stateAbbr={stateAbbr}
        stateFips={stateFips}
        url={getCongressionalDistrictsGeoUrl(year)}
        title={`After · ${year} lines`}
        pviByGeoid={after}
        nameByGeoid={names}
        selectedId={selectedId}
        onSelect={onSelect}
        height={height}
      />
    </div>
  );
}
