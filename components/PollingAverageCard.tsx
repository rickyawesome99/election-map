"use client";

import { memo, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { genericBallotPolls, GenericBallotPoll } from "@/data/genericBallotPolls";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { trumpApprovalPolls, TrumpApprovalPoll } from "@/data/trumpApprovalPolls";
import { computeTrumpApprovalAverage, APPROVE_COLOR, DISAPPROVE_COLOR } from "@/lib/trumpApprovalAverage";
import type { DARK_THEME } from "./ForecastMap";

type Theme = typeof DARK_THEME;
type ModeKey = "generic-ballot" | "trump-approval";

const MS_PER_DAY = 86400000;
const TREND_STEP_DAYS = 1;
const CHANGE_WINDOW_DAYS = 30;
const LATEST_ROWS = 10;

// ── Common shape every mode's poll data gets normalized into ──────────────────
// a/b mirror each mode's underlying diff convention (diff = b - a in both
// genericBallotPolls and trumpApprovalPolls), so no sign-flipping is needed.
type NormalizedPoll = {
  pollster: string;
  startDate: string;
  endDate: string;
  sample: number | null;
  population: string | null;
  a: number;
  b: number;
  diff: number;
};
type ScatterPoint = NormalizedPoll & { x: number };
type TrendPoint = { x: number; a: number; b: number; diff: number };
type PopupPoint = ScatterPoint | TrendPoint;

function isPoll(p: PopupPoint): p is ScatterPoint {
  return "pollster" in p;
}

function pollKey(p: NormalizedPoll): string {
  return `${p.pollster}::${p.endDate}`;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// First-of-month ticks across the trend's range — weekly date labels crowd a half-width chart.
function monthTicks(trend: TrendPoint[]): number[] {
  if (trend.length === 0) return [];
  const first = new Date(trend[0].x);
  const lastMs = trend[trend.length - 1].x;
  const ticks: number[] = [];
  for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)); d.getTime() <= lastMs; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    ticks.push(d.getTime());
  }
  return ticks;
}

type ModeConfig = {
  key: ModeKey;
  title: string;
  seriesALabel: string;
  seriesBLabel: string;
  colorA: string;
  colorB: string;
  fmtDiff: (diff: number) => string;
  /** Headline form of the average — shorter than fmtDiff where the table/popup wording is long. */
  fmtHeadline: (diff: number) => string;
  headlineLabel: string;
  captionPrefixA: string;
  captionPrefixB: string;
  polls: NormalizedPoll[];
  average: { diff: number; a: number; b: number; includedKeys: Set<string> };
  trend: TrendPoint[];
};

function fmtGbDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `D+${Math.abs(diff).toFixed(1)}` : `R+${diff.toFixed(1)}`;
}

function fmtApprovalDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `Approve +${Math.abs(diff).toFixed(1)}` : `Disapprove +${diff.toFixed(1)}`;
}

// Trend line: at each daily checkpoint, the weighted average computed from only the
// polls available as of that date — i.e. "what the average would have shown that day,"
// using the same dedupe/recency/sample-weight methodology throughout (§lib/genericBallotAverage,
// §lib/trumpApprovalAverage).
function buildTrend<P extends { endDate: string }>(
  polls: P[],
  computeAverage: (asOf: Date, polls: P[]) => { a: number; b: number; diff: number }
): TrendPoint[] {
  if (polls.length === 0) return [];
  const sorted = [...polls].sort((x, y) => x.endDate.localeCompare(y.endDate));
  const firstMs = new Date(sorted[0].endDate).getTime();
  const lastMs = Math.max(new Date(sorted[sorted.length - 1].endDate).getTime(), Date.now());
  const points: TrendPoint[] = [];
  for (let t = firstMs; t <= lastMs; t += TREND_STEP_DAYS * MS_PER_DAY) {
    const available = sorted.filter((p) => new Date(p.endDate).getTime() <= t);
    if (available.length === 0) continue;
    const { a, b, diff } = computeAverage(new Date(t), available);
    points.push({ x: t, a, b, diff });
  }
  const last = computeAverage(new Date(lastMs), sorted);
  const lastPoint = { x: lastMs, a: last.a, b: last.b, diff: last.diff };
  if (points.length === 0 || points[points.length - 1].x !== lastMs) points.push(lastPoint);
  return points;
}

