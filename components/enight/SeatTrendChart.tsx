"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SeatPoint } from "@/lib/resultsTypes";
import { fmtDateTime } from "@/lib/resultsFormat";

// The drawing half of the Results page's trend charts: an 80% band, the projection as a line, a
// dashed reference line, and a hover popup that follows the pointer (a finger dragged across the
// chart scrubs it). Used for a chamber's projected seats (SeatTrend) and a race's projected or
// counted margin (MarginTrend); the caller says how to colour and word a value.
//
// Plain SVG, sized by a ResizeObserver. It was Recharts until the page became an archive stepped
// through frame by frame: the three seat charts re-ran Recharts' store on every step, about a third
// of a step's work on a phone. This draws the same picture for a fraction of that.

const MARGIN = 4;
/** The popup reads the line at the pointer's time, rounded to this step, so it glides across. */
const STEP_MS = 60_000;

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

/** The line, band and bounds at time t, joining the recorded points by straight lines. */
function valueAt(points: SeatPoint[], t: number): SeatPoint {
  if (t <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (t >= last.t) return last;
  let a = 0, b = points.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (points[m].t <= t) a = m; else b = m; }
  const p = points[a], q = points[b], f = (t - p.t) / (q.t - p.t), mix = (x: number, y: number) => x + (y - x) * f;
  return { t, mean: mix(p.mean, q.mean), lo: mix(p.lo, q.lo), hi: mix(p.hi, q.hi) };
}

export default function TrendChart({ points, reference, lo, hi, topColor, bottomColor, colorOf, fmtValue, fmtRange, ticks, fmtTick, axisWidth = 34, title = "Projected", band = true, leadBlend }: TrendChartProps) {
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const left = MARGIN + (ticks ? axisWidth : 0), top = MARGIN;
  const geo = useMemo(() => {
    if (!size || points.length < 1) return null;
    const right = size.w - MARGIN, bottom = size.h - MARGIN;
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const x = (t: number) => (t1 > t0 ? left + ((t - t0) / (t1 - t0)) * (right - left) : (left + right) / 2);
    const y = (v: number) => top + ((hi - v) / (hi - lo || 1)) * (bottom - top);
    const xy = (p: SeatPoint, k: "mean" | "lo" | "hi") => `${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`;
    const line = `M${points.map((p) => xy(p, "mean")).join("L")}`;
    const area = band ? `M${points.map((p) => xy(p, "hi")).join("L")}L${[...points].reverse().map((p) => xy(p, "lo")).join("L")}Z` : null;
    return { right, bottom, t0, t1, x, y, line, area };
  }, [size, points, lo, hi, band, left, top]);
  const stops = useMemo(() => (leadBlend ? leadStops(points, reference, leadBlend, topColor, bottomColor) : null), [points, reference, leadBlend, topColor, bottomColor]);
  const color = colorOf(points[points.length - 1].mean);

  // The hovered moment: the pointer's time, on the minute, read off the line.
  const active = useMemo(() => {
    if (!hover || !geo) return null;
    const f = Math.max(0, Math.min(1, (hover.x - left) / (geo.right - left || 1)));
    const t = geo.t0 + Math.round((f * (geo.t1 - geo.t0)) / STEP_MS) * STEP_MS;
    return valueAt(points, Math.min(geo.t1, t));
  }, [hover, geo, points, left]);

  const at = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top }); };
  return (
    <div ref={box} className="relative h-full w-full">
      {geo && size && (
        <svg width={size.w} height={size.h} className="block overflow-visible" onPointerMove={at} onPointerDown={at} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
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
            {/* Values past the y range run off the chart (as Recharts' allowDataOverflow did). */}
            <clipPath id={`${id}-clip`}><rect x={left} y={top} width={Math.max(0, geo.right - left)} height={Math.max(0, geo.bottom - top)} /></clipPath>
          </defs>
          {ticks?.map((v) => (
            <g key={v}>
              {v !== reference && <line x1={left} x2={geo.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--app-border)" />}
              <text x={left - 4} y={geo.y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--app-text-very-muted)">{fmtTick ? fmtTick(v) : v}</text>
            </g>
          ))}
          <g clipPath={`url(#${id}-clip)`}>
            {geo.area && <path d={geo.area} fill={`url(#${id}-band)`} stroke="none" />}
            <line x1={left} x2={geo.right} y1={geo.y(reference)} y2={geo.y(reference)} stroke="var(--app-text-muted)" strokeDasharray="3 3" />
            <path d={geo.line} fill="none" stroke={stops ? `url(#${id}-lead)` : color} strokeWidth={2} strokeLinejoin="round" />
          </g>
          {active && (
            <g pointerEvents="none">
              <line x1={geo.x(active.t)} x2={geo.x(active.t)} y1={top} y2={geo.bottom} stroke="var(--app-text-muted)" strokeOpacity={0.7} />
              <circle cx={geo.x(active.t)} cy={geo.y(active.mean)} r={4} fill={colorOf(active.mean)} stroke="var(--app-panel)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {active && hover && size && (
        // The map hover boxes' chrome and type: an uppercase tracked label, the figure bold in its
        // colour. Beside the pointer, on whichever side has room; it may rise above the chart.
        <div className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px]"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", top: hover.y + 10, ...(hover.x > size.w / 2 ? { right: size.w - hover.x + 10 } : { left: hover.x + 10 }) }}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em]">
            <span style={{ color: "var(--app-text-primary)" }}>{title}</span>
            <span style={{ color: "var(--app-text-muted)" }}> · {fmtDateTime(active.t)}</span>
          </div>
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[13px] font-extrabold leading-none" style={{ color: colorOf(active.mean) }}>{fmtValue(active.mean)}</span>
            {band && <span className="leading-none" style={{ color: "var(--app-text-muted)" }}><span className="text-[10px] font-semibold uppercase tracking-[0.06em]">80%</span> {fmtRange(active.lo, active.hi)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
