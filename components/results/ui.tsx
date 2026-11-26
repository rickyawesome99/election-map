"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FIG } from "@/components/ResultRowKit";
import { fmtLean, fmtMargin, getRaceColor, leanColor, marginColor } from "@/lib/colorScale";
import { useRevealOnce } from "@/lib/useRevealOnce";
import { useTouchHover } from "@/lib/useTouchHover";

// Shared pieces of the 2026 Results page (/results): the lazily mounted map, the legend, the
// sliding segmented control, the serif figures and bars the race and state pages use, and the
// sortable flat table every section shares. Motion comes from the site's own classes in
// globals.css (.vh-*, .ix-*, .ab-box): rows rise in when their section scrolls into view, a
// hovered or touched row tints and its headline figure swells, bars grow from their baseline.

export const TplMap = dynamic(() => import("@/components/tpl/TplMaps").then((m) => m.TplMap), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full rounded-xl sm:h-[400px] md:h-[480px]" />,
});

/** Swings are drawn on the site's usual margin scale (tilt under 1, lean under 5, likely under 15, safe beyond). */
export const swingColor = getRaceColor;

const STEPS = [-20, -10, -3, -0.5, 0.5, 3, 10, 20];
const STEP_NAME = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];
/** The party scale's eight steps between two end labels; a swatch lifts under the pointer. */
export function ScaleLegend({ lo = "D+15", hi = "R+15", label = "Map legend" }: { lo?: string; hi?: string; label?: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label={`${label}: ${lo} to ${hi}`}>
      <span>{lo}</span>
      {STEPS.map((s, i) => <span key={s} title={STEP_NAME[i]} className="ix-lift inline-block h-2 w-3.5 rounded-[1px]" style={{ background: getRaceColor(s) }} />)}
      <span>{hi}</span>
    </div>
  );
}

/** Mounts its children once the placeholder nears the viewport: six maps on one page would
 *  otherwise all project their shapes on load. */
