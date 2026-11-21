"use client";

import type { ReactNode } from "react";
import { useTouchHover } from "@/lib/useTouchHover";
import { fmt2, marginColor, signed } from "./format";
import type { YearAggregation } from "./types";
import { ArrowOut, M, VERY_MUTED } from "./ui";

// The result ledger under a State or District TPL: one row per weighted year with a dot plot
// after the year, then its weight, its margin, the year's environment, the WRS left once the
// environment is removed (margin + ENV), set in the serif margin face as the row's headline
// figure, and the TPL total at the right.

const RTH = "whitespace-nowrap px-1 py-2 text-[10px] font-bold uppercase tracking-wider text-left sm:px-2";
const RTD = "whitespace-nowrap px-1 py-1.5 tabular-nums sm:px-2";
const RTD_R = `${RTD} text-right`;

export function ResultTable({ years, tpl, label, centered, median, medianLabel, onWeight, onEnv }: {
  /** The years with weight, newest first. */
  years: YearAggregation[];
  tpl: number;
  label: string;
  centered: number;
  median: number;
  /** "50-state median", "435-district median". */
  medianLabel: string;
  onWeight: () => void;
  onEnv: () => void;
}) {
  useTouchHover();
  const maxWeight = Math.max(...years.map((y) => y.finalWeight), 0.0001);
  const plot = plotScale([0, tpl, ...years.map((y) => y.WRS)]);
  return (
    <>
    {/* One row per year: a dot plot after the year, then weight, margin, environment and WRS. Each
        year's dot sits at its WRS on a shared D–R axis, sized by its weight; the vertical
        line is TPL, the weighted center of the dots. */}
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <th className={`${RTH} sm:w-[10%]`}>Year</th>
            <th className="hidden px-4 py-2 sm:table-cell">
              <div className="relative h-3 text-[10px] font-semibold tabular-nums" style={VERY_MUTED}>
                {plot.ticks.map((t) => (
                  <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${plot.x(t)}%` }}>{t === 0 ? "EVEN" : `${t > 0 ? "R" : "D"}+${Math.abs(t)}`}</span>
                ))}
              </div>
            </th>
            <th className={`${RTH} text-right sm:w-[11%]`}><button type="button" onClick={onWeight} className="uppercase hover:underline" title="How year weights are set">Weight <ArrowOut /></button></th>
            <th className={`${RTH} text-right sm:w-[11%]`} title="The year's weighted office average, before the environment is removed: the figure at the top of the matrix">Margin</th>
            <th className={`${RTH} text-right sm:w-[11%]`}><button type="button" onClick={onEnv} className="uppercase hover:underline" title="The year's national environment, removed once from the year's margin">Env <ArrowOut /></button></th>
            <th className={`${RTH} text-right sm:w-[13%]`} style={{ color: "var(--app-text-primary)" }} title="Weighted Race Score: margin + ENV">WRS</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const r = 3.5 + 7.5 * Math.sqrt(y.finalWeight / maxWeight);
            return (
              <tr key={y.year} data-touch-hover className="tbl-tr" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className={`${RTD} font-semibold`}>{y.year}</td>
                <td className="hidden px-4 py-0 sm:table-cell">
                  <PlotTrack plot={plot} tpl={tpl}>
                    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" title={`${y.year}: WRS ${fmt2(y.WRS)}, weight ${(y.finalWeight * 100).toFixed(0)}%`}
                      style={{ left: `${plot.x(y.WRS)}%`, width: r * 2, height: r * 2, background: `color-mix(in srgb, ${marginColor(y.WRS)} 70%, transparent)`, boxShadow: `0 0 0 1.5px ${marginColor(y.WRS)}` }} />
                  </PlotTrack>
                </td>
                <td className={RTD_R}>{(y.finalWeight * 100).toFixed(0)}%</td>
                <td className={RTD_R}><M v={y.WRS + (y.env ?? 0)} /></td>
                <td className={RTD_R} style={{ color: "var(--app-text-muted)" }}>{y.env ? signed(-y.env) : "—"}</td>
                <td className={`${RTD_R} text-base font-bold sm:text-[1.2rem]`} style={{ fontFamily: "var(--font-serif)", color: marginColor(y.WRS) }}>{fmt2(y.WRS)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* Marks where the TPL line lands, under the plot. */}
          <tr className="hidden sm:table-row">
            <td />
            <td className="px-4 pt-1">
              <div className="relative h-4">
                <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider" style={{ left: `${plot.x(tpl)}%`, color: marginColor(tpl) }}>▲ TPL</span>
              </div>
            </td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
    <div className="mt-2 flex items-start justify-between gap-4 px-1 sm:px-2">
      <span className="shrink-0 whitespace-nowrap pt-1 text-sm font-bold">{label}</span>
      <div className="text-right">
        <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, lineHeight: 1, color: marginColor(tpl) }}>{fmt2(tpl)}</div>
        <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Centered <M v={centered} digits={2} bold /> after subtracting the {medianLabel} ({fmt2(median)})</div>
      </div>
    </div>
    </>
  );
}

type PlotScale = { x: (v: number) => number; ticks: number[] };

/** A D–R axis covering the values with a little room, ticks on round numbers. Margins are R − D. */
function plotScale(values: number[]): PlotScale {
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  const step = hi0 - lo0 > 24 ? 10 : 5;
  const lo = Math.floor((lo0 - 1) / step) * step, hi = Math.ceil((hi0 + 1) / step) * step;
  const ticks: number[] = [];
  // Interior ticks only: lines at the very ends would read as column borders.
  for (let t = lo + step; t < hi - 1e-9; t += step) ticks.push(t);
  return { x: (v) => ((v - lo) / (hi - lo)) * 100, ticks };
}

/** One row's strip of the dot plot: faint gridlines at the ticks, EVEN darker, and the TPL line. */
function PlotTrack({ plot, tpl, children }: { plot: PlotScale; tpl: number; children: ReactNode }) {
  return (
    <div className="relative h-11">
      {plot.ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px" style={{ left: `${plot.x(t)}%`, background: t === 0 ? "color-mix(in srgb, var(--app-text-primary) 25%, transparent)" : "var(--app-border)" }} />
      ))}
      <span className="absolute inset-y-0 w-0.5 -translate-x-1/2" style={{ left: `${plot.x(tpl)}%`, background: marginColor(tpl) }} />
      {children}
    </div>
  );
}
