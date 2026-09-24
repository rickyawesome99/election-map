"use client";

import { useMemo, useState } from "react";
import type { RaceType } from "@/data/forecastData";
import type { ComparisonRow, AgreementSummary } from "@/lib/forecastComparison";
import { CHAMBER_LABEL } from "@/lib/forecastComparison";
import { getRatingColors } from "@/lib/colorScale";

// One grid per chamber: a row per race, a column per forecaster (ours first), every cell the
// call on the shared nine-step scale. Rows can be narrowed to the competitive seats or to the
// ones where somebody disagrees with us, and sorted by how far apart the calls are.

// `name` is the column heading (shortened where the full name will not fit); `fullName` is what
// the hover text and the cell tooltips say.
export interface GridForecaster { id: string; name: string; fullName: string; kind: "model" | "ratings"; url: string; asOf: string }
export type GridData = Record<RaceType, { rows: ComparisonRow[]; forecasters: GridForecaster[]; summaries: AgreementSummary[] }>;

type Filter = "competitive" | "disagree" | "all";
type Sort = "spread" | "ours" | "name";

const TOSSUP = { bg: "var(--app-tab-bg)", text: "var(--app-text-primary)" };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmtMargin = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);

// Every cell is the same box whatever it holds: the rating on one line and a fixed second line
// for the probability, kept in place with a non-breaking space where a rater publishes none, so
// the grid reads as a grid rather than a ragged stack. A star on the rating marks a seat the
// forecaster leaves off its competitive list, which we read as Safe for the party ahead.
function Chip({ rating, sub, inferred, title }: { rating: string; sub?: string; inferred?: boolean; title: string }) {
  const c = rating === "Toss-up" ? TOSSUP : getRatingColors(rating);
  return (
    <div title={title} className="mx-auto flex h-8 w-[4.75rem] flex-col items-center justify-center rounded leading-none"
      style={{ background: c.bg, color: c.text }}>
      <div className="text-[10px] font-bold whitespace-nowrap">{rating}{inferred && <span aria-hidden="true">*</span>}</div>
      <div className="mt-0.5 text-[9px] tabular-nums" style={{ opacity: 0.85 }}>{sub || "\u00a0"}</div>
    </div>
  );
}

