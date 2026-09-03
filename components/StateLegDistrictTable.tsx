"use client";

import { useMemo, useRef, useEffect } from "react";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { districtResultMargin } from "@/lib/useStateLegResults";
import { isUnassignedResultKey } from "@/lib/stateLegDistrictKey";
import { fmtMargin } from "@/lib/colorScale";

const CHAMBER_LABEL: Record<Chamber, string> = {
  house: "State House",
  senate: "State Senate",
};

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

/** `short` is used below the md breakpoint, where the full party names don't fit. */
type Column = { full: string; short?: string };

const SEATS_COLUMNS: Column[] = [
  { full: "District", short: "Dist" },
  { full: "Incumbent" },
  { full: "Party" },
  { full: "Last Election", short: "Last" },
  { full: "Margin" },
  { full: "2024 President", short: "2024 Pres" },
];
const RESULTS_COLUMNS: Column[] = [
  { full: "District", short: "Dist" },
  { full: "Democratic", short: "Dem" },
  { full: "Republican", short: "Rep" },
  { full: "Other", short: "Oth" },
  { full: "Total" },
  { full: "Margin" },
];

/** A party's share of the district's total vote. The raw counts stay in the data and are one
 *  hover away here, but as columns they cost the width that made this table scroll on a phone. */
function voteShare(votes: number | null | undefined, total: number): string {
  return `${(((votes ?? 0) / total) * 100).toFixed(1)}%`;
}

/** "2" before "10", and "12A" before "12B" — a plain string sort scatters a numbered chamber. */
function compareDistrictKeys(a: string, b: string): number {
  const [, aNum, aRest] = a.match(/^(\d*)(.*)$/) as RegExpMatchArray;
  const [, bNum, bRest] = b.match(/^(\d*)(.*)$/) as RegExpMatchArray;
  if (aNum && bNum && aNum !== bNum) return Number(aNum) - Number(bNum);
  if (!!aNum !== !!bNum) return aNum ? -1 : 1;
  return aRest.localeCompare(bRest);
}

/** Districts listed, for the panel header. A row of votes the source left unattributed to any
 *  district (RI 2024) is listed but is not a district, so it isn't counted as one. */
export function districtRowCount(
  districts: StateLegDistrict[],
  results: Record<string, StateLegDistrictResult> | null,
  viewMode: MapViewMode
): number {
  if (viewMode === "results") return results ? Object.keys(results).filter((k) => !isUnassignedResultKey(k)).length : 0;
  return districts.length;
}

