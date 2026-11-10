"use client";

import dynamic from "next/dynamic";
import { callSideColor, fmtCall, fmtDateTime } from "@/lib/resultsFormat";

/** "Nov 3": the chamber cards' chart is too narrow for the time. */
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
import { TREND_WINDOW, type RacePrior, type SeatPoint } from "@/lib/resultsTypes";

// The Results page's two trend charts over the night, drawn by the shared Recharts chart
// (SeatTrendChart, loaded on its own as on the Overview, with the same hover popup):
//   SeatTrend    a chamber's projected Democratic seats (called + projected winners), the 80% band shaded, the majority dashed;
//                the y range always includes the majority, so which side the night is on reads
//                at a glance
//   MarginTrend  one race's projected margin (or its counted margin, with no band) (R-positive, Republican up), the 80% band shaded,
//                an even race dashed; the y range zooms to the line and snaps to round ticks,
//                labelled on a y axis

const TrendChart = dynamic(() => import("@/components/results/SeatTrendChart"), { ssr: false });
/** The margin chart's y axis width; the time labels under it indent by the same. */
const AXIS_WIDTH = 34;

/** The points inside TREND_WINDOW; a line running past either edge is cut there, at its value
 *  interpolated to the edge. */
function clipToWindow(points: SeatPoint[]): SeatPoint[] {
  const [from, to] = TREND_WINDOW;
  const at = (t: number): SeatPoint | null => {
    const i = points.findIndex((p) => p.t >= t);
    if (i <= 0) return null;
    const a = points[i - 1], b = points[i], f = (t - a.t) / (b.t - a.t), mix = (x: number, y: number) => x + (y - x) * f;
    return { t, mean: mix(a.mean, b.mean), lo: mix(a.lo, b.lo), hi: mix(a.hi, b.hi) };
  };
  const inside = points.filter((p) => p.t >= from && p.t <= to);
  const start = at(from), end = at(to);
  return [...(start && inside[0]?.t !== from ? [start] : []), ...inside, ...(end && inside[inside.length - 1]?.t !== to ? [end] : [])];
}

function Frame({ points, label, note, noteClass = "", children, axis = false }: { points: SeatPoint[]; label: string; note: string; /** Extra classes for the note (hidden where the chart is too narrow for it). */ noteClass?: string; children: React.ReactNode; /** The chart has a y axis: time labels indented past it, and room for the time as well as the date. */ axis?: boolean }) {
  const fmtEnd = axis ? fmtDateTime : fmtDay;
  if (points.length < 2) {
    // The same height as a drawn chart, time-label row included: the chamber card pins its
    // seats-not-up note to that row, so a shorter placeholder would pull it up into the popular vote.
    return (
      <div>
        <div className="flex h-16 items-center justify-center text-[11px]" style={{ color: "var(--app-text-very-muted)", border: "1px dashed var(--app-border)" }}>The chart fills in as the count is refreshed</div>
        <div className="mt-0.5 text-[10px]" aria-hidden="true">&nbsp;</div>
      </div>
    );
  }
  return (
    <div>
      <div className="relative h-16 [&_*:focus]:outline-none" style={{ touchAction: "pan-y" }} role="img" aria-label={label}>{children}</div>
      {/* One line however narrow the chart: the times never wrap, the note gives way (truncated). At xl
          the chamber cards' chart is too narrow for it at all: the bar above already says the majority. */}
      <div className="mt-0.5 flex justify-between gap-1.5 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)", paddingLeft: axis ? AXIS_WIDTH : 0 }}>
        <span className="shrink-0 whitespace-nowrap">{fmtEnd(points[0].t)}</span><span className={`min-w-0 truncate ${noteClass}`} title={note}>{note}</span><span className="shrink-0 whitespace-nowrap">{fmtEnd(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}

export default function SeatTrend({ points: all, majority, total }: { points: SeatPoint[]; majority: number; total: number }) {
  const points = clipToWindow(all);
  const lo = Math.max(0, Math.min(majority, ...points.map((p) => p.lo)) - 1);
  const hi = Math.min(total, Math.max(majority, ...points.map((p) => p.hi)) + 1);
  // Coloured by the seat count as shown (rounded), so a label reading "26" at a 26-seat majority is never red.
  const colorOf = (v: number) => (Math.round(v) >= majority ? "var(--party-dem)" : "var(--party-rep)");
  return (
    <Frame points={points} label={`Projected Democratic seats over time, now ${Math.round(points[points.length - 1]?.mean ?? 0)}`} note={`dashed: ${majority} for majority`} noteClass="xl:hidden">
      <TrendChart points={points} reference={majority} lo={lo} hi={hi} topColor="var(--party-dem)" bottomColor="var(--party-rep)" colorOf={colorOf}
        fmtValue={(v) => `${Math.round(v)} D seats`} fmtRange={(a, b) => `${Math.round(a)}–${Math.round(b)}`} />
    </Frame>
  );
}

/** Round ticks covering [lo, hi] at about two steps (1, 2, 5 × 10ⁿ), and the range snapped to them. */
function niceTicks(lo: number, hi: number): { lo: number; hi: number; ticks: number[] } {
  const raw = (hi - lo) / 2, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v * 100) / 100 || 0);
  return { lo: a, hi: b, ticks };
}

/** `kind` "counted": the counted margin, drawn without a band, the line coloured by who leads
 *  (purple within 5 points of even). */
export function MarginTrend({ points: all, prior, kind = "projected" }: { points: SeatPoint[]; prior: Pick<RacePrior, "dem" | "rep">; kind?: "projected" | "counted" }) {
  const points = clipToWindow(all);
  // The y range zooms to the projected line itself (padded, at least a point tall) so small moves
  // show; the band and the even line run off the chart when they fall outside it.
  const means = points.map((p) => p.mean), mid = (Math.min(...means) + Math.max(...means)) / 2;
  const half = Math.max(0.5, ((Math.max(...means) - Math.min(...means)) / 2) * 1.25);
  const { lo, hi, ticks } = niceTicks(mid - half, mid + half);
  const fmtTick = (v: number) => (v === 0 ? "Even" : `${v > 0 ? prior.rep.party : prior.dem.party}+${Math.abs(v)}`);
  return (
    <Frame axis points={points} label={`${kind === "counted" ? "Counted" : "Projected"} margin over time, now ${fmtCall(points[points.length - 1]?.mean ?? null, prior)}`} note="dashed: even">
      <TrendChart points={points} reference={0} lo={lo} hi={hi} topColor="var(--party-rep)" bottomColor="var(--party-dem)" colorOf={(v) => callSideColor(v, prior)}
        fmtValue={(v) => fmtCall(v, prior)} fmtRange={(a, b) => `${fmtCall(a, prior)} to ${fmtCall(b, prior)}`} ticks={ticks} fmtTick={fmtTick} axisWidth={AXIS_WIDTH} title={kind === "counted" ? "Counted" : "Projected"} band={kind !== "counted"} leadBlend={kind === "counted" ? 5 : undefined} />
    </Frame>
  );
}
