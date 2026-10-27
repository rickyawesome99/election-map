"use client";

import { useId, useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeatPoint } from "@/lib/resultsTypes";

// The Recharts half of the Results page's trend charts (loaded on its own, like the Overview's
// PollTrendChart): an 80% band, the projection as a line, a dashed reference line, and a hover
// popup that behaves like the Overview's polling charts: it follows the pointer, and a finger
// dragged across the chart scrubs it. Used for a chamber's expected seats (SeatTrend) and a
// race's projected margin (MarginTrend); the caller says how to colour and word a value.

const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

type Row = SeatPoint & { band: [number, number] };

/** Rows the hover steps through: the recorded points joined by straight lines and sampled about
 *  once a minute (at most MAX_ROWS), so the popup glides across the chart like the Overview's
 *  daily trends instead of jumping between refreshes. The drawn line is the same either way. */
const MAX_ROWS = 400;
const STEP_MS = 60_000;
function densify(points: SeatPoint[]): Row[] {
  const row = (p: SeatPoint): Row => ({ ...p, band: [p.lo, p.hi] });
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const step = Math.max(STEP_MS, (t1 - t0) / MAX_ROWS);
  const out: Row[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    out.push(row(a));
    for (let t = a.t + step; t < b.t - step / 2; t += step) {
      const f = (t - a.t) / (b.t - a.t), mix = (x: number, y: number) => x + (y - x) * f;
      out.push(row({ t, mean: mix(a.mean, b.mean), lo: mix(a.lo, b.lo), hi: mix(a.hi, b.hi) }));
    }
  }
  out.push(row(points[points.length - 1]));
  return out;
}

export type TrendChartProps = {
  points: SeatPoint[];
  /** The dashed line: the majority, or an even race. */
  reference: number;
  /** The y range. */
  lo: number;
  hi: number;
  /** The band's colour at the top and the bottom of the chart. */
  topColor: string;
  bottomColor: string;
  colorOf: (v: number) => string;
  fmtValue: (v: number) => string;
  fmtRange: (lo: number, hi: number) => string;
  /** A labelled y axis on the left, with faint gridlines at each tick (the margin chart). */
  ticks?: number[];
  fmtTick?: (v: number) => string;
  axisWidth?: number;
  /** The popup's heading ("Projected" by default) and whether there is an 80% band to draw. */
  title?: string;
  band?: boolean;
  /** Colour the line by who leads: topColor above the reference, bottomColor below, blending
   *  through purple within `leadBlend` of it (the counted margin chart). */
  leadBlend?: number;
};

/** The line's vertical gradient for `leadBlend`: stops at the line's own top and bottom and at the
 *  blend points between, each coloured by its value (stops are offsets of the line's bounding box). */
function leadStops(points: SeatPoint[], reference: number, blend: number, top: string, bottom: string) {
  const vals = points.map((p) => p.mean), max = Math.max(...vals), min = Math.min(...vals);
  if (max - min < 1e-6) return null;
  const purple = `color-mix(in srgb, ${top} 50%, ${bottom})`;
  const colorAt = (v: number) => {
    const f = Math.max(-1, Math.min(1, (v - reference) / blend));
    return f >= 0 ? `color-mix(in srgb, ${top} ${(f * 100).toFixed(0)}%, ${purple})` : `color-mix(in srgb, ${bottom} ${(-f * 100).toFixed(0)}%, ${purple})`;
  };
  const at = [max, reference + blend, reference, reference - blend, min].filter((v) => v <= max && v >= min);
  return at.map((v) => ({ offset: `${(((max - v) / (max - min)) * 100).toFixed(2)}%`, color: colorAt(v) }));
}

function ChartTooltip({ active, payload, colorOf, fmtValue, fmtRange, title = "Projected", band = true }: { active?: boolean; payload?: Array<{ payload: Row }> } & Pick<TrendChartProps, "colorOf" | "fmtValue" | "fmtRange" | "title" | "band">) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="whitespace-nowrap rounded-md px-2.5 py-2 text-[11px]" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
      <div className="mb-1 font-semibold" style={{ color: "var(--app-text-primary)" }}>{title} · {fmtTime(p.t)}</div>
      <div className="tabular-nums">
        <span className="font-semibold" style={{ color: colorOf(p.mean) }}>{fmtValue(p.mean)}</span>
        {band && <><span style={{ color: "var(--app-text-very-muted)" }}> · </span>
        <span style={{ color: "var(--app-text-muted)" }}>80% {fmtRange(p.lo, p.hi)}</span></>}
      </div>
    </div>
  );
}

export default function TrendChart({ points, reference, lo, hi, topColor, bottomColor, colorOf, fmtValue, fmtRange, ticks, fmtTick, axisWidth = 34, title, band = true, leadBlend }: TrendChartProps) {
  const id = useId().replace(/:/g, "");
  const rows = useMemo(() => densify(points), [points]);
  const color = colorOf(points[points.length - 1].mean);
  const stops = useMemo(() => (leadBlend ? leadStops(points, reference, leadBlend, topColor, bottomColor) : null), [points, reference, leadBlend, topColor, bottomColor]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={`${id}-band`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={topColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={bottomColor} stopOpacity="0.18" />
          </linearGradient>
          {stops && (
            <linearGradient id={`${id}-lead`} x1="0" x2="0" y1="0" y2="1">
              {stops.map((s, i) => <stop key={i} offset={s.offset} style={{ stopColor: s.color }} />)}
            </linearGradient>
          )}
        </defs>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" hide />
        {ticks
          ? <YAxis domain={[lo, hi]} ticks={ticks} tickFormatter={fmtTick} width={axisWidth} axisLine={false} tickLine={false} interval={0} allowDataOverflow tick={{ fontSize: 10, fill: "var(--app-text-very-muted)" }} />
          : <YAxis domain={[lo, hi]} hide allowDataOverflow />}
        {ticks?.filter((v) => v !== reference).map((v) => <ReferenceLine key={v} y={v} stroke="var(--app-border)" />)}
        <Tooltip
          content={<ChartTooltip colorOf={colorOf} fmtValue={fmtValue} fmtRange={fmtRange} title={title} band={band} />}
          cursor={{ stroke: "var(--app-text-muted)", strokeWidth: 1, strokeOpacity: 0.7 }}
          isAnimationActive={false}
          animationDuration={0}
          wrapperStyle={{ transition: "none", zIndex: 20 }}
          allowEscapeViewBox={{ x: false, y: true }}
        />
        {band && <Area dataKey="band" stroke="none" fill={`url(#${id}-band)`} isAnimationActive={false} activeDot={false} />}
        <ReferenceLine y={reference} stroke="var(--app-text-muted)" strokeDasharray="3 3" />
        <Line dataKey="mean" stroke={stops ? `url(#${id}-lead)` : color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color, stroke: "var(--app-panel)", strokeWidth: 2 }} type="linear" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
