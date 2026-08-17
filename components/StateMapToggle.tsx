"use client";

import { useMemo, useState } from "react";
import type { RaceForecast, PastResult } from "@/data/forecastData";
import StateDistrictMap from "./StateDistrictMap";
import HousePastMap from "./HousePastMap";
import PastElectionsCountyMap from "./PastElectionsCountyMap";

type MapView = "projection" | "past" | "county";
const ELECTION_YEARS = [2024, 2022, 2020, 2018, 2016];

export default function StateMapToggle({
  abbr,
  stateName,
  stateFips,
  houseRaces,
  housePastResults,
  selected,
  onSelect,
}: {
  abbr: string;
  stateName: string;
  stateFips: string;
  houseRaces: RaceForecast[];
  housePastResults: Record<string, PastResult[]>;
  selected: RaceForecast | null;
  onSelect: (race: RaceForecast | null) => void;
}) {
  const [view, setView] = useState<MapView>("projection");
  const availablePastYears = useMemo(() => {
    const found = new Set<number>();
    for (const results of Object.values(housePastResults)) {
      for (const result of results) found.add(result.year);
    }
    for (const race of houseRaces) {
      for (const result of race.pastResults ?? []) found.add(result.year);
    }
    return ELECTION_YEARS.filter((year) => found.has(year));
  }, [housePastResults, houseRaces]);
  const [selectedPastYear, setSelectedPastYear] = useState(availablePastYears[0] ?? 2024);

  const tabs: { id: MapView; label: string }[] = [
    { id: "projection", label: "2026" },
    { id: "past", label: "Past" },
    { id: "county", label: "County" },
  ];

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      {/* Toggle header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 min-w-0"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Map
        </span>
        <div
          className="flex shrink-0 rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--app-border)" }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                view === t.id
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "transparent", color: "var(--app-text-muted)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {view === "past" && availablePastYears.length > 0 && (
          <div className="relative ml-auto min-w-0">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pr-5 scrollbar-none sm:pr-0">
              {availablePastYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedPastYear(year)}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                  style={
                    year === selectedPastYear
                      ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                      : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
                  }
                >
                  {year}
                </button>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-end sm:hidden"
              style={{ background: "linear-gradient(to right, transparent, var(--app-panel) 55%)", color: "var(--app-text-muted)" }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Map content */}
      {view === "projection" ? (
        <StateDistrictMap
          houseRaces={houseRaces}
          stateAbbr={abbr}
          stateName={stateName}
          selected={selected}
          onSelect={onSelect}
        />
      ) : view === "past" ? (
        availablePastYears.length > 0 ? (
          <HousePastMap
            key={selectedPastYear}
            houseRaces={houseRaces}
            historicalResults={housePastResults}
            stateAbbr={abbr}
            stateFips={stateFips}
            selectedYear={selectedPastYear}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: 360, background: "var(--app-bg)" }}>
            <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
              No past House results available for {stateName}.
            </p>
          </div>
        )
      ) : (
        <PastElectionsCountyMap
          stateAbbr={abbr}
          stateName={stateName}
        />
      )}
    </section>
  );
}
