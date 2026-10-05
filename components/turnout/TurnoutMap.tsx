"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "@/components/ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useStaticJson } from "@/lib/useStaticJson";
import { FIPS_TO_STATE } from "@/lib/fips";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import {
  METRIC_LABEL, OFFICE_LABEL, OFFICE_SHORT, PROJECTION_COUNTY_URL, PROJECTION_YEAR, TURNOUT_LEVELS, TURNOUT_OFFICES,
  cycleTypeOf, turnoutSliceUrl, yearsForTurnoutLevel,
  type ProjectedRace, type ProjectionCountySlice, type TurnoutEntry, type TurnoutLevel, type TurnoutMetric, type TurnoutOffice, type TurnoutRace, type TurnoutSlice,
} from "@/lib/turnoutTypes";
import { DIVERGING, SEQUENTIAL, rampColor, scaleColor, type Scale } from "./turnoutColors";

// ── The turnout map ───────────────────────────────────────────────────────────
// One static slice per (level, year) from /api/turnout — the map only colors. Each metric has a
// fixed color domain so the same shade means the same thing in every year and at every level.

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const COUNTIES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const DEFAULT_CENTER: [number, number] = [-96.6, 38.7];

type MapView = { center: [number, number]; zoom: number };
type GeoFeature = { rsmKey: string; id?: string | number; properties?: Record<string, string | undefined> };
type DistrictGeoFeature = WindableGeography & { rsmKey: string; properties?: { GEOID?: string } };
const parseDistrictGeographies = (geographies: DistrictGeoFeature[]) => geographies.map(normalizeGeographyWinding);

const LEVEL_LABEL: Record<TurnoutLevel, string> = { state: "States", district: "Districts", county: "Counties" };
const METRICS: TurnoutMetric[] = ["rate", "votes", "ofTop", "change", "ofPriorPresidential", "projection"];
const PROJECTION_OFFICES: TurnoutOffice[] = ["senate", "governor", "house"];

/** Which metrics make sense for a year and office. */
function metricAllowed(metric: TurnoutMetric, year: number, office: TurnoutOffice): boolean {
  if (metric === "ofPriorPresidential") return cycleTypeOf(year) !== "presidential";
  if (metric === "change") return year >= 2020;
  if (metric === "ofTop") return office !== "president";
  if (metric === "projection") return office !== "president";
  return true;
}

/** Fixed domains: turnout rate 20–80% of CVAP; share of the top race 60–100; change ±15 pts;
 *  a midterm's electorate 55–95% of the presidential one; votes on a log scale set per slice. */
function scaleFor(metric: TurnoutMetric, level: TurnoutLevel, dark: boolean, votesRange: [number, number]): Scale {
  const seq = SEQUENTIAL[dark ? "dark" : "light"], div = DIVERGING[dark ? "dark" : "light"];
  switch (metric) {
    case "rate": return { kind: "sequential", min: level === "county" ? 20 : 30, max: level === "county" ? 80 : 75, ramp: seq };
    case "projection": return { kind: "sequential", min: level === "county" ? 20 : 30, max: level === "county" ? 70 : 65, ramp: seq };
    case "ofTop": return { kind: "sequential", min: 60, max: 100, ramp: seq };
    case "change": return { kind: "diverging", min: -15, max: 15, ramp: div };
    case "ofPriorPresidential": return { kind: "sequential", min: 55, max: 95, ramp: seq };
    case "votes": return { kind: "sequential", min: votesRange[0], max: votesRange[1], log: true, ramp: seq };
  }
}

