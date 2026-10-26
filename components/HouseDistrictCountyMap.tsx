"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry, MultiLineString } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useStaticJson } from "@/lib/useStaticJson";
import { usePanZoom } from "@/lib/usePanZoom";
import type { CountyMapEntry, CountyMapResult } from "@/components/PastElectionCountyMap";
import { isRealName } from "@/lib/personName";
import CountyTooltip, { CountyCardClose, CountyCardLink, type CountyTooltipProps } from "@/components/CountyTooltip";
import { countyDisplayName } from "@/lib/countyName";

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

const zoomBtn = "flex h-6 w-6 items-center justify-center rounded-md text-sm font-semibold leading-none";
const zoomBtnStyle = { background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 };

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
  caption,
  panelSize = "compact",
  fill = false,
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
  /** Rendered between the map and the selected-county panel. */
  caption?: ReactNode;
  /** The click panel's layout: "wide" where the map has the page's full width (race pages). */
  panelSize?: "compact" | "wide" | "small";
  /** Desktop only: fill a parent of fixed height (a flex column) instead of setting it. The map
   *  takes `height` when there's room and gives up space down to 180px when the selected
   *  county's panel needs it, so opening a panel never makes the column taller. */
  fill?: boolean;
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
    // Alaska's Aleutians cross the antimeridian: unrotated, the fit spans the whole globe and the
    // state shrinks into one corner. Centre the projection on the state instead.
    const projection = geoMercator().rotate(stateAbbr === "AK" ? [154, 0] : [0, 0]).fitExtent([[6, 6], [size.width - 6, size.height - 6]], { type: "FeatureCollection", features: shown });
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
  }, [topo, district, size, stateAbbr]);

  const zoom = usePanZoom(size.width, size.height);
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

  // One description of a county piece, drawn as the hover popup and as the click panel.
  const card = (h: Hovered): CountyTooltipProps => {
    const title = countyDisplayName(h.fips, h.name);
    if (!h.inDistrict) return { kind: "message", title, message: `Part of this county is in ${stateAbbr}-${String(h.otherDistrict).padStart(2, "0")}, not ${districtLabel}.` };
    if (!h.result) return { kind: "message", title, message: "No result on file for this county's share of the district." };
    const r = h.result;
    return {
      kind: "result", title,
      dem: { name: demName, link: isRealName(demName), state: stateAbbr, party: demParty, pct: r.demPct, votes: r.demVotes },
      rep: { name: repName, link: isRealName(repName), state: stateAbbr, party: repParty, pct: r.repPct, votes: r.repVotes },
      margin: r.margin, totalVotes: r.totalVotes, reporting: r.reporting,
    };
  };

  const patternId = `hatch-${stateAbbr}-${district}`;

  return (
    <div className={fill ? "md:flex md:h-full md:flex-col" : undefined}>
      <div ref={containerRef} className={`relative${fill ? " md:min-h-[180px] md:shrink" : ""}`} style={{ height, background: "var(--app-bg)" }} onMouseMove={onMouseMove}>
        {hovered && <CountyTooltip {...card(hovered)} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />}
        {failed && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>Map unavailable.</div>}
        {scene && (
          <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`${districtLabel} results by county`} {...zoom.svgProps}>
            <defs>
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--map-unfilled)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--app-text-very-muted)" strokeWidth="1.5" />
              </pattern>
            </defs>
            <g transform={zoom.transform}>
            {scene.context.map((p) => (
              <path key={`ctx-${p.properties.c}-${p.properties.d}`} d={scene.path(p) ?? undefined} fill={`url(#${patternId})`} stroke="none"
                onMouseEnter={() => setHovered(describe(p))} onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected((s) => (s?.fips === p.properties.c && !s.inDistrict ? null : describe(p)))} />
            ))}
            {scene.mine.map((p) => {
              const h = describe(p);
              const isSel = selected?.fips === p.properties.c && selected.inDistrict;
              return (
                <path key={`in-${p.properties.c}`} d={scene.path(p) ?? undefined} fill={fillFor(h.result)} stroke={isSel ? "var(--app-text-primary)" : "none"} strokeWidth={isSel ? 1.5 : 0} vectorEffect="non-scaling-stroke"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(h)} onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : h)} />
              );
            })}
            <path d={scene.path(scene.countyBorders) ?? undefined} fill="none" stroke="var(--app-bg)" strokeWidth={0.8} pointerEvents="none" vectorEffect="non-scaling-stroke" />
            <path d={scene.path(scene.districtOutline) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
        )}
        {scene && (
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
            <button onClick={() => zoom.zoomBy(1.6)} aria-label="Zoom in" className={zoomBtn} style={zoomBtnStyle}>+</button>
            <button onClick={() => zoom.zoomBy(1 / 1.6)} aria-label="Zoom out" className={zoomBtn} style={zoomBtnStyle}>−</button>
            {zoom.zoomed && (
              <button onClick={zoom.reset} className="rounded-md px-1 py-0.5 text-[10px] font-semibold" style={zoomBtnStyle}>Reset</button>
            )}
          </div>
        )}
      </div>
      {caption}
      {selected && (
        <div className={`px-1 ${panelSize === "small" ? "mt-1 pt-2" : "mt-2 py-3"}`} style={{ borderTop: "1px solid var(--app-border)" }}>
          <CountyTooltip
            {...card(selected)}
            variant="panel"
            size={panelSize}
            aside={<CountyCardClose onClick={() => setSelected(null)} />}
            footer={<CountyCardLink href={`/historical/${selected.fips}`} />}
          />
        </div>
      )}
    </div>
  );
}