export default function ForecastComparisonGrid({ data, initial = "senate" }: { data: GridData; initial?: RaceType }) {
  const [chamber, setChamber] = useState<RaceType>(initial);
  const [filter, setFilter] = useState<Filter>("competitive");
  const [sort, setSort] = useState<Sort>("spread");
  const [limit, setLimit] = useState(120);

  const { rows, forecasters } = data[chamber];
  const shown = useMemo(() => {
    let r = rows;
    if (filter === "competitive") r = r.filter((x) => x.competitive);
    if (filter === "disagree") r = r.filter((x) => x.maxAbsDelta >= 2 || Object.values(x.calls).some((c) => c.ordinal * x.ours.ordinal < 0));
    const byName = (a: ComparisonRow, b: ComparisonRow) => a.name.localeCompare(b.name);
    if (sort === "spread") r = [...r].sort((a, b) => b.spread - a.spread || b.maxAbsDelta - a.maxAbsDelta || byName(a, b));
    else if (sort === "ours") r = [...r].sort((a, b) => a.ours.margin - b.ours.margin || byName(a, b));
    else r = [...r].sort(byName);
    return r;
  }, [rows, filter, sort]);

  const counts = {
    all: rows.length,
    competitive: rows.filter((x) => x.competitive).length,
    disagree: rows.filter((x) => x.maxAbsDelta >= 2 || Object.values(x.calls).some((c) => c.ordinal * x.ours.ordinal < 0)).length,
  };
  const tab = (active: boolean) => ({
    background: active ? "var(--app-text-primary)" : "transparent",
    color: active ? "var(--app-bg)" : "var(--app-text-muted)",
    border: "1px solid var(--app-border)",
  });
  const head = "sticky top-0 z-[2] px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider";
  const firstCol = { position: "sticky" as const, left: 0, zIndex: 3, background: "var(--app-bg)" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-3">
        <div className="flex gap-1" role="tablist" aria-label="Chamber">
          {(["senate", "governor", "house"] as RaceType[]).map((c) => (
            <button key={c} role="tab" aria-selected={chamber === c} onClick={() => { setChamber(c); setLimit(120); }} className="rounded px-3 py-1 text-xs font-bold" style={tab(chamber === c)}>
              {CHAMBER_LABEL[c]} <span className="font-normal opacity-70">· {data[c].rows.length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Rows">
          {([["competitive", "Competitive"], ["disagree", "Disagreements"], ["all", "All races"]] as [Filter, string][]).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(120); }} className="rounded px-2.5 py-1 text-xs font-semibold" style={tab(filter === k)}>
              {label} <span className="font-normal opacity-70">· {counts[k]}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded px-1.5 py-1 text-xs" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            <option value="spread">Widest disagreement</option>
            <option value="ours">Our margin (D → R)</option>
            <option value="name">Race</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--app-border)" }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "var(--app-bg)" }}>
              <th scope="col" className={`${head} text-left`} style={{ ...firstCol, zIndex: 4, color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }}>Race</th>
              <th scope="col" className={`${head} text-right`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title="Our projected margin">Our Margin</th>
              <th scope="col" className={`${head} text-center`} style={{ color: "var(--app-text-primary)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }}>Our model</th>
              {forecasters.map((f) => (
                <th key={f.id} scope="col" className={`${head} text-center`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title={`${f.fullName} · ${f.kind === "model" ? "model" : "race ratings"} · as of ${f.asOf}`}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.name}<span aria-hidden="true"> ↗</span></a>
                </th>
              ))}
              <th scope="col" className={`${head} text-center`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title="Steps on the nine-step scale between the most Democratic and most Republican call in the row">Spread</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th scope="row" className="whitespace-nowrap px-1.5 py-1 text-left font-semibold" style={firstCol}>
                  <a href={r.href} className="hover:underline">{r.name}</a>
                  {r.contest !== "contested" && <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--app-text-very-muted)" }} title="Uncontested or same-party general election">uncontested</span>}
                </th>
                <td className="whitespace-nowrap px-1.5 py-1 text-right text-xs font-semibold tabular-nums" style={{ color: r.ours.margin > 0 ? "var(--party-rep)" : "var(--party-dem)" }} title="Our projected margin">{fmtMargin(r.ours.margin)}</td>
                <td className="px-1 py-1">
                  <Chip rating={r.ours.rating} sub={`${pct(r.ours.pDem)} D`} title={`Our model: ${r.ours.rating}, ${fmtMargin(r.ours.margin)}, Democrats win ${pct(r.ours.pDem)}`} />
                </td>
                {forecasters.map((f) => {
                  const c = r.calls[f.id];
                  if (!c) return <td key={f.id} className="px-1 py-1 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }} title={`${f.fullName}: not rated`}>&mdash;</td>;
                  const d = r.ours.ordinal - c.ordinal;
                  const rel = d === 0 ? "same as ours" : `we are ${Math.abs(d)} step${Math.abs(d) === 1 ? "" : "s"} more ${d > 0 ? "Republican" : "Democratic"}`;
                  return (
                    <td key={f.id} className="px-1 py-1">
                      <Chip rating={c.rating} sub={c.pDem != null ? `${pct(c.pDem)} D` : undefined} inferred={c.inferred}
                        title={`${f.fullName}: ${c.rating}${c.pDem != null ? `, Democrats win ${pct(c.pDem)}` : ""}${c.inferred ? " (not on their competitive list, so Safe)" : ""} · ${rel}`} />
                    </td>
                  );
                })}
                <td className="px-1.5 py-1 text-center text-xs tabular-nums" style={{ color: r.spread >= 3 ? "var(--app-text-primary)" : "var(--app-text-very-muted)", fontWeight: r.spread >= 3 ? 700 : 400 }}>{r.spread}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        <span>Showing {Math.min(limit, shown.length)} of {shown.length} races. A star marks a seat a forecaster leaves off its competitive list, counted as Safe for the party ahead.</span>
        {shown.length > limit && <button onClick={() => setLimit(shown.length)} className="rounded px-2.5 py-1 text-xs font-semibold" style={tab(false)}>Show all {shown.length}</button>}
      </div>
    </div>
  );
}
