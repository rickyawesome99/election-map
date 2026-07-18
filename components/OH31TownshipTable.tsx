"use client";

import { Fragment, useMemo, useState } from "react";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016 } from "@/data/oh31PrecinctData2016";
import { TOWNSHIP_OPTIONS, filterPrecincts, sumRace } from "@/lib/oh31Analysis";
import type { TownshipFilter } from "@/lib/oh31Analysis";
import type { OH31RaceKey } from "@/lib/oh31Analysis";

type Mode = "results" | "swing";
type ResultsViewMode = "race" | "year";
type ResultsRaceFilter = "stRep" | "president" | "governor" | "senate" | "house";
type ResultsYearFilter = "2024" | "2022" | "2020" | "2018" | "2016";
type SwingYearFilter = "2024" | "2022" | "2020" | "2018";

const RACES_2024: { key: OH31RaceKey; label: string }[] = [
  { key: "stRep",   label: "St. Rep"   },
  { key: "pres",    label: "President" },
  { key: "senate",  label: "Senate"    },
  { key: "uSHouse", label: "House"     },
];

const RACES_2022: { key: OH31RaceKey; label: string }[] = [
  { key: "stRep",   label: "St. Rep"  },
  { key: "pres",    label: "Governor" },
  { key: "senate",  label: "Senate"   },
  { key: "uSHouse", label: "House"    },
];

// 2020: no Senate race
const RACES_2020: { key: OH31RaceKey; label: string }[] = [
  { key: "stRep",   label: "St. Rep"   },
  { key: "pres",    label: "President" },
  { key: "uSHouse", label: "House"     },
];

const RACES_2018: { key: OH31RaceKey; label: string }[] = [
  { key: "stRep",   label: "St. Rep"  },
  { key: "pres",    label: "Governor" },
  { key: "senate",  label: "Senate"   },
  { key: "uSHouse", label: "House"    },
];

const RACES_2016: { key: OH31RaceKey; label: string }[] = [
  { key: "stRep",   label: "St. Rep"   },
  { key: "pres",    label: "President" },
  { key: "senate",  label: "Senate"    },
  { key: "uSHouse", label: "House"     },
];

const RESULTS_RACE_FILTERS: { key: ResultsRaceFilter; label: string }[] = [
  { key: "stRep", label: "St Rep" },
  { key: "president", label: "President" },
  { key: "governor", label: "Governor" },
  { key: "senate", label: "Senate" },
  { key: "house", label: "House" },
];

const RESULTS_YEAR_FILTERS: { key: ResultsYearFilter; label: string }[] = [
  { key: "2024", label: "2024" },
  { key: "2022", label: "2022" },
  { key: "2020", label: "2020" },
  { key: "2018", label: "2018" },
  { key: "2016", label: "2016" },
];

const SWING_YEAR_FILTERS: { key: SwingYearFilter; label: string }[] = [
  { key: "2024", label: "2024" },
  { key: "2022", label: "2022" },
  { key: "2020", label: "2020" },
  { key: "2018", label: "2018" },
];

const RESULT_YEAR_GROUPS = [
  { year: "2024", votesKey: "votes2024", marginsKey: "margins2024", races: RACES_2024 },
  { year: "2022", votesKey: "votes2022", marginsKey: "margins2022", races: RACES_2022 },
  { year: "2020", votesKey: "votes2020", marginsKey: "margins2020", races: RACES_2020 },
  { year: "2018", votesKey: "votes2018", marginsKey: "margins2018", races: RACES_2018 },
  { year: "2016", votesKey: "votes2016", marginsKey: "margins2016", races: RACES_2016 },
] as const;

function matchesResultsRaceFilter(race: { key: OH31RaceKey; label: string }, filter: ResultsRaceFilter): boolean {
  switch (filter) {
    case "stRep":
      return race.key === "stRep";
    case "president":
      return race.key === "pres" && (race.label === "President" || race.label === "Pres");
    case "governor":
      return race.key === "pres" && (race.label === "Governor" || race.label === "Gov");
    case "senate":
      return race.key === "senate";
    case "house":
      return race.key === "uSHouse";
  }
}

function computeMargin(d: number, r: number): number {
  const total = d + r;
  return total === 0 ? 0 : ((d - r) / total) * 100;
}

function formatMargin(margin: number): string {
  return margin >= 0
    ? `D+${margin.toFixed(1)}`
    : `R+${Math.abs(margin).toFixed(1)}`;
}

