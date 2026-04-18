"use client";

import { useState } from "react";
import type { RaceForecast } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import StateMapToggle from "./StateMapToggle";
import Link from "next/link";

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
  const demPct = selected ? Math.max(0, Math.min(100, 50 + selected.margin / 2)) : 0;
  const repPct = 100 - demPct;
  const { bg: rBg, text: rText } = selected ? getRatingColors(selected.rating) : { bg: "", text: "" };
  const [, distNum = ""] = selected?.name.split("-") ?? [];
  const distLabel = distNum === "AL" ? "At-Large District" : distNum ? `District ${distNum}` : "";

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
      <div className="order-2 md:order-1 md:col-span-2 grid grid-cols-1 gap-4">
        {children}

        {selected && (
          <section
            className="rounded-xl p-4"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
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
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
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
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
                  Forecast
                </div>
                <div className="text-2xl font-bold mb-2" style={{ color: selected.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
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
        )}
      </div>

      <div className="order-1 md:order-2 md:col-span-1">
        <StateMapToggle
          abbr={stateAbbr}
          stateName={stateName}
          houseRaces={houseRaces}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}
