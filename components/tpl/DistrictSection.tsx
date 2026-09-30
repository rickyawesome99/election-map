"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getRaceColor } from "@/lib/colorScale";
import { RaceTable, TableCaption } from "./RaceTable";
import { TplMatrix, type MatrixSelection } from "./TplMatrix";
import type { FormulaKey } from "./TplModals";
import { fmt1, fmt2, marginColor, signed } from "./format";
import type { DistrictPageData, TplRace } from "./types";
import { CandidateLink, M, SubHead, TD, TD_R, VERY_MUTED } from "./ui";

// The District TPL section of a state page: the tile strip selects a district; beneath it that
// district's matrix (President on 2026 lines, House in the current boundary era, the boundary
// shift printed in each House cell), the races behind the selected cell, and the ledger.

export function DistrictTiles({ districts, selected, onSelect }: { districts: { id: string; code: string; tpl: number }[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }} role="group" aria-label="Districts">
      {districts.map((d) => {
        const bg = getRaceColor(d.tpl);
        const light = ["#8bafff", "#959bb3", "#cf8980", "#ff8b98"].includes(bg);
        const on = d.id === selected;
        return (
          <button key={d.id} type="button" onClick={() => onSelect(d.id)} aria-pressed={on} id={d.code.toLowerCase()}
            className="rounded px-1 py-1.5 text-center font-mono text-[11px] font-bold leading-tight"
            style={{ background: bg, color: light ? "#1f2328" : "#ffffff", outline: on ? "2px solid var(--app-text-primary)" : undefined, outlineOffset: 1, scrollMarginTop: 120 }}
            title={`${d.code} · District TPL ${fmt1(d.tpl)}`}>
            {d.code.split("-")[1]}
            <span className="block text-[10px] font-medium">{fmt1(d.tpl)}</span>
          </button>
        );
      })}
    </div>
  );
}

const D_ROWS = [{ key: "P", label: "President" }, { key: "H", label: "House" }];

