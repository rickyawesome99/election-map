"use client";
import Link from "next/link";

import { useMemo, useRef, useState } from "react";
import MarketCallChips from "@/components/MarketCallChips";
import MarketRaceCards from "@/components/MarketRaceCards";
import Segmented from "@/components/MarketSegmented";
import { KIND_LABEL, fmtWinMargin, nameOf, partyColor, partyOf, worstMiss, type MarketRaceRow } from "@/lib/predictionMarketDisplay";

type SortKey = "year" | "race" | "price" | "margin";
type Verdict = "all" | "missed" | "called";
type Kind = MarketRaceRow["kind"] | "all";

// Widths match The Misses table above (components/MarketMissTable.tsx), so the two line up.
const COLUMNS: { key: SortKey | null; label: string; right?: true; title: string; width: string }[] = [
  { key: "year", label: "Year", title: "Election year", width: "7%" },
  { key: "race", label: "Race", title: "Office and state or district", width: "19%" },
  { key: "price", label: "Election-eve market", title: "Each venue's favorite and its price the night before the election. Sorts by how heavily the favorite was priced.", width: "40%" },
  { key: null, label: "Winner", title: "Who won", width: "24%" },
  { key: "margin", label: "Margin", right: true, title: "The winner's margin in points", width: "10%" },
];
/** Races shown before "Show all", which keeps the box's height and turns it into a scrollbox. */
const ROWS = 10;

/** The least confident venue's price: the race's place on the toss-up-to-lock scale. */
const confidence = (r: MarketRaceRow) => Math.min(...r.markets.map((m) => m.favProb));

function sortValue(r: MarketRaceRow, key: SortKey): number | string {
  switch (key) {
    case "year": return -r.year;
    case "race": return `${r.kind === "H" ? r.place : `${r.place} ${r.kind}`}`;
    case "price": return confidence(r);
    case "margin": return Math.abs(r.margin);
  }
}

export default function MarketAccuracyTable({ rows, years }: { rows: MarketRaceRow[]; years: number[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "price", dir: 1 });
  const [year, setYear] = useState<number | "all">("all");
  const [kind, setKind] = useState<Kind>("all");
  const [verdict, setVerdict] = useState<Verdict>("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [height, setHeight] = useState<{ cards: number; table: number } | null>(null);
  const cards = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (year === "all" || r.year === year) && (kind === "all" || r.kind === kind))
      .filter((r) => (verdict === "all" ? true : verdict === "missed" ? worstMiss(r) > 0 : worstMiss(r) === 0))
      .filter((r) => !q || `${r.place} ${r.demName} ${r.repName} ${KIND_LABEL[r.kind]}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : b.year - a.year || a.place.localeCompare(b.place)) * sort.dir;
      });
  }, [rows, year, kind, verdict, query, sort]);
  const visible = all ? shown : shown.slice(0, ROWS);

  const toggle = () => {
    // Only one of the two views is displayed; the hidden one measures 0 and is never shown at that size.
    if (!all) setHeight({ cards: cards.current?.offsetHeight ?? 0, table: table.current?.offsetHeight ?? 0 });
    setAll(!all);
  };
  // maxHeight, not height, so a filter that leaves fewer races shrinks the box instead of padding it.
  // The reserved gutter keeps the columns from shifting when the scrollbar appears.
  const box = (h: number | undefined) => ({ scrollbarGutter: "stable" as const, ...(all && h ? { maxHeight: h } : {}) });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented label="Election year" value={year} onChange={setYear} options={[["all", "All years"], ...years.map((y): [number, string] => [y, String(y)])]} />
        <Segmented label="Office" value={kind} onChange={setKind} options={[["all", "All offices"], ["P", "President"], ["S", "Senate"], ["G", "Governor"], ["H", "House"]]} />
        <Segmented label="Outcome" value={verdict} onChange={setVerdict} options={[["all", "All"], ["missed", "Missed"], ["called", "Called"]]} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a state, district or candidate" aria-label="Find a state, district or candidate"
          className="w-64 max-w-full rounded-md px-3 py-1.5 text-sm outline-none" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{shown.length} races</span>
      </div>

      {/* The first ROWS races sit static; "Show all" scrolls the rest under a sticky header. The rule under
          the header is an inset shadow because a collapsed border scrolls away with the row. */}
      <div ref={cards} className="overflow-y-auto sm:hidden" style={{ borderTop: "1px solid var(--app-border)", ...box(height?.cards) }}>
        <MarketRaceCards rows={visible} />
        {shown.length === 0 && <p className="py-6 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No races match these filters.</p>}
      </div>
      <div ref={table} className="hidden overflow-y-auto sm:block" style={{ borderBottom: "1px solid var(--app-border)", ...box(height?.table) }}>
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>{COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
          <thead className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" title={c.title} aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${c.right ? "text-right" : "text-left"}`}
                  style={{ color: "var(--app-text-muted)", boxShadow: "inset 0 -1px 0 var(--app-border)" }}>
                  {c.key ? (
                    <button type="button" className="uppercase tracking-wider hover:underline" onClick={() => setSort((s) => ({ key: c.key!, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.raceId} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="px-2 py-2 align-top tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                <td className="px-2 py-2 align-top">
                  {r.href ? <Link prefetch={false} href={r.href} className="font-semibold hover:underline">{r.place}</Link> : <span className="font-semibold">{r.place}</span>}
                  <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{KIND_LABEL[r.kind]}{r.runoff ? " · runoff" : ""}</div>
                </td>
                <td className="px-2 py-2 align-top"><MarketCallChips row={r} /></td>
                <td className="px-2 py-2 align-top">
                  <span className="font-semibold" style={{ color: partyColor(partyOf(r, r.winner)) }}>{nameOf(r, r.winner)}</span>
                  <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>def. {nameOf(r, r.winner === "D" ? "R" : "D")}</div>
                </td>
                <td className="px-2 py-2 text-right align-top font-semibold tabular-nums" style={{ color: partyColor(partyOf(r, r.winner)) }}>{fmtWinMargin(r)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No races match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > ROWS && (
        <button type="button" onClick={toggle} className="mt-2 px-2 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
          {all ? "Show fewer" : `Show all ${shown.length}`}
        </button>
      )}
    </div>
  );
}