function swing(
  key: OH31RaceKey,
  newer: ReturnType<typeof filterPrecincts>,
  older: ReturnType<typeof filterPrecincts>
): number {
  const { d: dN, r: rN } = sumRace(newer, key);
  const { d: dO, r: rO } = sumRace(older, key);
  return computeMargin(dN, rN) - computeMargin(dO, rO);
}

const YEAR_GROUPS = [
  {
    year: "2024",
    cols: [
      { label: "St Rep",  sub: "24 vs 22", key: "stRep"   as OH31RaceKey, newer: "p24", older: "p22" },
      { label: "Pres",    sub: "24 vs 20", key: "pres"    as OH31RaceKey, newer: "p24", older: "p20" },
      { label: "Senate",  sub: "24 vs 22", key: "senate"  as OH31RaceKey, newer: "p24", older: "p22" },
      { label: "House",   sub: "24 vs 22", key: "uSHouse" as OH31RaceKey, newer: "p24", older: "p22" },
    ],
  },
  {
    year: "2022",
    cols: [
      { label: "St Rep",  sub: "22 vs 20", key: "stRep"   as OH31RaceKey, newer: "p22", older: "p20" },
      { label: "Gov",     sub: "22 vs 18", key: "pres"    as OH31RaceKey, newer: "p22", older: "p18" },
      { label: "Senate",  sub: "22 vs 18", key: "senate"  as OH31RaceKey, newer: "p22", older: "p18" },
      { label: "House",   sub: "22 vs 20", key: "uSHouse" as OH31RaceKey, newer: "p22", older: "p20" },
    ],
  },
  {
    year: "2020",
    cols: [
      { label: "St Rep",  sub: "20 vs 18", key: "stRep"   as OH31RaceKey, newer: "p20", older: "p18" },
      { label: "Pres",    sub: "20 vs 16", key: "pres"    as OH31RaceKey, newer: "p20", older: "p16" },
      { label: "House",   sub: "20 vs 18", key: "uSHouse" as OH31RaceKey, newer: "p20", older: "p18" },
    ],
  },
  {
    year: "2018",
    cols: [
      { label: "St Rep",  sub: "18 vs 16", key: "stRep"   as OH31RaceKey, newer: "p18", older: "p16" },
      { label: "Senate",  sub: "18 vs 16", key: "senate"  as OH31RaceKey, newer: "p18", older: "p16" },
      { label: "House",   sub: "18 vs 16", key: "uSHouse" as OH31RaceKey, newer: "p18", older: "p16" },
    ],
  },
] as const;

const HEADER_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  borderBottom: "1px solid var(--app-border)",
  whiteSpace: "nowrap",
};

const CELL_STYLE: React.CSSProperties = {
  padding: "7px 10px",
  textAlign: "center",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--app-border)",
};

const TOWNSHIP_CELL_STYLE: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--app-border)",
  color: "var(--app-text-primary)",
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "var(--app-bg)",
  boxShadow: "inset -1px 0 0 var(--app-border)",
};

const STICKY_HEADER_STYLE: React.CSSProperties = {
  ...HEADER_STYLE,
  textAlign: "left",
  paddingLeft: 12,
  position: "sticky",
  left: 0,
  zIndex: 3,
  backgroundColor: "var(--app-panel)",
  boxShadow: "inset -1px 0 0 var(--app-border)",
};

const STICKY_GROUP_HEADER_STYLE: React.CSSProperties = {
  ...HEADER_STYLE,
  position: "sticky",
  left: 0,
  zIndex: 3,
  backgroundColor: "var(--app-panel)",
  boxShadow: "inset -1px 0 0 var(--app-border)",
};

