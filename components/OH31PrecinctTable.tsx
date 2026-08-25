"use client";

import { Fragment, useState } from "react";
import { OH31Precinct } from "@/data/oh31PrecinctData";
import { TOWNSHIP_OPTIONS, matchesTownshipFilter, type TownshipFilter } from "@/lib/oh31Analysis";

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

type TableYear = "2024" | "2022" | "2020" | "2018" | "2016";

function getRaceGroups(year: TableYear) {
  const presLabel = year === "2022" || year === "2018" ? "Governor" : "President";
  const groups: { label: string; d: SortKey; r: SortKey; dpct: SortKey; rpct: SortKey; margin: SortKey }[] = [
    { label: "State Rep", d: "strep_d",  r: "strep_r",  dpct: "strep_dpct",  rpct: "strep_rpct",  margin: "strep_margin"  },
    { label: presLabel,   d: "pres_d",   r: "pres_r",   dpct: "pres_dpct",   rpct: "pres_rpct",   margin: "pres_margin"   },
  ];
  // 2020 had no Ohio U.S. Senate race
  if (year !== "2020") {
    groups.push({ label: "Senate", d: "senate_d", r: "senate_r", dpct: "senate_dpct", rpct: "senate_rpct", margin: "senate_margin" });
  }
  groups.push({ label: "House", d: "house_d", r: "house_r", dpct: "house_dpct", rpct: "house_rpct", margin: "house_margin" });
  return groups;
}

const thBase = "px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity";
const MAX_VISIBLE_ROWS = 12;
const HEADER_ROW_HEIGHT = 37;
const HEADER_HEIGHT = HEADER_ROW_HEIGHT * 2;
const ROW_HEIGHT = 37;

const stickyHeaderStyle: React.CSSProperties = { background: "var(--app-panel)" };
const stickyFirstColStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: "inherit",
  boxShadow: "1px 0 0 var(--app-border)",
};
const stickyTopLeftStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 4,
  background: "var(--app-panel)",
  boxShadow: "1px 0 0 var(--app-border)",
};

type TownshipSummary = {
  value: TownshipFilter;
  label: string;
  precincts: OH31Precinct[];
  ballots: number;
  turnoutPct: number;
  margin: number; // State Rep, positive = R
};

function summarizeTownships(data: OH31Precinct[]): TownshipSummary[] {
  return TOWNSHIP_OPTIONS.filter((t) => t.value !== "all").map(({ value, label }) => {
    const precincts = data.filter((p) => matchesTownshipFilter(p.township, value));
    const ballots = precincts.reduce((sum, p) => sum + p.ballotsCast, 0);
    const reg = precincts.reduce((sum, p) => sum + p.regVoters, 0);
    const d = precincts.reduce((sum, p) => sum + p.stRep.dVotes, 0);
    const r = precincts.reduce((sum, p) => sum + p.stRep.rVotes, 0);
    const total = d + r;
    return {
      value,
      label,
      precincts,
      ballots,
      turnoutPct: reg > 0 ? (ballots / reg) * 100 : 0,
      margin: total > 0 ? ((r - d) / total) * 100 : 0,
    };
  });
}

