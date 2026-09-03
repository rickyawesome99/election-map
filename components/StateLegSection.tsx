"use client";

import { Fragment, useState, useCallback, useMemo, useEffect } from "react";
import StateLegDistrictMap from "./StateLegDistrictMap";
import StateLegDistrictTable, { districtRowCount } from "./StateLegDistrictTable";
import StateLegCompositionBox from "./StateLegCompositionBox";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegEntry } from "@/data/forecastData";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { StateLegCalendar } from "@/data/stateLegCalendar";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { districtResultMargin, useStateLegResults } from "@/lib/useStateLegResults";
import { districtDisplayLabel, isUnassignedResultKey } from "@/lib/stateLegDistrictKey";
import { fmtMargin } from "@/lib/colorScale";

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

const CHAMBER_LABEL: Record<Chamber, string> = { house: "State House", senate: "State Senate" };

/** Which party actually carried the district — an independent can outpoll both majors. */
function resultWinner(result: StateLegDistrictResult): "D" | "R" | "O" | null {
  if (result.totalVotes == null) return null;
  const dem = result.demVotes ?? 0;
  const rep = result.repVotes ?? 0;
  const oth = result.othVotes ?? 0;
  if (oth > dem && oth > rep) return "O";
  return rep > dem ? "R" : "D";
}

