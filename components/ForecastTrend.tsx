"use client";

import { useState } from "react";

// The forecast over time (lib/forecastHistory.ts): one small chart per chamber, the day's number as
// a 2px line over a background tinted by which party it favors — above the control line Democratic,
// below it Republican. Hover (or tap) reads a day off the caption under the chart.

export type ForecastTrendDay = {
  date: string;
  house: number;     // P(Democratic House)
  senate: number;    // P(Democratic Senate)
  governors: number; // expected Democratic governorships
  /** Average Democratic seats across the simulations (and the 80% range), per chamber. */
  seats: Record<"house" | "senate" | "governor", { mean: number; lo80: number; hi80: number }>;
};

const H = 90; // plot height in viewBox units (the svg stretches to the column width)

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const pct = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`);

function TrendPanel({ label, dates, values, domain, line, headline, caption, axis }: {
  label: string;
  dates: string[];
  values: number[];
  domain: [number, number];
  /** The control line: values above it favor the Democrats. */
  line: number;
  headline: (v: number) => string;
  /** The caption under the chart for day `i`. */
  caption: (i: number) => string;
  /** Gutter labels at the top, the control line and the bottom of the scale. */
  axis: [string, string, string];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (v: number) => H - ((v - domain[0]) / (domain[1] - domain[0])) * H;
  const lineY = y(line);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const shown = hover ?? n - 1;

  // A gridline at the first of each month; its label only where there is room for it (not crowding
  // the series' first day, not running off the right edge).
  const months = dates.flatMap((d, i) => (d.endsWith("-01") ? [{ i, label: new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short" }) }] : []));
  const labeled = months.filter((m) => x(m.i) <= 93);

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };

  return (
    <div className="min-w-0 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-text-muted)" }}>{label}</div>
        <div className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{headline(values[n - 1])}</div>
      </div>
      <div className="mt-3 flex">
        <div className="relative w-9 shrink-0 text-[9px] font-semibold tabular-nums" style={{ color: "var(--app-text-very-muted)", height: H }}>
          <span className="absolute right-1.5 top-0 -translate-y-1/2">{axis[0]}</span>
          <span className="absolute right-1.5 -translate-y-1/2" style={{ top: lineY }}>{axis[1]}</span>
          <span className="absolute bottom-0 right-1.5 translate-y-1/2">{axis[2]}</span>
        </div>
        <div className="relative min-w-0 flex-1 pr-1.5">
          <svg
            className="block w-full touch-none"
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            height={H}
            role="img"
            aria-label={`${label} from ${longDate(dates[0])} to ${longDate(dates[n - 1])}: ${caption(0)} then, ${caption(n - 1)} now`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
          >
            <rect x={0} y={0} width={100} height={Math.max(0, lineY)} fill="var(--party-dem-fill)" opacity={0.09} />
            <rect x={0} y={lineY} width={100} height={Math.max(0, H - lineY)} fill="var(--party-rep-fill)" opacity={0.09} />
            <line x1={0} x2={100} y1={lineY} y2={lineY} stroke="var(--app-text-muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {months.map((m) => <line key={m.i} x1={x(m.i)} x2={x(m.i)} y1={0} y2={H} stroke="var(--app-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            <path d={path} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--app-text-primary)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* The day's point, drawn in HTML so the stretched viewBox does not squash it. */}
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `calc(${x(shown)}% - ${(x(shown) / 100) * 6}px)`, top: y(values[shown]), background: "var(--app-text-primary)", boxShadow: "0 0 0 2px var(--app-bg)" }}
          />
          <div className="relative mt-1 h-3 text-[10px] font-medium" style={{ color: "var(--app-text-very-muted)" }}>
            {labeled.map((m) => <span key={m.i} className="absolute -translate-x-1/2" style={{ left: `${x(m.i)}%` }}>{m.label}</span>)}
          </div>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text-muted)" }} aria-live="polite">
        {longDate(dates[shown])}{hover == null ? " (today)" : ""} · {caption(shown)}
      </div>
    </div>
  );
}

export default function ForecastTrend({ days }: { days: ForecastTrendDay[] }) {
  const dates = days.map((d) => d.date);
  const control = (v: number) => (v >= 0.5 ? `D ${pct(v)}` : `R ${pct(1 - v)}`);
  const gov = days.map((d) => d.governors);
  const wins = (p: number) => (p >= 0.5 ? `Democrats win ${pct(p)} of sims` : `Republicans win ${pct(1 - p)} of sims`);
  const govDomain: [number, number] = [Math.min(23, Math.floor(Math.min(...gov)) - 1), Math.max(28, Math.ceil(Math.max(...gov)) + 1)];
  // The average seat count of whichever party the simulations favor (a chamber's total minus the
  // Democratic average is the Republican one).
  const seats = (i: number, chamber: keyof ForecastTrendDay["seats"], total: number, noun: string) => {
    const dem = days[i].seats[chamber].mean;
    return dem >= total / 2 ? `Avg. ${dem.toFixed(1)} D ${noun}` : `Avg. ${(total - dem).toFixed(1)} R ${noun}`;
  };
  return (
    <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-3">
      <TrendPanel label="House" dates={dates} values={days.map((d) => d.house)} domain={[0, 1]} line={0.5} axis={["100%", "50%", "0%"]}
        headline={(v) => `${control(v)} control`} caption={(i) => `${wins(days[i].house)} · ${seats(i, "house", 435, "seats")}`} />
      <TrendPanel label="Senate" dates={dates} values={days.map((d) => d.senate)} domain={[0, 1]} line={0.5} axis={["100%", "50%", "0%"]}
        headline={(v) => `${control(v)} control`} caption={(i) => `${wins(days[i].senate)} · ${seats(i, "senate", 100, "seats")}`} />
      <TrendPanel label="Governors" dates={dates} values={gov} domain={govDomain} line={25} axis={[String(govDomain[1]), "25", String(govDomain[0])]}
        headline={(v) => `${v.toFixed(1)} D expected`} caption={(i) => seats(i, "governor", 50, "governors")} />
    </div>
  );
}