function buildGenericBallotConfig(): ModeConfig {
  const polls: NormalizedPoll[] = genericBallotPolls.map((p) => ({
    pollster: p.pollster, startDate: p.startDate, endDate: p.endDate,
    sample: p.sample, population: p.population, a: p.dem, b: p.rep, diff: p.diff,
  }));
  const avg = computeGenericBallotAverage(new Date());
  const trend = buildTrend<GenericBallotPoll>(genericBallotPolls, (asOf, ps) => {
    const r = computeGenericBallotAverage(asOf, ps);
    return { a: r.dem, b: r.rep, diff: r.diff };
  });
  return {
    key: "generic-ballot",
    title: "Generic Ballot",
    seriesALabel: "Democrat",
    seriesBLabel: "Republican",
    colorA: "", colorB: "", // filled in per-theme at render time
    fmtDiff: fmtGbDiff,
    fmtHeadline: fmtGbDiff,
    headlineLabel: "Margin",
    captionPrefixA: "D",
    captionPrefixB: "R",
    polls,
    average: { diff: avg.diff, a: avg.dem, b: avg.rep, includedKeys: new Set(avg.polls.map((p) => pollKey({ ...p, a: p.dem, b: p.rep }))) },
    trend,
  };
}

function buildTrumpApprovalConfig(): ModeConfig {
  const polls: NormalizedPoll[] = trumpApprovalPolls.map((p) => ({
    pollster: p.pollster, startDate: p.startDate, endDate: p.endDate,
    sample: p.sample, population: p.population, a: p.approve, b: p.disapprove, diff: p.diff,
  }));
  const avg = computeTrumpApprovalAverage(new Date());
  const trend = buildTrend<TrumpApprovalPoll>(trumpApprovalPolls, (asOf, ps) => {
    const r = computeTrumpApprovalAverage(asOf, ps);
    return { a: r.approve, b: r.disapprove, diff: r.diff };
  });
  return {
    key: "trump-approval",
    title: "Trump Approval",
    seriesALabel: "Approve",
    seriesBLabel: "Disapprove",
    colorA: APPROVE_COLOR, colorB: DISAPPROVE_COLOR,
    fmtDiff: fmtApprovalDiff,
    fmtHeadline: (diff: number) => fmtNet(diff, 1),
    headlineLabel: "Net approval",
    captionPrefixA: "App",
    captionPrefixB: "Dis",
    polls,
    average: { diff: avg.diff, a: avg.approve, b: avg.disapprove, includedKeys: new Set(avg.polls.map((p) => pollKey({ ...p, a: p.approve, b: p.disapprove }))) },
    trend,
  };
}

// Trend generation is the expensive part of this component; build each mode once.
const configCache = new Map<ModeKey, ModeConfig>();

function getModeConfig(mode: ModeKey): ModeConfig {
  const cached = configCache.get(mode);
  if (cached) return cached;
  const config = mode === "generic-ballot" ? buildGenericBallotConfig() : buildTrumpApprovalConfig();
  configCache.set(mode, config);
  return config;
}

// Plot-area geometry shared by the Recharts chart and the dot layer behind it.
const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };
const Y_AXIS_WIDTH = 36;
const X_AXIS_HEIGHT = 24;

// The poll dots are drawn outside Recharts. Recharts re-renders every series on each hover move, and
// with 400–650 scatter symbols per chart that was most of the hover lag. This layer sits behind the
// chart's (transparent) SVG, places each dot by percentage of the plot area — so it needs no
// measuring and stays aligned at any width — and is memoized, so hovering never touches it.
const PollDots = memo(function PollDots({ polls, xMin, xMax, yMin, yMax, colorA, colorB }: {
  polls: ScatterPoint[]; xMin: number; xMax: number; yMin: number; yMax: number; colorA: string; colorB: string;
}) {
  const xPct = (x: number) => `${(100 * (x - xMin)) / (xMax - xMin)}%`;
  const yPct = (v: number) => `${(100 * (yMax - v)) / (yMax - yMin)}%`;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: CHART_MARGIN.left + Y_AXIS_WIDTH, right: CHART_MARGIN.right, top: CHART_MARGIN.top, bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT, width: `calc(100% - ${CHART_MARGIN.left + Y_AXIS_WIDTH + CHART_MARGIN.right}px)`, height: `calc(100% - ${CHART_MARGIN.top + CHART_MARGIN.bottom + X_AXIS_HEIGHT}px)` }}
    >
      {polls.map((p, i) => <circle key={`a${i}`} cx={xPct(p.x)} cy={yPct(p.a)} r={2.4} fill={colorA} fillOpacity={0.22} />)}
      {polls.map((p, i) => <circle key={`b${i}`} cx={xPct(p.x)} cy={yPct(p.b)} r={2.4} fill={colorB} fillOpacity={0.22} />)}
    </svg>
  );
});

