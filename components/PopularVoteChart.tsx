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

function marginLabel(repMinusDem: number): string {
  const abs = Math.abs(repMinusDem).toFixed(1);
  return repMinusDem >= 0 ? `R+${abs}` : `D+${abs}`;
}

function seatsMarginLabel(rMinusD: number): string {
  if (rMinusD === 0) return "EVEN";
  const abs = Math.abs(rMinusD);
  return rMinusD > 0 ? `R+${abs}` : `D+${abs}`;
}

type ChartPoint = {
  year: string;
  demPct: number;
  repPct: number;
  repMargin: number;
  // approval mapped to R+/D+ scale: R pres → presMargin as-is; D pres → -presMargin
  approvalY: number;
  presInc: PopVoteRow["presInc"];
  presApp: number;
  presMargin: number;
  demVotes: number;
  repVotes: number;
  totalVotes: number;
  seatsD: number;
  seatsR: number;
  seatsMargin: number; // seatsR - seatsD (positive = R ahead)
};

function toChartPoints(rows: PopVoteRow[]): ChartPoint[] {
  return [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: String(r.year),
      demPct: r.demPct,
      repPct: r.repPct,
      repMargin: r.margin,
      approvalY: presIncParty(r.presInc) === "dem" ? -r.presMargin : r.presMargin,
      presInc: r.presInc,
      presApp: r.presApp,
      presMargin: r.presMargin,
      demVotes: r.demVotes,
      repVotes: r.repVotes,
      totalVotes: r.totalVotes,
      seatsD: r.seatsD,
      seatsR: r.seatsR,
      seatsMargin: r.seatsR - r.seatsD,
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
  const repMargin = d.repPct - d.demPct;
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
        style={{ borderTop: "1px solid var(--app-border)", color: repMargin >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
      >
        {marginLabel(repMargin)}
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
  const isRep = d.repMargin >= 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 170 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: isRep ? "var(--party-rep)" : "var(--party-dem)" }}>
        {marginLabel(d.repMargin)}
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
        style={{ borderTop: "1px solid var(--app-border)", color: d.approvalY >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
      >
        {marginLabel(d.approvalY)}
      </div>
    </div>
  );
}

function SeatsRawTooltip({ active, payload, label, selected }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  selected: RaceType;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const seatWord = selected === "President" ? "EV" : "seats";
  const rMinusD = d.seatsMargin;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1.5" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="flex justify-between gap-6 mb-0.5">
        <span style={{ color: "var(--party-dem)" }}>Dem</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-dem)" }}>{d.seatsD} {seatWord}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span style={{ color: "var(--party-rep)" }}>Rep</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-rep)" }}>{d.seatsR} {seatWord}</span>
      </div>
      <div
        className="mt-1.5 pt-1.5 font-bold font-mono text-sm text-center"
        style={{ borderTop: "1px solid var(--app-border)", color: rMinusD <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
      >
        {seatsMarginLabel(rMinusD)}
      </div>
    </div>
  );
}

function SeatsMarginTooltip({ active, payload, label, selected }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  selected: RaceType;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const seatWord = selected === "President" ? "EV" : "seats";
  const isR = d.seatsMargin > 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 150 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: isR ? "var(--party-rep)" : "var(--party-dem)" }}>
        {seatsMarginLabel(d.seatsMargin)}
      </div>
      <div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
        {d.seatsD}D · {d.seatsR}R {seatWord}
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

