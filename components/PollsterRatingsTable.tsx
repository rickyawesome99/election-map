"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import { WAR_BAD, WAR_GOOD } from "@/components/tpl/format";
import type { PollsterRating, WinLoss } from "@/data/pollsterRatings";
import { fmtLean, fmtVsField, gradeRank, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";

type SortKey = "grade" | "name" | "n" | "avgError" | "avgMiss" | "record" | "score" | "bias" | "house" | "lastYear" | "polls2026";
type Scope = "rated" | "active" | "all";

// Fixed widths on the header cells (table-layout: fixed; not a colgroup, whose hidden <col>s keep their width) so no column moves when the scope, search or sort changes
// the rows; Pollster (no width) takes what is left.
// On phones only the `mobile` columns show (narrower); the rest are on the pollster's own page.
const COLUMNS: { key: SortKey; label: string; right?: true; center?: true; width?: string; mobile?: true; title: string }[] = [
  { key: "grade", label: "Grade", width: "w-14 md:w-16", mobile: true, title: "Letter band of the score; needs five graded polls" },
  { key: "name", label: "Pollster", mobile: true, title: "Pollster" },
  { key: "n", label: "Polls", width: "w-16", right: true, title: "Graded polls: general-election polls in the final 21 days, 2008–2024" },
  { key: "avgError", label: "Avg. error", width: "w-[5.25rem]", right: true, title: "Recency-weighted average miss on the margin, in points" },
  { key: "avgMiss", label: "Avg. miss", width: "w-[5.25rem]", right: true, title: "Plain average of poll margin minus result over its graded polls, every cycle counted equally: D+2 means its polls overstated Democrats by 2" },
  { key: "record", label: "Record", width: "w-[5.5rem]", center: true, title: "Graded polls that had the eventual winner ahead – that had the loser ahead (– ties). Sorts by share right." },
  { key: "score", label: "Vs. field", width: "w-[4.5rem] md:w-[5.5rem]", right: true, mobile: true, title: "Score: average miss minus what a typical poll of the same races missed by, shrunk toward 0 for small records. Negative is better." },
  { key: "bias", label: "Bias", width: "w-16 md:w-[4.75rem]", right: true, mobile: true, title: "Average signed miss against the result (shrunk): D+2 means the pollster overstated Democrats by 2" },
  { key: "house", label: "House effect", width: "w-[6.5rem]", right: true, title: "Average lean against the OTHER pollsters in the same races (shrunk)" },
  { key: "lastYear", label: "Last graded", width: "w-[6.25rem]", right: true, title: "Most recent election with a graded poll" },
  { key: "polls2026", label: "2026 polls", width: "w-[5.75rem]", right: true, title: "Race and generic-ballot polls fielded on or after 1 January 2026" },
];
const DESKTOP_ONLY = "hidden md:table-cell";
const only = (key: SortKey) => (COLUMNS.find((c) => c.key === key)?.mobile ? "" : DESKTOP_ONLY);

const FIRST_ROWS = 50; // rows shown before "Show all"

const polls2026 = (r: PollsterRating) => r.racePolls2026 + r.genericPolls2026;

function sortValue(r: PollsterRating, key: SortKey): number | string {
  switch (key) {
    case "grade": return gradeRank(r.grade) * 100 + (r.score ?? 0);
    case "name": return r.name.toLowerCase();
    case "polls2026": return -polls2026(r);
    case "n": return -r.n;
    case "lastYear": return -(r.lastYear ?? 0);
    case "avgMiss": return r.avgMiss == null ? Number.POSITIVE_INFINITY : Math.abs(r.avgMiss);
    case "record": return r.record[0] + r.record[1] ? -r.record[0] / (r.record[0] + r.record[1]) : 1;
    default: return r[key] ?? Number.POSITIVE_INFINITY;
  }
}

/** "41–3" (plus "–1" for ties): right in the WAR green, wrong in its red (zeros included), ties muted; the share right on hover. */
export function WinLossCell({ record: [w, l, t] }: { record: WinLoss }) {
  if (w + l + t === 0) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const muted = "var(--app-text-muted)";
  return (
    <span title={`Had the winner ahead in ${w} of ${w + l} graded polls (${Math.round((w / Math.max(1, w + l)) * 100)}%)${t ? `; ${t} tied` : ""}`}>
      <span className="font-semibold" style={{ color: WAR_GOOD }}>{w}</span>
      <span style={{ color: muted }}>–</span>
      <span className="font-semibold" style={{ color: WAR_BAD }}>{l}</span>
      {t > 0 && <span style={{ color: muted }}>–{t}</span>}
    </span>
  );
}

type SponsorEffect = { partisan: "D" | "R" | null; effect: number; polls: number };

/** By-cycle and by-region record, on the pollster's own page. `sponsorEffects` (with its `year`) adds this cycle's
 *  house effect split by public and party-sponsored polls, when the pollster has both. */
export function PollsterRecordDetail({ r, sponsorEffects = [], year }: { r: PollsterRating; sponsorEffects?: SponsorEffect[]; year?: number }) {
  const head = "pb-1 text-[10px] font-bold uppercase tracking-wider";
  const cell = "py-1 pr-3 text-xs tabular-nums whitespace-nowrap sm:pr-4";
  if (r.n === 0)
    return <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>No graded polls on file: this pollster is new this cycle, or has never polled a general election inside the final three weeks.</p>;
  return (
    <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[auto_auto_1fr]">
      <div className="min-w-0 overflow-x-auto">
        <div className={head} style={{ color: "var(--app-text-very-muted)" }}>By cycle</div>
        <table className="w-full lg:w-auto">
          <thead><tr style={{ color: "var(--app-text-very-muted)" }}>{["Cycle", "Polls", "Avg. error", "Record", "Vs. field", "Avg. miss"].map((h) => <th key={h} className="pr-3 text-left text-[10px] font-semibold sm:pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {r.byCycle.map((c) => (
              <tr key={c.cycle}>
                <td className={cell}>{c.cycle}</td><td className={cell}>{c.n}</td><td className={cell}>{c.avgError.toFixed(1)}</td><td className={cell}><WinLossCell record={c.record} /></td>
                <td className={cell}><span className="rounded px-1" style={{ background: vsFieldTint(c.excess, 3) }}>{fmtVsField(c.excess)}</span></td>
                <td className={cell} style={{ color: leanColor(c.bias) }}>{fmtLean(c.bias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className={head} style={{ color: "var(--app-text-very-muted)" }}>By region</div>
        <table className="w-full lg:w-auto">
          <thead><tr style={{ color: "var(--app-text-very-muted)" }}>{["Region", "Polls", "Avg. error", "Vs. field", "Bias"].map((h) => <th key={h} className="pr-3 text-left text-[10px] font-semibold sm:pr-4">{h}</th>)}</tr></thead>
          <tbody>
            {r.byRegion.map((c) => (
              <tr key={c.region}>
                <td className={cell}>{c.region}</td><td className={cell}>{c.n}</td><td className={cell}>{c.avgError.toFixed(1)}</td>
                <td className={cell}><span className="rounded px-1" style={{ background: vsFieldTint(c.excess, 3) }}>{fmtVsField(c.excess)}</span></td>
                <td className={cell} style={{ color: leanColor(c.bias) }}>{fmtLean(c.bias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        <div className={head} style={{ color: "var(--app-text-very-muted)" }}>Record</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt style={{ color: "var(--app-text-very-muted)" }}>Graded polls</dt>
          <dd>{r.n}{r.races !== r.n && ` across ${r.races} races`} · {r.firstYear === r.lastYear ? r.firstYear : `${r.firstYear}–${r.lastYear}`}</dd>
          {r.byType.length > 0 && <>
            <dt style={{ color: "var(--app-text-very-muted)" }}>By office</dt>
            <dd>{[...r.byType].sort((a, b) => b.n - a.n).map((t) => `${t.type} ${t.n}`).join(" · ")}</dd>
          </>}
          {(r.partisanShare ?? 0) > 0 && <>
            <dt style={{ color: "var(--app-text-very-muted)" }}>Sponsored</dt>
            <dd>{Math.round((r.partisanShare ?? 0) * 100)}% by {r.partisanLean === "D" ? "Democratic" : "Republican"} campaigns or groups</dd>
          </>}
          {sponsorEffects.length > 1 && <>
            <dt style={{ color: "var(--app-text-very-muted)" }}>{year} house effect</dt>
            <dd>
              {sponsorEffects.map((h, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <span className="font-semibold" style={{ color: leanColor(h.effect) }}>{fmtLean(h.effect)}</span>
                  {" "}in {h.polls} {h.partisan ? `${h.partisan === "R" ? "Republican" : "Democratic"}-sponsored` : "public"} {h.polls === 1 ? "poll" : "polls"}
                </span>
              ))}
            </dd>
          </>}
        </dl>
      </div>
    </div>
  );
}

/** A cell spanning the whole row. Phones get their own, narrower span: a span over the hidden columns
 *  would bring them back as empty columns in the fixed layout. */
function FullRowCells({ className, style, children }: { className: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <>
      <td colSpan={COLUMNS.filter((c) => c.mobile).length} className={`${className} md:hidden`} style={style}>{children}</td>
      <td colSpan={COLUMNS.length} className={`${className} ${DESKTOP_ONLY}`} style={style}>{children}</td>
    </>
  );
}

export default function PollsterRatingsTable({ ratings }: { ratings: PollsterRating[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "grade", dir: 1 });
  const [scope, setScope] = useState<Scope>("rated");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ratings
      .filter((r) => (scope === "rated" ? r.grade != null : scope === "active" ? polls2026(r) > 0 : true))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * sort.dir;
      });
  }, [ratings, scope, query, sort]);

  const scopes: [Scope, string][] = [["rated", "Graded"], ["active", "Polling in 2026"], ["all", "All"]];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="flex rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }} role="group" aria-label="Which pollsters to list">
          {scopes.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setScope(key); setExpanded(false); }} aria-pressed={scope === key} className="rounded px-3 py-1 text-xs font-semibold"
              style={{ background: scope === key ? "var(--app-panel)" : "transparent", color: scope === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a pollster" aria-label="Find a pollster"
          className="w-56 rounded-md px-3 py-1.5 text-sm outline-none" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{rows.length} pollsters</span>
      </div>

      <label className="-mt-1 flex items-center gap-2 pb-3 text-xs md:hidden" style={{ color: "var(--app-text-muted)" }}>
        Sort
        <select value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: 1 })} className="rounded px-1.5 py-1 text-xs"
          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" onClick={() => setSort((s) => ({ ...s, dir: s.dir === 1 ? -1 : 1 }))} className="rounded px-2 py-1 text-xs font-semibold"
          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} aria-label="Reverse the sort">{sort.dir === 1 ? "↑" : "↓"}</button>
      </label>

      <div className="md:overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm md:min-w-[60rem]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" title={c.title} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`${c.mobile ? "" : DESKTOP_ONLY} ${c.width ?? ""} whitespace-nowrap px-1.5 py-2 text-[10px] md:px-2 font-bold uppercase tracking-wider ${c.right ? "text-right" : c.center ? "text-center" : "text-left"}`}
                  style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                  <span className={c.center ? "inline-block min-w-[4.5rem] text-left" : undefined /* matches the Record cells' block */}>
                    <button type="button" className="uppercase tracking-wider hover:underline" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(expanded ? rows : rows.slice(0, FIRST_ROWS)).map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="px-1.5 py-2 md:px-2"><PollsterGradeChip grade={r.grade} /></td>
                  <td className="px-1.5 py-2 font-semibold [overflow-wrap:anywhere] md:px-2">
                    <Link prefetch={false} href={`/analysis/pollsters/${r.slug}`} className="hover:underline">{r.name}</Link>
                    {(r.partisanShare ?? 0) >= 0.5 && <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(r.partisanLean === "R" ? 1 : -1) }} title="Most of its graded polls were party- or campaign-sponsored">({r.partisanLean})</span>}
                  </td>
                  <td className={`${only("n")} px-2 py-2 text-right tabular-nums`}>{r.n || "—"}</td>
                  <td className={`${only("avgError")} px-2 py-2 text-right tabular-nums`}>{r.avgError?.toFixed(1) ?? "—"}</td>
                  <td className={`${only("avgMiss")} px-2 py-2 text-right tabular-nums`} style={{ color: leanColor(r.avgMiss) }}>{fmtLean(r.avgMiss)}</td>
                  <td className={`${only("record")} whitespace-nowrap px-2 py-2 text-center tabular-nums`}>
                    {/* a fixed-width block centred in the column, left-aligned inside, so the win counts line up */}
                    <span className="inline-block min-w-[4.5rem] text-left"><WinLossCell record={r.record} /></span>
                  </td>
                  <td className="px-1.5 py-2 text-right tabular-nums md:px-2"><span className="rounded px-1.5 py-0.5" style={{ background: vsFieldTint(r.score) }}>{fmtVsField(r.score)}</span></td>
                  <td className="px-1.5 py-2 text-right tabular-nums md:px-2" style={{ color: leanColor(r.bias) }}>{fmtLean(r.bias)}</td>
                  <td className={`${only("house")} px-2 py-2 text-right tabular-nums`} style={{ color: leanColor(r.house) }}>{fmtLean(r.house)}</td>
                  <td className={`${only("lastYear")} px-2 py-2 text-right tabular-nums`} style={{ color: "var(--app-text-muted)" }}>{r.lastYear ?? "—"}</td>
                  <td className={`${only("polls2026")} px-2 py-2 text-right tabular-nums`} style={{ color: polls2026(r) ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{polls2026(r) || "—"}</td>
                </tr>
            ))}
            {rows.length === 0 && <tr><FullRowCells className="px-2 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No pollster matches.</FullRowCells></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > FIRST_ROWS && (
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
          {expanded ? `Show the first ${FIRST_ROWS} only` : `Show all ${rows.length} pollsters`}
        </button>
      )}
    </div>
  );
}
