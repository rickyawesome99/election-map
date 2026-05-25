"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { DetailPastResult } from "@/components/RaceDetailSections";

type ChartPoint = {
  year: string;
  repMargin: number;
  // nationalDiff: positive = seat more R than national
  natY: number | null;
  demPct: number;
  repPct: number;
};

type ChartRenderPoint = ChartPoint & Record<string, number | string | null>;
type SegmentLine = { key: string };

function marginLabel(v: number): string {
  const abs = Math.abs(v).toFixed(1);
  return v >= 0 ? `R+${abs}` : `D+${abs}`;
}

function niceAxisConfig(vals: number[]): { domain: [number, number]; ticks: number[] } {
  if (vals.length === 0) return { domain: [-10, 10], ticks: [-10, -5, 0, 5, 10] };
  const boundedVals = vals.map((v) => Math.max(-100, Math.min(100, v)));
  const dataMin = Math.min(...boundedVals);
  const dataMax = Math.max(...boundedVals);
  const range = dataMax - dataMin || 1;
  const rawStep = range / 5;
  const step = [1, 2, 5, 10, 15, 20, 25, 50].find((c) => c >= rawStep) ?? 50;
  const domainMin = Math.max(-100, Math.floor(dataMin / step) * step);
  const domainMax = Math.min(100, Math.ceil(dataMax / step) * step);
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + 0.001; t += step) ticks.push(+(t.toFixed(1)));
  return { domain: [domainMin, domainMax], ticks };
}

function MarginTooltip({ active, payload, label, showNational }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  showNational?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const val = showNational ? d.natY : d.repMargin;
  if (val == null) return null;
  const displayValue = showNational ? val : d.repMargin;
  const displayIsRep = displayValue >= 0;
  const nationalDiffLabel = val === 0
    ? "Even with nation"
    : `${Math.abs(val).toFixed(1)} points more ${val >= 0 ? "R" : "D"} than nation`;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: displayIsRep ? "var(--party-rep)" : "var(--party-dem)" }}>
        {marginLabel(displayValue)}
      </div>
      <div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
        {showNational ? nationalDiffLabel : `D ${d.demPct.toFixed(1)}% R ${d.repPct.toFixed(1)}%`}
      </div>
    </div>
  );
}

function buildSegmentLines(points: ChartPoint[], dataKey: "repMargin" | "natY"): {
  chartData: ChartRenderPoint[];
  segments: SegmentLine[];
} {
  const chartData: ChartRenderPoint[] = points.map((point) => ({ ...point }));
  const segments: SegmentLine[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i][dataKey];
    const end = points[i + 1][dataKey];
    if (start == null || end == null) continue;

    const key = `segment_${i}`;
    chartData[i][key] = start;
    chartData[i + 1][key] = end;
    segments.push({ key });
  }

  return { chartData, segments };
}

export default function SeatVoteHistoryChart({ results }: { results: DetailPastResult[] }) {
  const [showNational, setShowNational] = useState(false);

  const chartPoints: ChartPoint[] = (results ?? [])
    .filter(r => !r.placeholder && !r.electionType?.toLowerCase().includes("special"))
    .sort((a, b) => a.year - b.year)
    .map(r => ({
      year: String(r.year),
      repMargin: parseFloat((r.repPct - r.demPct).toFixed(1)),
      natY: r.nationalDiff != null ? parseFloat((r.nationalDiff).toFixed(1)) : null,
      demPct: r.demPct,
      repPct: r.repPct,
    }));

  if (chartPoints.length < 1) return null;

  const hasNational = chartPoints.some(p => p.natY != null);

  const marginVals = chartPoints.map(p => p.repMargin);
  const natVals = chartPoints.map(p => p.natY).filter((v): v is number => v != null);
  const activeVals = showNational ? natVals : marginVals;
  const axisConfig = niceAxisConfig(activeVals);

  const activeDataKey = showNational ? "natY" : "repMargin";
  const { chartData, segments } = buildSegmentLines(chartPoints, activeDataKey);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Vote History
        </h2>
        {hasNational && (
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--app-border)", opacity: 0.92 }}>
            <button
              onClick={() => setShowNational(v => !v)}
              className="text-[10px] font-semibold px-2 py-1 transition-colors"
              style={
                showNational
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "var(--app-panel)", color: "var(--app-text-muted)" }
              }
            >
              N
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pt-2 pb-3" style={{ height: 255 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "var(--app-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={axisConfig.domain}
              allowDataOverflow
              ticks={axisConfig.ticks}
              tickFormatter={(v) => marginLabel(v)}
              tick={{ fontSize: 10, fill: "var(--app-text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <CartesianGrid
              vertical={false}
              stroke="var(--app-border)"
              strokeOpacity={0.5}
              strokeDasharray="3 4"
            />
            <ReferenceLine y={0} stroke="var(--app-border)" strokeDasharray="4 3" strokeWidth={1} />
            <Tooltip
              content={<MarginTooltip showNational={showNational} />}
              cursor={{ stroke: "var(--app-border)", strokeWidth: 1 }}
            />
            {segments.map(({ key }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke="var(--app-text-muted)"
                strokeWidth={2.5}
                connectNulls={false}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey={activeDataKey}
              stroke="transparent"
              strokeWidth={8}
              connectNulls={false}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => {
                const val = showNational ? payload.natY : payload.repMargin;
                if (val == null) return <g key={`empty-${payload.year}`} />;
                return (
                  <circle
                    key={`dot-${payload.year}`}
                    cx={cx ?? 0}
                    cy={cy ?? 0}
                    r={6}
                    fill={val >= 0 ? "#be1c29" : "#1b408c"}
                    strokeWidth={0}
                  />
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
