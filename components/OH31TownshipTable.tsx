"use client";

import { useMemo } from "react";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018, oh31ByPrecinct2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016, oh31ByPrecinct2016 } from "@/data/oh31PrecinctData2016";
import { TOWNSHIP_OPTIONS, filterPrecincts, sumRace } from "@/lib/oh31Analysis";
import type { TownshipFilter } from "@/lib/oh31Analysis";
import type { OH31RaceKey } from "@/lib/oh31Analysis";

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

function computeMargin(d: number, r: number): number {
  const total = d + r;
  return total === 0 ? 0 : ((d - r) / total) * 100;
}

function formatMargin(margin: number): string {
  return margin >= 0
    ? `D+${margin.toFixed(1)}`
    : `R+${Math.abs(margin).toFixed(1)}`;
}


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

const TBD_CELL_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  color: "var(--app-text-muted)",
  opacity: 0.6,
  fontWeight: 400,
};

export default function OH31TownshipTable() {
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

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
        Results by Township
      </h2>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--app-bg)" }}>
            <thead>
              {/* Year group row */}
              <tr style={{ background: "var(--app-panel)" }}>
                <th
                  rowSpan={2}
                  style={{
                    ...HEADER_STYLE,
                    textAlign: "left",
                    paddingLeft: 12,
                    verticalAlign: "bottom",
                    paddingBottom: 8,
                    backgroundImage:
                      "linear-gradient(to bottom, transparent calc(50% - 0.5px), var(--app-border) calc(50% - 0.5px), var(--app-border) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    backgroundColor: "var(--app-panel)",
                    boxShadow: "inset -1px 0 0 var(--app-border)",
                  }}
                >
                  Township
                </th>
                {/* 2024 */}
                <th
                  colSpan={5}
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                >
                  2024
                </th>
                {/* 2022 */}
                <th
                  colSpan={5}
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                >
                  2022
                </th>
                {/* 2020 — Votes + 3 races (no Senate) */}
                <th
                  colSpan={4}
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                    opacity: 0.7,
                  }}
                >
                  2020
                </th>
                {/* 2018 — Votes + 4 races */}
                <th
                  colSpan={5}
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                    opacity: 0.7,
                  }}
                >
                  2018
                </th>
                {/* 2016 — Votes + 4 races */}
                <th
                  colSpan={5}
                  style={{
                    ...HEADER_STYLE,
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                    opacity: 0.7,
                  }}
                >
                  2016
                </th>
              </tr>
              {/* Race label row */}
              <tr style={{ background: "var(--app-panel)" }}>
                {/* 2024 sub-headers */}
                <th style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Votes</th>
                {RACES_2024.map(({ label }, i) => (
                  <th
                    key={`h24-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                    }}
                  >
                    {label}
                  </th>
                ))}
                {/* 2022 sub-headers */}
                <th style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Votes</th>
                {RACES_2022.map(({ label }, i) => (
                  <th
                    key={`h22-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                    }}
                  >
                    {label}
                  </th>
                ))}
                {/* 2020 sub-headers */}
                <th style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, opacity: 0.7 }}>Votes</th>
                {RACES_2020.map(({ label }, i) => (
                  <th
                    key={`h20-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: i === 2 ? "1px solid var(--app-border)" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                      opacity: 0.7,
                    }}
                  >
                    {label}
                  </th>
                ))}
                {/* 2018 sub-headers */}
                <th style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, opacity: 0.7 }}>Votes</th>
                {RACES_2018.map(({ label }, i) => (
                  <th
                    key={`h18-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                      opacity: 0.7,
                    }}
                  >
                    {label}
                  </th>
                ))}
                {/* 2016 sub-headers */}
                <th style={{ ...HEADER_STYLE, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, opacity: 0.7 }}>Votes</th>
                {RACES_2016.map(({ label }, i) => (
                  <th
                    key={`h16-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                      opacity: 0.7,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, votes2024, margins2024, votes2022, margins2022, votes2020, margins2020, votes2018, margins2018, votes2016, margins2016 }, rowIdx) => (
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
                  {/* 2024 */}
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)" }}>
                    {votes2024.toLocaleString()}
                  </td>
                  {margins2024.map((m, i) => (
                    <td
                      key={`m24-${i}`}
                      style={{
                        ...CELL_STYLE,
                        color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                        borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      }}
                    >
                      {formatMargin(m)}
                    </td>
                  ))}
                  {/* 2022 */}
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)", opacity: 0.9 }}>
                    {votes2022.toLocaleString()}
                  </td>
                  {margins2022.map((m, i) => (
                    <td
                      key={`m22-${i}`}
                      style={{
                        ...CELL_STYLE,
                        color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                        opacity: 0.85,
                        borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      }}
                    >
                      {formatMargin(m)}
                    </td>
                  ))}
                  {/* 2020 — real data */}
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)", opacity: 0.9 }}>
                    {votes2020.toLocaleString()}
                  </td>
                  {margins2020.map((m, i) => (
                    <td
                      key={`m20-${i}`}
                      style={{
                        ...CELL_STYLE,
                        color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                        opacity: 0.85,
                        borderRight: i === 2 ? "1px solid var(--app-border)" : undefined,
                      }}
                    >
                      {formatMargin(m)}
                    </td>
                  ))}
                  {/* 2018 — real data */}
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)", opacity: 0.9 }}>
                    {votes2018.toLocaleString()}
                  </td>
                  {margins2018.map((m, i) => (
                    <td
                      key={`m18-${i}`}
                      style={{
                        ...CELL_STYLE,
                        color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                        opacity: 0.85,
                        borderRight: i === 3 ? "1px solid var(--app-border)" : undefined,
                      }}
                    >
                      {formatMargin(m)}
                    </td>
                  ))}
                  {/* 2016 — real data */}
                  <td style={{ ...CELL_STYLE, color: "var(--app-text-primary)", opacity: 0.9 }}>
                    {votes2016.toLocaleString()}
                  </td>
                  {margins2016.map((m, i) => (
                    <td
                      key={`m16-${i}`}
                      style={{
                        ...CELL_STYLE,
                        color: m >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                        opacity: 0.85,
                      }}
                    >
                      {formatMargin(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
