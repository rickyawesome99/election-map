"use client";

import { useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { FIG } from "@/components/ResultRowKit";
import { TH, rowMotion } from "@/components/results/ui";
import type { MrGrade, MrProbBucket, MrSeats } from "@/lib/modelReview2026Types";

// Charts and small pieces of the 2026 Model Review. Everything is drawn in the site's tokens:
// party blue and red carry direction (Democrats to the left, Republicans to the right, as on
// every margin track on the site), ink and greys carry everything else. Bars are HTML so their
// labels keep a readable size on a phone; the plots that need two axes are SVG.

const INK = "var(--app-text-primary)", MUTED = "var(--app-text-muted)", FAINT = "var(--app-text-very-muted)", RULE = "var(--app-border)";

// ── hover layer ───────────────────────────────────────────────────────────────

/** A pointer- and focus-following tooltip: `const [tip, bind] = useTip()`, render `tip`, spread `bind(body)` on a mark. */
export function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const bind = (body: ReactNode) => ({
    onMouseMove: (e: MouseEvent) => setTip({ x: e.clientX, y: e.clientY, body }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: FocusEvent) => { const b = (e.target as Element).getBoundingClientRect(); setTip({ x: b.left + b.width / 2, y: b.bottom - 8, body }); },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div role="tooltip" className="pointer-events-none fixed z-50 max-w-[260px] rounded-md px-2.5 py-1.5 text-xs leading-snug shadow-lg"
      style={{ left: Math.max(8, Math.min(tip.x + 12, (typeof window === "undefined" ? 9999 : window.innerWidth) - 270)), top: tip.y + 14, background: "var(--app-panel)", border: `1px solid ${RULE}`, color: INK }}>
      {tip.body}
    </div>
  );
  return [node, bind] as const;
}

// ── text pieces ───────────────────────────────────────────────────────────────

/** A paragraph of the review's running text. */
export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <p className="max-w-[70ch] text-[15px] leading-relaxed" style={muted ? { color: MUTED } : undefined}>{children}</p>;
}
export function Prose({ children }: { children: ReactNode }) {
  return <div className="mb-6 space-y-3">{children}</div>;
}

/** A term the reader needs before the section's chart makes sense: a ruled aside, not a box. */
export function Explain({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="my-5 max-w-[70ch] pl-4 text-sm leading-relaxed" style={{ borderLeft: `2px solid ${INK}` }}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{term}</div>
      <div style={{ color: MUTED }}>{children}</div>
    </div>
  );
}

/** A chart with its title above and its reading note below. */
export function Figure({ title, note, legend, children }: { title: string; note?: ReactNode; legend?: ReactNode; children: ReactNode }) {
  return (
    <figure className="my-6">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm font-semibold">{title}</span>
        {legend && <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MUTED }}>{legend}</span>}
      </figcaption>
      {children}
      {note && <p className="mt-2 max-w-[76ch] text-xs leading-relaxed" style={{ color: FAINT }}>{note}</p>}
    </figure>
  );
}
export function Key({ color, children, line, hollow }: { color: string; children: ReactNode; line?: boolean | "dashed"; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {line
        ? <span aria-hidden className="inline-block w-4" style={{ borderTop: `2px ${line === "dashed" ? "dashed" : "solid"} ${color}` }} />
        : <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={hollow ? { border: `2px solid ${color}` } : { background: color }} />}
      {children}
    </span>
  );
}

const GRADE_INK: Record<MrGrade, number> = { A: 6, B: 13, C: 24, D: 40, F: 100 };
/** A letter grade; the heavier the chip, the bigger the miss. */
export function Grade({ g }: { g: MrGrade }) {
  return (
    <span className="inline-block w-6 rounded-[3px] text-center text-xs font-bold leading-5" title={`Grade ${g}`}
      style={{ background: `color-mix(in srgb, ${INK} ${GRADE_INK[g]}%, transparent)`, color: g === "F" ? "var(--app-bg)" : INK }}>{g}</span>
  );
}

