"use client";

// The explorer: one set of controls driving one map, one ledger, one table and one detail panel.
// Modes: Results (a year + office), Swing (two year+office pairs), Demographics (a census metric),
// Targeting (campaign metrics). Universe: today's precinct lines (older years crosswalked, marked
// ≈) or each year's original lines. Level: precincts or subdivisions (townships / cities).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useDarkMode } from "@/lib/useDarkMode";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import type { OfficeKey, PrecinctDistrictData } from "@/lib/precinctDistrict/types";
import type { DistrictProjection } from "@/lib/precinctDistrict/project";
import { currentEra, eraOfYear, marginOf, pctD, subdivisionName as subName, topOfTicket } from "@/lib/precinctDistrict/aggregate";
import {
  MARGIN_LEGEND, TARGET_METRICS, TARGET_METRIC_BY_KEY, defaultBaseline, divergingColor, fmtInt, fmtMargin, fmtPct1,
  marginColorVar, needsCrosswalk, officeCandidates, officeLabelFull, officeShort, officesOf, precinctRows, rowsFor,
  sequentialColor, sequentialStops, subdivisionRows, swingByUnit, targetingRows, targetingContext,
  type ExplorerRow, type Level, type Mode, type TargetMetricKey, type Universe,
} from "@/lib/precinctDistrict/explorer";
import { DEMO_METRICS, DEMO_METRIC_BY_KEY, popWeightedMetric, type DemoMetricKey } from "@/lib/precinctDistrict/demographics";
import ExplorerMap, { type PrecinctFC } from "./ExplorerMap";
import ExplorerTable, { type Column } from "./ExplorerTable";
import SubdivisionLedger, { type LedgerRow } from "./SubdivisionLedger";
import PrecinctPanel from "./PrecinctPanel";

const StreetMap = dynamic(() => import("./StreetMap"), { ssr: false, loading: () => <div className="flex items-center justify-center rounded-xl text-sm" style={{ height: "min(70vh, 560px)", background: "var(--app-panel)", color: "var(--app-text-muted)" }}>Loading streets…</div> });

type Renderer = "svg" | "street";

const MODES: { id: Mode; label: string }[] = [
  { id: "results", label: "Results" },
  { id: "swing", label: "Swing" },
  { id: "demographics", label: "Demographics" },
  { id: "targeting", label: "Targeting" },
  { id: "projection", label: "2026 projection" },
];

