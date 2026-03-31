"use client";

import { Fragment, useState } from "react";
import { OH31Precinct } from "@/data/oh31PrecinctData";
import { TOWNSHIP_OPTIONS, type TownshipFilter } from "@/lib/oh31Analysis";

type SortDir = "asc" | "desc";

type SortKey =
  | "precinct" | "ballots" | "reg" | "turnout"
  | "pres_d" | "pres_r" | "pres_dpct" | "pres_rpct" | "pres_margin"
  | "senate_d" | "senate_r" | "senate_dpct" | "senate_rpct" | "senate_margin"
  | "house_d" | "house_r" | "house_dpct" | "house_rpct" | "house_margin"
  | "strep_d" | "strep_r" | "strep_dpct" | "strep_rpct" | "strep_margin";

function getValue(p: OH31Precinct, key: SortKey): number | string {
  switch (key) {
    case "precinct":      return p.precinct;
    case "ballots":       return p.ballotsCast;
    case "reg":           return p.regVoters;
    case "turnout":       return p.regVoters > 0 ? (p.ballotsCast / p.regVoters) * 100 : 0;
    case "pres_d":        return p.pres.dVotes;
    case "pres_r":        return p.pres.rVotes;
    case "pres_dpct":     return p.pres.dPct;
    case "pres_rpct":     return p.pres.rPct;
    case "pres_margin":   return p.pres.rPct - p.pres.dPct;
    case "senate_d":      return p.senate.dVotes;
    case "senate_r":      return p.senate.rVotes;
    case "senate_dpct":   return p.senate.dPct;
    case "senate_rpct":   return p.senate.rPct;
    case "senate_margin": return p.senate.rPct - p.senate.dPct;
    case "house_d":       return p.uSHouse.dVotes;
    case "house_r":       return p.uSHouse.rVotes;
    case "house_dpct":    return p.uSHouse.dPct;
    case "house_rpct":    return p.uSHouse.rPct;
    case "house_margin":  return p.uSHouse.rPct - p.uSHouse.dPct;
    case "strep_d":       return p.stRep.dVotes;
    case "strep_r":       return p.stRep.rVotes;
    case "strep_dpct":    return p.stRep.dPct;
    case "strep_rpct":    return p.stRep.rPct;
    case "strep_margin":  return p.stRep.rPct - p.stRep.dPct;
  }
}

function sortData(data: OH31Precinct[], key: SortKey, dir: SortDir): OH31Precinct[] {
  return [...data].sort((a, b) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    const cmp = typeof av === "string"
      ? av.localeCompare(bv as string)
      : (av as number) - (bv as number);
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="inline-flex ml-1" style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>;
}

const RACE_GROUPS: { label: string; d: SortKey; r: SortKey; dpct: SortKey; rpct: SortKey; margin: SortKey }[] = [
  { label: "State Rep",   d: "strep_d",  r: "strep_r",  dpct: "strep_dpct",  rpct: "strep_rpct",  margin: "strep_margin"  },
  { label: "President",   d: "pres_d",   r: "pres_r",   dpct: "pres_dpct",   rpct: "pres_rpct",   margin: "pres_margin"   },
  { label: "Senate",      d: "senate_d", r: "senate_r", dpct: "senate_dpct", rpct: "senate_rpct", margin: "senate_margin" },
  { label: "House",       d: "house_d",  r: "house_r",  dpct: "house_dpct",  rpct: "house_rpct",  margin: "house_margin"  },
];

const thBase = "px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity";
const stickyTopLeftStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 4,
  background: "var(--app-panel)",
  boxShadow: "1px 0 0 var(--app-border)",
};
const stickyFirstColStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: "inherit",
  boxShadow: "1px 0 0 var(--app-border)",
};

