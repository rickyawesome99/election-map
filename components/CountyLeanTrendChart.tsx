"use client";

import { useEffect, useRef, useState } from "react";
import { NO_RECHARTS, useRecharts } from "@/lib/useRecharts";
import type { YearAggregation } from "@/lib/tplCompute";
import { fmtMargin, marginColor, fmtLean, leanColor } from "@/lib/colorScale";
import { niceAxisConfig } from "@/lib/chartAxis";

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
      <div className="font-bold font-mono text-sm" style={{ color: leanColor(d.wrs) }}>{fmtLean(d.wrs)}</div>
    </div>
  );
}

/**
 * Each cycle's weighted lean (WRS), the per-year input the TPL blends. `reference` draws the
 * blended figure itself as a dashed line, so the eye can see which cycles pull it where.
 */
export default function CountyLeanTrendChart({ yearAggregations, reference, height = 140, fitAxis = false }: { yearAggregations: YearAggregation[]; reference?: { value: number; label: string }; height?: number; /** Fit the axis to the data instead of anchoring it at Even. */ fitAxis?: boolean }) {
  const [chartReady, setChartReady] = useState(false);
  const recharts = useRecharts(); // loads after hydration (lib/useRecharts)
  const { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } = recharts ?? NO_RECHARTS;
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
  // when racesPresent is non-empty (see lib/tplCompute.ts's aggregateYears). A year with
  // no races isn't a gap in the trend, it's a cycle this state simply doesn't vote in
  // (odd years outside VA/NJ/KY/MS etc.), so drop it from the axis entirely rather than
  // plotting a hole that breaks the line into disconnected dots.
  const chartPoints: ChartPoint[] = yearAggregations
    .slice()
    .sort((a, b) => a.year - b.year)
    .filter((agg) => agg.racesPresent.length > 0)
    .map((agg) => ({
      year: String(agg.year),
      wrs: parseFloat(agg.WRS.toFixed(1)),
    }));

  if (chartPoints.length === 0) return null;

  const vals = chartPoints.map((p) => p.wrs).filter((v): v is number => v != null);
  const axisConfig = niceAxisConfig(reference ? [...vals, reference.value] : vals, { includeZero: !fitAxis });
  const { chartData, segments } = buildSegmentLines(chartPoints);

  return (
    <div ref={chartHostRef} className="min-w-0" style={{ height }}>
      {chartReady && recharts && chartSize.width > 0 && chartSize.height > 0 && (
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
            tickFormatter={(v) => fmtLean(v)}
            tick={{ fontSize: 9, fill: "var(--app-text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <CartesianGrid vertical={false} stroke="var(--app-border)" strokeOpacity={0.42} strokeDasharray="2 5" />
          <ReferenceLine y={0} stroke="var(--app-text-muted)" strokeOpacity={0.55} strokeDasharray="4 3" strokeWidth={1.25} />
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke={leanColor(reference.value)}
              strokeOpacity={0.8}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{ value: reference.label, position: "insideTopRight", fontSize: 10, fill: leanColor(reference.value) }}
            />
          )}
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