export default function OH31PrecinctTable({
  data,
  year,
  townshipFilter,
  setTownshipFilter,
}: {
  data: OH31Precinct[];
  year: TableYear;
  townshipFilter: TownshipFilter;
  setTownshipFilter: (value: TownshipFilter) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("precinct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showVotes, setShowVotes] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const [showBallots, setShowBallots] = useState(false);
  const [flatMode, setFlatMode] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const RACE_GROUPS = getRaceGroups(year);
  // Each race group has up to 5 cols; compute colspan based on visible cols
  const groupColspan = (showVotes ? 2 : 0) + (showPct ? 2 : 0) + 1; // +1 for margin always visible
  const townships = summarizeTownships(data);

  const th = (key: SortKey, label: string, extraStyle?: React.CSSProperties, align: "left" | "right" = "right") => (
    <th
      key={key}
      className={`${thBase} ${align === "left" ? "text-left" : "text-right"}`}
      style={{ ...stickyHeaderStyle, ...extraStyle }}
      onClick={() => handleSort(key)}
    >
      {label}<SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  );

  function renderGroupHeaderRow(withTownshipCol: boolean) {
    return (
      <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
        <th
          className="px-3 py-2 text-center font-semibold whitespace-nowrap"
          style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyTopLeftStyle, zIndex: 7 }}
        />
        {withTownshipCol && (
          <th className="px-3 py-2" style={{ ...stickyHeaderStyle, borderRight: "1px solid var(--app-border)" }} />
        )}
        {showBallots && (
          <th
            colSpan={3}
            className="px-3 py-2 text-center font-semibold whitespace-nowrap"
            style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyHeaderStyle }}
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
              ...stickyHeaderStyle,
            }}
          >
            {label}
          </th>
        ))}
      </tr>
    );
  }

  function renderSubHeaderRow(withTownshipCol: boolean) {
    return (
      <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
        <th
          className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
          style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyTopLeftStyle, zIndex: 7 }}
          onClick={() => handleSort("precinct")}
        >
          Precinct<SortIcon active={sortKey === "precinct"} dir={sortDir} />
        </th>
        {withTownshipCol && (
          <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)", ...stickyHeaderStyle }}>
            Township
          </th>
        )}
        {showBallots && (
          <th
            className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
            style={{ color: "var(--app-text-muted)", ...stickyHeaderStyle }}
            onClick={() => handleSort("ballots")}
          >
            Ballots<SortIcon active={sortKey === "ballots"} dir={sortDir} />
          </th>
        )}
        {showBallots && (
          <th
            className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
            style={{ color: "var(--app-text-muted)", ...stickyHeaderStyle }}
            onClick={() => handleSort("reg")}
          >
            Reg.<SortIcon active={sortKey === "reg"} dir={sortDir} />
          </th>
        )}
        {showBallots && (
          <th
            className="px-3 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
            style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)", ...stickyHeaderStyle }}
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
    );
  }

  function renderRow(p: OH31Precinct, i: number, withTownshipCol: boolean) {
    const rowBg = i % 2 === 0 ? "var(--app-bg)" : "var(--app-panel)";
    return (
      <tr key={p.precinct} style={{ background: rowBg, borderBottom: "1px solid var(--app-border)" }}>
        <td
          className="px-3 py-2 font-medium whitespace-nowrap"
          style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyFirstColStyle, background: rowBg }}
        >
          {p.precinct}
        </td>
        {withTownshipCol && (
          <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" }}>
            {p.township}
          </td>
        )}
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
    );
  }

  function toggleTownship(value: TownshipFilter) {
    setTownshipFilter(townshipFilter === value ? "all" : value);
  }

  return (
    <div>
      <style>{`
        .oh31-scroll-table {
          border-collapse: separate;
          border-spacing: 0;
        }
        .oh31-scroll-table th,
        .oh31-scroll-table td {
          border-bottom: 1px solid var(--app-border);
        }
        .oh31-scroll-table tbody tr:last-child td {
          border-bottom: 0;
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ border: "1px solid var(--app-border)" }}>
          <button
            onClick={() => setFlatMode(false)}
            aria-pressed={!flatMode}
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
            style={!flatMode ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
          >
            By Township
          </button>
          <button
            onClick={() => { setFlatMode(true); setTownshipFilter("all"); }}
            aria-pressed={flatMode}
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
            style={flatMode ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
          >
            All Precincts
          </button>
        </div>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs">
          <button onClick={() => setShowBallots(v => !v)} className="font-semibold hover:underline" style={{ color: showBallots ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {showBallots ? "Hide" : "Show"} ballots &amp; reg.
          </button>
          <span style={{ color: "var(--app-border)" }}>·</span>
          <button onClick={() => setShowVotes(v => !v)} className="font-semibold hover:underline" style={{ color: showVotes ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {showVotes ? "Hide" : "Show"} vote counts
          </button>
          <span style={{ color: "var(--app-border)" }}>·</span>
          <button onClick={() => setShowPct(v => !v)} className="font-semibold hover:underline" style={{ color: showPct ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {showPct ? "Hide" : "Show"} percentages
          </button>
        </div>
      </div>

      {flatMode ? (
        data.length === 0 ? (
          <div className="px-1 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>
            Precinct data for {year} coming soon
          </div>
        ) : (
          <div
            className="overflow-auto"
            style={{ maxHeight: data.length > MAX_VISIBLE_ROWS ? HEADER_HEIGHT + ROW_HEIGHT * MAX_VISIBLE_ROWS : undefined }}
          >
            <table className="oh31-scroll-table text-sm" style={{ minWidth: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--app-panel)", boxShadow: "0 1px 0 var(--app-border)" }}>
                {renderGroupHeaderRow(true)}
                {renderSubHeaderRow(true)}
              </thead>
              <tbody>
                {sortData(data, sortKey, sortDir).map((p, i) => renderRow(p, i, true))}
              </tbody>
            </table>
          </div>
        )
      ) : data.length === 0 ? (
        <div className="px-1 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>
          Precinct data for {year} coming soon
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--app-border)" }}>
          {townships.map((t) => {
            const expanded = townshipFilter === t.value;
            const marginColor = t.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";
            const marginLabel = `${t.margin <= 0 ? "D" : "R"}+${Math.abs(t.margin).toFixed(1)}`;
            return (
              <Fragment key={t.value}>
                <button
                  onClick={() => toggleTownship(t.value)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 py-3 text-left transition-colors"
                  style={{ borderBottom: "1px solid var(--app-border)" }}
                >
                  <span
                    className="text-[10px] transition-transform shrink-0"
                    style={{ color: "var(--app-text-very-muted)", transform: expanded ? "rotate(90deg)" : undefined }}
                  >
                    ▸
                  </span>
                  <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{ color: "var(--app-text-primary)" }}>
                    {t.label}
                  </span>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--app-text-muted)" }}>
                    {t.precincts.length} pr.
                  </span>
                  <span className="text-xs tabular-nums shrink-0 hidden sm:inline" style={{ color: "var(--app-text-muted)" }}>
                    {t.ballots.toLocaleString()} ballots
                  </span>
                  <span className="text-xs tabular-nums shrink-0 hidden sm:inline w-14 text-right" style={{ color: "var(--app-text-muted)" }}>
                    {t.turnoutPct.toFixed(1)}%
                  </span>
                  <span className="text-xs font-bold tabular-nums shrink-0 w-16 text-right" style={{ color: marginColor }}>
                    {marginLabel}
                  </span>
                </button>
                {expanded && (
                  <div className="pb-3 pl-4">
                    <div
                      className="overflow-auto"
                      style={{ maxHeight: t.precincts.length > MAX_VISIBLE_ROWS ? HEADER_HEIGHT + ROW_HEIGHT * MAX_VISIBLE_ROWS : undefined }}
                    >
                      <table className="oh31-scroll-table text-sm" style={{ minWidth: "100%" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--app-panel)", boxShadow: "0 1px 0 var(--app-border)" }}>
                          {renderGroupHeaderRow(false)}
                          {renderSubHeaderRow(false)}
                        </thead>
                        <tbody>
                          {sortData(t.precincts, sortKey, sortDir).map((p, i) => renderRow(p, i, false))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
