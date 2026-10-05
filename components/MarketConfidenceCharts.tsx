"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Segmented from "@/components/MarketSegmented";
import type { MarketSource } from "@/data/predictionMarkets";
import { CALIBRATION_BANDS, KIND_LABEL, SOURCE_LABEL, calibration, fmtPct, partyColor, wilson, type MarketDot } from "@/lib/predictionMarketDisplay";

type Tip = { left: number; top: number; body: ReactNode } | null;

const subhead = "pb-2 text-[10px] font-bold uppercase tracking-wider";
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const thStyle = { color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" };

// Calibration plot geometry (SVG user units; the SVG scales to its container).
const W = 560, H = 330, M = { l: 58, r: 24, t: 14, b: 40 };
const TICKS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
const sx = (p: number) => M.l + ((p - 0.5) / 0.5) * (W - M.l - M.r);

function CalibrationPlot({ rows, onTip }: { rows: MarketDot[]; onTip: (tip: Tip) => void }) {
  const points = calibration(rows).filter((b) => b.n > 0).map((b) => ({ ...b, won: b.right / b.n, ci: wilson(b.right, b.n) }));
  // Favorites are priced from 50% up, but a thin band of them can win less often than that: let the floor drop to fit.
  const floor = Math.min(0.5, Math.floor(Math.min(...points.map((p) => p.ci[0])) * 10) / 10);
  const sy = (p: number) => H - M.b - ((p - floor) / (1 - floor)) * (H - M.t - M.b);
  const yTicks = Array.from({ length: Math.round((1 - floor) * 10) + 1 }, (_, i) => floor + i / 10).filter((_, i, all) => all.length <= 7 || (all.length - 1 - i) % 2 === 0); // thin from the top so 100% always shows
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
      aria-label={`How often the favorite won against its average price, by price band. ${points.map((p) => `${p.label}: priced ${fmtPct(p.expected)}, won ${fmtPct(p.won)} of ${p.n}`).join("; ")}.`}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} style={{ stroke: "var(--app-border)" }} strokeWidth={1} />
          <text x={M.l - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} style={{ fill: "var(--app-text-muted)" }}>{fmtPct(t)}</text>
        </g>
      ))}
      {TICKS.map((t) => (
        <g key={t}>
          <line y1={M.t} y2={H - M.b} x1={sx(t)} x2={sx(t)} style={{ stroke: "var(--app-border)" }} strokeWidth={1} />
          <text x={sx(t)} y={H - M.b + 16} textAnchor="middle" fontSize={12} style={{ fill: "var(--app-text-muted)" }}>{fmtPct(t)}</text>
        </g>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" fontSize={12} style={{ fill: "var(--app-text-muted)" }}>Election-eve price of the favorite</text>
      <text transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} style={{ fill: "var(--app-text-muted)" }}>Favorite won</text>

      {/* The diagonal is a market whose prices were exactly right. */}
      <line x1={sx(0.5)} y1={sy(0.5)} x2={sx(1)} y2={sy(1)} style={{ stroke: "var(--app-text-very-muted)" }} strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={M.l + 8} y={M.t + 16} fontSize={12} style={{ fill: "var(--app-text-very-muted)" }}>Above the line: won more often than priced</text>
      <text x={W - M.r - 8} y={H - M.b - 8} textAnchor="end" fontSize={12} style={{ fill: "var(--app-text-very-muted)" }}>Below: priced too high</text>

      {points.map((p) => (
        <line key={p.label} x1={sx(p.expected)} x2={sx(p.expected)} y1={sy(p.ci[0])} y2={sy(p.ci[1])} style={{ stroke: "var(--app-text-muted)" }} strokeWidth={1.5} strokeLinecap="round" />
      ))}
      <polyline fill="none" points={points.map((p) => `${sx(p.expected)},${sy(p.won)}`).join(" ")} style={{ stroke: "var(--app-text-primary)" }} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.label}>
          <circle cx={sx(p.expected)} cy={sy(p.won)} r={5} style={{ fill: "var(--app-text-primary)", stroke: "var(--app-bg)" }} strokeWidth={2} />
          <circle cx={sx(p.expected)} cy={sy(p.won)} r={18} fill="transparent"
            onMouseEnter={() => onTip({
              left: (sx(p.expected) / W) * 100, top: (sy(p.won) / H) * 100,
              body: <><strong>Favorites priced {p.label}</strong><br />{p.n} markets, average price {fmtPct(p.expected)}<br />{p.right} won ({fmtPct(p.won)}); 90% range {fmtPct(p.ci[0])}–{fmtPct(p.ci[1])}</>,
            })}
            onMouseLeave={() => onTip(null)} />
        </g>
      ))}
    </svg>
  );
}

