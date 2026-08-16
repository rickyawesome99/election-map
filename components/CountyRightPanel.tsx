"use client";

import { useState } from "react";
import { CountyDemographicsCard, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";

type Tab = "demographics" | "results";

export default function CountyRightPanel({
  demographics,
  results,
  fallbackYears,
  areaLabel,
}: {
  demographics: {
    collegePct?: number;
    whitePct?: number;
    blackPct?: number;
    hispanicPct?: number;
    asianPct?: number;
    medianHouseholdIncome?: number;
  };
  results: DetailPastResult[];
  fallbackYears: number[];
  areaLabel: string;
}) {
  const [tab, setTab] = useState<Tab>("demographics");

  return (
    <section className="rounded-xl overflow-hidden" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
      <div className="p-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <nav className="grid grid-cols-2 rounded-lg p-1 gap-0.5" style={{ background: "var(--app-tab-bg)" }}>
          {([
            ["demographics", "Demographics"],
            ["results", "Past Race Results"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors"
              style={tab === key ? { background: "var(--app-panel)", color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-3">
        {tab === "demographics" ? (
          <CountyDemographicsCard {...demographics} bare />
        ) : results.length > 0 ? (
          <PastElectionResultsSection
            results={results}
            fallbackYears={fallbackYears}
            showElectionType
            showSpecialBadgeForSpecialElections
            scrollable
            maxHeight="363px"
            bare
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
            No historical election results available for this {areaLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </section>
  );
}
