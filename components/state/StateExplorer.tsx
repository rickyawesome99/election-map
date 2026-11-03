"use client";

import FinalForecastPill from "@/components/FinalForecastPill";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Chamber } from "@/data/stateLegDistricts";
import type { ForecastedRace } from "@/lib/forecast";
import type { BallotRace, ChamberBlock, HouseRow, StatePageData } from "@/lib/statePage";
import { ChamberLedger, HouseLedger, StatewideCards } from "./BallotSection";
import { SegToggle, SlidingTabs } from "./StateMotion";
import { useRevealOnce } from "@/lib/useRevealOnce";
import { useDesktopPointer } from "@/lib/useDesktopPointer";
import { useRouter } from "next/navigation";
import { startPendingNav } from "@/lib/navPending";
import { chamberDistrictHref } from "@/lib/statePageLinks";
import { districtResultMargin, useStateLegResults } from "@/lib/useStateLegResults";
import { districtDisplayLabel, indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import CandidateLink from "@/components/CandidateLink";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";
import { ResultCard } from "@/components/StatewideVoteHistoryPanel";
import StateLayerMap, { chamberOfLayer, layerYears, type MapLayer } from "./StateLayerMap";
import StateCountiesSection, { TPL_LAYER } from "./StateCountiesSection";
import StateResultsGraph, { bodyEntriesFromDelegation, bodyEntriesFromStateLeg } from "./StateResultsGraph";

const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
// Never "Even": the forecast always leans one way (margin <= 0 is D, as everywhere on the site), so a
// rounded-to-zero margin reads D+0.0 or R+0.0.
const fmtMargin = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const marginColor = (m: number) => (m <= 0 ? "var(--party-dem)" : "var(--party-rep)");
const partyColor = (p: string) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : "var(--party-ind)");
// One party/incumbency tag everywhere on the page: (D), (R), (D Inc), (R Inc).
const partyTag = (p: string, incumbent?: boolean) => `(${p}${incumbent ? " Inc" : ""})`;

function SectionHead({ id, title, right, badge, children }: { id?: string; title: string; right?: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5 sm:gap-3 pb-3 mb-1 scroll-mt-20" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3">
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{title}</h2>
        {badge && <div className="self-start sm:self-center">{badge}</div>}
        {children && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{children}</span>}
      </div>
      {right && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{right}</div>}
    </div>
  );
}