export function DistrictDetail({ d, stateId, medianDistrictTpl, onRace, onFormula }: {
  d: DistrictPageData; stateId: string; medianDistrictTpl: number; onRace: (r: TplRace) => void; onFormula: (k: FormulaKey) => void;
}) {
  const latest = useMemo(() => Math.max(...d.races.filter((r) => r.raceType === "H").map((r) => r.year), 0), [d]);
  const [sel, setSel] = useState<MatrixSelection>({ year: latest || "all", type: latest ? "H" : "all" });
  // A different district resets the selection to its newest House cell.
  const [forId, setForId] = useState(d.id);
  if (forId !== d.id) { setForId(d.id); setSel({ year: latest || "all", type: latest ? "H" : "all" }); }

  const bsByYear = useMemo(() => Object.fromEntries(d.races.filter((r) => r.raceType === "H").map((r) => [r.year, r.BS_pts])), [d]);
  const years = d.yearAggregations;
  const rows = useMemo(() => d.races
    .filter((r) => r.inAggregation && (sel.year === "all" || r.year === sel.year) && (sel.type === "all" || r.raceType === sel.type))
    .sort((a, b) => b.year - a.year || a.raceType.localeCompare(b.raceType)), [d, sel]);
  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);
  const centered = d.tpl - medianDistrictTpl;
  const vsState = d.tpl - d.stateTpl;
  const h = (y: number) => d.races.find((r) => r.raceType === "H" && r.year === y);
  const oldest = weighted.length ? h(weighted[weighted.length - 1].year) : undefined, newest = h(latest);
  const title = sel.type === "all" && sel.year === "all" ? "All races" : sel.type === "all" ? `${sel.year} · both offices` : sel.year === "all" ? (sel.type === "H" ? "All House races" : "All presidential results") : `${sel.year} · ${sel.type === "H" ? `House ${d.code}` : "President on 2026 lines"}`;

  return (
    <div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{d.code} · District TPL</div>
          <div className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, lineHeight: 1 }}>
            {d.name} <span style={{ color: marginColor(d.tpl) }}>{fmt1(d.tpl)}</span>
          </div>
          <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
            Centered <M v={centered} digits={1} /> vs. the 435-district median {fmt1(medianDistrictTpl)} · <M v={vsState} digits={1} /> relative to the state ({fmt1(d.stateTpl)}) · lines from {d.eraStart}
            {d.incumbent && <> · incumbent <CandidateLink name={d.incumbent.name} party={d.incumbent.party} /></>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 text-xs sm:justify-end" style={{ color: "var(--app-text-muted)" }}>
          <Link href={d.seatHref} className="hover:underline">Seat page ›</Link>
          <Link href={`/model#districts`} className="hover:underline">District map ›</Link>
        </div>
      </div>

      <SubHead label="District matrix" meta="NM = Raw + IF + FF + BS + ENV · President .60 · House .20, redistributed · BS shown in each House cell · click a cell for its races" />
      <TplMatrix
        years={years}
        rows={D_ROWS}
        selection={sel}
        onSelect={setSel}
        cellFor={(y, key) => {
          const nm = y.typeNMs[key];
          if (nm == null) return null;
          const bs = key === "H" ? bsByYear[y.year] : null;
          return { nm, share: y.redistributedWeights[key] ?? 0, note: bs != null && bs !== 0 ? `BS ${signed(bs, 1)}` : undefined };
        }}
      />

      <SubHead label={`Races behind the cell · ${title}`} meta={`${rows.length} row${rows.length === 1 ? "" : "s"} · Wt is the boundary weight for House rows`}
        right={<button type="button" onClick={() => setSel({ year: "all", type: "all" })} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>All {d.races.filter((r) => r.inAggregation).length} races</button>} />
      <RaceTable races={rows} variant="district" showYear onRow={onRace} onFormula={onFormula} />
      <TableCaption>Race names link to that election&apos;s results. Presidential rows show the nominees without WAR, because presidential WAR is a statewide number. Click a row for the step-by-step calculation.</TableCaption>

      <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="min-w-0">
          <SubHead label="District result" meta="TPL = Σ weight × WRS" />
          <table className="w-full border-collapse text-xs">
            <tbody>
              {weighted.map((y) => (
                <tr key={y.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className={TD}>{y.year}</td>
                  <td className={TD} style={{ color: "var(--app-text-muted)" }}>{y.finalWeight.toFixed(3).replace(/^0/, "")} ×</td>
                  <td className={TD_R}><M v={y.WRS} /></td>
                  <td className={TD_R}>{(y.finalWeight * y.WRS).toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                <td colSpan={3} className={`${TD} py-2 text-sm font-extrabold`}>{d.code} District TPL</td>
                <td className={`${TD_R} py-2 text-sm font-extrabold`}><M v={d.tpl} /></td>
              </tr>
              <tr>
                <td colSpan={3} className={TD} style={{ color: "var(--app-text-muted)" }}>− 435-district median {fmt2(medianDistrictTpl)} → Centered</td>
                <td className={`${TD_R} font-bold`}><M v={centered} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="min-w-0">
          <SubHead label="Reading the boundary strip" />
          <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            BS is the boundary-shift strip: how far the district a House race was actually run in leans from today&apos;s lines, added as points so the row reads as if it were run on the {d.eraStart} map. The same shift sets the row&apos;s weight, so a race on very different lines counts for little.
            {oldest && newest && oldest.year !== newest.year && <> Here the {oldest.year} race carries BS {signed(oldest.BS_pts, 1)} at weight {oldest.aggWeight.toFixed(2)}, against BS {signed(newest.BS_pts, 1)} at weight {newest.aggWeight.toFixed(2)} for {newest.year}.</>}
            {" "}Presidential rows are re-aggregated from precincts onto the {d.eraStart} lines, so they carry no BS.{" "}
            <Link href="/methodology/district-tpl" className="underline">How District TPL works ↗</Link>
          </p>
          <p className="mt-2 text-[11px]" style={VERY_MUTED}>State page: <Link href={`/model/states/${stateId}`} className="underline">{d.stateName}</Link></p>
        </div>
      </div>
    </div>
  );
}
