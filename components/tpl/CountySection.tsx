"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { RaceTable, TableCaption } from "./RaceTable";
import { ResultTable } from "./ResultTable";
import { TplOverTime } from "./TplOverTime";
import { MatrixStatus, TplMatrix, type MatrixSelection } from "./TplMatrix";
import { AdjustedModal, FormulaModal, RaceCalcModal, type FormulaKey } from "./TplModals";
import { MATRIX_ROWS, RACE_TYPE_LABELS, fmt1 } from "./format";
import type { CountyPageData, TplRace } from "./types";
import { AllRacesButton, ArrowOut } from "./ui";

// The TPL calculation on a county page (Historical → a county), in the same three parts as a
// State TPL page (TplStatePage.tsx): the year × office matrix, the races behind the selected
// cell, the result ledger, and TPL over time. A county has no State Legislature row; its House row is the
// county's district races added together, so it has no candidates, incumbent or money gap.

const COUNTY_ROWS = MATRIX_ROWS.filter((r) => r.key !== "L");
const TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3 };

export function CountySection({ data }: { data: CountyPageData }) {
  const years = data.yearAggregations;
  const [sel, setSel] = useState<MatrixSelection>({ year: "all", type: "all" });
  const [racesHidden, setRacesHidden] = useState(true);
  const [race, setRace] = useState<TplRace | null>(null);
  const [formula, setFormula] = useState<FormulaKey | null>(null);
  const [adjusted, setAdjusted] = useState(false);

  const rows = useMemo(() => data.races
    .filter((r) => (sel.year === "all" || r.year === sel.year) && (sel.type === "all" || r.raceType === sel.type))
    .sort((a, b) => b.year - a.year || TYPE_ORDER[a.raceType] - TYPE_ORDER[b.raceType] || a.race.localeCompare(b.race)), [data.races, sel]);
  const officeLabel = (t: string) => RACE_TYPE_LABELS[t as keyof typeof RACE_TYPE_LABELS];
  const title = sel.type === "all" && sel.year === "all" ? "All races" : sel.type === "all" ? `All ${sel.year} races` : sel.year === "all" ? `All ${officeLabel(sel.type)} races` : `${sel.year} · ${officeLabel(sel.type)}`;
  const selYear = sel.year !== "all" ? years.find((y) => y.year === sel.year) : undefined;
  const meta = [`${rows.length} row${rows.length === 1 ? "" : "s"}`,
    sel.type === "all" && selYear ? `margin ${fmt1(selYear.WRS + (selYear.env ?? 0))} · WRS ${fmt1(selYear.WRS)} after the environment` : null].filter(Boolean).join(" · ");
  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);
  const centered = data.tpl - data.medianStateTpl;

  return (
    <>
      <section id="tpl-matrix" className="scroll-mt-24">
        <LedgerSectionHead label="County TPL · neutralized margins by year and office" meta={<MatrixStatus selection={sel} offices={COUNTY_ROWS} onSelect={setSel} />} />
        <TplMatrix
          years={years}
          offices={COUNTY_ROWS}
          selection={sel}
          onSelect={setSel}
          cellFor={(y, key) => {
            const nm = y.typeNMs[key];
            if (nm == null) return null;
            const f = y.typeFactors?.[key] ?? 1;
            return { nm: nm + (y.env ?? 0), share: y.redistributedWeights[key] ?? 0, note: f < 0.999 ? `×${f.toFixed(2)}` : undefined };
          }}
        />
      </section>

      <section id="tpl-races" className="scroll-mt-24">
        <LedgerSectionHead label={`Races behind the cell · ${title}`} meta={meta}
          right={<AllRacesButton count={data.races.length} hidden={racesHidden} onToggle={() => { setRacesHidden((h) => !h); setSel({ year: "all", type: "all" }); }} />} />
        {!(racesHidden && sel.year === "all" && sel.type === "all") && <>
          <RaceTable races={rows} state={data.state} variant="state" showYear={sel.year === "all"} onRow={setRace} onFormula={setFormula} nomineeHeads={["Carried county", "Trailed"]} />
          <TableCaption>
            Click a row for the step-by-step calculation. Margins are the county&apos;s own; the nominees, incumbent and money are the statewide race&apos;s. A House row is every district race in the county added together.
          </TableCaption>
        </>}
      </section>

      <section id="tpl-result" className="scroll-mt-24">
        <LedgerSectionHead label="County result" meta="WRS = margin + ENV · TPL = Σ weight × WRS"
          right={<span className="flex items-center gap-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <Link href={`/model/${data.stateId}`} className="hover:underline" prefetch={false}>{data.stateName} State TPL ›</Link>
            <Link href="/analysis/internal-methodology/county-tpl" className="hidden hover:underline sm:inline" prefetch={false}>How County TPL works <ArrowOut /></Link>
          </span>} />
        <ResultTable years={weighted} tpl={data.tpl} label={`${data.name} TPL`} centered={centered} median={data.medianStateTpl} medianLabel="50-state median" onWeight={() => setFormula("YW")} onEnv={() => setFormula("ENV")} />
      </section>

      {data.tplOverTime.length > 1 && (
        <section id="tpl-over-time" className="scroll-mt-24">
          <LedgerSectionHead label="County TPL over time" meta="TPL as it stood after each election, under today's model" />
          <TplOverTime points={data.tplOverTime} name={data.name} />
        </section>
      )}

      {race && <RaceCalcModal race={race} E={data.E} incumbentAdvantage={data.incumbentAdvantage} onClose={() => setRace(null)} onFormula={setFormula} onAdjusted={() => setAdjusted(true)} />}
      {race && adjusted && <AdjustedModal race={race} onClose={() => setAdjusted(false)} />}
      {formula && <FormulaModal formula={formula} onClose={() => setFormula(null)} />}
    </>
  );
}
