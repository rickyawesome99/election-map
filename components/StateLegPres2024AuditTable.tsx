"use client";

import { useMemo, useState } from "react";
import { statesData } from "@/data/statesData";
import { stateLegPres2024, type StateLegPres2024 } from "@/data/stateLegPres2024";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { presPastResults } from "@/data/forecastData";
import { fmtMargin, marginColor } from "@/lib/colorScale";

type Row = {
  abbr: string;
  chamber: Chamber;
  chamberLabel: string;
  districtCount: number;
  aggDemVotes: number | null;
  aggRepVotes: number | null;
  aggTotalVotes: number | null;
  aggMargin: number | null;
  offDemVotes: number | null;
  offRepVotes: number | null;
  offTotalVotes: number | null;
  offMargin: number | null;
  totalVoteDiff: number | null;
  demVoteDiff: number | null;
  repVoteDiff: number | null;
  marginDiff: number | null;
  hasData: boolean;
};

const CHAMBER_LABEL: Record<Chamber, string> = { house: "House", senate: "Senate" };

function aggregateChamber(districts: Record<string, StateLegPres2024> | undefined) {
  if (!districts) return null;
  const values = Object.values(districts);
  if (values.length === 0) return null;
  let demVotes = 0;
  let repVotes = 0;
  let totalVotes = 0;
  let counted = 0;
  for (const d of values) {
    if (d.demVotes == null || d.repVotes == null || d.totalVotes == null) continue;
    demVotes += d.demVotes;
    repVotes += d.repVotes;
    totalVotes += d.totalVotes;
    counted += 1;
  }
  if (counted === 0) return null;
  const demPct = (demVotes / totalVotes) * 100;
  const repPct = (repVotes / totalVotes) * 100;
  return {
    districtCount: values.length,
    demVotes,
    repVotes,
    totalVotes,
    margin: repPct - demPct,
  };
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const state of statesData) {
    if (state.abbr === "DC") continue;
    const isUnicameral = UNICAMERAL_STATES.has(state.abbr);
    const chambers: Chamber[] = isUnicameral ? ["senate"] : ["house", "senate"];
    const official = presPastResults[state.abbr]?.find((r) => r.year === 2024);

    for (const chamber of chambers) {
      const agg = aggregateChamber(stateLegPres2024[state.abbr]?.[chamber]);
      const offDemVotes = official?.demVotes ?? null;
      const offRepVotes = official?.repVotes ?? null;
      const offTotalVotes = official?.totalVotes ?? null;
      const offMargin = official?.margin ?? null;

      const totalVoteDiff = agg && offTotalVotes != null ? agg.totalVotes - offTotalVotes : null;
      const demVoteDiff = agg && offDemVotes != null ? agg.demVotes - offDemVotes : null;
      const repVoteDiff = agg && offRepVotes != null ? agg.repVotes - offRepVotes : null;
      const marginDiff = agg && offMargin != null ? agg.margin - offMargin : null;

      rows.push({
        abbr: state.abbr,
        chamber,
        chamberLabel: isUnicameral ? "Unicameral" : CHAMBER_LABEL[chamber],
        districtCount: agg?.districtCount ?? 0,
        aggDemVotes: agg?.demVotes ?? null,
        aggRepVotes: agg?.repVotes ?? null,
        aggTotalVotes: agg?.totalVotes ?? null,
        aggMargin: agg?.margin ?? null,
        offDemVotes,
        offRepVotes,
        offTotalVotes,
        offMargin,
        totalVoteDiff,
        demVoteDiff,
        repVoteDiff,
        marginDiff,
        hasData: agg != null,
      });
    }
  }
  return rows;
}

type SortKey = "state" | "chamber" | "districts" | "aggTotal" | "offTotal" | "aggMargin" | "offMargin" | "voteDiff" | "dDiff" | "rDiff" | "marginDiff";

function fmtNum(v: number | null): string {
  return v == null ? "—" : v.toLocaleString();
}

