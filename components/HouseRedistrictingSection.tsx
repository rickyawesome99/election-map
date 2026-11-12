"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { loadTopo } from "@/lib/useTopology";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";

/**
 * The House page's Redistricting History: a tab per map that moved the district's lines,
 * labelled with its PVI change, and the selected map's description and before/after mini-maps, laid out like the
 * Legislative Atlas's redistricting history (components/atlas/AtlasEraMaps.tsx). Both panels share
 * one extent, fitted to the old and new district together, so the eye can move straight across.
 *
 * Boundary vintages are the same files the old District lines map used: national TopoJSON for past cycles, the
 * per-state split for 2026. A map's "before" is the vintage in force the cycle before it. There is
 * no file before 2016, so a 2016 entry shows its new lines alone. Files load when the block nears
 * the viewport, since most readers never scroll this far.
 */

export type HouseBoundaryEntry = {
  year: number;
  pvi?: number;
  description?: string;
  pviOld?: number;
  pviNew?: number;
  boundaryChanged?: boolean;
};

function geoUrlForYear(year: number, stateAbbr: string): string {
  if (year >= 2026) return `/state-congressional-districts-2026/${stateAbbr}.json`;
  if (year >= 2024) return "/congressional-districts-2024.json";
  if (year >= 2022) return "/congressional-districts-2022.json";
  if (year >= 2020) return "/congressional-districts-pre2022.json";
  if (year >= 2018) return "/congressional-districts-2018.json";
  return "/congressional-districts-2016.json";
}
const FIRST_MAP_YEAR = 2016;

type DistrictFeature = Feature<Geometry, { geoid: string }>;
const stateFeatureCache = new Map<string, Promise<DistrictFeature[] | null>>();

function loadStateDistricts(url: string, stateFips: string): Promise<DistrictFeature[] | null> {
  const key = `${url}:${stateFips}`;
  let p = stateFeatureCache.get(key);
  if (!p) {
    p = loadTopo(url).then((topo) => {
      if (!topo) return null;
      const t = topo as Topology;
      const objectName = Object.keys(t.objects)[0];
      if (!objectName) return null;
      const fc = feature(t, t.objects[objectName] as GeometryCollection) as FeatureCollection;
      const out: DistrictFeature[] = [];
      for (const f of fc.features) {
        const geoid = (f.properties as { GEOID?: string } | null)?.GEOID;
        // ZZ = water-only remainder pieces in some vintages.
        if (!geoid || geoid.slice(0, 2) !== stateFips || geoid.endsWith("ZZ")) continue;
        const normalized = normalizeGeographyWinding(f as unknown as WindableGeography) as unknown as DistrictFeature;
        out.push({ ...normalized, properties: { geoid } });
      }
      return out;
    });
    stateFeatureCache.set(key, p);
  }
  return p;
}

function useStateDistricts(url: string | null, stateFips: string, active: boolean): DistrictFeature[] | null | undefined {
  const [state, setState] = useState<{ url: string; data: DistrictFeature[] | null } | null>(null);
  useEffect(() => {
    if (!url || !active) return;
    let live = true;
    loadStateDistricts(url, stateFips).then((data) => { if (live) setState({ url, data }); });
    return () => { live = false; };
  }, [url, stateFips, active]);
  if (!url) return null;
  return state?.url === url ? state.data : undefined;
}

/** The race's district in a vintage: its own GEOID, or the at-large code (a state that gained or lost its only seat). */
function findDistrict(all: DistrictFeature[] | null | undefined, raceId: string): DistrictFeature | undefined {
  if (!all) return undefined;
  return all.find((f) => f.properties.geoid === raceId) ?? (all.length === 1 ? all[0] : undefined) ?? all.find((f) => f.properties.geoid === `${raceId.slice(0, 2)}00`);
}

const districtNumber = (geoid: string) => { const n = parseInt(geoid.slice(2), 10); return n === 0 ? "AL" : String(n); };

