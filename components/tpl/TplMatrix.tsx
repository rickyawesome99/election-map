"use client";

import type { ReactNode } from "react";
import { fmt1, marginColor } from "./format";
import type { YearAggregation } from "./types";

// The year × office matrix: one neutralized margin per cell, the year's WRS in the bottom row
// and its weight under that. Clicking a cell, a WRS or a row label selects which races the
// table beneath shows. Years with no race in the window collapse to a thin column so the
// window reads as the model's 2016–2025, not as five cycles.

export type MatrixSelection = { year: number | "all"; type: string | "all" };
export type MatrixRow = { key: string; label: ReactNode; weight?: number };
export type MatrixCell = { nm: number; share: number; note?: string } | null;

export function TplMatrix({ years, rows, cellFor, selection, onSelect, weightLabel = "Weight" }: {
  years: YearAggregation[];
  rows: MatrixRow[];
  cellFor: (year: YearAggregation, key: string) => MatrixCell;
  selection: MatrixSelection;
  onSelect: (s: MatrixSelection) => void;
  weightLabel?: string;
}) {
  const maxW = Math.max(...years.map((y) => y.finalWeight), 0.0001);
  const thin = (y: YearAggregation) => y.racesPresent.length === 0;
  const th = "px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wider";
  const stickyCol = "sticky left-0 z-10 whitespace-nowrap px-2 text-left";
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[640px] border-collapse text-xs tabular-nums">
        <thead>
          <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
            <th className={`${stickyCol} ${th} text-left`} style={{ color: "var(--app-text-muted)", background: "var(--app-bg)" }}>Office · base wt</th>
            {years.map((y) => (
              <th key={y.year} className={`${th} ${thin(y) ? "w-7 px-0" : ""}`} style={{ color: thin(y) ? "var(--app-text-very-muted)" : "var(--app-text-muted)" }}>
                {thin(y) ? String(y.year).slice(2) : y.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowOn = selection.type === row.key && selection.year === "all";
            return (
              <tr key={row.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className={`${stickyCol} py-1`} style={{ background: "var(--app-bg)" }}>
                  <button type="button" onClick={() => onSelect({ year: "all", type: row.key })} className="font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    style={{ color: "var(--app-text-primary)", textDecorationColor: rowOn ? "var(--app-text-primary)" : "var(--app-border)" }} title={`All ${typeof row.label === "string" ? row.label : ""} races`}>
                    {row.label}
                  </button>
                  {row.weight != null && <span className="ml-1.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{row.weight.toFixed(2).replace(/^0/, "")}</span>}
                </td>
                {years.map((y) => {
                  const cell = thin(y) ? null : cellFor(y, row.key);
                  if (!cell) return <td key={y.year} className="py-1 text-center" style={{ color: "var(--app-text-very-muted)" }}>{thin(y) ? "" : "–"}</td>;
                  const on = selection.type === row.key && (selection.year === y.year || selection.year === "all");
                  return (
                    <td key={y.year} className="p-0.5 text-center align-middle">
                      <button type="button" onClick={() => onSelect({ year: y.year, type: row.key })} aria-pressed={on}
                        className="w-full rounded px-1 py-1 font-bold leading-tight"
                        style={{ background: cell.nm > 0 ? "var(--party-rep-subtle)" : cell.nm < 0 ? "var(--party-dem-subtle)" : "var(--app-tab-bg)", color: marginColor(cell.nm), outline: on ? "2px solid var(--app-text-primary)" : undefined, outlineOffset: -1 }}
                        title={`${y.year} ${typeof row.label === "string" ? row.label : ""}: click for the races behind this cell`}>
                        {fmt1(cell.nm)}
                        <span className="block text-[10px] font-medium" style={{ color: "var(--app-text-muted)" }}>{Math.round(cell.share * 1000) / 10}%{cell.note ? ` · ${cell.note}` : ""}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
            <td className={`${stickyCol} py-2 text-[10px] font-bold uppercase tracking-wider`} style={{ color: "var(--app-text-muted)", background: "var(--app-bg)" }}>WRS</td>
            {years.map((y) => {
              if (thin(y)) return <td key={y.year} />;
              const on = selection.type === "all" && selection.year === y.year;
              return (
                <td key={y.year} className="py-1 text-center">
                  <button type="button" onClick={() => onSelect({ year: y.year, type: "all" })} aria-pressed={on} className="rounded px-2 py-1 font-bold"
                    style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", color: marginColor(y.WRS), outline: on ? "2px solid var(--app-text-primary)" : undefined }} title={`${y.year}: every race that year`}>
                    {fmt1(y.WRS)}
                  </button>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className={`${stickyCol} py-2 text-[10px] font-bold uppercase tracking-wider`} style={{ color: "var(--app-text-muted)", background: "var(--app-bg)" }}>{weightLabel}</td>
            {years.map((y) => (
              <td key={y.year} className="px-1 py-1.5 text-center text-[11px]" style={{ color: y.finalWeight > 0 ? "var(--app-text-muted)" : "var(--app-text-very-muted)" }}>
                {y.finalWeight > 0 ? y.finalWeight.toFixed(3).replace(/^0/, "") : "0"}
                {y.finalWeight > 0 && <span className="mx-auto mt-1 block h-1 max-w-[56px]" style={{ background: "var(--app-tab-bg)" }}><span className="block h-full" style={{ width: `${Math.round((y.finalWeight / maxW) * 100)}%`, background: "var(--app-text-primary)" }} /></span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
