"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { normalizeDistrictKey } from "@/lib/stateLegDistrictKey";
import { RaceTable, TableCaption } from "./RaceTable";
import { ResultTable } from "./ResultTable";
import { TplOverTime } from "./TplOverTime";
import { MatrixStatus, TplMatrix, type MatrixSelection } from "./TplMatrix";
import { AdjustedModal, FormulaModal, RaceCalcModal, type FormulaKey } from "./TplModals";
import { fmt1 } from "./format";
import { LEG_ROW_DEFAULTS, type RaceType, type StateLegTplPageData, type TplRace } from "./types";
import { AllRacesButton } from "./ui";

// The legislative-district TPL on a state-legislative district view, in the County TPL section's three
// parts (CountySection.tsx): the year × office matrix with the races behind the selected cell, the result
// ledger, and TPL over time. Its data is one small file per district (lib/stateLegTplPage.ts), fetched
// when the view opens. Separate from the frozen 2026 lean shown in the Forecast Calculation above.

const TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };

export default function StateLegTplSection({ abbr, chamber, districtKey, label }: { abbr: string; chamber: "house" | "senate"; districtKey: string; label: string }) {
  const url = `/state-leg-tpl/${chamber}/${abbr.toUpperCase()}/${normalizeDistrictKey(districtKey)}.json`;
  // The loaded file, keyed by its URL: switching districts shows "Loading…" until the new one arrives.
  const [loaded, setLoaded] = useState<{ url: string; data: StateLegTplPageData | "missing" } | null>(null);
  const data = loaded?.url === url ? loaded.data : null;
  const [sel, setSel] = useState<MatrixSelection>({ year: "all", type: "all" });
  const [racesHidden, setRacesHidden] = useState(true);
  const [race, setRace] = useState<TplRace | null>(null);
  const [formula, setFormula] = useState<FormulaKey | null>(null);
  const [adjusted, setAdjusted] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then((d) => { if (live) setLoaded({ url, data: d }); })
      .catch(() => { if (live) setLoaded({ url, data: "missing" }); });
    return () => { live = false; };
  }, [url]);

  const chamberWord = chamber === "house" ? "State House" : "State Senate";
  const offices: { key: RaceType; label: string; short: string }[] = [
    { key: "P", label: "President", short: "Pres." }, { key: "H", label: "U.S. House", short: "U.S. H." }, { key: "S", label: "U.S. Senate", short: "U.S. S." },
    { key: "L", label: chamberWord, short: chamber === "house" ? "St. H." : "St. S." }, { key: "G", label: "Governor", short: "Gov." },
  ];
  const officeLabel = (t: string) => offices.find((o) => o.key === t)?.label ?? t;

  // Rows as the race table expects them: the file's left-out defaults restored, and the coverage and round
  // carried in the race's name ("U.S. House · 82% contested").
  const races = useMemo<TplRace[]>(() => {
    if (!data || data === "missing") return [];
    return data.races.map((r) => {
      const name = r.raceType === "S" ? (r.race === "Senate Special" ? "U.S. Senate (special)" : "U.S. Senate") : r.race;
      const extras = [r.coverage != null && r.coverage > 0 ? `${Math.round(r.coverage * 100)}% contested` : null, r.note].filter(Boolean);
      return Object.assign({ BS_pts: null, boundaryShift: null, ffDetail: null, demWar: null, repWar: null, imputedSourceYear: null, imputedSourceDesc: null }, LEG_ROW_DEFAULTS, r,
        { race: extras.length ? `${name} · ${extras.join(" · ")}` : name }) as TplRace;
    });
  }, [data]);

  if (data === "missing") return null;
  if (data == null) {
    return (
      <section className="scroll-mt-24">
        <LedgerSectionHead label="District TPL" />
        <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
      </section>
    );
  }

  const years = data.yearAggregations;
  const rows = races
    .filter((r) => (sel.year === "all" || r.year === sel.year) && (sel.type === "all" || r.raceType === sel.type))
    .sort((a, b) => b.year - a.year || TYPE_ORDER[a.raceType] - TYPE_ORDER[b.raceType] || a.race.localeCompare(b.race));
  const title = sel.type === "all" && sel.year === "all" ? "All races" : sel.type === "all" ? `All ${sel.year} races` : sel.year === "all" ? `All ${officeLabel(sel.type)} races` : `${sel.year} · ${officeLabel(sel.type)}`;
  const selYear = sel.year !== "all" ? years.find((y) => y.year === sel.year) : undefined;
  const meta = [`${rows.length} row${rows.length === 1 ? "" : "s"}`,
    sel.type === "all" && selYear ? `margin ${fmt1(selYear.WRS + (selYear.env ?? 0))} · WRS ${fmt1(selYear.WRS)} after the environment` : null].filter(Boolean).join(" · ");
  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);

  return (
    <>
      <section id="tpl-matrix" className="scroll-mt-24">
        <LedgerSectionHead label="District TPL · neutralized margins by year and office" meta={<MatrixStatus selection={sel} offices={offices} onSelect={setSel} />} />
        <TplMatrix
          years={years}
          offices={offices}
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
          right={<AllRacesButton count={races.length} hidden={racesHidden} onToggle={() => { setRacesHidden((h) => !h); setSel({ year: "all", type: "all" }); }} />} />
        {!(racesHidden && sel.year === "all" && sel.type === "all") && <>
          <RaceTable races={rows} state={data.state} variant="state" showYear={sel.year === "all"} onRow={setRace} onFormula={setFormula} nomineeHeads={["Carried district", "Trailed"]} />
          <TableCaption>
            Click a row for the step-by-step calculation. Every margin is this district&apos;s own, on today&apos;s lines, summed from precinct returns. The nominees, incumbent and money of a Senate or governor row are the statewide race&apos;s. A U.S. House row has no candidate terms; a {chamberWord} row takes out the incumbency and money of the seats its votes came from. Where only part of the district had a Democrat against a Republican (&ldquo;% contested&rdquo;), the rest is filled in from that part&apos;s own presidential result.
          </TableCaption>
        </>}
      </section>

      <section id="tpl-result" className="scroll-mt-24">
        <LedgerSectionHead label="District result" meta="WRS = margin + ENV · TPL = Σ weight × WRS"
          right={<span className="flex items-center gap-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <Link href={`/model/${data.stateId}`} className="hover:underline" prefetch={false}>{data.stateName} State TPL ›</Link>
          </span>} />
        <ResultTable years={weighted} tpl={data.tpl} label={`${label} TPL`} centered={data.tpl - data.stateTpl} median={data.stateTpl} medianLabel={`${data.stateName} State TPL`} onWeight={() => setFormula("YW")} onEnv={() => setFormula("ENV")} />
      </section>

      {data.tplOverTime.length > 1 && (
        <section id="tpl-over-time" className="scroll-mt-24">
          <LedgerSectionHead label="District TPL over time" meta="TPL as it stood after each election, under today's model" />
          <TplOverTime points={data.tplOverTime} name={label} />
        </section>
      )}

      {race && <RaceCalcModal race={race} E={data.E} incumbentAdvantage={data.incumbentAdvantage} onClose={() => setRace(null)} onFormula={setFormula} onAdjusted={() => setAdjusted(true)} />}
      {race && adjusted && <AdjustedModal race={race} onClose={() => setAdjusted(false)} />}
      {formula && <FormulaModal formula={formula} onClose={() => setFormula(null)} />}
    </>
  );
}
