"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feature, merge } from "topojson-client";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { loadTopo } from "@/lib/useTopology";
import { startPendingNav } from "@/lib/navPending";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";

/**
 * The navigation pieces of a race page header: the ‹ select › rail that steps through the
 * office's races (a state's districts, or every state's Senate / Governor race), and the locator
 * map beside the title — the state's 2026 districts colored by forecast rating with the current
 * one outlined (House), or the state's outline in its rating color (Senate, Governor). Rows are
 * built server-side by the page (client components never import the forecast).
 */

export type RailItem = { value: string; label: string; href: string };
export type SwitcherDistrict = { name: string; label: string; geoid: string; fill: string };

type DistrictFeature = Feature<Geometry, { GEOID: string }>;
type StateShapes = { districts: DistrictFeature[]; outline: Feature<Geometry> } | null;

const LW = 360, LH = 300;
const shapeCache = new Map<string, Promise<StateShapes>>();
// The same shapes once loaded, read synchronously on mount: each race page remounts the map,
// and waiting even one frame on the promise flashed the placeholder (a layout shift).
const resolvedShapes = new Map<string, StateShapes>();

function loadShapes(stateAbbr: string): Promise<StateShapes> {
  let p = shapeCache.get(stateAbbr);
  if (!p) {
    p = loadTopo(`/state-congressional-districts-2026/${stateAbbr}.json`).then((topo) => {
      if (!topo) return null;
      const t = topo as Topology;
      const objectName = Object.keys(t.objects)[0];
      if (!objectName) return null;
      const obj = t.objects[objectName] as GeometryCollection;
      const fc = feature(t, obj) as FeatureCollection;
      const districts = fc.features.map((f) => normalizeGeographyWinding(f as unknown as WindableGeography) as unknown as DistrictFeature);
      const outline = normalizeGeographyWinding({ type: "Feature", properties: {}, geometry: merge(t, obj.geometries as Parameters<typeof merge>[1]) } as unknown as WindableGeography) as unknown as Feature<Geometry>;
      return { districts, outline };
    }).then((s) => { resolvedShapes.set(stateAbbr, s); return s; });
    shapeCache.set(stateAbbr, p);
  }
  return p;
}

function useShapes(stateAbbr: string): StateShapes | undefined {
  // Shapes come straight from the module cache when it has the state; the state only holds a
  // load that finished for the state on screen (tagged, so a stale load never paints after a switch).
  const [loaded, setLoaded] = useState<{ abbr: string; shapes: StateShapes } | null>(null);
  useEffect(() => {
    if (resolvedShapes.has(stateAbbr)) return;
    let live = true;
    loadShapes(stateAbbr).then((s) => { if (live) setLoaded({ abbr: stateAbbr, shapes: s }); });
    return () => { live = false; };
  }, [stateAbbr]);
  return resolvedShapes.has(stateAbbr) ? resolvedShapes.get(stateAbbr) : loaded?.abbr === stateAbbr ? loaded.shapes : undefined;
}

function useGo(current: string) {
  const router = useRouter();
  return (href: string, value: string) => {
    if (value === current) return;
    startPendingNav(href);
    router.push(href, { scroll: false });
  };
}

