"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { popVoteData, presIncParty, type PopVoteRow } from "@/data/popVoteData";

const RACE_TYPES = ["President", "House", "Senate", "Governor"] as const;
type RaceType = (typeof RACE_TYPES)[number];
const RACE_SHORT: Record<RaceType, string> = { President: "P", House: "H", Senate: "S", Governor: "G" };
type ViewMode = "pct" | "margin";

function formatVotes(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function marginLabel(demMinusRep: number): string {
  const abs = Math.abs(demMinusRep).toFixed(1);
  return demMinusRep >= 0 ? `D+${abs}` : `R+${abs}`;
}

type ChartPoint = {
  year: string;
  demPct: number;
  repPct: number;
  demMargin: number;
  // approval mapped to D+/R+ scale: D pres → presMargin as-is; R pres → -presMargin
  approvalY: number;
  presInc: PopVoteRow["presInc"];
  presApp: number;
  presMargin: number;
  demVotes: number;
  repVotes: number;
  totalVotes: number;
};

function toChartPoints(rows: PopVoteRow[]): ChartPoint[] {
  return [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: String(r.year),
      demPct: r.demPct,
      repPct: r.repPct,
      demMargin: -r.margin,
      approvalY: presIncParty(r.presInc) === "dem" ? r.presMargin : -r.presMargin,
      presInc: r.presInc,
      presApp: r.presApp,
      presMargin: r.presMargin,
      demVotes: r.demVotes,
      repVotes: r.repVotes,
      totalVotes: r.totalVotes,
    }));
}

function ApprovalRow({ d, viewMode }: { d: ChartPoint; viewMode: ViewMode }) {
  const party = presIncParty(d.presInc);
  const color = party === "dem" ? "var(--party-dem)" : "var(--party-rep)";
  const value = viewMode === "pct"
    ? `${d.presApp.toFixed(1)}%`
    : `${d.presMargin > 0 ? "+" : ""}${d.presMargin.toFixed(1)}`;
  return (
    <div className="mt-1.5 pt-1.5 flex justify-between gap-6" style={{ borderTop: "1px solid var(--app-border)" }}>
      <span style={{ color: "var(--app-text-muted)" }}>{d.presInc} appr.</span>
      <span className="font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

function PctTooltip({ active, payload, label, showApproval }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  showApproval?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const demMargin = d.demPct - d.repPct;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 170 }}
    >
      <div className="font-bold mb-1.5" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="flex justify-between gap-6 mb-0.5">
        <span style={{ color: "var(--party-dem)" }}>Dem</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-dem)" }}>
          {d.demPct.toFixed(1)}% · {formatVotes(d.demVotes)}
        </span>
      </div>
      <div className="flex justify-between gap-6">
        <span style={{ color: "var(--party-rep)" }}>Rep</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-rep)" }}>
          {d.repPct.toFixed(1)}% · {formatVotes(d.repVotes)}
        </span>
      </div>
      <div
        className="mt-1.5 pt-1.5 font-bold font-mono text-sm text-center"
        style={{ borderTop: "1px solid var(--app-border)", color: demMargin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
      >
        {marginLabel(demMargin)}
      </div>
      {showApproval && <ApprovalRow d={d} viewMode="pct" />}
    </div>
  );
}

function MarginTooltip({ active, payload, label, showApproval }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  showApproval?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isDem = d.demMargin >= 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 170 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: isDem ? "var(--party-dem)" : "var(--party-rep)" }}>
        {marginLabel(d.demMargin)}
      </div>
      <div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
        {d.demPct.toFixed(1)}% vs {d.repPct.toFixed(1)}%
      </div>
      {showApproval && <ApprovalRow d={d} viewMode="margin" />}
    </div>
  );
}

function ApprovalTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const party = presIncParty(d.presInc);
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-semibold mb-0.5" style={{ color: party === "dem" ? "var(--party-dem)" : "var(--party-rep)" }}>
        {d.presInc} ({party === "dem" ? "D" : "R"})
      </div>
      <div className="font-bold font-mono text-sm" style={{ color: party === "dem" ? "var(--party-dem)" : "var(--party-rep)" }}>
        Net: {d.presMargin > 0 ? "+" : ""}{d.presMargin.toFixed(1)}
      </div>
      <div
        className="mt-1 pt-1 font-bold font-mono text-sm"
        style={{ borderTop: "1px solid var(--app-border)", color: d.approvalY >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
      >
        {marginLabel(d.approvalY)}
      </div>
    </div>
  );
}

function niceAxisConfig(vals: number[], targetTicks = 5): { domain: [number, number]; ticks: number[] } {
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const range = dataMax - dataMin || 1;
  const rawStep = range / targetTicks;
  const step = [1, 2, 5, 10, 15, 20, 25, 50].find((c) => c >= rawStep) ?? 50;
  const domainMin = Math.floor(dataMin / step) * step;
  const domainMax = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + 0.001; t += step) {
    ticks.push(+(t.toFixed(1)));
  }
  return { domain: [domainMin, domainMax], ticks };
}

function TabButton({ label, shortLabel, active, onClick }: { label: string; shortLabel?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
          : { color: "var(--app-text-muted)" }
      }
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : label}
    </button>
  );
}

