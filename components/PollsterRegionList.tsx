"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { fmtLean, fmtVsField, gradeTint, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";

// Phones: the region heatmap is too wide, so each pollster is a line with its overall grade and a
// strip of labelled cells, overall then each region (grade letter on the score's tint; a dot where
// there are too few polls); tapping the pollster lists every region in full.

export interface RegionCell { region: string; n: number; grade: string | null; score: number | null; avgError: number | null; bias: number | null }
export interface RegionRow { id: string; slug: string; name: string; grade: string | null; cells: RegionCell[] }

const SHORT: Record<string, string> = { National: "Nat'l", Northeast: "NE", "Rust Belt": "Rust", "Sun Belt": "Sun", South: "South", Mountain: "Mtn", Pacific: "Pac" };

/** One strip cell: a tiny label over the grade, so the strip reads without a header row. */
function StripCell({ label, value, className, style }: { label: string; value: string | null; className: string; style: CSSProperties }) {
  return (
    <div className={`flex h-8 min-w-0 flex-col items-center justify-center leading-none ${className}`} style={style}>
      <div className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-[11px] font-bold">{value || "\u00a0"}</div>
    </div>
  );
}

export default function PollsterRegionList({ rows, minPolls }: { rows: RegionRow[]; minPolls: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const muted = { color: "var(--app-text-very-muted)" };
  return (
    <div>
      <div className="pb-1.5 text-[10px] leading-snug" style={muted}>
        Each strip: the overall grade, then the grade in each region (a dot is fewer than {minPolls} polls there). Tap a pollster for every region.
      </div>
      <div style={{ borderTop: "1px solid var(--app-border)" }}>
        {rows.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="w-full py-1.5 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{r.name}</span>
                  <span className="shrink-0 text-xs" style={muted} aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
                </div>
                <div className="mt-1 flex gap-px">
                  <StripCell label="Overall" value={r.grade ?? "NR"} className="mr-1 flex-[1.3] rounded-sm" style={{ background: gradeTint(r.grade) }} />
                  {r.cells.map((c) => {
                    const graded = c.n >= minPolls && c.score != null;
                    return (
                      <StripCell key={c.region} label={SHORT[c.region] ?? c.region} value={graded ? c.grade : c.n > 0 ? "·" : ""} className="flex-1 first:rounded-l-sm last:rounded-r-sm"
                        style={graded ? { background: vsFieldTint(c.score), boxShadow: "inset 0 0 0 1px var(--app-border)" } : { outline: "1px dashed var(--app-border)", outlineOffset: -1, color: "var(--app-text-very-muted)" }} />
                    );
                  })}
                </div>
              </button>
              {isOpen && (
                <div className="pb-2">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr style={muted}>{["Region", "Grade", "Vs. field", "Polls", "Bias"].map((h, i) => <th key={h} className={`pb-0.5 text-[10px] font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {r.cells.map((c) => {
                        const graded = c.n >= minPolls && c.score != null;
                        return (
                          <tr key={c.region}>
                            <td className="py-0.5">{c.region}</td>
                            <td className="py-0.5 text-right font-bold">{graded ? c.grade : <span style={muted}>—</span>}</td>
                            <td className="py-0.5 text-right">{graded ? <span className="rounded px-1" style={{ background: vsFieldTint(c.score) }}>{fmtVsField(c.score)}</span> : <span style={muted}>—</span>}</td>
                            <td className="py-0.5 text-right" style={graded ? undefined : muted}>{c.n || "—"}</td>
                            <td className="py-0.5 text-right" style={{ color: graded ? leanColor(c.bias) : "var(--app-text-very-muted)" }}>{graded ? fmtLean(c.bias) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Link prefetch={false} href={`/analysis/pollsters/${r.slug}`} className="mt-1.5 inline-block text-xs font-semibold underline underline-offset-2">Every {r.name} poll &rarr;</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
