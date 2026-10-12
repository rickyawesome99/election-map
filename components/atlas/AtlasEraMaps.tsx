"use client";

import { useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { loadTopo } from "@/lib/useTopology";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import { extractDistrictCode } from "@/lib/stateLegBoundaryCode";
import { aliasDistrictKey, normalizeDistrictKey } from "@/lib/stateLegDistrictKey";
import { shortDistrictName } from "@/lib/stateLegAtlas";
import type { Chamber } from "@/data/stateLegDistricts";
import type { StateLegRedistrictingEntry } from "@/data/stateLegRedistricting";
import type { AtlasEra } from "@/lib/stateLegAtlas";

/**
 * The before/after mini-maps of one district's redistricting record. The left panel is the previous
 * map: the districts today's district draws from, shaded by the share of its population each one
 * contributed, with the old district of the same number dashed and today's district outlined on
 * top. The right panel is the new map with the district filled and the old district dashed over
 * it. Both panels share one extent, fitted to the union of the shapes that matter, so a reader's
 * eye can move straight across.
 *
 * Boundary files are the same per-state TopoJSON the chamber map draws (current) and the
 * superseded vintages in public/state-leg-districts-historical/; each is fetched once per tab and
 * its features kept here so switching districts never re-parses it.
 */

type DistrictFeature = Feature<Geometry, { code: string }>;
type EraFeatures = { byKey: Map<string, DistrictFeature>; all: DistrictFeature[] };

const featureCache = new Map<string, Promise<EraFeatures | null>>();

export function eraBoundaryUrl(abbr: string, chamber: Chamber, era: string): string {
  return era === "current" ? `/state-leg-districts/${chamber}/${abbr}.json` : `/state-leg-districts-historical/${chamber}/${abbr}-${era}.json`;
}

function loadEraFeatures(abbr: string, chamber: Chamber, era: string): Promise<EraFeatures | null> {
  const url = eraBoundaryUrl(abbr, chamber, era);
  const cacheKey = `${abbr}:${chamber}:${url}`;
  let p = featureCache.get(cacheKey);
  if (!p) {
    p = loadTopo(url).then((topo) => {
      if (!topo) return null;
      const t = topo as Topology;
      const objectName = Object.keys(t.objects)[0];
      if (!objectName) return null;
      const fc = feature(t, t.objects[objectName] as GeometryCollection) as FeatureCollection;
      const all: DistrictFeature[] = [];
      const byKey = new Map<string, DistrictFeature>();
      for (const f of fc.features) {
        const props = (f.properties ?? {}) as { DISTRICT?: string; NAMELSAD?: string };
        const code = extractDistrictCode(abbr, chamber, props);
        if (!code) continue;
        const normalized = normalizeGeographyWinding(f as unknown as WindableGeography) as unknown as DistrictFeature;
        const df: DistrictFeature = { ...normalized, properties: { code } };
        all.push(df);
        byKey.set(normalizeDistrictKey(code), df);
      }
      return { byKey, all };
    });
    featureCache.set(cacheKey, p);
  }
  return p;
}

function useEraFeatures(abbr: string, chamber: Chamber, era: string | null): EraFeatures | null | undefined {
  const [state, setState] = useState<{ era: string; data: EraFeatures | null } | null>(null);
  useEffect(() => {
    if (!era) return;
    let live = true;
    loadEraFeatures(abbr, chamber, era).then((data) => { if (live) setState({ era, data }); });
    return () => { live = false; };
  }, [abbr, chamber, era]);
  if (!era) return null;
  return state?.era === era ? state.data : undefined;
}

function lookup(fe: EraFeatures | null | undefined, abbr: string, chamber: Chamber, key: string): DistrictFeature | undefined {
  if (!fe) return undefined;
  const n = normalizeDistrictKey(key);
  return fe.byKey.get(n) ?? (() => { const alias = aliasDistrictKey(abbr, chamber, n); return alias ? fe.byKey.get(alias) : undefined; })();
}

const W = 320, H = 260, PAD = 14;

function Panel({
  all,
  fit,
  fills,
  dashed,
  bold,
  labels,
  caption,
  sub,
}: {
  all: DistrictFeature[];
  fit: DistrictFeature[];
  /** Feature → fill opacity (0–1). */
  fills: { f: DistrictFeature; opacity: number; color?: string }[];
  dashed?: DistrictFeature;
  bold?: DistrictFeature;
  labels: { f: DistrictFeature; text: string }[];
  caption: string;
  sub?: string;
}) {
  const { path, visible } = useMemo(() => {
    const proj = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], { type: "FeatureCollection", features: fit } as GeoPermissibleObjects);
    const path = geoPath(proj);
    const visible = all.filter((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      return x1 >= 0 && x0 <= W && y1 >= 0 && y0 <= H;
    });
    return { path, visible };
  }, [all, fit]);

  return (
    <figure className="m-0 min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ background: "var(--app-tab-bg)", borderRadius: 6 }} role="img" aria-label={caption}>
        {visible.map((f) => (
          <path key={f.properties.code} d={path(f) ?? undefined} fill="none" stroke="var(--app-border)" strokeWidth={0.7} />
        ))}
        {fills.map(({ f, opacity, color }) => (
          <path key={`fill-${f.properties.code}`} d={path(f) ?? undefined} fill={color ?? "var(--app-text-primary)"} fillOpacity={opacity} stroke="var(--app-text-muted)" strokeWidth={0.6} />
        ))}
        {dashed && <path d={path(dashed) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.4} strokeDasharray="4 3" />}
        {bold && <path d={path(bold) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={2.2} strokeLinejoin="round" />}
        {labels.map(({ f, text }) => {
          const [x, y] = path.centroid(f);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return (
            <text key={`label-${f.properties.code}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="var(--app-text-primary)" stroke="var(--app-bg)" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
              {text}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 text-xs">
        <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{caption}</span>
        {sub && <span style={{ color: "var(--app-text-very-muted)" }}> · {sub}</span>}
      </figcaption>
    </figure>
  );
}

function eraName(eras: AtlasEra[], key: string): string {
  const e = eras.find((x) => x.key === key);
  if (!e) return `${key} map`;
  return e.key === "current" ? "current map" : `${e.label} map`;
}

function Skeleton({ text }: { text: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="w-full rounded flex items-center justify-center text-xs" style={{ aspectRatio: `${W} / ${H}`, background: "var(--app-tab-bg)", color: "var(--app-text-very-muted)" }}>{text}</div>
      ))}
    </div>
  );
}

/** Before/after maps for one redistricting transition. */
export function AtlasTransitionMaps({ abbr, chamber, districtKey, entry, eras }: { abbr: string; chamber: Chamber; districtKey: string; entry: StateLegRedistrictingEntry; eras: AtlasEra[] }) {
  const from = useEraFeatures(abbr, chamber, entry.fromEra);
  const to = useEraFeatures(abbr, chamber, entry.toEra);
  const name = shortDistrictName(chamber, districtKey);

  if (from === undefined || to === undefined) return <Skeleton text="Loading map…" />;
  if (!from || !to) return <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No boundary file for one of these maps.</p>;

  const newF = lookup(to, abbr, chamber, districtKey);
  const oldF = lookup(from, abbr, chamber, districtKey);
  if (!newF) return <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No polygon for {name} on the {eraName(eras, entry.toEra)}.</p>;

  const contributors = entry.contributors
    .map((c) => ({ ...c, f: lookup(from, abbr, chamber, c.key) }))
    .filter((c): c is typeof c & { f: DistrictFeature } => c.f != null);
  const maxPct = Math.max(1, ...contributors.map((c) => c.popPct));
  // The extent is the new district and the old districts that fed it. The old district of the same
  // number joins only when it overlaps: Ohio's HD-31 moved from Cincinnati to Summit County in
  // 2022, and fitting both would shrink each to a speck.
  const fit = [newF, ...(oldF && entry.retainedPopPct >= 1 ? [oldF] : []), ...contributors.filter((c) => c.popPct >= 10).map((c) => c.f)];
  const unchanged = entry.retainedPopPct >= 99.5 && entry.contributors.length <= 1;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Panel
          all={from.all}
          fit={fit}
          fills={contributors.map((c) => ({ f: c.f, opacity: 0.12 + 0.5 * (c.popPct / maxPct) }))}
          dashed={oldF}
          bold={newF}
          labels={contributors.filter((c) => c.popPct >= 6).map((c) => ({ f: c.f, text: c.key }))}
          caption={`${eraName(eras, entry.fromEra)} · where today's ${name} came from`}
          sub={oldF ? `dashed = the old ${name}` : `no ${name} on this map`}
        />
        <Panel
          all={to.all}
          fit={fit}
          fills={[{ f: newF, opacity: 0.45 }]}
          dashed={unchanged ? undefined : oldF}
          bold={newF}
          labels={[{ f: newF, text: districtKey }]}
          caption={`${eraName(eras, entry.toEra)} · ${name}`}
          sub={unchanged ? "lines unchanged" : `kept ${entry.retainedPopPct.toFixed(0)}% of its population`}
        />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        Left: the previous map, shaded by the share of today&rsquo;s population each old district contributed, with today&rsquo;s {name} outlined in bold. Right: the new map, the old {name} dashed for comparison. Same extent on both.
      </p>
    </div>
  );
}

/** The base districts an overlay district (a New Hampshire floterial) sits on, on the current map. */
export function AtlasOverlayMap({ abbr, chamber, districtKey, components, seats }: { abbr: string; chamber: Chamber; districtKey: string; components: string[]; seats?: number }) {
  const cur = useEraFeatures(abbr, chamber, "current");
  const name = shortDistrictName(chamber, districtKey);
  if (cur === undefined) return <Skeleton text="Loading map…" />;
  if (!cur) return null;
  const parts = components.map((k) => ({ key: k, f: lookup(cur, abbr, chamber, k) })).filter((p): p is { key: string; f: DistrictFeature } => p.f != null);
  if (parts.length === 0) return <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No polygons for the base districts of {name}.</p>;
  return (
    <div className="max-w-md">
      <Panel
        all={cur.all}
        fit={parts.map((p) => p.f)}
        fills={parts.map((p) => ({ f: p.f, opacity: 0.4 }))}
        labels={parts.map((p) => ({ f: p.f, text: p.key }))}
        caption={`${name} · floterial over ${parts.map((p) => p.key).join(", ")}`}
        sub={seats != null ? `${seats} additional seat${seats === 1 ? "" : "s"} elected by these districts' voters` : "elected by these districts' voters in addition to their own members"}
      />
    </div>
  );
}

const LW = 360, LH = 300;

/** Current-map features keyed back to the atlas's district keys (boundary codes and atlas keys can differ in spelling). */
function useKeyedCurrent(abbr: string, chamber: Chamber, keys: string[]) {
  const cur = useEraFeatures(abbr, chamber, "current");
  const byFeature = useMemo(() => {
    const out = new Map<DistrictFeature, string>();
    if (!cur) return out;
    for (const k of keys) { const f = lookup(cur, abbr, chamber, k); if (f && !out.has(f)) out.set(f, k); }
    return out;
  }, [cur, abbr, chamber, keys]);
  return { cur, byFeature };
}

/**
 * The whole chamber map with one district picked out: the district view's locator. Every district
 * is a click target, so the reader can move around the state without going back to the explorer.
 */
export function LocatorMap({ abbr, chamber, keys, selectedKey, onSelect, fills }: { abbr: string; chamber: Chamber; keys: string[]; selectedKey: string; onSelect: (key: string) => void; fills?: Record<string, string> }) {
  const { cur, byFeature } = useKeyedCurrent(abbr, chamber, keys);
  const [hover, setHover] = useState<string | null>(null);
  const geo = useMemo(() => {
    if (!cur) return null;
    const proj = geoMercator().fitExtent([[6, 6], [LW - 6, LH - 6]], { type: "FeatureCollection", features: cur.all } as GeoPermissibleObjects);
    return geoPath(proj);
  }, [cur]);
  if (cur === undefined) return <div className="w-full rounded" style={{ aspectRatio: `${LW} / ${LH}`, background: "var(--app-tab-bg)" }} />;
  if (!cur || !geo) return null;
  const sel = lookup(cur, abbr, chamber, selectedKey);
  const selBounds = sel ? geo.bounds(sel) : null;
  // A district too small to see at state scale gets a ring around it.
  const tiny = selBounds ? Math.max(selBounds[1][0] - selBounds[0][0], selBounds[1][1] - selBounds[0][1]) < 14 : false;
  const [cx, cy] = sel ? geo.centroid(sel) : [0, 0];
  return (
    <svg viewBox={`0 0 ${LW} ${LH}`} className="w-full h-auto block" role="img" aria-label={`Map of ${chamber === "house" ? "House" : "Senate"} districts`}>
      {cur.all.map((f) => {
        const key = byFeature.get(f);
        const isSel = f === sel;
        const isHover = key != null && key === hover;
        return (
          <path
            key={f.properties.code}
            d={geo(f) ?? undefined}
            fill={isSel ? "var(--app-text-primary)" : key && fills?.[key] ? fills[key] : "var(--app-tab-bg)"}
            fillOpacity={isSel || isHover || !fills ? 1 : 0.55}
            stroke={isHover ? "var(--app-text-primary)" : "var(--app-bg)"}
            strokeWidth={isHover ? 1.2 : 0.5}
            style={{ cursor: key ? "pointer" : "default" }}
            onMouseEnter={() => key && setHover(key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => key && onSelect(key)}
          >
            {key && <title>{shortDistrictName(chamber, key)}</title>}
          </path>
        );
      })}
      {sel && tiny && Number.isFinite(cx) && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} style={{ pointerEvents: "none" }} />}
    </svg>
  );
}

/** A static thumbnail of a chamber's map, each district filled from `fills` (keyed by district key). */
export function ChamberThumbnail({ abbr, chamber, fills }: { abbr: string; chamber: Chamber; fills: Record<string, string> }) {
  const keys = useMemo(() => Object.keys(fills), [fills]);
  const { cur, byFeature } = useKeyedCurrent(abbr, chamber, keys);
  const geo = useMemo(() => {
    if (!cur) return null;
    const proj = geoMercator().fitExtent([[4, 4], [LW - 4, LH - 4]], { type: "FeatureCollection", features: cur.all } as GeoPermissibleObjects);
    return geoPath(proj);
  }, [cur]);
  if (cur === undefined || !cur || !geo) return <div className="w-full rounded" style={{ aspectRatio: `${LW} / ${LH}`, background: "var(--app-tab-bg)" }} />;
  return (
    <svg viewBox={`0 0 ${LW} ${LH}`} className="w-full h-auto block" role="img" aria-label={`${chamber === "house" ? "House" : "Senate"} districts by party`}>
      {cur.all.map((f) => {
        const key = byFeature.get(f);
        return <path key={f.properties.code} d={geo(f) ?? undefined} fill={(key && fills[key]) || "var(--app-tab-bg)"} stroke="var(--app-bg)" strokeWidth={0.4} />;
      })}
    </svg>
  );
}
