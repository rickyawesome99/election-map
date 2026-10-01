"use client";

import { fmt1, marginColor } from "./format";
import type { YearAggregation } from "./types";

// The year × office matrix as a scoreboard: years run across (oldest first), and each column
// opens with the year, its WRS and its weight bar; the office rows beneath are a heat grid
// of neutralized margins (tint deepens with size, full at 20 points), the breakdown of the
// number above. Shares and cell notes live in the tooltip. Clicking a cell, a column head or
// an office label selects which races the table beneath shows, and a chip above the grid
// names it; the selected cells get a faint outline. Clicking the same thing again shows all races. Years
// with no race are left out, so a state without off-year elections shows only its even cycles.
// Phones get short office names, 'YY years and bare numbers (the tint carries the party).

export type MatrixSelection = { year: number | "all"; type: string | "all" };
export type MatrixOffice = { key: string; label: string; short?: string };
export type MatrixCell = { nm: number; share: number; note?: string } | null;

const ALL: MatrixSelection = { year: "all", type: "all" };

function heat(nm: number): string {
  if (nm === 0) return "var(--app-tab-bg)";
  const pct = 7 + (Math.min(Math.abs(nm), 20) / 20) * 43;
  return `color-mix(in srgb, ${nm > 0 ? "var(--party-rep)" : "var(--party-dem)"} ${pct.toFixed(1)}%, transparent)`;
}

/** R+28.0 on wider screens, the bare 28.0 on phones. */
function Margin({ v, bareOnPhone = true }: { v: number; bareOnPhone?: boolean }) {
  if (!bareOnPhone) return <>{fmt1(v)}</>;
  return <><span className="sm:hidden">{v === 0 ? "0" : Math.abs(v).toFixed(1)}</span><span className="hidden sm:inline">{fmt1(v)}</span></>;
}

const HIT = "block w-full rounded transition-colors hover:bg-[var(--app-tab-bg)]";

export function TplMatrix({ years: allYears, offices, cellFor, selection, onSelect, weightLabel = "wt" }: {
  years: YearAggregation[];
  offices: MatrixOffice[];
  cellFor: (year: YearAggregation, key: string) => MatrixCell;
  selection: MatrixSelection;
  onSelect: (s: MatrixSelection) => void;
  weightLabel?: string;
}) {
  const years = allYears.filter((y) => y.racesPresent.length > 0).sort((a, b) => a.year - b.year);
  const maxW = Math.max(...years.map((y) => y.finalWeight), 0.0001);
  const isAll = selection.year === "all" && selection.type === "all";
  // Cells inside the selection get a faint outline around the cell, in the 3px gap between
  // cells, in the text color (dark on light, light on dark).
  const picked = (year: number, key: string) => !isAll && (selection.year === "all" || selection.year === year) && (selection.type === "all" || selection.type === key);
  const RING = "1.5px solid color-mix(in srgb, var(--app-text-primary) 55%, transparent)";
  const pick = (s: MatrixSelection) => onSelect(s.year === selection.year && s.type === selection.type ? ALL : s);
  const officeLabel = (key: string) => offices.find((o) => o.key === key)?.label ?? key;
  const chip = selection.year === "all" ? `All ${officeLabel(String(selection.type))} races` : selection.type === "all" ? `All ${selection.year} races` : `${selection.year} · ${officeLabel(selection.type)}`;
  // More than five columns: phones drop the R+/D+ on the WRS too.
  const crowded = years.length > 5;

  return (
    <div>
      <div className="mb-2 flex min-h-7 flex-wrap items-center gap-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {isAll ? <span>All races · click a cell, year or office to narrow the table below</span> : (
          <span className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2.5 pr-1 font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
            {chip}
            <button type="button" onClick={() => onSelect(ALL)} aria-label="Show all races" className="grid h-5 w-5 place-items-center rounded-full text-sm leading-none hover:bg-[var(--app-border)]" style={{ color: "var(--app-text-muted)" }}>×</button>
          </span>
        )}
      </div>
      <table className="w-full table-fixed tabular-nums" style={{ borderCollapse: "separate", borderSpacing: 3 }}>
        <colgroup>
          <col className="w-[46px] sm:w-[104px]" />
          {years.map((y) => <col key={y.year} />)}
        </colgroup>
        <tbody>
          <tr>
            <td />
            {years.map((y) => (
                <td key={y.year} className="pb-1.5 text-center align-bottom">
                  <button type="button" onClick={() => pick({ year: y.year, type: "all" })} title={`${y.year}: every race that year`}
                    className={`${HIT} rounded-b-none pb-2 pt-1.5`} style={{ borderBottom: `2px solid ${marginColor(y.WRS)}` }}>
                    <span className="block text-[11px] font-bold sm:text-xs" style={{ color: "var(--app-text-muted)" }}>
                      <span className="sm:hidden">&rsquo;{String(y.year).slice(2)}</span><span className="hidden sm:inline">{y.year}</span>
                    </span>
                    <span className="block whitespace-nowrap text-[13px] font-bold leading-tight sm:text-[1.35rem]" style={{ fontFamily: "var(--font-serif)", color: marginColor(y.WRS) }}>
                      <Margin v={y.WRS} bareOnPhone={crowded} />
                    </span>
                    <span className="mx-auto mt-1 block h-1 w-4/5 overflow-hidden rounded-sm sm:w-3/5" style={{ background: "var(--app-tab-bg)" }}>
                      <span className="block h-full" style={{ width: `${(y.finalWeight / maxW) * 100}%`, background: "var(--app-text-muted)" }} />
                    </span>
                    <span className="mt-0.5 hidden text-[11px] sm:block" style={{ color: "var(--app-text-muted)" }} title={`${weightLabel} ${y.finalWeight.toFixed(3)}`}>{Math.round(y.finalWeight * 100)}%</span>
                  </button>
                </td>
            ))}
          </tr>
          {offices.map((o) => (
            <tr key={o.key}>
              <td className="h-[30px] text-left sm:h-[48px] lg:h-[60px]">
                <button type="button" onClick={() => pick({ year: "all", type: o.key })} title={`All ${o.label} races`}
                  className={`${HIT} h-full px-1 text-left text-[11.5px] font-semibold sm:px-1.5 sm:text-[12.5px]`} style={{ color: "var(--app-text-primary)" }}>
                  <span className="sm:hidden">{o.short ?? o.label}</span><span className="hidden sm:inline">{o.label}</span>
                </button>
              </td>
              {years.map((y) => {
                const cell = cellFor(y, o.key);
                if (!cell) return <td key={y.year} />;
                const share = `${Math.round(cell.share * 1000) / 10}% of ${y.year}'s WRS`;
                return (
                  <td key={y.year} className="relative h-[30px] rounded-sm p-0 text-center sm:h-[48px] lg:h-[60px]"
                    style={{ background: heat(cell.nm), outline: picked(y.year, o.key) ? RING : undefined, outlineOffset: 1 }}>
                    <button type="button" onClick={() => pick({ year: y.year, type: o.key })}
                      className={`absolute inset-0 whitespace-nowrap rounded-sm text-[11.5px] font-bold ${picked(y.year, o.key) ? "" : "hover:shadow-[inset_0_0_0_1px_var(--app-text-muted)]"} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-text-primary)] sm:text-[12.5px] lg:text-sm`}
                      style={{ color: marginColor(cell.nm) }}
                      title={`${o.label} ${y.year}: ${fmt1(cell.nm)} · ${share}${cell.note ? ` · ${cell.note}` : ""}. Click for its races.`}>
                      <Margin v={cell.nm} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
