"use client";

import { useMemo, useState } from "react";
import OH31Map from "@/components/OH31Map";
import OH31PrecinctTable from "@/components/OH31PrecinctTable";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { filterPrecincts, sumRace, type TownshipFilter } from "@/lib/oh31Analysis";

const TOTAL_LABELS = {
  pres: "2024 President",
  senate: "2024 Senate",
  uSHouse: "2024 House",
  stRep: "2024 State Rep",
} as const;

export default function OH31AnalysisContent() {
  const [townshipFilter, setTownshipFilter] = useState<TownshipFilter>("all");

  const filteredPrecincts = useMemo(
    () => filterPrecincts(oh31PrecinctData, townshipFilter),
    [townshipFilter]
  );

  const totalBallots = filteredPrecincts.reduce((sum, precinct) => sum + precinct.ballotsCast, 0);
  const totalRegistered = filteredPrecincts.reduce((sum, precinct) => sum + precinct.regVoters, 0);
  const turnoutPct = totalRegistered > 0 ? (totalBallots / totalRegistered) * 100 : 0;

  const totals = {
    stRep: { label: TOTAL_LABELS.stRep, ...sumRace(filteredPrecincts, "stRep") },
    pres: { label: TOTAL_LABELS.pres, ...sumRace(filteredPrecincts, "pres") },
    senate: { label: TOTAL_LABELS.senate, ...sumRace(filteredPrecincts, "senate") },
    uSHouse: { label: TOTAL_LABELS.uSHouse, ...sumRace(filteredPrecincts, "uSHouse") },
  };

  return (
    <>
      <section id="oh31-map" className="scroll-mt-24">
        <OH31Map />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          Vote Totals
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <div className="grid grid-cols-3" style={{ background: "var(--app-bg)" }}>
          <div className="px-3 md:px-4 py-3 md:py-4" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Precincts
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {filteredPrecincts.length}
            </div>
          </div>
          <div className="px-3 md:px-4 py-3 md:py-4" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Ballots Cast
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {totalBallots.toLocaleString()}
            </div>
          </div>
          <div className="px-3 md:px-4 py-3 md:py-4">
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Turnout
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {turnoutPct.toFixed(1)}%
            </div>
            <div className="text-[10px] md:text-xs mt-1 leading-tight" style={{ color: "var(--app-text-muted)" }}>
              {totalRegistered.toLocaleString()} registered voters
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ background: "var(--app-bg)", borderTop: "1px solid var(--app-border)" }}>
          {Object.values(totals).map(({ label, d, r }, i) => {
            const total = d + r;
            const dPct = total > 0 ? (d / total) * 100 : 0;
            const rPct = total > 0 ? (r / total) * 100 : 0;
            const dWins = d > r;
            return (
              <div
                key={label}
                className="px-5 py-4"
                style={{
                  borderRight: i < 3 ? "1px solid var(--app-border)" : undefined,
                  borderBottom: i < 2 ? "1px solid var(--app-border)" : undefined,
                }}
              >
                <div className="text-[11px] md:text-xs font-medium mb-2 md:mb-3 text-center" style={{ color: "var(--app-text-muted)" }}>
                  {label}
                </div>
                <div className="grid grid-cols-3 items-end gap-1 mb-2 text-center">
                  <div className="flex flex-col items-center">
                    <div className="text-base md:text-lg font-bold tabular-nums leading-none" style={{ color: "var(--party-dem, #1b408c)" }}>
                      {d.toLocaleString()}
                    </div>
                    <div className="text-[11px] md:text-xs tabular-nums mt-1" style={{ color: "var(--app-text-muted)" }}>
                      {dPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div
                      className="text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded whitespace-nowrap"
                      style={{
                        background: dWins ? "var(--party-dem-subtle, #dbeafe)" : "var(--party-rep-subtle, #fee2e2)",
                        color: dWins ? "var(--party-dem, #1b408c)" : "var(--party-rep, #be1c29)",
                      }}
                    >
                      {dWins ? "D" : "R"}+{Math.abs(dPct - rPct).toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-base md:text-lg font-bold tabular-nums leading-none" style={{ color: "var(--party-rep, #be1c29)" }}>
                      {r.toLocaleString()}
                    </div>
                    <div className="text-[11px] md:text-xs tabular-nums mt-1" style={{ color: "var(--app-text-muted)" }}>
                      {rPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mx-auto" style={{ background: "var(--app-border)", width: "92%" }}>
                  <div className="h-full rounded-full" style={{ width: `${dPct}%`, background: "var(--party-dem, #1b408c)" }} />
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </section>

      <section id="oh31-table" className="mt-10 scroll-mt-24">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          Precinct Results
        </h2>
        <OH31PrecinctTable
          data={filteredPrecincts}
          townshipFilter={townshipFilter}
          setTownshipFilter={setTownshipFilter}
          totalPrecinctCount={oh31PrecinctData.length}
        />
      </section>
    </>
  );
}
