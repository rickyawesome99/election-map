"use client";

import { useMemo, useState } from "react";
import { statesData } from "@/data/statesData";
import { stateLegData, type StateLegEntry } from "@/data/forecastData";
import { UNICAMERAL_STATES } from "@/data/stateLegDistricts";

// The target range of the state-leg historical results project. Louisiana/Mississippi's 2015 rows
// and the two stray 2014 rows in the CSV sit outside it and are not part of the scoreboard.
const FIRST_YEAR = 2016;
const LAST_YEAR = 2025;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// The twelve fields Objective 1 set out to fill for every chamber-year: D/R/other/total votes,
// the chamber's composition AFTER the election, and the seats WON in the cycle. Composition and
// seats-won are deliberately separate quantities - a staggered chamber's composition counts
// holdovers that were never on the ballot - so a row is only complete when it carries both.
const FIELDS: { key: keyof StateLegEntry; label: string }[] = [
  { key: "demVotes", label: "D votes" },
  { key: "repVotes", label: "R votes" },
  { key: "othVotes", label: "O votes" },
  { key: "totalVotes", label: "Total votes" },
  { key: "demSeats", label: "D seats" },
  { key: "repSeats", label: "R seats" },
  { key: "othSeats", label: "O seats" },
  { key: "totalSeats", label: "Chamber size" },
  { key: "demSeatsWon", label: "D won" },
  { key: "repSeatsWon", label: "R won" },
  { key: "othSeatsWon", label: "O won" },
  { key: "seatsUp", label: "Seats up" },
];

type Tier = "dataset" | "wikipedia" | "none";

const TIER_COLOR: Record<Tier, string> = {
  dataset: "#3d8f5f",
  wikipedia: "#c9a227",
  none: "var(--app-text-very-muted)",
};

const TIER_LABEL: Record<Tier, string> = {
  dataset: "Research dataset / official returns",
  wikipedia: "Wikipedia-derived",
  none: "No source",
};

/**
 * Source strings fall into two confidence tiers. Klarner's SLERS returns, MEDSL's precinct file
 * and the Louisiana SoS canvass are all compiled from official returns; anything parsed out of a
 * Wikipedia article is a transcription of those returns and ranks below them, which is what the
 * grid's color is showing.
 */
function tierOf(source: string | undefined): Tier {
  if (!source) return "none";
  if (source.startsWith("Wikipedia")) return "wikipedia";
  return "dataset";
}

/** Short label for the grid cell — enough to read the provenance pattern down a column. */
function sourceCode(source: string | undefined): string {
  if (!source) return "";
  if (source.startsWith("Klarner")) return "K";
  if (source.startsWith("MEDSL")) return "M";
  if (source.startsWith("Louisiana SoS")) return "L";
  if (source.startsWith("Wikipedia infobox")) return "wi";
  if (source.startsWith("Wikipedia district tables")) return "wd";
  return "w";
}

export type CoverageRow = {
  abbr: string;
  stateName: string;
  chamberLabel: string;
  year: number;
  entry: StateLegEntry;
  source: string;
  tier: Tier;
  missing: string[];
  /** Internal-consistency failures: the row's own numbers contradicting each other. */
  errors: string[];
  /** Known, accepted limitations recorded on the row rather than defects. */
  caveats: string[];
};

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function checkRow(e: StateLegEntry): { missing: string[]; errors: string[]; caveats: string[] } {
  const missing = FIELDS.filter((f) => e[f.key] == null).map((f) => f.label);
  const errors: string[] = [];

  const { demVotes, repVotes, othVotes, totalVotes } = e;
  if (demVotes != null && repVotes != null && othVotes != null && totalVotes != null) {
    if (demVotes + repVotes + othVotes !== totalVotes) errors.push("D+R+O votes ≠ total votes");
  }
  const { demSeats, repSeats, othSeats, totalSeats } = e;
  if (demSeats != null && repSeats != null && othSeats != null && totalSeats != null) {
    if (demSeats + repSeats + othSeats !== totalSeats) errors.push("D+R+O seats ≠ chamber size");
  }
  const { demSeatsWon, repSeatsWon, othSeatsWon, seatsUp } = e;
  if (demSeatsWon != null && repSeatsWon != null && othSeatsWon != null && seatsUp != null) {
    if (demSeatsWon + repSeatsWon + othSeatsWon !== seatsUp) errors.push("seats won ≠ seats up");
  }
  if (seatsUp != null && totalSeats != null && seatsUp > totalSeats) {
    errors.push("seats up > chamber size");
  }
  // Percentages are stored to one decimal, so allow rounding slack rather than exact equality.
  if (totalVotes) {
    const pctChecks: [number | undefined, number | undefined, string][] = [
      [e.demPct, demVotes, "D%"],
      [e.repPct, repVotes, "R%"],
      [e.othPct, othVotes, "O%"],
    ];
    for (const [pct, votes, label] of pctChecks) {
      if (pct == null || votes == null) continue;
      if (!near(pct, (votes / totalVotes) * 100, 0.06)) errors.push(`${label} does not follow votes`);
    }
  }

  // Every note on a row is a recorded limitation of its source rather than a defect - a source
  // with no third-party bucket, contests whose votes the source never carried, precinct rows the
  // state redacted, unopposed seats printed with no vote count. Surfaced verbatim: the set of
  // wordings is open-ended, so matching a fixed list would silently drop the next new one. Some
  // notes repeat their own text; collapse that rather than showing it twice.
  const caveats = (e.note ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const half = s.slice(0, (s.length - 1) / 2);
      return half && s === `${half} ${half}` ? half : s;
    })
    .filter((s, i, all) => all.indexOf(s) === i);

  return { missing, errors, caveats };
}