export default function PopularVoteChart() {
  const [selected, setSelected] = useState<RaceType>("President");
  const [viewMode, setViewMode] = useState<ViewMode>("pct");
  const [showApproval, setShowApproval] = useState(false);

  const rows = popVoteData
    .filter((r) => r.type === selected)
    .sort((a, b) => b.year - a.year);
  const chartPoints = toChartPoints(popVoteData.filter((r) => r.type === selected));

  const axisConfig = (() => {
    if (viewMode === "pct") {
      const vals = showApproval
        ? chartPoints.flatMap((p) => [p.demPct, p.repPct, p.presApp])
        : chartPoints.flatMap((p) => [p.demPct, p.repPct]);
      return niceAxisConfig(vals, 5);
    } else {
      const vals = showApproval
        ? chartPoints.flatMap((p) => [p.demMargin, p.approvalY])
        : chartPoints.map((p) => p.demMargin);
      return niceAxisConfig(vals, 5);
    }
  })();

  const tooltipContent = viewMode === "pct"
    ? <PctTooltip showApproval={showApproval} />
    : <MarginTooltip showApproval={showApproval} />;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
    >
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 pt-4 pb-0">
        {/* Race type tabs */}
        <div className="flex gap-1">
          {RACE_TYPES.map((type) => (
            <TabButton key={type} label={type} shortLabel={RACE_SHORT[type]} active={selected === type} onClick={() => setSelected(type)} />
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1">
          <TabButton label="%" active={viewMode === "pct"} onClick={() => setViewMode("pct")} />
          <TabButton label="Margin" active={viewMode === "margin"} onClick={() => setViewMode("margin")} />
          <div className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
          <TabButton label="Approval" active={showApproval} onClick={() => setShowApproval((v) => !v)} />
        </div>
      </div>

      {/* Line chart */}
      <div className="px-4 pt-4 pb-2" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "var(--app-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={axisConfig.domain}
              ticks={axisConfig.ticks}
              tickFormatter={(v) => viewMode === "pct" ? `${v}%` : marginLabel(v)}
              tick={{ fontSize: 10, fill: "var(--app-text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            <ReferenceLine
              y={viewMode === "pct" ? 50 : 0}
              stroke="var(--app-border)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <Tooltip content={tooltipContent} cursor={{ stroke: "var(--app-border)", strokeWidth: 1 }} />

            {viewMode === "pct" ? (
              <>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
                      {value === "demPct" ? "Democrat" : "Republican"}
                    </span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="demPct"
                  name="demPct"
                  stroke="var(--party-dem)"
                  strokeWidth={2.5}
                  dot={{ r: 7, fill: "var(--party-dem)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="repPct"
                  name="repPct"
                  stroke="var(--party-rep)"
                  strokeWidth={2.5}
                  dot={{ r: 7, fill: "var(--party-rep)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="demMargin"
                stroke="var(--party-dem)"
                strokeWidth={2.5}
                dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                  <circle
                    key={`margin-${payload.year}`}
                    cx={cx ?? 0}
                    cy={cy ?? 0}
                    r={7}
                    fill={payload.demMargin >= 0 ? "var(--party-dem)" : "var(--party-rep)"}
                  />
                )}
                activeDot={{ r: 5 }}
              />
            )}
            {showApproval && (
              <Line
                type="monotone"
                dataKey={viewMode === "pct" ? "presApp" : "approvalY"}
                strokeWidth={0}
                dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                  <circle
                    key={`approval-${payload.year}`}
                    cx={cx ?? 0}
                    cy={cy ?? 0}
                    r={7}
                    fill={presIncParty(payload.presInc) === "dem" ? "var(--party-dem)" : "var(--party-rep)"}
                    opacity={0.45}
                  />
                )}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div style={{ borderTop: "1px solid var(--app-border)" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--app-tab-bg)" }}>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Year</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--party-dem)", fontSize: 9 }}>Dem%</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--party-rep)", fontSize: 9 }}>Rep%</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Margin</th>
              {(selected === "Senate" || selected === "Governor") && (
                <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Races</th>
              )}
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Pres Appr.</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Total Votes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const demMargin = -r.margin;
              return (
                <tr
                  key={r.year}
                  style={{
                    background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                    borderTop: "1px solid var(--app-border)",
                  }}
                >
                  <td className="px-4 py-2 font-medium" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: "var(--party-dem)" }}>{r.demPct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: "var(--party-rep)" }}>{r.repPct.toFixed(1)}%</td>
                  <td
                    className="px-4 py-2 text-right font-mono font-bold"
                    style={{ color: demMargin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
                  >
                    {marginLabel(demMargin)}
                  </td>
                  {(selected === "Senate" || selected === "Governor") && (
                    <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {r.totalRaces}
                    </td>
                  )}
                  <td
                    className="px-4 py-2 text-right font-mono font-semibold"
                    style={{ color: presIncParty(r.presInc) === "dem" ? "var(--party-dem)" : "var(--party-rep)" }}
                  >
                    {r.presMargin > 0 ? "+" : ""}{r.presMargin.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono hidden sm:table-cell" style={{ color: "var(--app-text-muted)" }}>
                    {formatVotes(r.totalVotes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
