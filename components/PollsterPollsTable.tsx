"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PollsterPollRow } from "@/lib/pollsterRecord";
import { fmtLean, fmtVsField, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";

type SortKey = "date" | "race" | "sample" | "poll" | "result" | "error" | "excess";
const PAGE = 100;

// Fixed widths (table-layout: fixed), `width` in the past table and `nowWidth` in this cycle's (wider: more padding),
// so showing or hiding rows never moves a column; Race takes what is left and wraps.
const COLUMNS: { key: SortKey | null; label: string; right?: true; width?: string; nowWidth?: string; title: string }[] = [
  { key: "race", label: "Race", title: "Race polled" },
  { key: "date", label: "Date", width: "7.5rem", nowWidth: "6.5rem", title: "Field-period midpoint for past polls; end date for this cycle's" },
  { key: "sample", label: "Sample", right: true, width: "5.5rem", nowWidth: "7rem", title: "Respondents (and population, where published)" },
  { key: null, label: "Dem", width: "3.5rem", nowWidth: "4.5rem", title: "The Democrat's share in the poll (the second candidate in a same-party contest)" },
  { key: null, label: "Rep", width: "3.5rem", nowWidth: "4.5rem", title: "The Republican's share in the poll (the first candidate in a same-party contest)" },
  { key: "poll", label: "Poll", width: "5rem", nowWidth: "6.5rem", title: "The poll's margin" },
  { key: "result", label: "Result", right: true, width: "5rem", title: "The actual margin" },
  { key: "error", label: "Error", width: "5.5rem", title: "Poll minus result: D+3 means the poll overstated the Democrat by 3 points" },
  { key: "excess", label: "Vs. field", right: true, width: "5.5rem", title: "|Error| minus what a typical poll of the same race missed by; negative beat the field. Graded polls only (final 21 days)." },
  { key: null, label: "Method", width: "9.5rem", title: "Survey mode" },
  { key: null, label: "", width: "6rem", nowWidth: "7rem", title: "The poll's release, where the source recorded one: FiveThirtyEight's archive for 2018–24, the Wikipedia citation this cycle. Opens in a new tab." },
];

const GB = "Generic ballot";

// This cycle's polls have no result yet, so their table leaves these out.
const PAST_ONLY = new Set<SortKey | null>(["result", "error", "excess"]);

/** A margin as a leader label: "R+3.0" / "D+1.5"; same-party contests just show the gap. */
const fmtMargin = (v: number | null, oriented: boolean) => (v == null ? "—" : oriented ? fmtLean(v) : `+${Math.abs(v).toFixed(1)}`);
/** "nytimes.com" from a source link; the full address is on hover. */
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Link"; } };
// The race name carries the election year, so the date column shows month and day only (the full date on hover).
const fmtDate = (iso: string, year = false) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

function sortValue(p: PollsterPollRow, key: SortKey): number | string {
  switch (key) {
    case "date": return p.date;
    case "race": return `${p.office} ${p.race}`;
    case "sample": return p.sample ?? -1;
    case "poll": return p.poll;
    case "result": return p.result ?? Number.NEGATIVE_INFINITY;
    case "error": return p.error == null ? -1 : Math.abs(p.error);
    case "excess": return p.excess ?? Number.NEGATIVE_INFINITY;
  }
}

const fmtShare = (v: number | null) => (v == null ? "" : String(Math.round(v * 10) / 10));

/** A small uniform "Source ↗" button; the site's name and the full address are on hover. */
function SourceLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`${hostOf(url)} — ${url}`}
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none hover:underline"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
      Source ↗
    </a>
  );
}

const raceLabel = (p: PollsterPollRow) => `${p.year} ${p.office === "Generic ballot" ? "Generic Ballot" : p.office === "House" ? p.race : `${p.race} ${p.office}`}`;

/** Phones: each poll a compact row: race over date · sample · source on the left, then aligned number columns
 *  (Poll, plus Result and Vs. field for past polls) under one header row. */
