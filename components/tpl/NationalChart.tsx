"use client";

import { useState } from "react";
import { MarginField, marginAxis, partyFill, smoothPath, useWidth } from "@/components/MarginGraphKit";
import { MATRIX_ROWS, fmt1, marginColor } from "./format";
import type { NationalYear } from "./types";
import { M, TD, TD_R, TH, TH_R } from "./ui";

// The national reference as a picture: the nation's margin for each year, 2016 to 2026, as one
// line. Clicking a year selects it, and the panel underneath shows that year's breakdown: each
// office's national neutralized margin with its share of the year and the states behind it, then
// the model's environment for the year, what is left once it is removed, and the House vote.
// It opens on the latest year.

export function NationalChart({ years }: { years: NationalYear[] }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [picked, setPicked] = useState<number>(years[years.length - 1]?.year ?? 0);
  const [hover, setHover] = useState<number | null>(null);
  const compact = width > 0 && width < 560;
  const H = compact ? 230 : 280;
  const pad = { top: 26, right: compact ? 10 : 16, bottom: 34, left: compact ? 44 : 54 };
  const iw = Math.max(0, width - pad.left - pad.right);
  const ih = H - pad.top - pad.bottom;
  const axis = marginAxis(years.map((y) => y.margin));
  const colW = years.length ? iw / years.length : 0;
  const x = (i: number) => pad.left + colW * (i + 0.5);
  const y = (v: number) => pad.top + ((axis.hi - v) / (axis.hi - axis.lo)) * ih;
  const line = years.map((yr, i) => ({ x: x(i), y: y(yr.margin) }));
  // Where a value label sits so the line does not run through it: under a dip, over a peak, and
  // on a slope up and to the side the line is not on (left where it climbs, right where it falls).
  const labelAt = (i: number, on: boolean): { dx: number; dy: number; anchor: "start" | "middle" | "end" } => {
    const v = years[i].margin, prev = years[i - 1]?.margin, next = years[i + 1]?.margin;
    const far = on ? 5 : 0;
    if ((prev ?? Infinity) > v && (next ?? Infinity) > v) return { dx: 0, dy: 20 + far, anchor: "middle" };
    if (prev == null || next == null || (prev < v && next < v)) return { dx: 0, dy: -11 - far, anchor: "middle" };
    return next > v ? { dx: -9 - far, dy: -7, anchor: "end" } : { dx: 9 + far, dy: -7, anchor: "start" };
  };
  // Phones label the even years and whichever year is selected.
  const labelled = (yr: NationalYear) => !compact || yr.year % 2 === 0 || yr.year === picked;
  const sel = years.find((yr) => yr.year === picked) ?? years[years.length - 1];
  const offices = MATRIX_ROWS.filter((o) => sel?.cells[o.key]);
  if (!sel) return null;

  return (
    <div>
      <div ref={boxRef} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} role="group" aria-label="National margin by year. Select a year for its breakdown." style={{ touchAction: "pan-y" }} onPointerLeave={() => setHover(null)}>
            <MarginField x0={pad.left} x1={pad.left + iw} y={y} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact={compact} />
            {years.map((yr, i) => {
              const on = yr.year === picked;
              const hot = yr.year === hover && !on;
              return (on || hot) && <rect key={yr.year} x={x(i) - colW / 2} y={pad.top} width={colW} height={ih} fill="var(--app-text-primary)" opacity={on ? 0.08 : 0.04} />;
            })}
            <path d={smoothPath(line)} fill="none" stroke="var(--app-text-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {years.map((yr, i) => {
              const on = yr.year === picked;
              return (
                <g key={yr.year}>
                  <circle cx={x(i)} cy={y(yr.margin)} r={on ? 6.5 : 4.5} fill={partyFill(yr.margin)} stroke="var(--app-bg)" strokeWidth={2} />
                  {on && <circle cx={x(i)} cy={y(yr.margin)} r={9.5} fill="none" stroke="var(--app-text-primary)" strokeWidth={1.5} />}
                  {labelled(yr) && (
                    <text x={x(i) + labelAt(i, on).dx} y={y(yr.margin) + labelAt(i, on).dy} textAnchor={labelAt(i, on).anchor} fontSize={compact ? 11 : on ? 14 : 12.5} fontWeight={700} fill={marginColor(yr.margin)}
                      style={{ fontFamily: "var(--font-serif)", fontVariantNumeric: "tabular-nums", paintOrder: "stroke", stroke: "var(--app-bg)", strokeWidth: 3 }}>
                      {fmt1(yr.margin)}
                    </text>
                  )}
                  <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={on ? 700 : 500} fill={on ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {compact ? `’${String(yr.year).slice(2)}` : yr.year}
                  </text>
                  {/* The whole column is the click target. */}
                  <rect x={x(i) - colW / 2} y={pad.top} width={colW} height={H - pad.top} fill="transparent" role="button" tabIndex={0} aria-pressed={on}
                    aria-label={`${yr.year}: national margin ${fmt1(yr.margin)}`} style={{ cursor: "pointer", outline: "none" }}
                    onClick={() => setPicked(yr.year)} onPointerEnter={() => setHover(yr.year)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(yr.year); } }} />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* The selected year. The left table is tall enough for five offices, so the page does not jump between years. */}
      <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-live="polite">
        <div className="min-w-0 md:min-h-[196px]">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <th className={`${TH} pl-0`}>{sel.year} by office</th>
                <th className={TH_R}>Margin</th>
                <th className={TH}>Share of the year</th>
                <th className={`${TH_R} pr-0`}>States</th>
              </tr>
            </thead>
            <tbody>
              {offices.map((o) => {
                const cell = sel.cells[o.key];
                const share = sel.shares[o.key] ?? 0;
                return (
                  <tr key={o.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={`${TD} pl-0 font-semibold`}>{o.label}</td>
                    <td className={TD_R}><M v={cell.nm} digits={1} bold /></td>
                    <td className={`${TD} w-[45%]`}>
                      <span className="flex items-center gap-2">
                        <span className="block h-1.5 flex-1 overflow-hidden rounded-sm" style={{ background: "var(--app-tab-bg)" }}>
                          <span className="block h-full rounded-sm" style={{ width: `${share * 100}%`, background: "var(--app-text-muted)" }} />
                        </span>
                        <span className="w-8 text-right" style={{ color: "var(--app-text-muted)" }}>{Math.round(share * 100)}%</span>
                      </span>
                    </td>
                    <td className={`${TD_R} pr-0`} style={{ color: "var(--app-text-muted)" }}>{cell.states}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="min-w-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <th className={`${TH} pl-0`}>{sel.year} and the environment</th>
                <th className={`${TH_R} pr-0`} />
              </tr>
            </thead>
            <tbody>
              {([
                ["National margin", sel.margin, "The weighted average of the offices"],
                ["Model env. E", sel.env, "The environment TPL removes from the year"],
                ["After ENV", sel.margin - sel.env, "National margin with the environment removed"],
                ["House vote", sel.housePv, "National U.S. House vote, every seat contested (even years)"],
              ] as [string, number | null, string][]).map(([label, v, note], i) => (
                <tr key={label} title={note} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className={`${TD} pl-0 font-semibold`}>{label}</td>
                  <td className={`${TD_R} pr-0`}><M v={v} digits={1} bold={i === 0 || i === 2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
