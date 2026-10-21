"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import Segmented from "@/components/MarketSegmented";
import Dropdown from "./Dropdown";
import CountyTooltip, { CountyCardClose, CountyCardLink } from "@/components/CountyTooltip";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "@/components/ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useStaticJson } from "@/lib/useStaticJson";
import { FIPS_TO_STATE } from "@/lib/fips";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import {
  METRIC_LABEL, OFFICE_LABEL, PROJECTION_COUNTY_URL, PROJECTION_YEAR, TURNOUT_LEVELS, TURNOUT_OFFICES,
  cycleTypeOf, turnoutSliceUrl, yearsForTurnoutLevel,
  type ProjectedRace, type ProjectionCountySlice, type TurnoutEntry, type TurnoutLevel, type TurnoutMapView, type TurnoutMetric, type TurnoutOffice, type TurnoutSlice,
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

const fmtCompact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));
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
// The popups show only the metric on the map: its value for the place, and one short note
// giving the raw numbers behind it (the votes and eligible citizens, or the estimate's range).
const fmtVotes = (v: number | null | undefined) => (v == null ? "no count" : v.toLocaleString());
function metricNote(metric: TurnoutMetric, office: TurnoutOffice, sel: Selection, year: number): string {
  if (metric === "projection") {
    const p = sel.proj;
    return p ? `${p.votes.toLocaleString()} votes (${p.low.toLocaleString()}–${p.high.toLocaleString()})${p.cvap ? ` of ${p.cvap.toLocaleString()} eligible` : ""}` : "";
  }
  const e = sel.entry;
  if (!e) return "";
  if (metric === "ofPriorPresidential") return `${fmtVotes(e.races[office]?.votes)} ${OFFICE_LABEL[office]} votes in ${year}`;
  const r = e.races[office];
  if (!r) return "";
  const flags = `${r.firstRound ? " (first round)" : ""}${r.uncontested === true ? " (unopposed)" : typeof r.uncontested === "number" && r.uncontested > 0 ? ` (${r.uncontested} unopposed)` : ""}`;
  if (metric === "rate") return `${fmtVotes(r.votes)} of ${e.cvap?.toLocaleString() ?? "—"} eligible${flags}`;
  if (metric === "votes") return `${r.rate == null ? "—" : `${r.rate.toFixed(1)}%`} of ${e.cvap?.toLocaleString() ?? "—"} eligible${flags}`;
  if (metric === "ofTop") return `${fmtVotes(r.votes)} votes${flags}`;
  return `${r.rate == null ? "—" : `${r.rate.toFixed(1)}%`} of eligible in ${year}${flags}`;
}

