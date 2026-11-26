"use client";

// One precinct's turnout by election: the votes cast in its biggest race that year (the race most
// voters filled in, so the closest the precinct files come to ballots cast), as bars on a shared
// baseline. Neutral ink: colour on this site means party.

import { useState } from "react";
import { useWidth } from "@/components/MarginGraphKit";
import { OFFICE_LABEL, type Office } from "./types";

export type TurnoutPoint = { year: number; votes: number; office: Office; est: boolean };

const TIP_W = 176;

export default function PrecinctTurnout({ points, year, adults, onPick }: { points: TurnoutPoint[]; year: number; adults: number | null; onPick: (year: number) => void }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 132;
  const pad = { top: 18, bottom: 22, side: 4 };
  const ih = H - pad.top - pad.bottom;
  const max = Math.max(...points.map((p) => p.votes), 1);
  const slot = (width - pad.side * 2) / points.length;
  const bw = Math.max(6, Math.min(30, slot * 0.6));
  const cx = (n: number) => pad.side + slot * (n + 0.5);
  const h = (v: number) => (v / max) * ih;
  const crowded = points.length > 6; // then the year labels shorten to ’16
  const hp = hover === null ? null : points[hover];

  return (
    <div ref={boxRef} className="relative" style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Votes cast by year, ${points[0].year} to ${points[points.length - 1].year}`} style={{ touchAction: "pan-y", cursor: "pointer" }}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.floor((e.clientX - r.left - pad.side) / slot)))); }}
          onPointerLeave={() => setHover(null)}
          onClick={() => { if (hover !== null) onPick(points[hover].year); }}>
          <line x1={pad.side} x2={width - pad.side} y1={pad.top + ih} y2={pad.top + ih} stroke="var(--app-border)" />
          {points.map((p, n) => {
            const on = p.year === year;
            const bh = Math.max(1, h(p.votes));
            const r = Math.min(4, bw / 2, bh);
            const x0 = cx(n) - bw / 2, y0 = pad.top + ih - bh;
            return (
              <g key={p.year}>
                {/* Rounded at the data end, square on the baseline. */}
                <path d={`M${x0},${pad.top + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${pad.top + ih} Z`}
                  fill={on ? "var(--app-text-primary)" : "var(--app-text-muted)"} opacity={on || hover === n ? 1 : 0.45} />
                <text x={cx(n)} y={y0 - 5} textAnchor="middle" fontSize={crowded ? 9.5 : 10.5} fontWeight={on ? 700 : 600}
                  fill={on ? "var(--app-text-primary)" : "var(--app-text-muted)"} fontStyle={p.est ? "italic" : undefined} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {p.votes.toLocaleString()}
                </text>
                <text x={cx(n)} y={H - 6} textAnchor="middle" fontSize={10.5} fontWeight={on || hover === n ? 700 : 500}
                  fill={on || hover === n ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {crowded ? `’${String(p.year).slice(2)}` : p.year}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 px-3 pb-2.5 pt-2 text-xs"
          style={{
            top: 0, width: TIP_W,
            left: cx(hover) < width / 2 ? Math.min(cx(hover) + bw / 2 + 8, width - TIP_W) : Math.max(cx(hover) - bw / 2 - 8 - TIP_W, 0),
            background: "var(--app-bg)", border: "1px solid var(--app-border)", borderTop: "2px solid var(--app-text-primary)",
            boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)", color: "var(--app-text-primary)",
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Turnout, {hp.year}</div>
          <div className="mt-0.5 text-[20px] font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>{hp.votes.toLocaleString()} votes</div>
          <div className="mt-1.5 flex flex-col gap-0.5 pt-1.5 tabular-nums" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="flex justify-between gap-3"><span style={{ color: "var(--app-text-muted)" }}>Biggest race</span><span className="font-semibold">{OFFICE_LABEL[hp.office]}</span></div>
            {adults !== null && adults > 0 && (
              <div className="flex justify-between gap-3"><span style={{ color: "var(--app-text-muted)" }}>Of 2020 adults</span><span className="font-semibold">{Math.round((hp.votes / adults) * 100)}%</span></div>
            )}
            {hp.est && <div className="text-[10.5px] italic" style={{ color: "var(--app-text-muted)" }}>Estimate, divided from other lines</div>}
          </div>
        </div>
      )}
    </div>
  );
}
