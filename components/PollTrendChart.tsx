"use client";

import { useMemo } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { NormalizedPoll, TrendPoint } from "@/lib/pollingCardData";
import type { ModeConfig } from "./PollingAverageCard";
import { CHART_MARGIN, X_AXIS_HEIGHT, Y_AXIS_WIDTH, fmtDate, marginColor, type Theme } from "./pollCardShared";

// The Recharts half of one national polling chart: axes, the two trend lines and the hover
// popup. Loaded on its own by PollingAverageCard (next/dynamic) so Recharts stays out of the
// Overview's first load; the poll dots behind it are drawn by the card.

type ScatterPoint = NormalizedPoll & { x: number };
type PopupPoint = ScatterPoint | TrendPoint;

function isPoll(p: PopupPoint): p is ScatterPoint {
  return "pollster" in p;
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

export default function PollTrendChart({ config, theme: t, yMin, yMax }: { config: ModeConfig; theme: Theme; yMin: number; yMax: number }) {
  const ticks = useMemo(() => monthTicks(config.trend), [config.trend]);
  return (
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
  );
}
