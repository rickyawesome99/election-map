"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { HouseDelegationEntry, StateLegEntry } from "@/data/forecastData";
import type { StatewideHistoryEntry } from "@/components/StatewideVoteHistoryPanel";
import type { MajorityInfo } from "@/lib/statePage";
import { fmtMargin, marginColor } from "@/lib/colorScale";

/**
 * The graph view of "Results since 2016", one view per results tab. Margins are R-positive (R up,
 * D down) like every other margin on the site.
 *
 *  - Statewide: president, Senate and governor margins as three smooth lines, told apart by marker
 *    and dash (party colour is reserved for who won each point), plus the 2026 forecast as hollow
 *    markers on a dashed tail.
 *  - U.S. House / State House / State Senate: two small multiples on one shared year axis — the
 *    seats after each election (stacked bars with the majority line) above, the body's popular-vote
 *    margin below, with the statewide presidential margin as a faint reference.
 *
 * Hand-drawn SVG rather than recharts: the two panels share one hover, and the curves, bars and
 * labels animate in on every tab change.
 */

type Forecast2026 = { year: number; label: string; margin: number; href?: string };
export type SeatProjection = { year: number; dem: number; rep: number; total: number | null };

type Props =
  | { kind: "statewide"; entries: StatewideHistoryEntry[]; forecasts: Forecast2026[] }
  | {
      kind: "body";
      label: string;
      entries: BodyEntry[];
      presidential: { year: number; margin: number }[];
      majority: MajorityInfo | null;
      /** A delegation has no majority to win: draw the halfway line instead. */
      halfLine?: boolean;
      newMapYears: number[];
      projection: SeatProjection | null;
    };

/** One election for a seat-holding body, normalised from the House delegation and state-leg rows. */
export type BodyEntry = {
  year: number;
  dem: number | null;
  rep: number | null;
  oth: number;
  total: number | null;
  demPct: number | null;
  repPct: number | null;
  seatsUp?: number;
  demWon?: number;
  repWon?: number;
  othWon?: number;
};

export function bodyEntriesFromDelegation(rows: HouseDelegationEntry[]): BodyEntry[] {
  return rows.map((r) => ({ year: r.year, dem: r.demSeats, rep: r.repSeats, oth: 0, total: r.demSeats + r.repSeats, demPct: r.demPct, repPct: r.repPct }));
}