/** ‹ select › stepping through the office's races; the list wraps at both ends. */
export function RaceRail({ items, current, label }: { items: RailItem[]; current: string; label: string }) {
  const go = useGo(current);
  const idx = items.findIndex((d) => d.value === current);
  const n = items.length;
  if (n < 2) return null;
  const prev = idx >= 0 ? items[(idx - 1 + n) % n] : null;
  const next = idx >= 0 ? items[(idx + 1) % n] : null;
  const navBtn = "ix-press ix-rail-btn h-7 w-7 shrink-0 grid place-items-center rounded-full text-sm disabled:opacity-30";
  const btnStyle = { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" };
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={navBtn} style={btnStyle} disabled={!prev} onClick={() => prev && go(prev.href, prev.value)} aria-label={prev ? `Previous: ${prev.label}` : "Previous"}>‹</button>
      <select
        value={current}
        onChange={(e) => { const it = items.find((d) => d.value === e.target.value); if (it) go(it.href, it.value); }}
        aria-label={label}
        className="min-w-0 max-w-[15rem] text-xs px-2.5 py-1 rounded-full"
        style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
      >
        {items.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <button type="button" className={navBtn} style={btnStyle} disabled={!next} onClick={() => next && go(next.href, next.value)} aria-label={next ? `Next: ${next.label}` : "Next"}>›</button>
      <span className="hidden sm:inline shrink-0 pl-1 text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
        {idx + 1} of {n}
      </span>
    </div>
  );
}

function useFrame(shapes: StateShapes | undefined) {
  return useMemo(() => {
    if (!shapes) return null;
    const fc = { type: "FeatureCollection", features: shapes.districts } as GeoPermissibleObjects;
    const proj = geoMercator().fitExtent([[6, 6], [LW - 6, LH - 6]], fc);
    const path = geoPath(proj);
    // Crop the frame to the state itself, so a wide state (Nebraska, Tennessee) doesn't carry
    // empty bands above and below it.
    const [[x0, y0], [x1, y1]] = path.bounds(fc);
    return { path, viewBox: `${x0 - 4} ${y0 - 4} ${x1 - x0 + 8} ${y1 - y0 + 8}` };
  }, [shapes]);
}

const Placeholder = () => <div className="w-full aspect-[4/3] rounded" style={{ background: "var(--app-tab-bg)" }} />;

/** The state's districts, colored by rating, the current one at full strength and outlined; click one to open it. */
export function DistrictLocatorMap({ stateAbbr, districts, current, note }: { stateAbbr: string; districts: SwitcherDistrict[]; current: string; note: string }) {
  const go = useGo(current);
  const shapes = useShapes(stateAbbr);
  const geo = useFrame(shapes);
  const [hover, setHover] = useState<string | null>(null);
  const byGeoid = useMemo(() => new Map(districts.map((d) => [d.geoid, d])), [districts]);
  if (shapes === undefined) return <Placeholder />;
  if (!shapes || !geo) return null;
  const features = shapes.districts;
  const sel = features.find((f) => byGeoid.get(f.properties.GEOID)?.name === current);
  const selBounds = sel ? geo.path.bounds(sel) : null;
  // A district too small to see at state scale gets a ring around it.
  const tiny = selBounds ? Math.max(selBounds[1][0] - selBounds[0][0], selBounds[1][1] - selBounds[0][1]) < 14 : false;
  const [cx, cy] = sel ? geo.path.centroid(sel) : [0, 0];
  const href = (name: string) => `/house/${name.toLowerCase()}`;
  return (
    <svg viewBox={geo.viewBox} className="w-full h-auto max-h-20 sm:max-h-28 block" role="img" aria-label={`Map of congressional districts, ${note}`}>
      <title>{`Congressional districts · ${note}; click any district to open it`}</title>
      {features.map((f) => {
        const d = byGeoid.get(f.properties.GEOID);
        const isSel = f === sel;
        const isHover = d != null && d.name === hover;
        return (
          <path
            key={f.properties.GEOID}
            d={geo.path(f) ?? undefined}
            fill={d?.fill ?? "var(--app-tab-bg)"}
            fillOpacity={isSel || isHover ? 1 : 0.35}
            stroke={isHover ? "var(--app-text-primary)" : "var(--app-bg)"}
            strokeWidth={isHover ? 1.2 : 0.5}
            style={{ cursor: d ? "pointer" : "default" }}
            onMouseEnter={() => d && setHover(d.name)}
            onMouseLeave={() => setHover(null)}
            onClick={() => d && go(href(d.name), d.name)}
          >
            {d && <title>{d.name}</title>}
          </path>
        );
      })}
      {/* The selected district keeps its rating color at full strength while the rest fade back,
          and is outlined on top (drawn last so neighbours never cover the outline). */}
      {sel && <path d={geo.path(sel) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={2.5} strokeLinejoin="round" style={{ pointerEvents: "none" }} />}
      {sel && tiny && Number.isFinite(cx) && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} style={{ pointerEvents: "none" }} />}
    </svg>
  );
}

/** The state's outline in one fill (its race's rating color) — the statewide pages' locator. */
export function StateLocatorMap({ stateAbbr, fill, label }: { stateAbbr: string; fill: string; label: string }) {
  const shapes = useShapes(stateAbbr);
  const geo = useFrame(shapes);
  if (shapes === undefined) return <Placeholder />;
  if (!shapes || !geo) return null;
  return (
    <svg viewBox={geo.viewBox} className="w-full h-auto max-h-20 sm:max-h-28 block" role="img" aria-label={label}>
      <path d={geo.path(shapes.outline) ?? undefined} fill={fill} />
    </svg>
  );
}
