"use client";

import { useMemo } from "react";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016 } from "@/data/oh31PrecinctData2016";
import { TOWNSHIP_OPTIONS, filterPrecincts, sumRace } from "@/lib/oh31Analysis";
import type { TownshipFilter, OH31RaceKey } from "@/lib/oh31Analysis";

function computeMargin(d: number, r: number): number {
  const total = d + r;
  return total === 0 ? 0 : ((d - r) / total) * 100;
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

function formatSwing(s: number): string {
  if (s >= 0) return `D+${s.toFixed(1)}`;
  return `R+${Math.abs(s).toFixed(1)}`;
}

const HEADER_STYLE: React.CSSProperties = {
  padding: "5px 8px",
  textAlign: "center",
  fontSize: 10,
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

// Column definitions per year group: [label line 1, label line 2, raceKey, newDataset, oldDataset ref key]
// We'll build the row data in the useMemo instead.

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

export default function OH31SwingTable() {
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

      return { label, swings };
    });
  }, [townships]);

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

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
        Swing by Township
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
                {YEAR_GROUPS.map((group, gi) => (
                  <th
                    key={group.year}
                    colSpan={group.cols.length}
                    style={{
                      ...HEADER_STYLE,
                      borderRight: gi < YEAR_GROUPS.length - 1 ? "1px solid var(--app-border)" : undefined,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      opacity: gi === 0 ? 1 : 0.7,
                    }}
                  >
                    {group.year}
                  </th>
                ))}
              </tr>
              {/* Race label row */}
              <tr style={{ background: "var(--app-panel)" }}>
                {YEAR_GROUPS.map((group, gi) =>
                  group.cols.map((col, ci) => (
                    <th
                      key={`${group.year}-${col.key}-${ci}`}
                      style={{
                        ...HEADER_STYLE,
                        borderRight:
                          ci === group.cols.length - 1 && gi < YEAR_GROUPS.length - 1
                            ? "1px solid var(--app-border)"
                            : undefined,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        opacity: gi === 0 ? 1 : 0.7,
                      }}
                    >
                      <div>{col.label}</div>
                      <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.75, marginTop: 1 }}>{col.sub}</div>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, swings }, rowIdx) => (
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
                  {YEAR_GROUPS.map((group, gi) =>
                    group.cols.map((col, ci) => {
                      const s = swings[gi][ci];
                      const isLastInGroup = ci === group.cols.length - 1;
                      return (
                        <td
                          key={`${group.year}-${col.key}-${ci}`}
                          style={{
                            ...CELL_STYLE,
                            color: s >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                            opacity: gi === 0 ? 1 : 0.85,
                            borderRight:
                              isLastInGroup && gi < YEAR_GROUPS.length - 1
                                ? "1px solid var(--app-border)"
                                : undefined,
                          }}
                        >
                          {formatSwing(s)}
                        </td>
                      );
                    })
                  )}
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
                {YEAR_GROUPS.map((group, gi) =>
                  group.cols.map((col, ci) => {
                    const s = totalSwings[gi][ci];
                    const isLastInGroup = ci === group.cols.length - 1;
                    return (
                      <td
                        key={`total-${group.year}-${col.key}-${ci}`}
                        style={{
                          ...CELL_STYLE,
                          color: s >= 0 ? "var(--party-dem)" : "var(--party-rep)",
                          opacity: gi === 0 ? 1 : 0.85,
                          fontWeight: 700,
                          borderBottom: "none",
                          borderRight:
                            isLastInGroup && gi < YEAR_GROUPS.length - 1
                              ? "1px solid var(--app-border)"
                              : undefined,
                        }}
                      >
                        {formatSwing(s)}
                      </td>
                    );
                  })
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
