"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Chamber } from "@/data/stateLegDistricts";
import type { ForecastedRace } from "@/lib/forecast";
import type { BallotHoldover, BallotRace, ChamberBlock, HouseRow, StatePageData, TurnoutStat } from "@/lib/statePage";
import { chamberDistrictHref } from "@/lib/statePageLinks";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import CandidateLink from "@/components/CandidateLink";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";
import StateVoteHistoryChart from "@/components/StateVoteHistoryChart";
import { ResultCard } from "@/components/StatewideVoteHistoryPanel";
import { SeatBar } from "@/components/atlas/ChamberSummary";
import StateLayerMap, { chamberOfLayer, layerYears, type MapLayer } from "./StateLayerMap";
import StateCountiesSection, { TPL_LAYER } from "./StateCountiesSection";

const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
// Never "Even": the forecast always leans one way (margin <= 0 is D, as everywhere on the site), so a
// rounded-to-zero margin reads D+0.0 or R+0.0.
const fmtMargin = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const marginColor = (m: number) => (m <= 0 ? "var(--party-dem)" : "var(--party-rep)");
const partyColor = (p: string) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : "var(--party-ind)");
const partyWord = (p: string) => (p === "D" ? "Dem" : p === "R" ? "Rep" : "Ind");

function SectionHead({ id, title, right, children }: { id?: string; title: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5 sm:gap-3 pb-3 mb-1 scroll-mt-20" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3">
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{title}</h2>
        {children && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{children}</span>}
      </div>
      {right && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{right}</div>}
    </div>
  );
}

function SubHead({ id, children, right }: { id?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div id={id} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pt-6 pb-2 mb-1 scroll-mt-20" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
      <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{children}</span>
      {right && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{right}</span>}
    </div>
  );
}

function RatingPill({ rating }: { rating: string }) {
  const { bg, text } = getRatingColors(rating);
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-center shrink-0 w-[4.1rem]" style={{ background: bg, color: text }}>{rating}</span>;
}

