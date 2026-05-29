"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TabKey = "house" | "senate" | "governor" | "president" | "state_house" | "state_senate";

const TAB_ORDER: TabKey[] = ["house", "senate", "governor", "president", "state_house", "state_senate"];
const TAB_LABELS: Record<TabKey, string> = { house: "H", senate: "S", governor: "G", president: "P", state_house: "StH", state_senate: "StS" };

type VoteResultInput = {
  year: number;
  race: string;
  demPct: number;
  repPct: number;
  label?: string;
};

type ChartPoint = {
  year: string;
  race: string;
  repMargin: number;
  demPct: number;
  repPct: number;
};

type ChartRenderPoint = ChartPoint & Record<string, number | string>;
type SegmentLine = { key: string };

function getRaceKey(race: string): TabKey | null {
  const l = race.toLowerCase();
  if (l.includes("president")) return "president";
  if (l === "state senate") return "state_senate";
  if (l === "state house") return "state_house";
  if (l.includes("senate")) return "senate";
  if (l.includes("governor")) return "governor";
  if (l.includes("house")) return "house";
  return null;
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

function MarginTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isRep = d.repMargin >= 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: isRep ? "var(--party-rep)" : "var(--party-dem)" }}>
        {marginLabel(d.repMargin)}
      </div>
      <div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
        {d.race} · D {d.demPct.toFixed(1)}% R {d.repPct.toFixed(1)}%
      </div>
    </div>
  );
}

function getChartPoints(tab: TabKey, results: VoteResultInput[]): ChartPoint[] {
  return results
    .filter(r => getRaceKey(r.race) === tab)
    .sort((a, b) => a.year - b.year || a.race.localeCompare(b.race))
    .map(r => ({
      year: r.label ?? String(r.year),
      race: r.race,
      repMargin: parseFloat((r.repPct - r.demPct).toFixed(1)),
      demPct: r.demPct,
      repPct: r.repPct,
    }));
}

function buildSegmentLines(points: ChartPoint[]): {
  chartData: ChartRenderPoint[];
  segments: SegmentLine[];
} {
  const chartData: ChartRenderPoint[] = points.map((point) => ({ ...point }));
  const segments: SegmentLine[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const key = `segment_${i}`;
    chartData[i][key] = points[i].repMargin;
    chartData[i + 1][key] = points[i + 1].repMargin;
    segments.push({ key });
  }

  return { chartData, segments };
}

export default function StateVoteHistoryChart({ results }: { results: VoteResultInput[] }) {
  const availableTabs = TAB_ORDER.filter(
    tab => getChartPoints(tab, results).length >= 1
  );

  const [activeTab, setActiveTab] = useState<TabKey>(() => availableTabs[0] ?? "house");

  if (availableTabs.length === 0) return null;

  const chartPoints = getChartPoints(activeTab, results);
  const axisConfig = niceAxisConfig(chartPoints.map(p => p.repMargin));
  const { chartData, segments } = buildSegmentLines(chartPoints);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Vote History
        </h2>
        {availableTabs.length > 1 && (
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--app-border)", opacity: 0.92 }}>
            {availableTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="text-[10px] font-semibold px-2 py-1 transition-colors"
                style={
                  activeTab === tab
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                    : { background: "var(--app-panel)", color: "var(--app-text-muted)" }
                }
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-2 pb-3" style={{ height: 400 }}>
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
              content={<MarginTooltip />}
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
              dataKey="repMargin"
              stroke="transparent"
              strokeWidth={8}
              connectNulls={false}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                <circle
                  key={`dot-${payload.year}`}
                  cx={cx ?? 0}
                  cy={cy ?? 0}
                  r={6}
                  fill={payload.repMargin >= 0 ? "#be1c29" : "#1b408c"}
                  strokeWidth={0}
                />
              )}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
