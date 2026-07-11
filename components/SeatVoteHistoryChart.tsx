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
type SegmentLine = { key: string; stroke: string };

const REP_STROKE = "var(--party-rep-muted)";
const DEM_STROKE = "var(--party-dem-muted)";
const EVEN_STROKE = "var(--party-ind-muted)";

function strokeForMargin(v: number): string {
  if (Math.abs(v) < 0.05) return EVEN_STROKE;
  return v >= 0 ? REP_STROKE : DEM_STROKE;
}

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

function MarginTooltip({ active, payload, showNational, electionType }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  showNational?: boolean;
  electionType: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const val = showNational ? d.natY : d.repMargin;
  if (val == null) return null;
  const displayValue = showNational ? val : d.repMargin;
  const displayIsRep = displayValue >= 0;
  const displayColor = displayIsRep ? "var(--party-rep)" : "var(--party-dem)";
  const nationalDiffLabel = val === 0
    ? "Even with nation"
    : `${Math.abs(val).toFixed(1)} points more ${val >= 0 ? "R" : "D"} than nation`;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>
        {d.year} {electionType}
      </div>
      <div className="font-bold font-mono text-sm" style={{ color: displayColor }}>
        {marginLabel(displayValue)}
      </div>
      {showNational ? (
        <div className="mt-0.5" style={{ color: displayColor }}>
          {nationalDiffLabel}
        </div>
      ) : (
        <div className="mt-0.5 flex gap-2">
          <span style={{ color: "var(--party-dem)" }}>D {d.demPct.toFixed(1)}%</span>
          <span style={{ color: "var(--party-rep)" }}>R {d.repPct.toFixed(1)}%</span>
        </div>
      )}
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
    segments.push({ key, stroke: strokeForMargin((start + end) / 2) });
  }

  return { chartData, segments };
}

export default function SeatVoteHistoryChart({
  results,
  electionType = "Election",
  bare = false,
}: {
  results: DetailPastResult[];
  electionType?: string;
  bare?: boolean;
}) {
  const [showNational, setShowNational] = useState(false);
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

  const chart = (
    <>
      <div className={`${bare ? "shrink-0 pb-2" : "px-3 pt-3 pb-1"} flex items-center justify-between`}>
        {!bare && (
          <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
            Vote History
          </h2>
        )}
        {bare && <div />}
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

      <div
        ref={chartHostRef}
        className={`${bare ? "flex-1 px-1" : "px-4"} min-w-0 pt-1 pb-2`}
        style={bare ? { minHeight: 0 } : { height: 320 }}
      >
        {chartReady && chartSize.width > 0 && chartSize.height > 0 && (
            <LineChart width={chartSize.width} height={chartSize.height} data={chartData} margin={{ top: 10, right: 12, bottom: 2, left: 0 }}>
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
              strokeOpacity={0.42}
              strokeDasharray="2 5"
            />
            <ReferenceLine y={0} stroke="var(--app-text-muted)" strokeOpacity={0.55} strokeDasharray="4 3" strokeWidth={1.25} />
            <Tooltip
              content={<MarginTooltip showNational={showNational} electionType={electionType} />}
              cursor={{ stroke: "var(--app-border)", strokeWidth: 1 }}
            />
            {segments.map(({ key, stroke }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={stroke}
                strokeWidth={3}
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
              dataKey={activeDataKey}
              stroke="transparent"
              strokeWidth={8}
              connectNulls={false}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => {
                const val = showNational ? payload.natY : payload.repMargin;
                if (val == null) return <g key={`empty-${payload.year}`} />;
                return (
                  <g key={`dot-${payload.year}`}>
                    <circle cx={cx ?? 0} cy={cy ?? 0} r={7} fill={val >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)"} />
                    <circle
                      cx={cx ?? 0}
                      cy={cy ?? 0}
                      r={4.75}
                      fill={val >= 0 ? "var(--party-rep)" : "var(--party-dem)"}
                      stroke="var(--app-panel)"
                      strokeWidth={1.5}
                    />
                  </g>
                );
              }}
              activeDot={{ r: 6, stroke: "var(--app-panel)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            </LineChart>
        )}
      </div>
    </>
  );

  if (bare) return <div className="flex h-full min-w-0 flex-col">{chart}</div>;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
    >
      {chart}
    </div>
  );
}