function TurnoutRow({ stats }: { stats: TurnoutStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{s.label}</div>
          <div className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--app-text-primary)" }}>
            {(s.votes / 1e6).toFixed(2)}M ballots
          </div>
          <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            {s.rate != null ? `${s.rate.toFixed(1)}% of citizen adults · ` : ""}{s.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A statewide race on this year's ballot: both nominees and the projected margin. */
function RaceRow({ race }: { race: BallotRace }) {
  return (
    <div className="relative py-5 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <a href={race.href} aria-label={`View ${race.label} race`} className="absolute inset-0" />
      <div className="relative pointer-events-none flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>{race.label}</div>
          {race.dem && race.rep ? (
            <div className="flex flex-col gap-0.5">
              {[race.dem, race.rep].map((c) => (
                <div key={c.party + c.name} className="flex items-baseline gap-2 min-w-0">
                  <CandidateLink name={c.name} className="relative pointer-events-auto truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: partyColor(c.party) }}>
                    {c.name}
                  </CandidateLink>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>({c.party}{c.incumbent ? ", inc." : ""})</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular-nums font-extrabold" style={{ fontSize: "1.75rem", lineHeight: 1, color: marginColor(race.margin) }}>{fmtMargin(race.margin)}</div>
          <div className="text-xs font-bold mt-1.5" style={{ color: "var(--app-text-muted)" }}>{race.rating}</div>
        </div>
      </div>
    </div>
  );
}

/** A seat with no election this year: who holds it and when it is next up. */
function HoldoverRow({ seat }: { seat: BallotHoldover }) {
  return (
    <a href={seat.href} className="block py-5 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>{seat.label}</div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: partyColor(seat.party) }}>{seat.name}</span>
            <span className="text-xs font-semibold shrink-0" style={{ color: "var(--app-text-muted)" }}>({partyWord(seat.party)})</span>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
          <div className="italic">No election</div>
          <div className="mt-0.5">Next: {seat.nextElection}</div>
        </div>
      </div>
    </a>
  );
}

/** Both Senate seats sitting the year out, on one line. */
function SenateHoldoverLine({ seats }: { seats: BallotHoldover[] }) {
  return (
    <div className="py-4 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>U.S. Senate</div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            {seats.map((s) => (
              <span key={s.href} className="flex items-baseline gap-1.5">
                <a href={s.href} className="hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", fontWeight: 700, color: partyColor(s.party) }}>{s.name}</a>
                <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>({s.party}) · next {s.nextElection}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-semibold italic" style={{ color: "var(--app-text-very-muted)" }}>No election</div>
      </div>
    </div>
  );
}

function HouseRowButton({ row, active, onSelect }: { row: HouseRow; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      className="flex w-full items-center justify-between gap-3 py-2.5 pl-2 pr-1 min-w-0 text-left"
      style={{ borderBottom: "1px solid var(--app-border)", borderLeft: `2px solid ${active ? "var(--app-text-primary)" : "transparent"}`, background: active ? "var(--app-tab-bg)" : undefined }}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <a href={row.href} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-sm font-bold tabular-nums hover:underline" style={{ color: "var(--app-text-primary)" }}>{row.label}</a>
        {row.openHolder && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--redistrict-ss)" }} title={`Open seat · ${row.openHolder} is not running`}>
            Open
          </span>
        )}
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold tabular-nums" style={{ color: marginColor(row.margin) }}>{fmtMargin(row.margin)}</span>
        <RatingPill rating={row.rating} />
      </span>
    </button>
  );
}

function ChamberBlockCard({ block, active, onSelect, electionYear }: { block: ChamberBlock; active: boolean; onSelect: () => void; electionYear: number }) {
  const hasProj = block.expectedDem != null && block.expectedRep != null && block.projTotal;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-current={active}
      className="min-w-0 cursor-pointer py-4 pl-2.5 pr-1"
      style={{ borderBottom: "1px solid var(--app-border)", borderLeft: `2px solid ${active ? "var(--app-text-primary)" : "transparent"}`, background: active ? "var(--app-tab-bg)" : undefined }}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
        {block.label}{block.upText ? ` · ${block.upText}` : block.totalSeats ? ` · ${block.totalSeats} seats` : ""}
        {active && <span className="ml-2 text-[9px] font-bold" style={{ color: "var(--app-text-muted)" }}>On map</span>}
      </div>
      {hasProj ? (
        <>
          <div className="mt-2 text-xl font-bold tabular-nums leading-tight">
            <span style={{ color: "var(--party-dem)" }}>D {block.expectedDem!.toFixed(0)}</span>
            <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
            <span style={{ color: "var(--party-rep)" }}>R {block.expectedRep!.toFixed(0)}</span>
            <span className="ml-2 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>projected</span>
          </div>
          <SeatBar dem={block.expectedDem!} rep={block.expectedRep!} total={block.projTotal!} />
          <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            {block.pDem == null
              ? `${block.unprojected} seats unprojected`
              : <>P(control) <b style={{ color: "var(--party-dem)" }}>D {fmtProb(block.pDem)}</b> · <b style={{ color: "var(--party-rep)" }}>R {fmtProb(1 - block.pDem)}</b></>}
            {block.contested != null && block.districts != null && ` · ${block.contested} of ${block.districts} contested`}
            {block.open != null && ` · ${block.open} open`}
          </div>
          {block.pDem != null && (
            <div className="mt-1 text-xs" style={{ color: "var(--app-text-primary)" }}>
              <b>{block.within5} seat{block.within5 === 1 ? "" : "s"} within 5 points</b>
              <span style={{ color: "var(--app-text-very-muted)" }}> · {block.within10} within 10</span>
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-base font-bold" style={{ color: "var(--app-text-muted)" }}>Not on the {electionYear} ballot</div>
      )}
      <Link href={block.exploreHref} onClick={(e) => e.stopPropagation()} className="mt-2.5 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>
        Explore {block.map.roster.length} districts →
      </Link>
    </div>
  );
}

/**
 * Sections 2–4 of the state page: the ballot beside the map, results since 2016 and the counties.
 * They share one client component because the map's layer and year are set from all three: a
 * ballot row, a results card and a county chip each change what the maps draw.
 */
type ResultsOffice = "statewide" | "federal" | "stateHouse" | "stateSenate";

export default function StateExplorer({ data, electionYear, generalElection }: { data: StatePageData; electionYear: number; generalElection: string }) {
  const { state, stateFips, houseRaces, housePastResults, chambers, results } = data;
  const chamberData = useMemo(() => Object.fromEntries(chambers.map((c) => [c.chamber, c.map])) as Partial<Record<Chamber, ChamberBlock["map"]>>, [chambers]);
  const blockOf = (chamber: Chamber) => chambers.find((c) => c.chamber === chamber);
  const layerOf = (chamber: Chamber): MapLayer => (chamber === "house" ? "stateHouse" : "stateSenate");

  const layers: { id: MapLayer; label: string }[] = [
    ...(houseRaces.length ? [{ id: "house" as const, label: "U.S. House" }] : []),
    ...chambers.map((c) => ({ id: layerOf(c.chamber), label: c.label })),
  ];
  const [layer, setLayerState] = useState<MapLayer>(layers[0]?.id ?? "house");
  const [year, setYear] = useState<number>(electionYear);
  const [selectedHouse, setSelectedHouse] = useState<ForecastedRace | null>(null);
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const [resultsView, setResultsView] = useState<"cards" | "graph">("cards");
  // One office's cards at a time: four columns side by side went to two staggered rows at
  // mid widths, each with its own scrollbox, and the page scroll fought them.
  const [resultsOffice, setResultsOffice] = useState<ResultsOffice>("statewide");
  const [countyLayer, setCountyLayer] = useState<string>(TPL_LAYER);

  const years = useMemo(() => layerYears(layer, housePastResults, houseRaces, chamberData), [layer, housePastResults, houseRaces, chamberData]);
  const activeYear = year === electionYear || years.includes(year) ? year : electionYear;

  const show = useCallback((next: MapLayer, nextYear: number = electionYear) => {
    setLayerState(next);
    setYear(nextYear);
    setSelectedHouse(null);
    setSelectedLegKey(null);
  }, [electionYear]);

  const selectHouseRow = (row: HouseRow) => {
    const race = houseRaces.find((r) => r.id === row.id) ?? null;
    setLayerState("house");
    setYear(electionYear);
    setSelectedLegKey(null);
    setSelectedHouse((cur) => (cur?.id === race?.id ? null : race));
  };

  const legChamber = chamberOfLayer(layer);
  const legData = legChamber ? chamberData[legChamber] : undefined;
  const legDistrict = legData && selectedLegKey ? legData.roster.find((d) => d.number === selectedLegKey) ?? null : null;
  const legProj = legData && selectedLegKey ? legData.projByKey[selectedLegKey] : undefined;

  const senateHoldovers = data.senate.filter((s): s is BallotHoldover => s.kind === "holdover");
  const senateRaces = data.senate.filter((s): s is BallotRace => s.kind === "race");
  const houseYears = useMemo(() => layerYears("house", housePastResults, houseRaces, chamberData), [housePastResults, houseRaces, chamberData]);
  const officeTabs: { key: ResultsOffice; label: string; right?: string }[] = [
    { key: "statewide", label: "Statewide", right: "by county, below" },
    ...(results.federal.length ? [{ key: "federal" as const, label: "U.S. House", right: houseRaces.length ? `${houseRaces.length} seats` : undefined }] : []),
    ...(results.stateHouse.length ? [{ key: "stateHouse" as const, label: results.isUnicameral ? "Legislature" : "State House", right: blockOf("house")?.totalSeats ? `${blockOf("house")!.totalSeats} seats` : undefined }] : []),
    ...(!results.isUnicameral && results.stateSenate.length ? [{ key: "stateSenate" as const, label: "State Senate", right: blockOf("senate")?.totalSeats ? `${blockOf("senate")!.totalSeats} seats` : undefined }] : []),
  ];
  const officeTab = officeTabs.find((t) => t.key === resultsOffice) ?? officeTabs[0];

  const chip = (label: string, on: boolean, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
      style={on
        ? { background: "var(--app-text-primary)", color: "var(--app-bg)", border: "1px solid var(--app-text-primary)" }
        : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* ── 1b · The map: the ballot and every past result on it, above the lists it drives ── */}
      <section className="mt-6">
        <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-5 mb-3 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
          {layers.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => show(l.id, activeYear === electionYear || years.includes(activeYear) ? activeYear : electionYear)}
              className="whitespace-nowrap pb-2.5 text-sm font-semibold transition-colors"
              style={layer === l.id
                ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {chip(`${electionYear} projection`, activeYear === electionYear, () => { setYear(electionYear); setSelectedLegKey(null); }, "proj")}
          {years.map((y) => chip(String(y), activeYear === y, () => { setYear(y); setSelectedHouse(null); setSelectedLegKey(null); }, String(y)))}
        </div>

        <StateLayerMap
          stateAbbr={state.abbr}
          stateName={state.name}
          stateFips={stateFips}
          electionYear={electionYear}
          layer={layer}
          year={activeYear}
          houseRaces={houseRaces}
          housePastResults={housePastResults}
          chambers={chamberData}
          selectedHouse={selectedHouse}
          onSelectHouse={setSelectedHouse}
          selectedLegKey={selectedLegKey}
          onSelectLeg={setSelectedLegKey}
        />

        {/* Selected district */}
        {layer === "house" && selectedHouse && (() => {
          const r = selectedHouse;
          const rating = marginToRating(r.margin);
          const { bg, text } = getRatingColors(rating);
          const demPct = Math.max(0, Math.min(100, 50 - r.margin / 2));
          return (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>{r.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>{rating}</span>
                    <button type="button" onClick={() => setSelectedHouse(null)} className="text-xs" style={{ color: "var(--app-text-very-muted)" }} aria-label="Clear selection">×</button>
                  </div>
                  {r.candidates ? (
                    <div className="flex flex-col gap-0.5">
                      {[r.candidates.dem, r.candidates.rep].map((c, i) => (
                        <div key={c.name + i} className="flex items-baseline justify-between gap-2">
                          <CandidateLink name={c.name} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(c.party) }}>
                            {c.name}{c.incumbent ? " (Inc.)" : ""}
                          </CandidateLink>
                          <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: partyColor(c.party) }}>{(i === 0 ? demPct : 100 - demPct).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
                  )}
                  <a href={`/house/${r.name.toLowerCase()}`} className="mt-2 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View full race →</a>
                </div>
                <div className="tabular-nums font-extrabold shrink-0" style={{ fontSize: "1.75rem", lineHeight: 1, color: marginColor(r.margin) }}>{fmtMargin(r.margin)}</div>
              </div>
            </div>
          );
        })()}
        {legChamber && legDistrict && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>{legDistrict.label}</span>
                  {legProj?.rating && activeYear === electionYear && (() => { const { bg, text } = getRatingColors(legProj.rating!); return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>{legProj.rating}</span>; })()}
                  <button type="button" onClick={() => setSelectedLegKey(null)} className="text-xs" style={{ color: "var(--app-text-very-muted)" }} aria-label="Clear selection">×</button>
                </div>
                {(legDistrict.incumbents ?? []).length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {(legDistrict.incumbents ?? []).map((inc) => (
                      <div key={inc.name} className="flex items-baseline gap-2">
                        <CandidateLink name={inc.name} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(inc.party) }}>{inc.name}</CandidateLink>
                        <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>({inc.party})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</div>
                )}
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                  {legDistrict.nextElection ? `Next election ${legDistrict.nextElection}` : ""}
                  {legProj && legProj.pD != null && legProj.contest === "contested" ? ` · P(D) ${fmtProb(legProj.pD)}` : ""}
                </div>
                <a href={chamberDistrictHref(state.id, legChamber, legDistrict.number)} className="mt-2 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View district →</a>
              </div>
              {legProj?.margin != null && legProj.contest === "contested" && activeYear === electionYear && (
                <div className="tabular-nums font-extrabold shrink-0" style={{ fontSize: "1.75rem", lineHeight: 1, color: marginColor(legProj.margin) }}>{fmtMargin(legProj.margin)}</div>
              )}
            </div>
          </div>
        )}
        </div>
      </section>

      {/* ── 2 · On the ballot ── */}
      <section id="ballot" className="mt-6">
        <SectionHead title={`On the ballot · ${generalElection}`} right={
          <>
            {(data.governor?.kind === "race" ? 1 : 0) + senateRaces.length} statewide · {houseRaces.length} district{houseRaces.length === 1 ? "" : "s"} · {chambers.length} chamber{chambers.length === 1 ? "" : "s"}
          </>
        } />

        <div className="min-w-0">
            <TurnoutRow stats={data.turnout} />

            {data.governor?.kind === "race" && <RaceRow race={data.governor} />}
            {data.governor?.kind === "holdover" && <HoldoverRow seat={data.governor} />}
            {senateHoldovers.length === 2 && senateRaces.length === 0
              ? <SenateHoldoverLine seats={senateHoldovers} />
              : data.senate.map((s) => (s.kind === "race" ? <RaceRow key={s.href} race={s} /> : <HoldoverRow key={s.href} seat={s} />))}

            {houseRaces.length > 0 && (
              <>
                <SubHead right="click a district to see it on the map">
                  U.S. House · {houseRaces.length} district{houseRaces.length === 1 ? "" : "s"}
                  <span className="ml-2 normal-case tracking-normal tabular-nums">
                    <span style={{ color: "var(--party-dem)" }}>{data.house.demProj}D</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
                    <span style={{ color: "var(--party-rep)" }}>{data.house.repProj}R</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> projected</span>
                    {data.house.open > 0 && <span style={{ color: "var(--app-text-very-muted)" }}> · {data.house.open} open seat{data.house.open === 1 ? "" : "s"}</span>}
                  </span>
                </SubHead>
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {data.house.rows.map((row) => (
                    <HouseRowButton key={row.id} row={row} active={layer === "house" && selectedHouse?.id === row.id} onSelect={() => selectHouseRow(row)} />
                  ))}
                </div>
              </>
            )}

            {chambers.length > 0 && (
              <>
                <SubHead id="legislature" right="click a chamber to see it on the map">State Legislature</SubHead>
                <div className={`grid grid-cols-1 gap-x-6 ${chambers.length > 1 ? "lg:grid-cols-2" : ""}`}>
                  {chambers.map((c) => (
                    <ChamberBlockCard key={c.chamber} block={c} electionYear={electionYear} active={layer === layerOf(c.chamber)} onSelect={() => show(layerOf(c.chamber))} />
                  ))}
                </div>
              </>
            )}
        </div>
      </section>

      {/* ── 3 · Results since 2016 ── */}
      <section id="results" className="mt-10">
        <SectionHead title="Results since 2016" right={
          <span className="flex items-center gap-3">
            <span className="hidden sm:inline">pick a year to put it on the map</span>
            <span className="flex items-center gap-2">
              {(["cards", "graph"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setResultsView(v)} className="text-xs font-semibold" style={{ color: resultsView === v ? "var(--app-text-primary)" : "var(--app-text-muted)", textDecoration: resultsView === v ? "underline" : "none", textUnderlineOffset: 3 }}>
                  {v === "cards" ? "Cards" : "Graph"}
                </button>
              ))}
            </span>
          </span>
        } />

        {resultsView === "graph" ? (
          <div className="mt-3"><StateVoteHistoryChart results={results.chart} bare /></div>
        ) : (
          <>
            <div className="mt-3 flex items-end justify-between gap-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1 sm:gap-x-5 min-w-0">
                {officeTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setResultsOffice(t.key)}
                    className="whitespace-nowrap pb-2.5 text-sm font-semibold transition-colors"
                    style={officeTab.key === t.key
                      ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                      : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {officeTab.right && <span className="hidden sm:inline shrink-0 pb-2.5 text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{officeTab.right}</span>}
            </div>

            {officeTab.key === "statewide" && (
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {results.statewide.map((entry) => (
                  <ResultCard
                    key={entry.key}
                    entry={entry}
                    active={entry.countyLayer != null && countyLayer === entry.countyLayer}
                    onSelect={entry.countyLayer ? () => setCountyLayer(entry.countyLayer!) : undefined}
                  />
                ))}
              </div>
            )}
            {officeTab.key === "federal" && (
              <StateLegCompositionBox
                layout="grid"
                federalEntries={results.federal}
                houseEntries={[]}
                senateEntries={[]}
                activeYear={layer === "house" ? activeYear : null}
                selectableYears={houseYears}
                onSelectYear={(y) => show("house", y)}
                newMapYears={results.newMapYears.federal}
              />
            )}
            {officeTab.key === "stateHouse" && (
              <StateLegCompositionBox
                layout="grid"
                chamber="house"
                isUnicameral={results.isUnicameral}
                federalEntries={[]}
                houseEntries={results.stateHouse}
                senateEntries={results.stateSenate}
                activeYear={layer === "stateHouse" ? activeYear : null}
                selectableYears={chamberData.house?.electionYears ?? []}
                onSelectYear={(y) => show("stateHouse", y)}
                majorityInfo={results.majority.house ?? null}
                seatsUpByYear={results.seatsUpByYear.house ?? null}
                upcoming={results.upcoming.house ?? null}
                upcomingActive={layer === "stateHouse" && activeYear === electionYear}
                onSelectUpcoming={() => show("stateHouse")}
                newMapYears={results.newMapYears.house}
              />
            )}
            {officeTab.key === "stateSenate" && (
              <StateLegCompositionBox
                layout="grid"
                chamber="senate"
                federalEntries={[]}
                houseEntries={results.stateHouse}
                senateEntries={results.stateSenate}
                activeYear={layer === "stateSenate" ? activeYear : null}
                selectableYears={chamberData.senate?.electionYears ?? []}
                onSelectYear={(y) => show("stateSenate", y)}
                majorityInfo={results.majority.senate ?? null}
                seatsUpByYear={results.seatsUpByYear.senate ?? null}
                upcoming={results.upcoming.senate ?? null}
                upcomingActive={layer === "stateSenate" && activeYear === electionYear}
                onSelectUpcoming={() => show("stateSenate")}
                newMapYears={results.newMapYears.senate}
              />
            )}
          </>
        )}

        {/* Map vintage: when each body's lines were last drawn, which is where a seat split stops comparing cleanly. */}
        {results.vintage.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
            {results.vintage.map((v) => (
              <div key={v.label} className="min-w-[120px]">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{v.label}</div>
                <div className="text-sm font-bold tabular-nums leading-tight" style={{ color: "var(--app-text-primary)" }}>{v.value}</div>
                {v.sub && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{v.sub}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 4 · Counties ── */}
      {data.counties.rows.length > 0 && (
        <StateCountiesSection
          stateAbbr={state.abbr}
          stateName={state.name}
          areaLabel={data.counties.areaLabel}
          countyTpl={data.counties.tpl}
          layers={data.counties.layers}
          rows={data.counties.rows}
          activeLayer={countyLayer}
          onLayer={setCountyLayer}
        />
      )}
    </>
  );
}
