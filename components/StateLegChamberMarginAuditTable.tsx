"use client";

import { useMemo, useState } from "react";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import type { ChamberMarginAuditRow } from "@/lib/stateLegChamberMarginAudit";

const fmtPts = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);
const shiftColor = (v: number | null) => (v == null ? "var(--app-text-very-muted)" : Math.abs(v) >= 5 ? "var(--party-rep)" : Math.abs(v) >= 2 ? "#c9a227" : "var(--app-text-muted)");

export default function StateLegChamberMarginAuditTable({ rows }: { rows: ChamberMarginAuditRow[] }) {
  const [sort, setSort] = useState<"state" | "shift" | "imputed">("state");
  const [onlyMoved, setOnlyMoved] = useState(false);
  const shown = useMemo(() => {
    let r = rows;
    if (onlyMoved) r = r.filter((x) => x.shift != null && Math.abs(x.shift) >= 2);
    if (sort === "shift") r = [...r].sort((a, b) => Math.abs(b.shift ?? 0) - Math.abs(a.shift ?? 0));
    if (sort === "imputed") r = [...r].sort((a, b) => b.imputedShare - a.imputedShare);
    return r;
  }, [rows, sort, onlyMoved]);
  const moved = rows.filter((x) => x.shift != null && Math.abs(x.shift) >= 2).length;
  const skipped = rows.reduce((s, r) => s + r.skipped, 0);
  const meanAbs = rows.filter((r) => r.shift != null).reduce((s, r) => s + Math.abs(r.shift!), 0) / Math.max(1, rows.filter((r) => r.shift != null).length);

  const headers: { label: string; align?: "left" | "right" }[] = [
    { label: "State", align: "left" }, { label: "Chamber", align: "left" }, { label: "Year", align: "right" }, { label: "Lines", align: "left" },
    { label: "Dist.", align: "right" }, { label: "Contested", align: "right" }, { label: "Imputed", align: "right" }, { label: "Skipped", align: "right" },
    { label: "Src pres", align: "right" }, { label: "Turnout ratio", align: "right" }, { label: "Imputed wt", align: "right" },
    { label: "Raw", align: "right" }, { label: "Contested pool", align: "right" }, { label: "Imputed pool", align: "right" }, { label: "Corrected", align: "right" }, { label: "Shift", align: "right" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
        <span><b style={{ color: "var(--app-text-primary)" }}>{rows.length}</b> chamber-years · <b style={{ color: "var(--app-text-primary)" }}>{moved}</b> move 2+ points · mean |shift| <b style={{ color: "var(--app-text-primary)" }}>{meanAbs.toFixed(2)}</b> · <b style={{ color: "var(--app-text-primary)" }}>{skipped}</b> district-years skipped (no presidential figure on their lines)</span>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={onlyMoved} onChange={(e) => setOnlyMoved(e.target.checked)} /> only shifts of 2+ points</label>
        <span className="flex items-center gap-1">
          sort
          {(["state", "shift", "imputed"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} className="px-2 py-0.5 rounded-full" style={{ background: sort === k ? "var(--app-text-primary)" : "var(--app-tab-bg)", color: sort === k ? "var(--app-bg)" : "var(--app-text-muted)", fontWeight: 600 }}>
              {k === "state" ? "state" : k === "shift" ? "|shift|" : "imputed weight"}
            </button>
          ))}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {headers.map((h) => (
                <th key={h.label} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${h.align === "right" ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.abbr}-${r.chamber}-${r.year}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="py-1 pr-3 font-semibold">{r.abbr}</td>
                <td className="py-1 pr-3">{r.chamberLabel}</td>
                <td className="py-1 pr-3 text-right">{r.year}</td>
                <td className="py-1 pr-3 whitespace-nowrap" style={{ color: r.era === "current" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{r.era}</td>
                <td className="py-1 pr-3 text-right">{r.districts}</td>
                <td className="py-1 pr-3 text-right">{r.contested}</td>
                <td className="py-1 pr-3 text-right">{r.imputed}</td>
                <td className="py-1 pr-3 text-right" style={{ color: r.skipped ? "#c9a227" : "var(--app-text-very-muted)" }}>{r.skipped}</td>
                <td className="py-1 pr-3 text-right">{r.srcYear ?? "—"}</td>
                <td className="py-1 pr-3 text-right">{r.turnoutRatio.toFixed(2)}</td>
                <td className="py-1 pr-3 text-right">{(r.imputedShare * 100).toFixed(0)}%</td>
                <td className="py-1 pr-3 text-right font-semibold" style={{ color: marginColor(r.rawMargin) }}>{fmtMargin(r.rawMargin)}</td>
                <td className="py-1 pr-3 text-right" style={{ color: marginColor(r.contestedMargin) }}>{fmtMargin(r.contestedMargin)}</td>
                <td className="py-1 pr-3 text-right" style={{ color: marginColor(r.imputedMargin) }}>{fmtMargin(r.imputedMargin)}</td>
                <td className="py-1 pr-3 text-right font-semibold" style={{ color: marginColor(r.correctedMargin) }}>{fmtMargin(r.correctedMargin)}</td>
                <td className="py-1 pr-0 text-right font-semibold" style={{ color: shiftColor(r.shift) }}>{fmtPts(r.shift)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
