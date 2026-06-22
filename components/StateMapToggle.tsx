"use client";

import { useState } from "react";
import type { RaceForecast, HouseStatewideResult, PastResult } from "@/data/forecastData";
import StateDistrictMap from "./StateDistrictMap";
import HousePastMap from "./HousePastMap";
import PastElectionsMap from "./PastElectionsMap";
import PastElectionsCountyMap from "./PastElectionsCountyMap";

type MapView = "projection" | "past" | "cd" | "county";

export default function StateMapToggle({
  abbr,
  stateName,
  stateFips,
  houseRaces,
  housePastResults,
  selected,
  onSelect,
  pastElectionResults,
}: {
  abbr: string;
  stateName: string;
  stateFips: string;
  houseRaces: RaceForecast[];
  housePastResults: Record<string, PastResult[]>;
  selected: RaceForecast | null;
  onSelect: (race: RaceForecast | null) => void;
  pastElectionResults: Record<string, HouseStatewideResult[]>;
}) {
  const [view, setView] = useState<MapView>("projection");
  const [cdCountyKey, setCdCountyKey] = useState<string>("");

  const tabs: { id: MapView; label: string }[] = [
    { id: "projection", label: "Proj" },
    { id: "past", label: "Past" },
    { id: "cd", label: "District" },
    { id: "county", label: "County" },
  ];

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      {/* Toggle header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Map
        </span>
        <div
          className="flex rounded-lg overflow-hidden"
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
        <HousePastMap
          houseRaces={houseRaces}
          historicalResults={housePastResults}
          stateAbbr={abbr}
          stateName={stateName}
          stateFips={stateFips}
        />
      ) : view === "cd" ? (
        <PastElectionsMap
          stateAbbr={abbr}
          stateName={stateName}
          stateFips={stateFips}
          pastElectionResults={pastElectionResults}
          selectedKey={cdCountyKey}
          onSelectedKeyChange={setCdCountyKey}
        />
      ) : (
        <PastElectionsCountyMap
          stateAbbr={abbr}
          stateName={stateName}
          pastElectionResults={pastElectionResults}
          selectedKey={cdCountyKey}
          onSelectedKeyChange={setCdCountyKey}
        />
      )}
    </section>
  );
}