function TabButton({ label, shortLabel, active, disabled, onClick }: { label: string; shortLabel?: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
      style={
        disabled
          ? { color: "var(--app-text-very-muted)", cursor: "not-allowed" }
          : active
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
  const [showSeats, setShowSeats] = useState(false);
  const [showApproval, setShowApproval] = useState(false);

  const rows = popVoteData
    .filter((r) => r.type === selected)
    .sort((a, b) => b.year - a.year);
  const chartPoints = toChartPoints(popVoteData.filter((r) => r.type === selected));

  const axisConfig = (() => {
    if (showSeats) {
      if (viewMode === "margin") {
        return niceAxisConfig(chartPoints.map((p) => p.seatsMargin), 5);
      }
      const vals = chartPoints.flatMap((p) => [p.seatsD, p.seatsR]);
      return niceAxisConfig(vals, 5);
    }
    if (viewMode === "pct") {
      const vals = showApproval
        ? chartPoints.flatMap((p) => [p.demPct, p.repPct, p.presApp])
        : chartPoints.flatMap((p) => [p.demPct, p.repPct]);
      return niceAxisConfig(vals, 5);
    } else {
      const vals = showApproval
        ? chartPoints.flatMap((p) => [p.repMargin, p.approvalY])
        : chartPoints.map((p) => p.repMargin);
      return niceAxisConfig(vals, 5);
    }
  })();

  const tooltipContent = showSeats
    ? (viewMode === "margin"
        ? <SeatsMarginTooltip selected={selected} />
        : <SeatsRawTooltip selected={selected} />)
    : (viewMode === "pct"
        ? <PctTooltip showApproval={showApproval} />
        : <MarginTooltip showApproval={showApproval} />);

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
          <TabButton label="Seats" active={showSeats} onClick={() => { setShowSeats((v) => { if (!v) setShowApproval(false); return !v; }); }} />
          <div className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
          <TabButton label="Approval" active={showApproval} disabled={showSeats} onClick={() => setShowApproval((v) => !v)} />
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
              tickFormatter={(v) => {
                if (showSeats) return viewMode === "margin" ? seatsMarginLabel(v) : String(v);
                return viewMode === "pct" ? `${v}%` : marginLabel(v);
              }}
              tick={{ fontSize: 10, fill: "var(--app-text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            {(!showSeats || viewMode === "margin") && (
              <ReferenceLine
                y={showSeats ? 0 : viewMode === "pct" ? 50 : 0}
                stroke="var(--app-border)"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            )}
            <Tooltip content={tooltipContent} cursor={{ stroke: "var(--app-border)", strokeWidth: 1 }} />

            {showSeats ? (
              viewMode === "margin" ? (
                <Line
                  type="monotone"
                  dataKey="seatsMargin"
                  stroke="var(--app-text-muted)"
                  strokeWidth={2.5}
                  dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                    <circle
                      key={`seatmargin-${payload.year}`}
                      cx={cx ?? 0}
                      cy={cy ?? 0}
                      r={7}
                      fill={payload.seatsMargin <= 0 ? "#1b408c" : "#be1c29"}
                    />
                  )}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ) : (
                <>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
                        {value === "seatsD" ? "Democrat" : "Republican"}
                      </span>
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="seatsD"
                    name="seatsD"
                    stroke="#1b408c"
                    strokeWidth={2.5}
                    dot={{ r: 7, fill: "#1b408c", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="seatsR"
                    name="seatsR"
                    stroke="#be1c29"
                    strokeWidth={2.5}
                    dot={{ r: 7, fill: "#be1c29", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </>
              )
            ) : viewMode === "pct" ? (
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
                  stroke="#1b408c"
                  strokeWidth={2.5}
                  dot={{ r: 7, fill: "#1b408c", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="repPct"
                  name="repPct"
                  stroke="#be1c29"
                  strokeWidth={2.5}
                  dot={{ r: 7, fill: "#be1c29", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="repMargin"
                stroke="var(--app-text-muted)"
                strokeWidth={2.5}
                dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                  <circle
                    key={`margin-${payload.year}`}
                    cx={cx ?? 0}
                    cy={cy ?? 0}
                    r={7}
                    fill={payload.repMargin >= 0 ? "#be1c29" : "#1b408c"}
                  />
                )}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
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
                    fill={presIncParty(payload.presInc) === "dem" ? "#1b408c" : "#be1c29"}
                    opacity={0.45}
                  />
                )}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--app-border)" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ background: "var(--app-tab-bg)" }}>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Year</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--party-dem)", fontSize: 9 }}>Dem%</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--party-rep)", fontSize: 9 }}>Rep%</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Margin</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>{selected === "President" ? "EV" : "Seats"}</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Pres Appr.</th>
              {(selected === "Senate" || selected === "Governor") && (
                <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Races</th>
              )}
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", fontSize: 9 }}>Total Votes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              return (
                <tr
                  key={r.year}
                  style={{
                    background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                    borderTop: "1px solid var(--app-border)",
                  }}
                >
                  <td className="px-4 py-2 font-medium" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                  <td className="px-4 py-2 text-left font-mono font-semibold" style={{ color: "var(--party-dem)" }}>{r.demPct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-left font-mono font-semibold" style={{ color: "var(--party-rep)" }}>{r.repPct.toFixed(1)}%</td>
                  <td
                    className="px-4 py-2 text-right font-mono font-bold"
                    style={{ color: r.margin >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                  >
                    {marginLabel(r.margin)}
                  </td>
                  <td className="px-4 py-2 text-left font-mono font-semibold whitespace-nowrap">
                    <span style={{ color: "var(--party-dem)" }}>{r.seatsD}D</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
                    <span style={{ color: "var(--party-rep)" }}>{r.seatsR}R</span>
                  </td>
                  <td
                    className="px-4 py-2 text-left font-mono font-semibold"
                    style={{ color: presIncParty(r.presInc) === "dem" ? "var(--party-dem)" : "var(--party-rep)" }}
                  >
                    {r.presMargin > 0 ? "+" : ""}{r.presMargin.toFixed(1)}
                  </td>
                  {(selected === "Senate" || selected === "Governor") && (
                    <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {r.totalRaces}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--app-text-muted)" }}>
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