function marginColor(diff: number, colorA: string, colorB: string, theme: Theme): string {
  if (diff < 0) return colorA;
  if (diff > 0) return colorB;
  return theme.textMuted;
}

function PopupContent({ point, theme, config }: { point: TrendPoint; theme: Theme; config: ModeConfig }) {
  const color = marginColor(point.diff, config.colorA, config.colorB, theme);
  return (
    <>
      <div className="font-semibold mb-1" style={{ color: theme.textPrimary }}>Weighted trend · {fmtDate(new Date(point.x).toISOString().slice(0, 10))}</div>
      <div className="mt-1">
        <span style={{ color: config.colorA }}>{config.seriesALabel} {point.a.toFixed(1)}%</span>
        <span style={{ color: theme.textVeryMuted }}> · </span>
        <span style={{ color: config.colorB }}>{config.seriesBLabel} {point.b.toFixed(1)}%</span>
        <span style={{ color: theme.textVeryMuted }}> · </span>
        <span style={{ color }}>{config.fmtDiff(point.diff)}</span>
      </div>
    </>
  );
}

function ChartTooltip({ active, payload, theme, config }: { active?: boolean; payload?: Array<{ payload: PopupPoint }>; theme: Theme; config: ModeConfig }) {
  if (!active || !payload || payload.length === 0) return null;
  // Hover follows the weighted trend only; the poll dots are display-only.
  const point = payload.find((entry) => !isPoll(entry.payload))?.payload as TrendPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-md px-2.5 py-2 text-[11px]" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
      <PopupContent point={point} theme={theme} config={config} />
    </div>
  );
}

// One national series: headline average, its move over the last 30 days, and the trend chart.
function PollChart({ config, theme: t }: { config: ModeConfig; theme: Theme }) {
  const scatterData: ScatterPoint[] = useMemo(
    () => config.polls.map((p) => ({ ...p, x: new Date(p.endDate).getTime() })),
    [config.polls]
  );
  const ticks = useMemo(() => monthTicks(config.trend), [config.trend]);

  const shareVals = config.polls.flatMap((p) => [p.a, p.b]);
  const yMin = Math.floor(Math.min(...shareVals) - 2);
  const yMax = Math.ceil(Math.max(...shareVals) + 2);

  const headlineColor = marginColor(config.average.diff, config.colorA, config.colorB, t);
  const last = config.trend[config.trend.length - 1];
  const prior = last ? [...config.trend].reverse().find((p) => p.x <= last.x - CHANGE_WINDOW_DAYS * MS_PER_DAY) : undefined;

  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-3 border-b pb-2.5" style={{ borderColor: t.border }}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textPrimary }}>{config.title}</div>
          <div className="mt-1 text-xs font-semibold">
            <span style={{ color: config.colorA }}>{config.captionPrefixA}&nbsp;{config.average.a.toFixed(1)}%</span>
            <span className="px-1.5" style={{ color: t.textVeryMuted }}>·</span>
            <span style={{ color: config.colorB }}>{config.captionPrefixB}&nbsp;{config.average.b.toFixed(1)}%</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: t.textMuted }}>{config.headlineLabel}</div>
          <div className="text-xl font-bold tabular-nums sm:text-2xl" style={{ color: headlineColor }}>{config.fmtHeadline(config.average.diff)}</div>
          {prior && <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums" style={{ color: t.textMuted }}>
            {CHANGE_WINDOW_DAYS} days ago: <span style={{ color: marginColor(prior.diff, config.colorA, config.colorB, t) }}>{config.fmtHeadline(prior.diff)}</span>
          </div>}
        </div>
      </div>

      <div className="mb-1 mt-2.5 flex items-center gap-4 px-0.5">
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorA }} /> {config.seriesALabel}
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorB }} /> {config.seriesBLabel}
        </span>
      </div>

      <div style={{ height: 210 }} className="relative [&_*:focus]:outline-none">
        {config.trend.length > 1 && <PollDots polls={scatterData} xMin={config.trend[0].x} xMax={config.trend[config.trend.length - 1].x} yMin={yMin} yMax={yMax} colorA={config.colorA} colorB={config.colorB} />}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={config.trend} margin={CHART_MARGIN}>
            <CartesianGrid stroke={t.border} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(v: number) => MONTHS[new Date(v).getUTCMonth()]}
              tick={{ fontSize: 10, fill: t.textMuted }}
              stroke={t.border}
              scale="time"
              height={X_AXIS_HEIGHT}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: t.textMuted }}
              stroke={t.border}
              tickFormatter={(v: number) => `${v}%`}
              width={Y_AXIS_WIDTH}
              allowDataOverflow
            />
            <Tooltip
              content={<ChartTooltip theme={t} config={config} />}
              cursor={{ stroke: t.textMuted, strokeWidth: 1, strokeOpacity: 0.7 }}
              isAnimationActive={false}
              animationDuration={0}
              wrapperStyle={{ transition: "none" }}
            />
            <Line
              dataKey="a"
              stroke={config.colorA}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: config.colorA, stroke: t.panel, strokeWidth: 2 }}
              type="monotone"
              isAnimationActive={false}
            />
            <Line
              dataKey="b"
              stroke={config.colorB}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: config.colorB, stroke: t.panel, strokeWidth: 2 }}
              type="monotone"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