/** One square per market, grouped by how heavily the favorite was priced; the misses lead each row. */
function BandGrid({ rows, onTip, wrap }: { rows: MarketDot[]; onTip: (tip: Tip) => void; wrap: React.RefObject<HTMLDivElement | null> }) {
  const showTip = (el: HTMLElement, m: MarketDot) => {
    const box = wrap.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!box) return;
    onTip({
      left: ((r.left + r.width / 2 - box.left) / box.width) * 100, top: ((r.top - box.top) / box.height) * 100,
      body: <>
        <strong>{m.year} {m.place}</strong> · {KIND_LABEL[m.kind]}<br />
        {SOURCE_LABEL[m.source]}: {m.favName} {fmtPct(m.favProb)}<br />
        {m.correct ? `Won, ${m.winMargin}` : `Lost: ${m.winName} won, ${m.winMargin}`}
      </>,
    });
  };
  return (
    <div className="flex flex-col gap-3">
      {CALIBRATION_BANDS.map((band) => {
        const inBand = rows.filter((r) => r.favProb >= band.min && r.favProb < band.max)
          .sort((a, b) => Number(a.correct) - Number(b.correct) || a.favParty.localeCompare(b.favParty) || b.favProb - a.favProb);
        const right = inBand.filter((r) => r.correct).length;
        return (
          <div key={band.label} className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <div>
              <div className="text-sm font-semibold tabular-nums">{band.label}</div>
              <div className="text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{inBand.length ? `${right} of ${inBand.length} won` : "No markets"}</div>
            </div>
            <div className="flex flex-wrap content-start gap-[2px]">
              {inBand.map((m) => {
                const style = { background: m.correct ? "var(--app-border)" : partyColor(m.favParty) };
                const props = { className: "block h-3 w-3 rounded-[2px]", style, onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, m), onMouseLeave: () => onTip(null) };
                return m.href ? <a key={m.id} href={m.href} tabIndex={-1} aria-hidden="true" {...props} /> : <span key={m.id} aria-hidden="true" {...props} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BandTable({ rows }: { rows: MarketDot[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr>{["Favorite priced at", "Markets", "Average price", "Favorite won", "Won minus price"].map((h, i) => (
            <th key={h} scope="col" className={`${th} ${i === 0 ? "text-left" : "text-right"}`} style={thStyle}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {calibration(rows).map((b) => {
            const gap = b.n ? (b.right / b.n - b.expected) * 100 : null;
            return (
              <tr key={b.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th scope="row" className="px-2 py-1.5 text-left font-semibold tabular-nums">{b.label}</th>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.n}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.n ? fmtPct(b.expected) : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums"><span className="font-semibold">{b.n ? fmtPct(b.right / b.n) : "—"}</span> <span style={{ color: "var(--app-text-very-muted)" }}>{b.right}/{b.n}</span></td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{gap == null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(0)} pts`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MarketConfidenceCharts({ markets, years }: { markets: MarketDot[]; years: number[] }) {
  const [year, setYear] = useState<number | "all">("all");
  const [source, setSource] = useState<MarketSource | "all">("all");
  const [kind, setKind] = useState<MarketDot["kind"] | "all">("all");
  const [tip, setTip] = useState<{ where: "plot" | "grid"; tip: NonNullable<Tip> } | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => markets.filter((m) => (year === "all" || m.year === year) && (source === "all" || m.source === source) && (kind === "all" || m.kind === kind)),
    [markets, year, source, kind],
  );
  const misses = rows.filter((r) => !r.correct);
  const tipBox = (where: "plot" | "grid") => tip?.where === where && (
    <div role="status" className="pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-md px-2.5 py-1.5 text-xs leading-snug shadow-md"
      style={{ left: `clamp(8.5rem, ${tip.tip.left}%, calc(100% - 8.5rem))`, top: `calc(${tip.tip.top}% - 8px)`, background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
      {tip.tip.body}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <Segmented label="Election year" value={year} onChange={setYear} options={[["all", "All years"], ...years.map((y): [number, string] => [y, String(y)])]} />
        <Segmented label="Venue" value={source} onChange={setSource} options={[["all", "All venues"], ["polymarket", "Polymarket"], ["kalshi", "Kalshi"], ["predictit", "PredictIt"]]} />
        <Segmented label="Office" value={kind} onChange={setKind} options={[["all", "All offices"], ["P", "President"], ["S", "Senate"], ["G", "Governor"], ["H", "House"]]} />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{rows.length} markets · {misses.length} missed</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-sm" style={{ color: "var(--app-text-muted)" }}>No markets match these filters.</p>
      ) : (
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <div>
            <div className={subhead} style={{ color: "var(--app-text-very-muted)" }}>Price against result</div>
            <div className="relative">
              <CalibrationPlot rows={rows} onTip={(t) => setTip(t && { where: "plot", tip: t })} />
              {tipBox("plot")}
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
              Each point is one price band: its average price across, the share of its favorites that won up. The whisker is the 90% range that share could plausibly sit in given how few markets the band holds.
            </p>
          </div>
          <div>
            <div className={subhead} style={{ color: "var(--app-text-very-muted)" }}>Every market, by price band</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: "var(--app-border)" }} />Favorite won</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: "var(--party-dem)" }} />Democratic favorite lost</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: "var(--party-rep)" }} />Republican favorite lost</span>
            </div>
            <div ref={grid} className="relative">
              <BandGrid rows={rows} wrap={grid} onTip={(t) => setTip(t && { where: "grid", tip: t })} />
              {tipBox("grid")}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8"><BandTable rows={rows} /></div>
    </div>
  );
}
