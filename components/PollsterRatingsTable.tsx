"use client";

import { Fragment, useMemo, useState } from "react";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import type { PollsterRating } from "@/data/pollsterRatings";
import { fmtLean, fmtVsField, gradeRank, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";

type SortKey = "grade" | "name" | "n" | "avgError" | "score" | "bias" | "house" | "lastYear" | "polls2026";
type Scope = "rated" | "active" | "all";

const COLUMNS: { key: SortKey; label: string; right?: true; title: string }[] = [
  { key: "grade", label: "Grade", title: "Letter band of the score; needs five graded polls" },
  { key: "name", label: "Pollster", title: "Pollster" },
  { key: "n", label: "Polls", right: true, title: "Graded polls: general-election polls in the final 21 days, 2008–2024" },
  { key: "avgError", label: "Avg. error", right: true, title: "Recency-weighted average miss on the margin, in points" },
  { key: "score", label: "Vs. field", right: true, title: "Score: average miss minus what a typical poll of the same races missed by, shrunk toward 0 for small records. Negative is better." },
  { key: "bias", label: "Bias", right: true, title: "Average signed miss against the result (shrunk): D+2 means the pollster overstated Democrats by 2" },
  { key: "house", label: "House effect", right: true, title: "Average lean against the OTHER pollsters in the same races (shrunk)" },
  { key: "lastYear", label: "Last graded", right: true, title: "Most recent election with a graded poll" },
  { key: "polls2026", label: "2026 polls", right: true, title: "Race and generic-ballot polls on file this cycle" },
];

const polls2026 = (r: PollsterRating) => r.racePolls2026 + r.genericPolls2026;

function sortValue(r: PollsterRating, key: SortKey): number | string {
  switch (key) {
    case "grade": return gradeRank(r.grade) * 100 + (r.score ?? 0);
    case "name": return r.name.toLowerCase();
    case "polls2026": return -polls2026(r);
    case "n": return -r.n;
    case "lastYear": return -(r.lastYear ?? 0);
    default: return r[key] ?? Number.POSITIVE_INFINITY;
  }
}

function Detail({ r }: { r: PollsterRating }) {
  const head = "pb-1 text-[10px] font-bold uppercase tracking-wider";
  const cell = "py-1 pr-4 text-xs tabular-nums whitespace-nowrap";
  if (r.n === 0)
    return <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>No graded polls on file: this pollster is new this cycle, or has never polled a general election inside the final three weeks.</p>;
  return (
    <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[auto_auto_1fr]">
      <div>
        <div className={head} style={{ color: "var(--app-text-very-muted)" }}>By cycle</div>
        <table>
          <thead><tr style={{ color: "var(--app-text-very-muted)" }}>{["Cycle", "Polls", "Avg. error", "Vs. field", "Bias"].map((h) => <th key={h} className="pr-4 text-left text-[10px] font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {r.byCycle.map((c) => (
              <tr key={c.cycle}>
                <td className={cell}>{c.cycle}</td><td className={cell}>{c.n}</td><td className={cell}>{c.avgError.toFixed(1)}</td>
                <td className={cell}><span className="rounded px-1" style={{ background: vsFieldTint(c.excess, 3) }}>{fmtVsField(c.excess)}</span></td>
                <td className={cell} style={{ color: leanColor(c.bias) }}>{fmtLean(c.bias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className={head} style={{ color: "var(--app-text-very-muted)" }}>By region</div>
        <table>
          <thead><tr style={{ color: "var(--app-text-very-muted)" }}>{["Region", "Polls", "Avg. error", "Vs. field", "Bias"].map((h) => <th key={h} className="pr-4 text-left text-[10px] font-semibold">{h}</th>)}</tr></thead>
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
        <p>
          {r.n} graded polls of {r.races} races, {r.firstYear}–{r.lastYear}
          {r.byType.length > 0 && <> ({r.byType.map((t) => `${t.type} ${t.n}`).join(" · ")})</>}. Unshrunk, its polls
          missed by {fmtVsField(r.excess)} pts against the field; the score of {fmtVsField(r.score)} is that figure pulled
          toward the average pollster in proportion to how thin the recent record is (recency weight {r.weight}).
        </p>
        {(r.methodology || (r.partisanShare ?? 0) > 0) && (
          <p className="mt-1.5">
            {r.methodology && <>Method ({r.lastYear}): {r.methodology}. </>}
            {(r.partisanShare ?? 0) > 0 && <>{Math.round((r.partisanShare ?? 0) * 100)}% of its graded polls were sponsored by {r.partisanLean === "D" ? "Democratic" : "Republican"} campaigns or groups.</>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PollsterRatingsTable({ ratings }: { ratings: PollsterRating[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "grade", dir: 1 });
  const [scope, setScope] = useState<Scope>("rated");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

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
            <button key={key} type="button" onClick={() => setScope(key)} aria-pressed={scope === key} className="rounded px-3 py-1 text-xs font-semibold"
              style={{ background: scope === key ? "var(--app-panel)" : "transparent", color: scope === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a pollster" aria-label="Find a pollster"
          className="w-56 rounded-md px-3 py-1.5 text-sm outline-none" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{rows.length} pollsters</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" title={c.title} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${c.right ? "text-right" : "text-left"}`}
                  style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                  <button type="button" className="uppercase tracking-wider hover:underline" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)} style={{ borderBottom: open === r.id ? "none" : "1px solid var(--app-border)" }}>
                  <td className="px-2 py-2"><PollsterGradeChip grade={r.grade} /></td>
                  <td className="px-2 py-2 font-semibold">
                    <button type="button" aria-expanded={open === r.id} className="text-left hover:underline">{r.name}</button>
                    {(r.partisanShare ?? 0) >= 0.5 && <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(r.partisanLean === "R" ? 1 : -1) }} title="Most of its graded polls were party- or campaign-sponsored">({r.partisanLean})</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.n || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.avgError?.toFixed(1) ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums"><span className="rounded px-1.5 py-0.5" style={{ background: vsFieldTint(r.score) }}>{fmtVsField(r.score)}</span></td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: leanColor(r.bias) }}>{fmtLean(r.bias)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: leanColor(r.house) }}>{fmtLean(r.house)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.lastYear ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: polls2026(r) ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{polls2026(r) || "—"}</td>
                </tr>
                {open === r.id && (
                  <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td colSpan={COLUMNS.length} className="px-2 pb-5 pt-1"><Detail r={r} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No pollster matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
