"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStaticJson } from "@/lib/useStaticJson";
import { startPendingNav } from "@/lib/navPending";
import { fmtMargin, fmtLean, leanColor } from "@/lib/colorScale";
import { marginColor } from "@/components/tpl/format";
import { lastName } from "@/lib/personName";
import { VERY_MUTED } from "@/components/tpl/ui";
import type { MapOffice } from "@/lib/mapSliceTypes";
import { pastRaceTableUrl, type PastRaceCandidate, type PastRaceParty, type PastRaceRow, type PastRaceTable as TableData } from "@/lib/pastRaceTableTypes";

// The list of every race the /historical map's office + year selection has a page for, under
// the map. It reads the selection only (never the county/district/state view): one static JSON
// table per office and year (lib/pastRaceTableTypes.ts), fetched on demand and cached per URL.
//
// Each race is a head-to-head bar sized by two-party share, names and percentages inside: the
// winner's side solid party colour, the loser's a tint. From md up a race is one grid row with
// margin, swing and votes beside the bar; below md it stacks (district + margin, the bar at full
// width, then swing and votes in small type) and the column headers become a sort menu.

const OFFICE_LABEL: Record<MapOffice, string> = { president: "Presidential", governor: "Governor", senate: "Senate", house: "House" };
const OFFICE_NOUN: Record<MapOffice, string> = { president: "states", governor: "races", senate: "races", house: "districts" };
/** Rows shown before "Show all": every statewide table fits, the House's 435 do not. */
const SHOW_FIRST = 60;
/** Below this share of the two-party vote a segment drops the name and keeps the percentage. */
const NAME_MIN_SHARE = 34;
const CLOSE_PTS = 5;

type SortKey = "race" | "margin" | "swing" | "votes";
type Show = "all" | "flips" | "close";

const SORT_OPTIONS: { key: SortKey; dir: 1 | -1; label: string }[] = [
  { key: "margin", dir: 1, label: "Closest first" },
  { key: "margin", dir: -1, label: "Widest margin first" },
  { key: "swing", dir: -1, label: "Biggest swing to R" },
  { key: "swing", dir: 1, label: "Biggest swing to D" },
  { key: "votes", dir: -1, label: "Most votes" },
  { key: "race", dir: 1, label: "A–Z" },
];

const PARTY_TEXT: Record<PastRaceParty, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };
/** Solid fills stay the deep party colours in both themes, so white text reads on them. */
const PARTY_FILL: Record<PastRaceParty, string> = { D: "var(--party-dem-fill)", R: "var(--party-rep-fill)", I: "var(--party-ind-fill)" };
const PARTY_TINT: Record<PastRaceParty, string> = { D: "var(--party-dem-subtle)", R: "var(--party-rep-subtle)", I: "var(--party-ind-subtle)" };
const GRID = "md:grid md:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem_5rem_5.5rem] md:items-center md:gap-x-4";

function winnerOf(row: PastRaceRow) {
  return row.margin < 0 ? row.dem : row.rep;
}

/** Change in margin since the seat's previous election; none across a House redraw, where the
 * previous result belongs to a different map. */
function swingOf(row: PastRaceRow): number | null {
  return row.prevMargin == null || row.redrawn ? null : row.margin - row.prevMargin;
}

/** The seat changed party since its previous election (never across a House redraw). Falls back
 * to the previous margin's sign when a table cached before prevWinnerParty existed lacks it. */
function isFlip(row: PastRaceRow): boolean {
  if (row.redrawn || row.uncontested || row.prevMargin == null) return false;
  const prev = row.prevWinnerParty ?? (row.prevMargin < 0 ? "D" : "R");
  return prev !== winnerOf(row).party;
}

