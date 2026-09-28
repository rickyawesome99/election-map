"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry, MultiLineString } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useStaticJson } from "@/lib/useStaticJson";
import type { CountyMapEntry, CountyMapResult } from "@/components/PastElectionCountyMap";

// County map of ONE House district on the map in force that year. Counties the district shares
// with a neighbour are drawn split at the district line: the district's share is painted by its
// own margin, the rest of the county is hatched, and the county's outer border is kept so the
// split reads as one county in two colours. Geometry comes from
// public/house-county-pieces/{mapYear}/{ST}.json (scripts/build-house-county-pieces.py), results
// from the server page as props.

type PieceProps = { c: string; d: number; n: string };
type PiecesTopology = Topology<{ pieces: GeometryCollection<PieceProps>; districts: GeometryCollection<{ d: number }> }>;
type PieceFeature = Feature<Geometry, PieceProps>;
type Hovered = { fips: string; name: string; inDistrict: boolean; otherDistrict: number | null; result: CountyMapResult | null };

function fmtSigned(margin: number, demParty: string, repParty: string): string {
  if (Math.abs(margin) < 0.05) return "EVEN";
  return `${margin > 0 ? repParty : demParty}+${Math.abs(margin).toFixed(1)}`;
}

export default function HouseDistrictCountyMap({
  piecesUrl,
  district,
  districtLabel,
  stateAbbr,
  counties,
  demName,
  repName,
  demParty = "D",
  repParty = "R",
  height = 300,
}: {
  piecesUrl: string;
  district: number;
  districtLabel: string;
  stateAbbr: string;
  counties: CountyMapEntry[];
  demName: string;
  repName: string;
  demParty?: "D" | "R" | "I";
  repParty?: "D" | "R" | "I";
  height?: number;
}) {
  const { data: topo, failed } = useStaticJson<PiecesTopology>(piecesUrl);
  const byFips = useMemo(() => new Map(counties.map((c) => [c.fips, c.result])), [counties]);
  const sameParty = demParty === repParty;
  const fillFor = (r: CountyMapResult | null): string => {
    if (!r) return "var(--map-unfilled)";
    if (!sameParty) return getRaceColor(r.margin);
    const size = Math.abs(r.margin);
    return getRaceColor(demParty === "R" ? size : -size);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scene = useMemo(() => {
    if (!topo) return null;
    const pieces = feature(topo, topo.objects.pieces).features as PieceFeature[];
    const mine = pieces.filter((p) => p.properties.d === district);
    const touched = new Set(mine.map((p) => p.properties.c));
    const context = pieces.filter((p) => p.properties.d !== district && touched.has(p.properties.c));
    const shown = [...mine, ...context];
    if (shown.length === 0) return null;
    const projection = geoMercator().fitExtent([[6, 6], [size.width - 6, size.height - 6]], { type: "FeatureCollection", features: shown });
    const path = geoPath(projection);
    // County outer borders: edges between pieces of different counties, or on the outside.
    const countyBorders = mesh(topo, topo.objects.pieces, (a, b) => {
      const pa = (a as unknown as { properties: PieceProps }).properties, pb = (b as unknown as { properties: PieceProps }).properties;
      if (!touched.has(pa.c) && !touched.has(pb.c)) return false;
      return a === b || pa.c !== pb.c;
    }) as MultiLineString;
    const districtOutline = mesh(topo, topo.objects.districts, (a, b) => {
      const da = (a as unknown as { properties: { d: number } }).properties.d, db = (b as unknown as { properties: { d: number } }).properties.d;
      return da === district || db === district;
    }) as MultiLineString;
    return { mine, context, path, countyBorders, districtOutline };
  }, [topo, district, size]);

  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [selected, setSelected] = useState<Hovered | null>(null);
  const { onMouseMove, tooltipRef } = useMapTooltip(12, 8);

  const describe = (p: PieceFeature): Hovered => ({
    fips: p.properties.c,
    name: p.properties.n,
    inDistrict: p.properties.d === district,
    otherDistrict: p.properties.d === district ? null : p.properties.d,
    result: p.properties.d === district ? byFips.get(p.properties.c) ?? null : null,
  });

  const detail = (h: Hovered) => {
    if (!h.inDistrict) {
      return <div className="mt-1 text-[10px]" style={{ color: "var(--app-text-muted)" }}>Part of this county is in {stateAbbr}-{String(h.otherDistrict).padStart(2, "0")}, not {districtLabel}.</div>;
    }
    if (!h.result) return <div className="mt-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>No result on file for this county&apos;s share of the district.</div>;
    const r = h.result;
    return (
      <>
        <div className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: r.margin > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{fmtSigned(r.margin, demParty, repParty)}</div>
        <div className="mt-0.5 text-[10px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          <div className="flex justify-between gap-3"><span className="truncate">{demName}</span><span>{r.demPct.toFixed(1)}% · {r.demVotes.toLocaleString()}</span></div>
          <div className="flex justify-between gap-3"><span className="truncate">{repName}</span><span>{r.repPct.toFixed(1)}% · {r.repVotes.toLocaleString()}</span></div>
        </div>
      </>
    );
  };

  const patternId = `hatch-${stateAbbr}-${district}`;

  return (
    <div>
      <div ref={containerRef} className="relative" style={{ height, background: "var(--app-bg)" }} onMouseMove={onMouseMove}>
        {hovered && (
          <div ref={tooltipRef} className="absolute z-20 hidden pointer-events-none rounded-lg md:block"
            style={{ width: 210, padding: "8px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
            <div className="font-bold text-xs" style={{ color: "var(--app-text-primary)" }}>{hovered.name} {stateAbbr === "LA" ? "Parish" : stateAbbr === "AK" ? "Borough" : "County"}</div>
            {detail(hovered)}
          </div>
        )}
        {failed && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>Map unavailable.</div>}
        {scene && (
          <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`${districtLabel} results by county`} style={{ display: "block" }}>
            <defs>
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--map-unfilled)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--app-text-very-muted)" strokeWidth="1.5" />
              </pattern>
            </defs>
            {scene.context.map((p) => (
              <path key={`ctx-${p.properties.c}-${p.properties.d}`} d={scene.path(p) ?? undefined} fill={`url(#${patternId})`} stroke="none"
                onMouseEnter={() => setHovered(describe(p))} onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected((s) => (s?.fips === p.properties.c && !s.inDistrict ? null : describe(p)))} />
            ))}
            {scene.mine.map((p) => {
              const h = describe(p);
              const isSel = selected?.fips === p.properties.c && selected.inDistrict;
              return (
                <path key={`in-${p.properties.c}`} d={scene.path(p) ?? undefined} fill={fillFor(h.result)} stroke={isSel ? "var(--app-text-primary)" : "none"} strokeWidth={isSel ? 1.5 : 0}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(h)} onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : h)} />
              );
            })}
            <path d={scene.path(scene.countyBorders) ?? undefined} fill="none" stroke="var(--app-bg)" strokeWidth={0.8} pointerEvents="none" />
            <path d={scene.path(scene.districtOutline) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" />
          </svg>
        )}
      </div>
      {selected && (
        <div className="px-1 py-3" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>{selected.name} {stateAbbr === "LA" ? "Parish" : stateAbbr === "AK" ? "Borough" : "County"}</div>
              <div className="text-xs">{detail(selected)}</div>
              <a href={`/historical/${selected.fips}`} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Go to county page →</a>
            </div>
            <button onClick={() => setSelected(null)} className="shrink-0 flex h-9 w-9 items-center justify-center rounded text-xl leading-none" aria-label="Close county details" style={{ color: "var(--app-text-muted)", background: "var(--app-bg)" }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