// ── Merged latest-polls table ─────────────────────────────────────────────────
// Most national pollsters ask both questions in the same survey, so the two files are joined
// on pollster + field dates and each survey is one row. RCP's footnote asterisks ("RMG Research*",
// "Echelon Insights**") differ between the two exports, so they are ignored when matching.
type LatestRow = {
  pollster: string;
  startDate: string;
  endDate: string;
  sample: number | null;
  population: string | null;
  ballot: NormalizedPoll | null;
  approval: NormalizedPoll | null;
  included: boolean;
};

const baseName = (pollster: string) => pollster.replace(/\*+$/, "").trim();

function latestRows(gb: ModeConfig, ap: ModeConfig): LatestRow[] {
  const rows = new Map<string, LatestRow>();
  const add = (p: NormalizedPoll, field: "ballot" | "approval", included: boolean) => {
    const key = `${baseName(p.pollster)}::${p.startDate}::${p.endDate}`;
    const row = rows.get(key) ?? { pollster: baseName(p.pollster), startDate: p.startDate, endDate: p.endDate, sample: p.sample, population: p.population, ballot: null, approval: null, included: false };
    row[field] = p;
    row.included ||= included;
    if (field === "ballot" && p.sample) { row.sample = p.sample; row.population = p.population; } // prefer the ballot question's base
    rows.set(key, row);
  };
  for (const p of gb.polls) add(p, "ballot", gb.average.includedKeys.has(pollKey(p)));
  for (const p of ap.polls) add(p, "approval", ap.average.includedKeys.has(pollKey(p)));
  return [...rows.values()]
    .sort((x, y) => y.endDate.localeCompare(x.endDate) || y.startDate.localeCompare(x.startDate));
}

function fmtNet(diff: number, digits = 0): string {
  // diff = disapprove − approve; show net approval (approve − disapprove)
  const net = -diff;
  if (Math.abs(net) < 0.5 * 10 ** -digits) return "EVEN";
  return `${net > 0 ? "+" : "−"}${Math.abs(net).toFixed(digits)}`;
}

