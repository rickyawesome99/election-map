"use client";

import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { YearAggregation } from "@/lib/tplCompute";
import { fmtMargin, marginColor } from "@/lib/colorScale";

type ChartPoint = { year: string; wrs: number | null };
type ChartRenderPoint = ChartPoint & Record<string, number | string | null>;
type SegmentLine = { key: string; stroke: string };

const REP_STROKE = "var(--party-rep-muted)";
const DEM_STROKE = "var(--party-dem-muted)";
const EVEN_STROKE = "var(--party-ind-muted)";

function strokeForMargin(v: number): string {
  if (Math.abs(v) < 0.05) return EVEN_STROKE;
  return v >= 0 ? REP_STROKE : DEM_STROKE;
}

function niceAxisConfig(vals: number[]): { domain: [number, number]; ticks: number[] } {
  if (vals.length === 0) return { domain: [-10, 10], ticks: [-10, -5, 0, 5, 10] };
  const boundedVals = vals.map((v) => Math.max(-100, Math.min(100, v)));
  const dataMin = Math.min(...boundedVals, 0);
  const dataMax = Math.max(...boundedVals, 0);
  const range = dataMax - dataMin || 1;
  const rawStep = range / 5;
  const step = [1, 2, 5, 10, 15, 20, 25, 50].find((c) => c >= rawStep) ?? 50;
  const domainMin = Math.max(-100, Math.floor(dataMin / step) * step);
  const domainMax = Math.min(100, Math.ceil(dataMax / step) * step);
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + 0.001; t += step) ticks.push(+(t.toFixed(1)));
  return { domain: [domainMin, domainMax], ticks };
}

function buildSegmentLines(points: ChartPoint[]): { chartData: ChartRenderPoint[]; segments: SegmentLine[] } {
  const chartData: ChartRenderPoint[] = points.map((point) => ({ ...point }));
  const segments: SegmentLine[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i].wrs;
    const end = points[i + 1].wrs;
    if (start == null || end == null) continue;

    const key = `segment_${i}`;
    chartData[i][key] = start;
    chartData[i + 1][key] = end;
    segments.push({ key, stroke: strokeForMargin((start + end) / 2) });
  }

  return { chartData, segments };
}

function WrsTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.wrs == null) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 110 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{d.year}</div>
      <div className="font-bold font-mono text-sm" style={{ color: marginColor(d.wrs) }}>{fmtMargin(d.wrs)}</div>
    </div>
  );
}

export default function CountyLeanTrendChart({ yearAggregations }: { yearAggregations: YearAggregation[] }) {
  const [chartReady, setChartReady] = useState(false);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const host = chartHostRef.current;
    if (!host) return;

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      setChartSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // WRS defaults to 0 even for a year with no races present at all - only trust it
  // when racesPresent is non-empty (see lib/tplCompute.ts's aggregateYears), otherwise
  // treat the year as a genuine gap rather than a fabricated EVEN point.
  const chartPoints: ChartPoint[] = yearAggregations
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((agg) => ({
      year: String(agg.year),
      wrs: agg.racesPresent.length > 0 ? parseFloat(agg.WRS.toFixed(1)) : null,
    }));

  if (chartPoints.every((p) => p.wrs == null)) return null;

  const vals = chartPoints.map((p) => p.wrs).filter((v): v is number => v != null);
  const axisConfig = niceAxisConfig(vals);
  const { chartData, segments } = buildSegmentLines(chartPoints);

  return (
    <div ref={chartHostRef} className="min-w-0" style={{ height: 140 }}>
      {chartReady && chartSize.width > 0 && chartSize.height > 0 && (
        <LineChart width={chartSize.width} height={chartSize.height} data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: "var(--app-text-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={axisConfig.domain}
            allowDataOverflow
            ticks={axisConfig.ticks}
            tickFormatter={(v) => fmtMargin(v)}
            tick={{ fontSize: 9, fill: "var(--app-text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <CartesianGrid vertical={false} stroke="var(--app-border)" strokeOpacity={0.42} strokeDasharray="2 5" />
          <ReferenceLine y={0} stroke="var(--app-text-muted)" strokeOpacity={0.55} strokeDasharray="4 3" strokeWidth={1.25} />
          <Tooltip content={<WrsTooltip />} cursor={{ stroke: "var(--app-border)", strokeWidth: 1 }} />
          {segments.map(({ key, stroke }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="monotone"
            dataKey="wrs"
            stroke="transparent"
            strokeWidth={8}
            connectNulls={false}
            dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => {
              if (payload.wrs == null) return <g key={`empty-${payload.year}`} />;
              return (
                <g key={`dot-${payload.year}`}>
                  <circle cx={cx ?? 0} cy={cy ?? 0} r={6} fill={payload.wrs >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)"} />
                  <circle
                    cx={cx ?? 0}
                    cy={cy ?? 0}
                    r={4}
                    fill={payload.wrs >= 0 ? "var(--party-rep)" : "var(--party-dem)"}
                    stroke="var(--app-panel)"
                    strokeWidth={1.5}
                  />
                </g>
              );
            }}
            activeDot={{ r: 5.5, stroke: "var(--app-panel)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}