export function bodyEntriesFromStateLeg(rows: StateLegEntry[]): BodyEntry[] {
  return rows.map((r) => ({
    year: r.year,
    dem: r.demSeats ?? null,
    rep: r.repSeats ?? null,
    oth: r.othSeats ?? 0,
    total: r.totalSeats ?? (r.demSeats != null && r.repSeats != null ? r.demSeats + r.repSeats + (r.othSeats ?? 0) : null),
    demPct: r.demPct ?? null,
    repPct: r.repPct ?? null,
    seatsUp: r.seatsUp,
    demWon: r.demSeatsWon,
    repWon: r.repSeatsWon,
    othWon: r.othSeatsWon,
  }));
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

/** Monotone cubic (Fritsch–Carlson): smooth, but never overshoots a result it passes through. */
function smoothPath(pts: Pt[]): string {
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
function marginAxis(values: number[]): { lo: number; hi: number; ticks: number[] } {
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

const tickLabel = (v: number) => (v === 0 ? "Even" : `${v > 0 ? "R" : "D"}+${Math.abs(v)}`);

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
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

// ── Shared pieces ────────────────────────────────────────────────────────────

type Marker = "circle" | "square" | "diamond";

function MarkerShape({ shape, x, y, r, fill, stroke, strokeWidth = 2, className, style }: { shape: Marker; x: number; y: number; r: number; fill: string; stroke: string; strokeWidth?: number; className?: string; style?: CSSProperties }) {
  const common = { fill, stroke, strokeWidth, className, style };
  if (shape === "square") return <rect x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} rx={1.5} {...common} />;
  if (shape === "diamond") return <path d={`M${x},${y - r * 1.2} L${x + r * 1.2},${y} L${x},${y + r * 1.2} L${x - r * 1.2},${y} Z`} strokeLinejoin="round" {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

function partyFill(margin: number) {
  return Math.abs(margin) < 0.05 ? "var(--app-text-muted)" : margin > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

/** A tooltip card that sits beside the hovered year and flips to the left past the middle. */
function Tip({ x, width, top, children }: { x: number; width: number; top: number; children: ReactNode }) {
  const flip = x > width * 0.55;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md px-3 py-2 text-xs shadow-lg rg-tip"
      style={{
        top,
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        minWidth: 180,
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
function MarginField({ x0, x1, y, ticks, lo, hi, compact }: { x0: number; x1: number; y: (v: number) => number; ticks: number[]; lo: number; hi: number; compact: boolean }) {
  return (
    <g>
      {hi > 0 && <rect x={x0} y={y(hi)} width={x1 - x0} height={y(0) - y(hi)} fill="var(--party-rep-subtle)" opacity={0.28} />}
      {lo < 0 && <rect x={x0} y={y(0)} width={x1 - x0} height={y(lo) - y(0)} fill="var(--party-dem-subtle)" opacity={0.28} />}
      {ticks.map((t) => (
        <g key={t}>
          {t !== 0 && <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke="var(--app-border)" strokeOpacity={0.7} strokeDasharray="2 4" />}
          <text x={x0 - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={compact ? 10 : 11} fill={t === 0 ? "var(--app-text-muted)" : t > 0 ? "var(--party-rep)" : "var(--party-dem)"} style={{ fontVariantNumeric: "tabular-nums" }} fontWeight={t === 0 ? 600 : 500} opacity={t === 0 ? 1 : 0.8}>
            {tickLabel(t)}
          </text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y(0)} y2={y(0)} stroke="var(--app-text-muted)" strokeWidth={1.25} />
    </g>
  );
}

/** The left-to-right draw-in for lines: a clip rectangle that grows across the plot. */
function RevealClip({ id, x, y, w, h }: { id: string; x: number; y: number; w: number; h: number }) {
  return (
    <clipPath id={id}>
      <rect x={x - 12} y={y - 12} width={w + 24} height={h + 24} className="rg-reveal" style={{ transformOrigin: `${x - 12}px 0` }} />
    </clipPath>
  );
}

function Legend({ items }: { items: { key: string; label: string; swatch: ReactNode; off?: boolean; onToggle?: () => void }[] }) {
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
            className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-100"
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

// ── Statewide ────────────────────────────────────────────────────────────────

type SeriesKey = "president" | "senate" | "governor";
const SERIES: { key: SeriesKey; label: string; short: string; marker: Marker; ink: string; dash?: string }[] = [
  { key: "president", label: "President", short: "Pres.", marker: "circle", ink: "var(--app-text-primary)" },
  { key: "senate", label: "Senate", short: "Senate", marker: "square", ink: "var(--app-text-muted)", dash: "7 5" },
  { key: "governor", label: "Governor", short: "Gov.", marker: "diamond", ink: "var(--app-text-muted)", dash: "1.5 5" },
];

type StatewidePoint = { series: SeriesKey; year: number; margin: number; special: boolean; forecast: boolean; entry?: StatewideHistoryEntry; label: string; href?: string };

function StatewideGraph({ entries, forecasts }: { entries: StatewideHistoryEntry[]; forecasts: Forecast2026[] }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const points = useMemo<StatewidePoint[]>(() => {
    const past = entries
      // Maine's and Nebraska's district presidential votes are cards, not part of the state's line.
      .filter((e) => e.group !== "house" && !(e.group === "president" && e.label !== "Presidential"))
      .map((e) => ({
        series: e.group as SeriesKey,
        year: e.year,
        margin: Math.round((e.repPct - e.demPct) * 10) / 10,
        special: /special/i.test(e.label),
        forecast: false,
        entry: e,
        label: e.label,
        href: e.href,
      }));
    const fut = forecasts.map((f) => ({
      series: (/governor/i.test(f.label) ? "governor" : "senate") as SeriesKey,
      year: f.year,
      margin: f.margin,
      special: /special/i.test(f.label),
      forecast: true,
      label: f.label,
      href: f.href,
    }));
    return [...past, ...fut];
  }, [entries, forecasts]);

  const present = SERIES.filter((s) => points.some((p) => p.series === s.key));
  const visible = points.filter((p) => !hidden.has(p.series));
  const years = [...new Set(points.map((p) => p.year))].sort((a, b) => a - b);
  if (years.length === 0) return null;

  const compact = width > 0 && width < 560;
  const H = compact ? 280 : 340;
  const M = { top: 18, right: compact ? 58 : 84, bottom: 34, left: compact ? 44 : 54 };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const y0 = years[0];
  const y1 = years[years.length - 1];
  const xPad = Math.min(36, iw / (years.length * 2.4));
  const x = (yr: number) => M.left + xPad + (y1 === y0 ? (iw - 2 * xPad) / 2 : ((yr - y0) / (y1 - y0)) * (iw - 2 * xPad));
  const axis = marginAxis(visible.length ? visible.map((p) => p.margin) : [0]);
  const y = (v: number) => M.top + ((axis.hi - v) / (axis.hi - axis.lo)) * ih;

  // Each series' regular elections form its line; specials stand alone; the forecast hangs off the end.
  const lines = present.filter((s) => !hidden.has(s.key)).map((s) => {
    const regular = visible.filter((p) => p.series === s.key && !p.special && !p.forecast).sort((a, b) => a.year - b.year);
    const fc = visible.filter((p) => p.series === s.key && p.forecast && !p.special);
    const pts = regular.map((p) => ({ x: x(p.year), y: y(p.margin) }));
    const last = regular[regular.length - 1];
    const tail = last && fc[0] ? `M${x(last.year)},${y(last.margin)} L${x(fc[0].year)},${y(fc[0].margin)}` : "";
    return { s, path: smoothPath(pts), tail, last: fc[0] ?? last };
  });

  // Direct labels in the right gutter at each line's last value, nudged apart so they never collide.
  const labels = lines.filter((l) => l.last).map((l) => ({ key: l.s.key, text: l.s.short, ink: l.s.ink, y: y(l.last!.margin) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;

  const nearestYear = (px: number) => years.reduce((best, yr) => (Math.abs(x(yr) - px) < Math.abs(x(best) - px) ? yr : best), years[0]);
  const hovered = hoverYear != null ? visible.filter((p) => p.year === hoverYear).sort((a, b) => SERIES.findIndex((s) => s.key === a.series) - SERIES.findIndex((s) => s.key === b.series) || Number(a.special) - Number(b.special)) : [];
  const animKey = `${width > 0}-${[...hidden].join(",")}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Legend
          items={[
            ...present.map((s) => ({
              key: s.key,
              label: s.label,
              off: hidden.has(s.key),
              onToggle: () => setHidden((h) => { const n = new Set(h); if (n.has(s.key)) n.delete(s.key); else if (present.length - n.size > 1) n.add(s.key); return n; }),
              swatch: (
                <>
                  <line x1={1} x2={25} y1={6} y2={6} stroke={s.ink} strokeWidth={2} strokeDasharray={s.dash} strokeLinecap="round" />
                  <MarkerShape shape={s.marker} x={13} y={6} r={3.6} fill="var(--app-text-muted)" stroke="var(--app-bg)" strokeWidth={1.5} />
                </>
              ),
            })),
            ...(points.some((p) => p.forecast) ? [{
              key: "fc",
              label: "2026 forecast",
              swatch: <MarkerShape shape="circle" x={13} y={6} r={3.8} fill="var(--app-bg)" stroke="var(--app-text-muted)" strokeWidth={1.75} />,
            }] : []),
          ]}
        />
        <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Dot colour = winner · hover a year for the results</span>
      </div>
      <div ref={boxRef} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            key={animKey}
            width={width}
            height={H}
            role="img"
            aria-label="Statewide election margins since 2016"
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverYear(nearestYear(e.clientX - r.left)); }}
            onPointerLeave={() => setHoverYear(null)}
            style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
          >
            <defs><RevealClip id="rg-sw-clip" x={M.left} y={M.top} w={iw} h={ih} /></defs>
            <MarginField x0={M.left} x1={M.left + iw} y={y} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact={compact} />
            {years.map((yr) => (
              <text key={yr} x={x(yr)} y={H - 10} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={yr === hoverYear ? 700 : 500} fill={yr === hoverYear ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                {yr}
              </text>
            ))}
            {hoverYear != null && <line x1={x(hoverYear)} x2={x(hoverYear)} y1={M.top} y2={M.top + ih} stroke="var(--app-text-muted)" strokeOpacity={0.45} strokeWidth={1} />}

            <g clipPath="url(#rg-sw-clip)">
              {lines.map((l) => (
                <g key={l.s.key}>
                  {l.path && <path d={l.path} fill="none" stroke={l.s.ink} strokeWidth={2.25} strokeDasharray={l.s.dash} strokeLinecap="round" strokeLinejoin="round" />}
                  {l.tail && <path d={l.tail} fill="none" stroke={l.s.ink} strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" opacity={0.7} />}
                </g>
              ))}
            </g>

            {visible.map((p, i) => {
              const s = SERIES.find((q) => q.key === p.series)!;
              const dim = hoverYear != null && hoverYear !== p.year;
              const hollow = p.special || p.forecast;
              return (
                <g key={`${p.series}-${p.year}-${p.special}-${p.forecast}-${i}`} style={{ opacity: dim ? 0.35 : 1, transition: "opacity 160ms" }}>
                  <g className="rg-pop" style={{ animationDelay: `${120 + ((p.year - y0) / Math.max(1, y1 - y0)) * 520}ms` }}>
                  <MarkerShape
                    shape={s.marker}
                    x={x(p.year)}
                    y={y(p.margin)}
                    r={hoverYear === p.year ? 6.5 : 5.25}
                    fill={hollow ? "var(--app-bg)" : partyFill(p.margin)}
                    stroke={hollow ? partyFill(p.margin) : "var(--app-bg)"}
                    strokeWidth={2}
                    style={{ transition: "r 160ms" }}
                  />
                  </g>
                </g>
              );
            })}

            {labels.map((l) => (
              <text key={l.key} className="rg-fade" x={M.left + iw + 10} y={l.y} dy="0.32em" fontSize={compact ? 10.5 : 11.5} fontWeight={600} fill={l.ink}>
                {l.text}
              </text>
            ))}
          </svg>
        )}
        {hoverYear != null && hovered.length > 0 && (
          <Tip x={x(hoverYear)} width={width} top={M.top}>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{hoverYear}</div>
            <div className="flex flex-col gap-1">
              {hovered.map((p, i) => {
                const s = SERIES.find((q) => q.key === p.series)!;
                return (
                  <div key={i}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <svg width={12} height={12} aria-hidden><MarkerShape shape={s.marker} x={6} y={6} r={3.6} fill={p.special || p.forecast ? "var(--app-panel)" : partyFill(p.margin)} stroke={partyFill(p.margin)} strokeWidth={1.5} /></svg>
                        {p.forecast ? `${p.label} · forecast` : p.label}
                      </span>
                      <span className="font-bold tabular-nums" style={{ color: marginColor(p.margin) }}>{fmtMargin(p.margin)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Tip>
        )}
      </div>
    </div>
  );
}

// ── Seat-holding bodies: seats + popular vote, one shared year axis ─────────

function BodyGraph({ label, entries, presidential, majority, halfLine, newMapYears, projection }: Extract<Props, { kind: "body" }>) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [showPres, setShowPres] = useState(true);

  const rows = useMemo(() => [...entries].sort((a, b) => a.year - b.year), [entries]);
  const seatRows = rows.filter((r) => r.dem != null && r.rep != null);
  const voteRows = rows.filter((r) => r.demPct != null && r.repPct != null).map((r) => ({ ...r, margin: Math.round((r.repPct! - r.demPct!) * 10) / 10 }));
  const years = [...new Set([...rows.map((r) => r.year), ...(projection ? [projection.year] : [])])].sort((a, b) => a - b);
  if (years.length === 0) return null;

  const compact = width > 0 && width < 560;
  const left = compact ? 44 : 54;
  const right = compact ? 12 : 24;
  const iw = Math.max(0, width - left - right);
  // Bars sit in even slots, so an odd-year chamber (VA, NJ) still reads as one bar per election.
  const slot = iw / years.length;
  const x = (yr: number) => left + slot * (years.indexOf(yr) + 0.5);
  const barW = Math.min(56, slot * 0.56);

  const seatsH = seatRows.length ? (compact ? 170 : 200) : 0;
  const votesH = voteRows.length ? (compact ? 170 : 200) : 0;
  const gap = seatsH && votesH ? 46 : 0;
  const top = 22;
  const axisH = 30;
  const H = top + seatsH + gap + votesH + axisH;

  const totalOf = (r: { dem: number | null; rep: number | null; oth: number; total: number | null }) => Math.max(r.total ?? 0, (r.dem ?? 0) + (r.rep ?? 0) + r.oth);
  const maxSeats = Math.max(1, ...seatRows.map(totalOf), projection ? (projection.total ?? projection.dem + projection.rep) : 0);
  const sy = (v: number) => top + seatsH - (v / maxSeats) * seatsH;
  const majSize = majority?.totalSeats ?? (seatRows.length ? totalOf(seatRows[seatRows.length - 1]) : 0);
  const majLine = majSize > 1 ? (halfLine ? majSize / 2 : Math.floor(majSize / 2) + 1) : null;

  const presInRange = presidential.filter((p) => p.year >= years[0] && p.year <= years[years.length - 1] && years.includes(p.year)).sort((a, b) => a.year - b.year);
  const vTop = top + seatsH + gap;
  const axis = marginAxis([...voteRows.map((r) => r.margin), ...(showPres ? presInRange.map((p) => p.margin) : [])]);
  const vy = (v: number) => vTop + ((axis.hi - v) / (axis.hi - axis.lo)) * votesH;

  const nearestYear = (px: number) => years.reduce((best, yr) => (Math.abs(x(yr) - px) < Math.abs(x(best) - px) ? yr : best), years[0]);
  const hov = hoverYear != null ? rows.find((r) => r.year === hoverYear) : undefined;
  const hovPres = hoverYear != null ? presidential.find((p) => p.year === hoverYear) : undefined;
  const hovProj = projection && hoverYear === projection.year && !hov ? projection : null;
  const delay = (yr: number) => `${80 + (years.indexOf(yr) / Math.max(1, years.length - 1)) * 480}ms`;

  const panelTitle = (yy: number, text: string, sub?: string) => (
    <text x={left} y={yy} fontSize={11} fontWeight={700} fill="var(--app-text-muted)" style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>
      {text}
      {sub && <tspan fontWeight={500} fill="var(--app-text-very-muted)" style={{ textTransform: "none", letterSpacing: 0 }}>{"  "}{sub}</tspan>}
    </text>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Legend
          items={[
            { key: "d", label: "Democratic", swatch: <rect x={7} y={1} width={12} height={10} rx={2} fill="var(--party-dem)" /> },
            { key: "r", label: "Republican", swatch: <rect x={7} y={1} width={12} height={10} rx={2} fill="var(--party-rep)" /> },
            ...(seatRows.some((r) => r.oth > 0) ? [{ key: "o", label: "Other", swatch: <rect x={7} y={1} width={12} height={10} rx={2} fill="var(--party-ind-muted)" /> }] : []),
            ...(projection ? [{ key: "p", label: "2026 forecast", swatch: <rect x={7} y={1} width={12} height={10} rx={2} fill="url(#rg-hatch-legend)" stroke="var(--app-text-muted)" strokeWidth={1} /> }] : []),
            ...(presInRange.length && voteRows.length ? [{
              key: "pres",
              label: "President (statewide)",
              off: !showPres,
              onToggle: () => setShowPres((v) => !v),
              swatch: <line x1={1} x2={25} y1={6} y2={6} stroke="var(--app-text-very-muted)" strokeWidth={2} strokeDasharray="1.5 4" strokeLinecap="round" />,
            }] : []),
          ]}
        />
        <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Hover a year for details</span>
      </div>
      <div ref={boxRef} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            key={`${label}-${showPres}`}
            width={width}
            height={H}
            role="img"
            aria-label={`${label} seats and popular vote since 2016`}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverYear(nearestYear(e.clientX - r.left)); }}
            onPointerLeave={() => setHoverYear(null)}
            style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
          >
            <defs>
              <pattern id="rg-hatch-legend" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={4} stroke="var(--app-text-muted)" strokeWidth={1.5} />
              </pattern>
              {(["dem", "rep"] as const).map((p) => (
                <pattern key={p} id={`rg-hatch-${p}`} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={5} height={5} fill={`var(--party-${p}-subtle)`} />
                  <line x1={0} y1={0} x2={0} y2={5} stroke={`var(--party-${p})`} strokeWidth={1.6} />
                </pattern>
              ))}
              {votesH > 0 && <RevealClip id="rg-body-clip" x={left} y={vTop} w={iw} h={votesH} />}
            </defs>

            {/* Hover band behind both panels */}
            {hoverYear != null && <rect x={x(hoverYear) - slot / 2 + 2} y={top - 6} width={slot - 4} height={seatsH + gap + votesH + 12} rx={6} fill="var(--app-tab-bg)" opacity={0.7} />}

            {/* ── Seats panel ── */}
            {seatsH > 0 && (
              <g>
                {panelTitle(top - 8, "Seats", "after each election")}
                <line x1={left} x2={left + iw} y1={sy(0)} y2={sy(0)} stroke="var(--app-text-muted)" strokeWidth={1} />
                {seatRows.map((r) => {
                  const segs = [
                    { k: "d", v: r.dem!, fill: "var(--party-dem)" },
                    { k: "o", v: r.oth, fill: "var(--party-ind-muted)" },
                    { k: "r", v: r.rep!, fill: "var(--party-rep)" },
                  ].filter((s) => s.v > 0);
                  let acc = 0;
                  const dim = hoverYear != null && hoverYear !== r.year;
                  return (
                    <g key={r.year} className="rg-grow" style={{ animationDelay: delay(r.year), transformOrigin: `0 ${sy(0)}px`, opacity: dim ? 0.45 : 1, transition: "opacity 160ms" }}>
                      {segs.map((s, i) => {
                        const yTop = sy(acc + s.v);
                        const h = sy(acc) - yTop;
                        acc += s.v;
                        const isTop = i === segs.length - 1;
                        return (
                          <g key={s.k}>
                            <rect x={x(r.year) - barW / 2} y={yTop + (isTop ? 0 : 1)} width={barW} height={Math.max(0, h - (isTop ? 0 : 1) - (i === 0 ? 0 : 1))} rx={isTop ? 3 : 0} fill={s.fill} />
                            {h >= 16 && barW >= 22 && s.k !== "o" && (
                              <text x={x(r.year)} y={yTop + h / 2} dy="0.34em" textAnchor="middle" fontSize={compact ? 10 : 11} fontWeight={700} fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{s.v}</text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {projection && (() => {
                  const p = projection;
                  // Whatever the model can't call (independents, nonpartisan or empty fields) sits between the parties.
                  const rest = Math.max(0, (p.total ?? 0) - p.dem - p.rep);
                  const segs = [{ k: "dem" as const, v: p.dem }, { k: "oth" as const, v: rest }, { k: "rep" as const, v: p.rep }].filter((s) => s.v > 0);
                  let acc = 0;
                  return (
                    <g className="rg-grow" style={{ animationDelay: delay(p.year), transformOrigin: `0 ${sy(0)}px` }}>
                      {segs.map((s, i) => {
                        const yTop = sy(acc + s.v);
                        const h = sy(acc) - yTop;
                        acc += s.v;
                        return (
                          <g key={s.k}>
                            <rect x={x(p.year) - barW / 2} y={yTop + (i ? 0 : 1)} width={barW} height={Math.max(0, h - 1)} rx={i === segs.length - 1 ? 3 : 0} fill={s.k === "oth" ? "var(--app-tab-bg)" : `url(#rg-hatch-${s.k})`} stroke={s.k === "oth" ? "var(--app-border)" : `var(--party-${s.k})`} strokeWidth={1} />
                            {h >= 16 && barW >= 22 && s.k !== "oth" && (
                              <text x={x(p.year)} y={yTop + h / 2} dy="0.34em" textAnchor="middle" fontSize={compact ? 10 : 11} fontWeight={700} fill="var(--app-text-primary)" style={{ fontVariantNumeric: "tabular-nums", paintOrder: "stroke", stroke: "var(--app-bg)", strokeWidth: 3 }}>{s.v}</text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
                {majLine != null && majLine <= maxSeats && (
                  <g className="rg-fade">
                    <line x1={left} x2={left + iw} y1={sy(majLine)} y2={sy(majLine)} stroke="var(--app-text-primary)" strokeWidth={1.25} strokeDasharray="5 4" opacity={0.7} />
                    <text x={left - 8} y={sy(majLine)} dy="0.32em" textAnchor="end" fontSize={compact ? 10 : 11} fontWeight={600} fill="var(--app-text-primary)" style={{ fontVariantNumeric: "tabular-nums" }}>{majLine}</text>
                    {!compact && <text x={left - 8} y={sy(majLine) + 12} dy="0.32em" textAnchor="end" fontSize={9} fill="var(--app-text-very-muted)">{halfLine ? "half" : "majority"}</text>}
                  </g>
                )}
                <text x={left - 8} y={sy(maxSeats)} dy="0.32em" textAnchor="end" fontSize={compact ? 10 : 11} fill="var(--app-text-very-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{maxSeats}</text>
              </g>
            )}

            {/* ── Popular vote panel ── */}
            {votesH > 0 && (
              <g>
                {panelTitle(vTop - 10, "Popular vote", "margin, every district summed")}
                <MarginField x0={left} x1={left + iw} y={vy} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact={compact} />
                <g clipPath="url(#rg-body-clip)">
                  {showPres && presInRange.length > 1 && (
                    <path d={smoothPath(presInRange.map((p) => ({ x: x(p.year), y: vy(p.margin) })))} fill="none" stroke="var(--app-text-very-muted)" strokeWidth={2} strokeDasharray="1.5 5" strokeLinecap="round" />
                  )}
                  {voteRows.length > 1 && (
                    <path d={smoothPath(voteRows.map((r) => ({ x: x(r.year), y: vy(r.margin) })))} fill="none" stroke="var(--app-text-primary)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </g>
                {showPres && presInRange.map((p) => (
                  <circle key={`p-${p.year}`} className="rg-pop" style={{ animationDelay: delay(p.year) }} cx={x(p.year)} cy={vy(p.margin)} r={3} fill="var(--app-bg)" stroke="var(--app-text-very-muted)" strokeWidth={1.5} />
                ))}
                {voteRows.map((r) => (
                  <circle key={r.year} className="rg-pop" style={{ animationDelay: delay(r.year), transition: "r 160ms" }} cx={x(r.year)} cy={vy(r.margin)} r={hoverYear === r.year ? 6.5 : 5.25} fill={partyFill(r.margin)} stroke="var(--app-bg)" strokeWidth={2} />
                ))}
              </g>
            )}

            {/* ── Year axis ── */}
            {years.map((yr) => {
              const redraw = newMapYears.includes(yr);
              const isProj = projection?.year === yr && !rows.some((r) => r.year === yr);
              return (
                <g key={yr}>
                  <text x={x(yr)} y={H - 14} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={yr === hoverYear ? 700 : 500} fill={yr === hoverYear ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {isProj ? `${yr}*` : yr}
                  </text>
                  {redraw && <text x={x(yr)} y={H - 1} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--app-text-very-muted)" style={{ letterSpacing: "0.04em" }}>NEW MAP</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hoverYear != null && (hov || hovProj) && (
          <Tip x={x(hoverYear)} width={width} top={top}>
            <div className="mb-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              {hoverYear} {label}{hovProj ? " · forecast" : ""}{newMapYears.includes(hoverYear) ? " · new map" : ""}
            </div>
            {hovProj && (
              <div className="tabular-nums">
                <div className="flex justify-between gap-3"><span style={{ color: "var(--party-dem)" }}>Democrats</span><b>{hovProj.dem}</b></div>
                <div className="flex justify-between gap-3"><span style={{ color: "var(--party-rep)" }}>Republicans</span><b>{hovProj.rep}</b></div>
                {hovProj.total != null && hovProj.total - hovProj.dem - hovProj.rep > 0 && (
                  <div className="flex justify-between gap-3"><span style={{ color: "var(--app-text-muted)" }}>Other / not projected</span><b>{hovProj.total - hovProj.dem - hovProj.rep}</b></div>
                )}
                <div className="mt-1" style={{ color: "var(--app-text-very-muted)" }}>Projected seats after November</div>
              </div>
            )}
            {hov && (
              <div className="tabular-nums">
                {hov.dem != null && hov.rep != null && (
                  <>
                    <div className="flex justify-between gap-3"><span style={{ color: "var(--party-dem)" }}>Democrats</span><b>{hov.dem}</b></div>
                    <div className="flex justify-between gap-3"><span style={{ color: "var(--party-rep)" }}>Republicans</span><b>{hov.rep}</b></div>
                    {hov.oth > 0 && <div className="flex justify-between gap-3"><span style={{ color: "var(--app-text-muted)" }}>Other</span><b>{hov.oth}</b></div>}
                    {hov.seatsUp != null && hov.total != null && hov.seatsUp < hov.total && (
                      <div className="mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                        {hov.seatsUp} of {hov.total} seats up{hov.demWon != null && hov.repWon != null ? ` · won D ${hov.demWon}, R ${hov.repWon}${hov.othWon ? `, O ${hov.othWon}` : ""}` : ""}
                      </div>
                    )}
                  </>
                )}
                {hov.demPct != null && hov.repPct != null && (
                  <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid var(--app-border)" }}>
                    <div className="flex justify-between gap-3"><span style={{ color: "var(--app-text-muted)" }}>Popular vote</span><b style={{ color: marginColor(hov.repPct - hov.demPct) }}>{fmtMargin(hov.repPct - hov.demPct)}</b></div>
                    <div className="flex justify-between gap-3" style={{ color: "var(--app-text-muted)" }}><span>D {hov.demPct.toFixed(1)}%</span><span>R {hov.repPct.toFixed(1)}%</span></div>
                  </div>
                )}
                {hovPres && (
                  <div className="mt-1 flex justify-between gap-3" style={{ color: "var(--app-text-muted)" }}><span>President (statewide)</span><span style={{ color: marginColor(hovPres.margin) }}>{fmtMargin(hovPres.margin)}</span></div>
                )}
              </div>
            )}
          </Tip>
        )}
      </div>
    </div>
  );
}

export default function StateResultsGraph(props: Props) {
  return props.kind === "statewide" ? <StatewideGraph entries={props.entries} forecasts={props.forecasts} /> : <BodyGraph {...props} />;
}
