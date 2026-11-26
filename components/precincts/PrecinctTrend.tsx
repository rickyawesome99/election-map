"use client";

import { Fragment, useState } from "react";
import { MarginField, marginAxis, partyFill, smoothPath, useWidth } from "@/components/MarginGraphKit";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { OFFICE_LABEL, type Office } from "./types";

// One precinct's blended result by year: each year's contested races at face value, weighed with
// TPL's race-type weights (renormalized over the types on the ballot that year). No strips, no
// environment, no recency: a single number per election, graphed over time.

const TIP_W = 196;

export type TrendPoint = { year: number; margin: number; parts: { office: Office; margin: number; weight: number }[] };

export default function PrecinctTrend({ points, year, onPick }: { points: TrendPoint[]; year: number; onPick: (year: number) => void }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { top: 24, right: 14, bottom: 26, left: 44 };
  const iw = Math.max(0, width - pad.left - pad.right);
  const ih = H - pad.top - pad.bottom;
  const axis = marginAxis(points.map((p) => p.margin), { fit: true });
  const y0 = points[0].year, y1 = points[points.length - 1].year;
  const inset = 22;
  const x = (yr: number) => pad.left + inset + (y1 === y0 ? 0.5 : (yr - y0) / (y1 - y0)) * Math.max(0, iw - inset * 2);
  const y = (v: number) => pad.top + ((axis.hi - v) / (axis.hi - axis.lo)) * ih;
  // A label goes under its point at a dip in the line, where the line leaves on both sides above it.
  const below = (i: number) => points.length > 1 && (points[i - 1]?.margin ?? Infinity) > points[i].margin && (points[i + 1]?.margin ?? Infinity) > points[i].margin;
  const hp = hover == null ? null : points.find((p) => p.year === hover) ?? null;
  const nearest = (px: number) => points.reduce((a, b) => (Math.abs(x(b.year) - px) < Math.abs(x(a.year) - px) ? b : a)).year;

  return (
    <div ref={boxRef} className="relative" style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Blended result by year, ${y0} to ${y1}`} style={{ touchAction: "pan-y", cursor: "pointer" }}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(nearest(e.clientX - r.left)); }}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPick(nearest(e.clientX - r.left)); }}>
          <MarginField x0={pad.left} x1={pad.left + iw} y={y} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact />
          {hp && <line x1={x(hp.year)} x2={x(hp.year)} y1={pad.top} y2={pad.top + ih} stroke="var(--app-text-muted)" strokeOpacity={0.5} />}
          {points.map((p) => (
            <text key={p.year} x={x(p.year)} y={H - 6} textAnchor="middle" fontSize={10.5} fontWeight={p.year === year || p.year === hover ? 700 : 500}
              fill={p.year === year || p.year === hover ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
              {`’${String(p.year).slice(2)}`}
            </text>
          ))}
          <path d={smoothPath(points.map((p) => ({ x: x(p.year), y: y(p.margin) })))} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={p.year}>
              {p.year === year && <circle cx={x(p.year)} cy={y(p.margin)} r={8} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.25} />}
              <circle cx={x(p.year)} cy={y(p.margin)} r={p.year === hover ? 5.5 : 4} fill={partyFill(p.margin)} stroke="var(--app-bg)" strokeWidth={2} />
              <text x={x(p.year)} y={y(p.margin) + (below(i) ? 19 : -11)} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={marginColor(p.margin)}
                style={{ fontVariantNumeric: "tabular-nums", paintOrder: "stroke", stroke: "var(--app-bg)", strokeWidth: 3 }}>
                {fmtMargin(p.margin)}
              </text>
            </g>
          ))}
        </svg>
      )}
      {hp && (
        // The site's flat tooltip (MarginGraphKit Tip), kept inside the narrow sidebar: it sits beside
        // the hovered year on whichever side has room, clamped to the chart's edges.
        <div
          className="pointer-events-none absolute z-10 px-3 pb-2.5 pt-2 text-xs"
          style={{
            top: pad.top,
            width: TIP_W,
            left: x(hp.year) < width / 2 ? Math.min(x(hp.year) + 12, width - TIP_W) : Math.max(x(hp.year) - 12 - TIP_W, 0),
            background: "var(--app-bg)",
            border: "1px solid var(--app-border)",
            borderTop: "2px solid var(--app-text-primary)",
            boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
            color: "var(--app-text-primary)",
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Blended, {hp.year}</div>
          <div className="mt-0.5 text-[20px] font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-serif)", color: marginColor(hp.margin) }}>{fmtMargin(hp.margin)}</div>
          <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-x-2.5 gap-y-0.5 whitespace-nowrap pt-1.5 tabular-nums" style={{ borderTop: "1px solid var(--app-border)" }}>
            {hp.parts.map((pt) => (
              <Fragment key={pt.office}>
                <span style={{ color: "var(--app-text-muted)" }}>{OFFICE_LABEL[pt.office]}</span>
                <span className="text-right text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>{Math.round(pt.weight * 100)}%</span>
                <span className="text-right font-semibold" style={{ color: marginColor(pt.margin) }}>{fmtMargin(pt.margin)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
