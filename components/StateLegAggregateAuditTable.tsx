"use client";

import { useMemo, useState } from "react";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import type { AggregateAuditRow } from "@/lib/stateLegAggregateAudit";

function fmtNum(v: number | null): string {
  return v == null ? "—" : v.toLocaleString();
}

function fmtSignedNum(v: number | null): string {
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

export default function StateLegAggregateAuditTable({
  rows,
  totalChamberYears,
}: {
  rows: AggregateAuditRow[];
  totalChamberYears: number;
}) {
  const [onlyIndependent, setOnlyIndependent] = useState(false);
  const [onlyMismatched, setOnlyMismatched] = useState(false);

  const shown = useMemo(() => {
    let r = rows;
    if (onlyIndependent) r = r.filter((x) => !x.sharedLineage);
    if (onlyMismatched) r = r.filter((x) => x.totalDiff == null || x.totalDiff !== 0);
    return r;
  }, [rows, onlyIndependent, onlyMismatched]);
  const matching = rows.filter((r) => r.totalDiff != null && Math.abs(r.totalDiff) === 0).length;
  const independent = rows.filter((r) => !r.sharedLineage).length;
  const noCount = rows.reduce((n, r) => n + (r.districtCount - r.countedDistricts), 0);

  const headers: { label: string; align?: "left" | "right" }[] = [
    { label: "State", align: "left" },
    { label: "Chamber", align: "left" },
    { label: "Year", align: "right" },
    { label: "Dist.", align: "right" },
    { label: "No count", align: "right" },
    { label: "Agg D", align: "right" },
    { label: "Stw D", align: "right" },
    { label: "Agg R", align: "right" },
    { label: "Stw R", align: "right" },
    { label: "Agg O", align: "right" },
    { label: "Stw O", align: "right" },
    { label: "Agg Total", align: "right" },
    { label: "Stw Total", align: "right" },
    { label: "D Diff", align: "right" },
    { label: "R Diff", align: "right" },
    { label: "Total Diff", align: "right" },
    { label: "Agg Margin", align: "right" },
    { label: "Stw Margin", align: "right" },
    { label: "Margin Diff", align: "right" },
    { label: "Lineage", align: "left" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{rows.length}</strong> of {totalChamberYears} chamber-years have district-level results
          </span>
          <span>
            <strong style={{ color: "#3d8f5f" }}>{matching}</strong> reconcile exactly
          </span>
          <span>
            <strong style={{ color: independent ? "var(--app-text-primary)" : "#c9a227" }}>{independent}</strong> independently sourced
          </span>
          <span>
            <strong style={{ color: noCount ? "#c9a227" : "var(--app-text-primary)" }}>{noCount.toLocaleString()}</strong> districts with no published count
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
            <input type="checkbox" checked={onlyIndependent} onChange={(e) => setOnlyIndependent(e.target.checked)} />
            Only independently sourced
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
            <input type="checkbox" checked={onlyMismatched} onChange={(e) => setOnlyMismatched(e.target.checked)} />
            Only rows that do not reconcile
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div
          className="rounded-lg px-4 py-6 text-sm"
          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
        >
          {rows.length === 0
            ? "No district-level results built yet. Chamber-years appear here as Phase 3 lands data in data-entry/state-leg-results/."
            : "No chamber-year matches the current filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                {headers.map((h) => (
                  <th
                    key={h.label}
                    className={`pb-2 pr-3 pt-1 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${h.align === "right" ? "text-right" : "text-left"}`}
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.abbr}-${row.chamber}-${row.year}`} style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>{row.abbr}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{row.chamberLabel}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{row.year}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }} title={row.note}>
                    {row.districtCount}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-right whitespace-nowrap"
                    style={{ color: row.districtCount - row.countedDistricts ? "#c9a227" : "var(--app-text-very-muted)" }}
                    title={
                      row.districtCount - row.countedDistricts
                        ? "Districts listed by the source with no published vote count — the seat was filled without a count being printed, usually an unopposed race. They contribute nothing to the sums on this row."
                        : undefined
                    }
                  >
                    {row.districtCount - row.countedDistricts || "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>{fmtNum(row.aggDem)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>{fmtNum(row.stwDem)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-rep)" }}>{fmtNum(row.aggRep)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-rep)" }}>{fmtNum(row.stwRep)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{fmtNum(row.aggOth)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{fmtNum(row.stwOth)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>{fmtNum(row.aggTotal)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>{fmtNum(row.stwTotal)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.demDiff, 1, 10000) }}>{fmtSignedNum(row.demDiff)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.repDiff, 1, 10000) }}>{fmtSignedNum(row.repDiff)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.totalDiff, 1, 10000) }}>{fmtSignedNum(row.totalDiff)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: marginColor(row.aggMargin) }}>{fmtMargin(row.aggMargin)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: marginColor(row.stwMargin) }}>{fmtMargin(row.stwMargin)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-bold" style={{ color: diffColor(row.marginDiff, 0.5, 2) }}>
                    {row.marginDiff == null ? "—" : `${row.marginDiff > 0 ? "+" : ""}${row.marginDiff.toFixed(2)}%`}
                  </td>
                  <td
                    className="py-1.5 pr-3 whitespace-nowrap text-xs"
                    style={{ color: row.sharedLineage ? "#c9a227" : "#3d8f5f" }}
                    title={row.sharedLineage ? `Both sides come from: ${row.source}` : `Districts: ${row.source}\nStatewide: ${row.statewideSource || "—"}`}
                  >
                    {row.sharedLineage ? "shared" : "independent"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