export function LazyMount({ children, className = "h-[300px] sm:h-[400px] md:h-[480px]" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setShown(true); }, { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return shown ? <div className="rh-fade-in">{children}</div> : <div ref={ref} className={className} aria-hidden />;
}

/** Holds the entrance animations of everything inside until the block scrolls into view. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, vh } = useRevealOnce<HTMLDivElement>(0.05);
  return <div ref={ref} data-vh={vh} className={className}>{children}</div>;
}

/** The pill-row control of the analysis pages, with a thumb that slides to the chosen option. */
export function Seg<T extends string | number>({ label, value, options, onChange, scroll = false }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; scroll?: boolean }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Measured so it can slide; until then (and on the server) the chosen pill fills itself.
  const [thumb, setThumb] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      setThumb(btn ? { left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [value, options.length]);
  const pills = (
    <div ref={rowRef} className={`relative ${scroll ? "flex w-max flex-nowrap" : "flex flex-wrap"} rounded-md p-0.5`} style={{ background: "var(--app-tab-bg)" }} role="group" aria-label={label}>
      {thumb && <span aria-hidden className="vh-tab-line pointer-events-none absolute left-0 top-0 rounded" style={{ width: thumb.width, height: thumb.height, transform: `translate(${thumb.left}px, ${thumb.top}px)`, background: "var(--app-panel)", boxShadow: "0 1px 2px rgba(0,0,0,0.14)" }} />}
      {options.map(([key, text]) => {
        const on = value === key;
        return (
          <button key={String(key)} type="button" onClick={() => onChange(key)} aria-pressed={on} className="ix-press relative whitespace-nowrap rounded px-2.5 py-1 text-xs font-semibold hover:text-[var(--app-text-primary)]"
            style={{ background: on && !thumb ? "var(--app-panel)" : "transparent", color: on ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {text}
          </button>
        );
      })}
    </div>
  );
  return scroll ? <div className="max-w-full overflow-x-auto [scrollbar-width:none]">{pills}</div> : pills;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtCompact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : fmtInt(n));
export const partyInk = (p: string | null | undefined) => (p === "R" ? "var(--party-rep)" : p === "D" ? "var(--party-dem)" : p ? "var(--party-ind)" : "var(--app-text-primary)");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-24" → "Nov 24" (read as written, no time zone). */
export const fmtDay = (iso: string) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : "—"; };

// ── Figures ───────────────────────────────────────────────────────────────────

/** A headline figure in the site's serif; it swells when its row (.vh-hover / .vh-row) is hovered. */
export function Figure({ children, color, size = "1.05rem", title }: { children: ReactNode; color?: string; size?: string; title?: string }) {
  return <span title={title} className="vh-margin inline-block whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: size, color }}>{children}</span>;
}
/** A result margin ("D+13.5") as a headline figure. */
export function MarginFig({ v, size }: { v: number | null; size?: string }) {
  return <Figure color={marginColor(v)} size={size}>{fmtMargin(v)}</Figure>;
}
/** A swing ("D+15.5", "~" when estimated) as a headline figure. */
export function SwingFig({ v, est, size }: { v: number | null; est?: boolean; size?: string }) {
  return <Figure color={leanColor(v)} size={size}>{est && v != null ? "~" : ""}{fmtLean(v)}</Figure>;
}

/** One big figure over a small caption: the stat row at the top of a section. */
export function Stat({ value, label, color, delay = 0 }: { value: ReactNode; label: ReactNode; color?: string; delay?: number }) {
  return (
    <div className="vh-in vh-hover min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="vh-margin inline-block tabular-nums" style={{ ...FIG, fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color, transformOrigin: "left center" }}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{label}</div>
    </div>
  );
}
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">{children}</div>;
}

/** Where a margin went: a track from D+`span` to R+`span` with a hollow dot at the earlier margin,
 *  a filled dot at the 2026 one and a bar between them that grows from the earlier end. */
export function ShiftTrack({ from, to, span = 60, className = "" }: { from: number; to: number; span?: number; className?: string }) {
  const x = (v: number) => ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * 100;
  const a = x(from), b = x(to), toDem = to < from;
  const ink = toDem ? "var(--party-dem)" : "var(--party-rep)";
  return (
    <span className={`relative block h-3 ${className}`} aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px" style={{ background: "var(--app-border)" }} />
      <span className="absolute top-0 bottom-0 w-px" style={{ left: "50%", background: "var(--app-text-very-muted)" }} />
      <span className={`${toDem ? "vh-bar-r" : "vh-bar-d"} absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full`} style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%`, background: ink, opacity: 0.55 }} />
      <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${a}%`, background: "var(--app-bg)", border: "1.5px solid var(--app-text-muted)" }} />
      <span className="vh-lean absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" data-dir={toDem ? "l" : "r"} style={{ left: `calc(${b}% - 5px)`, background: marginColor(to) }} />
    </span>
  );
}

/** A share of an earlier vote as a bar against a 100% mark (the track runs to `max`%). */
export function KeptBar({ pct, color, max = 140 }: { pct: number | null; color: string; max?: number }) {
  return (
    <span className="relative block h-1.5 w-full rounded-full" style={{ background: "color-mix(in srgb, var(--app-text-primary) 7%, transparent)" }} aria-hidden>
      {pct != null && <span className="vh-bar-d absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (pct / max) * 100)}%`, background: color }} />}
      <span className="absolute -top-0.5 -bottom-0.5 w-px" style={{ left: `${(100 / max) * 100}%`, background: "var(--app-text-muted)" }} />
    </span>
  );
}

/** The picked place under a map: a ruled block that rises in each time the selection changes. */
export function Picked({ id, title, href, linkLabel, onClose, children }: { id: string; title: ReactNode; href?: string; linkLabel?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div key={id} className="vh-in vh-hover mt-4 pt-3" style={{ borderTop: "2px solid var(--app-text-primary)" }} aria-live="polite">
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 truncate" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.01em" }}>{title}</h3>
        {href && <Link href={href} prefetch={false} className="ix-lift whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>{linkLabel ?? "Open"} →</Link>}
        <button type="button" onClick={onClose} aria-label="Close" className="ix-press text-sm leading-none" style={{ color: "var(--app-text-very-muted)" }}>✕</button>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">{children}</div>
    </div>
  );
}
/** One labelled figure inside <Picked>. */
export function PickedFig({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      {/* Fixed-height value row, bottom-aligned, so every figure in the panel sits on one line whether
          or not it has a note under it; figures swell from the left so they never shift past the label. */}
      <div className="mt-1 flex h-8 items-end [&_.vh-margin]:origin-left">{children}</div>
      {note && <div className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{note}</div>}
    </div>
  );
}