function fmtSignedNum(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString()}`;
}

function fmtSignedPct(v: number | null, digits = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function diffColor(v: number | null, warnAt: number, badAt: number): string {
  if (v == null) return "var(--app-text-very-muted)";
  const a = Math.abs(v);
  if (a >= badAt) return "var(--party-rep)";
  if (a >= warnAt) return "#c9a227";
  return "var(--app-text-primary)";
}

export default function StateLegPres2024AuditTable() {
  const allRows = useMemo(buildRows, []);
  const [sortKey, setSortKey] = useState<SortKey>("marginDiff");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [onlyGaps, setOnlyGaps] = useState(false);

  const rows = useMemo(() => {
    let r = allRows;
    if (onlyGaps) {
      r = r.filter((row) => !row.hasData || (row.marginDiff != null && Math.abs(row.marginDiff) >= 0.5));
    }
    const sorted = [...r].sort((a, b) => {
      const dir = sortDir;
      switch (sortKey) {
        case "state":
          return dir * a.abbr.localeCompare(b.abbr);
        case "chamber":
          return dir * a.chamberLabel.localeCompare(b.chamberLabel);
        case "districts":
          return dir * (a.districtCount - b.districtCount);
        case "aggTotal":
          return dir * ((a.aggTotalVotes ?? -1) - (b.aggTotalVotes ?? -1));
        case "offTotal":
          return dir * ((a.offTotalVotes ?? -1) - (b.offTotalVotes ?? -1));
        case "aggMargin":
          return dir * ((a.aggMargin ?? 0) - (b.aggMargin ?? 0));
        case "offMargin":
          return dir * ((a.offMargin ?? 0) - (b.offMargin ?? 0));
        case "voteDiff":
          return dir * (Math.abs(a.totalVoteDiff ?? 0) - Math.abs(b.totalVoteDiff ?? 0));
        case "dDiff":
          return dir * (Math.abs(a.demVoteDiff ?? 0) - Math.abs(b.demVoteDiff ?? 0));
        case "rDiff":
          return dir * (Math.abs(a.repVoteDiff ?? 0) - Math.abs(b.repVoteDiff ?? 0));
        case "marginDiff": {
          // Rows with no data sort to the top regardless of direction — they're the biggest problem.
          if (a.hasData !== b.hasData) return a.hasData ? 1 : -1;
          return dir * (Math.abs(a.marginDiff ?? 0) - Math.abs(b.marginDiff ?? 0));
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [allRows, sortKey, sortDir, onlyGaps]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const missingCount = allRows.filter((r) => !r.hasData).length;
  const flaggedCount = allRows.filter((r) => r.hasData && r.marginDiff != null && Math.abs(r.marginDiff) >= 0.5).length;

  const headers: { key: SortKey | null; label: string; align?: "left" | "right" }[] = [
    { key: "state", label: "State", align: "left" },
    { key: "chamber", label: "Chamber", align: "left" },
    { key: "districts", label: "Dist.", align: "right" },
    { key: null, label: "AD", align: "right" },
    { key: null, label: "D", align: "right" },
    { key: null, label: "AR", align: "right" },
    { key: null, label: "R", align: "right" },
    { key: "aggTotal", label: "Agg Total", align: "right" },
    { key: "offTotal", label: "Total", align: "right" },
    { key: "dDiff", label: "D Diff", align: "right" },
    { key: "rDiff", label: "R Diff", align: "right" },
    { key: "voteDiff", label: "Total Diff", align: "right" },
    { key: "aggMargin", label: "Agg Margin", align: "right" },
    { key: "offMargin", label: "Official Margin", align: "right" },
    { key: "marginDiff", label: "Margin Diff", align: "right" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{allRows.length}</strong> chamber rows checked
          </span>
          <span>
            <strong style={{ color: missingCount ? "var(--party-rep)" : "var(--app-text-primary)" }}>{missingCount}</strong> with no data
          </span>
          <span>
            <strong style={{ color: flaggedCount ? "#c9a227" : "var(--app-text-primary)" }}>{flaggedCount}</strong> flagged (margin diff ≥ 0.5 pts)
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
          <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
          Show only gaps / flagged rows
        </label>
      </div>

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
            {rows.map((row) => (
              <tr
                key={`${row.abbr}-${row.chamber}`}
                style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}
              >
                <td className="py-1.5 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>
                  {row.abbr}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                  {row.chamberLabel}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                  {row.hasData ? row.districtCount : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>
                  {fmtNum(row.aggDemVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>
                  {fmtNum(row.offDemVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-rep)" }}>
                  {fmtNum(row.aggRepVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-rep)" }}>
                  {fmtNum(row.offRepVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                  {fmtNum(row.aggTotalVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                  {fmtNum(row.offTotalVotes)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.demVoteDiff, 1, 10000) }}>
                  {row.hasData ? fmtSignedNum(row.demVoteDiff) : "NO DATA"}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.repVoteDiff, 1, 10000) }}>
                  {row.hasData ? fmtSignedNum(row.repVoteDiff) : "NO DATA"}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: diffColor(row.totalVoteDiff, 1, 10000) }}>
                  {row.hasData ? fmtSignedNum(row.totalVoteDiff) : "NO DATA"}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: marginColor(row.aggMargin) }}>
                  {fmtMargin(row.aggMargin)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-medium" style={{ color: marginColor(row.offMargin) }}>
                  {fmtMargin(row.offMargin)}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap font-bold" style={{ color: diffColor(row.marginDiff, 0.5, 2) }}>
                  {row.marginDiff == null ? "—" : fmtSignedPct(row.marginDiff, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
