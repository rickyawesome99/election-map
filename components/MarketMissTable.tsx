"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import MarketCallChips from "@/components/MarketCallChips";
import MarketRaceCards from "@/components/MarketRaceCards";
import { KIND_LABEL, fmtWinMargin, nameOf, partyColor, partyOf, type MarketRaceRow } from "@/lib/predictionMarketDisplay";

// "The Misses" on /analysis/markets: the first ROWS races sit static; "Show all" keeps the box's height
// and turns it into a scrollbox under a sticky header. Fixed column widths and a reserved scrollbar
// gutter keep every column where it was. Phones get the same behavior on the race cards.

const ROWS = 10;
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const rowStyle = { borderBottom: "1px solid var(--app-border)" };
const COLUMNS: [string, string][] = [["Year", "7%"], ["Race", "19%"], ["Election-eve market", "40%"], ["Winner", "24%"], ["Margin", "10%"]];

function RaceCell({ r }: { r: MarketRaceRow }) {
  return (
    <>
      {r.href ? <Link prefetch={false} href={r.href} className="font-semibold hover:underline">{r.place}</Link> : <span className="font-semibold">{r.place}</span>}
      <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{KIND_LABEL[r.kind]}{r.runoff ? " · runoff" : ""}</div>
    </>
  );
}

export default function MarketMissTable({ rows }: { rows: MarketRaceRow[] }) {
  const [all, setAll] = useState(false);
  const [height, setHeight] = useState<{ cards: number; table: number } | null>(null);
  const cards = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const shown = all ? rows : rows.slice(0, ROWS);

  const toggle = () => {
    // Only one of the two views is displayed; the hidden one measures 0 and is never shown at that size.
    if (!all) setHeight({ cards: cards.current?.offsetHeight ?? 0, table: table.current?.offsetHeight ?? 0 });
    setAll(!all);
  };
  const box = (h: number | undefined) => ({ scrollbarGutter: "stable" as const, ...(all && h ? { height: h } : {}) });

  return (
    <>
      <div ref={cards} className="overflow-y-auto sm:hidden" style={{ borderTop: "1px solid var(--app-border)", ...box(height?.cards) }}>
        <MarketRaceCards rows={shown} />
      </div>
      <div ref={table} className="hidden overflow-y-auto sm:block" style={{ borderBottom: "1px solid var(--app-border)", ...box(height?.table) }}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>{COLUMNS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
            {/* Inset shadow for the header rule, since a collapsed border scrolls away with the row. */}
            <tr>{COLUMNS.map(([h], i) => (
              <th key={h} scope="col" className={`${th} ${i === 4 ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)", boxShadow: "inset 0 -1px 0 var(--app-border)" }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.raceId} style={rowStyle}>
                <td className="px-2 py-2 align-top tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                <td className="px-2 py-2 align-top"><RaceCell r={r} /></td>
                <td className="px-2 py-2 align-top"><MarketCallChips row={r} /></td>
                <td className="px-2 py-2 align-top">
                  <span className="font-semibold" style={{ color: partyColor(partyOf(r, r.winner)) }}>{nameOf(r, r.winner)}</span>
                  <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>def. {nameOf(r, r.winner === "D" ? "R" : "D")}</div>
                </td>
                <td className="px-2 py-2 text-right align-top font-semibold tabular-nums" style={{ color: partyColor(partyOf(r, r.winner)) }}>{fmtWinMargin(r)}</td>
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
    </>
  );
}
