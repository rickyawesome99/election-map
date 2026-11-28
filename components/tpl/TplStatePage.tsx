"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { statesData } from "@/data/statesData";
import { useStaticJson } from "@/lib/useStaticJson";
import { DistrictDetail, DistrictTiles } from "./DistrictSection";
import { RaceTable, TableCaption } from "./RaceTable";
import { ResultTable } from "./ResultTable";
import { TplOverTime } from "./TplOverTime";
import { MatrixStatus, TplMatrix, type MatrixSelection } from "./TplMatrix";
import { AdjustedModal, FormulaModal, GLOSSARY, RaceCalcModal, TrendModal, type FormulaKey } from "./TplModals";
import { SeatCrumbs } from "@/components/SeatBreadcrumb";
import { MATRIX_ROWS, RACE_TYPE_LABELS, fmt1, marginColor, ordinal, stateHref } from "./format";
import type { DistrictPageData, StatePageData, TplRace } from "./types";
import { AllRacesButton, ArrowOut, M, Fact, Fig, VERY_MUTED } from "./ui";
import { PAGE_CONTAINER, heroTint } from "@/lib/pageLayout";
import { startPendingNav } from "@/lib/navPending";
import { useDesktopPointer } from "@/lib/useDesktopPointer";
import StateCountyMap from "@/components/StateCountyMap";
import { MapLegend } from "./TplMaps";

// One state's page: hero, the year × office matrix with the races behind the selected cell,
// the result ledger, the District TPL section (its own matrix and table for the selected
// district), and the state's County TPL map.

const TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };

/** Keeps the last loaded value so a selection change never renders an empty section. */

function useLatest<T>(value: T | null, fallback: T | null): T | null {
  const [last, setLast] = useState<T | null>(fallback);
  if (value && value !== last) setLast(value);
  return value ?? last;
}