// Kept to a couple of lines: on desktop this floats over the map, where anything taller starts
// covering the districts it is describing, and on mobile it sits between the map and the year
// rail. The district's identity and its margin share the top line; whatever detail the current
// view has runs under it at footnote size.
function SelectedDistrictPanel({
  districtKey,
  districtLabel,
  district,
  viewMode,
  presidentialResult,
  result,
  resultsYear,
  onClose,
}: {
  districtKey: string;
  districtLabel: string;
  district?: StateLegDistrict;
  viewMode: MapViewMode;
  presidentialResult?: StateLegPres2024;
  result?: StateLegDistrictResult;
  resultsYear: number | null;
  onClose: () => void;
}) {
  const incumbents = district?.incumbents ?? [];
  // Zero-vote lines are ballot bookkeeping the source files under the office ("Blank Ballots"
  // in the New England states, an unused write-in slot), not somebody who ran. Where they carry
  // real votes they stay, since those votes are inside the district's Other total.
  const namedCandidates = (result?.candidates ?? []).filter((c) => c.votes > 0);
  const isPresidentialView = viewMode === "president";
  const isResultsView = viewMode === "results";
  const resultMargin = districtResultMargin(result);
  const displayedMargin = isResultsView
    ? resultMargin
    : isPresidentialView
      ? presidentialResult?.margin
      : district?.margin;
  const footnote = isResultsView && result && resultMargin != null
    ? `${resultsYear}${result.uncontested ? " · unopposed" : ""}`
    : null;

  // The party buckets are all the Klarner and hand-entered years can say, so they go inline —
  // three stacked rows for two numbers is what made this panel tall.
  const buckets: [string, number][] = result
    ? ([["D", result.demVotes ?? 0], ["R", result.repVotes ?? 0], ...(result.othVotes ? [["O", result.othVotes] as [string, number]] : [])] as [string, number][])
    : [];

  return (
    <section className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 truncate text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
          {districtLabel}
        </span>
        {displayedMargin != null && (
          <span
            className="ml-auto shrink-0 text-xs font-extrabold tabular-nums"
            style={{ color: displayedMargin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {viewMode === "seats"
              ? `${displayedMargin <= 0 ? "D" : "R"}+${Math.abs(displayedMargin).toFixed(1)}`
              : fmtMargin(displayedMargin)}
          </span>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className={`shrink-0 self-center${displayedMargin != null ? "" : " ml-auto"}`}
          style={{ color: "var(--app-text-very-muted)" }}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-0.5 text-[11px] leading-snug">
        {isResultsView ? (
          !result ? (
            <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>
              No {resultsYear} result for district {districtKey}
            </span>
          ) : resultMargin == null ? (
            <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>
              {resultsYear}: seat filled, no vote count published
            </span>
          ) : namedCandidates.length > 0 ? (
            // Names where the source carried them (2024 only) — one line each, since they are
            // too long to sit side by side.
            <div className="flex flex-col">
              {namedCandidates.map((c, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate" style={{ color: PARTY_COLOR[c.party] }}>
                    {c.name}
                    <span className="ml-1 font-bold">({c.party})</span>
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {c.votes.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2">
              {buckets.map(([party, votes]) => (
                <span key={party} className="whitespace-nowrap">
                  <span className="font-semibold" style={{ color: PARTY_COLOR[party] }}>{party}</span>{" "}
                  <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{votes.toLocaleString()}</span>
                </span>
              ))}
              {/* Rides the vote line rather than taking one of its own — two numbers and a year
                  fit across the panel. */}
              {footnote && (
                <span className="whitespace-nowrap text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{footnote}</span>
              )}
            </div>
          )
        ) : isPresidentialView ? (
          <span style={{ color: "var(--app-text-very-muted)" }}>
            {presidentialResult ? `2024 president${presidentialResult.estimated ? " · estimated" : ""}` : "2024 result not yet sourced"}
          </span>
        ) : incumbents.length > 0 ? (
          <div className="flex flex-col">
            {incumbents.map((inc, i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span className="min-w-0 truncate font-semibold" style={{ color: "var(--app-text-primary)" }}>{inc.name}</span>
                <span className="shrink-0 font-bold" style={{ color: PARTY_COLOR[inc.party] }}>({inc.party})</span>
                {inc.lastElection != null && (
                  <span className="ml-auto shrink-0 tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{inc.lastElection}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</span>
        )}
      </div>

      {/* Named candidates take a line each, so the year cannot ride with them. */}
      {footnote && namedCandidates.length > 0 && (
        <div className="text-[10px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>{footnote}</div>
      )}
      {viewMode === "seats" && district?.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
        <div className="text-[10px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>
          Last elected {district.lastElection}
        </div>
      )}
    </section>
  );
}

// Tallies whatever the map is currently showing: incumbent seats-by-party in "seats" mode
// (matching the hero stat row, including multi-member districts as one seat per incumbent),
// district-level 2024 presidential winners in "president" mode, or the districts each party
// carried in the selected past election, alongside that election's chamber-wide vote margin.
function DistrictCountBar({
  districts,
  pres2024,
  results,
  viewMode,
}: {
  districts: StateLegDistrict[];
  pres2024: Record<string, StateLegPres2024>;
  results: Record<string, StateLegDistrictResult> | null;
  viewMode: MapViewMode;
}) {
  const { stats, aggregateMargin } = useMemo(() => {
    if (viewMode === "results") {
      if (!results) return { stats: [], aggregateMargin: null };
      const won: Record<string, number> = { D: 0, R: 0, O: 0 };
      let noCount = 0;
      let dem = 0;
      let rep = 0;
      let total = 0;
      for (const [key, result] of Object.entries(results)) {
        // Votes the source could not attribute to a district still belong in the chamber total,
        // but there is no district for them to have been won in.
        if (isUnassignedResultKey(key)) {
          dem += result.demVotes ?? 0;
          rep += result.repVotes ?? 0;
          total += result.totalVotes ?? 0;
          continue;
        }
        const winner = resultWinner(result);
        // A district with no published count contributes to neither the seat tally nor the vote
        // total — counting its nulls as zeros would drag the chamber margin toward even.
        if (!winner) {
          noCount++;
          continue;
        }
        won[winner]++;
        dem += result.demVotes ?? 0;
        rep += result.repVotes ?? 0;
        total += result.totalVotes ?? 0;
      }
      const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "O"] as const)
        .filter((p) => won[p])
        .map((p) => ({ key: p as string, label: p as string, value: won[p], color: PARTY_COLOR[p] }));
      if (noCount > 0) entries.push({ key: "noCount", label: "No count", value: noCount, color: "var(--app-text-very-muted)" });
      return { stats: entries, aggregateMargin: total ? ((rep - dem) / total) * 100 : null };
    }
    if (viewMode === "president") {
      let dem = 0;
      let rep = 0;
      let missing = 0;
      for (const d of districts) {
        const result = pres2024[d.number];
        if (!result) missing++;
        else if (result.margin <= 0) dem++;
        else rep++;
      }
      return {
        stats: [
          { key: "D", label: "D", value: dem, color: PARTY_COLOR.D },
          { key: "R", label: "R", value: rep, color: PARTY_COLOR.R },
          ...(missing > 0 ? [{ key: "missing", label: "No data", value: missing, color: "var(--app-text-very-muted)" }] : []),
        ],
        aggregateMargin: null,
      };
    }
    const counts: Record<string, number> = {};
    let vacant = 0;
    for (const d of districts) {
      const incumbents = d.incumbents ?? [];
      if (incumbents.length === 0) {
        vacant++;
        continue;
      }
      for (const inc of incumbents) counts[inc.party] = (counts[inc.party] ?? 0) + 1;
    }
    const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "I", "O"] as const)
      .filter((p) => counts[p])
      .map((p) => ({ key: p, label: p, value: counts[p], color: PARTY_COLOR[p] }));
    if (vacant > 0) entries.push({ key: "vacant", label: "Vacant", value: vacant, color: "var(--app-text-very-muted)" });
    return { stats: entries, aggregateMargin: null };
  }, [districts, pres2024, results, viewMode]);

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {stats.map((s) => (
        <span key={s.key} className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold tabular-nums" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            {s.label}
          </span>
        </span>
      ))}
      {aggregateMargin != null && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            Chamber vote
          </span>
          <span className="text-sm font-extrabold tabular-nums" style={{ color: aggregateMargin <= 0 ? PARTY_COLOR.D : PARTY_COLOR.R }}>
            {fmtMargin(aggregateMargin)}
          </span>
        </span>
      )}
    </div>
  );
}

export default function StateLegSection({
  stateAbbr,
  stateName,
  districtsByChamber,
  mapInfoByChamber = {},
  pres2024ByChamber = {},
  calendarByChamber = {},
  historicalMapsByChamber = {},
  isUnicameral = false,
  compositionHouseEntries = [],
  compositionSenateEntries = [],
}: {
  stateAbbr: string;
  stateName: string;
  districtsByChamber: Partial<Record<Chamber, StateLegDistrict[]>>;
  mapInfoByChamber?: Partial<Record<Chamber, ChamberMapInfo>>;
  pres2024ByChamber?: Partial<Record<Chamber, Record<string, StateLegPres2024>>>;
  /** This state's election calendar and map eras — which past years the year pills can offer. */
  calendarByChamber?: Partial<Record<Chamber, StateLegCalendar>>;
  /** Election year -> the vintage of the superseded boundary file that election was held on. */
  historicalMapsByChamber?: Partial<Record<Chamber, Record<string, number>>>;
  isUnicameral?: boolean;
  /** Chamber composition history, shown in the right-hand panel's Composition tab. */
  compositionHouseEntries?: StateLegEntry[];
  compositionSenateEntries?: StateLegEntry[];
}) {
  const [chamber, setChamber] = useState<Chamber>("house");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>("seats");
  const [resultsYear, setResultsYear] = useState<number | null>(null);
  // Where unselecting a year card returns to — the last shading the map was on before a year.
  const [preResultsMode, setPreResultsMode] = useState<MapViewMode>("seats");
  // Nebraska's single chamber is classified as "senate" (SLDU) in Census/TIGER data, so
  // that's the chamber key its data is stored and looked up under even though the UI
  // just calls it "Legislature".
  const activeChamber = isUnicameral ? "senate" : chamber;
  // Memoised so the `?? []` fallback doesn't hand out a fresh array on every render, which
  // would defeat the worst-case-panel memo below.
  const districts = useMemo(() => districtsByChamber[activeChamber] ?? [], [districtsByChamber, activeChamber]);
  const pres2024 = pres2024ByChamber[activeChamber] ?? {};
  const calendar = calendarByChamber[activeChamber];
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[activeChamber];

  // Newest first — a reader looking for a past result almost always wants the most recent one.
  const electionYears = useMemo(
    () => [...(calendar?.electionYears ?? [])].sort((a, b) => b - a),
    [calendar]
  );
  const activeYear = resultsYear != null && electionYears.includes(resultsYear) ? resultsYear : electionYears[0] ?? null;

  // The whole-state results file is only fetched once a past year is actually opened.
  // Fetched as soon as the chamber has any past election, not only once a year is opened: the
  // history cards are the year picker, and the reserved panel slot below is sized from the tallest
  // real result, so both need this before the reader asks for a year. 10-26 KB gzipped per state.
  const { data: resultsData, loading: resultsLoading } = useStateLegResults(stateAbbr, electionYears.length > 0);
  const chamberResults = viewMode === "results" && activeYear != null
    ? resultsData?.[String(activeYear)]?.[activeChamber] ?? null
    : null;
  const results = chamberResults?.districts ?? null;

  const historicalVintage = activeYear != null ? historicalMapsByChamber[activeChamber]?.[String(activeYear)] : undefined;
  const boundaryUrl = viewMode === "results" && historicalVintage
    ? `/state-leg-districts-historical/${activeChamber}/${stateAbbr}-${historicalVintage}.json`
    : `/state-leg-districts/${activeChamber}/${stateAbbr}.json`;

  // The era the selected year was actually run under, so the caption under the map can name the
  // map rather than just the year — the point of the whole per-era boundary build.
  const era = useMemo(
    () => (activeYear == null ? undefined : calendar?.eras.find((e) => e.electionYears.includes(activeYear))),
    [calendar, activeYear]
  );
  // Computed in every view, not just results: the map lays this out invisibly behind the note
  // for the current view so the block's height doesn't change when the view does, and it can only
  // do that if it has the real text to measure.
  const boundaryNote = era
    ? `${chamberLabel} boundaries used in ${activeYear}${era.source ? ` · ${era.source}` : ""}${historicalVintage ? "" : " (still in effect)"}`
    : null;

  // A selected district belongs to one chamber's map, and to one era's lines; switching either
  // invalidates it, since the same code can be a different place or no place at all.
  const handleChamberSwitch = useCallback((c: Chamber) => {
    setChamber(c);
    setSelectedKey(null);
  }, []);

  // Asking for a past year with none chosen takes the most recent, so the history cards always
  // have one marked rather than leaving the choice made blind.
  const handleModeSelect = useCallback((mode: MapViewMode) => {
    if (mode === "results") {
      setResultsYear((y) => (y != null && electionYears.includes(y) ? y : electionYears[0] ?? null));
    } else {
      setPreResultsMode(mode);
    }
    setViewMode(mode);
  }, [electionYears]);

  // Clicking the card already on the map is an undo, not a no-op: it takes the year back off and
  // returns the map to whatever it was showing beforehand. The year itself is remembered, so
  // going back is one click either way.
  const handleYearSelect = useCallback((year: number) => {
    if (viewMode === "results" && year === activeYear) {
      setViewMode(preResultsMode);
      return;
    }
    setResultsYear(year);
    setViewMode("results");
  }, [viewMode, activeYear, preResultsMode]);

  const modeItems: [MapViewMode, string][] = [
    ["seats", "Seats"],
    ["president", "2024 President"],
    ...(electionYears.length > 0
      ? ([["results", viewMode === "results" && activeYear != null ? `${activeYear} results` : "Past results"]] as [MapViewMode, string][])
      : []),
  ];

  // Whether the year on screen ran on lines that are no longer in effect — the thing the
  // boundary note under the map is actually there to say.
  const boundaryBadge = viewMode === "results" && activeYear != null
    ? (historicalVintage ? `${activeYear} boundaries` : "Current boundaries")
    : null;
  useEffect(() => {
    setSelectedKey(null);
  }, [viewMode, activeYear]);

  const rowsListed = districtRowCount(districts, results, viewMode);

  const selectedDistrict = selectedKey ? districts.find((d) => d.number === selectedKey) : undefined;
  const selectedLabel = selectedKey
    ? (viewMode === "results" ? undefined : selectedDistrict?.label) ?? districtDisplayLabel(selectedKey, chamberLabel)
    : "";

  // The tallest panel this chamber can produce in ANY view and ANY year. Sizing it per view was
  // itself the shift: a one-incumbent panel in Seats and a four-candidate one in a past year meant
  // the reserved slot changed height whenever the view did.
  const tallestSeatsDistrict = useMemo(() => {
    let best: StateLegDistrict | undefined;
    let bestLines = -1;
    for (const d of districts) {
      const lines = d.incumbents?.length ?? 0;
      if (lines > bestLines) {
        bestLines = lines;
        best = d;
      }
    }
    return best;
  }, [districts]);

  const tallestResult = useMemo(() => {
    if (!resultsData) return null;
    let best: { key: string; result: StateLegDistrictResult } | null = null;
    let bestLines = -1;
    for (const byChamber of Object.values(resultsData)) {
      const rows = byChamber[activeChamber]?.districts;
      if (!rows) continue;
      for (const [key, result] of Object.entries(rows)) {
        if (isUnassignedResultKey(key)) continue;
        const named = (result.candidates ?? []).filter((c) => c.votes > 0).length;
        // With no names the panel falls back to party buckets: D, R, and Other where it ran.
        const lines = named > 0 ? named : result.othVotes ? 3 : 2;
        if (lines > bestLines) {
          bestLines = lines;
          best = { key, result };
        }
      }
    }
    return best;
  }, [resultsData, activeChamber]);

  // One per view, laid out invisibly on top of each other so the slot is as tall as the tallest
  // and no taller — the browser does the measuring.
  const reservePanels = (
    <>
      {tallestSeatsDistrict && (["seats", "president"] as MapViewMode[]).map((mode) => (
        <div key={mode} className="invisible col-start-1 row-start-1" aria-hidden>
          <SelectedDistrictPanel
            districtKey={tallestSeatsDistrict.number}
            districtLabel={tallestSeatsDistrict.label ?? districtDisplayLabel(tallestSeatsDistrict.number, chamberLabel)}
            district={tallestSeatsDistrict}
            viewMode={mode}
            presidentialResult={pres2024[tallestSeatsDistrict.number]}
            resultsYear={activeYear}
            onClose={() => {}}
          />
        </div>
      ))}
      {tallestResult && (
        <div className="invisible col-start-1 row-start-1" aria-hidden>
          <SelectedDistrictPanel
            districtKey={tallestResult.key}
            districtLabel={districtDisplayLabel(tallestResult.key, chamberLabel)}
            viewMode="results"
            result={tallestResult.result}
            resultsYear={activeYear}
            onClose={() => {}}
          />
        </div>
      )}
    </>
  );

  const selectedPanel = selectedKey ? (
    <SelectedDistrictPanel
      districtKey={selectedKey}
      districtLabel={selectedLabel}
      district={selectedDistrict}
      viewMode={viewMode}
      presidentialResult={pres2024[selectedKey]}
      result={results?.[selectedKey]}
      resultsYear={activeYear}
      onClose={() => setSelectedKey(null)}
    />
  ) : null;

  return (
    // Two rows: the map and the chamber's history side by side, then the district table on its
    // own full-width line under both.
    <div className="flex flex-col gap-6 md:gap-8">
      {/* On mobile the top row collapses to one flattened stack (the left column wrapper below
          switches to `display: contents`), so the per-item `order-N` classes keep one ordering for
          both layouts: the selected-district panel always sits under the map, and the year rail
          under that. */}
      <div className="grid grid-cols-1 gap-4 md:gap-8 md:grid-cols-2 md:items-stretch">
        <div className="contents md:flex md:flex-col md:gap-4">
          {/* Chamber toggle — hidden for unicameral Nebraska, which has one chamber */}
          {/* The two controls descend in scale with what they govern: the chamber tabs run the
              page, the shading row runs the map. */}
          <div className="order-1 min-w-0">
            <div className="flex items-end gap-5 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
              {isUnicameral ? (
                <span className="pb-2.5 text-sm font-semibold" style={{ color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }}>
                  Legislature
                </span>
              ) : (
                (["house", "senate"] as Chamber[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => handleChamberSwitch(c)}
                    className="pb-2.5 text-sm font-semibold transition-colors"
                    style={
                      chamber === c
                        ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                        : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }
                    }
                  >
                    {c === "house" ? "State House" : "State Senate"}
                  </button>
                ))
              )}
            </div>

            {/* Map shading. The last item carries the year the history cards chose, so its label
                can grow from "Past results" to "2020 results" with nothing to push. */}
            <div className="mt-3 flex flex-wrap items-baseline">
              {modeItems.map(([mode, label], i) => (
                <Fragment key={mode}>
                  {i > 0 && (
                    <span aria-hidden className="px-2.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      ·
                    </span>
                  )}
                  <button
                    onClick={() => handleModeSelect(mode)}
                    className="whitespace-nowrap text-[12.5px] transition-colors"
                    style={
                      viewMode === mode
                        ? {
                            color: "var(--app-text-primary)",
                            fontWeight: 600,
                            textDecoration: "underline",
                            textDecorationThickness: 2,
                            textUnderlineOffset: 6,
                          }
                        : { color: "var(--app-text-muted)", fontWeight: 500 }
                    }
                  >
                    {label}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Fixed minimum height: adding the chamber-vote stat in a past year swaps values, not
              geometry, so the map underneath never moves. The boundary badge is desktop-only —
              at phone widths it pushed this row onto a second line, and the same fact is already
              in the note under the map. */}
          <div className="order-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ minHeight: 26 }}>
            <DistrictCountBar districts={districts} pres2024={pres2024} results={results} viewMode={viewMode} />
            {boundaryBadge && (
              <span
                className="ml-auto hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap md:inline-block"
                title={boundaryNote ?? undefined}
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
              >
                {boundaryBadge}
              </span>
            )}
          </div>

          <div className="order-3">
            <StateLegDistrictMap
              stateAbbr={stateAbbr}
              stateName={stateName}
              chamber={activeChamber}
              isUnicameral={isUnicameral}
              mapInfo={mapInfoByChamber[activeChamber] ?? null}
              boundaryUrl={boundaryUrl}
              boundaryNote={boundaryNote}
              districts={districts}
              pres2024={pres2024}
              results={results}
              resultsYear={activeYear}
              resultsSource={chamberResults?.source ?? null}
              resultsLoading={resultsLoading}
              viewMode={viewMode}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              overlay={
                selectedPanel && (
                  <div
                    className="pointer-events-auto hidden rounded-md px-2.5 py-1.5 shadow-lg md:block"
                    style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
                  >
                    {selectedPanel}
                  </div>
                )
              }
            />
          </div>

          {/* On a phone the map is too small to float a panel over, so the panel stays in flow —
              and the slot is always in the stack, at a fixed height, so opening a district swaps
              the contents rather than pushing the rest of the page down under the reader's thumb.
              A district with a long candidate list scrolls inside the slot for the same reason. */}
          {districts.length > 0 && (
            // Both children share one grid cell: the invisible worst-case panel sets the height,
            // the real content overlays it. The browser does the measuring, so the reserved space
            // is exactly as tall as this chamber's biggest panel and no taller.
            <div className="order-4 grid md:hidden">
              {reservePanels}
              <div className="col-start-1 row-start-1">
                {selectedPanel ?? (
                  <div
                    className="flex h-full items-center justify-center rounded-lg px-4 text-center"
                    style={{ border: "1px dashed var(--app-border)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      Select a district for more information
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* The chamber's history — beside the map on desktop, and below it in the stack on a
            phone, where it keeps its own scrollbox. Taken out of flow at md and up so the column
            matches the map column's height exactly rather than guessing at it — which is what cut
            cards in half at a fixed 25rem. */}
        <div className="order-6 md:relative">
          <div className="flex flex-col md:absolute md:inset-0">
            <StateLegCompositionBox
              houseEntries={compositionHouseEntries}
              senateEntries={compositionSenateEntries}
              isUnicameral={isUnicameral}
              chamber={activeChamber}
              majorityInfo={mapInfoByChamber[activeChamber] ?? null}
              activeYear={viewMode === "results" ? activeYear : null}
              selectableYears={electionYears}
              onSelectYear={handleYearSelect}
            />
          </div>
        </div>
      </div>

      {/* The district table, on its own line under both columns rather than tabbed behind the
          history it used to share a panel with. Centred and width-capped: six columns spread
          across the full page read as scattered rather than as a table. Flat on the page, like
          every other section here — the heading rule is the only edge it needs. */}
      <section className="mx-auto flex h-[25rem] w-full max-w-5xl min-w-0 flex-col md:h-[34rem]">
        <div
          className="mb-2 flex shrink-0 items-baseline justify-between gap-3 pb-2"
          style={{ borderBottom: "2px solid var(--app-text-primary)" }}
        >
          <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
            {viewMode === "results" ? `${activeYear} ${chamberLabel} Results` : `${chamberLabel} Districts`}
          </h2>
          <span className="shrink-0 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            {rowsListed} district{rowsListed !== 1 ? "s" : ""}
          </span>
        </div>
        <StateLegDistrictTable
          districts={districts}
          chamber={activeChamber}
          stateName={stateName}
          isUnicameral={isUnicameral}
          pres2024={pres2024}
          results={results}
          resultsYear={activeYear}
          resultsLoading={resultsLoading}
          viewMode={viewMode}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
      </section>
    </div>
  );
}
