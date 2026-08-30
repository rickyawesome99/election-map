"use client";

import { useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import StateLegDistrictMap from "./StateLegDistrictMap";
import StateLegDistrictTable from "./StateLegDistrictTable";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
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

// Deliberately compact — this sits above the "About the X Legislature" section on desktop, so
// it shouldn't push that content far down the page.
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
  const isPresidentialView = viewMode === "president";
  const isResultsView = viewMode === "results";
  const resultMargin = districtResultMargin(result);
  const displayedMargin = isResultsView
    ? resultMargin
    : isPresidentialView
      ? presidentialResult?.margin
      : district?.margin;
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2 mb-2" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          Selected District
        </h2>
        <button onClick={onClose} aria-label="Close" style={{ color: "var(--app-text-very-muted)" }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-start justify-between gap-3 pb-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="min-w-0">
          <div className="text-sm font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            {districtLabel}
          </div>
          {isResultsView ? (
            result ? (
              resultMargin == null ? (
                <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
                  {resultsYear}: seat filled, no vote count published
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold" style={{ color: PARTY_COLOR.D }}>D</span>
                    <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{(result.demVotes ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold" style={{ color: PARTY_COLOR.R }}>R</span>
                    <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{(result.repVotes ?? 0).toLocaleString()}</span>
                  </div>
                  {!!result.othVotes && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold" style={{ color: PARTY_COLOR.O }}>O</span>
                      <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{result.othVotes.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="mt-0.5" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>
                    {resultsYear} election{result.uncontested ? " · unopposed" : ""}
                  </div>
                </div>
              )
            ) : (
              <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
                No {resultsYear} result for district {districtKey}
              </div>
            )
          ) : isPresidentialView ? (
            <div className="text-xs" style={{ color: presidentialResult ? "var(--app-text-muted)" : "var(--app-text-very-muted)" }}>
              {presidentialResult ? "2024 presidential vote margin" : "2024 result not yet sourced"}
              {presidentialResult?.estimated && (
                <span className="ml-1 italic">(estimated)</span>
              )}
            </div>
          ) : incumbents.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {incumbents.map((inc, i) => (
                <div key={i} className="flex items-baseline gap-1.5 text-xs">
                  <span className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{inc.name}</span>
                  <span className="font-bold shrink-0" style={{ color: PARTY_COLOR[inc.party] }}>({inc.party})</span>
                  {inc.lastElection != null && (
                    <span className="shrink-0" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>{inc.lastElection}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</div>
          )}
          {viewMode === "seats" && district?.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
            <div className="mt-1" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>
              Last elected {district.lastElection}
            </div>
          )}
        </div>
        {displayedMargin != null && (
          <div
            className="tabular-nums font-extrabold shrink-0 text-base"
            style={{ color: displayedMargin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {viewMode === "seats"
              ? `${displayedMargin <= 0 ? "D" : "R"}+${Math.abs(displayedMargin).toFixed(1)}`
              : fmtMargin(displayedMargin)}
          </div>
        )}
      </div>
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
  sidebar,
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
  sidebar?: ReactNode;
}) {
  const [chamber, setChamber] = useState<Chamber>("house");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>("seats");
  const [resultsYear, setResultsYear] = useState<number | null>(null);
  // Nebraska's single chamber is classified as "senate" (SLDU) in Census/TIGER data, so
  // that's the chamber key its data is stored and looked up under even though the UI
  // just calls it "Legislature".
  const activeChamber = isUnicameral ? "senate" : chamber;
  const districts = districtsByChamber[activeChamber] ?? [];
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
  const { data: resultsData, loading: resultsLoading } = useStateLegResults(stateAbbr, viewMode === "results");
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
  const boundaryNote = viewMode === "results" && era
    ? `${chamberLabel} boundaries used in ${activeYear}${era.source ? ` · ${era.source}` : ""}${historicalVintage ? "" : " (still in effect)"}`
    : null;

  // A selected district belongs to one chamber's map, and to one era's lines; switching either
  // invalidates it, since the same code can be a different place or no place at all.
  const handleChamberSwitch = useCallback((c: Chamber) => {
    setChamber(c);
    setSelectedKey(null);
  }, []);
  useEffect(() => {
    setSelectedKey(null);
  }, [viewMode, activeYear]);

  const selectedDistrict = selectedKey ? districts.find((d) => d.number === selectedKey) : undefined;
  const selectedLabel = selectedKey
    ? (viewMode === "results" ? undefined : selectedDistrict?.label) ?? districtDisplayLabel(selectedKey, chamberLabel)
    : "";

  return (
    // On mobile this collapses to one flattened stack (both column wrappers below switch to
    // `display: contents`), so the per-item `order-N`/`md:order-N` classes place the selected-
    // district panel between the map and the table on mobile, but above the sidebar on desktop
    // — where it's a sibling inside the (now real) right-hand flex column instead.
    <div className="grid grid-cols-1 gap-4 md:gap-8 md:grid-cols-2 md:items-start">
      <div className="contents md:flex md:flex-col md:gap-4">
        {/* Chamber toggle — hidden for unicameral Nebraska, which has one chamber */}
        <div
          className="order-1 flex items-end justify-between gap-3 min-w-0"
          style={{ borderBottom: "1px solid var(--app-border)" }}
        >
          <div className="flex items-end gap-5 min-w-0">
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

          {/* Map view-mode toggle — orthogonal to the chamber toggle above */}
          <div className="mb-1.5 flex shrink-0 items-center gap-0.5 rounded-full p-0.5" style={{ background: "var(--app-tab-bg)" }}>
            {([
              ["seats", "Seats"],
              ["president", "2024 President"],
              ...(electionYears.length > 0 ? [["results", "Past results"] as [MapViewMode, string]] : []),
            ] as [MapViewMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
                style={
                  viewMode === mode
                    ? { background: "var(--app-panel)", color: "var(--app-text-primary)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="order-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <DistrictCountBar districts={districts} pres2024={pres2024} results={results} viewMode={viewMode} />
          {viewMode === "results" && electionYears.length > 0 && (
            <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
              {electionYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setResultsYear(year)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                  style={
                    year === activeYear
                      ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                      : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
                  }
                >
                  {year}
                </button>
              ))}
            </div>
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
          />
        </div>

        <div className="order-5">
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
          />
        </div>
      </div>

      <div className="contents md:flex md:flex-col md:gap-8">
        {selectedKey && (
          <div className="order-4 md:order-1">
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
          </div>
        )}
        <div className="order-5 md:order-2 flex flex-col gap-8">{sidebar}</div>
      </div>
    </div>
  );
}