export function TplStatePage({ data, initialDistrict }: { data: StatePageData; initialDistrict: DistrictPageData | null }) {
  const router = useRouter();
  const years = data.yearAggregations;
  // Opens on every race, so nothing in the matrix is dimmed until the reader picks something.
  const [sel, setSel] = useState<MatrixSelection>({ year: "all", type: "all" });
  const [racesHidden, setRacesHidden] = useState(true);
  const [race, setRace] = useState<TplRace | null>(null);
  const [formula, setFormula] = useState<FormulaKey | null>(null);
  const [adjusted, setAdjusted] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);

  // ── District section ─────────────────────────────────────────────────────
  const [districtId, setDistrictId] = useState<string>(initialDistrict?.id ?? data.districts[0]?.id ?? "");
  // /model/oh#oh-09 opens on that district (also where the old ?modelDistrict= links land).
  useEffect(() => {
    const code = window.location.hash.replace("#", "").toLowerCase();
    const d = data.districts.find((x) => x.code.toLowerCase() === code);
    if (!d) return;
    // One-time sync from the URL after mount; the hash is not available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDistrictId(d.id);
    window.setTimeout(() => document.getElementById("districts")?.scrollIntoView({ block: "start" }), 50);
  }, [data.districts]);
  const districtSlice = useStaticJson<DistrictPageData>(
    districtId ? `/api/model/district/${districtId}` : null,
    useMemo(() => (initialDistrict ? { url: `/api/model/district/${initialDistrict.id}`, data: initialDistrict } : null), [initialDistrict]),
  );
  const district = useLatest(districtSlice.data, initialDistrict);
  const selectDistrict = (id: string) => {
    setDistrictId(id);
    const code = data.districts.find((d) => d.id === id)?.code.toLowerCase();
    if (code) window.history.replaceState(null, "", `#${code}`);
  };

  // ── State matrix and races ───────────────────────────────────────────────
  const rows = useMemo(() => data.races
    .filter((r) => (sel.year === "all" || r.year === sel.year) && (sel.type === "all" || r.raceType === sel.type))
    .sort((a, b) => b.year - a.year || TYPE_ORDER[a.raceType] - TYPE_ORDER[b.raceType] || a.race.localeCompare(b.race, undefined, { numeric: true })), [data.races, sel]);
  const title = sel.type === "all" && sel.year === "all" ? "All races" : sel.type === "all" ? `All ${sel.year} races` : sel.year === "all" ? `All ${RACE_TYPE_LABELS[sel.type as keyof typeof RACE_TYPE_LABELS]} races` : `${sel.year} · ${RACE_TYPE_LABELS[sel.type as keyof typeof RACE_TYPE_LABELS]}`;
  const selYear = sel.year !== "all" ? years.find((y) => y.year === sel.year) : undefined;
  const meta = [`${rows.length} row${rows.length === 1 ? "" : "s"}`,
    sel.type === "H" && selYear && selYear.typeNMs.H != null ? `averaged into ${fmt1(selYear.typeNMs.H + (selYear.env ?? 0))} by votes cast` : null,
    sel.type === "all" && selYear ? `margin ${fmt1(selYear.WRS + (selYear.env ?? 0))} · WRS ${fmt1(selYear.WRS)} after the environment` : null].filter(Boolean).join(" · ");

  // ── County map ───────────────────────────────────────────────────────────
  // As on the state page: a mouse click opens the county's page (hover already shows its lean);
  // a tap selects it and shows the card with the link.
  const desktop = useDesktopPointer();
  const openPage = (href: string) => { startPendingNav(href); router.push(href); };
  const countyCount = Object.values(data.countyTpl).filter((v) => v != null).length;
  const countyNoun = data.abbr === "LA" ? "parishes" : data.abbr === "AK" ? "boroughs and census areas" : "counties";

  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);
  const centered = data.tpl - data.medianStateTpl;
  const imputed = data.races.filter((r) => r.imputed).length;
  const tint = data.tpl > 0 ? "var(--party-rep)" : "var(--party-dem)";
  // Rank from the state's own side: 1st most Republican, or counted up from the D end.
  const sideRank = data.tpl > 0 ? { n: data.rank, side: "Republican" } : { n: 51 - data.rank, side: "Democratic" };
  // The picker's states in alphabetical order; the arrows step through them and wrap at the ends.
  const sortedStates = useMemo(() => [...statesData].sort((a, b) => a.name.localeCompare(b.name)), []);
  const at = sortedStates.findIndex((s) => s.id === data.id);
  const prevState = sortedStates[(at - 1 + sortedStates.length) % sortedStates.length];
  const nextState = sortedStates[(at + 1) % sortedStates.length];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: heroTint(tint) }}>
        <div className={PAGE_CONTAINER}>
          {/* Seat-style context bar, as on the past election pages: crumbs left, the state
              picker and methodology link right, closed by a heavy rule. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 pt-3 pb-2" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
            <SeatCrumbs crumbs={[{ label: "TPL", href: "/model" }, { label: data.name }]} />
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
              <div className="flex items-center gap-1">
              <StepLink href={stateHref(prevState.id)} label={`Previous state: ${prevState.name}`} dir="prev" />
              <select aria-label="State" value={data.id} onChange={(e) => { const href = stateHref(e.target.value); startPendingNav(href); router.push(href); }} className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
                {sortedStates.map((s) => <option key={s.abbr} value={s.id}>{s.abbr} — {s.name}</option>)}
              </select>
              <StepLink href={stateHref(nextState.id)} label={`Next state: ${nextState.name}`} dir="next" />
              </div>
              <Link href="/analysis/internal-methodology/state-tpl" className="hidden whitespace-nowrap hover:underline sm:inline" prefetch={false}>How State TPL works <ArrowOut /></Link>
            </div>
          </div>
          <div className="pb-3 pt-5">
            {/* Two rows from sm up: name | TPL figure on the bottom edge, then the Centered line
                under the figure. Stacked in source order on phones. */}
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em" }}>{data.name}</h1>
              <div className="mt-5 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>True Partisan Lean</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, color: marginColor(data.tpl) }}>{fmt1(data.tpl)}</div>
              </div>
              <div className="mt-1 self-baseline text-xs sm:col-start-2 sm:row-start-2 sm:mt-2 sm:text-right" style={{ color: "var(--app-text-muted)" }}>Centered <M v={centered} digits={1} bold /> vs. 50-State Median</div>
            </div>
            {/* The page's facts as one compact line: small labels beside their figures. */}
            <dl className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
              <Fact label="Trend 2020→24" title={`${data.name}'s 2020 to 2024 presidential shift beyond the national environment's${data.trend?.prior != null ? ` (2016 to 2020: ${fmt1(data.trend.prior)})` : ""}. Click for the calculation. A companion to TPL, not part of it.`}>
                {data.trend ? <button type="button" onClick={() => setTrendOpen(true)} className="underline decoration-dotted underline-offset-4"><Fig><M v={data.trend.last} digits={1} bold /></Fig></button> : <span style={VERY_MUTED}>—</span>}
              </Fact>
              <Fact label="Since 2024" title={data.since24 != null ? `Under today's model, ${data.name} read ${fmt1(data.tpl - data.since24)} after the 2024 election and reads ${fmt1(data.tpl)} now: what 2025 and 2026 added, with the national environment removed.` : undefined}>
                {data.since24 != null ? <Fig><M v={data.since24} digits={1} bold /></Fig> : <span style={VERY_MUTED}>—</span>}
              </Fact>
              <Fact label="Rank"><Fig color={tint}>{ordinal(sideRank.n)}</Fig> most {sideRank.side}</Fact>
              <Fact label="Races"><Fig>{data.races.length}</Fig>{imputed > 0 && <span style={{ color: "var(--app-text-muted)" }}> · {imputed} imputed ⊘</span>}</Fact>
            </dl>
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} pb-14`}>
        <div className="flex items-center gap-4 overflow-x-auto py-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
          <button type="button" onClick={() => setGlossary((v) => !v)} className="shrink-0 font-medium hover:underline" aria-expanded={glossary}>Glossary {glossary ? "▴" : "▾"}</button>
        </div>
        {glossary && (
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2" style={{ borderBottom: "1px solid var(--app-border)", paddingBottom: 12 }}>
            {GLOSSARY.map((g) => (
              <div key={g.abbr} className="grid gap-2" style={{ gridTemplateColumns: "6.5rem 1fr" }}>
                <dt className="font-bold" style={{ color: "var(--app-text-primary)" }}>{g.abbr}<span className="block text-[10px] font-medium" style={VERY_MUTED}>{g.term}</span></dt>
                <dd style={{ color: "var(--app-text-muted)" }}>{g.desc}</dd>
              </div>
            ))}
          </dl>
        )}

        <section id="matrix" className="mt-5 scroll-mt-24">
          <LedgerSectionHead label="State TPL · neutralized margins by year and office" meta={<MatrixStatus selection={sel} offices={MATRIX_ROWS} onSelect={setSel} />} />
          <TplMatrix
            years={years}
            offices={MATRIX_ROWS}
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

        <section id="races" className="mt-8 scroll-mt-24">
          <LedgerSectionHead label={`Races behind the cell · ${title}`} meta={meta}
            right={<AllRacesButton count={data.races.length} hidden={racesHidden} onToggle={() => { setRacesHidden((h) => !h); setSel({ year: "all", type: "all" }); }} />} />
          {!(racesHidden && sel.year === "all" && sel.type === "all") && <>
            <RaceTable races={rows} state={data.abbr} variant="state" showYear={sel.year === "all"} onRow={setRace} onFormula={setFormula} />
            <TableCaption>
              Click a row for the step-by-step calculation.
            </TableCaption>
          </>}
        </section>

        <section id="result" className="mt-10 scroll-mt-24">
          <LedgerSectionHead label="State result" meta="WRS = margin + ENV · TPL = Σ weight × WRS"
            right={<Link href="/analysis/internal-methodology/state-tpl" className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }} prefetch={false}>Full method <ArrowOut /></Link>} />
          <ResultTable years={weighted} tpl={data.tpl} label={`${data.name} TPL`} centered={centered} median={data.medianStateTpl} medianLabel="50-state median" onWeight={() => setFormula("YW")} onEnv={() => setFormula("ENV")} />
        </section>

        {data.tplOverTime.length > 1 && (
          <section id="over-time" className="mt-10 scroll-mt-24">
            <LedgerSectionHead label="TPL over time" meta="TPL as it stood after each election, under today's model" />
            <TplOverTime points={data.tplOverTime} name={data.name} />
          </section>
        )}

        <section id="districts" className="mt-10 scroll-mt-24">
          <LedgerSectionHead label={`District TPL · ${data.name}'s ${data.districts.length} district${data.districts.length === 1 ? "" : "s"}`} meta={`2026 lines · 435-district median ${fmt1(data.medianDistrictTpl)} · pick a district`}
            right={<Link href="/model#districts" className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>District map ›</Link>} />
          <DistrictTiles districts={data.districts} selected={districtId} onSelect={selectDistrict} />
          {district ? (
            <DistrictDetail d={district} medianDistrictTpl={data.medianDistrictTpl} onRace={setRace} onFormula={setFormula} />
          ) : (
            <div className="py-8 text-center text-xs" style={{ color: "var(--app-text-muted)" }}>{districtSlice.failed ? "This district's calculation could not be loaded." : "Loading…"}</div>
          )}
        </section>

        {countyCount > 0 && (
          <section id="counties" className="mt-10 scroll-mt-24">
            <LedgerSectionHead label={`County TPL · ${data.name}'s ${countyCount} ${countyNoun}`} meta={desktop ? "click a county to open its page" : "tap a county for its lean"} right={<MapLegend />} />
            <StateCountyMap stateAbbr={data.abbr} stateName={data.name} showTpl figureHover showLabel={false} countyTpl={data.countyTpl} countyVotes={data.countyVotes} height="clamp(300px, 60vw, 520px)" onOpen={desktop ? openPage : undefined} pinTaps={!desktop} />
          </section>
        )}
      </main>

      {race && <RaceCalcModal race={race} E={data.E} incumbentAdvantage={data.incumbentAdvantage} onClose={() => setRace(null)} onFormula={setFormula} onAdjusted={() => setAdjusted(true)} />}
      {race && adjusted && <AdjustedModal race={race} onClose={() => setAdjusted(false)} />}
      {formula && <FormulaModal formula={formula} onClose={() => setFormula(null)} />}
      {trendOpen && data.trend && <TrendModal name={data.name} trend={data.trend} onClose={() => setTrendOpen(false)} />}
    </div>
  );
}

/** A round arrow beside the state picker, to the previous or next state alphabetically. */
function StepLink({ href, label, dir }: { href: string; label: string; dir: "prev" | "next" }) {
  return (
    <Link href={href} prefetch={false} aria-label={label} title={label}
      className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_10%,transparent)]"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d={dir === "prev" ? "M6.5 1.5 3 5l3.5 3.5" : "M3.5 1.5 7 5 3.5 8.5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Link>
  );
}
