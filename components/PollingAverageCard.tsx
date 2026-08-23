"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
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

type ModeConfig = {
  key: ModeKey;
  navLabel: string;
  seriesALabel: string;
  seriesBLabel: string;
  colLabelA: string;
  colLabelB: string;
  colorA: string;
  colorB: string;
  fmtDiff: (diff: number) => string;
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
  return diff < 0 ? `Approve+${Math.abs(diff).toFixed(1)}` : `Disapprove+${diff.toFixed(1)}`;
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
      navLabel: "Generic Ballot",
      seriesALabel: "Democrat",
      seriesBLabel: "Republican",
      colLabelA: "Dem",
      colLabelB: "Rep",
      colorA: "", colorB: "", // filled in per-theme at render time
      fmtDiff: fmtGbDiff,
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
      navLabel: "Trump Approval",
      seriesALabel: "Approve",
      seriesBLabel: "Disapprove",
      colLabelA: "Approve",
      colLabelB: "Disapprove",
      colorA: APPROVE_COLOR, colorB: DISAPPROVE_COLOR,
      fmtDiff: fmtApprovalDiff,
      captionPrefixA: "App",
      captionPrefixB: "Dis",
      polls,
      average: { diff: avg.diff, a: avg.approve, b: avg.disapprove, includedKeys: new Set(avg.polls.map((p) => pollKey({ ...p, a: p.approve, b: p.disapprove }))) },
      trend,
  };
}

// Trend generation is the expensive part of this component. Build only the
// selected mode, then retain it when the user switches away and back.
const configCache = new Map<ModeKey, ModeConfig>();

function getModeConfig(mode: ModeKey): ModeConfig {
  const cached = configCache.get(mode);
  if (cached) return cached;
  const config = mode === "generic-ballot" ? buildGenericBallotConfig() : buildTrumpApprovalConfig();
  configCache.set(mode, config);
  return config;
}

const MODE_NAV: Array<{ key: ModeKey; label: string }> = [
  { key: "generic-ballot", label: "Generic Ballot" },
  { key: "trump-approval", label: "Trump Approval" },
];

const INITIAL_TABLE_ROWS = 10;

function ShareDot(props: { cx?: number; cy?: number; payload?: ScatterPoint; color: string }) {
  const { cx, cy, payload, color } = props;
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={3} fill={color} fillOpacity={0.28} />;
}

function marginColor(diff: number, colorA: string, colorB: string, theme: Theme): string {
  if (diff < 0) return colorA;
  if (diff > 0) return colorB;
  return theme.textMuted;
}

function PopupContent({ point, theme, config }: { point: PopupPoint; theme: Theme; config: ModeConfig }) {
  const color = marginColor(point.diff, config.colorA, config.colorB, theme);
  if (isPoll(point)) {
    return (
      <>
        <div className="font-semibold mb-1" style={{ color: theme.textPrimary }}>{point.pollster}</div>
        <div style={{ color: theme.textMuted }}>
          {fmtDate(point.startDate)} – {fmtDate(point.endDate)}
          {point.sample ? ` · ${point.sample.toLocaleString()} ${point.population ?? ""}` : point.population ? ` · ${point.population}` : ""}
        </div>
        <div className="mt-1">
          <span style={{ color: config.colorA }}>{config.seriesALabel} {point.a}%</span>
          <span style={{ color: theme.textVeryMuted }}> · </span>
          <span style={{ color: config.colorB }}>{config.seriesBLabel} {point.b}%</span>
          <span style={{ color: theme.textVeryMuted }}> · </span>
          <span style={{ color }}>{config.fmtDiff(point.diff)}</span>
        </div>
      </>
    );
  }
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
  // Hover only follows the weighted trend; individual polls use the click-to-pin interaction.
  const point = payload.find((entry) => !isPoll(entry.payload))?.payload;
  if (!point) return null;
  return (
    <div className="rounded-md px-2.5 py-2 text-[11px]" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
      <PopupContent point={point} theme={theme} config={config} />
    </div>
  );
}

