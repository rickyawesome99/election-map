"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtLean, leanColor } from "@/lib/colorScale";
import { SplitBar } from "@/components/PastRaceTable";
import { lastName } from "@/lib/personName";
import type { PastRaceParty } from "@/lib/pastRaceTableTypes";

// The past-election page's county table, built like the /historical race table: each county a
// head-to-head bar (two-party share, the winner's side solid), its margin, its swing since the
// seat's previous election and its ballots; the two candidates' votes sit side by side after the bar (under it on phones). Sortable by any column, filtered by chips and a search
// box, the first rows shown with the rest a click away; a row opens the county's page. Below md a
// county stacks (name + margin, the bar, then swing and votes) and the headers become a sort menu.

export type PastCountyRow = {
  fips: string;
  name: string;
  href: string;
  /** House: the county is shared with another district (the row is this district's share). */
  split: boolean;
  demVotes: number;
  repVotes: number;
  demPct: number;
  repPct: number;
  /** R-positive. */
  margin: number;
  prevMargin: number | null;
  total: number;
};

type SortKey = "name" | "margin" | "swing" | "votes";
type Show = "all" | "flips" | "close";

const SHOW_FIRST = 15;
const CLOSE_PTS = 10;
// County | D votes | bar | R votes | margin | swing | ballots. The bar takes what is left, about a quarter of the row.
const GRID = "md:grid md:grid-cols-[8.5rem_minmax(0,1fr)_6.5rem_6.5rem_5rem_4.5rem_5.5rem] md:items-center md:gap-x-3.5";
const VERY_MUTED = { color: "var(--app-text-very-muted)" };
const PARTY_TEXT: Record<PastRaceParty, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };
const PARTY_FILL: Record<PastRaceParty, string> = { D: "var(--party-dem-fill)", R: "var(--party-rep-fill)", I: "var(--party-ind-fill)" };

const SORT_OPTIONS: { key: SortKey; dir: 1 | -1; label: string }[] = [
  { key: "votes", dir: -1, label: "Most votes" },
  { key: "margin", dir: 1, label: "Closest first" },
  { key: "margin", dir: -1, label: "Widest margin first" },
  { key: "swing", dir: -1, label: "Biggest swing to R" },
  { key: "swing", dir: 1, label: "Biggest swing to D" },
  { key: "name", dir: 1, label: "A–Z" },
];

