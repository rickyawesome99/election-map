"use client";

import { useState } from "react";
import type { RaceForecast } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import StateMapToggle from "./StateMapToggle";
import Link from "next/link";

// Map card height = 360px (content) + 49px (header + border) + 2px (section borders) = 411px
// Only lock heights when no district is selected; selected cards can exceed this height.
const MAP_CARD_H = "xl:h-[411px]";

export default function StateMapSection({
  children,
  houseRaces,
  stateAbbr,
  stateName,
}: {
  children: React.ReactNode;
  houseRaces: RaceForecast[];
  stateAbbr: string;
  stateName: string;
}) {
  const [selected, setSelected] = useState<RaceForecast | null>(null);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6 items-start">
      {/* Left column: map */}
      <StateMapToggle
        abbr={stateAbbr}
        stateName={stateName}
        houseRaces={houseRaces}
        selected={selected}
        onSelect={setSelected}
      />

      {/* Left column — fixed to exact map card height on desktop */}
      <div className={`flex flex-col gap-4 ${selected ? "" : MAP_CARD_H}`}>
        {/* Overview (natural height) */}
        {children}

        {/* Desktop selected district panel — flex-1 fills remaining height */}
        {selected && (() => {
          const demPct = Math.max(0, Math.min(100, 50 + selected.margin / 2));
          const repPct = 100 - demPct;
          const { bg: rBg, text: rText } = getRatingColors(selected.rating);
          const [, distNum] = selected.name.split("-");
          const distLabel = distNum === "AL" ? "At-Large District" : `District ${distNum}`;
          return (
            <section
              className="hidden xl:flex flex-col rounded-xl p-3 gap-2"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 shrink-0">
                <div className="flex flex-col gap-0.5">
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    Selected District
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>
                      {selected.name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{distLabel}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: rBg, color: rText }}>
                      {selected.rating}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 mt-0.5" style={{ color: "var(--app-text-very-muted)" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Candidates */}
              <div className="shrink-0">
                {selected.candidates ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold truncate" style={{ color: "var(--party-dem)" }}>
                      {selected.candidates.dem.name}{selected.candidates.dem.incumbent ? " (Inc.)" : ""}
                    </span>
                    <span className="shrink-0" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                    <span className="font-semibold truncate" style={{ color: "var(--party-rep)" }}>
                      {selected.candidates.rep.name}{selected.candidates.rep.incumbent ? " (Inc.)" : ""}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
                )}
              </div>

              {/* Stats + bar */}
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-1 text-xs flex-wrap">
                  <span style={{ color: "var(--party-dem)" }}>D {demPct.toFixed(1)}%</span>
                  <span style={{ color: "var(--app-text-very-muted)" }}>·</span>
                  <span style={{ color: "var(--party-rep)" }}>R {repPct.toFixed(1)}%</span>
                  <span className="font-semibold" style={{ color: selected.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                    {selected.margin >= 0 ? "D" : "R"}+{Math.abs(selected.margin).toFixed(1)}
                  </span>
                  <span className="font-semibold" style={{ color: selected.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                    {Math.round(selected.probability * 100)}% {selected.margin >= 0 ? "D" : "R"} win
                  </span>
                </div>
                <div className="flex h-1 rounded-full overflow-hidden">
                  <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                  <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                </div>
              </div>

              {/* Link */}
              <Link
                href={`/house/${selected.id}`}
                className="flex items-center justify-center gap-1 py-1 rounded-md text-xs font-semibold transition-colors shrink-0"
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
              >
                View Full Race Details
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </section>
          );
        })()}
      </div>
    </div>
  );
}
