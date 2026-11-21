"use client";

import { useState } from "react";
import { MarginField, Tip, marginAxis, partyFill, smoothPath, useWidth } from "@/components/MarginGraphKit";
import { fmt2, marginColor } from "./format";
import type { TplAsOf } from "./types";
import { M } from "./ui";

// TPL as it stood after each election year, under today's model: the same rows, weights and
// fitted environment, aggregated over the years up to that one. The line is the running TPL; the
// faint rings are each year's own WRS, the thing the line is a weighted average of.

export function TplOverTime({ points, name }: { points: TplAsOf[]; name: string }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const compact = width > 0 && width < 560;
  const H = compact ? 240 : 300;
  const pad = { top: 26, right: compact ? 26 : 40, bottom: 34, left: compact ? 44 : 54 };
  const iw = Math.max(0, width - pad.left - pad.right);
  const ih = H - pad.top - pad.bottom;
  const axis = marginAxis(points.flatMap((p) => [p.tpl, p.wrs]));
  const y0 = points[0].year, y1 = points[points.length - 1].year;
  // Points sit inset from the field's edges so the end labels clear the axis.
  const inset = compact ? 22 : 34;
  const x = (yr: number) => pad.left + inset + (y1 === y0 ? 0.5 : (yr - y0) / (y1 - y0)) * Math.max(0, iw - inset * 2);
  const y = (v: number) => pad.top + ((axis.hi - v) / (axis.hi - axis.lo)) * ih;
  const line = points.map((p) => ({ x: x(p.year), y: y(p.tpl) }));
  // Label every point when there is room, otherwise the even years and the last one.
  const roomy = points.length < 2 || (iw - inset * 2) / (points.length - 1) >= 56;
  // A label goes under its point at a dip in the line, where the line leaves on both sides above it.
  const below = (i: number) => (points[i - 1]?.tpl ?? Infinity) > points[i].tpl && (points[i + 1]?.tpl ?? Infinity) > points[i].tpl && points.length > 1;
  const labelled = (p: TplAsOf, i: number) => roomy || i === points.length - 1 || p.year % 2 === 0;
  const hp = hover == null ? null : points.find((p) => p.year === hover) ?? null;
  const prev = hp ? points[points.indexOf(hp) - 1] : undefined;
  const nearest = (px: number) => points.reduce((a, b) => (Math.abs(x(b.year) - px) < Math.abs(x(a.year) - px) ? b : a)).year;

  return (
    <div>
      <div ref={boxRef} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${name} TPL after each election, ${y0} to ${y1}`} style={{ touchAction: "pan-y" }}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(nearest(e.clientX - r.left)); }}
            onPointerLeave={() => setHover(null)}>
            <MarginField x0={pad.left} x1={pad.left + iw} y={y} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact={compact} />
            {hp && <line x1={x(hp.year)} x2={x(hp.year)} y1={pad.top} y2={pad.top + ih} stroke="var(--app-text-muted)" strokeOpacity={0.5} />}
            {points.map((p) => (
              <text key={p.year} x={x(p.year)} y={H - 10} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={p.year === hover ? 700 : 500} fill={p.year === hover ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                {compact && !roomy ? `’${String(p.year).slice(2)}` : p.year}
              </text>
            ))}
            {/* Each year's own WRS: what the running figure is averaging. */}
            {points.map((p) => (
              <circle key={p.year} cx={x(p.year)} cy={y(p.wrs)} r={3.5} fill="none" stroke={partyFill(p.wrs)} strokeOpacity={0.45} strokeWidth={1.25} />
            ))}
            <path d={smoothPath(line)} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <g key={p.year}>
                <circle cx={x(p.year)} cy={y(p.tpl)} r={p.year === hover ? 6 : 4.5} fill={partyFill(p.tpl)} stroke="var(--app-bg)" strokeWidth={2} />
                {labelled(p, i) && (
                  <text x={x(p.year)} y={y(p.tpl) + (below(i) ? 20 : -11)} textAnchor="middle" fontSize={compact ? 11 : 12.5} fontWeight={700} fill={marginColor(p.tpl)}
                    style={{ fontFamily: "var(--font-serif)", fontVariantNumeric: "tabular-nums", paintOrder: "stroke", stroke: "var(--app-bg)", strokeWidth: 3 }}>
                    {fmt2(p.tpl)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
        {hp && (
          <Tip x={x(hp.year)} width={width} top={pad.top} minWidth={170}>
            <div className="font-bold">After {hp.year}</div>
            <div className="mt-1 flex justify-between gap-4"><span style={{ color: "var(--app-text-muted)" }}>TPL</span><M v={hp.tpl} digits={2} bold /></div>
            {prev && <div className="flex justify-between gap-4"><span style={{ color: "var(--app-text-muted)" }}>Change from {prev.year}</span><M v={hp.tpl - prev.tpl} digits={2} /></div>}
            <div className="flex justify-between gap-4"><span style={{ color: "var(--app-text-muted)" }}>{hp.year} WRS</span><M v={hp.wrs} digits={2} /></div>
          </Tip>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] sm:px-2" style={{ color: "var(--app-text-muted)" }}>
        <span className="inline-flex items-center gap-1.5"><svg width={22} height={10} aria-hidden><line x1={0} x2={22} y1={5} y2={5} stroke="var(--app-text-primary)" strokeWidth={2} /><circle cx={11} cy={5} r={3.5} fill="var(--app-text-muted)" /></svg>TPL after that year&apos;s elections</span>
        <span className="inline-flex items-center gap-1.5"><svg width={10} height={10} aria-hidden><circle cx={5} cy={5} r={3.5} fill="none" stroke="var(--app-text-muted)" strokeWidth={1.25} /></svg>That year&apos;s WRS alone</span>
      </div>
    </div>
  );
}