function MobilePollList({ rows, past }: { rows: PollsterPollRow[]; past: boolean }) {
  const faint = { color: "var(--app-text-very-muted)" };
  const grid = `grid items-center gap-x-2 ${past ? "grid-cols-[minmax(0,1fr)_4rem_3.25rem_3.25rem]" : "grid-cols-[minmax(0,1fr)_3.5rem]"}`;
  return (
    <div>
      <div className={`${grid} pb-1 text-[10px] font-bold uppercase tracking-wider`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
        <span>Race</span>
        <span>Poll</span>
        {past && <><span>Result</span><span className="pl-1">Vs. fld</span></>}
      </div>
      {rows.map((p, i) => (
        <div key={i} className={`${grid} py-2 tabular-nums`} style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="min-w-0">
            <div className="text-sm leading-snug">
              {p.href ? <Link prefetch={false} href={p.href} className="font-semibold hover:underline">{raceLabel(p)}</Link> : <span className="font-semibold">{raceLabel(p)}</span>}
              {p.stage && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{p.stage}</span>}
              {p.partisan && <span className="ml-1 text-[10px] font-bold" style={{ color: leanColor(p.partisan === "R" ? 1 : -1) }}>({p.partisan})</span>}
            </div>
            <div className="mt-0.5 text-[11px]" style={faint}>
              <span title={fmtDate(p.date, true)}>{fmtDate(p.date)}</span>
              {p.daysOut != null && <> ({p.daysOut}d out)</>}
              {p.sample != null && <> · {p.sample.toLocaleString()}{p.population ? ` ${p.population}` : ""}</>}
              {p.url && <> · <a href={p.url} target="_blank" rel="noopener noreferrer" title={`${hostOf(p.url)} — ${p.url}`} className="underline underline-offset-2">source</a></>}
            </div>
          </div>
          <div className="text-sm font-semibold" style={{ color: p.oriented ? leanColor(p.poll) : undefined }}>
            {fmtMargin(p.poll, p.oriented)}
            {p.calledWinner === false && <span className="ml-0.5 text-[10px]" style={{ color: "var(--app-text-muted)" }} title="Poll had the wrong candidate ahead">✕</span>}
          </div>
          {past && <>
            <div className="text-xs" style={{ color: p.oriented && p.result != null ? leanColor(p.result) : "var(--app-text-very-muted)" }}>
              {p.result == null ? "—" : fmtMargin(p.result, p.oriented)}
            </div>
            <div className="text-xs">
              {p.excess != null && <span className="rounded px-1 py-0.5" style={{ background: vsFieldTint(p.excess, 4) }}>{fmtVsField(p.excess)}</span>}
            </div>
          </>}
        </div>
      ))}
      {rows.length === 0 && <div className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No polls match.</div>}
    </div>
  );
}

/** One table of a pollster's polls: `past` (graded against results, with cycle and graded-only filters) or this cycle's. */
export default function PollsterPollsTable({ polls, past = true }: { polls: PollsterPollRow[]; past?: boolean }) {
  const cols = past ? COLUMNS : COLUMNS.filter((c) => !PAST_ONLY.has(c.key) && c.label !== "Method"); // this cycle's polls carry no method
  const cycles = useMemo(() => [...new Set(polls.map((p) => p.cycle))].sort((a, b) => b - a), [polls]);
  // Generic-ballot polls are hidden until asked for, unless they are all this pollster has.
  const genericCount = useMemo(() => polls.filter((p) => p.office === GB).length, [polls]);
  const [showGeneric, setShowGeneric] = useState(genericCount === polls.length);
  const offices = useMemo(() => [...new Set(polls.map((p) => p.office))].filter((o) => showGeneric || o !== GB), [polls, showGeneric]);
  const [cycle, setCycle] = useState<number | "all">("all");
  const [office, setOffice] = useState<string>("all");
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => polls
    .filter((p) => (showGeneric || p.office !== GB) && (cycle === "all" || p.cycle === cycle) && (office === "all" || p.office === office) && (!gradedOnly || p.excess != null))
    .sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : b.date.localeCompare(a.date)) * sort.dir;
    }), [polls, showGeneric, cycle, office, gradedOnly, sort]);

  const select = "rounded-md px-2 py-1.5 text-xs font-semibold outline-none";
  const selectStyle = { background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" };
  // this cycle's table: Race takes the spare width, so the shorter columns sit together on the right
  const cell = `whitespace-nowrap py-1.5 tabular-nums ${past ? "px-2" : "px-4"}`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-4">
        {past && cycles.length > 1 && (
          <select value={cycle} onChange={(e) => { setCycle(e.target.value === "all" ? "all" : Number(e.target.value)); setLimit(PAGE); }} aria-label="Cycle" className={select} style={selectStyle}>
            <option value="all">All cycles</option>
            {cycles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {offices.length > 1 && (
          <select value={office} onChange={(e) => { setOffice(e.target.value); setLimit(PAGE); }} aria-label="Office" className={select} style={selectStyle}>
            <option value="all">All races</option>
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {past && (
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <input type="checkbox" checked={gradedOnly} onChange={(e) => { setGradedOnly(e.target.checked); setLimit(PAGE); }} />
            Graded polls only
          </label>
        )}
        {genericCount > 0 && genericCount < polls.length && (
          <button type="button" aria-pressed={showGeneric} onClick={() => { setShowGeneric((v) => !v); if (office === GB) setOffice("all"); setLimit(PAGE); }}
            className="rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
            {showGeneric ? "Hide generic-ballot polls" : `Show ${genericCount} generic-ballot ${genericCount === 1 ? "poll" : "polls"}`}
          </button>
        )}
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{rows.length.toLocaleString()} polls</span>
      </div>

      <div className="md:hidden">
        <div className="flex items-center gap-2 pb-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Sort
          <select value={sort.key} onChange={(e) => { const key = e.target.value as SortKey; setSort({ key, dir: key === "race" ? 1 : -1 }); }} aria-label="Sort polls" className={select} style={selectStyle}>
            {cols.filter((c) => c.key).map((c) => <option key={c.key} value={c.key!}>{c.label}</option>)}
          </select>
          <button type="button" onClick={() => setSort((s) => ({ ...s, dir: s.dir === 1 ? -1 : 1 }))} aria-label="Reverse the sort" className="rounded-md px-2 py-1.5 text-xs font-semibold"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>{sort.dir === 1 ? "↑" : "↓"}</button>
        </div>
        <MobilePollList rows={rows.slice(0, limit)} past={past} />
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className={`w-full table-fixed border-collapse text-sm ${past ? "min-w-[64rem]" : ""}`}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label} scope="col" title={c.title} aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap py-2 text-[10px] font-bold uppercase tracking-wider ${c.right ? "text-right" : "text-left"} ${past || c.key === "race" ? "px-2" : "px-4"}`}
                  style={{ width: (past ? c.width : c.nowWidth) ?? undefined, color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                  {c.key ? (
                    <button type="button" className="uppercase tracking-wider hover:underline"
                      onClick={() => setSort((s) => ({ key: c.key!, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "race" ? 1 : -1 }))}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((p, i) => {
              const label = raceLabel(p);
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="px-2 py-1.5">
                    {p.href ? <Link href={p.href} className="hover:underline">{label}</Link> : label}
                    {p.stage && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{p.stage}</span>}
                    {p.partisan && <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(p.partisan === "R" ? 1 : -1) }} title={`Sponsored by a ${p.partisan === "R" ? "Republican" : "Democratic"} campaign or group`}>({p.partisan})</span>}
                  </td>
                  <td className={cell}>
                    <span title={fmtDate(p.date, true)}>{fmtDate(p.date)}</span>
                    {p.daysOut != null && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{p.daysOut}d out</span>}
                  </td>
                  <td className={`${cell} text-right`}>
                    {p.sample?.toLocaleString() ?? "—"}
                    {p.population && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{p.population}</span>}
                  </td>
                  <td className={cell} style={{ color: p.oriented ? "var(--party-dem)" : "var(--app-text-muted)" }}>{fmtShare(p.dem)}</td>
                  <td className={cell} style={{ color: p.oriented ? "var(--party-rep)" : "var(--app-text-muted)" }}>{fmtShare(p.rep)}</td>
                  <td className={`${cell} font-semibold`} style={{ color: p.oriented ? leanColor(p.poll) : undefined }}>{fmtMargin(p.poll, p.oriented)}</td>
                  {past && <>
                  <td className={`${cell} text-right`} style={{ color: p.oriented ? leanColor(p.result) : undefined }}>{p.result == null ? <span style={{ color: "var(--app-text-very-muted)" }}>Pending</span> : fmtMargin(p.result, p.oriented)}</td>
                  <td className={cell} style={{ color: p.oriented ? leanColor(p.error) : undefined }}>
                    {p.error == null ? "" : p.oriented ? fmtLean(p.error) : Math.abs(p.error).toFixed(1)}
                    {p.calledWinner === false && <span className="ml-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }} title="Poll had the wrong candidate ahead">✕</span>}
                  </td>
                  <td className={`${cell} text-right`}>
                    {p.excess == null ? null : <span className="rounded px-1.5 py-0.5" style={{ background: vsFieldTint(p.excess, 4) }}>{fmtVsField(p.excess)}</span>}
                  </td>
                  </>}
                  {past && <td className={`${cell} truncate text-xs`} title={p.methodology ?? undefined} style={{ color: "var(--app-text-muted)" }}>{p.methodology ?? ""}</td>}
                  <td className={`${cell} text-right`}>{p.url && <SourceLink url={p.url} />}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No polls match.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit(rows.length)} className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
          Show all {rows.length.toLocaleString()} polls
        </button>
      )}
    </div>
  );
}
