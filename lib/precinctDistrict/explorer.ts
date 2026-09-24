// The explorer's model: which rows are on screen for a given year / universe / level, how swing
// and targeting metrics are computed, and how values map to colors. Pure functions so the
// header, tests and the client explorer all agree.

import { getRaceColor, fmtMargin } from "@/lib/colorScale";
import type { DistrictConfig, OfficeKey, PrecinctDistrictData, PrecinctYear, YearResults } from "./types";
import { crosswalkYear, currentEra, eraOfYear, marginOf, pctD, sumOffice, topOfTicket, type CrosswalkedPrecinct, type Tally } from "./aggregate";

export type Mode = "results" | "swing" | "demographics" | "targeting" | "projection";
export type Universe = "current" | "original";
export type Level = "precinct" | "subdivision";

export interface ExplorerRow extends PrecinctYear {
  estimated?: boolean;
  dominantShare?: number;
  dominantSource?: string;
  /** subdivision-level rows: how many precincts were summed */
  count?: number;
}

const OFFICE_ORDER: OfficeKey[] = ["sthouse", "stsen", "pres", "gov", "ussen", "ushouse"];

export function officesOf(year: YearResults): OfficeKey[] {
  return Object.keys(year.offices).sort((a, b) => OFFICE_ORDER.indexOf(a) - OFFICE_ORDER.indexOf(b));
}

export function officeLabel(year: YearResults, office: OfficeKey): string {
  return year.offices[office]?.label ?? office;
}

export function officeShort(year: YearResults, office: OfficeKey): string {
  return year.offices[office]?.short ?? office;
}

/** "State House" or "State House (3 districts)" when the column sums several races. */
export function officeLabelFull(year: YearResults, office: OfficeKey): string {
  const m = year.offices[office];
  const n = m?.districts ? Object.keys(m.districts).length : 0;
  return n > 1 ? `${officeLabel(year, office)} (${n} districts)` : officeLabel(year, office);
}

/** "Kamala Harris (D) vs Donald Trump (R)" when both names are known for a single race. */
export function officeCandidates(year: YearResults, office: OfficeKey): string | null {
  const m = year.offices[office];
  if (!m) return null;
  if (m.d && m.r) return `${m.d} (D) vs ${m.r} (R)`;
  return null;
}

export function currentPrecincts(data: PrecinctDistrictData): { id: string; sub: string }[] {
  const era = currentEra(data.config);
  const latest = Math.max(...era.years.filter((y) => data.results.years[String(y)]));
  return data.results.years[String(latest)].precincts.map((p) => ({ id: p.id, sub: p.sub }));
}

/** True when a year has to be crosswalked to be shown on the current lines. */
export function needsCrosswalk(config: DistrictConfig, year: number): boolean {
  return eraOfYear(config, year).id !== currentEra(config).id;
}

/**
 * Precinct rows for a year. On the current universe an older era is carried onto today's
 * precincts through the crosswalk (estimates); on the original universe rows are exact.
 */
export function precinctRows(data: PrecinctDistrictData, year: number, universe: Universe): ExplorerRow[] {
  const yr = data.results.years[String(year)];
  if (!yr) return [];
  if (universe === "original" || !needsCrosswalk(data.config, year)) return yr.precincts;
  const xw = data.crosswalk.eras[yr.era];
  if (!xw) return yr.precincts;
  return crosswalkYear(yr, xw, currentPrecincts(data)) as CrosswalkedPrecinct[];
}

/** Exact subdivision rollups for a year (never crosswalked). */
export function subdivisionRows(data: PrecinctDistrictData, year: number): ExplorerRow[] {
  const yr = data.results.years[String(year)];
  if (!yr) return [];
  return aggregateRows(yr.precincts, (p) => p.sub, data.config);
}

