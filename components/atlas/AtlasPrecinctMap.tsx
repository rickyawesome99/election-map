"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import type { Chamber } from "@/data/stateLegDistricts";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { usePanZoom } from "@/lib/usePanZoom";
import { getRaceColor } from "@/lib/colorScale";
import { normalizeDistrictKey } from "@/lib/stateLegDistrictKey";
import CountyTooltip, { CountyCardClose, type CountyTooltipProps } from "@/components/CountyTooltip";
import { resultCard } from "@/components/precincts/cards";
import { marginOf, type Office, type StateIndex, type StateResults } from "@/components/precincts/types";
import { loadEraFeatures, lookup, type DistrictFeature } from "./AtlasEraMaps";

// The district map on a legislative district's detail view, drawn like a House page's county map
// (components/HouseDistrictCountyMap): the district's 2024 precincts, cut at the district line, on
// the page background; precincts it shares with a neighbour hatched beyond the line; the rest of the
// state in plain grey with the chamber's other district lines, so the reader can zoom out to see
// where the district sits. Geometry: public/state-leg-precincts/{chamber}/{ST}/{i}.json
// (scripts/precincts/build_district_precincts.py), i = the district's place in the boundary file.
// Every district gets a map. Precincts are grey unless a precinct return for the election year is on
// file (`precinctResults`, from data/precincts/coverage.json on the server) and the precinct was
// counted in THIS district's race; then they take the rating colour of their margin.

type PieceProps = { p: number; k: 0 | 1 };
type PieceFeature = Feature<Geometry, PieceProps>;
type PiecesTopology = Topology<{ pieces: GeometryCollection<PieceProps> }>;

const zoomBtn = "flex h-6 w-6 items-center justify-center rounded-md text-sm font-semibold leading-none";
const zoomBtnStyle = { background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 };

// Per-state files are fetched once per tab and shared by every district viewed.
const jsonCache = new Map<string, Promise<unknown>>();
function loadJson<T>(url: string): Promise<T | null> {
  let p = jsonCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    jsonCache.set(url, p);
  }
  return p as Promise<T | null>;
}

/**
 * A precinct file writes the district its row was counted in ("006", "10A"); the atlas keys
 * districts as the site does ("6", "10"). Leading zeros carry no meaning, and Idaho's House seats
 * A and B (one post letter on a numbered district) belong to the district's number. Minnesota's
 * House keys keep their letter ("10A"), so the post letter is dropped only for an all-digit key.
 */
export function precinctInDistrict(code: string, key: string): boolean {
  const p = normalizeDistrictKey(code).replace(/^0+(?=\d)/, "");
  if (!p) return false;
  const k = normalizeDistrictKey(key);
  return p === k || (/^\d+$/.test(k) && p.replace(/[a-z]$/, "") === k);
}