function LatestPollsTable({ gb, ap, theme: t }: { gb: ModeConfig; ap: ModeConfig; theme: Theme }) {
  const [showAll, setShowAll] = useState(false);
  // "Show all" keeps the box at its collapsed (10-row) height and scrolls the full list inside it.
  const boxRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const toggleShowAll = () => {
    if (!showAll && boxRef.current) setCollapsedHeight(boxRef.current.offsetHeight);
    setShowAll((current) => !current);
  };
  const allRows = useMemo(() => latestRows(gb, ap), [gb, ap]);
  const rows = showAll ? allRows : allRows.slice(0, LATEST_ROWS);
  // Rows left out of both averages (a pollster's older surveys) take the tab gray. The header matches
  // the unshaded rows, which show the page background — set solid so scrolled rows don't show through it.
  const excludedRowBg = t.tabBg;
  const headerBg = t.bg;
  const th = "px-2.5 py-1.5 font-semibold uppercase tracking-wider";
  return (
    <div className="mt-8">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textPrimary }}>Latest Polls</div>
      {/* Fixed column widths + a reserved scrollbar gutter: expanding to every poll must not move the columns. */}
      <div ref={boxRef} className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${t.border}`, scrollbarGutter: "stable", ...(showAll && collapsedHeight ? { height: collapsedHeight, overflowY: "auto" } : {}) }}>
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead className="sticky top-0 z-10" style={{ background: headerBg }}>
            <tr style={{ color: t.textMuted, fontSize: 9 }}>
              <th className={`${th} w-[22%] text-left sm:w-[12%]`}>Dates</th>
              <th className={`${th} text-left`}>Pollster</th>
              <th className={`${th} hidden w-[13%] text-right sm:table-cell`}>Sample</th>
              <th className={`${th} w-[23%] text-right sm:w-[18%]`}>Generic Ballot</th>
              <th className={`${th} w-[24%] text-right sm:w-[20%]`}>Trump Net Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.pollster}-${r.startDate}-${r.endDate}`} style={{ borderTop: `1px solid ${t.border}`, background: r.included ? "transparent" : excludedRowBg }}>
                <td className="whitespace-nowrap px-2.5 py-1.5" style={{ color: t.textMuted }}>{fmtDate(r.startDate)}–{fmtDate(r.endDate)}</td>
                <td className="px-2.5 py-1.5" style={{ color: t.textPrimary }}>{r.pollster}</td>
                <td className="hidden whitespace-nowrap px-2.5 py-1.5 text-right sm:table-cell" style={{ color: t.textMuted }}>
                  {r.sample ? `${r.sample.toLocaleString()}${r.population ? ` ${r.population}` : ""}` : r.population ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {r.ballot
                    ? <><span className="mr-2 hidden font-normal md:inline" style={{ color: t.textMuted }}>{r.ballot.a}–{r.ballot.b}</span><span style={{ color: marginColor(r.ballot.diff, gb.colorA, gb.colorB, t) }}>{gb.fmtDiff(r.ballot.diff)}</span></>
                    : <span style={{ color: t.textVeryMuted }}>—</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {r.approval
                    ? <><span className="mr-2 hidden font-normal md:inline" style={{ color: t.textMuted }}>{r.approval.a}–{r.approval.b}</span><span style={{ color: marginColor(r.approval.diff, ap.colorA, ap.colorB, t) }}>{fmtNet(r.approval.diff)}</span></>
                    : <span style={{ color: t.textVeryMuted }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allRows.length > LATEST_ROWS && <button
        type="button"
        onClick={toggleShowAll}
        className="mt-2 w-full py-2 text-[11px] font-semibold transition-opacity hover:opacity-65"
        style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}` }}
      >
        {showAll ? `Show ${LATEST_ROWS} most recent polls` : `Show all ${allRows.length} polls`}
      </button>}
      <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: excludedRowBg, border: `1px solid ${t.border}` }} />
        <span className="text-[10px]" style={{ color: t.textVeryMuted }}>Shaded rows are older surveys left out of the averages above, which use each pollster&apos;s most recent survey. A dash means that survey didn&apos;t ask the question.</span>
      </div>
    </div>
  );
}

export default function PollingAverageCard({ theme: t }: { theme: Theme }) {
  const gbBase = getModeConfig("generic-ballot");
  // Generic ballot's colors follow the theme (dem/rep blue-red shift between light/dark);
  // Trump approval's colors are fixed green/red regardless of theme.
  const gb = useMemo(() => ({ ...gbBase, colorA: t.demText, colorB: t.repText }), [gbBase, t.demText, t.repText]);
  const ap = getModeConfig("trump-approval");

  return (
    <div className="w-full">
      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <PollChart config={gb} theme={t} />
        <PollChart config={ap} theme={t} />
      </div>
      <LatestPollsTable gb={gb} ap={ap} theme={t} />
    </div>
  );
}
