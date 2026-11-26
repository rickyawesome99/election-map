"use client";

import { useEffect, useRef, useState } from "react";

export type DemographicMeasure = {
  key: string;
  label: string;
  /** "count" (population) has no U.S. line: the country is off any state's scale. It reads as a share of the U.S. instead, on a log strip. */
  kind: "pct" | "usd" | "count";
  value: number;
  national: number;
  /** Every state and DC on this measure, for the strip and the rank. */
  all: { abbr: string; name: string; v: number }[];
};

const fmt = (kind: DemographicMeasure["kind"], n: number) =>
  kind === "pct" ? `${n.toFixed(1)}%` : kind === "count" ? (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}K`) : `$${Math.round(n).toLocaleString()}`;
const fmtGap = (kind: DemographicMeasure["kind"], n: number) => {
  const a = Math.abs(n);
  return kind === "pct" ? `${a.toFixed(1)} pts` : `$${Math.round(a).toLocaleString()}`;
};
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Each measure as a strip: every state as a faint tick, the U.S. figure as a dashed line, and this
 * state as a dot joined to the U.S. line by a bar (the gap the section is about). When the section
 * scrolls into view the dots slide out from the U.S. line to their values. Hovering a strip names
 * the nearest state. Colours stay neutral: party colour on this site means partisan lean.
 */
export default function DemographicStrips({ abbr, stateName, measures }: { abbr: string; stateName: string; measures: DemographicMeasure[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div className="hidden grid-cols-[minmax(0,13rem)_5.5rem_minmax(0,1fr)_8rem] items-end gap-x-6 pb-2 pt-1 sm:grid">
        {["Measure", stateName, "All states", "vs. U.S."].map((h, i) => (
          <span key={h} className={`truncate text-[10px] font-semibold uppercase tracking-wider ${i === 1 || i === 3 ? "text-right" : ""}`} style={{ color: "var(--app-text-muted)" }}>{h}</span>
        ))}
      </div>
      {measures.map((m, i) => <Row key={m.key} m={m} abbr={abbr} shown={shown} delay={i * 70} />)}
    </div>
  );
}

function Row({ m, abbr, shown, delay }: { m: DemographicMeasure; abbr: string; shown: boolean; delay: number }) {
  const [hover, setHover] = useState<{ abbr: string; name: string; v: number } | null>(null);
  const count = m.kind === "count";
  const vals = m.all.map((s) => s.v);
  // Population runs on a log strip (Wyoming to California is ~70x); the rest are linear.
  const tf = (v: number) => (count ? Math.log10(v) : v);
  const tvals = vals.map(tf);
  const lo0 = Math.min(...tvals, ...(count ? [] : [m.national])), hi0 = Math.max(...tvals, ...(count ? [] : [m.national]));
  const pad = (hi0 - lo0) * 0.04 || 1;
  const lo = m.kind === "pct" ? Math.max(0, lo0 - pad) : lo0 - pad;
  const hi = hi0 + pad;
  const pos = (v: number) => ((tf(v) - lo) / (hi - lo)) * 100;
  const gap = m.value - m.national;
  const rank = [...vals].sort((a, b) => b - a).indexOf(m.value) + 1;
  const usX = count ? 0 : pos(m.national), meX = pos(m.value);
  const dotX = shown ? meX : usX;
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = lo + ((e.clientX - r.left) / r.width) * (hi - lo);
    setHover(m.all.reduce((a, b) => (Math.abs(tf(b.v) - t) < Math.abs(tf(a.v) - t) ? b : a)));
  };

  return (
    <div className="vh-row vh-hover grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,13rem)_5.5rem_minmax(0,1fr)_8rem] sm:gap-x-6"
      style={{ borderBottom: "1px solid var(--app-border)", animationDelay: `${delay}ms` }}>
      <span className="min-w-0 text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{m.label}</span>
      <span className="text-right text-base font-bold tabular-nums sm:text-[1.05rem]" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>{fmt(m.kind, m.value)}</span>

      <div className="relative col-span-2 h-9 touch-pan-y sm:col-span-1" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {/* the track */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: "var(--app-border)" }} />
        {/* every state */}
        {m.all.map((s) => s.abbr !== abbr && (
          <span key={s.abbr} className="absolute top-1/2 h-3 w-px -translate-y-1/2"
            style={{ left: `${pos(s.v)}%`, background: hover?.abbr === s.abbr ? "var(--app-text-primary)" : "var(--app-text-very-muted)", opacity: hover?.abbr === s.abbr ? 1 : 0.55 }} />
        ))}
        {/* the gap, U.S. to this state */}
        {!count && <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${Math.min(usX, dotX)}%`, width: `${Math.abs(dotX - usX)}%`, background: "color-mix(in srgb, var(--app-text-primary) 28%, transparent)", transition: `left 900ms ${ease} ${delay}ms, width 900ms ${ease} ${delay}ms` }} />}
        {/* U.S. */}
        {!count && <>
        <span className="absolute inset-y-0.5 w-0 -translate-x-1/2" style={{ left: `${usX}%`, borderLeft: "1.5px dashed var(--app-text-muted)" }} />
        <span className="absolute -top-1.5 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider" style={{ left: `${usX}%`, color: "var(--app-text-muted)" }}>U.S.</span>
        </>}
        {/* this state */}
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${dotX}%`, background: "var(--app-text-primary)", boxShadow: "0 0 0 2px var(--app-bg)", transition: `left 900ms ${ease} ${delay}ms` }} />
        {hover && (
          <span className="pointer-events-none absolute -bottom-2 z-10 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm"
            style={{ left: `${pos(hover.v)}%`, background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
            {hover.name} {fmt(m.kind, hover.v)}
          </span>
        )}
      </div>

      <span className="col-span-2 flex items-baseline justify-between gap-2 text-xs tabular-nums sm:col-span-1 sm:flex-col sm:items-end sm:gap-0">
        {count ? (
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{((m.value / m.national) * 100).toFixed(1)}% of the U.S.</span>
        ) : <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>
          <span className="vh-lean mr-1 text-[10px]" data-dir={gap >= 0 ? "u" : "d"} style={{ color: "var(--app-text-muted)" }}>{gap >= 0 ? "▲" : "▼"}</span>
          {fmtGap(m.kind, gap)} {gap >= 0 ? "above" : "below"}
        </span>}
        <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{ordinal(rank)} highest of {m.all.length}</span>
      </span>
    </div>
  );
}