function formatValue(metric: TurnoutMetric, v: number): string {
  if (metric === "votes") return v.toLocaleString();
  if (metric === "change") return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts`;
  return `${v.toFixed(1)}%`;
}

/** The number a geography is colored by. */
function metricValue(metric: TurnoutMetric, office: TurnoutOffice, entry: TurnoutEntry | undefined, proj: { votes: number; cvap: number | null } | undefined): number | null {
  if (metric === "projection") return proj && proj.cvap ? (proj.votes / proj.cvap) * 100 : null;
  if (!entry) return null;
  if (metric === "ofPriorPresidential") return entry.ofPriorPresidential;
  const r = entry.races[office];
  if (!r) return null;
  if (metric === "rate") return r.rate;
  if (metric === "votes") return r.votes;
  if (metric === "ofTop") return r.ofTop;
  return r.change;
}

type Selection = {
  key: string;
  title: string;
  subtitle: string;
  entry: TurnoutEntry | null;
  proj: { votes: number; low: number; high: number; cvap: number | null } | null;
  value: number | null;
  moreInfoHref: string | null;
};

// ── Geography layer ───────────────────────────────────────────────────────────
const GeoLayer = memo(function GeoLayer({ level, geographies, entries, projByKey, metric, office, scale, selectedKey, t, onHover, onSelect }: {
  level: TurnoutLevel;
  geographies: (GeoFeature | DistrictGeoFeature)[];
  entries: Record<string, TurnoutEntry>;
  projByKey: Record<string, { votes: number; low: number; high: number; cvap: number | null }>;
  metric: TurnoutMetric;
  office: TurnoutOffice;
  scale: Scale;
  selectedKey: string | null;
  t: Theme;
  onHover: (sel: Selection | null) => void;
  onSelect: (sel: Selection) => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const strokeW = level === "county" ? { base: 0.3, hover: 0.5, sel: 1.75 } : level === "district" ? { base: 0.4, hover: 0.8, sel: 1.75 } : { base: 0.5, hover: 1, sel: 2 };
  return (
    <>
      {geographies.map((geo) => {
        let key: string;
        if (level === "district") {
          const geoId = (geo as DistrictGeoFeature).properties?.GEOID;
          if (!isCongressionalDistrictGeoid(geoId)) return null;
          key = geoId;
        } else {
          key = String((geo as GeoFeature).id ?? "");
          if (level === "state") key = key.padStart(2, "0");
        }
        const entry = entries[key];
        const proj = projByKey[key];
        const value = metricValue(metric, office, entry, proj);
        const stateInfo = FIPS_TO_STATE[key.slice(0, 2)];
        const title = level === "county" ? (entry?.name ?? `${(geo as GeoFeature).properties?.name ?? ""} County`) : level === "district" ? (entry?.name ?? key) : (stateInfo?.name ?? key);
        const subtitle = level === "county" ? `${stateInfo?.name ?? ""} · FIPS ${key}` : level === "district" ? (stateInfo?.name ?? "") : "";
        const sel: Selection | null = entry || proj ? { key, title, subtitle, entry: entry ?? null, proj: proj ?? null, value, moreInfoHref: entry?.moreInfoHref ?? null } : null;
        const isSelected = selectedKey === key;
        const fill = value != null ? scaleColor(scale, value) : t.mapUnfilled;
        const handlers = {
          onClick: () => { if (!sel || Date.now() < ignoreClickUntilRef.current) return; onSelect(sel); },
          onPointerDown: (e: React.PointerEvent) => { if (e.pointerType !== "touch") { touchStartRef.current = null; return; } touchStartRef.current = { x: e.clientX, y: e.clientY }; },
          onPointerUp: (e: React.PointerEvent) => {
            if (!sel || e.pointerType !== "touch") return;
            const start = touchStartRef.current; touchStartRef.current = null;
            if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
            ignoreClickUntilRef.current = Date.now() + 500;
            onSelect(sel);
          },
        };
        return (
          <Geography key={geo.rsmKey} geography={geo} onMouseEnter={() => sel && onHover(sel)} onMouseLeave={() => onHover(null)} {...handlers}
            style={{
              default: { fill, stroke: isSelected ? t.hoverStroke : t.mapStroke, strokeWidth: isSelected ? strokeW.sel : strokeW.base, outline: "none" },
              hover: { fill, stroke: t.hoverStroke, strokeWidth: strokeW.hover, outline: "none", cursor: sel ? "pointer" : "default" },
              pressed: { fill, stroke: t.hoverStroke, strokeWidth: strokeW.sel, outline: "none" },
            }} />
        );
      })}
    </>
  );
});

const StateOutlines = memo(function StateOutlines({ t }: { t: Theme }) {
  const style = { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" as const };
  return (
    <Geographies geography={STATES_URL}>
      {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => <Geography key={geo.rsmKey} geography={geo} style={{ default: style, hover: style, pressed: style }} />)}
    </Geographies>
  );
});

// ── Selection details ─────────────────────────────────────────────────────────
function RaceRows({ entry, year, t, highlight }: { entry: TurnoutEntry; year: number; t: Theme; highlight: TurnoutOffice }) {
  const rows: { label: string; r: TurnoutRace; office: TurnoutOffice }[] = [];
  for (const office of TURNOUT_OFFICES) { const r = entry.races[office]; if (r) rows.push({ label: OFFICE_LABEL[office] + (r.special ? " (special)" : ""), r, office }); }
  if (entry.senateSpecial) rows.push({ label: "Senate (special)", r: entry.senateSpecial, office: "senate" });
  return (
    <div className="text-[10px]">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 pb-0.5 font-bold uppercase tracking-wide" style={{ color: t.textVeryMuted, fontSize: 8 }}>
        <span>{year}</span><span className="text-right">Votes</span><span className="text-right">% CVAP</span><span className="text-right">% top</span>
      </div>
      {rows.map(({ label, r, office }, i) => (
        <div key={label + i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 py-px tabular-nums" style={{ color: office === highlight ? t.textPrimary : t.textMuted, fontWeight: office === highlight ? 600 : 400 }}>
          <span className="truncate">{label}{r.firstRound ? "*" : ""}{r.uncontested === true ? " (unopposed)" : typeof r.uncontested === "number" && r.uncontested > 0 ? ` (${r.uncontested} unopposed)` : ""}</span>
          <span className="text-right">{r.votes == null ? "no count" : r.votes.toLocaleString()}</span>
          <span className="text-right">{r.rate == null ? "—" : `${r.rate.toFixed(1)}%`}</span>
          <span className="text-right">{r.ofTop == null ? "—" : `${r.ofTop.toFixed(0)}%`}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between" style={{ color: t.textVeryMuted }}>
        <span>CVAP {entry.cvap?.toLocaleString() ?? "—"}</span>
        {entry.ofPriorPresidential != null && cycleTypeOf(year) !== "presidential" && <span>{entry.ofPriorPresidential.toFixed(0)}% of the prior presidential electorate</span>}
      </div>
    </div>
  );
}

function ProjectionRows({ proj, office, t }: { proj: NonNullable<Selection["proj"]>; office: TurnoutOffice; t: Theme }) {
  return (
    <div className="text-[10px] tabular-nums" style={{ color: t.textMuted }}>
      <div className="flex justify-between"><span>Estimated {OFFICE_LABEL[office]} votes, {PROJECTION_YEAR}</span><span className="font-semibold" style={{ color: t.textPrimary }}>{proj.votes.toLocaleString()}</span></div>
      <div className="flex justify-between"><span>Range (2022-like · 2018-like)</span><span>{proj.low.toLocaleString()} – {proj.high.toLocaleString()}</span></div>
      <div className="flex justify-between"><span>Of CVAP (2020–24 ACS)</span><span>{proj.cvap ? `${((proj.votes / proj.cvap) * 100).toFixed(1)}%` : "—"}</span></div>
    </div>
  );
}

// ── The component ─────────────────────────────────────────────────────────────
export default function TurnoutMap({ theme: t, dark, projection }: { theme: Theme; dark: boolean; projection: ProjectedRace[] }) {
  const [level, setLevel] = useState<TurnoutLevel>("state");
  const [metric, setMetric] = useState<TurnoutMetric>("rate");
  const [office, setOffice] = useState<TurnoutOffice>("president");
  const [year, setYear] = useState<number>(2024);
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [mapView, setMapView] = useState<MapView>({ center: DEFAULT_CENTER, zoom: 1 });
  const [viewChanged, setViewChanged] = useState(false);
  const settledViewRef = useRef<MapView>({ center: DEFAULT_CENTER, zoom: 1 });
  const gestureRef = useRef<{ startX: number; startY: number; startK: number; lastX: number; lastY: number; lastK: number } | null>(null);
  const { onMouseMove: onTooltipMove, tooltipRef: attachTooltip } = useMapTooltip(14, 8);

  const isProjection = metric === "projection";
  const years = yearsForTurnoutLevel(level);
  const offices = isProjection ? PROJECTION_OFFICES : TURNOUT_OFFICES;

  // Keep the selection consistent when a control changes: a year without the office falls back.
  function pickLevel(l: TurnoutLevel) { setLevel(l); if (!yearsForTurnoutLevel(l).includes(year)) setYear(yearsForTurnoutLevel(l)[yearsForTurnoutLevel(l).length - 1]); setSelected(null); setHovered(null); }
  function pickMetric(m: TurnoutMetric) {
    setMetric(m);
    let o = office, y = year;
    if (m === "projection" && o === "president") o = "house";
    if (m === "ofTop" && o === "president") o = "house";
    if (m === "ofPriorPresidential" && cycleTypeOf(y) === "presidential") y = 2022;
    if (m === "change" && y < 2020) y = 2020;
    if (o === "president" && y % 4 !== 0) y = 2024;
    setOffice(o); setYear(y); setSelected(null);
  }
  function pickOffice(o: TurnoutOffice) {
    setOffice(o);
    if (o === "president" && (year % 4 !== 0 || metric === "ofTop")) { setYear(2024); if (metric === "ofTop" || metric === "ofPriorPresidential") setMetric("rate"); }
    setSelected(null);
  }
  function pickYear(y: number) { setYear(y); if (office === "president" && y % 4 !== 0) setOffice("house"); if (metric === "ofPriorPresidential" && y % 4 === 0) setMetric("rate"); if (metric === "change" && y < 2020) setMetric("rate"); setSelected(null); }
  function resetView() { const reset = { center: DEFAULT_CENTER, zoom: 1 }; settledViewRef.current = reset; setMapView(reset); setViewChanged(false); }

  const { data: slice, loading } = useStaticJson<TurnoutSlice>(isProjection ? null : turnoutSliceUrl(level, year));
  const { data: countyProj } = useStaticJson<ProjectionCountySlice>(isProjection && level === "county" ? PROJECTION_COUNTY_URL : null);
  const entries = useMemo(() => slice?.entries ?? {}, [slice]);

  // Projection values keyed like the geography ids.
  const projByKey = useMemo(() => {
    const out: Record<string, { votes: number; low: number; high: number; cvap: number | null }> = {};
    if (!isProjection) return out;
    const stateFips: Record<string, string> = Object.fromEntries(Object.entries(FIPS_TO_STATE).map(([f, s]) => [s.abbr, f]));
    if (level === "state") {
      for (const r of projection) {
        if (r.office !== office) continue;
        const k = stateFips[r.state];
        const cur = out[k] ?? { votes: 0, low: 0, high: 0, cvap: null as number | null };
        // A state with two Senate races (a special alongside the regular one) keeps the larger; House sums its districts.
        if (office === "house") { cur.votes += r.votes; cur.low += r.low; cur.high += r.high; cur.cvap = (cur.cvap ?? 0) + (r.cvap ?? 0); }
        else if (r.votes > cur.votes) { cur.votes = r.votes; cur.low = r.low; cur.high = r.high; cur.cvap = r.cvap; }
        out[k] = cur;
      }
    } else if (level === "district") {
      for (const r of projection) {
        if (r.office !== "house") continue;
        const id = r.id.slice(2);
        out[id] = { votes: r.votes, low: r.low, high: r.high, cvap: r.cvap };
        if (id.endsWith("01") && !projection.some((o) => o.id === `H-${id.slice(0, 2)}02`)) out[id.slice(0, 2) + "00"] = out[id];
      }
    } else if (countyProj) {
      for (const [fips, e] of Object.entries(countyProj.entries)) {
        const o = office as Exclude<TurnoutOffice, "president">;
        if (e.votes[o] == null) continue;
        out[fips] = { votes: e.votes[o]!, low: e.low[o] ?? e.votes[o]!, high: e.high[o] ?? e.votes[o]!, cvap: e.cvap };
      }
    }
    return out;
  }, [isProjection, level, office, projection, countyProj]);

  const votesRange = useMemo<[number, number]>(() => {
    let lo = Infinity, hi = 0;
    for (const e of Object.values(entries)) { const v = e.races[office]?.votes; if (v != null && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    return lo === Infinity ? [1, 10] : [lo, hi];
  }, [entries, office]);
  const scale = useMemo(() => scaleFor(metric, level, dark, votesRange), [metric, level, dark, votesRange]);

  // Chyron: the national figure for the current view.
  const chyron = useMemo(() => {
    if (isProjection) {
      // Summed from the race list, not the keyed map (at-large districts carry two keys).
      let tot = 0;
      if (office === "house") tot = projection.filter((r) => r.office === "house").reduce((s, r) => s + r.votes, 0);
      else { const best = new Map<string, number>(); for (const r of projection) if (r.office === office) best.set(r.state, Math.max(best.get(r.state) ?? 0, r.votes)); for (const v of best.values()) tot += v; }
      return { label: `${PROJECTION_YEAR} estimate · ${OFFICE_LABEL[office]}`, value: tot ? tot.toLocaleString() : "—", sub: tot ? "votes" : "" };
    }
    if (!slice) return { label: "Loading…", value: "", sub: "" };
    const v = slice.national.votes[office], r = slice.national.rate[office];
    if (metric === "votes") return { label: `${year} ${OFFICE_LABEL[office]} · national`, value: v?.toLocaleString() ?? "—", sub: "votes" };
    return { label: `${year} ${OFFICE_LABEL[office]} · national`, value: r != null ? `${r.toFixed(1)}%` : "—", sub: "of CVAP, where held" };
  }, [isProjection, projection, office, slice, metric, year]);

  const districtGeoUrl = isProjection ? getCongressionalDistrictsGeoUrl(PROJECTION_YEAR) : getCongressionalDistrictsGeoUrl(year);
  const onHover = useCallback((sel: Selection | null) => setHovered(sel), []);
  const onSelect = useCallback((sel: Selection) => setSelected((cur) => (cur?.key === sel.key ? null : sel)), []);
  const selectedKey = selected?.key ?? null;
  const shownYear = isProjection ? PROJECTION_YEAR : year;

  const controls = (compact: boolean) => (
    <>
      <Group label="Show" compact={compact}>{TURNOUT_LEVELS.map((l) => <Pill key={l} on={l === level} onClick={() => pickLevel(l)} t={t}>{LEVEL_LABEL[l]}</Pill>)}</Group>
      <Sep t={t} />
      <Group label="Metric" compact={compact}>{METRICS.map((m) => <Pill key={m} on={m === metric} onClick={() => pickMetric(m)} t={t}>{METRIC_LABEL[m]}</Pill>)}</Group>
      <Sep t={t} />
      <Group label="Office" compact={compact}>{offices.map((o) => <Pill key={o} on={o === office} onClick={() => pickOffice(o)} t={t} disabled={!isProjection && !metricAllowed(metric, year, o) && o === "president"}>{OFFICE_SHORT[o]}</Pill>)}</Group>
      {!isProjection && (
        <>
          <Sep t={t} />
          <Group label="Year" compact={compact}>{years.filter((y) => office !== "president" || y % 4 === 0).filter((y) => metricAllowed(metric, y, office)).map((y) => <Pill key={y} on={y === year} onClick={() => pickYear(y)} t={t}>{y}</Pill>)}</Group>
        </>
      )}
      {viewChanged && (<><Sep t={t} /><button onClick={resetView} className="text-xs font-semibold" style={{ color: t.textMuted }}>Reset</button></>)}
    </>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Mobile controls */}
      <div className="flex items-center gap-2.5 overflow-x-auto rounded-xl px-3 py-2 scrollbar-none md:hidden" style={{ background: t.legendBg, border: `1px solid ${t.border}` }}>{controls(true)}</div>

      <div className="relative h-[380px] w-full overflow-hidden rounded-xl md:h-[min(640px,calc(100vh-200px))] md:min-h-[500px]" style={{ background: t.bg }} onMouseMove={onTooltipMove}>
        {hovered && (
          <div ref={attachTooltip} className="hidden md:block absolute z-20 pointer-events-none rounded-lg" style={{ width: 240, padding: "6px 8px", background: t.panel, border: `1px solid ${t.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-[11px]" style={{ color: t.textPrimary }}>{hovered.title}</span>
              <span className="font-bold shrink-0 tabular-nums" style={{ fontSize: 14, color: t.textPrimary }}>{hovered.value != null ? formatValue(metric, hovered.value) : "—"}</span>
            </div>
            {hovered.subtitle && <div className="text-[9px]" style={{ color: t.textMuted }}>{hovered.subtitle}</div>}
            <div className="mt-1">
              {isProjection && hovered.proj ? <ProjectionRows proj={hovered.proj} office={office} t={t} /> : hovered.entry ? <RaceRows entry={hovered.entry} year={shownYear} t={t} highlight={office} /> : null}
            </div>
          </div>
        )}

        <ComposableMap width={975} height={610} projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <ZoomableGroup center={mapView.center} zoom={mapView.zoom} minZoom={0.8} filterZoomEvent={filterMapZoomEvent}
            onMoveStart={() => { gestureRef.current = null; }}
            onMove={({ x, y, zoom: k }: { x: number; y: number; zoom: number }) => {
              if (!gestureRef.current) gestureRef.current = { startX: x, startY: y, startK: k, lastX: x, lastY: y, lastK: k };
              else { gestureRef.current.lastX = x; gestureRef.current.lastY = y; gestureRef.current.lastK = k; }
            }}
            onMoveEnd={({ coordinates, zoom }: { coordinates: [number, number] | null; zoom: number }) => {
              const valid = coordinates && coordinates.length === 2 && coordinates.every(Number.isFinite);
              const g = gestureRef.current; gestureRef.current = null;
              if (!valid || !Number.isFinite(zoom)) return;
              const dist = g ? Math.hypot(g.lastX - g.startX, g.lastY - g.startY) : 0, dz = g ? Math.abs(g.lastK - g.startK) : 0;
              if (dist < 4 && dz < 0.001) { setMapView({ center: coordinates, zoom }); requestAnimationFrame(() => setMapView(settledViewRef.current)); return; }
              const next = { center: coordinates, zoom }; settledViewRef.current = next; setMapView(next);
              setViewChanged(zoom !== 1 || Math.abs(coordinates[0] - DEFAULT_CENTER[0]) > 0.001 || Math.abs(coordinates[1] - DEFAULT_CENTER[1]) > 0.001);
            }}>
            {level === "county" && (
              <>
                <Geographies geography={COUNTIES_URL}>{({ geographies }: { geographies: GeoFeature[] }) => <GeoLayer level="county" geographies={geographies} entries={entries} projByKey={projByKey} metric={metric} office={office} scale={scale} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />}</Geographies>
                <StateOutlines t={t} />
              </>
            )}
            {level === "district" && (
              <>
                <Geographies key={districtGeoUrl} geography={districtGeoUrl} parseGeographies={parseDistrictGeographies}>{({ geographies }: { geographies: DistrictGeoFeature[] }) => <GeoLayer level="district" geographies={geographies} entries={entries} projByKey={projByKey} metric={metric} office={office} scale={scale} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />}</Geographies>
                <StateOutlines t={t} />
              </>
            )}
            {level === "state" && (
              <>
                <Geographies geography={STATES_URL}>{({ geographies }: { geographies: GeoFeature[] }) => <GeoLayer level="state" geographies={geographies} entries={entries} projByKey={projByKey} metric={metric} office={office} scale={scale} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />}</Geographies>
                <StateOutlines t={t} />
              </>
            )}
          </ZoomableGroup>
        </ComposableMap>

        {/* Desktop toolbar */}
        <div className="hidden md:flex absolute z-10 max-w-[78%] flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-2 backdrop-blur-sm" style={{ top: 0, left: 0, background: t.legendBg, border: `1px solid ${t.border}` }}>{controls(false)}</div>

        {/* Chyron */}
        <div className="hidden md:block absolute z-10 rounded-xl px-3 py-2 text-right backdrop-blur-sm" style={{ top: 0, right: 0, background: t.legendBg, border: `1px solid ${t.border}` }}>
          <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>{loading && !isProjection ? "Loading…" : chyron.label}</div>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.4rem", lineHeight: 1.15, color: t.textPrimary }}>{chyron.value}</div>
          {chyron.sub && <div className="text-[9px]" style={{ color: t.textMuted }}>{chyron.sub}</div>}
        </div>

        {viewChanged && <button onClick={resetView} className="md:hidden absolute z-10 rounded-lg px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm" style={{ top: "0.6rem", left: "0.6rem", background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted }}>Reset</button>}

        {/* Selected panel */}
        {selected && (
          <div className="hidden md:block absolute z-20 rounded-xl p-2.5 backdrop-blur-sm" style={{ bottom: "1rem", right: "1rem", width: 280, background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 12px 28px rgba(0,0,0,0.25)" }}>
            <div className="mb-1.5 flex items-start justify-between gap-2 pb-1.5" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.title}</div>
                {selected.subtitle && <div className="mt-0.5 truncate text-[10px]" style={{ color: t.textMuted }}>{selected.subtitle}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-base font-extrabold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: t.textPrimary }}>{selected.value != null ? formatValue(metric, selected.value) : "—"}</span>
                <button onClick={() => setSelected(null)} aria-label="Close selection" style={{ color: t.textVeryMuted }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {isProjection && selected.proj ? <ProjectionRows proj={selected.proj} office={office} t={t} /> : selected.entry ? <RaceRows entry={selected.entry} year={shownYear} t={t} highlight={office} /> : null}
            {selected.moreInfoHref && <a href={selected.moreInfoHref} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: t.textPrimary }}>More info →</a>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-[10px]" style={{ color: t.textMuted }}>
        <span className="font-semibold">{isProjection ? `${PROJECTION_YEAR} estimated ${OFFICE_LABEL[office]} turnout, % of CVAP` : `${METRIC_LABEL[metric]}${metric === "ofPriorPresidential" ? "" : ` · ${OFFICE_LABEL[office]}`}, ${year}`}</span>
        <span className="tabular-nums">{metric === "votes" ? votesRange[0].toLocaleString() : formatValue(metric, scale.min)}</span>
        <span className="h-2.5 w-40 rounded-sm" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((x) => rampColor(scale.ramp, x)).join(", ")})` }} />
        <span className="tabular-nums">{metric === "votes" ? votesRange[1].toLocaleString() : formatValue(metric, scale.max)}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.mapUnfilled }} />no race / no count</span>
      </div>

      {/* Mobile selection */}
      {selected && (
        <div className="md:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="truncate text-[13px] font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.title}</div>{selected.subtitle && <div className="truncate text-[9px]" style={{ color: t.textMuted }}>{selected.subtitle}</div>}</div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-sm font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: t.textPrimary }}>{selected.value != null ? formatValue(metric, selected.value) : "—"}</span>
              <button onClick={() => setSelected(null)} className="-m-1 p-1" style={{ color: t.textVeryMuted }} aria-label="Close selection"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          <div className="mt-1.5">{isProjection && selected.proj ? <ProjectionRows proj={selected.proj} office={office} t={t} /> : selected.entry ? <RaceRows entry={selected.entry} year={shownYear} t={t} highlight={office} /> : null}</div>
        </div>
      )}
    </div>
  );
}

function Group({ label, compact, children }: { label: string; compact: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-1.5 ${compact ? "shrink-0" : ""}`}>
      <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{label}</span>
      {children}
    </div>
  );
}
function Sep({ t }: { t: Theme }) { return <span className="h-4 w-px shrink-0" style={{ background: t.border }} />; }
function Pill({ on, onClick, t, children, disabled }: { on: boolean; onClick: () => void; t: Theme; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="shrink-0 pb-0.5 text-xs font-semibold whitespace-nowrap" aria-pressed={on}
      style={on ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: disabled ? t.textVeryMuted : t.textMuted }}>{children}</button>
  );
}
