"use client";

import { useMemo, useState } from "react";
import type { PresByEraAuditRow } from "@/lib/stateLegPresByEraAudit";

function fmtSigned(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString()}`;
}

function diffColor(v: number | null, warnAt: number, badAt: number): string {
  if (v == null) return "var(--app-text-very-muted)";
  const a = Math.abs(v);
  if (a >= badAt) return "var(--party-rep)";
  if (a >= warnAt) return "#c9a227";
  return "#3d8f5f";
}

function holdoutColor(mae: number): string {
  if (mae >= 1) return "var(--party-rep)";
  if (mae >= 0.5) return "#c9a227";
  return "#3d8f5f";
}

export default function StateLegPresByEraAuditTable({ rows }: { rows: PresByEraAuditRow[] }) {
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const flagged = (r: PresByEraAuditRow) =>
    r.diffs.some((d) => d.demDiff != null && (Math.abs(d.demDiff) >= 1000 || Math.abs(d.repDiff ?? 0) >= 1000)) ||
    (r.holdout != null && r.holdout.mae >= 0.5);

  const shown = useMemo(() => {
    let r = rows;
    if (onlyCurrent) r = r.filter((x) => x.era === "current");
    if (onlyFlagged) r = r.filter(flagged);
    return r;
  }, [rows, onlyCurrent, onlyFlagged]);

  const states = new Set(rows.map((r) => r.abbr)).size;
  const holdouts = rows.filter((r) => r.holdout);
  const worst = holdouts.reduce<PresByEraAuditRow | null>((w, r) => (w == null || r.holdout!.mae > w.holdout!.mae ? r : w), null);

  const headers: { label: string; align?: "left" | "right" }[] = [
    { label: "State", align: "left" },
    { label: "Chamber", align: "left" },
    { label: "Era", align: "left" },
    { label: "Elections on it", align: "left" },
    { label: "Dist.", align: "right" },
    { label: "Pop 2020", align: "right" },
    { label: "Split %", align: "right" },
    { label: "D diff ’16", align: "right" },
    { label: "R diff ’16", align: "right" },
    { label: "D diff ’20", align: "right" },
    { label: "R diff ’20", align: "right" },
    { label: "D diff ’24", align: "right" },
    { label: "R diff ’24", align: "right" },
    { label: "Holdout n", align: "right" },
    { label: "MAE", align: "right" },
    { label: "Max", align: "right" },
  ];

  const diffFor = (r: PresByEraAuditRow, year: number) => r.diffs.find((d) => d.year === year);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{states}</strong> states · <strong style={{ color: "var(--app-text-primary)" }}>{rows.length}</strong> chamber-eras
          </span>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{rows.filter(flagged).length}</strong> flagged
          </span>
          {worst?.holdout && (
            <span>
              worst holdout <strong style={{ color: "var(--app-text-primary)" }}>{worst.abbr} {worst.chamberLabel}</strong> MAE {worst.holdout.mae.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input id="pres-by-era-only-current" type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} />
            Current map only
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input id="pres-by-era-only-flagged" type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            Flagged only
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
              {headers.map((h) => (
                <th
                  key={h.label}
                  className="py-1.5 pr-3 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
                  style={{ color: "var(--app-text-muted)", textAlign: h.align ?? "right" }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const d16 = diffFor(r, 2016), d20 = diffFor(r, 2020), d24 = diffFor(r, 2024);
              return (
                <tr key={`${r.abbr}-${r.chamber}-${r.era}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="py-1 pr-3 font-semibold">{r.abbr}</td>
                  <td className="py-1 pr-3">{r.chamberLabel}</td>
                  <td className="py-1 pr-3" style={{ color: r.era === "current" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
                    {r.era === "current" ? "current" : `${r.era} vintage`}
                  </td>
                  <td className="py-1 pr-3" style={{ color: "var(--app-text-muted)" }}>{r.years.length ? r.years.join(", ") : "current cycle"}</td>
                  <td className="py-1 pr-3 text-right">{r.districts}</td>
                  <td className="py-1 pr-3 text-right">{r.pop2020.toLocaleString()}</td>
                  <td className="py-1 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{r.medianSplitPct.toFixed(1)}</td>
                  {[d16, d20, d24].map((d, i) => (
                    <DiffCells key={i} demDiff={d?.demDiff ?? null} repDiff={d?.repDiff ?? null} present={d != null} />
                  ))}
                  <td className="py-1 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{r.holdout ? r.holdout.n : "—"}</td>
                  <td className="py-1 pr-3 text-right font-semibold" style={{ color: r.holdout ? holdoutColor(r.holdout.mae) : "var(--app-text-very-muted)" }}>
                    {r.holdout ? r.holdout.mae.toFixed(2) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right" style={{ color: r.holdout ? holdoutColor(r.holdout.max / 4) : "var(--app-text-very-muted)" }}>
                    {r.holdout ? r.holdout.max.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffCells({ demDiff, repDiff, present }: { demDiff: number | null; repDiff: number | null; present: boolean }) {
  if (!present) {
    return (
      <>
        <td className="py-1 pr-3 text-right" style={{ color: "var(--app-text-very-muted)" }}>n/a</td>
        <td className="py-1 pr-3 text-right" style={{ color: "var(--app-text-very-muted)" }}>n/a</td>
      </>
    );
  }
  return (
    <>
      <td className="py-1 pr-3 text-right" style={{ color: diffColor(demDiff, 100, 1000) }}>{fmtSigned(demDiff)}</td>
      <td className="py-1 pr-3 text-right" style={{ color: diffColor(repDiff, 100, 1000) }}>{fmtSigned(repDiff)}</td>
    </>
  );
}