export default function PastCountyTable({ rows, label, noun, dem, rep, prevYear, prevNote }: {
  rows: PastCountyRow[];
  /** "Counties", "Boroughs", "Parishes". */
  label: string;
  noun: string;
  dem: { name: string; party: PastRaceParty };
  rep: { name: string; party: PastRaceParty };
  /** The seat's previous election, the swing column's baseline; null hides swing and flips. */
  prevYear: number | null;
  /** Marks the swing header (the district was redrawn): "*". */
  prevNote?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "votes", dir: -1 });
  const [showAll, setShowAll] = useState(false);

  const winnerParty = (m: number) => (m < 0 ? dem.party : rep.party);
  const swingOf = (r: PastCountyRow) => (r.prevMargin == null ? null : r.margin - r.prevMargin);
  // The county's leader changed since the seat's previous election (a same-party race never flips).
  const isFlip = (r: PastCountyRow) => r.prevMargin != null && dem.party !== rep.party && Math.sign(r.prevMargin) !== Math.sign(r.margin) && r.prevMargin !== 0;
  const flipCount = rows.filter(isFlip).length;

  const q = query.trim().toLowerCase();
  // Recomputed each render; the React Compiler memoizes it.
  const sorted = (() => {
    const list = rows.filter((r) => (!q || r.name.toLowerCase().includes(q))
      && (show === "all" || (show === "flips" ? isFlip(r) : Math.abs(r.margin) < CLOSE_PTS)));
    const val = (r: PastCountyRow): number | string | null => sort.key === "name" ? r.name : sort.key === "margin" ? Math.abs(r.margin) : sort.key === "swing" ? swingOf(r) : r.total;
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1; // no swing sorts last
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir * c || b.total - a.total;
    });
  })();
  const filtered = !!q || show !== "all";
  const visible = showAll || filtered ? sorted : sorted.slice(0, SHOW_FIRST);
  const hidden = sorted.length - visible.length;

  const header = (key: SortKey, text: string, align: "left" | "right" = "right") => {
    const active = sort.key === key;
    return (
      <button type="button" className={`${align === "right" ? "text-right" : "text-left"} uppercase transition-colors hover:text-[var(--app-text-primary)]`} style={{ color: active ? "var(--app-text-primary)" : undefined }}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "margin" ? 1 : -1 }))}>
        {text}{active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </button>
    );
  };
  const sortIndex = SORT_OPTIONS.findIndex((o) => o.key === sort.key && o.dir === sort.dir);
  const chips: [Show, string][] = [["all", "All"], ...(prevYear != null && dem.party !== rep.party ? [["flips", `Flipped (${flipCount})`] as [Show, string]] : []), ["close", `Under ${CLOSE_PTS} pts`]];
  const marginText = (r: PastCountyRow) => {
    const p = winnerParty(r.margin);
    return { label: Math.abs(r.margin) >= 99.95 ? "Unopposed" : `${p}+${Math.abs(r.margin).toFixed(1)}`, color: PARTY_TEXT[p] };
  };

  return (
    <section className="mt-6" aria-label={label}>
      <div className="flex flex-col gap-2 pb-2.5 md:flex-row md:items-end md:justify-between" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <div className="flex items-baseline gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{label}</h2>
          <span className="text-xs" style={VERY_MUTED}>{filtered ? `${sorted.length} of ${rows.length}` : rows.length}<span className="hidden md:inline"> · click a row to open its page</span></span>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex gap-1" role="group" aria-label="Show">
            {chips.map(([key, text]) => (
              <button key={key} type="button" onClick={() => setShow(key)} aria-pressed={show === key} disabled={key === "flips" && flipCount === 0}
                className="h-8 flex-1 whitespace-nowrap rounded px-2.5 text-xs font-semibold disabled:opacity-40 md:h-7 md:flex-none"
                style={show === key
                  ? { background: "var(--app-text-primary)", color: "var(--app-bg)", border: "1px solid var(--app-text-primary)" }
                  : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}>
                {text}
              </button>
            ))}
          </div>
          {rows.length > SHOW_FIRST && (
            <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={`Find a ${noun}`} aria-label={`Filter ${label.toLowerCase()}`}
              // 16px below md: iOS Safari zooms into any focused field under 16px.
              className="h-9 w-full rounded-md px-2.5 text-base outline-none md:h-7 md:w-44 md:text-xs" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} />
          )}
        </div>
      </div>

      {/* Column headers (md+) / sort menu (phones) */}
      <div className={`hidden pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider ${GRID}`} style={{ color: "var(--app-text-muted)" }}>
        {header("name", noun, "left")}
        <span />
        <span className="truncate text-right" style={{ color: PARTY_TEXT[dem.party] }} title={dem.name}>{lastName(dem.name)}</span>
        <span className="truncate text-right" style={{ color: PARTY_TEXT[rep.party] }} title={rep.name}>{lastName(rep.name)}</span>
        {header("margin", "Margin")}
        {prevYear != null ? header("swing", `vs ${prevYear}${prevNote ?? ""}`) : <span />}
        {header("votes", "Votes")}
      </div>
      <div className="flex items-center justify-between pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider md:hidden" style={{ color: "var(--app-text-muted)" }}>
        <span className="normal-case tracking-normal text-[11px]"><span style={{ color: PARTY_TEXT[dem.party] }}>{dem.name}</span> · <span style={{ color: PARTY_TEXT[rep.party] }}>{rep.name}</span></span>
        {/* A transparent 16px select over a small label: tapping opens the native picker. */}
        <label className="relative flex items-center gap-1" style={{ color: "var(--app-text-primary)" }}>
          <span>{SORT_OPTIONS[sortIndex < 0 ? 0 : sortIndex].label}</span>
          <span aria-hidden>▾</span>
          <select aria-label={`Sort ${label.toLowerCase()}`} value={sortIndex < 0 ? 0 : sortIndex} className="absolute inset-0 cursor-pointer opacity-0" style={{ fontSize: 16 }}
            onChange={(ev) => { const o = SORT_OPTIONS[Number(ev.target.value)]; setSort({ key: o.key, dir: o.dir }); }}>
            {SORT_OPTIONS.filter((o) => prevYear != null || o.key !== "swing").map((o) => <option key={o.label} value={SORT_OPTIONS.indexOf(o)}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className="md:flex md:flex-col md:gap-1.5">
        {visible.map((r) => {
          const swing = swingOf(r);
          const m = marginText(r);
          const bar = { dem: { name: null, party: dem.party, pct: r.demPct, incumbent: false }, rep: { name: null, party: rep.party, pct: r.repPct, incumbent: false }, margin: r.margin };
          const flip = isFlip(r) && (
            <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white" style={{ background: PARTY_FILL[winnerParty(r.margin)] }} title={`Changed sides since ${prevYear}`}>Flip</span>
          );
          return (
            <div key={r.fips}
              className={`group -mx-2 flex cursor-pointer flex-col gap-1 rounded-md border-b px-2 py-2 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)] active:bg-[color-mix(in_srgb,var(--app-text-primary)_9%,transparent)] md:border-b-0 md:py-1 ${GRID}`}
              style={{ borderColor: "var(--app-border)" }}
              title={`${r.name}: ${dem.name} ${r.demVotes.toLocaleString()} (${r.demPct.toFixed(1)}%), ${rep.name} ${r.repVotes.toLocaleString()} (${r.repPct.toFixed(1)}%) · ${r.total.toLocaleString()} ballots`}
              onClick={(ev) => { if ((ev.target as HTMLElement).closest("a")) return; router.push(r.href); }}>
              {/* Name (+ margin on phones) */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Link prefetch={false} href={r.href} className="truncate text-[15px] font-bold group-hover:underline md:text-sm" style={{ color: "var(--app-text-primary)" }}>{r.name}</Link>
                  {r.split && <span className="shrink-0 text-[10px]" style={VERY_MUTED} title="Shared with another district; the row is this district's share">split</span>}
                  <span className="md:hidden">{flip}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums md:hidden" style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: m.color }}>{m.label}</span>
              </div>
              <div className="min-w-0">
                <div className="md:hidden"><SplitBar row={bar} compact /></div>
                <div className="hidden md:block"><SplitBar row={bar} compact /></div>
                <div className="mt-0.5 flex justify-between text-[10.5px] font-medium tabular-nums md:hidden">
                  <span style={{ color: PARTY_TEXT[dem.party] }}>{r.demVotes.toLocaleString()}</span>
                  <span style={{ color: PARTY_TEXT[rep.party] }}>{r.repVotes.toLocaleString()}</span>
                </div>
              </div>
              {/* md+: the two candidates' votes side by side after the bar. Phones: under it. */}
              <span className="hidden text-right text-[13px] font-semibold tabular-nums md:block" style={{ color: PARTY_TEXT[dem.party] }}>{r.demVotes.toLocaleString()}</span>
              <span className="hidden text-right text-[13px] font-semibold tabular-nums md:block" style={{ color: PARTY_TEXT[rep.party] }}>{r.repVotes.toLocaleString()}</span>
              {/* Margin + flip (md+) */}
              <div className="hidden flex-col items-end gap-0.5 md:flex">
                <span className="font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: m.color }}>{m.label}</span>
                {flip}
              </div>
              <span className="hidden text-right text-xs font-semibold tabular-nums md:block" style={{ color: leanColor(swing) }}>{swing == null ? "—" : fmtLean(swing)}</span>
              <span className="hidden text-right text-xs tabular-nums md:block" style={{ color: "var(--app-text-muted)" }}>{r.total.toLocaleString()}</span>
              {/* Swing + votes (phones) */}
              <div className="flex justify-between text-[11px] md:hidden" style={VERY_MUTED}>
                <span>{prevYear == null ? "" : swing == null ? `No ${prevYear} result` : <>Swing <span className="font-semibold tabular-nums" style={{ color: leanColor(swing) }}>{fmtLean(swing)}</span> vs {prevYear}</>}</span>
                <span className="tabular-nums">{r.total.toLocaleString()} votes</span>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && <div className="py-6 text-center text-xs" style={VERY_MUTED}>{q ? `No ${label.toLowerCase()} match “${query.trim()}”.` : `No ${label.toLowerCase()} in this view.`}</div>}
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Show all {sorted.length} {label.toLowerCase()} ↓</button>
      )}
      {showAll && !filtered && sorted.length > SHOW_FIRST && (
        <button type="button" onClick={() => setShowAll(false)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Show fewer ↑</button>
      )}
    </section>
  );
}
