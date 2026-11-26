"use client";

import { useMemo, useState } from "react";
import { MarginField, MarkerShape, Legend, Tip, marginAxis, partyFill, tickLabel, useWidth } from "@/components/MarginGraphKit";

// The past-election page's Polls section: every poll in the window as a dot (field end date ×
// margin, R up), the window's average as a dashed line, and the result on election day. Hover or
// tap a dot for the poll. Replaces the poll-by-poll table, which ran to 40+ rows in busy races.

export type ChartPoll = {
  pollster: string;
  partisan: "D" | "R" | null;
  startDate: string;
  endDate: string;
  sample: number | null;
  population: string | null;
  dem: number;
  rep: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmtDay = (ms: number) => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
function fmtField(start: string, end: string): string {
  const s = dayOf(start), e = dayOf(end);
  if (!Number.isFinite(s) || s === e) return fmtDay(e);
  const sd = new Date(s), ed = new Date(e);
  return sd.getUTCMonth() === ed.getUTCMonth() ? `${fmtDay(s)}–${ed.getUTCDate()}` : `${fmtDay(s)}–${fmtDay(e)}`;
}
const pct = (v: number) => `${v.toFixed(v % 1 ? 1 : 0)}%`;
const fmtR = (m: number) => (Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);

// A page-coloured outline under a label, so it stays legible over the dots.
const HALO = { paintOrder: "stroke", stroke: "var(--app-bg)", strokeWidth: 4, strokeLinejoin: "round" } as const;
const H = 280, PAD = { top: 18, right: 22, bottom: 30, left: 50 };

export default function PastPollsChart({ polls, electionDay, windowDays, avgDemMargin, result, demName, repName, demColor, repColor }: {
  polls: ChartPoll[];
  electionDay: string;
  windowDays: number;
  avgDemMargin: number;
  /** The result on the race the polls asked about, R-positive; null for a runoff. */
  result: number | null;
  demName: string;
  repName: string;
  demColor: string;
  repColor: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const compact = width > 0 && width < 520;
  const avg = -avgDemMargin;

  const x1Ms = dayOf(electionDay), x0Ms = x1Ms - windowDays * DAY;
  const { lo, hi, ticks } = useMemo(
    () => marginAxis([...polls.map((p) => p.rep - p.dem), avg, ...(result != null ? [result] : [])]),
    [polls, avg, result],
  );
  const x0 = PAD.left, x1 = Math.max(x0 + 1, width - PAD.right);
  const y0 = PAD.top, y1 = H - PAD.bottom;
  const x = (ms: number) => x0 + ((ms - x0Ms) / (x1Ms - x0Ms)) * (x1 - x0);
  const y = (v: number) => y0 + ((hi - v) / (hi - lo)) * (y1 - y0);

  // Polls that share an end date and land on nearly the same margin fan out sideways a little.
  const pts = useMemo(() => {
    const seen = new Map<string, number>();
    return polls.map((p) => {
      const m = p.rep - p.dem;
      const key = `${p.endDate}|${Math.round(m)}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const nudge = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5;
      return { p, m, px: x(dayOf(p.endDate)) + nudge, py: y(m) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls, width, lo, hi]);

  // Weekly date ticks counted back from election day.
  const dateTicks: number[] = [];
  const step = windowDays > 30 ? 14 : 7;
  for (let t = x1Ms - step * DAY; t >= x0Ms; t -= step * DAY) dateTicks.push(t);

  function pick(clientX: number, clientY: number, rect: DOMRect) {
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = -1, bestD = 18 * 18;
    pts.forEach((q, i) => { const d = (q.px - mx) ** 2 + (q.py - my) ** 2; if (d < bestD) { bestD = d; best = i; } });
    setHover(best >= 0 ? best : null);
  }

  const h = hover != null ? pts[hover] : null;
  const legendDot = (fill: string, hollow = false) => <circle cx={13} cy={6} r={4.5} fill={hollow ? "var(--app-bg)" : fill} stroke={fill} strokeWidth={hollow ? 2 : 1} />;

  return (
    <div className="mt-5">
      <div ref={ref} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${polls.length} polls ending in the final ${windowDays} days, averaging ${fmtR(avg)}${result != null ? `; result ${fmtR(result)}` : ""}.`}
            onPointerMove={(ev) => pick(ev.clientX, ev.clientY, ev.currentTarget.getBoundingClientRect())}
            onPointerDown={(ev) => pick(ev.clientX, ev.clientY, ev.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            style={{ touchAction: "pan-y", display: "block" }}
          >
            <MarginField x0={x0} x1={x1} y={y} ticks={ticks} lo={lo} hi={hi} compact={compact} />
            {dateTicks.map((t) => (
              <text key={t} x={x(t)} y={y1 + 18} textAnchor="middle" fontSize={compact ? 10 : 11} fill="var(--app-text-very-muted)">{fmtDay(t)}</text>
            ))}
            <line x1={x1} x2={x1} y1={y0} y2={y1} stroke="var(--app-text-muted)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <text x={x1} y={y1 + 18} textAnchor="end" fontSize={compact ? 10 : 11} fontWeight={600} fill="var(--app-text-muted)">Election day</text>

            {/* The window's average. */}
            <line x1={x0} x2={x1} y1={y(avg)} y2={y(avg)} stroke={partyFill(avg)} strokeWidth={2} strokeDasharray="6 4" />

            {pts.map((q, i) => {
              const fill = partyFill(q.m);
              return (
                <circle
                  key={i}
                  cx={q.px}
                  cy={q.py}
                  r={hover === i ? 6.5 : 4.5}
                  fill={q.p.partisan ? "var(--app-bg)" : fill}
                  fillOpacity={q.p.partisan ? 1 : 0.72}
                  stroke={q.p.partisan ? fill : "var(--app-bg)"}
                  strokeWidth={q.p.partisan ? 2 : 1}
                />
              );
            })}


            <text x={x0 + 6} y={y(avg) + (avg >= 0 ? -7 : 14)} fontSize={11} fontWeight={700} fill={partyFill(avg)} style={HALO}>Average {tickLabel(Math.round(avg * 10) / 10)}</text>

            {/* The result, on election day. */}
            {result != null && (
              <g>
                <MarkerShape shape="diamond" x={x1} y={y(result)} r={6.5} fill={partyFill(result)} stroke="var(--app-bg)" strokeWidth={1.5} />
                <text x={x1 - 4} y={result >= avg || y(result) + 22 > y1 ? y(result) - 11 : y(result) + 19} textAnchor="end" fontSize={11} fontWeight={700} fill={partyFill(result)} style={HALO}>
                  Result {fmtR(result)}
                </text>
              </g>
            )}
          </svg>
        )}
        {h && (
          <Tip x={h.px} width={width} top={Math.max(0, Math.min(h.py - 40, H - 120))} flat>
            <div className="font-semibold">{h.p.pollster}{h.p.partisan && <span className="ml-1 font-normal" style={{ color: "var(--app-text-very-muted)" }}>({h.p.partisan})</span>}</div>
            <div className="text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>
              {fmtField(h.p.startDate, h.p.endDate)}{h.p.sample != null ? ` · ${h.p.sample.toLocaleString("en-US")}${h.p.population ? ` ${h.p.population.toUpperCase()}` : ""}` : ""}
            </div>
            <div className="mt-1 tabular-nums">
              <span style={{ color: demColor }}>{demName} {pct(h.p.dem)}</span>
              <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
              <span style={{ color: repColor }}>{repName} {pct(h.p.rep)}</span>
              <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
              <b style={{ color: partyFill(h.m) }}>{fmtR(h.m)}</b>
            </div>
          </Tip>
        )}
      </div>
      <div className="mt-2">
        <Legend items={[
          { key: "poll", label: "Poll (by field end date)", swatch: legendDot("var(--app-text-muted)") },
          ...(polls.some((p) => p.partisan) ? [{ key: "partisan", label: "Partisan sponsor", swatch: legendDot("var(--app-text-muted)", true) }] : []),
          { key: "avg", label: "Average", swatch: <line x1={1} x2={25} y1={6} y2={6} stroke="var(--app-text-muted)" strokeWidth={2} strokeDasharray="6 4" /> },
          ...(result != null ? [{ key: "result", label: "Result", swatch: <MarkerShape shape="diamond" x={13} y={6} r={5} fill="var(--app-text-muted)" stroke="none" /> }] : []),
        ]} />
      </div>
    </div>
  );
}
