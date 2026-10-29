"use client";
import Link from "next/link";

import { useMemo, useState } from "react";
import type { RaceType } from "@/data/forecastData";
import type { ComparisonRow, AgreementSummary } from "@/lib/forecastComparison";
import { CHAMBER_LABEL } from "@/lib/forecastTypes";
import { formatProjectedMargin, getRatingColors } from "@/lib/colorScale";

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
// The favorite's win chance, from a Democratic probability: "74% R" rather than "26% D".
const favPct = (pDem: number) => (pDem >= 0.5 ? `${pct(pDem)} D` : `${pct(1 - pDem)} R`);

// Every cell is the same box whatever it holds: the rating on one line and a fixed second line
// for the probability, kept in place with a non-breaking space where a rater publishes none, so
// the grid reads as a grid rather than a ragged stack. A star on the rating marks a seat the
// forecaster leaves off its competitive list, which we read as Safe for the party ahead.
function Chip({ rating, sub, inferred, title }: { rating: string; sub?: string; inferred?: boolean; title: string }) {
  const c = rating === "Toss-up" ? TOSSUP : getRatingColors(rating);
  return (
    <div title={title} className="mx-auto flex h-7 w-[4.25rem] flex-col items-center justify-center rounded leading-none"
      style={{ background: c.bg, color: c.text }}>
      <div className="text-[10px] font-bold whitespace-nowrap">{rating}{inferred && <span aria-hidden="true">*</span>}</div>
      <div className="mt-0.5 text-[9px] tabular-nums" style={{ opacity: 0.85 }}>{sub || "\u00a0"}</div>
    </div>
  );
}

// Desktop: one narrow colored cell per call so every forecast fits across the page without
// scrolling. The color is the rating; a model's cell also prints its favorite's win chance, a
// rater's is color alone. Hover gives the full call.
function HeatCell({ rating, pDem, inferred, strong, title }: { rating: string; pDem?: number; inferred?: boolean; strong?: boolean; title: string }) {
  const c = rating === "Toss-up" ? TOSSUP : getRatingColors(rating);
  return (
    <div title={title} className="flex h-6 w-full items-center justify-center rounded-sm text-[10px] tabular-nums leading-none"
      style={{ background: c.bg, color: rating === "Toss-up" && pDem != null ? (pDem >= 0.5 ? "var(--party-dem)" : "var(--party-rep)") : c.text, fontWeight: strong ? 800 : 600, opacity: inferred ? 0.55 : 1 }}>
      {pDem != null ? Math.round(Math.max(pDem, 1 - pDem) * 100) : ""}{inferred && <span aria-hidden="true">*</span>}
    </div>
  );
}

// Narrow column headings: break only at word or camel-case boundaries ("Fifty·Plus·One"), and
// let a long single word hyphenate in the middle rather than wrap one stray letter.
const headerLabel = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1\u200b$2").split(" ").map((w) => (w.length > 7 && !w.includes("\u200b") ? `${w.slice(0, Math.ceil(w.length / 2))}\u00ad${w.slice(Math.ceil(w.length / 2))}` : w)).join(" ");

const LEGEND_SCALE = ["Safe D", "Likely D", "Lean D", "Tilt D", "Toss-up", "Tilt R", "Lean R", "Likely R", "Safe R"];
function RatingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
      <div className="flex items-center gap-px">
        {LEGEND_SCALE.map((r) => {
          const c = r === "Toss-up" ? TOSSUP : getRatingColors(r);
          return <div key={r} className="flex h-4 items-center px-1.5 text-[9px] font-bold" style={{ background: c.bg, color: c.text }}>{r}</div>;
        })}
      </div>
      <span>Numbers are a model&rsquo;s win chance (%) for the party it favors; raters are color only. Hover a cell for the full call. Faded* = left off a competitive list, read as Safe.</span>
    </div>
  );
}