function matches(row: PastRaceRow, q: string): boolean {
  if (!q) return true;
  const hay = [row.label, row.stateName, row.stateAbbr, row.dem.name ?? "", row.rep.name ?? "", row.special ? "special" : ""].join(" ").toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** "R+1.7" / "D+2.8" in the winner's colour; a near-tie still names its winner, never "EVEN". */
function marginText(row: PastRaceRow): { label: string; color: string } {
  const winner = winnerOf(row);
  const color = PARTY_TEXT[winner.party];
  if (row.uncontested) return { label: "Unopposed", color };
  return { label: `${winner.party}+${Math.abs(row.margin).toFixed(1)}`, color };
}

function FlipTag({ row }: { row: PastRaceRow }) {
  if (!isFlip(row)) return null;
  const p = winnerOf(row).party;
  return (
    <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white" style={{ background: PARTY_FILL[p] }} title={`${p === "D" ? "Democratic" : p === "R" ? "Republican" : "Independent"} pickup since ${row.prevYear}`}>
      Flip
    </span>
  );
}

/** One side of the bar: solid when this candidate won, tinted when they lost. */
function Segment({ c, won, share, align, compact }: { c: PastRaceCandidate; won: boolean; share: number; align: "left" | "right"; compact: boolean }) {
  const showName = c.name && share >= NAME_MIN_SHARE;
  const name = showName ? (
    <span className="min-w-0 truncate" title={c.name ?? undefined}>
      {lastName(c.name!)}{c.incumbent && <span aria-label="incumbent" title="Incumbent">{compact ? " •" : " · inc."}</span>}
    </span>
  ) : null;
  const pct = <span className="shrink-0 tabular-nums">{c.pct > 0 ? `${c.pct.toFixed(1)}%` : ""}</span>;
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-1.5 ${compact ? "px-[7px] text-[11.5px]" : "px-3 text-[13px]"} ${won ? "font-bold" : "font-medium"}`}
      style={{
        ...(align === "left" ? { width: `${share}%` } : { flex: 1 }),
        background: won ? PARTY_FILL[c.party] : PARTY_TINT[c.party],
        color: won ? "#fff" : PARTY_TEXT[c.party],
      }}
    >
      {align === "left" ? <>{name}{pct}</> : <>{pct}{name}</>}
    </div>
  );
}

function SplitBar({ row, compact }: { row: PastRaceRow; compact: boolean }) {
  const two = row.dem.pct + row.rep.pct;
  const dShare = two > 0 ? (row.dem.pct / two) * 100 : 50;
  const demWon = row.margin < 0;
  return (
    <div className={`flex overflow-hidden transition-[filter] duration-150 group-hover:brightness-[0.93] group-active:brightness-[0.86] ${compact ? "h-6 rounded" : "h-10 rounded-md"}`}>
      <Segment c={row.dem} won={demWon} share={dShare} align="left" compact={compact} />
      <Segment c={row.rep} won={!demWon} share={100 - dShare} align="right" compact={compact} />
    </div>
  );
}

export default function PastRaceTable({ office, year }: { office: MapOffice; year: number }) {
  const router = useRouter();
  const { data, loading } = useStaticJson<TableData>(pastRaceTableUrl(office, year));
  const rows = data?.rows ?? null;
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "margin", dir: 1 });

  const q = query.trim().toLowerCase();
  const flipCount = useMemo(() => (rows ? rows.filter(isFlip).length : 0), [rows]);
  const sorted = useMemo(() => {
    if (!rows) return [];
    const list = rows.filter((r) => matches(r, q)
      && (show === "all" || (show === "flips" ? isFlip(r) : !r.uncontested && Math.abs(r.margin) < CLOSE_PTS)));
    const dir = sort.dir;
    const nullsLast = (av: number | null, bv: number | null) => {
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    };
    const cmp = (a: PastRaceRow, b: PastRaceRow): number => {
      switch (sort.key) {
        case "race": {
          const byState = a.stateName.localeCompare(b.stateName);
          return (byState !== 0 ? byState : (a.district ?? 0) - (b.district ?? 0)) * dir;
        }
        // "Margin" orders by closeness: closest first, flipped to the biggest blowouts first.
        case "margin": return (Math.abs(a.margin) - Math.abs(b.margin)) * dir;
        case "swing": return nullsLast(swingOf(a), swingOf(b));
        case "votes": return nullsLast(a.totalVotes, b.totalVotes);
      }
    };
    return list.sort((a, b) => cmp(a, b) || a.label.localeCompare(b.label));
  }, [rows, q, show, sort]);

  const filtered = !!q || show !== "all";
  const visible = showAll || filtered ? sorted : sorted.slice(0, SHOW_FIRST);
  const hidden = sorted.length - visible.length;

  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => {
    const active = sort.key === key;
    return (
      <span className={align === "right" ? "text-right" : ""}>
        <button
          type="button"
          className="uppercase tracking-wider hover:underline"
          style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "race" || key === "margin" ? 1 : -1 }))}
        >
          {label}{active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      </span>
    );
  };

  const go = (href: string) => { startPendingNav(href); router.push(href); };
  const title = `${year} ${OFFICE_LABEL[office]} races`;
  const count = rows ? `${rows.length} ${OFFICE_NOUN[office]}` : loading ? "Loading…" : "Unavailable";
  const sortIndex = SORT_OPTIONS.findIndex((o) => o.key === sort.key && o.dir === sort.dir);
  const chips: [Show, string][] = [["all", "All"], ["flips", `Flips${rows ? ` (${flipCount})` : ""}`], ["close", `Under ${CLOSE_PTS} pts`]];

  return (
    <section id="races" className="mt-10" aria-label={title}>
      <div className="flex flex-col gap-2 pb-2.5 md:flex-row md:items-end md:justify-between" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <div className="flex items-baseline justify-between gap-3 md:justify-start">
          <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{title}</h2>
          <span className="text-xs" style={VERY_MUTED}>{count}<span className="hidden md:inline"> · click a row to open its page</span></span>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex gap-1" role="group" aria-label="Show">
            {chips.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setShow(key)}
                aria-pressed={show === key}
                disabled={key === "flips" && rows != null && flipCount === 0}
                className="h-8 flex-1 whitespace-nowrap rounded px-2.5 text-xs font-semibold disabled:opacity-40 md:h-7 md:flex-none"
                style={show === key
                  ? { background: "var(--app-text-primary)", color: "var(--app-bg)", border: "1px solid var(--app-text-primary)" }
                  : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={office === "house" ? "District, state or candidate" : "State or candidate"}
            aria-label="Filter races"
            // 16px below md: iOS Safari zooms into any focused field under 16px.
            className="h-9 w-full rounded-md px-2.5 text-base outline-none md:h-7 md:w-56 md:text-xs"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}
          />
        </div>
      </div>

      {rows && rows.length === 0 ? (
        <div className="py-6 text-xs" style={VERY_MUTED}>No race pages for this selection.</div>
      ) : (
        <>
          {/* Column headers (md+) / sort menu (phones) */}
          <div className={`hidden pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider ${GRID}`} style={{ color: "var(--app-text-muted)" }}>
            {header("race", office === "house" ? "District" : "State", "left")}
            <span className="flex justify-between"><span style={{ color: "var(--party-dem)" }}>Democrat</span><span style={{ color: "var(--party-rep)" }}>Republican</span></span>
            {header("margin", "Margin")}
            {header("swing", "Swing")}
            {header("votes", "Votes")}
          </div>
          <div className="flex items-center justify-between pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider md:hidden" style={{ color: "var(--app-text-muted)" }}>
            <span><span style={{ color: "var(--party-dem)" }}>Dem</span> · <span style={{ color: "var(--party-rep)" }}>Rep</span></span>
            {/* A transparent 16px select over a small label: tapping opens the native picker, and
                16px keeps iOS Safari from zooming in on focus. */}
            <label className="relative flex items-center gap-1" style={{ color: "var(--app-text-primary)" }}>
              <span>{SORT_OPTIONS[sortIndex < 0 ? 0 : sortIndex].label}</span>
              <span aria-hidden>▾</span>
              <select
                aria-label="Sort races"
                value={sortIndex < 0 ? 0 : sortIndex}
                onChange={(e) => { const o = SORT_OPTIONS[Number(e.target.value)]; setSort({ key: o.key, dir: o.dir }); }}
                className="absolute inset-0 cursor-pointer opacity-0"
                style={{ fontSize: 16 }}
              >
                {SORT_OPTIONS.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="md:flex md:flex-col md:gap-2">
            {visible.map((row) => {
              const swing = swingOf(row);
              const margin = marginText(row);
              return (
                <div
                  key={row.href}
                  className={`group cursor-pointer flex flex-col gap-1 border-b -mx-2 px-2 py-2 rounded-md transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)] active:bg-[color-mix(in_srgb,var(--app-text-primary)_9%,transparent)] md:border-b-0 md:py-1 ${GRID}`}
                  style={{ borderColor: "var(--app-border)" }}
                  onClick={(e) => { if ((e.target as HTMLElement).closest("a")) return; go(row.href); }}
                >
                  {/* District (+ margin on phones) */}
                  <div className="flex items-baseline justify-between gap-2 md:flex-col md:items-start md:gap-0.5">
                    <div className="flex min-w-0 items-baseline gap-1.5 md:flex-col md:items-start md:gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <Link prefetch={false} href={row.href} className="text-[15px] font-bold group-hover:underline md:text-sm" style={{ color: "var(--app-text-primary)" }}>{row.label}</Link>
                        <span className="md:hidden"><FlipTag row={row} /></span>
                      </span>
                      {(office === "house" || row.special) && (
                        <span className="truncate text-[11px]" style={VERY_MUTED}>
                          {office === "house" && row.stateName}
                          {row.special && <span className={`${office === "house" ? "ml-1 " : ""}font-bold uppercase tracking-wider`} style={{ color: "var(--app-text-muted)" }}>Special</span>}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-bold tabular-nums md:hidden" style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: margin.color }}>{margin.label}</span>
                  </div>

                  <div className="md:hidden"><SplitBar row={row} compact /></div>
                  <div className="hidden md:block"><SplitBar row={row} compact={false} /></div>

                  {/* Margin + flip (md+) */}
                  <div className="hidden flex-col items-end gap-0.5 md:flex">
                    <span className="font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: margin.color }}>{margin.label}</span>
                    <FlipTag row={row} />
                  </div>
                  <span className="hidden text-right text-xs font-semibold tabular-nums md:block" style={{ color: leanColor(swing) }} title={row.redrawn ? "Redrawn for this election" : row.prevYear != null ? `vs. ${row.prevYear}` : undefined}>
                    {swing == null ? "—" : fmtLean(swing)}
                  </span>
                  <span className="hidden text-right text-xs tabular-nums md:block" style={{ color: "var(--app-text-muted)" }}>{row.totalVotes == null ? "—" : row.totalVotes.toLocaleString()}</span>

                  {/* Swing + votes (phones) */}
                  <div className="flex justify-between text-[11px] md:hidden" style={VERY_MUTED}>
                    <span>
                      {swing == null
                        ? (row.redrawn ? "Redrawn district" : "No prior race")
                        : <>Swing <span className="font-semibold tabular-nums" style={{ color: leanColor(swing) }}>{fmtLean(swing)}</span> vs {row.prevYear}</>}
                    </span>
                    <span className="tabular-nums">{row.totalVotes == null ? "—" : `${row.totalVotes.toLocaleString()} votes`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {rows && sorted.length === 0 && (
            <div className="py-6 text-center text-xs" style={VERY_MUTED}>{q ? `No races match “${query.trim()}”.` : "No races in this view."}</div>
          )}
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
              Show all {sorted.length} {OFFICE_NOUN[office]} ↓
            </button>
          )}
          {showAll && !filtered && sorted.length > SHOW_FIRST && (
            <button type="button" onClick={() => setShowAll(false)} className="mt-3 text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
              Show fewer ↑
            </button>
          )}
        </>
      )}
    </section>
  );
}