export default function StateLegDistrictTable({
  districts,
  chamber,
  stateName,
  isUnicameral = false,
  pres2024 = {},
  results = null,
  resultsYear = null,
  resultsLoading = false,
  viewMode = "seats",
  selectedKey = null,
  onSelect,
}: {
  districts: StateLegDistrict[];
  chamber: Chamber;
  stateName: string;
  isUnicameral?: boolean;
  pres2024?: Record<string, StateLegPres2024>;
  results?: Record<string, StateLegDistrictResult> | null;
  resultsYear?: number | null;
  resultsLoading?: boolean;
  viewMode?: MapViewMode;
  selectedKey?: string | null;
  /** Selecting from the table drives the map, the same way the map drives the table. */
  onSelect?: (districtNumber: string | null) => void;
}) {
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[chamber];
  const isResultsView = viewMode === "results";

  // A past election's rows come from the results themselves, not from the current district list:
  // under a superseded map the chamber can have had different districts entirely, and a staggered
  // chamber only elected part of itself that year.
  const resultRows = useMemo(
    () => (results ? Object.entries(results).sort(([a], [b]) => compareDistrictKeys(a, b)) : []),
    [results]
  );

  const columns = isResultsView ? RESULTS_COLUMNS : SEATS_COLUMNS;
  const rowCount = isResultsView ? resultRows.length : districts.length;

  // A selected row is usually far below the fold in a chamber of 100-plus districts, so a click
  // on the map would highlight a row nobody can see. Only this box's own scrollTop is moved, and
  // only far enough to clear the sticky header: `scrollIntoView` would walk every scrollable
  // ancestor, and since the table sits under the map it would drag the whole page down to it,
  // away from the district the reader just clicked.
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!selectedKey) return;
    const row = selectedRowRef.current;
    const box = scrollBoxRef.current;
    if (!row || !box) return;
    const rowRect = row.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const headerHeight = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    // Rounded up so a fractional row height doesn't leave a sliver of the row under the edge.
    if (rowRect.top < boxRect.top + headerHeight) box.scrollTop -= Math.ceil(boxRect.top + headerHeight - rowRect.top);
    else if (rowRect.bottom > boxRect.bottom) box.scrollTop += Math.ceil(rowRect.bottom - boxRect.bottom);
  }, [selectedKey]);

  // The heading, the district count and the surrounding box come from the section this sits in
  // (the district panel on the legislature page) — all this renders is the scrollable table.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollBoxRef} className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-[11px] md:text-sm">
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
              {columns.map((col, i) => (
                <th
                  key={col.full}
                  className={`pb-2 pr-2 md:pr-3 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${i === 0 || (!isResultsView && i === 1) ? "text-left" : "text-right"}`}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {col.short ? (
                    <>
                      <span className="md:hidden">{col.short}</span>
                      <span className="hidden md:inline">{col.full}</span>
                    </>
                  ) : (
                    col.full
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCount === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    {isResultsView
                      ? resultsLoading
                        ? `Loading ${resultsYear} results…`
                        : `No ${resultsYear} results for the ${stateName} ${chamberLabel}.`
                      : `District data for ${stateName} ${chamberLabel} isn't available yet.`}
                  </p>
                  {!isResultsView && (
                    <p className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      Check back once 2026 boundaries and results are added.
                    </p>
                  )}
                </td>
              </tr>
            ) : isResultsView ? (
              resultRows.map(([key, result]) => {
                const margin = districtResultMargin(result);
                const isSelected = selectedKey === key;
                // The unattributed-votes row is listed but is not a district, so there is
                // nothing on the map for it to select.
                const selectable = !!onSelect && !isUnassignedResultKey(key);
                return (
                  <tr
                    key={key}
                    ref={isSelected ? selectedRowRef : undefined}
                    className={selectable ? "stateleg-row" : undefined}
                    data-selected={isSelected || undefined}
                    onClick={selectable ? () => onSelect?.(isSelected ? null : key) : undefined}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      background: isSelected ? "var(--app-tab-bg)" : undefined,
                    }}
                  >
                    <td
                      className="py-2 pr-2 md:py-3 md:pr-3 text-left font-semibold whitespace-nowrap tabular-nums"
                      style={{ color: "var(--app-text-primary)" }}
                      title={isUnassignedResultKey(key) ? "Votes the source could not attribute to a district" : undefined}
                    >
                      {key}
                      {isUnassignedResultKey(key) && (
                        <span className="ml-1 font-normal italic" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>unassigned</span>
                      )}
                    </td>
                    {margin == null ? (
                      <td colSpan={4} className="py-2 pr-2 md:py-3 md:pr-3 text-right italic" style={{ color: "var(--app-text-very-muted)" }}>
                        No vote count published
                      </td>
                    ) : (
                      <>
                        {/* Shares of the district total; the count each one is drawn from is on
                            the cell's tooltip, and in full in the map's hover card. */}
                        <td
                          className="py-2 pr-2 md:py-3 md:pr-3 text-right font-semibold tabular-nums"
                          style={{ color: "var(--party-dem)" }}
                          title={`${(result.demVotes ?? 0).toLocaleString()} votes`}
                        >
                          {voteShare(result.demVotes, result.totalVotes!)}
                        </td>
                        <td
                          className="py-2 pr-2 md:py-3 md:pr-3 text-right font-semibold tabular-nums"
                          style={{ color: "var(--party-rep)" }}
                          title={`${(result.repVotes ?? 0).toLocaleString()} votes`}
                        >
                          {voteShare(result.repVotes, result.totalVotes!)}
                        </td>
                        <td
                          className="py-2 pr-2 md:py-3 md:pr-3 text-right font-semibold tabular-nums"
                          style={{ color: "var(--app-text-primary)" }}
                          title={`${(result.othVotes ?? 0).toLocaleString()} votes`}
                        >
                          {voteShare(result.othVotes, result.totalVotes!)}
                        </td>
                        <td className="py-2 pr-2 md:py-3 md:pr-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                          {(result.totalVotes ?? 0).toLocaleString()}
                        </td>
                      </>
                    )}
                    <td
                      className="py-2 md:py-3 text-right tabular-nums font-semibold whitespace-nowrap"
                      style={{ color: margin == null ? "var(--app-text-very-muted)" : margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
                      title={result.uncontested ? "Every contest in this district had a single candidate" : undefined}
                    >
                      {margin == null ? "—" : fmtMargin(margin)}
                      {result.uncontested && margin != null && <span style={{ color: "var(--app-text-very-muted)" }}> *</span>}
                    </td>
                  </tr>
                );
              })
            ) : (
              districts.map((d) => {
                const incumbents = d.incumbents ?? [];
                const pres = pres2024[d.number];
                const isSelected = selectedKey === d.number;
                return (
                  <tr
                    key={d.id}
                    ref={isSelected ? selectedRowRef : undefined}
                    className={onSelect ? "stateleg-row" : undefined}
                    data-selected={isSelected || undefined}
                    onClick={onSelect ? () => onSelect(isSelected ? null : d.number) : undefined}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      background: isSelected ? "var(--app-tab-bg)" : undefined,
                    }}
                  >
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-left font-semibold whitespace-nowrap tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {d.number}
                    </td>
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-left" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.length > 0 ? (
                        incumbents.map((inc) => inc.name).join(", ")
                      ) : (
                        <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-right font-semibold whitespace-nowrap">
                      {incumbents.length > 0 ? (
                        incumbents.map((inc, j) => (
                          <span key={j} style={{ color: PARTY_COLOR[inc.party] }}>
                            {j > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>, </span>}
                            {inc.party}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.some((inc) => inc.lastElection != null) ? (
                        incumbents.map((inc, j) => (
                          <span key={j} style={{ color: (inc.lastElection ?? d.lastElection) != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                            {j > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>, </span>}
                            {inc.lastElection ?? d.lastElection ?? "—"}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: d.lastElection != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{d.lastElection ?? "—"}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: d.margin != null ? (d.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
                      {d.margin != null ? `${d.margin <= 0 ? "D" : "R"}+${Math.abs(d.margin).toFixed(1)}` : "—"}
                    </td>
                    <td className="py-2 md:py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: pres ? (pres.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
                      {pres ? (
                        <span title={pres.estimated ? "Estimated - no 2024 election in this district" : undefined}>
                          {pres.estimated && "~"}{fmtMargin(pres.margin)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isResultsView && resultRows.some(([, r]) => r.uncontested) && (
        <div className="shrink-0 pt-2 text-[10px] italic" style={{ color: "var(--app-text-very-muted)" }}>
          * every contest in the district had a single candidate
        </div>
      )}
    </div>
  );
}
