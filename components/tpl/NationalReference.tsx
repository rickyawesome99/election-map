"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { MATRIX_ROWS, fmt1, marginColor } from "./format";
import { heat } from "./TplMatrix";
import type { NationalYear } from "./types";
import { Foot } from "./ui";

// The nation graded the way a state is: every year 2016–2026 (odd years included) across, each
// office's national neutralized margin beneath, with no environment removed. The year's margin
// on top is the same weighted office average a state's matrix shows. Under the grid, the model's
// fitted environment for the year, what is left of the national margin once it is removed, and
// the House vote that pins the environment's zero, for comparison.

const LABEL = "px-1 py-1.5 text-left text-[11.5px] font-semibold sm:px-1.5 sm:text-[12.5px]";
const NUM = "px-1 py-1.5 text-center text-[11.5px] font-bold tabular-nums sm:text-[12.5px]";

export function NationalReference({ years, tpl }: { years: NationalYear[]; tpl: number }) {
  const dash = <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const summary: { label: string; title: string; value: (y: NationalYear) => number | null }[] = [
    { label: "Model env. E", title: "The environment TPL removes from the year: fitted from how each state ran against its own lean, every state counting equally", value: (y) => y.env },
    { label: "After ENV", title: "The national margin with the model's environment removed: the nation's WRS for the year", value: (y) => y.margin - y.env },
    { label: "House vote", title: "National U.S. House vote with every seat contested (even years). The environment's zero is a tie in this vote", value: (y) => y.housePv },
  ];
  return (
    <section id="national" className="mt-10 scroll-mt-24">
      <LedgerSectionHead label="National reference · the nation graded as a state" meta={<>no environment removed · nation&apos;s TPL after ENV <b style={{ color: marginColor(tpl) }}>{fmt1(tpl)}</b></>} />
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[720px] table-fixed tabular-nums" style={{ borderCollapse: "separate", borderSpacing: 3 }}>
          <colgroup>
            <col className="w-[104px]" />
            {years.map((y) => <col key={y.year} />)}
          </colgroup>
          <tbody>
            <tr>
              <td />
              {years.map((y) => (
                <td key={y.year} className="pb-2 pt-1.5 text-center align-bottom" style={{ borderBottom: `2px solid ${marginColor(y.margin)}` }}
                  title={`${y.year}: national margin ${fmt1(y.margin)}, the weighted average of the offices below`}>
                  <span className="block text-xs font-bold" style={{ color: "var(--app-text-muted)" }}>{y.year}</span>
                  <span className="block whitespace-nowrap text-[0.85rem] font-bold leading-tight lg:text-base" style={{ fontFamily: "var(--font-serif)", color: marginColor(y.margin) }}>{fmt1(y.margin)}</span>
                </td>
              ))}
            </tr>
            {MATRIX_ROWS.map((o) => (
              <tr key={o.key}>
                <td className={LABEL}>{o.label}</td>
                {years.map((y) => {
                  const cell = y.cells[o.key];
                  if (!cell) return <td key={y.year} />;
                  return (
                    <td key={y.year} className={`${NUM} h-[40px] rounded-sm`} style={{ background: heat(cell.nm), color: marginColor(cell.nm) }}
                      title={`${o.label} ${y.year}: ${fmt1(cell.nm)} across ${cell.states} state${cell.states === 1 ? "" : "s"} · ${Math.round((y.shares[o.key] ?? 0) * 1000) / 10}% of the year's margin`}>
                      {fmt1(cell.nm)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {summary.map((row, i) => (
              <tr key={row.label} title={row.title}>
                <td className={LABEL} style={{ color: "var(--app-text-muted)", borderTop: i === 0 ? "1px solid var(--app-border)" : undefined }}>{row.label}</td>
                {years.map((y) => {
                  const v = row.value(y);
                  return <td key={y.year} className={NUM} style={{ color: v == null ? undefined : marginColor(v), borderTop: i === 0 ? "1px solid var(--app-border)" : undefined }}>{v == null ? dash : fmt1(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Foot>
        Each cell is that office&apos;s neutralized margin (incumbency and money removed, missing contests filled in) averaged over the states that held it, a state counting by its presidential turnout. The figure on top combines the offices with the same weights a state&apos;s year uses. Senate, governor and odd-year cells rest on whichever states voted, so they also reflect which states those were. Hover a cell for the count.
      </Foot>
    </section>
  );
}