export default function PollingAverageCard({
  theme: t,
  variant = "card",
  compact = false,
  tableHeight,
}: {
  theme: Theme;
  variant?: "card" | "editorial";
  compact?: boolean;
  tableHeight?: number;
}) {
  const [mode, setMode] = useState<ModeKey>("generic-ballot");
  const [pinned, setPinned] = useState<PopupPoint | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  const base = getModeConfig(mode);
  // Generic ballot's colors follow the theme (dem/rep blue-red shift between light/dark);
  // Trump approval's colors are fixed green/red regardless of theme.
  const config: ModeConfig = {
    ...base,
    colorA: mode === "generic-ballot" ? t.demText : base.colorA,
    colorB: mode === "generic-ballot" ? t.repText : base.colorB,
  };

  const scatterData: ScatterPoint[] = useMemo(
    () => config.polls.map((p) => ({ ...p, x: new Date(p.endDate).getTime() })),
    [config.polls]
  );
  const tableRows = useMemo(() => [...config.polls].reverse(), [config.polls]);
  const displayedTableRows = showAllRows ? tableRows : tableRows.slice(0, INITIAL_TABLE_ROWS);

  const shareVals = config.polls.flatMap((p) => [p.a, p.b]);
  const yMin = Math.floor(Math.min(...shareVals) - 2);
  const yMax = Math.ceil(Math.max(...shareVals) + 2);

  const headlineColor = marginColor(config.average.diff, config.colorA, config.colorB, t);
  const includedRowBg = `color-mix(in srgb, ${t.tabBg} 45%, ${t.panel})`;

  const pointId = (p: PopupPoint) => (isPoll(p) ? pollKey(p) : `trend::${p.x}`);

  const handleDotClick = (point: ScatterPoint) => {
    setPinned((cur) => (cur && pointId(cur) === pointId(point) ? null : point));
  };

  const switchMode = (m: ModeKey) => {
    setMode(m);
    setPinned(null);
    setShowAllRows(false);
  };

  return (
    <div className={variant === "card" ? "rounded-xl p-4 w-full" : "w-full"} style={variant === "card" ? { border: `1px solid ${t.border}`, background: t.panel } : undefined}>
      <div className={`flex items-center mb-3 ${variant === "card" ? "justify-between" : "justify-start"}`}>
        {variant === "card" && <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: t.textMuted }}>
          Polling Average
        </div>}
        <nav className={variant === "card" ? "flex rounded-lg p-1 gap-0.5" : "flex gap-5"} style={variant === "card" ? { background: t.tabBg } : undefined}>
          {MODE_NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => switchMode(item.key)}
              className={variant === "card" ? "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all" : "border-b-2 px-0 py-1.5 text-[11px] font-semibold transition-colors"}
              style={variant === "card" ? (mode === item.key ? { background: "#388bfd", color: "#ffffff" } : { color: t.textMuted }) : { color: mode === item.key ? t.textPrimary : t.textMuted, borderColor: mode === item.key ? t.textPrimary : "transparent" }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className={variant === "card" ? "rounded-lg px-3 py-2.5 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-4 mb-3" : "border-y py-3 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-4 mb-3"} style={variant === "card" ? { background: t.bg } : { borderColor: t.border }}>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.textMuted }}>Weighted Average</span>
          <span className="text-[10px]" style={{ color: t.textVeryMuted }}>Most recent poll per pollster · recency + sample weighted</span>
        </div>
        <div className="flex items-center justify-end gap-3 shrink-0">
          <div className="flex items-center gap-2.5 pr-3 text-sm font-semibold" style={{ borderRight: `1px solid ${t.border}` }}>
            <span style={{ color: config.colorA }}>{config.captionPrefixA}&nbsp;{config.average.a.toFixed(1)}%</span>
            <span style={{ color: t.textVeryMuted }}>·</span>
            <span style={{ color: config.colorB }}>{config.captionPrefixB}&nbsp;{config.average.b.toFixed(1)}%</span>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider" style={{ color: t.textMuted }}>Margin</div>
            <div className="text-xl font-bold" style={{ color: headlineColor }}>{config.fmtDiff(config.average.diff)}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-1.5 px-0.5">
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorA }} /> {config.seriesALabel}
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorB }} /> {config.seriesBLabel}
        </span>
      </div>

      <div style={{ height: compact ? 175 : 200 }} className="[&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={config.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.border} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => fmtDate(new Date(v).toISOString().slice(0, 10))}
              tick={{ fontSize: 10, fill: t.textMuted }}
              stroke={t.border}
              scale="time"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: t.textMuted }}
              stroke={t.border}
              tickFormatter={(v: number) => `${v}%`}
              width={36}
            />
            <Tooltip
              content={<ChartTooltip theme={t} config={config} />}
              cursor={{ stroke: t.textMuted, strokeWidth: 1, strokeOpacity: 0.7 }}
              isAnimationActive={false}
              animationDuration={0}
              wrapperStyle={{ transition: "none" }}
            />
            <Scatter
              data={scatterData}
              dataKey="a"
              tooltipType="none"
              shape={(props: object) => <ShareDot {...(props as object)} color={config.colorA} />}
              onClick={(data: { payload?: ScatterPoint }) => data.payload && handleDotClick(data.payload)}
              cursor="pointer"
              isAnimationActive={false}
            />
            <Scatter
              data={scatterData}
              dataKey="b"
              tooltipType="none"
              shape={(props: object) => <ShareDot {...(props as object)} color={config.colorB} />}
              onClick={(data: { payload?: ScatterPoint }) => data.payload && handleDotClick(data.payload)}
              cursor="pointer"
              isAnimationActive={false}
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

      {pinned && (
        <div className="rounded-md pl-2.5 pr-10 py-2 text-[11px] mt-1.5 relative" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded text-lg leading-none"
            style={{ color: t.textVeryMuted }}
            aria-label="Dismiss"
          >
            ×
          </button>
          <PopupContent point={pinned} theme={t} config={config} />
        </div>
      )}

      {!compact && <div
        className="mt-3 max-h-72 overflow-y-auto rounded-lg"
        style={{ border: `1px solid ${t.border}`, ...(tableHeight ? { height: tableHeight, maxHeight: tableHeight } : {}) }}
      >
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 z-10" style={{ background: t.tabBg }}>
            <tr>
              <th className="text-left font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>Dates</th>
              <th className="text-left font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>Pollster</th>
              <th className="text-right font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>Sample</th>
              <th className="text-right font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>{config.colLabelA}</th>
              <th className="text-right font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>{config.colLabelB}</th>
              <th className="text-right font-semibold uppercase tracking-wider px-2.5 py-1.5" style={{ color: t.textMuted, fontSize: 9 }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {displayedTableRows.map((p, i) => {
              const included = config.average.includedKeys.has(pollKey(p));
              return (
                <tr
                  key={`${p.pollster}-${p.endDate}-${i}`}
                  style={{ borderTop: `1px solid ${t.border}`, background: included ? includedRowBg : "transparent" }}
                >
                  <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: t.textMuted }}>{fmtDate(p.startDate)}–{fmtDate(p.endDate)}</td>
                  <td className="px-2.5 py-1.5" style={{ color: t.textPrimary }}>{p.pollster}</td>
                  <td className="px-2.5 py-1.5 text-right whitespace-nowrap" style={{ color: t.textMuted }}>
                    {p.sample ? p.sample.toLocaleString() : "—"}{p.population ? ` ${p.population}` : ""}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-medium" style={{ color: config.colorA }}>{p.a}%</td>
                  <td className="px-2.5 py-1.5 text-right font-medium" style={{ color: config.colorB }}>{p.b}%</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold" style={{ color: marginColor(p.diff, config.colorA, config.colorB, t) }}>
                    {config.fmtDiff(p.diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {!compact && tableRows.length > INITIAL_TABLE_ROWS && <button
        type="button"
        onClick={() => setShowAllRows((current) => !current)}
        className="mt-2 w-full py-2 text-[11px] font-semibold transition-opacity hover:opacity-65"
        style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}` }}
      >
        {showAllRows ? "Show 10 most recent polls" : `Show all ${tableRows.length} polls`}
      </button>}
      {!compact && <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: includedRowBg, border: `1px solid ${t.border}` }} />
        <span className="text-[10px]" style={{ color: t.textVeryMuted }}>Shaded rows are each pollster&apos;s most recent survey — the ones counted in the weighted average above</span>
      </div>}
    </div>
  );
}