export function buildCoverageRows(): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const state of statesData) {
    if (state.abbr === "DC") continue;
    const entries = stateLegData[state.name] ?? [];
    for (const e of entries) {
      if (e.year < FIRST_YEAR || e.year > LAST_YEAR) continue;
      // Nebraska's unicameral body lives in this CSV's "House" rows; its "Senate" rows are
      // intentional empty placeholders and are not chamber-years to be filled.
      if (UNICAMERAL_STATES.has(state.abbr) && e.type === "Senate") continue;
      const { missing, errors, caveats } = checkRow(e);
      rows.push({
        abbr: state.abbr,
        stateName: state.name,
        chamberLabel: UNICAMERAL_STATES.has(state.abbr) ? "Unicameral" : e.type,
        year: e.year,
        entry: e,
        source: e.source ?? "",
        tier: tierOf(e.source),
        missing,
        errors,
        caveats,
      });
    }
  }
  return rows;
}

type SortKey = "state" | "year" | "source" | "votes" | "seats" | "status";

function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString();
}

export default function StateLegCoverageAuditTable() {
  const allRows = useMemo(buildCoverageRows, []);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const complete = allRows.filter((r) => r.missing.length === 0).length;
  const errored = allRows.filter((r) => r.errors.length > 0).length;
  const wikipedia = allRows.filter((r) => r.tier === "wikipedia").length;
  const caveated = allRows.filter((r) => r.caveats.length > 0).length;

  // chamber (state + House/Senate) -> year -> row, for the grid view.
  const chambers = useMemo(() => {
    const byChamber = new Map<string, { abbr: string; chamberLabel: string; byYear: Map<number, CoverageRow> }>();
    for (const r of allRows) {
      const key = `${r.abbr}-${r.chamberLabel}`;
      let c = byChamber.get(key);
      if (!c) {
        c = { abbr: r.abbr, chamberLabel: r.chamberLabel, byYear: new Map() };
        byChamber.set(key, c);
      }
      c.byYear.set(r.year, r);
    }
    return [...byChamber.values()].sort(
      (a, b) => a.abbr.localeCompare(b.abbr) || a.chamberLabel.localeCompare(b.chamberLabel)
    );
  }, [allRows]);

  const rows = useMemo(() => {
    let r = allRows;
    if (onlyFlagged) {
      r = r.filter((row) => row.missing.length > 0 || row.errors.length > 0 || row.tier === "wikipedia");
    }
    const rank = (row: CoverageRow) =>
      row.missing.length > 0 ? 3 : row.errors.length > 0 ? 2 : row.tier === "wikipedia" ? 1 : 0;
    return [...r].sort((a, b) => {
      const dir = sortDir;
      switch (sortKey) {
        case "state":
          return dir * (a.abbr.localeCompare(b.abbr) || a.chamberLabel.localeCompare(b.chamberLabel) || a.year - b.year);
        case "year":
          return dir * (a.year - b.year || a.abbr.localeCompare(b.abbr));
        case "source":
          return dir * (a.source.localeCompare(b.source) || a.abbr.localeCompare(b.abbr));
        case "votes":
          return dir * ((a.entry.totalVotes ?? -1) - (b.entry.totalVotes ?? -1));
        case "seats":
          return dir * ((a.entry.totalSeats ?? -1) - (b.entry.totalSeats ?? -1));
        case "status":
          return dir * (rank(a) - rank(b)) || a.abbr.localeCompare(b.abbr) || a.year - b.year;
        default:
          return 0;
      }
    });
  }, [allRows, sortKey, sortDir, onlyFlagged]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const headers: { key: SortKey | null; label: string; align?: "left" | "right" }[] = [
    { key: "state", label: "State", align: "left" },
    { key: null, label: "Chamber", align: "left" },
    { key: "year", label: "Year", align: "right" },
    { key: null, label: "D votes", align: "right" },
    { key: null, label: "R votes", align: "right" },
    { key: null, label: "O votes", align: "right" },
    { key: "votes", label: "Total votes", align: "right" },
    { key: null, label: "Seats (D/R/O)", align: "right" },
    { key: "seats", label: "Size", align: "right" },
    { key: null, label: "Won (D/R/O)", align: "right" },
    { key: null, label: "Up", align: "right" },
    { key: "source", label: "Source", align: "left" },
    { key: "status", label: "Status", align: "left" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{allRows.length}</strong> chamber-years
          </span>
          <span>
            <strong style={{ color: complete === allRows.length ? "#3d8f5f" : "var(--party-rep)" }}>{complete}</strong> complete on all 12 fields
          </span>
          <span>
            <strong style={{ color: errored ? "var(--party-rep)" : "var(--app-text-primary)" }}>{errored}</strong> internally inconsistent
          </span>
          <span>
            <strong style={{ color: wikipedia ? "#c9a227" : "var(--app-text-primary)" }}>{wikipedia}</strong> Wikipedia-derived
          </span>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{caveated}</strong> with source caveats
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 text-xs">
            {(["grid", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-2.5 py-1 rounded-full font-semibold capitalize"
                style={{
                  background: view === v ? "var(--app-text-primary)" : "var(--app-tab-bg)",
                  color: view === v ? "var(--app-bg)" : "var(--app-text-muted)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          {view === "table" && (
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              Only incomplete / inconsistent / Wikipedia
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
        {(["dataset", "wikipedia", "none"] as Tier[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TIER_COLOR[t], opacity: t === "none" ? 0.3 : 0.85 }} />
            {TIER_LABEL[t]}
          </span>
        ))}
        <span>K = Klarner · M = MEDSL · L = Louisiana SoS · wi = Wikipedia infobox · wd = Wikipedia district tables</span>
      </div>

      {view === "grid" ? (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  Chamber
                </th>
                {YEARS.map((y) => (
                  <th
                    key={y}
                    className="pb-2 px-1 text-center text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {`'${String(y).slice(2)}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chambers.map((c) => (
                <tr key={`${c.abbr}-${c.chamberLabel}`} style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}>
                  <td className="py-1 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>
                    {c.abbr} <span style={{ color: "var(--app-text-muted)" }}>{c.chamberLabel}</span>
                  </td>
                  {YEARS.map((y) => {
                    const row = c.byYear.get(y);
                    if (!row) {
                      return (
                        <td key={y} className="py-1 px-1 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                          ·
                        </td>
                      );
                    }
                    const bad = row.missing.length > 0 || row.errors.length > 0;
                    const title = [
                      `${row.abbr} ${row.chamberLabel} ${row.year}`,
                      row.source,
                      `D ${fmtNum(row.entry.demVotes)} · R ${fmtNum(row.entry.repVotes)} · O ${fmtNum(row.entry.othVotes)} · T ${fmtNum(row.entry.totalVotes)}`,
                      `Seats ${row.entry.demSeats}D/${row.entry.repSeats}R/${row.entry.othSeats}O of ${row.entry.totalSeats}`,
                      `Won ${row.entry.demSeatsWon}D/${row.entry.repSeatsWon}R/${row.entry.othSeatsWon}O of ${row.entry.seatsUp} up`,
                      ...(row.missing.length ? [`MISSING: ${row.missing.join(", ")}`] : []),
                      ...row.errors.map((x) => `ERROR: ${x}`),
                      ...row.caveats.map((x) => `Caveat: ${x}`),
                    ].join("\n");
                    return (
                      <td key={y} className="py-1 px-1 text-center" title={title}>
                        <span
                          className="inline-flex items-center justify-center w-6 h-5 rounded-sm font-semibold"
                          style={{
                            background: bad ? "var(--party-rep)" : TIER_COLOR[row.tier],
                            color: "#fff",
                            opacity: bad ? 1 : 0.85,
                            outline: row.caveats.length ? "1px solid var(--app-text-primary)" : undefined,
                          }}
                        >
                          {sourceCode(row.source)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                {headers.map((h) => (
                  <th
                    key={h.label}
                    onClick={h.key ? () => toggleSort(h.key as SortKey) : undefined}
                    className={`pb-2 pr-3 pt-1 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap select-none ${h.align === "right" ? "text-right" : "text-left"} ${h.key ? "cursor-pointer" : ""}`}
                    style={{ color: h.key && sortKey === h.key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                  >
                    {h.label}
                    {h.key && sortKey === h.key ? (sortDir === 1 ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e = row.entry;
                return (
                  <tr key={`${row.abbr}-${row.chamberLabel}-${row.year}`} style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>{row.abbr}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{row.chamberLabel}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{row.year}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>{fmtNum(e.demVotes)}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-rep)" }}>{fmtNum(e.repVotes)}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{fmtNum(e.othVotes)}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>{fmtNum(e.totalVotes)}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-secondary)" }}>
                      {e.demSeats ?? "—"}/{e.repSeats ?? "—"}/{e.othSeats ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{e.totalSeats ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-secondary)" }}>
                      {e.demSeatsWon ?? "—"}/{e.repSeatsWon ?? "—"}/{e.othSeatsWon ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{e.seatsUp ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-xs" style={{ color: TIER_COLOR[row.tier] }} title={row.source}>
                      {row.source || "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: row.missing.length || row.errors.length ? "var(--party-rep)" : "var(--app-text-muted)" }}>
                      {row.missing.length ? `missing ${row.missing.length}: ${row.missing.join(", ")}` : null}
                      {row.errors.length ? row.errors.join("; ") : null}
                      {!row.missing.length && !row.errors.length ? (row.caveats.join("; ") || "OK") : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
