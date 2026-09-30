"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { statesData } from "@/data/statesData";
import { useStaticJson } from "@/lib/useStaticJson";
import { DistrictDetail, DistrictTiles } from "./DistrictSection";
import { RaceTable, TableCaption } from "./RaceTable";
import { TplMatrix, type MatrixSelection } from "./TplMatrix";
import { AdjustedModal, BetaModal, FormulaModal, GLOSSARY, RaceCalcModal, type FormulaKey } from "./TplModals";
import { TplSubNav } from "./TplSubNav";
import { MATRIX_ROWS, OFFICE_LABELS, RACE_TYPE_LABELS, fmt1, fmt2, marginColor, ordinal } from "./format";
import type { DistrictPageData, StatePageData, TplRace } from "./types";
import { CandidateLink, Foot, M, StatRow, TD, TD_R, TH, TH_R, VERY_MUTED, WarChip } from "./ui";

// One state's page: hero, the year × office matrix with the races behind the selected cell,
// the result ledger, the District TPL section (its own matrix and table for the selected
// district), and the state's candidates with their WAR.

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
  const latest = useMemo(() => Math.max(...years.filter((y) => y.finalWeight > 0).map((y) => y.year)), [years]);
  const [sel, setSel] = useState<MatrixSelection>({ year: latest, type: "H" });
  const [race, setRace] = useState<TplRace | null>(null);
  const [formula, setFormula] = useState<FormulaKey | null>(null);
  const [adjusted, setAdjusted] = useState(false);
  const [betaOpen, setBetaOpen] = useState(false);
  const [glossary, setGlossary] = useState(false);

  // ── District section ─────────────────────────────────────────────────────
  const [districtId, setDistrictId] = useState<string>(initialDistrict?.id ?? data.districts[0]?.id ?? "");
  // /model/states/oh#oh-09 opens on that district (also where the old ?modelDistrict= links land).
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
    sel.type === "H" && selYear ? `averaged into ${fmt2(selYear.typeNMs.H)} with turnout × Huber weights` : null,
    sel.type === "all" && selYear ? `WRS ${fmt2(selYear.WRS)}` : null].filter(Boolean).join(" · ");

  const weighted = years.filter((y) => y.finalWeight > 0).sort((a, b) => b.year - a.year);
  const centered = data.tpl - data.medianStateTpl;
  const beta = data.beta?.shrunk ?? 1;
  const imputed = data.races.filter((r) => r.imputed).length;
  const districtById = useMemo(() => new Map(data.districts.map((d) => [d.code, d])), [data.districts]);
  const tint = data.tpl > 0 ? "var(--party-rep)" : "var(--party-dem)";
  const statewideNames = new Set(data.statewideWar.map((r) => r.candidate)).size;

  const nav = [["matrix", "Matrix"], ["races", "Races"], ["result", "Result"], ["districts", "Districts"], ["candidates", "Candidates"]];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${tint} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)` }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TplSubNav
            methodologyLabel="How State TPL works"
            right={
              <select aria-label="State" value={data.id} onChange={(e) => router.push(`/model/states/${e.target.value}`)} className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
                {[...statesData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.abbr} value={s.id}>{s.abbr} — {s.name}</option>)}
              </select>
            }
          />
          <div className="pb-6 pt-5">
            <div className="mb-3 flex gap-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
              <Link href="/model" className="hover:underline">TPL</Link><span>›</span><Link href="/model/states" className="hover:underline">States</Link><span>›</span><b style={{ color: "var(--app-text-primary)" }}>{data.name}</b>
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{data.abbr}</span>
                  <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>State TPL · election data {data.fitYears[0]}–{data.fitYears[data.fitYears.length - 1]}</span>
                </div>
                <h1 className="mt-2" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em" }}>{data.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  {data.races.length} races since {data.fitYears[0]}, each neutralized for incumbency, money and the year&apos;s environment, then averaged by office and year and recency-weighted. Environment and elasticity are fitted jointly across all 50 states.
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>True Partisan Lean</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, color: marginColor(data.tpl) }}>{fmt1(data.tpl)}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Centered <M v={centered} digits={1} bold /> vs. 50-state median {fmt1(data.medianStateTpl)} · {ordinal(data.rank)} most Republican</div>
              </div>
            </div>
            <StatRow items={[
              { value: <>{beta.toFixed(2)}<span className="ml-0.5 text-xs opacity-50">ⓘ</span></>, label: "Elasticity β*", onClick: () => setBetaOpen(true), title: "The elasticity derivation and the fitted E table" },
              { value: `${data.fitYears[0]}–${data.fitYears[data.fitYears.length - 1]}`, label: "Fit window" },
              { value: imputed, label: "Imputed ⊘", color: imputed ? undefined : "var(--app-text-very-muted)" },
              { value: data.races.length, label: "Races" },
              { value: data.districts.length, label: "Districts", href: "#districts" },
              { value: statewideNames, label: "Statewide candidates", href: "#candidates" },
            ]} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <div className="flex items-center gap-4 overflow-x-auto py-2.5 text-xs font-semibold" style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 hover:underline">{label}</a>)}
          <button type="button" onClick={() => setGlossary((v) => !v)} className="ml-auto shrink-0 font-medium hover:underline" aria-expanded={glossary}>Glossary {glossary ? "▴" : "▾"}</button>
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

        <section id="matrix" className="mt-8 scroll-mt-24">
          <LedgerSectionHead label="State TPL · neutralized margins by year and office" meta="NM = Adjusted + IF + FF + ENV · small print is the office's share of that year's WRS · click a cell for its races" />
          <TplMatrix
            years={years}
            rows={MATRIX_ROWS.map((r) => ({ ...r, weight: data.typeWeights[r.key] }))}
            selection={sel}
            onSelect={(s) => { setSel(s); }}
            cellFor={(y, key) => {
              const nm = y.typeNMs[key];
              if (nm == null) return null;
              const f = y.typeFactors?.[key] ?? 1;
              return { nm, share: y.redistributedWeights[key] ?? 0, note: f < 0.999 ? `×${f.toFixed(2)}` : undefined };
            }}
          />
        </section>

        <section id="races" className="mt-8 scroll-mt-24">
          <LedgerSectionHead label={`Races behind the cell · ${title}`} meta={meta}
            right={<button type="button" onClick={() => setSel({ year: "all", type: "all" })} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>All {data.races.length} races</button>} />
          <RaceTable races={rows} variant="state" showYear={sel.year === "all"} onRow={setRace} onFormula={setFormula}
            districtTpl={(code) => { const d = districtById.get(code); return d ? { tpl: d.tpl, href: `#${code.toLowerCase()}` } : null; }} />
          <TableCaption>
            Race names link to that election&apos;s results. Candidate names open their record in Candidates. District TPL scrolls to that district below. WAR is the candidate&apos;s Wins Above Replacement in that race; the winner is whoever the raw margin favors. Click a row for the step-by-step calculation; ↗ opens the strip&apos;s formula.
            {" "}E(y): {data.fitYears.filter((y) => y % 2 === 0).map((y) => `${y} ${fmt1(data.E[y])}`).join(" · ")}.
          </TableCaption>
        </section>

        <section id="result" className="mt-8 scroll-mt-24">
          <LedgerSectionHead label="State result" meta="TPL = Σ weight × WRS · centered on the 50-state median" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="min-w-0 overflow-x-auto"><table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                  <th className={TH}>Year</th><th className={TH_R}>Weight</th><th className={TH} /><th className={TH_R}>WRS</th><th className={TH} /><th className={TH_R}>Contribution</th>
                </tr>
              </thead>
              <tbody>
                {weighted.map((y) => (
                  <tr key={y.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={TD}>{y.year}</td>
                    <td className={TD_R}>{y.finalWeight.toFixed(3)}</td>
                    <td className={TD} style={{ color: "var(--app-text-muted)" }}>×</td>
                    <td className={TD_R}><M v={y.WRS} /></td>
                    <td className={TD} style={{ color: "var(--app-text-muted)" }}>=</td>
                    <td className={TD_R}>{(y.finalWeight * y.WRS).toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                  <td className={`${TD} py-2 text-sm font-extrabold`}>{data.name} TPL</td>
                  <td colSpan={4} className={`${TD} whitespace-normal`} style={{ color: "var(--app-text-muted)" }}>− median {fmt2(data.medianStateTpl)} → Centered <M v={centered} bold /></td>
                  <td className={`${TD_R} py-2 text-sm font-extrabold`}><M v={data.tpl} /></td>
                </tr>
              </tbody>
            </table></div>
            <p className="min-w-0 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              Year weights: recency decay {data.yearDecay.toFixed(2)} per year anchored to 2026, scaled by each year&apos;s type-weight coverage, then normalized. A year with no {data.name} race gets weight 0. Centering subtracts the median of all 50 state TPLs so states compare on one scale.{" "}
              <Link href="/methodology/state-tpl" className="underline">Full method ↗</Link>
            </p>
          </div>
        </section>

        <section id="districts" className="mt-10 scroll-mt-24">
          <LedgerSectionHead label={`District TPL · ${data.name}'s ${data.districts.length} district${data.districts.length === 1 ? "" : "s"}`} meta={`2026 lines · 435-district median ${fmt1(data.medianDistrictTpl)} · pick a district`}
            right={<Link href="/model#districts" className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>District map ›</Link>} />
          <DistrictTiles districts={data.districts} selected={districtId} onSelect={selectDistrict} />
          {district ? (
            <DistrictDetail d={district} stateId={data.id} medianDistrictTpl={data.medianDistrictTpl} onRace={setRace} onFormula={setFormula} />
          ) : (
            <div className="py-8 text-center text-xs" style={{ color: "var(--app-text-muted)" }}>{districtSlice.failed ? "This district's calculation could not be loaded." : "Loading…"}</div>
          )}
        </section>

        <section id="candidates" className="mt-10 scroll-mt-24">
          <LedgerSectionHead label={`${data.name} candidates`} meta="statewide races · Wins Above Replacement · click a name for the record"
            right={<Link href={`/model/candidates?state=${data.abbr}`} className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>All {data.name} races in Candidates ›</Link>} />
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                  <th className={TH}>Candidate</th><th className={TH}>Race</th><th className={TH}>Year</th><th className={TH_R}>Actual</th><th className={`${TH_R} hidden sm:table-cell`}>Expected</th><th className={`${TH_R} hidden sm:table-cell`}>vs Opp</th><th className={`${TH_R} hidden md:table-cell`}>Effect</th><th className={TH_R}>WAR</th>
                </tr>
              </thead>
              <tbody>
                {data.statewideWar.slice(0, 14).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={TD}><CandidateLink name={r.candidate} party={r.party} /></td>
                    <td className={TD}>{r.pastHref ? <Link href={r.pastHref} className="underline decoration-dotted underline-offset-4" style={{ textDecorationColor: "var(--app-border)" }}>{OFFICE_LABELS[r.office]}{r.race.includes("Special") ? " special" : ""}</Link> : OFFICE_LABELS[r.office]}</td>
                    <td className={TD}>{r.year}</td>
                    <td className={TD_R}><M v={r.actual} digits={1} /></td>
                    <td className={`${TD_R} hidden sm:table-cell`}><M v={r.expected} digits={1} /></td>
                    <td className={`${TD_R} hidden sm:table-cell`}><M v={r.vsOpp} digits={1} /></td>
                    <td className={`${TD_R} hidden md:table-cell`}>{r.effect > 0 ? "+" : ""}{r.effect.toFixed(1)} <span style={VERY_MUTED}>n={r.effectN}</span></td>
                    <td className={TD_R}><WarChip war={r.war} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot>{data.statewideWar.length} statewide candidate-performances since {data.fitYears[0]}, newest first{data.statewideWar.length > 14 ? `; showing 14` : ""}. Expected is generic vs generic: the seat&apos;s lean + β* × E(year) + incumbency + structural money. vs Opp removes the specific opponent&apos;s own effect. WAR = Actual − vs Opp, signed toward the candidate.</Foot>
        </section>
      </main>

      {race && <RaceCalcModal race={race} beta={beta} E={data.E} incumbentAdvantage={data.incumbentAdvantage} onClose={() => setRace(null)} onFormula={setFormula} onAdjusted={() => setAdjusted(true)} />}
      {race && adjusted && <AdjustedModal race={race} onClose={() => setAdjusted(false)} />}
      {formula && <FormulaModal formula={formula} onClose={() => setFormula(null)} />}
      {betaOpen && <BetaModal stateName={data.name} abbr={data.abbr} beta={data.beta} E={data.E} years={data.fitYears} onClose={() => setBetaOpen(false)} />}
    </div>
  );
}
