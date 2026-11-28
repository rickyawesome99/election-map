"use client";

import { useEffect, useState } from "react";
import { Legend, Tip, useWidth } from "@/components/MarginGraphKit";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import type { CountyTurnoutYear } from "@/lib/countyTurnoutTypes";

/**
 * A county's turnout by election year, as columns: the votes cast in each year's largest race,
 * each column labelled with that count; the hover card adds it as a share of the county's citizen
 * voting-age population.
 * Turnout has no party, so the columns wear the page's ink, darkest in presidential years,
 * lighter in midterms and lightest in odd-year elections. Renders its own section head, so the
 * legend can sit on the rule.
 */

type Kind = "pres" | "mid" | "odd";

const kindOf = (year: number): Kind => (year % 2 === 1 ? "odd" : year % 4 === 0 ? "pres" : "mid");
const KIND_OPACITY: Record<Kind, number> = { pres: 0.82, mid: 0.45, odd: 0.24 };
const KIND_LABEL: Record<Kind, string> = { pres: "Presidential year", mid: "Midterm", odd: "Odd-year election" };

const fmtFull = (v: number) => Math.round(v).toLocaleString("en-US");
function fmtShort(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}

/** 0 to a round ceiling over the values, in two or three steps (the graph is short). */
function niceAxis(max: number): { hi: number; ticks: number[] } {
  const raw = Math.max(max, 1) / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { hi, ticks };
}

const RACE_WORD: Record<CountyTurnoutYear["race"], string> = {
  President: "President",
  Senate: "Senate",
  "Senate Special": "Senate special",
  Governor: "Governor",
  House: "U.S. House",
};

export default function CountyTurnoutGraph({ data, name }: { data: CountyTurnoutYear[]; name: string }) {
  const [hostRef, width] = useWidth<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  // A tapped year stays up on touch until a tap lands outside the graph.
  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (hostRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setHoverYear(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned, hostRef]);

  if (data.length === 0) return null;

  const compact = width > 0 && width < 520;
  const H = 136;
  const M = { top: 18, right: 8, bottom: 22, left: compact ? 34 : 44 };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const y0 = data[0].year;
  const y1 = data[data.length - 1].year;
  const span = Math.max(1, y1 - y0);
  // Years sit on a time scale, so a missing cycle shows as a gap; the narrowest step sets the width.
  const minStep = data.slice(1).reduce((m, d, i) => Math.min(m, d.year - data[i].year), Infinity);
  const stepPx = (iw / (span + 1.2)) * (Number.isFinite(minStep) ? minStep : 2);
  const unit = iw / (span + 1.2);
  const barW = Math.max(6, Math.min(compact ? 24 : 32, stepPx * 0.62));
  const x = (yr: number) => M.left + unit * 0.6 + (yr - y0) * unit;
  const { hi, ticks } = niceAxis(Math.max(...data.map((d) => d.votes)));
  const y = (v: number) => M.top + ih - (Math.max(0, v) / (hi || 1)) * ih;

  const nearestYear = (px: number) => data.reduce((best, d) => (Math.abs(x(d.year) - px) < Math.abs(x(best) - px) ? d.year : best), data[0].year);
  const hovered = data.find((d) => d.year === hoverYear) ?? null;
  const delay = (yr: number) => `${80 + ((yr - y0) / span) * 420}ms`;
  const kinds = (["pres", "mid", "odd"] as const).filter((k) => data.some((d) => kindOf(d.year) === k));

  // The change from the same kind of election before it, for the tooltip.
  const prevSame = (d: CountyTurnoutYear) => [...data].reverse().find((p) => p.year < d.year && kindOf(p.year) === kindOf(d.year));

  return (
    <div className="min-w-0">
      <LedgerSectionHead
        label="Turnout"
        // Phones skip the legend: three items wrap under the title and double the head's height.
        rightClassName="ml-auto hidden sm:block"
        right={kinds.length > 1 ? (
          <Legend
            items={kinds.map((k) => ({
              key: k,
              label: KIND_LABEL[k],
              swatch: <rect x={7} y={0} width={12} height={12} rx={2} fill="var(--app-text-primary)" opacity={KIND_OPACITY[k]} />,
            }))}
          />
        ) : undefined}
      />

      <div ref={hostRef} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${name} votes cast and turnout by year`}
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPinned(e.pointerType !== "mouse");
              setHoverYear(nearestYear(e.clientX - r.left));
            }}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverYear(nearestYear(e.clientX - r.left)); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHoverYear(null); }}
            style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
          >
            {ticks.map((t) => (
              <g key={t}>
                {t !== 0 && <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke="var(--app-border)" strokeOpacity={0.7} strokeDasharray="2 4" />}
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={compact ? 10 : 11} fontWeight={500} fill="var(--app-text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtShort(t)}
                </text>
              </g>
            ))}

            {data.map((d) => {
              const isHover = hoverYear === d.year;
              const top = y(d.votes);
              return (
                <g key={d.year}>
                  <g className="rg-grow" style={{ animationDelay: delay(d.year), transformOrigin: `0 ${y(0)}px` }}>
                    <rect x={x(d.year) - barW / 2} y={top} width={barW} height={Math.max(0, y(0) - top)} rx={3} fill="var(--app-text-primary)" opacity={KIND_OPACITY[kindOf(d.year)]} />
                  </g>
                  <text className="rg-fade" x={x(d.year)} y={top - 5} textAnchor="middle" fontSize={compact ? 10 : 11} fontWeight={700} fill="var(--app-text-primary)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtShort(d.votes)}
                  </text>
                  <text x={x(d.year)} y={H - 5} textAnchor="middle" fontSize={compact ? 10.5 : 12} fontWeight={isHover ? 700 : 500} fill={isHover ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums", transition: "fill 160ms" }}>
                    {compact && minStep < 2 ? `'${String(d.year).slice(2)}` : d.year}
                  </text>
                </g>
              );
            })}
            <line x1={M.left} x2={M.left + iw} y1={y(0)} y2={y(0)} stroke="var(--app-text-muted)" strokeWidth={1.25} />
          </svg>
        )}

        {hovered && (
          <Tip x={x(hovered.year)} width={width} top={0} minWidth={190} flat>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              <span>{hovered.year}</span>
              <span className="font-semibold normal-case tracking-normal" style={{ color: "var(--app-text-very-muted)" }}>{RACE_WORD[hovered.race]}</span>
            </div>
            <div className="flex flex-col gap-0.5 tabular-nums">
              <div className="flex items-baseline justify-between gap-3"><span>Votes cast</span><b>{fmtFull(hovered.votes)}</b></div>
              <div className="flex items-baseline justify-between gap-3">
                <span>Turnout</span>
                <b>{hovered.rate != null ? `${hovered.rate.toFixed(1)}%` : "—"}</b>
              </div>
              {hovered.cvap != null && (
                <div className="flex items-baseline justify-between gap-3" style={{ color: "var(--app-text-muted)" }}><span>Eligible (CVAP)</span><span>{fmtFull(hovered.cvap)}</span></div>
              )}
            </div>
            {(() => {
              const p = prevSame(hovered);
              if (!p) return null;
              return <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{hovered.votes >= p.votes ? "+" : "−"}{(Math.abs(hovered.votes / p.votes - 1) * 100).toFixed(1)}% votes vs. {p.year}</div>;
            })()}
            {hovered.cvapRelease != null && hovered.cvapRelease !== hovered.year && (
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>CVAP from the {hovered.cvapRelease - 4}–{String(hovered.cvapRelease).slice(2)} ACS</div>
            )}
          </Tip>
        )}
      </div>
    </div>
  );
}
