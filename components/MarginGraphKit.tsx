"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

/**
 * Drawing parts shared by the hand-drawn margin graphs: the state page's results graph
 * (components/state/StateResultsGraph.tsx) and the race pages' vote-history graph
 * (components/RaceHistoryGraph.tsx). Margins are R-positive (R up, D down).
 */

// ── Geometry helpers ─────────────────────────────────────────────────────────

export type Pt = { x: number; y: number };

/** Monotone cubic (Fritsch–Carlson): smooth, but never overshoots a result it passes through. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const n = pts.length;
  const h: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(pts[i + 1].x - pts[i].x || 1e-6);
    m.push((pts[i + 1].y - pts[i].y) / h[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = h[i] / 3;
    d += ` C${pts[i].x + dx},${pts[i].y + t[i] * dx} ${pts[i + 1].x - dx},${pts[i + 1].y - t[i + 1] * dx} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** A margin axis that always includes 0 (the line between the parties) and lands on round ticks. */
export function marginAxis(values: number[]): { lo: number; hi: number; ticks: number[] } {
  const lo0 = Math.min(0, ...values);
  const hi0 = Math.max(0, ...values);
  const span = Math.max(hi0 - lo0, 8);
  const step = [2, 5, 10, 15, 20, 25, 50].find((s) => span / s <= 5) ?? 50;
  const lo = Math.floor((lo0 - span * 0.06) / step) * step;
  const hi = Math.ceil((hi0 + span * 0.06) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return { lo, hi, ticks };
}

export const tickLabel = (v: number) => (v === 0 ? "Even" : `${v > 0 ? "R" : "D"}+${Math.abs(v)}`);

export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Both sides of the element, for a graph that fills a fixed-height box. */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (r: { width: number; height: number }) => setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    const ro = new ResizeObserver(([e]) => read(e.contentRect));
    ro.observe(el);
    read(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * Eases a set of named numbers to new targets (ease-out cubic), so a graph can glide between
 * views instead of jumping. A key with no previous value starts at its target. Reduced motion
 * skips straight to the targets.
 */
export function useTweened(target: Record<string, number>, ms = 520): Record<string, number> {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const targetRef = useRef(target);
  const sig = Object.entries(target).map(([k, v]) => `${k}:${v}`).join("|");
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    const to = targetRef.current;
    const from = shownRef.current;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      const next: Record<string, number> = {};
      for (const k of Object.keys(to)) next[k] = from[k] != null ? from[k] + (to[k] - from[k]) * e : to[k];
      shownRef.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sig, ms]);
  // Keys the tween hasn't reached yet (a series just switched on) show at their target.
  return Object.keys(target).every((k) => k in shown) ? shown : { ...target, ...shown };
}

// ── Shared pieces ────────────────────────────────────────────────────────────

export type Marker = "circle" | "square" | "diamond" | "triangle";

export function MarkerShape({ shape, x, y, r, fill, stroke, strokeWidth = 2, className, style }: { shape: Marker; x: number; y: number; r: number; fill: string; stroke: string; strokeWidth?: number; className?: string; style?: CSSProperties }) {
  const common = { fill, stroke, strokeWidth, className, style };
  if (shape === "square") return <rect x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} rx={1.5} {...common} />;
  if (shape === "diamond") return <path d={`M${x},${y - r * 1.2} L${x + r * 1.2},${y} L${x},${y + r * 1.2} L${x - r * 1.2},${y} Z`} strokeLinejoin="round" {...common} />;
  if (shape === "triangle") return <path d={`M${x},${y - r * 1.25} L${x + r * 1.15},${y + r * 0.8} L${x - r * 1.15},${y + r * 0.8} Z`} strokeLinejoin="round" {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

export function partyFill(margin: number) {
  return Math.abs(margin) < 0.05 ? "var(--app-text-muted)" : margin > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

/** A tooltip card that sits beside the hovered year and flips to the left past the middle. */
export function Tip({ x, width, top, minWidth = 180, children }: { x: number; width: number; top: number; minWidth?: number; children: ReactNode }) {
  const flip = x > width * 0.55;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md px-3 py-2 text-xs shadow-lg rg-tip"
      style={{
        top,
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        minWidth,
        maxWidth: 260,
        background: "var(--app-panel)",
        border: "1px solid var(--app-border)",
        color: "var(--app-text-primary)",
      }}
    >
      {children}
    </div>
  );
}

/** The R-above / D-below field: faint party washes either side of Even, and the gridlines. */
/** `zeroLabel` renames the 0 line when the axis measures something other than the margin itself. */
export function MarginField({ x0, x1, y, ticks, lo, hi, compact, zeroLabel }: { x0: number; x1: number; y: (v: number) => number; ticks: number[]; lo: number; hi: number; compact: boolean; zeroLabel?: string }) {
  return (
    <g>
      {hi > 0 && <rect x={x0} y={y(hi)} width={x1 - x0} height={y(0) - y(hi)} fill="var(--party-rep-subtle)" opacity={0.28} />}
      {lo < 0 && <rect x={x0} y={y(0)} width={x1 - x0} height={y(lo) - y(0)} fill="var(--party-dem-subtle)" opacity={0.28} />}
      {ticks.map((t) => (
        <g key={t}>
          {t !== 0 && <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke="var(--app-border)" strokeOpacity={0.7} strokeDasharray="2 4" />}
          <text x={x0 - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={compact ? 10 : 11} fill={t === 0 ? "var(--app-text-muted)" : t > 0 ? "var(--party-rep)" : "var(--party-dem)"} style={{ fontVariantNumeric: "tabular-nums" }} fontWeight={t === 0 ? 600 : 500} opacity={t === 0 ? 1 : 0.8}>
            {t === 0 && zeroLabel ? zeroLabel : tickLabel(t)}
          </text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y(0)} y2={y(0)} stroke="var(--app-text-muted)" strokeWidth={1.25} />
    </g>
  );
}

/** The left-to-right draw-in for lines: a clip rectangle that grows across the plot. */
export function RevealClip({ id, x, y, w, h }: { id: string; x: number; y: number; w: number; h: number }) {
  return (
    <clipPath id={id}>
      <rect x={x - 12} y={y - 12} width={w + 24} height={h + 24} className="rg-reveal" style={{ transformOrigin: `${x - 12}px 0` }} />
    </clipPath>
  );
}

export function Legend({ items }: { items: { key: string; label: string; swatch: ReactNode; off?: boolean; onToggle?: () => void }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => {
        const body = (
          <>
            <svg width={26} height={12} aria-hidden className="shrink-0">{it.swatch}</svg>
            <span>{it.label}</span>
          </>
        );
        return it.onToggle ? (
          <button
            key={it.key}
            type="button"
            onClick={it.onToggle}
            aria-pressed={!it.off}
            className="ix-press flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-100"
            style={{ color: "var(--app-text-muted)", opacity: it.off ? 0.4 : 1, textDecoration: it.off ? "line-through" : "none" }}
          >
            {body}
          </button>
        ) : (
          <span key={it.key} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{body}</span>
        );
      })}
    </div>
  );
}