const W = 360, H = 250, PAD = 14;

function Panel({ all, fit, fill, dashed, bold, caption, sub }: {
  all: DistrictFeature[];
  fit: DistrictFeature[];
  fill: DistrictFeature;
  dashed?: DistrictFeature;
  bold?: DistrictFeature;
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ background: "var(--app-tab-bg)", borderRadius: 6 }} role="img" aria-label={`${caption}${sub ? `, ${sub}` : ""}`}>
        {visible.map((f) => (
          <path key={f.properties.geoid} d={path(f) ?? undefined} fill="none" stroke="var(--app-border)" strokeWidth={0.8} />
        ))}
        <path d={path(fill) ?? undefined} fill="var(--app-text-primary)" fillOpacity={0.4} stroke="var(--app-text-muted)" strokeWidth={0.6} />
        {dashed && <path d={path(dashed) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.4} strokeDasharray="4 3" />}
        {bold && <path d={path(bold) ?? undefined} fill="none" stroke="var(--app-text-primary)" strokeWidth={2.2} strokeLinejoin="round" />}
        {visible.map((f) => {
          const [[x0, y0], [x1, y1]] = path.bounds(f);
          const isTarget = f === fill;
          // Neighbors get their number only where there is room for it.
          if (!isTarget && (x1 - x0 < 34 || y1 - y0 < 22)) return null;
          const [x, y] = path.centroid(f);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 8 || x > W - 8 || y < 8 || y > H - 8) return null;
          return (
            <text key={`label-${f.properties.geoid}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize={isTarget ? 11 : 9} fontWeight={700} fill={isTarget ? "var(--app-text-primary)" : "var(--app-text-very-muted)"}
              stroke="var(--app-bg)" strokeWidth={isTarget ? 3 : 2} paintOrder="stroke" style={{ pointerEvents: "none" }}>
              {districtNumber(f.properties.geoid)}
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

function Placeholder({ n, text }: { n: 1 | 2; text: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="w-full rounded flex items-center justify-center text-xs" style={{ aspectRatio: `${W} / ${H}`, background: "var(--app-tab-bg)", color: "var(--app-text-very-muted)" }}>{text}</div>
      ))}
    </div>
  );
}

function TransitionMaps({ raceId, stateAbbr, label, year, unchanged }: { raceId: string; stateAbbr: string; label: string; year: number; unchanged: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const stateFips = raceId.slice(0, 2);
  const hasBefore = year > FIRST_MAP_YEAR && !unchanged;
  const prevYear = year - 2;
  const to = useStateDistricts(geoUrlForYear(year, stateAbbr), stateFips, near);
  const from = useStateDistricts(hasBefore ? geoUrlForYear(prevYear, stateAbbr) : null, stateFips, near);

  let body: React.ReactNode;
  if (to === undefined || from === undefined) body = <Placeholder n={hasBefore ? 2 : 1} text="Loading map…" />;
  else {
    const newF = findDistrict(to, raceId);
    const oldF = findDistrict(from, raceId);
    if (!to || !newF) body = <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No boundary file for the {year} lines.</p>;
    else if (!hasBefore || !from || !oldF) {
      body = (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Panel all={to} fit={[newF]} fill={newF} caption={`${year} lines · ${label}`}
            sub={unchanged ? "lines unchanged" : year <= FIRST_MAP_YEAR ? "earlier lines not on file" : `no ${label} on the ${prevYear} map`} />
        </div>
      );
    } else {
      const fit = [newF, oldF];
      const oldLabel = `${stateAbbr}-${districtNumber(oldF.properties.geoid)}`;
      body = (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Panel all={from} fit={fit} fill={oldF} bold={newF} caption={`${prevYear} lines · ${oldLabel}`} sub={`bold = the ${year} ${label}`} />
          <Panel all={to} fit={fit} fill={newF} dashed={oldF} caption={`${year} lines · ${label}`} sub={`dashed = the ${prevYear} ${oldLabel}`} />
        </div>
      );
    }
  }
  return <div ref={ref}>{body}</div>;
}

function pviLabel(pvi: number): string {
  if (pvi === 0) return "EVEN";
  return pvi > 0 ? `R+${pvi}` : `D+${Math.abs(pvi)}`;
}
function pviColor(pvi: number): string {
  return pvi === 0 ? "var(--app-text-primary)" : pvi > 0 ? "var(--party-rep)" : "var(--party-dem)";
}
const REDRAW_ACCENT = "#b45309";

const isUnchanged = (e: HouseBoundaryEntry) => /\bunchanged\b/i.test(e.description ?? "");

export default function HouseRedistrictingSection({ raceId, stateAbbr, label, entries }: {
  raceId: string;
  stateAbbr: string;
  /** "KS-2" */
  label: string;
  /** Newest first. */
  entries: HouseBoundaryEntry[];
}) {
  // One tab per map that moved this district's lines, earliest first. A new state map that left
  // these lines alone gets no tab.
  const redraws = entries.filter((e) => e.boundaryChanged && !isUnchanged(e)).reverse();
  const [selected, setSelected] = useState<number | null>(() => redraws.at(-1)?.year ?? null);
  const current = entries[0];
  const currentPvi = current ? current.pvi ?? current.pviNew : undefined;
  if (redraws.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
        {label}&apos;s lines haven&apos;t changed in any map since {FIRST_MAP_YEAR}.
        {currentPvi != null && <> Its PVI is <b className="font-bold tabular-nums" style={{ color: pviColor(currentPvi) }}>{pviLabel(currentPvi)}</b>.</>}
      </p>
    );
  }
  const e = redraws.find((r) => r.year === selected) ?? redraws.at(-1)!;
  return (
    <div>
      <div className="flex flex-wrap gap-x-10" style={{ borderBottom: "1px solid var(--app-border)" }} role="tablist" aria-label="Redistricting by year">
        {redraws.map((row) => {
          const pviNew = row.pvi ?? row.pviNew;
          const isSel = row.year === e.year;
          // The underline spans the tab's own text, not the row.
          const cellStyle = { borderBottom: `2px solid ${isSel ? "var(--app-text-primary)" : "transparent"}`, marginBottom: -1 };
          return (
            <button key={row.year} type="button" role="tab" aria-selected={isSel}
              onClick={() => setSelected(row.year)}
              className="ix-press flex flex-col items-start gap-1 py-2.5 text-left cursor-pointer" style={cellStyle}>
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: isSel ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
                {row.year}
              </span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>
                {row.pviOld != null && (
                  <>
                    <span className="text-lg" style={{ color: pviColor(row.pviOld), opacity: 0.75 }}>{pviLabel(row.pviOld)}</span>
                    <span className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>→</span>
                  </>
                )}
                <span className="text-2xl" style={{ color: pviNew == null ? "var(--app-text-very-muted)" : pviColor(pviNew) }}>{pviNew == null ? "—" : pviLabel(pviNew)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: e.year > FIRST_MAP_YEAR ? REDRAW_ACCENT : "var(--app-text-muted)" }}>
          {e.year} map
        </div>
        {e.description && <p className="text-sm mb-3" style={{ lineHeight: 1.55, color: "var(--app-text-primary)", textWrap: "pretty" }}>{e.description}</p>}
        {/* 2016 has no earlier boundary file, so no before/after to draw. */}
        {e.year > FIRST_MAP_YEAR && <TransitionMaps key={e.year} raceId={raceId} stateAbbr={stateAbbr} label={label} year={e.year} unchanged={false} />}
      </div>

      <p className="mt-4 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        {redraws.length > 1 && "Pick a year to see that map. "}
        PVI on the old lines → the new lines. Each cycle&apos;s PVI is scored on that cycle&apos;s pair of presidential elections, so it moves a point or so even when the lines don&apos;t; the change is not by itself what the redraw did.
      </p>
    </div>
  );
}
