"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getRaceColor } from "@/lib/colorScale";
import { RaceTable, TableCaption } from "./RaceTable";
import { ResultTable } from "./ResultTable";
import { MatrixStatus, TplMatrix, type MatrixSelection } from "./TplMatrix";
import type { FormulaKey } from "./TplModals";
import { fmt1, marginColor, signed } from "./format";
import type { DistrictPageData, TplRace } from "./types";
import { AllRacesButton, ArrowOut, CandidateLink, Fact, Fig, M, SubHead } from "./ui";

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

const D_ROWS = [{ key: "P", label: "President", short: "Pres." }, { key: "H", label: "House", short: "House" }];

export function DistrictDetail({ d, medianDistrictTpl, onRace, onFormula }: {
  d: DistrictPageData; medianDistrictTpl: number; onRace: (r: TplRace) => void; onFormula: (k: FormulaKey) => void;
}) {
  const [sel, setSel] = useState<MatrixSelection>({ year: "all", type: "all" });
  const [racesHidden, setRacesHidden] = useState(false);
  // A different district resets the selection to every race.
  const [forId, setForId] = useState(d.id);
  if (forId !== d.id) { setForId(d.id); setSel({ year: "all", type: "all" }); }

  const bsByYear = useMemo(() => Object.fromEntries(d.races.filter((r) => r.raceType === "H").map((r) => [r.year, r.BS_pts])), [d]);
  const years = d.yearAggregations;
  const rows = useMemo(() => d.races
    .filter((r) => r.inAggregation && (sel.year === "all" || r.year === sel.year) && (sel.type === "all" || r.raceType === sel.type))
    .sort((a, b) => b.year - a.year || a.raceType.localeCompare(b.raceType)), [d, sel]);
  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);
  const centered = d.tpl - medianDistrictTpl;
  const vsState = d.tpl - d.stateTpl;
  const title = sel.type === "all" && sel.year === "all" ? "All races" : sel.type === "all" ? `${sel.year} · both offices` : sel.year === "all" ? (sel.type === "H" ? "All House races" : "All presidential results") : `${sel.year} · ${sel.type === "H" ? `House ${d.code}` : "President on 2026 lines"}`;

  return (
    <div>
      {/* The district's name with its TPL beside it, then a facts line styled like the state hero's. */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{d.code} · District TPL · {d.eraStart} lines</div>
        <div className="flex gap-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
          <Link href={d.seatHref} className="hover:underline">Seat page ›</Link>
          <Link href={`/model#districts`} className="hover:underline">District map ›</Link>
        </div>
      </div>
      <h3 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.5rem, 3.5vw, 2rem)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
        {d.name} <span className="tabular-nums" style={{ color: marginColor(d.tpl) }}>{fmt1(d.tpl)}</span>
      </h3>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-xs">
      <dl className="contents">
        <Fact label="Centered" title={`${d.name} against the 435-district median of ${fmt1(medianDistrictTpl)}`}><Fig size="sm"><M v={centered} digits={1} bold /></Fig></Fact>
        <Fact label="vs. State" title={`${d.name} against ${d.state}'s TPL of ${fmt1(d.stateTpl)}`}><Fig size="sm"><M v={vsState} digits={1} bold /></Fig></Fact>
        {d.since24 != null && <Fact label="Since 2024" title={`Under today's model the district read ${fmt1(d.tpl - d.since24)} after the 2024 election: what 2026 added, with the national environment removed.`}><Fig size="sm"><M v={d.since24} digits={1} bold /></Fig></Fact>}
        {d.trend && <Fact label="Trend 2020→24" title="The district's 2020 to 2024 presidential shift on today's lines, minus the change in the national environment TPL removes (every state counting equally, not the popular vote). A companion to TPL, not part of it."><Fig size="sm"><M v={d.trend.last} digits={1} bold /></Fig></Fact>}
        {d.incumbent && <Fact label="Incumbent"><CandidateLink name={d.incumbent.name} state={d.state} party={d.incumbent.party} tint /></Fact>}
      </dl>
      </div>

      <SubHead top="mt-6" label="District matrix" meta={<MatrixStatus selection={sel} offices={D_ROWS} onSelect={setSel} />} />
      <TplMatrix
        years={years}
        offices={D_ROWS}
        selection={sel}
        onSelect={setSel}
        cellFor={(y, key) => {
          const nm = y.typeNMs[key];
          if (nm == null) return null;
          const bs = key === "H" ? bsByYear[y.year] : null;
          return { nm, share: y.redistributedWeights[key] ?? 0, note: bs != null && bs !== 0 ? `BS ${signed(bs, 1)}` : undefined };
        }}
      />

      <SubHead top="mt-10" strong label={`Races behind the cell · ${title}`} meta={`${rows.length} row${rows.length === 1 ? "" : "s"} · every row has WT 1`}
        right={<AllRacesButton count={d.races.filter((r) => r.inAggregation).length} hidden={racesHidden} onToggle={() => { setRacesHidden((h) => !h); setSel({ year: "all", type: "all" }); }} />} />
      {!(racesHidden && sel.year === "all" && sel.type === "all") && <>
        <RaceTable races={rows} state={d.state} variant="district" showYear onRow={onRace} onFormula={onFormula} />
        <TableCaption>Click a row for the step-by-step calculation.</TableCaption>
      </>}

      <SubHead top="mt-10" label="District result" meta="TPL = Σ weight × WRS"
        right={<Link href="/analysis/internal-methodology/district-tpl" className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }} prefetch={false}>How District TPL works <ArrowOut /></Link>} />
      <ResultTable years={weighted} tpl={d.tpl} label={`${d.code} District TPL`} centered={centered} median={medianDistrictTpl} medianLabel="435-district median" onWeight={() => onFormula("YW")} />
    </div>
  );
}
