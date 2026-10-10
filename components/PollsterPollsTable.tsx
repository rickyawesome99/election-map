"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PollsterPollRow } from "@/lib/pollsterRecord";
import { fmtLean, fmtVsField, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";

type SortKey = "date" | "race" | "sample" | "poll" | "result" | "error" | "excess";
const PAGE = 100;

const COLUMNS: { key: SortKey | null; label: string; right?: true; title: string }[] = [
  { key: null, label: "Cycle", title: "Election cycle (odd-year races count with the following even year)" },
  { key: "race", label: "Race", title: "Race polled" },
  { key: "date", label: "Date", title: "Field-period midpoint for past polls; end date for this cycle's" },
  { key: "sample", label: "Sample", right: true, title: "Respondents (and population, where published)" },
  { key: "poll", label: "Poll", right: true, title: "The poll's margin" },
  { key: "result", label: "Result", right: true, title: "The actual margin" },
  { key: "error", label: "Error", right: true, title: "Poll minus result: D+3 means the poll overstated the Democrat by 3 points" },
  { key: "excess", label: "Vs. field", right: true, title: "|Error| minus what a typical poll of the same race missed by; negative beat the field. Graded polls only (final 21 days)." },
  { key: null, label: "Method", title: "Survey mode" },
];

/** A margin as a leader label: "R+3.0" / "D+1.5"; same-party contests just show the gap. */
const fmtMargin = (v: number | null, oriented: boolean) => (v == null ? "—" : oriented ? fmtLean(v) : `+${Math.abs(v).toFixed(1)}`);
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

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

export default function PollsterPollsTable({ polls }: { polls: PollsterPollRow[] }) {
  const cycles = useMemo(() => [...new Set(polls.map((p) => p.cycle))].sort((a, b) => b - a), [polls]);
  const offices = useMemo(() => [...new Set(polls.map((p) => p.office))], [polls]);
  const [cycle, setCycle] = useState<number | "all">("all");
  const [office, setOffice] = useState<string>("all");
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => polls
    .filter((p) => (cycle === "all" || p.cycle === cycle) && (office === "all" || p.office === office) && (!gradedOnly || p.excess != null))
    .sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : b.date.localeCompare(a.date)) * sort.dir;
    }), [polls, cycle, office, gradedOnly, sort]);

  const select = "rounded-md px-2 py-1.5 text-xs font-semibold outline-none";
  const selectStyle = { background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" };
  const cell = "whitespace-nowrap px-2 py-1.5 tabular-nums";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <select value={cycle} onChange={(e) => { setCycle(e.target.value === "all" ? "all" : Number(e.target.value)); setLimit(PAGE); }} aria-label="Cycle" className={select} style={selectStyle}>
          <option value="all">All cycles</option>
          {cycles.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={office} onChange={(e) => { setOffice(e.target.value); setLimit(PAGE); }} aria-label="Office" className={select} style={selectStyle}>
          <option value="all">All races</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
          <input type="checkbox" checked={gradedOnly} onChange={(e) => { setGradedOnly(e.target.checked); setLimit(PAGE); }} />
          Graded polls only
        </label>
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{rows.length.toLocaleString()} polls</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" title={c.title} aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${c.right ? "text-right" : "text-left"}`}
                  style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
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
              const label = p.office === "Generic ballot" ? "Generic ballot" : p.office === "House" ? p.race : `${p.race} ${p.office}`;
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className={cell} style={{ color: "var(--app-text-muted)" }}>{p.cycle}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {p.href ? <Link href={p.href} className="font-semibold hover:underline">{label}</Link> : <span className="font-semibold">{label}</span>}
                    {p.stage && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{p.stage}</span>}
                    {p.partisan && <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(p.partisan === "R" ? 1 : -1) }} title={`Sponsored by a ${p.partisan === "R" ? "Republican" : "Democratic"} campaign or group`}>({p.partisan})</span>}
                  </td>
                  <td className={cell}>
                    {fmtDate(p.date)}
                    {p.daysOut != null && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{p.daysOut}d out</span>}
                  </td>
                  <td className={`${cell} text-right`}>
                    {p.sample?.toLocaleString() ?? "—"}
                    {p.population && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{p.population}</span>}
                  </td>
                  <td className={`${cell} text-right font-semibold`} style={{ color: p.oriented ? leanColor(p.poll) : undefined }}>{fmtMargin(p.poll, p.oriented)}</td>
                  <td className={`${cell} text-right`} style={{ color: p.oriented ? leanColor(p.result) : undefined }}>{p.result == null ? <span style={{ color: "var(--app-text-very-muted)" }}>Pending</span> : fmtMargin(p.result, p.oriented)}</td>
                  <td className={`${cell} text-right`} style={{ color: p.oriented ? leanColor(p.error) : undefined }}>
                    {p.error == null ? "—" : p.oriented ? fmtLean(p.error) : Math.abs(p.error).toFixed(1)}
                    {p.calledWinner === false && <span className="ml-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }} title="Poll had the wrong candidate ahead">✕</span>}
                  </td>
                  <td className={`${cell} text-right`}>
                    {p.excess == null ? <span style={{ color: "var(--app-text-very-muted)" }}>—</span> : <span className="rounded px-1.5 py-0.5" style={{ background: vsFieldTint(p.excess, 4) }}>{fmtVsField(p.excess)}</span>}
                  </td>
                  <td className={`${cell} text-xs`} style={{ color: "var(--app-text-muted)" }}>{p.methodology ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No polls match.</td></tr>}
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
