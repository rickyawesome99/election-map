"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { fmtPrice, sideColor, type MarketBoardRace } from "@/lib/marketBoardDisplay";

// One side of the "Market Against Model" section on /analysis/markets: races where Polymarket prices a
// party at least 10 points below this site's forecast, widest gap first. Past ROWS races, "Show all"
// keeps the table's height and turns its body into a scrollbox under a sticky header.

const ROWS = 12;
const OFFICE_TAG = { senate: "Senate", governor: "Governor", house: "House" } as const;
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
// Inset shadow for the header rule, since a collapsed border scrolls away with the row.
const thStyle = { color: "var(--app-text-muted)", boxShadow: "inset 0 -1px 0 var(--app-border)" };
const rowStyle = { borderBottom: "1px solid var(--app-border)" };

export default function MarketGapTable({ side, rows }: { side: "D" | "R"; rows: MarketBoardRace[] }) {
  const [all, setAll] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const party = side === "D" ? "Democrats" : "Republicans";
  const color = `var(--party-${side === "D" ? "dem" : "rep"})`;
  const shown = all ? rows : rows.slice(0, ROWS);

  const toggle = () => {
    if (!all && box.current) setHeight(box.current.offsetHeight);
    setAll(!all);
  };

  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-sm font-bold" style={{ color }}>{party} priced below this site</h3>
      {/* Fixed column widths and a reserved scrollbar gutter, so expanding moves no column. */}
      <div ref={box} className="overflow-y-auto" style={{ scrollbarGutter: "stable", ...(all && height ? { height } : {}) }}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup><col style={{ width: "40%" }} /><col style={{ width: "20%" }} /><col style={{ width: "20%" }} /><col style={{ width: "20%" }} /></colgroup>
          <thead className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
            <tr>
              <th scope="col" className={`${th} text-left`} style={thStyle}>Race</th>
              <th scope="col" className={`${th} text-right`} style={thStyle}>Polymarket</th>
              <th scope="col" className={`${th} text-right`} style={thStyle}>This site</th>
              <th scope="col" className={`${th} text-right`} style={thStyle}>Gap</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.office}-${r.id}`} style={rowStyle}>
                <th scope="row" className="truncate whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                  <Link prefetch={false} href={r.href} className="hover:underline">{r.name}</Link>
                  <span className="ml-2 text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>{OFFICE_TAG[r.office]}</span>
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: sideColor(r.pDem) }}>{fmtPrice(r.pDem)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: sideColor(r.modelPDem) }}>{fmtPrice(r.modelPDem)}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color }}>
                  {side} +{Math.round(Math.abs(r.modelPDem - r.pDem) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ROWS && (
        <button type="button" onClick={toggle} className="mt-2 px-2 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
