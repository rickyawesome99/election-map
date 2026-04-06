"use client";

import { useMemo, useState } from "react";
import OH31Map from "@/components/OH31Map";
import OH31PrecinctTable from "@/components/OH31PrecinctTable";
import OH31TownshipTable from "@/components/OH31TownshipTable";
import OH31SwingTable from "@/components/OH31SwingTable";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016 } from "@/data/oh31PrecinctData2016";
import { filterPrecincts, sumRace, type TownshipFilter } from "@/lib/oh31Analysis";

type TableYear = "2024" | "2022" | "2020" | "2018" | "2016";

const TOTAL_LABELS: Record<TableYear, { pres: string; senate: string; uSHouse: string; stRep: string }> = {
  "2024": { pres: "2024 President", senate: "2024 Senate",  uSHouse: "2024 House", stRep: "2024 State Rep" },
  "2022": { pres: "2022 Governor",  senate: "2022 Senate",  uSHouse: "2022 House", stRep: "2022 State Rep" },
  "2020": { pres: "2020 President", senate: "2020 Senate",  uSHouse: "2020 House", stRep: "2020 State Rep" },
  "2018": { pres: "2018 Governor",  senate: "2018 Senate",  uSHouse: "2018 House", stRep: "2018 State Rep" },
  "2016": { pres: "2016 President", senate: "2016 Senate",  uSHouse: "2016 House", stRep: "2016 State Rep" },
};

// 2020 had no Ohio U.S. Senate race
const HIDDEN_RACES: Partial<Record<TableYear, string[]>> = {
  "2020": ["senate"],
};

function getDataset(year: TableYear) {
  switch (year) {
    case "2024": return oh31PrecinctData;
    case "2022": return oh31PrecinctData2022;
    case "2020": return oh31PrecinctData2020;
    case "2018": return oh31PrecinctData2018;
    case "2016": return oh31PrecinctData2016;
  }
}

const TBD_YEARS: TableYear[] = [];

export default function OH31AnalysisContent() {
  const [mapYear, setMapYear] = useState<TableYear>("2024");
  const [tableYear, setTableYear] = useState<TableYear>("2024");
  const [townshipFilter, setTownshipFilter] = useState<TownshipFilter>("all");

  const activeDataset = getDataset(tableYear);
  const isTbdYear = TBD_YEARS.includes(tableYear);

  const filteredPrecincts = useMemo(
    () => filterPrecincts(activeDataset, townshipFilter),
    [activeDataset, townshipFilter]
  );

  const totalBallots = filteredPrecincts.reduce((sum, precinct) => sum + precinct.ballotsCast, 0);
  const totalRegistered = filteredPrecincts.reduce((sum, precinct) => sum + precinct.regVoters, 0);
  const turnoutPct = totalRegistered > 0 ? (totalBallots / totalRegistered) * 100 : 0;

  const labels = TOTAL_LABELS[tableYear];
  const hiddenRaces = HIDDEN_RACES[tableYear] ?? [];
  const totals = (
    [
      { key: "stRep",   label: labels.stRep   },
      { key: "pres",    label: labels.pres    },
      { key: "senate",  label: labels.senate  },
      { key: "uSHouse", label: labels.uSHouse },
    ] as { key: "stRep" | "pres" | "senate" | "uSHouse"; label: string }[]
  ).filter(({ key }) => !hiddenRaces.includes(key))
   .map(({ key, label }) => ({ label, ...sumRace(filteredPrecincts, key) }));

  return (
    <>
      <section id="oh31-map" className="scroll-mt-24">
        <OH31Map townshipFilter={townshipFilter} activeYear={mapYear} onYearChange={setMapYear} />
      </section>

      <OH31TownshipTable />

      <OH31SwingTable />

      <section className="mt-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>
            Vote Totals
          </h2>
          <div
            className="flex items-center gap-1 rounded-lg px-1 py-1"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
          >
            {(["2024", "2022", "2020", "2018", "2016"] as TableYear[]).map((yr) => (
              <button
                key={yr}
                onClick={() => setTableYear(yr)}
                aria-pressed={tableYear === yr}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={
                  tableYear === yr
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                    : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                }
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <div className="grid grid-cols-3" style={{ background: "var(--app-bg)" }}>
          <div className="px-3 md:px-4 py-3 md:py-4" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Precincts
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {isTbdYear ? <span style={{ color: "var(--app-text-muted)", fontSize: "0.9em" }}>TBD</span> : filteredPrecincts.length}
            </div>
          </div>
          <div className="px-3 md:px-4 py-3 md:py-4" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Ballots Cast
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {isTbdYear ? <span style={{ color: "var(--app-text-muted)", fontSize: "0.9em" }}>TBD</span> : totalBallots.toLocaleString()}
            </div>
          </div>
          <div className="px-3 md:px-4 py-3 md:py-4">
            <div className="text-[10px] md:text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Turnout
            </div>
            <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>
              {isTbdYear ? <span style={{ color: "var(--app-text-muted)", fontSize: "0.9em" }}>TBD</span> : `${turnoutPct.toFixed(1)}%`}
            </div>
          </div>
        </div>
        <div
          className={`grid grid-cols-2 ${totals.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}
          style={{ background: "var(--app-bg)", borderTop: "1px solid var(--app-border)" }}
        >
          {isTbdYear ? (
            <div
              className="col-span-2 md:col-span-4 px-5 py-8 text-center text-sm"
              style={{ color: "var(--app-text-muted)" }}
            >
              Vote total data for {tableYear} coming soon
            </div>
          ) : (
            totals.map(({ label, d, r }, i) => {
              const total = d + r;
              const dPct = total > 0 ? (d / total) * 100 : 0;
              const rPct = total > 0 ? (r / total) * 100 : 0;
              const dWins = d > r;
              return (
                <div
                  key={label}
                  className="px-5 py-4"
                  style={{
                    borderRight: i < totals.length - 1 ? "1px solid var(--app-border)" : undefined,
                    borderBottom: totals.length >= 3 && i < 2 ? "1px solid var(--app-border)" : undefined,
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
            })
          )}
        </div>
        </div>
      </section>

      <section id="oh31-table" className="mt-10 scroll-mt-24">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          Precinct Results
        </h2>
        <OH31PrecinctTable
          data={filteredPrecincts}
          year={tableYear}
          townshipFilter={townshipFilter}
          setTownshipFilter={setTownshipFilter}
          totalPrecinctCount={activeDataset.length}
        />
      </section>
    </>
  );
}