function Pill({ active, onClick, children, muted, title }: { active: boolean; onClick: () => void; children: ReactNode; muted?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
      style={active
        ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
        : { background: "transparent", color: muted ? "var(--app-text-very-muted)" : "var(--app-text-muted)", border: "1px solid transparent" }}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ border: "1px solid var(--app-border)" }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          title={o.title}
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
          style={value === o.id ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>{children}</span>;
}

export default function PrecinctExplorer({ data, projection }: { data: PrecinctDistrictData; projection?: DistrictProjection | null }) {
  const { config, results } = data;
  const darkMode = useDarkMode();
  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const years = useMemo(() => [...config.years].sort((a, b) => b - a), [config.years]);
  const cur = currentEra(config);

  const [mode, setMode] = useState<Mode>("results");
  const [yearSel, setYearSel] = useState<number>(years[0]);
  const [officeSel, setOfficeSel] = useState<OfficeKey>(() => {
    const yr = results.years[String(years[0])];
    return yr.offices.sthouse ? "sthouse" : (topOfTicket(yr) ?? officesOf(yr)[0]);
  });
  const [compare, setCompare] = useState<{ year: number; office: OfficeKey } | null>(() => defaultBaseline(data, years[0], "sthouse"));
  const [universe, setUniverse] = useState<Universe>("current");
  const [level, setLevel] = useState<Level>("precinct");
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [demoMetric, setDemoMetric] = useState<DemoMetricKey>("pct_college");
  const [targetMetric, setTargetMetric] = useState<TargetMetricKey>("gap");
  const [renderer, setRenderer] = useState<Renderer>("svg");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showVotes, setShowVotes] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const [showTurnout, setShowTurnout] = useState(true);
  const [search, setSearch] = useState("");
  const [scenario, setScenario] = useState<string>(projection?.scenarios[0]?.id ?? "");
  const modes = projection ? MODES : MODES.filter((m) => m.id !== "projection");
  const [geo, setGeo] = useState<Record<string, PrecinctFC>>({});

  // Demographics are one snapshot of today's precincts, the same whichever election you are
  // looking at, so that mode offers no year or race: it reads the latest year, and the result
  // column beside the census figures is this district's own race.
  const demoMode = mode === "demographics";
  const latestYr = results.years[String(years[0])];
  const year = demoMode ? years[0] : yearSel;
  const office: OfficeKey = demoMode
    ? (latestYr.offices.sthouse ? "sthouse" : (topOfTicket(latestYr) ?? officeSel))
    : officeSel;
  const yr = results.years[String(year)];
  const offices = officesOf(yr);

  // Which lines the map draws. Swing across eras and the demographic / targeting modes only
  // exist on today's lines, so those force the current universe.
  const crossEra = mode === "swing" && compare != null && eraOfYear(config, compare.year).id !== eraOfYear(config, year).id;
  const universeLocked = demoMode || mode === "targeting" || mode === "projection" || crossEra || level === "subdivision";
  const effUniverse: Universe = universeLocked ? "current" : universe;
  const mapEra = effUniverse === "original" ? eraOfYear(config, year) : cur;
  // Areas draws the precincts dissolved into townships and cities, so the map shows subdivision
  // outlines rather than precinct ones; districts built before that layer existed fall back.
  const mapLayer = level === "subdivision" && mapEra.geographySubdivisions ? `${mapEra.id}:sub` : mapEra.id;
  const fc = geo[mapLayer] ?? null;

  useEffect(() => {
    const layers: [string, string][] = config.eras.flatMap((era) => [
      [era.id, era.geography] as [string, string],
      ...(era.geographySubdivisions ? [[`${era.id}:sub`, era.geographySubdivisions] as [string, string]] : []),
    ]);
    for (const [key, url] of layers) {
      if (geo[key]) continue;
      fetch(url).then((r) => r.json()).then((json: PrecinctFC) => setGeo((g) => ({ ...g, [key]: json }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.eras]);

  // Keep office and baseline valid when the year changes.
  function pickYear(y: number) {
    setYearSel(y);
    const ny = results.years[String(y)];
    let o = office;
    if (!ny.offices[o]) { o = ny.offices.sthouse ? "sthouse" : (topOfTicket(ny) ?? officesOf(ny)[0]); setOfficeSel(o); }
    setCompare(defaultBaseline(data, y, o));
    setSelected(null);
  }
  function pickOffice(o: OfficeKey) {
    setOfficeSel(o);
    if (mode === "swing" || !compare || !results.years[String(compare.year)]?.offices[compare.office]) setCompare(defaultBaseline(data, year, o));
  }

  // ── Rows on screen ──────────────────────────────────────────────────────────
  const rows = useMemo(() => rowsFor(data, year, effUniverse, level), [data, year, effUniverse, level]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const compareRows = useMemo(() => (compare ? rowsFor(data, compare.year, effUniverse, level) : []), [data, compare, effUniverse, level]);
  const swing = useMemo(() => (compare ? swingByUnit(rows, office, compareRows, compare.office) : new Map()), [rows, office, compareRows, compare]);
  const targeting = useMemo(() => new Map(targetingRows(data, level).map((r) => [r.id, r])), [data, level]);
  const tctx = useMemo(() => targetingContext(data), [data]);
  const demoMetricDef = DEMO_METRIC_BY_KEY[demoMetric];
  const targetDef = TARGET_METRIC_BY_KEY[targetMetric];
  const currentIds = useMemo(() => precinctRows(data, Math.max(...cur.years), "current"), [data, cur.years]);

  // 2026 projection per unit under the chosen turnout scenario (precinct, or subdivision sum)
  const projUnits = useMemo(() => {
    const out = new Map<string, { base: number | null; projected: number | null; ballots: number; d: number; r: number }>();
    if (!projection) return out;
    const acc = new Map<string, { ballots: number; d: number; r: number; baseNum: number; baseDen: number }>();
    for (const p of projection.precincts) {
      const key = level === "subdivision" ? p.sub : p.id;
      const b = p.ballots[scenario] ?? 0;
      const two = b * p.twoPartyRate;
      const e = acc.get(key) ?? { ballots: 0, d: 0, r: 0, baseNum: 0, baseDen: 0 };
      e.ballots += b;
      if (p.projected != null) { const dShare = (1 - p.projected / 100) / 2; e.d += two * dShare; e.r += two * (1 - dShare); }
      if (p.base != null) { e.baseNum += p.base * two; e.baseDen += two; }
      acc.set(key, e);
    }
    for (const [k, e] of acc) out.set(k, { ballots: e.ballots, d: e.d, r: e.r, projected: e.d + e.r > 0 ? ((e.r - e.d) / (e.d + e.r)) * 100 : null, base: e.baseDen > 0 ? e.baseNum / e.baseDen : null });
    return out;
  }, [projection, level, scenario]);
  const scenarioDef = projection?.scenarios.find((s) => s.id === scenario) ?? projection?.scenarios[0] ?? null;

  const demoRowsFor = useCallback((unit: string) => (
    level === "subdivision"
      ? currentIds.filter((p) => p.sub === unit).map((p) => data.demographics.precincts[p.id]).filter(Boolean)
      : [data.demographics.precincts[unit]].filter(Boolean)
  ), [level, currentIds, data.demographics.precincts]);

  const valueFor = useCallback((unit: string): number | null => {
    switch (mode) {
      case "results": { const r = rowById.get(unit); return r?.races[office] ? marginOf(r.races[office]) : null; }
      case "swing": return swing.get(unit)?.swing ?? null;
      case "demographics": return popWeightedMetric(demoRowsFor(unit), demoMetricDef);
      case "targeting": return targeting.get(unit)?.[targetMetric] ?? null;
      case "projection": return projUnits.get(unit)?.projected ?? null;
    }
  }, [mode, rowById, office, swing, demoRowsFor, demoMetricDef, targeting, targetMetric, projUnits]);

  const colorFor = useCallback((unit: string): string | null => {
    const v = valueFor(unit);
    if (mode === "results" || mode === "swing" || mode === "projection") return divergingColor(v);
    if (mode === "demographics") return sequentialColor(v, demoMetricDef.domain, darkMode);
    return targetDef.kind === "diverging" ? divergingColor(v) : sequentialColor(v, targetDef.domain ?? [0, 1], darkMode);
  }, [valueFor, mode, demoMetricDef, targetDef, darkMode]);

  const formatValue = useCallback((v: number | null): string => {
    if (v == null) return "—";
    if (mode === "results" || mode === "swing" || mode === "projection") return fmtMargin(v);
    if (mode === "demographics") return demoMetricDef.format(v);
    return targetDef.format(v);
  }, [mode, demoMetricDef, targetDef]);

  const valueColor = useCallback((v: number | null): string => {
    if (mode === "results" || mode === "swing" || mode === "projection" || (mode === "targeting" && targetDef.kind === "diverging")) return marginColorVar(v);
    return "var(--app-text-primary)";
  }, [mode, targetDef]);

  const unitOf = useCallback((p: { id: string; subdivision: string }) => (level === "subdivision" ? p.subdivision : p.id), [level]);
  const isDimmed = useCallback((unit: string) => {
    if (!subFilter) return false;
    if (level === "subdivision") return unit !== subFilter;
    return rowById.get(unit)?.sub !== subFilter;
  }, [subFilter, level, rowById]);

  // ── District-level readout ─────────────────────────────────────────────────
  const visibleRows = useMemo(() => rows.filter((r) => !subFilter || (level === "subdivision" ? r.id === subFilter : r.sub === subFilter)), [rows, subFilter, level]);
  const readout = useMemo((): { value: number | null; text: string } => {
    const scope = subFilter ? subName(config, subFilter) : config.shortName;
    if (mode === "results") {
      let d = 0, r = 0;
      for (const p of visibleRows) { const v = p.races[office]; if (v) { d += v.d; r += v.r; } }
      const m = d + r > 0 ? ((r - d) / (d + r)) * 100 : null;
      return { value: m, text: `${year} ${officeLabelFull(yr, office)} · ${scope} · D ${fmtInt(d)} · R ${fmtInt(r)}` };
    }
    if (mode === "swing" && compare) {
      const cy = results.years[String(compare.year)];
      let da = 0, ra = 0, db = 0, rb = 0;
      for (const p of visibleRows) { const v = p.races[office]; if (v) { da += v.d; ra += v.r; } }
      const cvis = compareRows.filter((r) => !subFilter || (level === "subdivision" ? r.id === subFilter : r.sub === subFilter));
      for (const p of cvis) { const v = p.races[compare.office]; if (v) { db += v.d; rb += v.r; } }
      const ma = da + ra > 0 ? ((ra - da) / (da + ra)) * 100 : null;
      const mb = db + rb > 0 ? ((rb - db) / (db + rb)) * 100 : null;
      return { value: ma != null && mb != null ? ma - mb : null, text: `shift from ${compare.year} ${officeLabelFull(cy, compare.office)} (${fmtMargin(mb)}) to ${year} ${officeLabelFull(yr, office)} (${fmtMargin(ma)}) · ${scope}${crossEra ? " · on today's lines, estimated" : ""}` };
    }
    if (mode === "demographics") {
      const ids = subFilter ? currentIds.filter((p) => p.sub === subFilter) : currentIds;
      const v = popWeightedMetric(ids.map((p) => data.demographics.precincts[p.id]).filter(Boolean), demoMetricDef);
      return { value: v, text: `${demoMetricDef.label} · ${scope} · population-weighted · 2020 Census and ACS, one snapshot of today's precincts` };
    }
    if (mode === "projection" && projection) {
      let d = 0, r = 0, b = 0;
      for (const p of projection.precincts) {
        if (subFilter && p.sub !== subFilter) continue;
        const bb = p.ballots[scenario] ?? 0; const two = bb * p.twoPartyRate; b += bb;
        if (p.projected != null) { const dS = (1 - p.projected / 100) / 2; d += two * dS; r += two * (1 - dS); }
      }
      const m = d + r > 0 ? ((r - d) / (d + r)) * 100 : null;
      const dn = config.election2026?.candidates?.d?.name ?? "D"; const rn = config.election2026?.candidates?.r?.name ?? "R";
      return { value: m, text: `projected 2026 State House · ${scope} · ${scenarioDef?.label ?? ""} · ${fmtInt(b)} ballots · ${dn} ${fmtInt(d)} · ${rn} ${fmtInt(r)} · ${fmtInt(Math.abs(r - d))} net votes separate them` };
    }
    const tr = [...targeting.values()].filter((r) => !subFilter || (level === "subdivision" ? r.id === subFilter : r.sub === subFilter));
    let v: number | null = null;
    if (targetMetric === "persuadable") v = tr.reduce((s, r) => s + (r.persuadable ?? 0), 0);
    else {
      let num = 0, den = 0;
      for (const r of tr) { const x = r[targetMetric]; if (x != null) { num += x * r.ballots; den += r.ballots; } }
      v = den > 0 ? num / den : null;
    }
    return { value: v, text: `${targetDef.label} · ${scope} · ${targetMetric === "persuadable" ? "sum" : "ballot-weighted"} · ${targetDef.describe}` };
  }, [mode, visibleRows, office, year, yr, compare, compareRows, results.years, subFilter, level, config, crossEra, currentIds, data.demographics.precincts, demoMetricDef, targeting, targetMetric, targetDef, projection, scenario, scenarioDef]);

  // ── Ledger ─────────────────────────────────────────────────────────────────
  const ledger = useMemo((): LedgerRow[] => {
    const subs = subdivisionRows(data, year);
    const compSubs = compare ? new Map(subdivisionRows(data, compare.year).map((r) => [r.id, r])) : null;
    const tsubs = new Map(targetingRows(data, "subdivision").map((r) => [r.id, r]));
    const projSubs = new Map<string, { d: number; r: number }>();
    if (projection) for (const p of projection.precincts) {
      if (p.projected == null) continue;
      const two = (p.ballots[scenario] ?? 0) * p.twoPartyRate; const dS = (1 - p.projected / 100) / 2;
      const e = projSubs.get(p.sub) ?? { d: 0, r: 0 }; e.d += two * dS; e.r += two * (1 - dS); projSubs.set(p.sub, e);
    }
    return subs.map((s) => {
      let v: number | null = null;
      if (mode === "results") v = s.races[office] ? marginOf(s.races[office]) : null;
      else if (mode === "projection") { const e = projSubs.get(s.id); v = e && e.d + e.r > 0 ? ((e.r - e.d) / (e.d + e.r)) * 100 : null; }
      else if (mode === "swing" && compare && compSubs) {
        const b = compSubs.get(s.id);
        const ma = s.races[office] ? marginOf(s.races[office]) : null;
        const mb = b?.races[compare.office] ? marginOf(b.races[compare.office]!) : null;
        v = ma != null && mb != null ? ma - mb : null;
      } else if (mode === "demographics") v = popWeightedMetric(currentIds.filter((p) => p.sub === s.id).map((p) => data.demographics.precincts[p.id]).filter(Boolean), demoMetricDef);
      else v = tsubs.get(s.id)?.[targetMetric] ?? null;
      const swatch = mode === "results" || mode === "swing" || mode === "projection" || (mode === "targeting" && targetDef.kind === "diverging")
        ? divergingColor(v)
        : sequentialColor(v, mode === "demographics" ? demoMetricDef.domain : (targetDef.domain ?? [0, 1]), darkMode);
      return { id: s.id, name: subName(config, s.id), count: s.count ?? 0, ballots: s.ballots, valueLabel: formatValue(v), valueColor: valueColor(v), swatch };
    });
  }, [data, year, compare, mode, office, currentIds, demoMetricDef, targetMetric, targetDef, darkMode, config, formatValue, valueColor, projection, scenario]);

  // ── Panel helpers (always on today's lines) ─────────────────────────────────
  const panelRowsCache = useMemo(() => new Map<number, ExplorerRow[]>(), [data, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsByYearFor = useCallback((y: number) => {
    let r = panelRowsCache.get(y);
    if (!r) { r = rowsFor(data, y, "current", level); panelRowsCache.set(y, r); }
    return r;
  }, [panelRowsCache, data, level]);
  const rowFor = useCallback((y: number, id: string) => rowsByYearFor(y).find((r) => r.id === id), [rowsByYearFor]);

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const renderTooltip = useCallback((unit: string): ReactNode => {
    const name = level === "subdivision" ? subName(config, unit) : unit;
    const r = rowById.get(unit);
    const head = (
      <div className="mb-1.5">
        <div className="text-[12px] font-bold uppercase tracking-[0.04em]" style={{ color: t.textPrimary }}>{name}</div>
        {level === "precinct" && r && <div className="text-[10.5px]" style={{ color: t.textMuted }}>{subName(config, r.sub)} · {fmtInt(r.ballots)} ballots{r.estimated ? " · ≈ estimated" : ""}</div>}
      </div>
    );
    if (mode === "results" && r) {
      const v = r.races[office];
      const m = v ? marginOf(v) : null;
      return (
        <>
          {head}
          <div className="text-[10.5px]" style={{ color: t.textMuted }}>{year} {officeLabelFull(yr, office)}</div>
          {v ? (
            <div className="mt-1 grid grid-cols-[auto_auto_1fr] items-end gap-x-3">
              <div><div className="text-[12px] font-semibold" style={{ color: t.demText }}>D {fmtInt(v.d)}</div><div className="text-[10.5px]" style={{ color: t.demText }}>{fmtPct1(pctD(v))}</div></div>
              <div><div className="text-[12px] font-semibold" style={{ color: t.repText }}>R {fmtInt(v.r)}</div><div className="text-[10.5px]" style={{ color: t.repText }}>{pctD(v) == null ? "—" : fmtPct1(100 - (pctD(v) as number))}</div></div>
              <div className="text-right text-[15px] font-bold" style={{ color: m == null ? t.textMuted : m > 0 ? t.repText : t.demText }}>{fmtMargin(m)}</div>
            </div>
          ) : <div className="text-[11px]" style={{ color: t.textMuted }}>no race</div>}
        </>
      );
    }
    if (mode === "swing" && compare) {
      const s = swing.get(unit);
      const cy = results.years[String(compare.year)];
      return (
        <>
          {head}
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
            <span style={{ color: t.textMuted }}>{compare.year} {officeShort(cy, compare.office)}</span><b style={{ color: s?.b == null ? t.textMuted : s.b > 0 ? t.repText : t.demText }}>{fmtMargin(s?.b ?? null)}</b>
            <span style={{ color: t.textMuted }}>{year} {officeShort(yr, office)}</span><b style={{ color: s?.a == null ? t.textMuted : s.a > 0 ? t.repText : t.demText }}>{fmtMargin(s?.a ?? null)}</b>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between pt-1.5" style={{ borderTop: "1px solid var(--app-border)" }}>
            <span className="text-[10.5px]" style={{ color: t.textMuted }}>Shift</span>
            <b className="text-[15px]" style={{ color: s?.swing == null ? t.textMuted : s.swing > 0 ? t.repText : t.demText }}>{s?.swing == null ? "—" : `${fmtMargin(s.swing)}`}</b>
          </div>
        </>
      );
    }
    if (mode === "demographics") {
      const d = demoRowsFor(unit);
      return (
        <>
          {head}
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
            <span style={{ color: t.textMuted }}>Population</span><b style={{ color: t.textPrimary }}>{fmtInt(d.reduce((s, x) => s + (x.total_pop ?? 0), 0))}</b>
            {DEMO_METRICS.filter((m) => [demoMetric, "pct_white", "pct_college", "med_income", "avg_age"].includes(m.key)).map((m) => {
              const v = popWeightedMetric(d, m);
              return <FragmentRow key={m.key} label={m.label} value={v == null ? "—" : m.format(v)} strong={m.key === demoMetric} t={t} />;
            })}
          </div>
        </>
      );
    }
    if (mode === "projection") {
      const u = projUnits.get(unit);
      return (
        <>
          {head}
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
            <FragmentRow label={`${projection?.baseline.year ?? ""} baseline`} value={fmtMargin(u?.base ?? null)} t={t} color={u?.base == null ? t.textPrimary : u.base > 0 ? t.repText : t.demText} />
            <FragmentRow label="Projected 2026" value={fmtMargin(u?.projected ?? null)} strong t={t} color={u?.projected == null ? t.textPrimary : u.projected > 0 ? t.repText : t.demText} />
            <FragmentRow label={scenarioDef?.label ?? "ballots"} value={fmtInt(u?.ballots)} t={t} />
            <FragmentRow label={config.election2026?.candidates?.d?.name ?? "D"} value={fmtInt(u?.d)} t={t} color={t.demText} />
            <FragmentRow label={config.election2026?.candidates?.r?.name ?? "R"} value={fmtInt(u?.r)} t={t} color={t.repText} />
          </div>
        </>
      );
    }
    const tr = targeting.get(unit);
    return (
      <>
        {head}
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
          {TARGET_METRICS.map((m) => {
            const v = tr?.[m.key] ?? null;
            return <FragmentRow key={m.key} label={m.short} value={v == null ? "—" : m.format(v)} strong={m.key === targetMetric} t={t} color={m.kind === "diverging" ? (v == null ? t.textPrimary : v > 0 ? t.repText : t.demText) : undefined} />;
          })}
        </div>
        {tr?.estimated && <div className="mt-1 text-[10px]" style={{ color: t.textMuted }}>drop-off / trend use ≈ estimated older years</div>}
      </>
    );
  }, [level, config, rowById, t, mode, office, year, yr, compare, swing, results.years, demoRowsFor, demoMetric, targeting, targetMetric, projUnits, projection, scenarioDef]);

  const tooltipHtml = useCallback((unit: string): string => {
    const name = level === "subdivision" ? subName(config, unit) : unit;
    const v = valueFor(unit);
    const color = mode === "results" || mode === "swing" || mode === "projection" || (mode === "targeting" && targetDef.kind === "diverging") ? (v == null ? t.textMuted : v > 0 ? t.repText : t.demText) : t.textPrimary;
    return `<div style="background:${t.panel};border:1px solid ${t.border};border-radius:8px;padding:10px 12px;min-width:180px;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.3)"><div style="font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${t.textPrimary};margin-bottom:4px">${name}</div><div style="font-size:11px;color:${t.textMuted}">${readoutLabel(mode, year, yr, office, compare ? results.years[String(compare.year)] : null, compare, demoMetricDef.label, targetDef.label)}</div><div style="font-size:16px;font-weight:700;color:${color};margin-top:4px">${formatValue(v)}</div></div>`;
  }, [level, config, valueFor, mode, targetDef, t, year, yr, office, compare, results.years, demoMetricDef.label, formatValue]);

  // ── Legend ─────────────────────────────────────────────────────────────────
  const legend = useMemo((): ReactNode => {
    const diverging = mode === "results" || mode === "swing" || mode === "projection" || (mode === "targeting" && targetDef.kind === "diverging");
    if (diverging) {
      return (
        <div>
          <div className="mb-1 font-semibold">{mode === "swing" ? "Shift toward" : mode === "targeting" ? targetDef.short : mode === "projection" ? "Projected 2026 margin" : "Margin"}</div>
          <div className="flex items-center gap-0.5">{MARGIN_LEGEND.map((l) => <span key={l.label} title={l.label} style={{ width: 14, height: 8, background: l.color, display: "inline-block" }} />)}</div>
          <div className="flex justify-between" style={{ width: 14 * 8 + 7 }}><span>D+15</span><span>even</span><span>R+15</span></div>
        </div>
      );
    }
    const dom = mode === "demographics" ? demoMetricDef.domain : (targetDef.domain ?? [0, 1]);
    const fmt = mode === "demographics" ? demoMetricDef.format : targetDef.format;
    return (
      <div>
        <div className="mb-1 font-semibold">{mode === "demographics" ? demoMetricDef.label : targetDef.short}</div>
        <div className="flex items-center gap-0.5">{sequentialStops(darkMode).map((c) => <span key={c} style={{ width: 16, height: 8, background: c, display: "inline-block" }} />)}</div>
        <div className="flex justify-between" style={{ width: 16 * 7 + 6 }}><span>{fmt(dom[0])}</span><span>{fmt(dom[1])}+</span></div>
      </div>
    );
  }, [mode, targetDef, demoMetricDef, darkMode]);

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns = useMemo((): Column<ExplorerRow>[] => {
    const cols: Column<ExplorerRow>[] = [];
    const num = (v: number | null | undefined, f: (x: number) => string, color?: (x: number) => string) =>
      v == null ? <span style={{ color: "var(--app-text-very-muted)" }}>—</span> : <span style={{ color: color ? color(v) : undefined }}>{f(v)}</span>;
    const mcol = (v: number | null) => (v == null ? "var(--app-text-very-muted)" : v > 0 ? "var(--party-rep)" : v < 0 ? "var(--party-dem)" : "var(--app-text-muted)");
    if (mode === "results") {
      if (showTurnout) {
        cols.push({ key: "ballots", label: "Ballots", group: "Turnout", sortValue: (r) => r.ballots, render: (r) => num(r.ballots, (x) => fmtInt(x)) });
        cols.push({ key: "reg", label: "Reg.", group: "Turnout", sortValue: (r) => r.reg, render: (r) => num(r.reg, (x) => fmtInt(x)), hideOnMobile: true });
        cols.push({ key: "turnout", label: "Turnout", group: "Turnout", sortValue: (r) => (r.reg > 0 ? (r.ballots / r.reg) * 100 : null), render: (r) => num(r.reg > 0 ? (r.ballots / r.reg) * 100 : null, fmtPct1) });
      }
      offices.forEach((o, i) => {
        const g = officeShort(yr, o);
        const first = i === 0 || cols.length === 0;
        if (showVotes) {
          cols.push({ key: `${o}_d`, label: "D", group: g, borderLeft: !first || showTurnout, color: "var(--party-dem)", sortValue: (r) => r.races[o]?.d ?? null, render: (r) => num(r.races[o]?.d, (x) => fmtInt(x), () => "var(--party-dem)") });
          cols.push({ key: `${o}_r`, label: "R", group: g, color: "var(--party-rep)", sortValue: (r) => r.races[o]?.r ?? null, render: (r) => num(r.races[o]?.r, (x) => fmtInt(x), () => "var(--party-rep)") });
        }
        if (showPct) {
          cols.push({ key: `${o}_dp`, label: "D%", group: g, borderLeft: !showVotes && (!first || showTurnout), color: "var(--party-dem)", sortValue: (r) => (r.races[o] ? pctD(r.races[o]) : null), render: (r) => num(r.races[o] ? pctD(r.races[o]) : null, fmtPct1, () => "var(--party-dem)") });
          cols.push({ key: `${o}_rp`, label: "R%", group: g, color: "var(--party-rep)", sortValue: (r) => (r.races[o] ? 100 - (pctD(r.races[o]) ?? 0) : null), render: (r) => num(r.races[o] && pctD(r.races[o]) != null ? 100 - (pctD(r.races[o]) as number) : null, fmtPct1, () => "var(--party-rep)") });
        }
        cols.push({ key: `${o}_m`, label: "Margin", group: g, borderLeft: !showVotes && !showPct && (!first || showTurnout), sortValue: (r) => (r.races[o] ? marginOf(r.races[o]) : null), render: (r) => <b>{num(r.races[o] ? marginOf(r.races[o]) : null, fmtMargin, mcol)}</b> });
      });
      return cols;
    }
    if (mode === "swing" && compare) {
      const cy = results.years[String(compare.year)];
      cols.push({ key: "ballots", label: `${year} ballots`, sortValue: (r) => r.ballots, render: (r) => num(r.ballots, (x) => fmtInt(x)), hideOnMobile: true });
      cols.push({ key: "b", label: `${compare.year} ${officeShort(cy, compare.office)}`, borderLeft: true, sortValue: (r) => swing.get(r.id)?.b ?? null, render: (r) => num(swing.get(r.id)?.b, fmtMargin, mcol) });
      cols.push({ key: "a", label: `${year} ${officeShort(yr, office)}`, sortValue: (r) => swing.get(r.id)?.a ?? null, render: (r) => num(swing.get(r.id)?.a, fmtMargin, mcol) });
      cols.push({ key: "swing", label: "Shift", borderLeft: true, sortValue: (r) => swing.get(r.id)?.swing ?? null, render: (r) => <b>{num(swing.get(r.id)?.swing, fmtMargin, mcol)}</b> });
      return cols;
    }
    if (mode === "demographics") {
      cols.push({ key: "pop", label: "Pop.", sortValue: (r) => demoRowsFor(r.id).reduce((s, d) => s + (d.total_pop ?? 0), 0), render: (r) => num(demoRowsFor(r.id).reduce((s, d) => s + (d.total_pop ?? 0), 0), (x) => fmtInt(x)) });
      let lastGroup = "";
      for (const m of DEMO_METRICS) {
        const groupLabel = m.group === "race" ? "Race / ethnicity" : m.group === "age" ? "Age" : m.group === "education" ? "Education" : "Income";
        cols.push({ key: m.key, label: m.short, group: groupLabel, borderLeft: lastGroup !== m.group, sortValue: (r) => popWeightedMetric(demoRowsFor(r.id), m), render: (r) => { const v = popWeightedMetric(demoRowsFor(r.id), m); return <span style={{ fontWeight: m.key === demoMetric ? 700 : 400 }}>{v == null ? "—" : m.format(v)}</span>; }, hideOnMobile: !["pct_white", "pct_college", "med_income", "pct_65plus"].includes(m.key) && m.key !== demoMetric });
        lastGroup = m.group;
      }
      cols.push({ key: "margin", label: `${year} ${officeShort(yr, office)}`, group: "Result", borderLeft: true, sortValue: (r) => (r.races[office] ? marginOf(r.races[office]) : null), render: (r) => <b>{num(r.races[office] ? marginOf(r.races[office]) : null, fmtMargin, mcol)}</b> });
      return cols;
    }
    if (mode === "projection" && projection) {
      const dn = config.election2026?.candidates?.d?.name?.split(" ").pop() ?? "D";
      const rn = config.election2026?.candidates?.r?.name?.split(" ").pop() ?? "R";
      cols.push({ key: "base", label: `${projection.baseline.year} baseline`, sortValue: (r) => projUnits.get(r.id)?.base ?? null, render: (r) => num(projUnits.get(r.id)?.base, fmtMargin, mcol) });
      cols.push({ key: "proj", label: "Projected", sortValue: (r) => projUnits.get(r.id)?.projected ?? null, render: (r) => <b>{num(projUnits.get(r.id)?.projected, fmtMargin, mcol)}</b> });
      cols.push({ key: "pballots", label: "Ballots", group: scenarioDef?.label, borderLeft: true, sortValue: (r) => projUnits.get(r.id)?.ballots ?? null, render: (r) => num(projUnits.get(r.id)?.ballots, (x) => fmtInt(x)) });
      cols.push({ key: "pd", label: dn, group: scenarioDef?.label, color: "var(--party-dem)", sortValue: (r) => projUnits.get(r.id)?.d ?? null, render: (r) => num(projUnits.get(r.id)?.d, (x) => fmtInt(x), () => "var(--party-dem)") });
      cols.push({ key: "pr", label: rn, group: scenarioDef?.label, color: "var(--party-rep)", sortValue: (r) => projUnits.get(r.id)?.r ?? null, render: (r) => num(projUnits.get(r.id)?.r, (x) => fmtInt(x), () => "var(--party-rep)") });
      cols.push({ key: "pnet", label: "Net", group: scenarioDef?.label, sortValue: (r) => { const u = projUnits.get(r.id); return u ? u.r - u.d : null; }, render: (r) => { const u = projUnits.get(r.id); const v = u ? u.r - u.d : null; return num(v, (x) => `${x > 0 ? "R" : "D"}+${fmtInt(Math.abs(x))}`, (x) => (x > 0 ? "var(--party-rep)" : "var(--party-dem)")); } });
      return cols;
    }
    // targeting
    cols.push({ key: "ballots", label: `${tctx.year} ballots`, sortValue: (r) => r.ballots, render: (r) => num(r.ballots, (x) => fmtInt(x)), hideOnMobile: true });
    for (const m of TARGET_METRICS) {
      cols.push({
        key: m.key, label: m.short, borderLeft: m.key === "floor" || m.key === "gap" || m.key === "dropoff",
        sortValue: (r) => targeting.get(r.id)?.[m.key] ?? null,
        render: (r) => { const v = targeting.get(r.id)?.[m.key] ?? null; return <span style={{ fontWeight: m.key === targetMetric ? 700 : 400 }}>{num(v, m.format, m.kind === "diverging" ? mcol : undefined)}</span>; },
        hideOnMobile: !["persuadable", "gap", targetMetric].includes(m.key),
      });
    }
    return cols;
  }, [mode, showTurnout, showVotes, showPct, offices, yr, compare, results.years, year, office, swing, demoRowsFor, demoMetric, tctx.year, targeting, targetMetric, projection, projUnits, scenarioDef, config.election2026]);

  const tableRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return visibleRows.filter((r) => !q || r.id.toUpperCase().includes(q) || subName(config, r.sub).toUpperCase().includes(q));
  }, [visibleRows, search, config]);

  const nameOf = useCallback((r: ExplorerRow) => (level === "subdivision" ? subName(config, r.id) : r.id), [level, config]);
  const subNameOf = useCallback((r: ExplorerRow) => subName(config, r.sub), [config]);

  const universeNote = needsCrosswalk(config, year) || (compare && needsCrosswalk(config, compare.year))
    ? (effUniverse === "current" ? `Older years shown on ${cur.label}, estimated by 2020 block population (≈)` : `Showing ${eraOfYear(config, year).label} exactly as counted`)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Mode tabs + level / renderer */}
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="flex min-w-0 items-end gap-5 overflow-x-auto pb-2.5 scrollbar-none">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setSelected(null); if (m.id === "swing" && !compare) setCompare(defaultBaseline(data, year, office)); }}
              className="shrink-0 whitespace-nowrap text-sm font-semibold transition-colors"
              style={mode === m.id
                ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: -1 }
                : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: -1 }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Segmented value={level} onChange={(v) => { setLevel(v); setSelected(null); }} options={[{ id: "precinct", label: "Precincts" }, { id: "subdivision", label: "Areas", title: "Townships, cities and villages" }]} />
          <Segmented value={renderer} onChange={setRenderer} options={[{ id: "svg", label: "Map" }, { id: "street", label: "Streets" }]} />
        </div>
      </div>

      {/* Context pills */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {mode === "projection" && projection && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Turnout</Label>{projection.scenarios.map((s) => <Pill key={s.id} active={scenario === s.id} onClick={() => setScenario(s.id)}>{s.label}</Pill>)}</div>
        )}
        {mode !== "targeting" && mode !== "projection" && !demoMode && (
          <>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Year</Label>{years.map((y) => <Pill key={y} active={year === y} onClick={() => pickYear(y)}>{y}</Pill>)}</div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Race</Label>{offices.map((o) => <Pill key={o} active={office === o} onClick={() => pickOffice(o)} title={officeCandidates(yr, o) ?? undefined}>{officeShort(yr, o)}</Pill>)}</div>
          </>
        )}
        {mode === "swing" && compare && (
          <>
            <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs</span>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              <Label>Baseline</Label>
              {years.filter((y) => y !== year).map((y) => (
                <Pill key={y} active={compare.year === y} onClick={() => { const cy = results.years[String(y)]; const o = cy.offices[compare.office] ? compare.office : cy.offices[office] ? office : (topOfTicket(cy) ?? officesOf(cy)[0]); setCompare({ year: y, office: o }); }}>{y}</Pill>
              ))}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {officesOf(results.years[String(compare.year)]).map((o) => <Pill key={o} active={compare.office === o} onClick={() => setCompare({ year: compare.year, office: o })}>{officeShort(results.years[String(compare.year)], o)}</Pill>)}
            </div>
          </>
        )}
        {mode === "demographics" && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Metric</Label>{DEMO_METRICS.map((m) => <Pill key={m.key} active={demoMetric === m.key} onClick={() => setDemoMetric(m.key)}>{m.short}</Pill>)}</div>
        )}
        {mode === "targeting" && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Metric</Label>{TARGET_METRICS.map((m) => <Pill key={m.key} active={targetMetric === m.key} onClick={() => setTargetMetric(m.key)} title={m.describe}>{m.short}</Pill>)}</div>
        )}
        {universeNote && (
          <div className="ml-auto flex items-center gap-2">
            {!universeLocked && (
              <Segmented value={effUniverse} onChange={setUniverse} options={[{ id: "current", label: cur.label }, { id: "original", label: "Original lines" }]} />
            )}
          </div>
        )}
      </div>

      {/* Readout */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: valueColor(readout.value) }}>{formatValue(readout.value)}</span>
        <span className="min-w-0 text-xs" style={{ color: "var(--app-text-muted)" }}>{readout.text}</span>
        {subFilter && (
          <button onClick={() => setSubFilter(null)} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            {subName(config, subFilter)} ✕
          </button>
        )}
        {universeNote && <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{universeNote}</span>}
      </div>

      {/* Ledger · Map · Panel */}
      <div className="mt-4 grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)_270px] xl:grid-cols-[210px_minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <SubdivisionLedger
            rows={ledger}
            active={subFilter}
            onToggle={(id) => { setSubFilter(id); setSelected(null); }}
            valueHeader={mode === "results" ? `${year} ${officeShort(yr, office)}` : mode === "swing" ? "Shift" : mode === "demographics" ? demoMetricDef.short : mode === "projection" ? "2026 proj." : targetDef.short}
            totalRow={{ label: config.shortName, valueLabel: subFilter ? "" : formatValue(readout.value), valueColor: valueColor(readout.value), ballots: 0, count: rows.length }}
          />
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          {renderer === "street" && fc ? (
            <StreetMap fc={fc} unitOf={unitOf} colorFor={colorFor} isDimmed={isDimmed} selectedUnit={selected} onSelect={setSelected} tooltipHtml={tooltipHtml} darkMode={darkMode} styleKey={`${mapLayer}-${mode}-${year}-${office}-${compare?.year}-${compare?.office}-${demoMetric}-${targetMetric}-${level}-${subFilter}`} />
          ) : (
            <ExplorerMap fc={fc} unitOf={unitOf} colorFor={colorFor} isDimmed={isDimmed} hoveredUnit={hovered} selectedUnit={selected} onHover={setHovered} onSelect={setSelected} renderTooltip={renderTooltip} legend={legend} darkMode={darkMode} />
          )}
        </div>
        <div className="order-3">
          <PrecinctPanel
            data={data}
            unitId={selected ?? (level === "precinct" ? null : null)}
            level={level}
            rowFor={rowFor}
            rowsByYearFor={rowsByYearFor}
            activeYear={year}
            activeOffice={office}
            onClear={() => setSelected(null)}
            subdivisionName={(id) => subName(config, id)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              id="precinct-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={level === "subdivision" ? "Find an area…" : "Find a precinct…"}
              className="rounded-md px-2.5 py-1 text-[12px]"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)", width: 180 }}
            />
            <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{tableRows.length} of {rows.length} {level === "subdivision" ? "areas" : "precincts"}</span>
          </div>
          {mode === "results" && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <button onClick={() => setShowTurnout((v) => !v)} className="font-semibold hover:underline" style={{ color: showTurnout ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{showTurnout ? "Hide" : "Show"} turnout</button>
              <span style={{ color: "var(--app-border)" }}>·</span>
              <button onClick={() => setShowVotes((v) => !v)} className="font-semibold hover:underline" style={{ color: showVotes ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{showVotes ? "Hide" : "Show"} votes</button>
              <span style={{ color: "var(--app-border)" }}>·</span>
              <button onClick={() => setShowPct((v) => !v)} className="font-semibold hover:underline" style={{ color: showPct ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{showPct ? "Hide" : "Show"} percentages</button>
            </div>
          )}
        </div>
        <ExplorerTable
          rows={tableRows}
          columns={columns}
          nameOf={nameOf}
          subNameOf={subNameOf}
          showSub={level === "precinct"}
          hoveredId={hovered}
          selectedId={selected}
          onHover={setHovered}
          onSelect={setSelected}
          defaultSort={mode === "targeting" ? { key: targetMetric, dir: "desc" } : mode === "projection" ? { key: "proj", dir: "asc" } : undefined}
        />
      </div>
    </div>
  );
}

function FragmentRow({ label, value, strong, t, color }: { label: string; value: string; strong?: boolean; t: typeof DARK_THEME; color?: string }) {
  return (
    <>
      <span style={{ color: t.textMuted, fontWeight: strong ? 600 : 400 }}>{label}</span>
      <b style={{ color: color ?? t.textPrimary, fontWeight: strong ? 700 : 600 }}>{value}</b>
    </>
  );
}

function readoutLabel(mode: Mode, year: number, yr: { offices: Record<string, { label: string }> }, office: string, cy: { offices: Record<string, { label: string }> } | null, compare: { year: number; office: string } | null, demoLabel: string, targetLabel: string): string {
  if (mode === "results") return `${year} ${yr.offices[office]?.label ?? office}`;
  if (mode === "swing" && compare && cy) return `shift · ${compare.year} ${cy.offices[compare.office]?.label ?? compare.office} → ${year} ${yr.offices[office]?.label ?? office}`;
  if (mode === "demographics") return demoLabel;
  if (mode === "projection") return "projected 2026 State House margin";
  return targetLabel;
}
