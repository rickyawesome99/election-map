"use client";

import { useMemo } from "react";
import type { HouseStatewideResult } from "@/data/forecastData";
import StateCountyMap from "./StateCountyMap";

type ElectionOption = { year: number; race: string; key: string };

export default function PastElectionsCountyMap({
  stateAbbr,
  stateName,
  pastElectionResults,
  selectedKey,
  onSelectedKeyChange,
}: {
  stateAbbr: string;
  stateName: string;
  pastElectionResults: Record<string, HouseStatewideResult[]>;
  selectedKey: string;
  onSelectedKeyChange: (key: string) => void;
}) {
  const availableElections = useMemo<ElectionOption[]>(() => {
    const seen = new Set<string>();
    const out: ElectionOption[] = [];
    const MAJOR = new Set(["President", "Governor", "Senate"]);
    for (const results of Object.values(pastElectionResults)) {
      for (const r of results) {
        if (!MAJOR.has(r.race)) continue;
        const key = `${r.year}-${r.race}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ year: r.year, race: r.race, key });
        }
      }
    }
    return out.sort((a, b) => b.year - a.year || a.race.localeCompare(b.race));
  }, [pastElectionResults]);

  const sel = availableElections.find(e => e.key === selectedKey) ?? availableElections[0] ?? null;

  if (availableElections.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 360, background: "var(--app-bg)" }}>
        <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
          No past election data available for {stateName}.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        {availableElections.map(e => (
          <button
            key={e.key}
            onClick={() => onSelectedKeyChange(e.key)}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors shrink-0"
            style={
              e.key === sel?.key
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
            }
          >
            {e.year} {e.race}
          </button>
        ))}
      </div>

      <StateCountyMap stateAbbr={stateAbbr} stateName={stateName} />
    </div>
  );
}