/** The site's flat table for a handful of fixed rows. The first column is text, the rest figures. */
export function FlatTable({ head, rows, label, strong = [], leftCols = 1, minWidth }: { head: ReactNode[]; rows: ReactNode[][]; label: string; strong?: number[]; leftCols?: number; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={label} style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col" className={`${TH} ${i < leftCols ? "text-left" : "text-right"}`} style={{ color: MUTED, borderBottom: `1px solid ${RULE}`, whiteSpace: "normal", verticalAlign: "bottom" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} {...rowMotion(i)}>
              {r.map((c, j) => <td key={j} className={`px-2 py-2 align-top tabular-nums ${j < leftCols ? "text-left" : "whitespace-nowrap text-right"} ${strong.includes(i) ? "font-semibold" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── bars ──────────────────────────────────────────────────────────────────────

export type BarValue = { v: number; color?: string; name?: string; text?: string };
export type BarRow = { label: ReactNode; sub?: ReactNode; values: BarValue[]; strong?: boolean };

/**
 * Horizontal bars on one shared axis. With `diverging`, zero sits inside the track and a negative
 * value (a Democratic one) runs left; otherwise every bar starts at the left edge. Each bar
 * carries its own value, so nothing depends on colour alone.
 */
export function HBars({ rows, min = 0, max, diverging = false, ticks = [], tickText, labelWidth = "9rem", ariaLabel }: {
  rows: BarRow[]; min?: number; max: number; diverging?: boolean; ticks?: number[]; tickText?: string[]; labelWidth?: string; ariaLabel: string;
}) {
  const x = (v: number) => ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100;
  const zero = x(0);
  return (
    <div role="img" aria-label={ariaLabel} className="text-sm">
      {ticks.length > 0 && (
        <div className="grid items-end gap-x-3" style={{ gridTemplateColumns: `${labelWidth} minmax(0,1fr)` }} aria-hidden>
          <span />
          <div className="relative mx-9 h-4 text-[10px]" style={{ color: FAINT }}>
            {ticks.map((t, i) => <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${x(t)}%` }}>{tickText?.[i] ?? t}</span>)}
          </div>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} data-touch-hover="" className="vh-hover grid items-center gap-x-3 py-1.5" style={{ gridTemplateColumns: `${labelWidth} minmax(0,1fr)`, borderBottom: `1px solid ${RULE}` }}>
          <div className="min-w-0 leading-tight">
            <div className={row.strong ? "font-semibold" : ""}>{row.label}</div>
            {row.sub && <div className="text-xs" style={{ color: MUTED }}>{row.sub}</div>}
          </div>
          <div className="relative mx-9 space-y-1 py-0.5">
            {ticks.map((t) => <span key={t} aria-hidden className="absolute -bottom-1.5 -top-1.5 w-px" style={{ left: `${x(t)}%`, background: t === 0 ? FAINT : RULE }} />)}
            {row.values.map((b, j) => {
              const to = x(b.v), neg = diverging && b.v < 0;
              const left = diverging ? Math.min(zero, to) : 0, width = Math.max(0.6, diverging ? Math.abs(to - zero) : to);
              const text = b.text ?? b.v.toFixed(1);
              return (
                <div key={j} className="relative h-3.5" title={b.name ? `${b.name}: ${text}` : text}>
                  <span className={`${neg ? "vh-bar-r" : "vh-bar-d"} absolute inset-y-0`} style={{ left: `${left}%`, width: `${width}%`, background: (b.color ?? INK).replace(/var\(--party-(dem|rep|ind)\)/, "var(--party-$1-fill)"), borderRadius: neg ? "4px 0 0 4px" : "0 4px 4px 0" }} />
                  <span className="vh-margin absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-semibold tabular-nums"
                    style={neg ? { right: `calc(${100 - left}% + 5px)`, transformOrigin: "right center" } : { left: `calc(${left + width}% + 5px)`, transformOrigin: "left center" }}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── seat distribution ─────────────────────────────────────────────────────────

/** The forecast's simulated spread of Democratic seats, its 80% range shaded, the result as a heavy line. */
export function SeatHist({ name, seats }: { name: string; seats: MrSeats }) {
  const [tip, bind] = useTip();
  const W = 340, H = 190, m = { l: 8, r: 8, t: 30, b: 26 };
  const h = seats.hist, lo = Math.min(h[0][0], seats.actual, seats.majority) - 1, hi = Math.max(h[h.length - 1][0], seats.actual) + 1, mx = Math.max(...h.map((d) => d[1]));
  // The House histogram has a long empty tail; draw the part that holds the mass.
  const from = name === "House" ? Math.max(lo, 195) : lo, to = name === "House" ? Math.min(hi, 285) : hi;
  const x = (v: number) => m.l + ((v - from) / (to - from)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - (v / mx) * (H - m.t - m.b);
  const bw = Math.max(1, (W - m.l - m.r) / (to - from) - (name === "House" ? 0.6 : 2));
  const end = x(seats.actual) > W * 0.62;
  return (
    <div className="vh-in min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs" style={{ color: MUTED }}>{seats.inRange ? "inside" : "outside"} the 80% range</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${name}: forecast ${seats.mean.toFixed(1)} Democratic seats, 80% range ${seats.lo} to ${seats.hi}, result ${seats.actual}`}>
        <rect x={x(seats.lo - 0.5)} y={m.t} width={x(seats.hi + 0.5) - x(seats.lo - 0.5)} height={H - m.t - m.b} fill={`color-mix(in srgb, ${INK} 6%, transparent)`} />
        {h.filter((d) => d[0] >= from && d[0] <= to).map((d) => (
          <rect key={d[0]} x={x(d[0]) - bw / 2} y={y(d[1])} width={bw} height={H - m.b - y(d[1])} fill={FAINT} {...bind(<><b>{d[0]} seats</b><br />{(100 * d[1]).toFixed(1)}% of simulations</>)} />
        ))}
        <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke={RULE} />
        <line x1={x(seats.actual)} x2={x(seats.actual)} y1={m.t - 8} y2={H - m.b} stroke={INK} strokeWidth="2.5" />
        <text x={x(seats.actual) + (end ? -6 : 6)} y={m.t - 12} textAnchor={end ? "end" : "start"} fontSize="13" fontWeight="700" fill={INK} style={{ fontFamily: "var(--font-serif)" }}>Result {seats.actual}</text>
        {[[seats.lo, String(seats.lo)], [seats.hi, String(seats.hi)], [seats.mean, seats.mean.toFixed(1)]].map(([v, t], i) => (
          <text key={i} x={x(v as number)} y={H - 8} textAnchor="middle" fontSize="11" fontWeight={i === 2 ? 700 : 400} fill={i === 2 ? INK : MUTED}>{t}</text>
        ))}
      </svg>
      {tip}
    </div>
  );
}

// ── calibration ───────────────────────────────────────────────────────────────

/** Forecast chance for the favourite against how often favourites won, one dot per confidence band. */
export function CalibrationPlot({ buckets }: { buckets: MrProbBucket[] }) {
  const [tip, bind] = useTip();
  const W = 520, H = 400, m = { l: 52, r: 18, t: 16, b: 46 };
  const x = (p: number) => m.l + ((p - 0.5) / 0.5) * (W - m.l - m.r), y = (p: number) => m.t + ((1 - p) / 0.65) * (H - m.t - m.b);
  const maxN = Math.max(...buckets.map((b) => b.n));
  return (
    <div className="max-w-[560px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Calibration: forecast chance for the favourite against the share of favourites that won">
        {[0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((p) => (
          <g key={p}><line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} stroke={RULE} /><text x={m.l - 8} y={y(p) + 4} textAnchor="end" fontSize="12" fill={MUTED}>{Math.round(p * 100)}%</text></g>
        ))}
        {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((p) => <text key={p} x={x(p)} y={H - m.b + 18} textAnchor="middle" fontSize="12" fill={MUTED}>{Math.round(p * 100)}%</text>)}
        <text x={m.l + (W - m.l - m.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill={INK}>Forecast chance for the favourite</text>
        <text transform={`translate(13 ${m.t + (H - m.t - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill={INK}>Favourites that won</text>
        <line x1={x(0.5)} y1={y(0.5)} x2={x(1)} y2={y(1)} stroke={MUTED} strokeDasharray="5 4" strokeWidth="1.2" />
        {buckets.map((b) => {
          const share = b.won / b.n;
          return (
            <circle key={b.label} cx={x(b.meanP)} cy={y(Math.max(0.36, share))} r={5 + 11 * Math.sqrt(b.n / maxN)} fill={INK} fillOpacity="0.82" stroke="var(--app-bg)" strokeWidth="2" tabIndex={0}
              {...bind(<><b>Favourite at {b.label}</b><br />{b.won} of {b.n} won ({Math.round(share * 100)}%)<br />Forecast said {Math.round(b.meanP * 100)}% on average</>)} />
          );
        })}
      </svg>
      {tip}
    </div>
  );
}

// ── poll-weight curves ────────────────────────────────────────────────────────

export type WeightCurve = { name: string; mae: number[]; best: number; bestMae: number; stroke: string; dash?: string };

/** Average error in polled races as the weight on the polls runs from 0 to 1. */
export function WeightCurves({ name, ws, used, curves }: { name: string; ws: number[]; used: number; curves: WeightCurve[] }) {
  const [tip, bind] = useTip();
  const W = 340, H = 240, m = { l: 30, r: 10, t: 14, b: 34 };
  const all = curves.flatMap((c) => c.mae), lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
  const x = (v: number) => m.l + v * (W - m.l - m.r), y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  return (
    <div className="vh-in min-w-0">
      <div className="text-sm font-semibold">{name}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${name}: average error by the weight given to polls`}>
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((v) => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={RULE} /><text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{v}</text></g>)}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <text key={v} x={x(v)} y={H - m.b + 15} textAnchor="middle" fontSize="11" fill={MUTED}>{v === 0 ? "0" : v === 1 ? "1" : v}</text>)}
        <text x={m.l} y={H - 4} fontSize="10.5" fill={FAINT}>fundamentals only</text>
        <text x={W - m.r} y={H - 4} textAnchor="end" fontSize="10.5" fill={FAINT}>polls only</text>
        <line x1={x(used)} x2={x(used)} y1={m.t} y2={H - m.b} stroke={INK} strokeWidth="1" />
        <text x={x(used) + 4} y={m.t + 9} fontSize="11" fontWeight="700" fill={INK}>used {used.toFixed(2)}</text>
        {curves.map((c) => (
          <g key={c.name}>
            <polyline fill="none" stroke={c.stroke} strokeWidth="2" strokeDasharray={c.dash} strokeLinejoin="round" points={ws.map((v, i) => `${x(v)},${y(c.mae[i]).toFixed(1)}`).join(" ")} />
            <circle cx={x(c.best)} cy={y(c.bestMae)} r="5" fill={c.stroke} stroke="var(--app-bg)" strokeWidth="2" tabIndex={0} {...bind(<><b>{name}</b> · {c.name}<br />Lowest error at a weight of {c.best.toFixed(2)}: {c.bestMae.toFixed(2)} points</>)} />
          </g>
        ))}
      </svg>
      {tip}
    </div>
  );
}

/** A big serif figure with a caption, for the summary row (server-safe twin of results/ui Stat). */
export function BigStat({ value, label, color, delay = 0 }: { value: ReactNode; label: ReactNode; color?: string; delay?: number }) {
  return (
    <div className="vh-in vh-hover min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="vh-margin inline-block tabular-nums" style={{ ...FIG, fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color, transformOrigin: "left center" }}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-snug" style={{ color: MUTED }}>{label}</div>
    </div>
  );
}
