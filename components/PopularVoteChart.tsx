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
import { popVoteData, type PopVoteRow } from "@/data/popVoteData";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { LedgerSectionHead } from "@/components/RaceDetailSections";

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

// presMargin is net approval (app - disapp) for the sitting president at election time —
// this is what ties a cycle's national margin back to the midterm-penalty/coattails story.
function approvalCaption(presInc: PopVoteRow["presInc"], presMargin: number): string {
  const sign = presMargin >= 0 ? "+" : "−";
  return `${presInc} approval net ${sign}${Math.abs(presMargin).toFixed(1)}`;
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
  margin: number;
  presInc: PopVoteRow["presInc"];
  presMargin: number;
  demVotes: number;
  repVotes: number;
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
      margin: r.margin,
      presInc: r.presInc,
      presMargin: r.presMargin,
      demVotes: r.demVotes,
      repVotes: r.repVotes,
      seatsD: r.seatsD,
      seatsR: r.seatsR,
      seatsMargin: r.seatsR - r.seatsD,
    }));
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

function PctTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 180 }}
    >
      <div className="font-bold mb-1.5" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="flex justify-between gap-6 mb-0.5">
        <span style={{ color: "var(--party-dem)" }}>Dem</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-dem)" }}>
          {d.demPct.toFixed(1)}% &middot; {formatVotes(d.demVotes)}
        </span>
      </div>
      <div className="flex justify-between gap-6">
        <span style={{ color: "var(--party-rep)" }}>Rep</span>
        <span className="font-mono font-semibold" style={{ color: "var(--party-rep)" }}>
          {d.repPct.toFixed(1)}% &middot; {formatVotes(d.repVotes)}
        </span>
      </div>
      <div
        className="mt-1.5 pt-1.5 font-bold font-mono text-sm text-center"
        style={{ borderTop: "1px solid var(--app-border)", color: marginColor(d.margin) }}
      >
        {fmtMargin(d.margin)}
      </div>
      <div className="mt-1.5 pt-1.5 text-[11px]" style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
        {approvalCaption(d.presInc, d.presMargin)}
      </div>
    </div>
  );
}

function MarginTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", minWidth: 170 }}
    >
      <div className="font-bold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="font-bold font-mono text-sm" style={{ color: marginColor(d.margin) }}>
        {fmtMargin(d.margin)}
      </div>
      <div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
        {d.demPct.toFixed(1)}% vs {d.repPct.toFixed(1)}%
      </div>
      <div className="mt-1.5 pt-1.5 text-[11px]" style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
        {approvalCaption(d.presInc, d.presMargin)}
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
        style={{ borderTop: "1px solid var(--app-border)", color: d.seatsMargin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
      >
        {seatsMarginLabel(d.seatsMargin)}
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
        {d.seatsD}D &middot; {d.seatsR}R {seatWord}
      </div>
    </div>
  );
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

function HistoryRow({ row, seatWord }: { row: PopVoteRow; seatWord: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="font-bold" style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", color: "var(--app-text-primary)" }}>
            {row.year}
          </span>
          <span className="text-sm">
            <span className="font-semibold" style={{ color: "var(--party-dem)" }}>{row.demPct.toFixed(1)}%</span>
            <span style={{ color: "var(--app-text-very-muted)" }}> vs </span>
            <span className="font-semibold" style={{ color: "var(--party-rep)" }}>{row.repPct.toFixed(1)}%</span>
          </span>
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {approvalCaption(row.presInc, row.presMargin)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular-nums font-extrabold text-lg leading-none" style={{ color: marginColor(row.margin) }}>
          {fmtMargin(row.margin)}
        </div>
        <div className="tabular-nums text-xs font-semibold mt-1.5">
          <span style={{ color: "var(--party-dem)" }}>{row.seatsD}D</span>
          <span style={{ color: "var(--app-text-very-muted)" }}>&ndash;</span>
          <span style={{ color: "var(--party-rep)" }}>{row.seatsR}R</span>
          <span className="ml-1" style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>{seatWord}</span>
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text-very-muted)" }}>
          {formatVotes(row.totalVotes)} votes
        </div>
      </div>
    </div>
  );
}

export default function PopularVoteChart() {
  const [selected, setSelected] = useState<RaceType>("President");
  const [viewMode, setViewMode] = useState<ViewMode>("pct");
  const [showSeats, setShowSeats] = useState(false);

  const rows = popVoteData.filter((r) => r.type === selected).sort((a, b) => b.year - a.year);
  const chartPoints = toChartPoints(rows);
  const seatWord = selected === "President" ? "EV" : "Seats";

  const axisConfig = showSeats
    ? viewMode === "margin"
      ? niceAxisConfig(chartPoints.map((p) => p.seatsMargin), 5)
      : niceAxisConfig(chartPoints.flatMap((p) => [p.seatsD, p.seatsR]), 5)
    : viewMode === "pct"
      ? niceAxisConfig(chartPoints.flatMap((p) => [p.demPct, p.repPct]), 5)
      : niceAxisConfig(chartPoints.map((p) => p.margin), 5);

  const tooltipContent = showSeats
    ? (viewMode === "margin" ? <SeatsMarginTooltip selected={selected} /> : <SeatsRawTooltip selected={selected} />)
    : (viewMode === "pct" ? <PctTooltip /> : <MarginTooltip />);

  return (
    <div>
      <div className="county-spread">
        <div className="col-left">
          <div>
            <div className="mb-3 flex gap-1">
              {RACE_TYPES.map((type) => (
                <TabButton key={type} label={type} shortLabel={RACE_SHORT[type]} active={selected === type} onClick={() => setSelected(type)} />
              ))}
            </div>
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={axisConfig.domain}
                    ticks={axisConfig.ticks}
                    tickFormatter={(v) => {
                      if (showSeats) return viewMode === "margin" ? seatsMarginLabel(v) : String(v);
                      return viewMode === "pct" ? `${v}%` : fmtMargin(v);
                    }}
                    tick={{ fontSize: 10, fill: "var(--app-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
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
                          <circle key={`seatmargin-${payload.year}`} cx={cx ?? 0} cy={cy ?? 0} r={7} fill={payload.seatsMargin <= 0 ? "#1b408c" : "#be1c29"} />
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
                          stroke="#1b408c"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#1b408c", strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="seatsR"
                          stroke="#be1c29"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#be1c29", strokeWidth: 0 }}
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
                            {value === "demPct" ? "Democratic share" : "Republican share"}
                          </span>
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="demPct"
                        stroke="#1b408c"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#1b408c", strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="repPct"
                        stroke="#be1c29"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#be1c29", strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="margin"
                      stroke="var(--app-text-muted)"
                      strokeWidth={2.5}
                      dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ChartPoint }) => (
                        <circle key={`margin-${payload.year}`} cx={cx ?? 0} cy={cy ?? 0} r={7} fill={payload.margin >= 0 ? "#be1c29" : "#1b408c"} />
                      )}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex justify-start gap-2 pt-2" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className="flex items-center gap-1">
                <TabButton label="%" active={viewMode === "pct"} onClick={() => setViewMode("pct")} />
                <TabButton label="Margin" active={viewMode === "margin"} onClick={() => setViewMode("margin")} />
                <div className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
                <TabButton label="Seats" active={showSeats} onClick={() => setShowSeats((v) => !v)} />
              </div>
            </div>
          </div>
        </div>

        <div className="rule" />

        <div className="col-right">
          <LedgerSectionHead
            label="Election History"
            meta={`${rows.length} cycle${rows.length !== 1 ? "s" : ""} since ${rows[rows.length - 1].year}`}
          />
          <div className="county-spread-fade" style={{ maxHeight: 310, overflowY: "auto", paddingRight: 6 }}>
            {rows.map((r) => (
              <HistoryRow key={r.year} row={r} seatWord={seatWord} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