export function aggregateRows(rows: ExplorerRow[], keyOf: (p: ExplorerRow) => string, config: DistrictConfig): ExplorerRow[] {
  const groups = new Map<string, ExplorerRow>();
  for (const p of rows) {
    const k = keyOf(p);
    const g: ExplorerRow = groups.get(k) ?? { id: k, sub: k, reg: 0, ballots: 0, races: {}, count: 0, estimated: false };
    groups.set(k, g);
    g.reg += p.reg; g.ballots += p.ballots; g.count = (g.count ?? 0) + 1;
    if (p.estimated) g.estimated = true;
    for (const [o, v] of Object.entries(p.races)) {
      const t = g.races[o] ?? (g.races[o] = { d: 0, r: 0, t: 0 });
      t.d += v.d; t.r += v.r; t.t += v.t;
    }
  }
  const order = config.subdivisions.map((s) => s.id);
  return [...groups.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function rowsFor(data: PrecinctDistrictData, year: number, universe: Universe, level: Level): ExplorerRow[] {
  return level === "subdivision" ? subdivisionRows(data, year) : precinctRows(data, year, universe);
}

// ── Swing ─────────────────────────────────────────────────────────────────────

export interface SwingCell { a: number | null; b: number | null; swing: number | null; estimated: boolean }

export function swingByUnit(
  rowsA: ExplorerRow[], officeA: OfficeKey,
  rowsB: ExplorerRow[], officeB: OfficeKey,
): Map<string, SwingCell> {
  const b = new Map(rowsB.map((r) => [r.id, r]));
  const out = new Map<string, SwingCell>();
  for (const ra of rowsA) {
    const rb = b.get(ra.id);
    const ma = ra.races[officeA] ? marginOf(ra.races[officeA]) : null;
    const mb = rb?.races[officeB] ? marginOf(rb.races[officeB]) : null;
    out.set(ra.id, { a: ma, b: mb, swing: ma != null && mb != null ? ma - mb : null, estimated: !!(ra.estimated || rb?.estimated) });
  }
  return out;
}

/** Default baseline for a year+office: the previous year that had the same office, else the previous top-of-ticket. */
export function defaultBaseline(data: PrecinctDistrictData, year: number, office: OfficeKey): { year: number; office: OfficeKey } | null {
  const years = data.config.years.filter((y) => y < year).sort((a, b) => b - a);
  for (const y of years) {
    const yr = data.results.years[String(y)];
    if (yr?.offices[office]) return { year: y, office };
  }
  for (const y of years) {
    const yr = data.results.years[String(y)];
    const top = yr ? topOfTicket(yr) : null;
    if (top) return { year: y, office: top };
  }
  return null;
}

// ── Targeting ─────────────────────────────────────────────────────────────────

export type TargetMetricKey = "floor" | "ceiling" | "persuadable" | "gap" | "dropoff" | "trend";

export interface TargetMetric {
  key: TargetMetricKey;
  label: string;
  short: string;
  kind: "diverging" | "sequential";
  format: (v: number) => string;
  domain?: [number, number];
  describe: string;
}

export const TARGET_METRICS: TargetMetric[] = [
  { key: "floor",       label: "Democratic floor",   short: "D floor",     kind: "sequential", format: (v) => `${v.toFixed(1)}%`, domain: [25, 70], describe: "Lowest two-party Democratic share across the year's races" },
  { key: "ceiling",     label: "Democratic ceiling", short: "D ceiling",   kind: "sequential", format: (v) => `${v.toFixed(1)}%`, domain: [25, 70], describe: "Highest two-party Democratic share across the year's races" },
  { key: "persuadable", label: "Split-ticket votes", short: "Split votes", kind: "sequential", format: (v) => Math.round(v).toLocaleString(), domain: [0, 120], describe: "(ceiling − floor) × ballots cast: how many voters picked different parties for different offices" },
  { key: "gap",         label: "Down-ballot gap",    short: "Gap",         kind: "diverging",  format: fmtMarginPts, describe: "State House margin minus top-of-ticket margin, same year; R+ means the legislative race ran more Republican than the top of the ticket" },
  { key: "dropoff",     label: "Midterm drop-off",   short: "Drop-off",    kind: "sequential", format: (v) => `${v.toFixed(1)}%`, domain: [15, 40], describe: "Share of the presidential-year ballots that were not cast in the most recent midterm" },
  { key: "trend",       label: "Presidential trend", short: "Trend",       kind: "diverging",  format: fmtMarginPts, describe: "Change in the presidential margin from the earliest to the latest presidential year on file" },
];

export const TARGET_METRIC_BY_KEY = Object.fromEntries(TARGET_METRICS.map((m) => [m.key, m])) as Record<TargetMetricKey, TargetMetric>;

function fmtMarginPts(v: number): string {
  const s = fmtMargin(v);
  return s === "EVEN" ? "0.0" : s;
}

export interface TargetingRow {
  id: string;
  sub: string;
  ballots: number;
  floor: number | null;
  ceiling: number | null;
  persuadable: number | null;
  gap: number | null;
  dropoff: number | null;
  trend: number | null;
  estimated: boolean;   // drop-off or trend used crosswalked rows
}

export interface TargetingContext {
  year: number;               // the year floor/ceiling/gap are read from
  midtermYear: number | null; // most recent midterm (any era)
  presYears: [number, number] | null; // earliest and latest presidential years
  offices: OfficeKey[];
}

export function targetingContext(data: PrecinctDistrictData): TargetingContext {
  const years = [...data.config.years].sort((a, b) => b - a);
  const isPres = (y: number) => !!data.results.years[String(y)]?.offices.pres;
  const year = years[0];
  const midtermYear = years.find((y) => !isPres(y) && y < year) ?? null;
  const pres = years.filter(isPres).sort((a, b) => a - b);
  return {
    year,
    midtermYear,
    presYears: pres.length >= 2 ? [pres[0], pres[pres.length - 1]] : null,
    offices: officesOf(data.results.years[String(year)]),
  };
}

export function targetingRows(data: PrecinctDistrictData, level: Level): TargetingRow[] {
  const ctx = targetingContext(data);
  const universe: Universe = "current";
  const get = (y: number) => (level === "subdivision" ? subdivisionRows(data, y) : precinctRows(data, y, universe));
  const base = get(ctx.year);
  const yr = data.results.years[String(ctx.year)];
  const top = topOfTicket(yr);
  const mid = ctx.midtermYear != null ? new Map(get(ctx.midtermYear).map((r) => [r.id, r])) : null;
  const presA = ctx.presYears ? new Map(get(ctx.presYears[0]).map((r) => [r.id, r])) : null;
  const presB = ctx.presYears ? new Map(get(ctx.presYears[1]).map((r) => [r.id, r])) : null;
  return base.map((p) => {
    const shares = ctx.offices.map((o) => (p.races[o] ? pctD(p.races[o]) : null)).filter((v): v is number => v != null);
    const floor = shares.length ? Math.min(...shares) : null;
    const ceiling = shares.length ? Math.max(...shares) : null;
    const sth = p.races.sthouse ? marginOf(p.races.sthouse) : null;
    const topM = top && p.races[top] ? marginOf(p.races[top]) : null;
    const m = mid?.get(p.id);
    const a = presA?.get(p.id), b = presB?.get(p.id);
    const ma = a?.races.pres ? marginOf(a.races.pres) : null;
    const mb = b?.races.pres ? marginOf(b.races.pres) : null;
    return {
      id: p.id, sub: p.sub, ballots: p.ballots,
      floor, ceiling,
      persuadable: floor != null && ceiling != null ? ((ceiling - floor) / 100) * p.ballots : null,
      gap: sth != null && topM != null ? sth - topM : null,
      dropoff: m && p.ballots > 0 ? (1 - m.ballots / p.ballots) * 100 : null,
      trend: ma != null && mb != null ? mb - ma : null,
      estimated: !!(m?.estimated || a?.estimated || b?.estimated),
    };
  });
}

// ── Color ─────────────────────────────────────────────────────────────────────

export const MARGIN_LEGEND = [
  { color: "#1b408c", label: "D+15" },
  { color: "#587ccc", label: "D+5" },
  { color: "#8bafff", label: "D+1" },
  { color: "#959bb3", label: "D" },
  { color: "#cf8980", label: "R" },
  { color: "#ff8b98", label: "R+1" },
  { color: "#ff5864", label: "R+5" },
  { color: "#be1c29", label: "R+15" },
];

// One-hue sequential ramp (blue, light→dark) for magnitudes; on a dark surface the ramp runs
// dark→light so "more" is still the step that stands out from the background.
const SEQ_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const SEQ_DARK = ["#184f95", "#256abf", "#2a78d6", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];

export function sequentialColor(v: number | null, domain: [number, number], dark: boolean): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const ramp = dark ? SEQ_DARK : SEQ_LIGHT;
  const t = Math.max(0, Math.min(1, (v - domain[0]) / (domain[1] - domain[0])));
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

export function sequentialStops(dark: boolean): string[] {
  return dark ? SEQ_DARK : SEQ_LIGHT;
}

export function divergingColor(v: number | null): string | null {
  return v == null ? null : getRaceColor(v);
}

// ── Formatting ────────────────────────────────────────────────────────────────

export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());
export const fmtPct1 = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
export { fmtMargin };

export function marginColorVar(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 0.05) return "var(--app-text-muted)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

export function tallyMargin(t: Tally | undefined): number | null {
  return t ? marginOf(t) : null;
}

export function districtTally(rows: ExplorerRow[], office: OfficeKey): Tally {
  return sumOffice(rows, office);
}
