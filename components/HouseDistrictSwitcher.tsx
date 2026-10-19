"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feature } from "topojson-client";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { loadTopo } from "@/lib/useTopology";
import { startPendingNav } from "@/lib/navPending";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";

/**
 * The district switcher at the top of a U.S. House race page — the same strip the legislative
 * atlas puts on its district pages: ‹ select › stepping through the state's districts, and a
 * locator map of the state's 2026 lines, colored by forecast rating, with the current district
 * at full strength and outlined. Clicking any district opens its page. Rows are built server-side by the page
 * (client components never import the forecast).
 */

export type SwitcherDistrict = { name: string; label: string; geoid: string; fill: string };

type DistrictFeature = Feature<Geometry, { GEOID: string }>;

const LW = 360, LH = 300;
const featureCache = new Map<string, Promise<DistrictFeature[] | null>>();
// The same features once loaded, read synchronously on mount: each district page remounts the
// switcher, and waiting even one frame on the promise flashed the placeholder (a layout shift).
const resolvedFeatures = new Map<string, DistrictFeature[] | null>();

function loadDistricts(stateAbbr: string): Promise<DistrictFeature[] | null> {
  let p = featureCache.get(stateAbbr);
  if (!p) {
    p = loadTopo(`/state-congressional-districts-2026/${stateAbbr}.json`).then((topo) => {
      if (!topo) return null;
      const t = topo as Topology;
      const objectName = Object.keys(t.objects)[0];
      if (!objectName) return null;
      const fc = feature(t, t.objects[objectName] as GeometryCollection) as FeatureCollection;
      return fc.features.map((f) => normalizeGeographyWinding(f as unknown as WindableGeography) as unknown as DistrictFeature);
    }).then((f) => { resolvedFeatures.set(stateAbbr, f); return f; });
    featureCache.set(stateAbbr, p);
  }
  return p;
}

const href = (name: string) => `/house/${name.toLowerCase()}`;

export default function HouseDistrictSwitcher({ stateAbbr, districts, current, mapNote }: { stateAbbr: string; districts: SwitcherDistrict[]; current: string; mapNote: string }) {
  const router = useRouter();
  const idx = districts.findIndex((d) => d.name === current);
  // The list wraps: ‹ on the first district goes to the last, › on the last goes to the first.
  const n = districts.length;
  const prev = idx >= 0 && n > 1 ? districts[(idx - 1 + n) % n] : null;
  const next = idx >= 0 && n > 1 ? districts[(idx + 1) % n] : null;
  const go = (name: string) => { if (name !== current) { startPendingNav(href(name)); router.push(href(name), { scroll: false }); } };

  const navBtn = "h-8 w-8 shrink-0 grid place-items-center rounded-full text-base disabled:opacity-30";
  return (
    <div className="flex items-center gap-5 py-3" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={!prev} onClick={() => prev && go(prev.name)} aria-label={prev ? `Previous: ${prev.name}` : "Previous district"}>‹</button>
          <select
            value={current}
            onChange={(e) => go(e.target.value)}
            aria-label="Choose a district"
            className="min-w-0 flex-1 max-w-xs text-sm px-3 py-1.5 rounded-full"
            style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
          >
            {districts.map((d) => (
              <option key={d.name} value={d.name}>{d.label}</option>
            ))}
          </select>
          <button type="button" className={navBtn} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={!next} onClick={() => next && go(next.name)} aria-label={next ? `Next: ${next.name}` : "Next district"}>›</button>
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {idx + 1} of {districts.length} districts · {mapNote}; click any district to open it
        </div>
      </div>
      <div className="w-28 sm:w-44 shrink-0">
        <LocatorMap stateAbbr={stateAbbr} districts={districts} current={current} onSelect={go} />
      </div>
    </div>
  );
}

function LocatorMap({ stateAbbr, districts, current, onSelect }: { stateAbbr: string; districts: SwitcherDistrict[]; current: string; onSelect: (name: string) => void }) {
  const [features, setFeatures] = useState<DistrictFeature[] | null | undefined>(() => resolvedFeatures.get(stateAbbr));
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (resolvedFeatures.has(stateAbbr)) { setFeatures(resolvedFeatures.get(stateAbbr)); return; }
    let live = true;
    loadDistricts(stateAbbr).then((f) => { if (live) setFeatures(f); });
    return () => { live = false; };
  }, [stateAbbr]);
  const byGeoid = useMemo(() => new Map(districts.map((d) => [d.geoid, d])), [districts]);
  const geo = useMemo(() => {
    if (!features?.length) return null;
    const proj = geoMercator().fitExtent([[6, 6], [LW - 6, LH - 6]], { type: "FeatureCollection", features } as GeoPermissibleObjects);
    const path = geoPath(proj);
    // Crop the frame to the state itself, so a wide state (Nebraska, Tennessee) doesn't carry
    // empty bands above and below it.
    const [[x0, y0], [x1, y1]] = path.bounds({ type: "FeatureCollection", features } as GeoPermissibleObjects);
    return { path, viewBox: `${x0 - 4} ${y0 - 4} ${x1 - x0 + 8} ${y1 - y0 + 8}` };
  }, [features]);

  if (features === undefined) return <div className="w-full h-24 sm:h-28 rounded" style={{ background: "var(--app-tab-bg)" }} />;
  if (!features || !geo) return null;
  const sel = features.find((f) => byGeoid.get(f.properties.GEOID)?.name === current);
  const selBounds = sel ? geo.path.bounds(sel) : null;
  // A district too small to see at state scale gets a ring around it.
  const tiny = selBounds ? Math.max(selBounds[1][0] - selBounds[0][0], selBounds[1][1] - selBounds[0][1]) < 14 : false;
  const [cx, cy] = sel ? geo.path.centroid(sel) : [0, 0];
  return (
    <svg viewBox={geo.viewBox} preserveAspectRatio="xMaxYMid meet" className="w-full h-auto max-h-24 sm:max-h-28 block" role="img" aria-label="Map of congressional districts">
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
            onClick={() => d && onSelect(d.name)}
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
