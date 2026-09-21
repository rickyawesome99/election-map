"use client";

import { useState } from "react";
import type { ChamberSimulation } from "@/lib/forecast";

// Seat distribution from the chamber simulation (lib/forecast simulateChamber): one
// column per Democratic seat count, height = share of simulations. Columns on the
// Democratic side of the control line wear the Democratic color, the rest the
// Republican one; governors have no control line, so the split is a majority of states.

const MIN_SHARE = 0.002; // tails thinner than 0.2% of simulations are trimmed from the axis
const H = 64;            // plot height in viewBox units (the svg stretches to the column width)

export default function SeatHistogram({ label, sim, total }: { label: string; sim: ChamberSimulation; total: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const seats = Object.keys(sim.histogram).map(Number).filter((s) => sim.histogram[s] >= MIN_SHARE);
  const min = Math.min(...seats), max = Math.max(...seats);
  const bins = Array.from({ length: max - min + 1 }, (_, i) => ({ seats: min + i, share: sim.histogram[min + i] ?? 0 }));
  const peak = Math.max(...bins.map((b) => b.share));

  // Democratic seats at which a column counts for the Democrats; a governors' 25–25 split is neither's.
  const line = sim.controlThreshold ?? total / 2 + 0.5;
  const sideOf = (s: number): "D" | "R" | null => (s >= line ? "D" : sim.controlThreshold == null && s === total / 2 ? null : "R");
  const colorOf = (s: number) => { const side = sideOf(s); return side === "D" ? "var(--party-dem)" : side === "R" ? "var(--party-rep)" : "var(--app-text-very-muted)"; };

  const slot = 100 / bins.length;
  const gap = Math.min(0.6, slot * 0.18);
  // left edge of the first Democratic-control column (the middle of the 25–25 column for governors)
  const lineX = (line - min) * slot;
  const lineInView = line > min && line <= max;
  const pct = (v: number) => (v < 0.01 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);

  const shown = hover != null ? bins.find((b) => b.seats === hover) ?? null : null;
  const caption = shown
    ? `${shown.seats} D – ${total - shown.seats} R · ${pct(shown.share)} of simulations`
    : `Expected ${sim.meanDem.toFixed(1)} D · 80% of simulations ${sim.lo80}–${sim.hi80}`;
  const pD = sim.pDemControl;

  return (
    <div className="min-w-0 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.1em] font-bold" style={{ color: "var(--app-text-muted)" }}>{label}</div>
        {pD != null && sim.controlThreshold != null && (
          <div className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
            {pD >= 0.5 ? `D control ${pct(pD)}` : `R control ${pct(1 - pD)}`} · {sim.controlThreshold} D needed
          </div>
        )}
      </div>
      <svg
        className="mt-3 block w-full"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        height={H}
        role="img"
        aria-label={`${label}: simulated Democratic seats, ${min} to ${max}, mean ${sim.meanDem.toFixed(1)}`}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={0} x2={100} y1={H - 0.5} y2={H - 0.5} stroke="var(--app-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {bins.map((b, i) => {
          const h = peak > 0 ? (b.share / peak) * (H - 6) : 0;
          return (
            <g key={b.seats} onPointerEnter={() => setHover(b.seats)} onPointerDown={() => setHover(b.seats)}>
              {/* full-height hit area so thin tail columns are still easy to land on */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              <rect x={i * slot + gap / 2} y={H - 1 - h} width={slot - gap} height={h} fill={colorOf(b.seats)} opacity={hover == null || hover === b.seats ? 1 : 0.45} />
            </g>
          );
        })}
        {lineInView && <line x1={lineX} x2={lineX} y1={0} y2={H} stroke="var(--app-text-primary)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
        <span>{min} D</span>
        <span>{max} D</span>
      </div>
      <div className="mt-1.5 text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text-muted)" }} aria-live="polite">{caption}</div>
    </div>
  );
}