export default function OH31PrecinctTable({
  data,
  townshipFilter,
  setTownshipFilter,
  totalPrecinctCount,
}: {
  data: OH31Precinct[];
  townshipFilter: TownshipFilter;
  setTownshipFilter: (value: TownshipFilter) => void;
  totalPrecinctCount: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("precinct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showVotes, setShowVotes] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const [showBallots, setShowBallots] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortData(data, sortKey, sortDir);

  const th = (key: SortKey, label: string, extraStyle?: React.CSSProperties, align: "left" | "right" = "right") => (
    <th
      key={key}
      className={`${thBase} ${align === "left" ? "text-left" : "text-right"}`}
      style={extraStyle}
      onClick={() => handleSort(key)}
    >
      {label}<SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  );

  // Each race group has up to 5 cols; compute colspan based on visible cols
  const groupColspan = (showVotes ? 2 : 0) + (showPct ? 2 : 0) + 1; // +1 for margin always visible

  return (
    <div>
      {/* Toggles */}
      <div className="flex flex-col gap-3 mb-3 lg:flex-row lg:items-center">
        <div className="flex-1 min-w-0">
          <label className="sr-only" htmlFor="oh31-township-filter">Filter by township</label>
          <select
            id="oh31-township-filter"
            value={townshipFilter}
            onChange={(e) => setTownshipFilter(e.target.value as TownshipFilter)}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--app-panel)",
              color: "var(--app-text-primary)",
              border: "1px solid var(--app-border)",
            }}
          >
            {TOWNSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
          Showing {sorted.length} of {totalPrecinctCount} precincts
        </div>
        {townshipFilter !== "all" && (
          <button
            onClick={() => setTownshipFilter("all")}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={{
              background: "var(--app-panel)",
              color: "var(--app-text-muted)",
              border: "1px solid var(--app-border)",
            }}
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="flex items-center mb-3 flex-wrap gap-2">
        <button
          onClick={() => setShowBallots(v => !v)}
          className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
          style={{
            background: showBallots ? "var(--app-tab-bg)" : "transparent",
            color: showBallots ? "var(--app-text-primary)" : "var(--app-text-muted)",
            border: "1px solid var(--app-border)",
          }}
        >
          {showBallots ? "Hide" : "Show"} Ballots &amp; Reg.
        </button>
        <button
          onClick={() => setShowVotes(v => !v)}
          className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
          style={{
            background: showVotes ? "var(--app-tab-bg)" : "transparent",
            color: showVotes ? "var(--app-text-primary)" : "var(--app-text-muted)",
            border: "1px solid var(--app-border)",
          }}
        >
          {showVotes ? "Hide" : "Show"} Vote Counts
        </button>
        <button
          onClick={() => setShowPct(v => !v)}
          className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
          style={{
            background: showPct ? "var(--app-tab-bg)" : "transparent",
            color: showPct ? "var(--app-text-primary)" : "var(--app-text-muted)",
            border: "1px solid var(--app-border)",
          }}
        >
          {showPct ? "Hide" : "Show"} Percentages
        </button>
      </div>

    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            {/* Group header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                colSpan={1}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyTopLeftStyle }}
              />
              {showBallots && (
                <th
                  colSpan={3}
                  className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                  style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}
                >
                  Turnout
                </th>
              )}
              {RACE_GROUPS.map(({ label }, i) => (
                <th
                  key={label}
                  colSpan={groupColspan}
                  className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                  style={{
                    color: "var(--app-text-primary)",
                    borderLeft: "1px solid var(--app-border)",
                    borderRight: i < RACE_GROUPS.length - 1 ? "1px solid var(--app-border)" : undefined,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
            {/* Sub-header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                style={{ color: "var(--app-text-primary)", borderRight: showBallots ? "1px solid var(--app-border)" : undefined, ...stickyFirstColStyle }}
                onClick={() => handleSort("precinct")}
              >
                Precinct<SortIcon active={sortKey === "precinct"} dir={sortDir} />
              </th>
              {showBallots && (
                <th
                  className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                  style={{ color: "var(--app-text-muted)" }}
                  onClick={() => handleSort("ballots")}
                >
                  Ballots<SortIcon active={sortKey === "ballots"} dir={sortDir} />
                </th>
              )}
              {showBallots && (
                <th
                  className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                  style={{ color: "var(--app-text-muted)" }}
                  onClick={() => handleSort("reg")}
                >
                  Reg.<SortIcon active={sortKey === "reg"} dir={sortDir} />
                </th>
              )}
              {showBallots && (
                <th
                  className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                  style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" }}
                  onClick={() => handleSort("turnout")}
                >
                  Turnout<SortIcon active={sortKey === "turnout"} dir={sortDir} />
                </th>
              )}
              {RACE_GROUPS.map(({ d, r, dpct, rpct, margin }, gi) => (
                <Fragment key={margin}>
                  {showVotes && th(d,    "D Votes", { color: "var(--party-dem, #1b408c)", borderLeft: "1px solid var(--app-border)" }, "left")}
                  {showVotes && th(r,    "R Votes", { color: "var(--party-rep, #be1c29)" }, "left")}
                  {showPct   && th(dpct, "D%",      { color: "var(--party-dem, #1b408c)", borderLeft: !showVotes ? "1px solid var(--app-border)" : undefined }, "left")}
                  {showPct   && th(rpct, "R%",      { color: "var(--party-rep, #be1c29)" }, "left")}
                  {th(margin, "Margin",  { color: "var(--app-text-muted)", borderLeft: !showVotes && !showPct ? "1px solid var(--app-border)" : undefined, borderRight: gi < RACE_GROUPS.length - 1 ? "1px solid var(--app-border)" : undefined }, "left")}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr style={{ background: "var(--app-bg)" }}>
                <td
                  colSpan={(showBallots ? 4 : 1) + RACE_GROUPS.length * groupColspan}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  No precincts match that filter.
                </td>
              </tr>
            ) : sorted.map((p, i) => (
              <tr
                key={p.precinct}
                style={{
                  background: i % 2 === 0 ? "var(--app-bg)" : "var(--app-panel)",
                  borderBottom: "1px solid var(--app-border)",
                }}
              >
                <td
                  className="px-3 py-2 font-medium whitespace-nowrap"
                  style={{
                    color: "var(--app-text-primary)",
                    borderRight: showBallots ? "1px solid var(--app-border)" : undefined,
                    ...stickyFirstColStyle,
                    background: i % 2 === 0 ? "var(--app-bg)" : "var(--app-panel)",
                  }}
                >
                  {p.precinct}
                </td>
                {showBallots && (
                  <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {p.ballotsCast.toLocaleString()}
                  </td>
                )}
                {showBallots && (
                  <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {p.regVoters.toLocaleString()}
                  </td>
                )}
                {showBallots && (
                  <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" }}>
                    {p.regVoters > 0 ? `${((p.ballotsCast / p.regVoters) * 100).toFixed(1)}%` : "0.0%"}
                  </td>
                )}
                {RACE_GROUPS.map(({ d: dk, margin: mk }, gi) => {
                  const race = dk === "pres_d" ? p.pres : dk === "senate_d" ? p.senate : dk === "house_d" ? p.uSHouse : p.stRep;
                  const margin = race.rPct - race.dPct;
                  const marginStr = margin > 0 ? `R+${margin.toFixed(1)}%` : margin < 0 ? `D+${Math.abs(margin).toFixed(1)}%` : "Even";
                  const marginColor = margin > 0 ? "var(--party-rep, #be1c29)" : margin < 0 ? "var(--party-dem, #1b408c)" : "var(--app-text-muted)";
                  return (
                    <Fragment key={`${p.precinct}-${mk}`}>
                      {showVotes && <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--party-dem, #1b408c)", borderLeft: "1px solid var(--app-border)" }}>{race.dVotes.toLocaleString()}</td>}
                      {showVotes && <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--party-rep, #be1c29)" }}>{race.rVotes.toLocaleString()}</td>}
                      {showPct   && <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--party-dem, #1b408c)", borderLeft: !showVotes ? "1px solid var(--app-border)" : undefined }}>{race.dPct.toFixed(1)}%</td>}
                      {showPct   && <td className="px-3 py-2 text-left tabular-nums" style={{ color: "var(--party-rep, #be1c29)" }}>{race.rPct.toFixed(1)}%</td>}
                      <td className="px-3 py-2 text-left tabular-nums font-medium" style={{ color: marginColor, borderLeft: !showVotes && !showPct ? "1px solid var(--app-border)" : undefined, borderRight: gi < RACE_GROUPS.length - 1 ? "1px solid var(--app-border)" : undefined }}>{marginStr}</td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