export const NOTE = "mt-4 space-y-1.5 text-xs leading-relaxed";
export function Notes({ children }: { children: ReactNode }) {
  return <div className={NOTE} style={{ color: "var(--app-text-very-muted)" }}>{children}</div>;
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} prefetch={false} className="font-semibold hover:underline">{children}</Link>;
}

export function MoreButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="ix-press mt-3 text-xs font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ color: "var(--app-text-muted)" }}>{children}</button>;
}

/** Row props for a flat table row: fades in (staggered), tints under the pointer or a finger. */
export const rowMotion = (i: number): { className: string; style: CSSProperties; "data-touch-hover": "" } => ({
  className: "vh-tr tbl-tr vh-hover", style: { borderBottom: "1px solid var(--app-border)", animationDelay: `${Math.min(i, 14) * 22}ms` }, "data-touch-hover": "",
});
export const TH = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";

export type Col<T> = {
  key: string;
  head: ReactNode;
  /** Left-aligned (text) instead of right-aligned (figures). */
  left?: boolean;
  /** The value the column sorts by; omit for a column that doesn't sort. Nulls always sort last. */
  sort?: (row: T) => number | string | null;
  cell: (row: T, rank: number) => ReactNode;
  /** Hidden below the `sm` breakpoint. */
  wide?: boolean;
  title?: string;
};

/** The site's flat table (uppercase micro-heads on a hairline, rows on the page background) with
 *  click-to-sort headers and a "show all" control. */
export function RankTable<T>({ rows, cols, rowKey, label, initial, limit = 15, noun = "rows" }: {
  rows: T[]; cols: Col<T>[]; rowKey: (row: T) => string; label: string;
  initial: { key: string; dir: 1 | -1 }; limit?: number; noun?: string;
}) {
  const [sort, setSort] = useState(initial);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y) * sort.dir;
    });
  }, [rows, cols, sort]);
  const shown = all ? sorted : sorted.slice(0, limit);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label={label}>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" title={c.title} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    className={`${TH} ${c.left ? "text-left" : "text-right"} ${c.wide ? "hidden sm:table-cell" : ""}`}
                    style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                    {c.sort
                      ? <button type="button" className="ix-press uppercase tracking-wider hover:text-[var(--app-text-primary)]" onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.left ? 1 : initial.dir }))}>{c.head}<span className="inline-block w-3 text-left" aria-hidden>{on ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</span></button>
                      : c.head}
                  </th>
                );
              })}
            </tr>
          </thead>
          {/* Keyed by the sort so the rows fade in again in their new order. */}
          <tbody key={`${sort.key}${sort.dir}${all}`}>
            {shown.map((r, i) => (
              <tr key={rowKey(r)} {...rowMotion(i)}>
                {cols.map((c) => <td key={c.key} className={`px-2 py-1.5 tabular-nums ${c.left ? "text-left" : "text-right"} ${c.wide ? "hidden sm:table-cell" : ""}`}>{c.cell(r, i + 1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <MoreButton onClick={() => setAll((v) => !v)}>{all ? `Show the first ${limit}` : `Show all ${rows.length} ${noun}`}</MoreButton>}
    </div>
  );
}

/** Mounted once by the page: gives every [data-touch-hover] row its hover tint under a finger. */
export function TouchHover() {
  useTouchHover();
  return null;
}
