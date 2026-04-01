"use client";

import { useMemo } from "react";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
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

function computeMargin(d: number, r: number): number {
  const total = d + r;
  return total === 0 ? 0 : ((d - r) / total) * 100;
}

function formatMargin(margin: number): string {
  return margin >= 0
    ? `D+${margin.toFixed(1)}`
    : `R+${Math.abs(margin).toFixed(1)}`;
}

function formatSwing(swingToRep: number): string {
  return swingToRep >= 0
    ? `R+${swingToRep.toFixed(1)}`
    : `D+${Math.abs(swingToRep).toFixed(1)}`;
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

export default function OH31TownshipTable() {
  const townships = TOWNSHIP_OPTIONS.filter((t) => t.value !== "all");

  const rows = useMemo(() => {
    return townships.map(({ value, label }) => {
      const filter = value as TownshipFilter;
      const p24 = filterPrecincts(oh31PrecinctData, filter);
      const p22 = filterPrecincts(oh31PrecinctData2022, filter);

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
        swingRep: (() => {
          const stRep24 = sumRace(p24, "stRep");
          const stRep22 = sumRace(p22, "stRep");
          const margin24 = computeMargin(stRep24.d, stRep24.r);
          const margin22 = computeMargin(stRep22.d, stRep22.r);
          return margin22 - margin24;
        })(),
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
                <th
                  colSpan={1}
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                />
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
                <th
                  colSpan={5}
                  style={{
                    ...HEADER_STYLE,
                    color: "var(--app-text-muted)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                >
                  2022
                </th>
              </tr>
              {/* Race label row */}
              <tr style={{ background: "var(--app-panel)" }}>
                <th
                  style={{
                    ...HEADER_STYLE,
                    borderRight: "1px solid var(--app-border)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: 10,
                  }}
                >
                  Swing Rep
                </th>
                <th
                  style={{
                    ...HEADER_STYLE,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: 10,
                  }}
                >
                  Votes
                </th>
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
                <th
                  style={{
                    ...HEADER_STYLE,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: 10,
                  }}
                >
                  Votes
                </th>
                {RACES_2022.map(({ label }, i) => (
                  <th
                    key={`h22-${i}`}
                    style={{
                      ...HEADER_STYLE,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: 10,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, votes2024, margins2024, votes2022, margins2022, swingRep }, rowIdx) => (
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
                  <td
                    style={{
                      ...CELL_STYLE,
                      color: swingRep >= 0 ? "var(--party-rep)" : "var(--party-dem)",
                      borderRight: "1px solid var(--app-border)",
                      }}
                    >
                      {formatSwing(swingRep)}
                    </td>
                  <td
                    style={{
                      ...CELL_STYLE,
                      color: "var(--app-text-primary)",
                    }}
                  >
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
                  <td
                    style={{
                      ...CELL_STYLE,
                      color: "var(--app-text-primary)",
                      opacity: 0.9,
                    }}
                  >
                    {votes2022.toLocaleString()}
                  </td>
                  {margins2022.map((m, i) => (
                    <td
                      key={`m22-${i}`}
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