function ResultsTable({
  viewMode,
  raceFilter,
  yearFilter,
}: {
  viewMode: ResultsViewMode;
  raceFilter: ResultsRaceFilter;
  yearFilter: ResultsYearFilter;
}) {
  const townships = TOWNSHIP_OPTIONS.filter((t) => t.value !== "all");

  const rows = useMemo(() => {
    return townships.map(({ value, label }) => {
      const filter = value as TownshipFilter;
      const p24 = filterPrecincts(oh31PrecinctData, filter);
      const p22 = filterPrecincts(oh31PrecinctData2022, filter);
      const p20 = filterPrecincts(oh31PrecinctData2020, filter);
      const p18 = filterPrecincts(oh31PrecinctData2018, filter);
      const p16 = filterPrecincts(oh31PrecinctData2016, filter);

      return {
        label,
        votes2024: p24.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        margins2024: RACES_2024.map(({ key }) => {
          const { d, r } = sumRace(p24, key);
          return computeMargin(d, r);
        }),
        votes2022: p22.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        margins2022: RACES_2022.map(({ key }) => {
          const { d, r } = sumRace(p22, key);
          return computeMargin(d, r);
        }),
        votes2020: p20.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        margins2020: RACES_2020.map(({ key }) => {
          const { d, r } = sumRace(p20, key);
          return computeMargin(d, r);
        }),
        votes2018: p18.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        margins2018: RACES_2018.map(({ key }) => {
          const { d, r } = sumRace(p18, key);
          return computeMargin(d, r);
        }),
        votes2016: p16.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        margins2016: RACES_2016.map(({ key }) => {
          const { d, r } = sumRace(p16, key);
          return computeMargin(d, r);
        }),
      };
    });
  }, [townships]);

  const visibleGroups = useMemo(() => {
    return RESULT_YEAR_GROUPS.map((group) => {
      const races = viewMode === "year"
        ? group.races.map((race, index) => ({ ...race, sourceIndex: index }))
        : group.races
            .map((race, index) => ({ ...race, sourceIndex: index }))
            .filter((race) => matchesResultsRaceFilter(race, raceFilter));

      return { ...group, races };
    }).filter((group) => viewMode === "race" ? group.races.length > 0 : group.year === yearFilter);
  }, [raceFilter, viewMode, yearFilter]);

  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--app-bg)" }}>
        <thead>
          <tr style={{ background: "var(--app-panel)" }}>
            <th aria-hidden="true" style={STICKY_GROUP_HEADER_STYLE} />
            {visibleGroups.map((group, gi) => (
              <th
                key={group.year}
                colSpan={1 + group.races.length}
                style={{
                  ...HEADER_STYLE,
                  borderRight: gi < visibleGroups.length - 1 ? "1px solid var(--app-border)" : undefined,
                  color: "var(--app-text-muted)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  fontSize: 10,
                }}
              >
                {group.year}
              </th>
            ))}
          </tr>
          <tr style={{ background: "var(--app-panel)" }}>
            <th style={STICKY_HEADER_STYLE}>Township</th>
            {visibleGroups.map((group, gi) => (
              <Fragment key={`${group.year}-headers`}>
                <th
                  key={`${group.year}-votes`}
                  style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}
                >
                  Votes
                </th>
                {group.races.map(({ label }, i) => (
                  <th
                    key={`${group.year}-${label}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: i === group.races.length - 1 && gi < visibleGroups.length - 1 ? "1px solid var(--app-border)" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={row.label}
              style={rowIdx % 2 === 1 ? { background: "var(--app-panel)" } : undefined}
            >
              <td
                style={{
                  ...TOWNSHIP_CELL_STYLE,
                  background: rowIdx % 2 === 1 ? "var(--app-panel)" : "var(--app-bg)",
                }}
              >
                {row.label}
              </td>
              {visibleGroups.map((group, gi) => {
                const votes = row[group.votesKey];
                const margins = row[group.marginsKey];
                return (
                  <Fragment key={`${group.year}-${row.label}`}>
                    <td key={`${group.year}-votes-${row.label}`} style={{ ...CELL_STYLE, color: "var(--app-text-primary)" }}>
                      {votes.toLocaleString()}
                    </td>
                    {group.races.map((race, i) => {
                      const m = margins[race.sourceIndex];
                      return (
                        <td
                          key={`${group.year}-${race.label}-${row.label}`}
                          style={{
                            ...CELL_STYLE,
                            color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                            borderRight: i === group.races.length - 1 && gi < visibleGroups.length - 1 ? "1px solid var(--app-border)" : undefined,
                          }}
                        >
                          {formatMargin(m)}
                        </td>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSwing(s: number): string {
  if (s >= 0) return `D+${s.toFixed(1)}`;
  return `R+${Math.abs(s).toFixed(1)}`;
}

function SwingTable({
  viewMode,
  raceFilter,
  yearFilter,
}: {
  viewMode: ResultsViewMode;
  raceFilter: ResultsRaceFilter;
  yearFilter: SwingYearFilter;
}) {
  const townships = TOWNSHIP_OPTIONS.filter((t) => t.value !== "all");

  const rows = useMemo(() => {
    return townships.map(({ value, label }) => {
      const filter = value as TownshipFilter;
      const datasets = {
        p24: filterPrecincts(oh31PrecinctData, filter),
        p22: filterPrecincts(oh31PrecinctData2022, filter),
        p20: filterPrecincts(oh31PrecinctData2020, filter),
        p18: filterPrecincts(oh31PrecinctData2018, filter),
        p16: filterPrecincts(oh31PrecinctData2016, filter),
      };

      const swings = YEAR_GROUPS.map((group) =>
        group.cols.map((col) =>
          swing(col.key, datasets[col.newer as keyof typeof datasets], datasets[col.older as keyof typeof datasets])
        )
      );

      return {
        label,
        votesByYear: {
          "2024": datasets.p24.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
          "2022": datasets.p22.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
          "2020": datasets.p20.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
          "2018": datasets.p18.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
        } as Record<SwingYearFilter, number>,
        swings,
      };
    });
  }, [townships]);

  const totalVotesByYear = useMemo(() => ({
    "2024": oh31PrecinctData.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
    "2022": oh31PrecinctData2022.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
    "2020": oh31PrecinctData2020.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
    "2018": oh31PrecinctData2018.reduce((sum, precinct) => sum + precinct.ballotsCast, 0),
  }) as Record<SwingYearFilter, number>, []);

  const totalSwings = useMemo(() => {
    const all = {
      p24: oh31PrecinctData,
      p22: oh31PrecinctData2022,
      p20: oh31PrecinctData2020,
      p18: oh31PrecinctData2018,
      p16: oh31PrecinctData2016,
    };
    return YEAR_GROUPS.map((group) =>
      group.cols.map((col) =>
        swing(col.key, all[col.newer as keyof typeof all], all[col.older as keyof typeof all])
      )
    );
  }, []);

  const visibleGroups = useMemo(() => {
    return YEAR_GROUPS.map((group) => {
      const cols = group.cols
        .map((col, index) => ({ ...col, sourceIndex: index }))
        .filter((col) => viewMode === "year" || matchesResultsRaceFilter(col, raceFilter));

      return { ...group, cols };
    }).filter((group) => viewMode === "race" ? group.cols.length > 0 : group.year === yearFilter);
  }, [raceFilter, viewMode, yearFilter]);

  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--app-bg)" }}>
        <thead>
          <tr style={{ background: "var(--app-panel)" }}>
            <th aria-hidden="true" style={STICKY_GROUP_HEADER_STYLE} />
            {visibleGroups.map((group, gi) => (
              <th
                key={group.year}
                colSpan={1 + group.cols.length}
                style={{
                  ...HEADER_STYLE,
                  borderRight: gi < visibleGroups.length - 1 ? "1px solid var(--app-border)" : undefined,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  fontSize: 10,
                }}
              >
                {group.year}
              </th>
            ))}
          </tr>
          <tr style={{ background: "var(--app-panel)" }}>
            <th style={STICKY_HEADER_STYLE}>Township</th>
            {visibleGroups.map((group, gi) => (
              <Fragment key={`${group.year}-swing-headers`}>
                <th
                  style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}
                >
                  Votes
                </th>
                {group.cols.map((col, ci) => (
                  <th
                    key={`${group.year}-${col.key}-${ci}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight:
                        ci === group.cols.length - 1 && gi < visibleGroups.length - 1
                          ? "1px solid var(--app-border)"
                          : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                    }}
                  >
                    <div>{col.label}</div>
                    <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.75, marginTop: 1 }}>{col.sub}</div>
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, votesByYear, swings }, rowIdx) => (
            <tr
              key={label}
              style={rowIdx % 2 === 1 ? { background: "var(--app-panel)" } : undefined}
            >
              <td
                style={{
                  ...TOWNSHIP_CELL_STYLE,
                  background: rowIdx % 2 === 1 ? "var(--app-panel)" : "var(--app-bg)",
                }}
              >
                {label}
              </td>
              {visibleGroups.map((group, gi) => {
                const groupIndex = YEAR_GROUPS.findIndex((candidate) => candidate.year === group.year);
                return (
                  <Fragment key={`${group.year}-${label}`}>
                    <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)" }}>
                      {votesByYear[group.year as SwingYearFilter].toLocaleString()}
                    </td>
                    {group.cols.map((col, ci) => {
                      const s = swings[groupIndex][col.sourceIndex];
                      const isLastInGroup = ci === group.cols.length - 1;
                      return (
                        <td
                          key={`${group.year}-${col.key}-${ci}`}
                          style={{
                            ...CELL_STYLE,
                            color: s >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                            borderRight:
                              isLastInGroup && gi < visibleGroups.length - 1
                                ? "1px solid var(--app-border)"
                                : undefined,
                          }}
                        >
                          {formatSwing(s)}
                        </td>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tr>
          ))}
          {/* Total row */}
          <tr style={{ background: "var(--app-panel)", borderTop: "2px solid var(--app-border)" }}>
            <td
              style={{
                ...TOWNSHIP_CELL_STYLE,
                background: "var(--app-panel)",
                fontWeight: 700,
                color: "var(--app-text-primary)",
                borderBottom: "none",
              }}
            >
              Total
            </td>
            {visibleGroups.map((group, gi) => {
              const year = group.year as SwingYearFilter;
              return (
                <Fragment key={`total-${group.year}`}>
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)", fontWeight: 700, borderBottom: "none" }}>
                    {totalVotesByYear[year].toLocaleString()}
                  </td>
                  {group.cols.map((col, ci) => {
                const groupIndex = YEAR_GROUPS.findIndex((candidate) => candidate.year === group.year);
                const s = totalSwings[groupIndex][col.sourceIndex];
                const isLastInGroup = ci === group.cols.length - 1;
                return (
                  <td
                    key={`total-${group.year}-${col.key}-${ci}`}
                    style={{
                      ...CELL_STYLE,
                      color: s >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                      fontWeight: 700,
                      borderBottom: "none",
                      borderRight:
                        isLastInGroup && gi < visibleGroups.length - 1
                          ? "1px solid var(--app-border)"
                          : undefined,
                    }}
                  >
                    {formatSwing(s)}
                  </td>
                );
                  })}
                </Fragment>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function OH31TownshipTable() {
  const [mode, setMode] = useState<Mode>("results");
  const [resultsViewMode, setResultsViewMode] = useState<ResultsViewMode>("race");
  const [resultsRaceFilter, setResultsRaceFilter] = useState<ResultsRaceFilter>("stRep");
  const [resultsYearFilter, setResultsYearFilter] = useState<ResultsYearFilter>("2024");
  const [swingViewMode, setSwingViewMode] = useState<ResultsViewMode>("race");
  const [swingRaceFilter, setSwingRaceFilter] = useState<ResultsRaceFilter>("stRep");
  const [swingYearFilter, setSwingYearFilter] = useState<SwingYearFilter>("2024");

  const activeViewMode = mode === "results" ? resultsViewMode : swingViewMode;
  const activeRaceFilter = mode === "results" ? resultsRaceFilter : swingRaceFilter;

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>
            {mode === "results" ? "Results by Township" : "Swing by Township"}
          </h2>
          <div
            className="flex items-center gap-1 rounded-lg px-1 py-1"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
          >
            {(["results", "swing"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className="px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors"
                style={
                  mode === m
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                    : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-lg px-1 py-1"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
          >
            {(["race", "year"] as ResultsViewMode[]).map((view) => (
              <button
                key={view}
                onClick={() => {
                  if (mode === "results") setResultsViewMode(view);
                  else setSwingViewMode(view);
                }}
                aria-pressed={activeViewMode === view}
                className="px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors"
                style={
                  activeViewMode === view
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                    : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                }
              >
                {view}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg px-1 py-1"
              style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
            >
              {activeViewMode === "race"
                ? RESULTS_RACE_FILTERS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (mode === "results") setResultsRaceFilter(key);
                        else setSwingRaceFilter(key);
                      }}
                      aria-pressed={activeRaceFilter === key}
                      className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                      style={
                        activeRaceFilter === key
                          ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                          : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                      }
                    >
                      {label}
                    </button>
                  ))
                : (mode === "results" ? RESULTS_YEAR_FILTERS : SWING_YEAR_FILTERS).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (mode === "results") setResultsYearFilter(key as ResultsYearFilter);
                        else setSwingYearFilter(key as SwingYearFilter);
                      }}
                      aria-pressed={mode === "results" ? resultsYearFilter === key : swingYearFilter === key}
                      className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                      style={
                        (mode === "results" ? resultsYearFilter === key : swingYearFilter === key)
                          ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                          : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                      }
                    >
                      {label}
                    </button>
                  ))}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        {mode === "results" ? (
          <ResultsTable
            viewMode={resultsViewMode}
            raceFilter={resultsRaceFilter}
            yearFilter={resultsYearFilter}
          />
        ) : (
          <SwingTable
            viewMode={swingViewMode}
            raceFilter={swingRaceFilter}
            yearFilter={swingYearFilter}
          />
        )}
      </div>
    </section>
  );
}
