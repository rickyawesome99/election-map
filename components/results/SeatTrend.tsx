"use client";

import { useId, useState } from "react";
import type { SeatPoint } from "@/lib/resultsTypes";

// The needle's expected Democratic seats over the night, as a small chart: the 80% band shaded,
// the expected count as a line, the majority as a dashed rule. The y range always includes the
// majority line, so which side of it the night is on reads at a glance.

const W = 300, H = 64, PAD_Y = 4;
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function SeatTrend({ points, majority, total }: { points: SeatPoint[]; majority: number; total: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <div className="flex h-16 items-center justify-center text-[11px]" style={{ color: "var(--app-text-very-muted)", border: "1px dashed var(--app-border)" }}>The chart fills in as the count is refreshed</div>;
  }
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const lo = Math.max(0, Math.min(majority, ...points.map((p) => p.lo)) - 1);
  const hi = Math.min(total, Math.max(majority, ...points.map((p) => p.hi)) + 1);
  const x = (t: number) => (t1 > t0 ? ((t - t0) / (t1 - t0)) * W : W / 2);
  const y = (v: number) => PAD_Y + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 2 * PAD_Y);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.mean).toFixed(1)}`).join("");
  const band = `${points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join("")}${[...points].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join("")}Z`;
  const last = points[points.length - 1];
  const color = last.mean >= majority ? "var(--party-dem)" : "var(--party-rep)";
  // Nearest point to the pointer, by time.
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  const hpColor = hp && hp.mean >= majority ? "var(--party-dem)" : "var(--party-rep)";
  const hx = hp ? (x(hp.t) / W) * 100 : 0;
  return (
    <div>
      <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-16 w-full" role="img" aria-label={`Expected Democratic seats over time, now ${Math.round(last.mean)}`}>
        <defs>
          <linearGradient id={`${id}-band`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--party-dem)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--party-rep)" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <path d={band} fill={`url(#${id}-band)`} />
        <line x1={0} x2={W} y1={y(majority)} y2={y(majority)} stroke="var(--app-text-muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {!hp && <circle cx={x(last.t)} cy={y(last.mean)} r={2.5} fill={color} />}
        {hp && <line x1={x(hp.t)} x2={x(hp.t)} y1={0} y2={H} stroke="var(--app-text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && (
        <>
          {/* The dot is HTML so it stays round on the stretched SVG. */}
          <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${hx}%`, top: `${(y(hp.mean) / H) * 100}%`, background: hpColor, boxShadow: "0 0 0 2px var(--app-bg)" }} />
          <div className="pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-lg"
            style={{ left: `${hx}%`, transform: `translateX(${hx > 70 ? "-100%" : hx < 30 ? "0" : "-50%"})`, padding: "6px 9px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", color: "var(--app-text-primary)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-text-muted)" }}>{fmtTime(hp.t)}</div>
            <div className="mt-0.5 text-[13px] tabular-nums"><b style={{ color: hpColor }}>{Math.round(hp.mean)}</b> D seats <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>· {Math.round(hp.lo)}–{Math.round(hp.hi)}</span></div>
          </div>
        </>
      )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
        <span>{fmtTime(t0)}</span><span>dashed: {majority} for majority</span><span>{fmtTime(t1)}</span>
      </div>
    </div>
  );
}
