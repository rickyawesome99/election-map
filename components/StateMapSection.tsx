"use client";

import { useState } from "react";
import type { RaceForecast, HouseStatewideResult } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import StateMapToggle from "./StateMapToggle";
import Link from "next/link";

export default function StateMapSection({
  overview,
  children,
  houseRaces,
  stateAbbr,
  stateName,
  stateFips,
  pastElectionResults,
}: {
  overview: React.ReactNode;
  children: React.ReactNode;
  houseRaces: RaceForecast[];
  stateAbbr: string;
  stateName: string;
  stateFips: string;
  pastElectionResults: Record<string, HouseStatewideResult[]>;
}) {
  const [selected, setSelected] = useState<RaceForecast | null>(null);
  const demPct = selected ? Math.max(0, Math.min(100, 50 + selected.margin / 2)) : 0;
  const repPct = 100 - demPct;
  const { bg: rBg, text: rText } = selected ? getRatingColors(selected.rating) : { bg: "", text: "" };
  const [, distNum = ""] = selected?.name.split("-") ?? [];
  const distLabel = distNum === "AL" ? "At-Large District" : distNum ? `District ${distNum}` : "";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] md:items-stretch">
      <div className="contents md:flex md:flex-col md:gap-3 md:h-full">
        <div className="order-1">
          <StateMapToggle
            abbr={stateAbbr}
            stateName={stateName}
            stateFips={stateFips}
            houseRaces={houseRaces}
            selected={selected}
            onSelect={setSelected}
            pastElectionResults={pastElectionResults}
          />
        </div>
        {selected && (
          <div className="order-8 md:order-2">
          <section
            className="rounded-xl p-3"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  Candidates
                </div>
                {selected.candidates ? (
                  <div className="flex flex-col gap-1.5 text-sm">
                    <div className="font-semibold truncate" style={{ color: "var(--party-dem)" }}>
                      {selected.candidates.dem.name}{selected.candidates.dem.incumbent ? " (Inc.)" : ""}
                    </div>
                    <div className="font-semibold truncate" style={{ color: "var(--party-rep)" }}>
                      {selected.candidates.rep.name}{selected.candidates.rep.incumbent ? " (Inc.)" : ""}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
                )}
              </div>

              <div className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  Forecast
                </div>
                <div className="text-xl font-bold mb-1.5" style={{ color: selected.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                  {selected.margin >= 0 ? "D" : "R"}+{Math.abs(selected.margin).toFixed(1)}
                </div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span style={{ color: "var(--party-dem)" }}>D {demPct.toFixed(1)}%</span>
                  <span style={{ color: "var(--party-rep)" }}>R {repPct.toFixed(1)}%</span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2" style={{ background: "var(--app-tab-bg)" }}>
                  <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                  <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                </div>
                <div className="text-xs font-semibold" style={{ color: selected.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                  {Math.round(selected.probability * 100)}% {selected.margin >= 0 ? "D" : "R"} win probability
                </div>
              </div>
            </div>

            <Link
              href={`/house/${selected.id}`}
              className="mt-3 flex items-center justify-center gap-1 rounded-md py-2 text-xs font-semibold transition-colors"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
            >
              View Full Race Details
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </section>
          </div>
        )}
        {overview}
      </div>

      <div className="contents md:flex md:h-full md:min-h-0 md:flex-col md:self-stretch md:gap-3 [&>section:last-child]:md:min-h-0 [&>section:last-child]:md:flex-1">
        {children}
      </div>
    </div>
  );
}
