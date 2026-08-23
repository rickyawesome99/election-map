"use client";

import { useState } from "react";
import type { RaceForecast, PastResult } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import StateMapToggle from "./StateMapToggle";

export default function StateMapSection({
  overview,
  children,
  houseRaces,
  housePastResults,
  stateAbbr,
  stateName,
  stateFips,
}: {
  overview: React.ReactNode;
  children: React.ReactNode;
  houseRaces: RaceForecast[];
  housePastResults: Record<string, PastResult[]>;
  stateAbbr: string;
  stateName: string;
  stateFips: string;
}) {
  const [selected, setSelected] = useState<RaceForecast | null>(null);
  const demPct = selected ? Math.max(0, Math.min(100, 50 - selected.margin / 2)) : 0;
  const repPct = 100 - demPct;
  const { bg: rBg, text: rText } = selected ? getRatingColors(selected.rating) : { bg: "", text: "" };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
      <div className="contents md:flex md:flex-col md:gap-3 md:h-full">
        <div className="order-1">
          <StateMapToggle
            abbr={stateAbbr}
            stateName={stateName}
            stateFips={stateFips}
            houseRaces={houseRaces}
            housePastResults={housePastResults}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        {overview}
      </div>

      <div className="contents md:flex md:h-full md:min-h-0 md:flex-col md:self-stretch md:gap-3 [&>section:last-child]:md:min-h-0 [&>section:last-child]:md:flex-1">
        {selected && (
          <div className="order-2">
          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-3 mb-1"
              style={{ borderBottom: "2px solid var(--app-text-primary)" }}
            >
              <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
                Selected District
              </h2>
              <button onClick={() => setSelected(null)} className="shrink-0" style={{ color: "var(--app-text-very-muted)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="py-5 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-base font-bold" style={{ color: "var(--app-text-primary)" }}>
                      {selected.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: rBg, color: rText }}>
                      {selected.rating}
                    </span>
                  </div>

                  {selected.candidates ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--party-dem)" }}>
                          {selected.candidates.dem.name}{selected.candidates.dem.incumbent ? " (Inc.)" : ""}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--party-dem)" }}>{demPct.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--party-rep)" }}>
                          {selected.candidates.rep.name}{selected.candidates.rep.incumbent ? " (Inc.)" : ""}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--party-rep)" }}>{repPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
                  )}

                  <a
                    href={`/house/${selected.name.toLowerCase()}`}
                    className="mt-3 flex items-center gap-1 text-xs font-bold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    View Full Race Details
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
                <div
                  className="tabular-nums font-extrabold shrink-0"
                  style={{ fontSize: "1.75rem", lineHeight: 1, color: selected.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
                >
                  {selected.margin <= 0 ? "D" : "R"}+{Math.abs(selected.margin).toFixed(1)}
                </div>
              </div>
            </div>
          </section>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
