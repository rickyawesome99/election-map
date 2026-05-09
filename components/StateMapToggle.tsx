"use client";

import { useState } from "react";
import type { RaceForecast } from "@/data/forecastData";
import StateDistrictMap from "./StateDistrictMap";
import StateCountyMap from "./StateCountyMap";

type MapView = "county" | "districts";

export default function StateMapToggle({
  abbr,
  stateName,
  houseRaces,
  selected,
  onSelect,
}: {
  abbr: string;
  stateName: string;
  houseRaces: RaceForecast[];
  selected: RaceForecast | null;
  onSelect: (race: RaceForecast | null) => void;
}) {
  const [view, setView] = useState<MapView>("districts");

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
          {(["districts", "county"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                view === v
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "transparent", color: "var(--app-text-muted)" }
              }
            >
              {v === "county" ? "County" : "Congressional Districts"}
            </button>
          ))}
        </div>
      </div>

      {/* Map content */}
      {view === "districts" ? (
        <StateDistrictMap
          houseRaces={houseRaces}
          stateAbbr={abbr}
          stateName={stateName}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <StateCountyMap stateAbbr={abbr} stateName={stateName} />
      )}
    </section>
  );
}