// Phones: the grid is far too wide, so each race is a line with our call and a strip of colored
// cells, one per forecast in the column order; tapping the race lists every call in full.
function MobileRaceList({ rows, forecasters }: { rows: ComparisonRow[]; forecasters: GridForecaster[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const swatch = (rating: string) => (rating === "Toss-up" ? TOSSUP : getRatingColors(rating));
  return (
    <div style={{ borderTop: "1px solid var(--app-border)" }}>
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="w-full py-1.5 text-left">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{r.name}{r.contest !== "contested" && <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>uncontested</span>}</span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: r.ours.margin > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{formatProjectedMargin(r.ours.margin)}</span>
                  {" · spread "}{r.spread} <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
                </span>
              </div>
              <div className="mt-1 flex gap-px">
                {[{ id: "ours", rating: r.ours.rating }, ...forecasters.map((f) => ({ id: f.id, rating: r.calls[f.id]?.rating }))].map((c) => (
                  <div key={c.id} className="h-3.5 flex-1 first:mr-1 first:flex-[2] first:rounded-l-sm last:rounded-r-sm"
                    style={{ background: c.rating ? swatch(c.rating).bg : "transparent", outline: c.rating ? undefined : "1px dashed var(--app-border)", outlineOffset: -1 }} />
                ))}
              </div>
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pb-2 text-xs">
                <Link prefetch={false} href={r.href} className="col-span-2 font-semibold underline" style={{ color: "var(--party-dem)" }}>Our race page →</Link>
                <div className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate font-semibold">CT Strategies</span><div className="shrink-0"><Chip rating={r.ours.rating} sub={favPct(r.ours.pDem)} title="CT Strategies" /></div></div>
                {forecasters.map((f) => {
                  const c = r.calls[f.id];
                  return (
                    <div key={f.id} className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--app-text-muted)" }}>{f.name}</span>
                      <div className="shrink-0">
                        {c ? <Chip rating={c.rating} sub={c.pDem != null ? favPct(c.pDem) : undefined} inferred={c.inferred} title={f.fullName} />
                          : <div className="w-[4.25rem] text-center" style={{ color: "var(--app-text-very-muted)" }}>—</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-3">
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
            <option value="spread">Most disagreement</option>
            <option value="ours">CTS margin (D → R)</option>
            <option value="name">Race</option>
          </select>
        </label>
      </div>

      <div className="md:hidden">
        <div className="pb-1.5 text-[10px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>
          Each strip: CTS (wide), then {forecasters.map((f) => f.name).join(", ")}. Tap a race for every call.
        </div>
        <MobileRaceList rows={shown.slice(0, limit)} forecasters={forecasters} />
      </div>
      <div className="hidden md:block">
        <RatingLegend />
        <div style={{ maxHeight: "80vh", overflowY: "auto", borderTop: "1px solid var(--app-border)" }}>
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-36 lg:w-44" />
              <col className="w-14" />
              <col className="w-12 lg:w-14" />
              {forecasters.map((f) => <col key={f.id} />)}
              <col className="w-14" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={`${head} text-left align-bottom`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }}>Race</th>
                <th scope="col" className={`${head} text-right align-bottom`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title="CT Strategies' projected margin">Margin</th>
                <th scope="col" className={`${head} text-center align-bottom`} style={{ color: "var(--app-text-primary)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title="CT Strategies">CTS</th>
                {forecasters.map((f, i) => (
                  <th key={f.id} scope="col" className="sticky top-0 z-[2] px-0.5 py-2 text-center align-bottom text-[10px] font-bold leading-tight"
                    style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)", ...(f.kind === "ratings" && forecasters[i - 1]?.kind === "model" ? { borderLeft: "1px solid var(--app-border)" } : {}) }}
                    title={`${f.fullName} · ${f.kind === "model" ? "model" : "race ratings"} · as of ${f.asOf}`}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ hyphens: "manual" }}>{headerLabel(f.name)}</a>
                  </th>
                ))}
                <th scope="col" className={`${head} text-center align-bottom`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }} title="Steps on the nine-step scale between the most Democratic and most Republican call in the row">Spread</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.id} className="hover:bg-[color-mix(in_srgb,var(--app-text-primary)_4%,transparent)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <th scope="row" className="truncate px-1.5 py-0.5 text-left text-[13px] font-semibold" title={r.contest !== "contested" ? `${r.name} — uncontested or same-party general election` : r.name}>
                    <Link prefetch={false} href={r.href} className="hover:underline">{r.name}</Link>
                    {r.contest !== "contested" && <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>unc.</span>}
                  </th>
                  <td className="whitespace-nowrap px-1.5 py-0.5 text-right text-xs font-semibold tabular-nums" style={{ color: r.ours.margin > 0 ? "var(--party-rep)" : "var(--party-dem)" }} title="CT Strategies' projected margin">{formatProjectedMargin(r.ours.margin)}</td>
                  <td className="px-1 py-0.5">
                    <HeatCell rating={r.ours.rating} pDem={r.ours.pDem} strong title={`CT Strategies: ${r.ours.rating}, ${formatProjectedMargin(r.ours.margin)}, favorite wins ${favPct(r.ours.pDem)}`} />
                  </td>
                  {forecasters.map((f, i) => {
                    const c = r.calls[f.id];
                    const sep = f.kind === "ratings" && forecasters[i - 1]?.kind === "model" ? { borderLeft: "1px solid var(--app-border)" } : undefined;
                    if (!c) return <td key={f.id} className="px-px py-0.5 text-center text-[10px]" style={{ color: "var(--app-text-very-muted)", ...sep }} title={`${f.fullName}: not rated`}>&ndash;</td>;
                    const d = r.ours.ordinal - c.ordinal;
                    const rel = d === 0 ? "same as CTS" : `CTS is ${Math.abs(d)} step${Math.abs(d) === 1 ? "" : "s"} more ${d > 0 ? "Republican" : "Democratic"}`;
                    return (
                      <td key={f.id} className="px-px py-0.5" style={sep}>
                        <HeatCell rating={c.rating} pDem={c.pDem} inferred={c.inferred}
                          title={`${f.fullName}: ${c.rating}${c.pDem != null ? `, favorite wins ${favPct(c.pDem)}` : ""}${c.inferred ? " (not on their competitive list, so Safe)" : ""} · ${rel}`} />
                      </td>
                    );
                  })}
                  <td className="px-1 py-0.5 text-center text-xs tabular-nums" style={{ color: r.spread >= 3 ? "var(--app-text-primary)" : "var(--app-text-very-muted)", fontWeight: r.spread >= 3 ? 700 : 400 }}>{r.spread}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        <span>Showing {Math.min(limit, shown.length)} of {shown.length} races.</span>
        {shown.length > limit && <button onClick={() => setLimit(shown.length)} className="rounded px-2.5 py-1 text-xs font-semibold" style={tab(false)}>Show all {shown.length}</button>}
      </div>
    </div>
  );
}