export default function AtlasPrecinctMap({
  abbr,
  stateName,
  chamber,
  districtKey,
  districtLabel,
  components,
  year,
  precinctResults,
  up,
  hasResult,
  chamberLabel,
  height = 300,
}: {
  abbr: string;
  stateName: string;
  chamber: Chamber;
  districtKey: string;
  districtLabel: string;
  /** A floterial's base districts: it has no polygon of its own, so their union is drawn. */
  components?: string[];
  year: number;
  /** A precinct return for `year` is on file for this state and chamber. */
  precinctResults: boolean;
  /** The seat is on the `year` ballot. */
  up: boolean;
  /** A district-level `year` result is on file (the counted race, not the projection). */
  hasResult: boolean;
  chamberLabel: string;
  height?: number;
}) {
  const office: Office = chamber === "house" ? "SLDL" : "SLDU";

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height });
  // Load only once the map is near the viewport: no fetches for readers who never scroll here.
  const [near, setNear] = useState(false);
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
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  const [shapes, setShapes] = useState<{ own: DistrictFeature[]; all: DistrictFeature[]; pieces: PieceFeature[]; topos: PiecesTopology[]; missing: boolean } | null | undefined>(undefined);
  const [index, setIndex] = useState<StateIndex | null>(null);
  const [results, setResults] = useState<StateResults | null>(null);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    (async () => {
      const fe = await loadEraFeatures(abbr, chamber, "current");
      if (!fe) { if (alive) setShapes(null); return; }
      const self = lookup(fe, abbr, chamber, districtKey);
      const own = self ? [self] : (components ?? []).map((c) => lookup(fe, abbr, chamber, c)).filter((f): f is DistrictFeature => !!f);
      if (!own.length) { if (alive) setShapes(null); return; }
      const topos = await Promise.all(own.map((f) => loadJson<PiecesTopology>(`/state-leg-precincts/${chamber}/${abbr}/${f.properties.i}.json`)));
      // A floterial's base districts each list a precinct they split with one another as "shared";
      // that part is inside the floterial, drawn from the other base district's file, so the
      // hatched copy is dropped.
      const files = topos.map((t) => (t ? (feature(t, t.objects.pieces).features as PieceFeature[]) : []));
      const insideIn = files.map((fs) => new Set(fs.filter((f) => f.properties.k === 1).map((f) => f.properties.p)));
      const pieces = files.flatMap((fs, n) => fs.filter((f) => f.properties.k === 1 || !insideIn.some((s, m) => m !== n && s.has(f.properties.p))));
      if (alive) setShapes({ own, all: fe.all, pieces, topos: topos.filter((t): t is PiecesTopology => !!t), missing: topos.some((t) => !t) });
    })();
    return () => { alive = false; };
  }, [near, abbr, chamber, districtKey, components]);
  // Precinct names (up to ~300 KB a state) are only needed for the hover card and the click panel.
  const [wantNames, setWantNames] = useState(false);
  useEffect(() => {
    if (!wantNames) return;
    let alive = true;
    loadJson<StateIndex>(`/precincts/index/${abbr}.json`).then((d) => { if (alive) setIndex(d); });
    return () => { alive = false; };
  }, [wantNames, abbr]);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    if (precinctResults) loadJson<StateResults>(`/precincts/results/${abbr}/${year}.json`).then((d) => { if (alive) setResults(d); });
    return () => { alive = false; };
  }, [near, abbr, year, precinctResults]);

  // pid → this district's own votes in each precinct that voted in its race. A precinct split between
  // districts takes its share from the file's `split` list; any other takes its row when the row's
  // district is this one.
  const rowsHere = useMemo(() => {
    const out = new Map<number, [number, number, number]>();
    const rows = results?.offices[office];
    const codes = results?.districts[office];
    if (!results || !rows || !codes) return out;
    const splitAt = new Set<number>();
    for (const [i, code, d, r, o] of results.split?.[office] ?? []) {
      splitAt.add(i);
      if (precinctInDistrict(code, districtKey) && d + r + o > 0) out.set(results.first_pid + i, [d, r, o]);
    }
    for (let i = 0; i < rows.length; i++) {
      if (splitAt.has(i) || !codes[i] || !precinctInDistrict(codes[i], districtKey)) continue;
      if (rows[i][0] + rows[i][1] + rows[i][2] > 0) out.set(results.first_pid + i, rows[i]);
    }
    return out;
  }, [results, office, districtKey]);
  const margins = useMemo(() => {
    const out = new Map<number, number>();
    for (const [pid, row] of rowsHere) {
      const m = marginOf(row);
      if (m !== null) out.set(pid, m);
    }
    return out;
  }, [rowsHere]);

  const scene = useMemo(() => {
    if (!shapes) return null;
    const { own, all, pieces, topos } = shapes;
    const ownSet = new Set(own);
    // Alaska's Aleutians cross the antimeridian: centre the projection on the state, as the House map does.
    const projection = geoMercator().rotate(abbr === "AK" ? [154, 0] : [0, 0]).fitExtent([[6, 6], [size.width - 6, size.height - 6]], { type: "FeatureCollection", features: own });
    const path = geoPath(projection).digits(1);
    const d = (g: Feature) => path(g) ?? undefined;
    const stateBounds = path.bounds({ type: "FeatureCollection", features: all });
    const [[x0, y0], [x1, y1]] = stateBounds;
    const minZoom = Math.min(1, 0.92 * Math.min(size.width / Math.max(1, x1 - x0), size.height / Math.max(1, y1 - y0)));
    // Static layers are one path each: the rest of the state's districts, and every precinct border
    // (each arc once, from the topology) in place of a stroke on every precinct.
    const join = (ds: (string | undefined)[]) => ds.filter(Boolean).join("") || undefined;
    return {
      restD: join(all.filter((f) => !ownSet.has(f)).map((f) => d(f))),
      bordersD: join(topos.map((t) => path(mesh(t, t.objects.pieces)) ?? undefined)),
      own: own.map((f) => ({ key: f.properties.code, d: d(f) })),
      mine: pieces.filter((p) => p.properties.k === 1).map((p) => ({ p, d: d(p) })),
      shared: pieces.filter((p) => p.properties.k === 0).map((p) => ({ p, d: d(p) })),
      stateBounds,
      minZoom,
    };
  }, [shapes, size, abbr]);

  const zoom = usePanZoom(size.width, size.height, 24, scene ? { minZoom: scene.minZoom, bounds: scene.stateBounds } : undefined);
  const [hovered, setHovered] = useState<{ pid: number; inside: boolean } | null>(null);
  const [selected, setSelected] = useState<{ pid: number; inside: boolean } | null>(null);
  const { onMouseMove, tooltipRef } = useMapTooltip(12, 8);

  const greyMessage = !up
    ? `Not on the ${year} ballot.`
    : margins.size > 0 ? `No ${year} ${chamberLabel.toLowerCase()} votes recorded in this precinct.`
    : `No ${year} precinct results on file for this district.`;
  const card = (h: { pid: number; inside: boolean }): CountyTooltipProps => {
    const ii = index ? h.pid - index.first : -1;
    const name = (index && index.names[ii]) || `Precinct ${h.pid}`;
    const county = index ? index.counties[index.county[ii]]?.[1] : "";
    const subtitle = county ? `${county}, ${abbr}` : stateName;
    if (!h.inside) return { kind: "message", title: name, subtitle, message: `Part of this precinct is outside ${districtLabel}.` };
    const row = rowsHere.get(h.pid);
    return row ? resultCard(name, subtitle, row, office) : { kind: "message", title: name, subtitle, message: greyMessage };
  };

  const patternId = `hatch-${abbr}-${chamber}-${normalizeDistrictKey(districtKey)}`;

  // The paths, memoized apart from hover, selection and zoom: a big-city district is well over a
  // thousand precincts, so they carry no handlers of their own (one set on their group reads
  // data-p / data-k) and no strokes (the borders are one path).
  const layers = useMemo(() => {
    if (!scene) return null;
    return (
      <>
        {scene.restD && <path d={scene.restD} fill="var(--map-unfilled)" fillOpacity={0.6} stroke="var(--app-text-very-muted)" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {/* The district itself, under its precincts: a sliver the precinct file left out is never a hole. */}
        {scene.own.map(({ key, d }) => <path key={`own-${key}`} d={d} fill="var(--map-unfilled)" stroke="none" pointerEvents="none" />)}
        <g>
          {scene.shared.map(({ p, d }, i) => <path key={`sh-${p.properties.p}-${i}`} d={d} fill={`url(#${patternId})`} data-p={p.properties.p} data-k={0} />)}
          {scene.mine.map(({ p, d }, i) => {
            const m = margins.get(p.properties.p);
            return <path key={`in-${p.properties.p}-${i}`} d={d} fill={m === undefined ? "var(--map-unfilled)" : getRaceColor(m)} data-p={p.properties.p} data-k={1} style={{ cursor: "pointer" }} />;
          })}
        </g>
        {scene.bordersD && <path d={scene.bordersD} fill="none" stroke="var(--app-bg)" strokeWidth={0.5} pointerEvents="none" vectorEffect="non-scaling-stroke" />}
        {scene.own.map(({ key, d }) => <path key={`line-${key}`} d={d} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" vectorEffect="non-scaling-stroke" />)}
      </>
    );
  }, [scene, margins, patternId]);

  const pieceAt = (t: EventTarget): { pid: number; inside: boolean } | null => {
    const el = t as Element;
    const pid = el.getAttribute?.("data-p");
    return pid ? { pid: Number(pid), inside: el.getAttribute("data-k") === "1" } : null;
  };
  const onPieceOver = (e: React.MouseEvent) => {
    const h = pieceAt(e.target);
    if (h && !wantNames) setWantNames(true);
    setHovered((cur) => (cur?.pid === h?.pid && cur?.inside === h?.inside ? cur : h));
  };
  const onPieceClick = (e: React.MouseEvent) => {
    const h = pieceAt(e.target);
    if (!h) return;
    if (!wantNames) setWantNames(true);
    setSelected((s) => (s?.pid === h.pid && s.inside === h.inside ? null : h));
  };

  const selectedD = selected?.inside ? scene?.mine.filter(({ p }) => p.properties.p === selected.pid).map(({ d }) => d).join(" ") : undefined;

  // Precincts drawn inside the district with a result: what the caption counts.
  const coloredCount = useMemo(() => new Set((scene?.mine ?? []).map(({ p }) => p.properties.p).filter((pid) => margins.has(pid))).size, [scene, margins]);
  const colored = coloredCount > 0;
  const caption = shapes?.missing
    ? "Precinct lines for this district are not available yet; the district is shown in outline."
    : colored
    ? `${year} ${chamberLabel} result by precinct: the margin between the parties' vote totals in each of ${coloredCount.toLocaleString("en-US")} precincts. Hatched: the part of a precinct beyond the district line.`
    : !up ? `2024 precincts. This seat is not on the ${year} ballot, so the precincts are left grey.`
    : precinctResults || hasResult ? `2024 precincts. They stay grey until a ${year} precinct-level return for this district is on file.`
    : `2024 precincts. They stay grey until ${year} precinct results are in.`;

  return (
    <div>
      <div ref={containerRef} className="relative" style={{ height, background: "var(--app-bg)" }} onMouseMove={onMouseMove}>
        {hovered && <CountyTooltip {...card(hovered)} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />}
        {shapes === null && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>Map unavailable.</div>}
        {scene && (
          <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`${districtLabel} by precinct`} {...zoom.svgProps}>
            <defs>
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--map-unfilled)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--app-text-very-muted)" strokeWidth="1.5" />
              </pattern>
            </defs>
            <g transform={zoom.transform} onMouseOver={onPieceOver} onMouseLeave={() => setHovered(null)} onClick={onPieceClick}>
              {layers}
              {selectedD && <path d={selectedD} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.5} pointerEvents="none" vectorEffect="non-scaling-stroke" />}
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
      <div className="px-1 pt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{caption}</div>
      {selected && (
        <div className="mt-2 px-1 py-3" style={{ borderTop: "1px solid var(--app-border)" }}>
          <CountyTooltip {...card(selected)} variant="panel" size="wide" aside={<CountyCardClose onClick={() => setSelected(null)} />} />
        </div>
      )}
    </div>
  );
}