// `flush` drops the rule for blocks that draw their own (the statewide cards' top rules).
function SubHead({ id, children, right, flush = false }: { id?: string; children: ReactNode; right?: ReactNode; flush?: boolean }) {
  return (
    <div id={id} className={`flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pt-6 pb-2 scroll-mt-20 ${flush ? "" : "mb-1"}`} style={flush ? undefined : { borderBottom: "2px solid var(--app-text-primary)" }}>
      <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{children}</span>
      {right && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{right}</span>}
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
  const { state, stateFips, houseRaces, housePastResults, housePastHrefs, chambers, results } = data;
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
  // On desktop a House district click on the map opens its race page (hover already shows the
  // details); phones keep the tap-to-select panel.
  const desktop = useDesktopPointer();
  const router = useRouter();
  const openPage = (href: string) => { startPendingNav(href); router.push(href); };
  const mapSelectHouse = (race: ForecastedRace | null) => {
    // null is a click on the already-selected district (a ballot row selected it): open that one.
    const target = race ?? selectedHouse;
    if (desktop && target) openPage(`/house/${target.name.toLowerCase()}`);
    else setSelectedHouse(race);
  };
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const [resultsView, setResultsView] = useState<"cards" | "graph">("cards");
  // One office's cards at a time: four columns side by side went to two staggered rows at
  // mid widths, each with its own scrollbox, and the page scroll fought them.
  const [resultsOffice, setResultsOffice] = useState<ResultsOffice>("statewide");
  const [countyLayer, setCountyLayer] = useState<string>(TPL_LAYER);
  const { ref: resultsRef, vh: resultsVh } = useRevealOnce<HTMLElement>();

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
  // A past year's chip: the panel shows that election in the selected district, on the lines it
  // ran on. Same per-state file and cache the map already fetched, so no second request.
  const legPastYear = !!legChamber && activeYear !== electionYear;
  const { data: legResultsData, loading: legResultsLoading } = useStateLegResults(state.abbr, legPastYear);
  const legPastIndex = useMemo(() => {
    const districts = legPastYear && legChamber ? legResultsData?.[String(activeYear)]?.[legChamber]?.districts : undefined;
    return districts ? indexByNormalizedKey(districts) : null;
  }, [legPastYear, legChamber, legResultsData, activeYear]);
  const legPastResult = legPastIndex && legChamber && selectedLegKey ? lookupByDistrictCode(legPastIndex, state.abbr, legChamber, selectedLegKey) : undefined;
  // Superseded lines reuse numbers for different places, so the current roster's label and page
  // only apply when the year ran on today's map.
  const legPastOnCurrentLines = legPastYear && !!legData && legData.historicalMaps[String(activeYear)] == null;

  const senateRaces = data.senate.filter((s): s is BallotRace => s.kind === "race");
  const officeTabs: { key: ResultsOffice; label: string; right?: string }[] = [
    { key: "statewide", label: "Statewide" },
    ...(results.federal.length ? [{ key: "federal" as const, label: "U.S. House", right: houseRaces.length ? `${houseRaces.length} seats` : undefined }] : []),
    ...(results.stateHouse.length ? [{ key: "stateHouse" as const, label: results.isUnicameral ? "Legislature" : "State House", right: blockOf("house")?.totalSeats ? `${blockOf("house")!.totalSeats} seats` : undefined }] : []),
    ...(!results.isUnicameral && results.stateSenate.length ? [{ key: "stateSenate" as const, label: "State Senate", right: blockOf("senate")?.totalSeats ? `${blockOf("senate")!.totalSeats} seats` : undefined }] : []),
  ];
  const officeTab = officeTabs.find((t) => t.key === resultsOffice) ?? officeTabs[0];

  // The graph view of the same tab. Keyed by office so switching tabs replays the draw-in.
  const presidentialMargins = results.statewide.filter((e) => e.group === "president" && e.label === "Presidential").map((e) => ({ year: e.year, margin: Math.round((e.repPct - e.demPct) * 10) / 10 }));
  const chamberProjection = (chamber: Chamber) => {
    const b = blockOf(chamber);
    return b?.upText && b.projDem != null && b.projRep != null ? { year: electionYear, dem: b.projDem, rep: b.projRep, total: b.projTotal } : null;
  };
  // Nebraska's one chamber is filed as the Senate block but shown under the "Legislature" tab.
  const graphChamber: Chamber = officeTab.key === "stateHouse" && !results.isUnicameral ? "house" : "senate";
  const resultsGraph = officeTab.key === "statewide" ? (
    <StateResultsGraph
      key="statewide"
      kind="statewide"
      entries={results.statewide}
      forecasts={[...senateRaces, ...(data.governor?.kind === "race" ? [data.governor] : [])].map((r) => ({ year: electionYear, label: r.label, margin: r.margin, href: r.href }))}
    />
  ) : officeTab.key === "federal" ? (
    <StateResultsGraph
      key="federal"
      kind="body"
      label="U.S. House"
      entries={bodyEntriesFromDelegation(results.federal)}
      presidential={presidentialMargins}
      majority={null}
      halfLine
      newMapYears={results.newMapYears.federal ?? []}
      projection={houseRaces.length > 1 ? { year: electionYear, dem: data.house.demProj, rep: data.house.repProj, total: houseRaces.length } : null}
    />
  ) : (
    <StateResultsGraph
      key={officeTab.key}
      kind="body"
      label={officeTab.label}
      entries={bodyEntriesFromStateLeg(officeTab.key === "stateHouse" ? results.stateHouse : results.stateSenate)}
      presidential={presidentialMargins}
      majority={results.majority[graphChamber] ?? null}
      newMapYears={results.newMapYears[graphChamber] ?? []}
      projection={chamberProjection(graphChamber)}
    />
  );

  const chip = (label: string, on: boolean, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="ix-press shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
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
      <section className="mt-2">
        <div className="mx-auto max-w-3xl">
        <div className="mb-3">
          <SlidingTabs tabs={layers.map((l) => ({ key: l.id, label: l.label }))} active={layer} onChange={(id) => show(id, activeYear === electionYear || years.includes(activeYear) ? activeYear : electionYear)} />
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
          housePastHrefs={housePastHrefs}
          chambers={chamberData}
          selectedHouse={selectedHouse}
          onSelectHouse={mapSelectHouse}
          onOpenHouse={desktop ? openPage : undefined}
          selectedLegKey={selectedLegKey}
          onSelectLeg={setSelectedLegKey}
        />

        {/* Selected district */}
        {layer === "house" && selectedHouse && !desktop && (() => {
          const r = selectedHouse;
          const rating = marginToRating(r.margin);
          const { bg, text } = getRatingColors(rating);
          const demPct = Math.max(0, Math.min(100, 50 - r.margin / 2));
          return (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>{r.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>{rating}</span>
                    <button type="button" onClick={() => setSelectedHouse(null)} className="ix-press text-xs" style={{ color: "var(--app-text-very-muted)" }} aria-label="Clear selection">×</button>
                  </div>
                  {r.candidates ? (
                    <div className="flex flex-col gap-0.5">
                      {[r.candidates.dem, r.candidates.rep].map((c, i) => (
                        <div key={c.name + i} className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <CandidateLink name={c.name} state={state.abbr} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(c.party) }}>
                              {c.name}
                            </CandidateLink>
                            <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{partyTag(c.party, c.incumbent)}</span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: partyColor(c.party) }}>{(i === 0 ? demPct : 100 - demPct).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
                  )}
                  <Link prefetch={false} href={`/house/${r.name.toLowerCase()}`} className="mt-2 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View full race →</Link>
                </div>
                <div className="tabular-nums font-extrabold shrink-0" style={{ fontSize: "1.75rem", lineHeight: 1, color: marginColor(r.margin) }}>{fmtMargin(r.margin)}</div>
              </div>
            </div>
          );
        })()}
        {legChamber && legPastYear && selectedLegKey && (() => {
          const label = (legPastOnCurrentLines ? legDistrict?.label : undefined) ?? districtDisplayLabel(selectedLegKey, blockOf(legChamber)?.label ?? "");
          const r = legPastResult;
          const margin = districtResultMargin(r);
          const total = r?.totalVotes ?? 0;
          const pct = (v: number | null) => (v != null && total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "");
          const candidates = (r?.candidates ?? []).filter((c) => c.votes == null || c.votes > 0);
          const partyRows = r
            ? ([["Democratic", "D", r.demVotes], ["Republican", "R", r.repVotes], ["Other", "O", r.othVotes]] as const).filter(([, , v]) => !!v)
            : [];
          return (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>{label}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{activeYear} result{r?.uncontested ? " · unopposed" : ""}</span>
                    <button type="button" onClick={() => setSelectedLegKey(null)} className="ix-press text-xs" style={{ color: "var(--app-text-very-muted)" }} aria-label="Clear selection">×</button>
                  </div>
                  {!r ? (
                    <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
                      {legResultsLoading ? `Loading ${activeYear} results…` : `No ${activeYear} result for this district`}
                    </div>
                  ) : candidates.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {candidates.map((c, i) => (
                        <div key={c.name + i} className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <CandidateLink name={c.name} state={state.abbr} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(c.party) }}>
                              {c.name}
                            </CandidateLink>
                            <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
                              {partyTag(c.party === "O" ? "I" : c.party, c.incumbent)}{c.winner ? " ✓" : ""}{c.post ? ` · ${c.post}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums" style={{ color: partyColor(c.party) }}>
                            {c.votes == null ? "—" : <><span className="font-bold">{pct(c.votes)}</span> <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{c.votes.toLocaleString()}</span></>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : margin == null ? (
                    <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Seat filled, no vote count published</div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {partyRows.map(([name, party, v]) => (
                        <div key={party} className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: partyColor(party) }}>{name}</span>
                          <span className="shrink-0 text-sm tabular-nums" style={{ color: partyColor(party) }}>
                            <span className="font-bold">{pct(v)}</span> <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{v!.toLocaleString()}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {legPastOnCurrentLines && legDistrict && (
                    <Link prefetch={false} href={chamberDistrictHref(state.id, legChamber, legDistrict.number)} className="mt-2 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View district →</Link>
                  )}
                </div>
                {margin != null && (
                  <div className="tabular-nums font-extrabold shrink-0" style={{ fontSize: "1.75rem", lineHeight: 1, color: marginColor(margin) }}>{fmtMargin(margin)}</div>
                )}
              </div>
            </div>
          );
        })()}
        {legChamber && !legPastYear && legDistrict && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>{legDistrict.label}</span>
                  {legProj?.rating && activeYear === electionYear && (() => { const { bg, text } = getRatingColors(legProj.rating!); return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>{legProj.rating}</span>; })()}
                  <button type="button" onClick={() => setSelectedLegKey(null)} className="ix-press text-xs" style={{ color: "var(--app-text-very-muted)" }} aria-label="Clear selection">×</button>
                </div>
                {legProj?.field && legProj.field.length > 0 ? (
                  // The 2026 field, laid out like the U.S. House projection: projected share per
                  // nominee, with projected votes where the race splits them (lib/stateLegAtlas.ts).
                  <div className="flex flex-col gap-0.5">
                    {legProj.field.map((c, i) => (
                      <div key={c.name + i} className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <CandidateLink name={c.name} state={state.abbr} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(c.party) }}>{c.name}</CandidateLink>
                          <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
                            {partyTag(c.party === "O" ? "I" : c.party, c.incumbent)}{c.writeIn ? " · write-in" : ""}{c.post ? ` · ${state.abbr === "ID" ? "Seat" : "Pos."} ${c.post}` : ""}
                          </span>
                        </span>
                        {c.share != null ? (
                          <span className="shrink-0 text-sm tabular-nums" style={{ color: partyColor(c.party) }}>
                            <span className="font-bold">{c.share.toFixed(1)}%</span>
                            {c.votes != null && <> <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{c.votes.toLocaleString()}</span></>}
                          </span>
                        ) : (legProj.contest === "uncontested-D" || legProj.contest === "uncontested-R") && !c.writeIn ? (
                          <span className="shrink-0 text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>unopposed</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (legDistrict.incumbents ?? []).length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {(legDistrict.incumbents ?? []).map((inc) => (
                      <div key={inc.name} className="flex items-baseline gap-2">
                        <CandidateLink name={inc.name} state={state.abbr} className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: partyColor(inc.party) }}>{inc.name}</CandidateLink>
                        <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{partyTag(inc.party, true)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</div>
                )}
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                  {[
                    legProj?.contest === "not-up" || !legProj ? (legDistrict.nextElection ? `Not up until ${legDistrict.nextElection}` : "") : legProj.field ? "" : legDistrict.nextElection ? `Next election ${legDistrict.nextElection}` : "",
                    legProj?.votes ? `${legProj.votes.toLocaleString()} projected votes` : "",
                    legProj && legProj.pD != null && legProj.contest === "contested" ? `P(D) ${fmtProb(legProj.pD)}` : "",
                  ].filter(Boolean).join(" · ")}
                </div>
                <Link prefetch={false} href={chamberDistrictHref(state.id, legChamber, legDistrict.number)} className="mt-2 inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View district →</Link>
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
        <SectionHead title={`On the ballot · ${generalElection}`} badge={<FinalForecastPill />} right={
          <>
            {(data.governor?.kind === "race" ? 1 : 0) + senateRaces.length} statewide · {houseRaces.length} district{houseRaces.length === 1 ? "" : "s"} · {chambers.length} chamber{chambers.length === 1 ? "" : "s"}
          </>
        } />

        <div className="min-w-0">
            {(data.governor || data.senate.length > 0) && (
              <>
                <SubHead flush right={<span className="inline-flex items-center gap-1.5"><i className="inline-block rounded-full" style={{ width: 7, height: 7, background: "var(--app-text-very-muted)" }} />incumbent</span>}>Statewide</SubHead>
                <StatewideCards governor={data.governor} senate={data.senate} state={state.abbr} />
              </>
            )}

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
                <HouseLedger rows={data.house.rows} state={state.abbr} activeId={layer === "house" ? selectedHouse?.id ?? null : null} onSelect={selectHouseRow} />
              </>
            )}

            {chambers.length > 0 && (
              <>
                <SubHead id="legislature" right="each seat by its projected rating · line = majority">State Legislature</SubHead>
                <ChamberLedger chambers={chambers} electionYear={electionYear} />
              </>
            )}
        </div>
      </section>

      {/* ── 3 · Results since 2016 ── */}
      <section id="results" ref={resultsRef} data-vh={resultsVh} className="mt-10">
        <SectionHead title="Results since 2016" right={
          <SegToggle label="Results view" options={[{ key: "cards", label: "Cards" }, { key: "graph", label: "Graph" }]} value={resultsView} onChange={setResultsView} />
        } />

        <>
            <div className="mt-3">
              <SlidingTabs
                tabs={officeTabs.map((t) => ({ key: t.key, label: t.label }))}
                active={officeTab.key}
                onChange={setResultsOffice}
                right={officeTab.right && <span className="hidden sm:inline shrink-0 pb-2.5 text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{officeTab.right}</span>}
              />
            </div>

            {/* Keyed by tab and view, so each switch fades the new content in and replays the cards' rise. */}
            <div key={`${officeTab.key}-${resultsView}`} className="vh-tab-in">
            {resultsView === "graph" ? (
              <div className="mt-5">{resultsGraph}</div>
            ) : (
            <>

            {officeTab.key === "statewide" && (
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {results.statewide.map((entry, i) => (
                  <div key={entry.key} className="vh-row" style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}>
                    <ResultCard entry={entry} state={state.abbr} />
                  </div>
                ))}
              </div>
            )}
            {officeTab.key === "federal" && (
              <StateLegCompositionBox
                layout="grid"
                federalEntries={results.federal}
                houseEntries={[]}
                senateEntries={[]}
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
                majorityInfo={results.majority.house ?? null}
                seatsUpByYear={results.seatsUpByYear.house ?? null}
                upcoming={results.upcoming.house ?? null}
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
                majorityInfo={results.majority.senate ?? null}
                seatsUpByYear={results.seatsUpByYear.senate ?? null}
                upcoming={results.upcoming.senate ?? null}
                newMapYears={results.newMapYears.senate}
              />
            )}
            </>
            )}
            </div>
        </>

        {/* Map vintage: when each body's lines were last drawn, which is where a seat split stops comparing cleanly. */}
        {results.vintage.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 pt-3 sm:flex sm:flex-wrap sm:gap-x-8" style={{ borderTop: "1px solid var(--app-border)" }}>
            {results.vintage.map((v) => (
              <div key={v.label} className="min-w-0 sm:min-w-[120px]">
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