// ── The component ─────────────────────────────────────────────────────────────
export default function TurnoutMap({ theme: t, dark, projection, view, onViewChange }: { theme: Theme; dark: boolean; projection: ProjectedRace[]; view: TurnoutMapView; onViewChange: (v: TurnoutMapView) => void }) {
  const { level, metric, office, year } = view;
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
  const change = (next: Partial<TurnoutMapView>) => { onViewChange({ ...view, ...next }); setSelected(null); setHovered(null); };
  function pickLevel(l: TurnoutLevel) { const ys = yearsForTurnoutLevel(l); change({ level: l, year: ys.includes(year) ? year : ys[ys.length - 1] }); }
  function pickMetric(m: TurnoutMetric) {
    let o = office, y = year;
    if (m === "projection" && o === "president") o = "house";
    if (m === "ofTop" && o === "president") o = "house";
    if (m === "ofPriorPresidential" && cycleTypeOf(y) === "presidential") y = 2022;
    if (m === "change" && y < 2020) y = 2020;
    if (o === "president" && y % 4 !== 0) y = 2024;
    change({ metric: m, office: o, year: y });
  }
  function pickOffice(o: TurnoutOffice) {
    let y = year, m = metric;
    if (o === "president" && (year % 4 !== 0 || metric === "ofTop")) { y = 2024; if (metric === "ofTop" || metric === "ofPriorPresidential") m = "rate"; }
    change({ office: o, year: y, metric: m });
  }
  function pickYear(y: number) {
    let o = office, m = metric;
    if (o === "president" && y % 4 !== 0) o = "house";
    if (m === "ofPriorPresidential" && y % 4 === 0) m = "rate";
    if (m === "change" && y < 2020) m = "rate";
    change({ year: y, office: o, metric: m });
  }
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
      return { label: `${PROJECTION_YEAR} estimate · ${OFFICE_LABEL[office]}`, value: tot ? `${(tot / 1e6).toFixed(0)} million` : "—", sub: tot ? "votes" : "" };
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

  // The control row, the one-sentence summary and the legend sit above the map, as on /analysis/polling-misses.
  const yearOptions = years.filter((y) => office !== "president" || y % 4 === 0).filter((y) => metricAllowed(metric, y, office)).map((y) => [y, String(y)] as [number, string]);
  const officeOptions = offices.filter((o) => isProjection || o !== "president" || metricAllowed(metric, year, o)).map((o) => [o, OFFICE_LABEL[o]] as [TurnoutOffice, string]);
  const legend = (
    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label={`Map legend: ${isProjection ? `${PROJECTION_YEAR} estimated ${OFFICE_LABEL[office]} turnout` : METRIC_LABEL[metric]}`}>
      <span className="tabular-nums">{metric === "votes" ? fmtCompact(votesRange[0]) : formatValue(metric, scale.min)}</span>
      <span className="inline-block h-2 w-28" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((x) => rampColor(scale.ramp, x)).join(", ")})` }} />
      <span className="tabular-nums">{metric === "votes" ? fmtCompact(votesRange[1]) : formatValue(metric, scale.max)}</span>
      <span className="ml-1 flex items-center gap-1"><span className="inline-block h-2 w-3.5" style={{ background: t.mapUnfilled }} />No race / no count</span>
    </div>
  );
  const metricName = isProjection ? `${PROJECTION_YEAR} estimate` : METRIC_LABEL[metric];
  const card = (sel: Selection) => ({
    kind: "figure" as const,
    title: sel.title,
    subtitle: sel.subtitle || undefined,
    label: metricName,
    value: sel.value != null ? formatValue(metric, sel.value) : null,
    note: metricNote(metric, office, sel, shownYear) || undefined,
  });
  const placeNoun = level === "state" ? "state" : level === "district" ? "House district" : "county";

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex w-full justify-center sm:w-auto"><Segmented label="Show" value={level} onChange={pickLevel} options={TURNOUT_LEVELS.map((l) => [l, LEVEL_LABEL[l]] as [TurnoutLevel, string])} /></div>
        <Dropdown label="Metric" value={metric} onChange={(v) => pickMetric(v as TurnoutMetric)} options={METRICS.map((m) => [m, METRIC_LABEL[m]])} />
        <Dropdown label="Race" value={office} onChange={(v) => pickOffice(v as TurnoutOffice)} options={officeOptions} />
        {!isProjection && <Dropdown label="Year" value={String(year)} onChange={(v) => pickYear(Number(v))} options={yearOptions.map(([y, l]) => [String(y), l])} />}
        {/* on phones the legend moves down between the summary and the map */}
        <div className="hidden sm:ml-auto sm:block">{legend}</div>
      </div>

      <p className="mb-5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        {isProjection ? (
          <>For {PROJECTION_YEAR} we expect about <b style={{ color: "var(--app-text-primary)" }}>{chyron.value}</b> {OFFICE_LABEL[office]} votes nationwide, shown here as each {placeNoun}&rsquo;s estimated turnout as a share of its eligible citizens.</>
        ) : loading || !slice ? "Loading…" : metric === "votes" ? (
          <>In {year}, <b style={{ color: "var(--app-text-primary)" }}>{chyron.value}</b> votes were cast for {OFFICE_LABEL[office]} nationwide, where the race was held; the map shades each {placeNoun} by its count.</>
        ) : metric === "ofPriorPresidential" ? (
          <>Each {placeNoun}&rsquo;s {year} electorate as a share of its {year - 2} presidential electorate. Nationwide, <b style={{ color: "var(--app-text-primary)" }}>{chyron.value}</b> of eligible citizens voted for {OFFICE_LABEL[office]} in {year}.</>
        ) : (
          <>{METRIC_LABEL[metric]} for {OFFICE_LABEL[office]} in {year}, by {placeNoun}. Nationwide, <b style={{ color: "var(--app-text-primary)" }}>{chyron.value}</b> of eligible citizens voted for {OFFICE_LABEL[office]}, where the race was held.</>
        )}
        {" "}Select a {placeNoun} for its figures.
      </p>

      <div className="mb-4 sm:hidden">{legend}</div>

      <div className="relative mx-4 aspect-[5/3] max-h-[620px] overflow-hidden rounded-xl sm:mx-12 lg:mx-32" onMouseMove={onTooltipMove}>
        {hovered && !selected && <CountyTooltip {...card(hovered)} boxRef={attachTooltip} className="absolute z-20 hidden md:block" />}

        <ComposableMap width={800} height={480} projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <ZoomableGroup center={mapView.center} zoom={mapView.zoom} minZoom={1} filterZoomEvent={filterMapZoomEvent}
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

        {viewChanged && (
          <button type="button" onClick={resetView} className="absolute bottom-3 left-3 z-10 rounded-lg px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>Reset view</button>
        )}

        {selected && (
          <div className="absolute z-30 hidden rounded-xl backdrop-blur-sm md:block" style={{ bottom: "1rem", right: "1rem", width: 220, padding: "8px 10px", background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 12px 28px rgba(0,0,0,0.25)" }}>
            <CountyTooltip {...card(selected)} variant="card" aside={<CountyCardClose onClick={() => setSelected(null)} label="Close selection" />}
              footer={selected.moreInfoHref ? <CountyCardLink href={selected.moreInfoHref}>More info →</CountyCardLink> : undefined} />
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-3 md:hidden">
          <CountyTooltip {...card(selected)} variant="panel" aside={<CountyCardClose onClick={() => setSelected(null)} label="Close selection" small />}
            footer={selected.moreInfoHref ? <CountyCardLink href={selected.moreInfoHref}>More info →</CountyCardLink> : undefined} />
        </div>
      )}
    </div>
  );
}
