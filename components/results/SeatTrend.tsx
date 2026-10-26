"use client";

import dynamic from "next/dynamic";
import { fmtMargin, marginSideColor } from "@/lib/resultsFormat";
import type { RacePrior, SeatPoint } from "@/lib/resultsTypes";

// The Results page's two trend charts over the night, drawn by the shared Recharts chart
// (SeatTrendChart, loaded on its own as on the Overview, with the same hover popup):
//   SeatTrend    a chamber's expected Democratic seats, the 80% band shaded, the majority dashed;
//                the y range always includes the majority, so which side the night is on reads
//                at a glance
//   MarginTrend  one race's projected margin (R-positive, Republican up), the 80% band shaded,
//                an even race dashed; the y range always includes even

const TrendChart = dynamic(() => import("@/components/results/SeatTrendChart"), { ssr: false });
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function Frame({ points, label, note, children }: { points: SeatPoint[]; label: string; note: string; children: React.ReactNode }) {
  if (points.length < 2) {
    return <div className="flex h-16 items-center justify-center text-[11px]" style={{ color: "var(--app-text-very-muted)", border: "1px dashed var(--app-border)" }}>The chart fills in as the count is refreshed</div>;
  }
  return (
    <div>
      <div className="relative h-16 [&_*:focus]:outline-none" style={{ touchAction: "pan-y" }} role="img" aria-label={label}>{children}</div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
        <span>{fmtTime(points[0].t)}</span><span>{note}</span><span>{fmtTime(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}

export default function SeatTrend({ points, majority, total }: { points: SeatPoint[]; majority: number; total: number }) {
  const lo = Math.max(0, Math.min(majority, ...points.map((p) => p.lo)) - 1);
  const hi = Math.min(total, Math.max(majority, ...points.map((p) => p.hi)) + 1);
  const colorOf = (v: number) => (v >= majority ? "var(--party-dem)" : "var(--party-rep)");
  return (
    <Frame points={points} label={`Expected Democratic seats over time, now ${Math.round(points[points.length - 1]?.mean ?? 0)}`} note={`dashed: ${majority} for majority`}>
      <TrendChart points={points} reference={majority} lo={lo} hi={hi} topColor="var(--party-dem)" bottomColor="var(--party-rep)" colorOf={colorOf}
        fmtValue={(v) => `${Math.round(v)} D seats`} fmtRange={(a, b) => `${Math.round(a)}–${Math.round(b)}`} />
    </Frame>
  );
}

export function MarginTrend({ points, prior }: { points: SeatPoint[]; prior: Pick<RacePrior, "dem" | "rep"> }) {
  const pad = 2;
  const lo = Math.min(0, ...points.map((p) => p.lo)) - pad, hi = Math.max(0, ...points.map((p) => p.hi)) + pad;
  return (
    <Frame points={points} label={`Projected margin over time, now ${fmtMargin(points[points.length - 1]?.mean ?? null, prior)}`} note="dashed: even">
      <TrendChart points={points} reference={0} lo={lo} hi={hi} topColor="var(--party-rep)" bottomColor="var(--party-dem)" colorOf={(v) => marginSideColor(v, prior)}
        fmtValue={(v) => fmtMargin(v, prior)} fmtRange={(a, b) => `${fmtMargin(a, prior)} to ${fmtMargin(b, prior)}`} />
    </Frame>
  );
}
