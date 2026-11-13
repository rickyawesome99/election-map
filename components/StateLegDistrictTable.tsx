"use client";
import Link from "next/link";

import { Children, cloneElement, isValidElement, useMemo, useRef, useEffect, useState, type CSSProperties, type ReactElement } from "react";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { districtResultMargin } from "@/lib/useStateLegResults";
import { isUnassignedResultKey } from "@/lib/stateLegDistrictKey";
import { fmtMargin } from "@/lib/colorScale";
import { ELECTION_YEAR as electionYear } from "@/lib/electionYear";

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
  { full: "Next Election", short: "Next" },
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

/** Seats standing in the current cycle read as present tense; ones further out are reference
 *  detail, so they sit back a step. */
function nextElectionColor(year: number | null | undefined): string {
  if (year == null) return "var(--app-text-very-muted)";
  return year <= electionYear ? "var(--app-text-primary)" : "var(--app-text-very-muted)";
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

// A row laid out but not seen: no height, no rule, hidden, and out of the accessibility tree.
const FOLDED_CELL: CSSProperties = { paddingTop: 0, paddingBottom: 0, lineHeight: 0, borderTop: 0, borderBottom: 0 };
function foldRow(row: ReactElement<{ style?: CSSProperties; children?: React.ReactNode }>) {
  const cells = Children.map(row.props.children, (cell) =>
    isValidElement<{ style?: CSSProperties }>(cell) ? cloneElement(cell, { style: { ...cell.props.style, ...FOLDED_CELL } }) : cell,
  );
  return cloneElement(row, { style: { ...row.props.style, visibility: "hidden", borderBottom: 0 }, "aria-hidden": true, onClick: undefined } as object, cells);
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
  atlasHref,
  candidateHref,
  first,
}: {
  districts: StateLegDistrict[];
  /** Show only this many rows, with the state pages' "Show all N districts" button under them. */
  first?: number;
  /** Builds a member's candidate page URL; names link there when given. */
  candidateHref?: (name: string) => string;
  /** Builds the district's atlas page URL; the district cell links there when given. */
  atlasHref?: (key: string) => string;
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
  const [showAll, setShowAll] = useState(false);
  const folded = first != null && !showAll && rowCount > first;
  // Folded rows stay in the table, collapsed to nothing, so the columns are sized to every row from
  // the start and "Show all" never moves them.
  const sizer = (i: number) => folded && i >= first!;
  const fold = (i: number, row: ReactElement<{ style?: CSSProperties; children?: React.ReactNode }>) => (sizer(i) ? foldRow(row) : row);

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
      {/* With rows folded (`first`) the table is as tall as its rows and never scrolls down: the
          folded rows' invisible text spills a few px past their zero-height cells, so it is clipped. */}
      <div ref={scrollBoxRef} className={`min-h-0 min-w-0 flex-1 overflow-x-auto ${first != null ? "overflow-y-hidden" : "overflow-y-auto"}`}>
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
              resultRows.map(([key, result], i) => {
                const margin = districtResultMargin(result);
                const isSelected = selectedKey === key;
                // The unattributed-votes row is listed but is not a district, so there is
                // nothing on the map for it to select.
                const selectable = !!onSelect && !isUnassignedResultKey(key);
                return fold(i, (
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
                ));
              })
            ) : (
              districts.map((d, i) => {
                const incumbents = d.incumbents ?? [];
                const pres = pres2024[d.number];
                const isSelected = selectedKey === d.number;
                return fold(i, (
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
                      {atlasHref ? (
                        <Link prefetch={false} href={atlasHref(d.number)} className="hover:underline" title="Full district profile">{d.number}</Link>
                      ) : (
                        d.number
                      )}
                    </td>
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-left" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.length > 0 ? (
                        incumbents.map((inc, j) => (
                          <span key={j}>
                            {j > 0 && ", "}
                            {candidateHref ? <Link prefetch={false} href={candidateHref(inc.name)} className="hover:underline" onClick={(e) => e.stopPropagation()}>{inc.name}</Link> : inc.name}
                          </span>
                        ))
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
                    {/* Next regular election. Seats on this year's ballot are the ones a reader is
                        usually here for, so they stay in the primary colour and later cycles recede.
                        Per-incumbent years appear only where a district's seats are on different
                        cycles (WV Senate), mirroring the Last Election column above. */}
                    <td className="py-2 pr-2 md:py-3 md:pr-3 text-right tabular-nums whitespace-nowrap">
                      {incumbents.some((inc) => inc.nextElection != null) ? (
                        incumbents.map((inc, j) => {
                          const year = inc.nextElection ?? d.nextElection;
                          return (
                            <span key={j} style={{ color: nextElectionColor(year) }}>
                              {j > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>, </span>}
                              {year ?? "—"}
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ color: nextElectionColor(d.nextElection) }}>{d.nextElection ?? "—"}</span>
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
                ));
              })
            )}
          </tbody>
        </table>
      </div>

      {folded && (
        <div className="flex justify-center pt-3.5">
          <button type="button" onClick={() => setShowAll(true)} className="ix-press rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
            Show all {rowCount} districts
          </button>
        </div>
      )}

      {isResultsView && resultRows.some(([, r]) => r.uncontested) && (
        <div className="shrink-0 pt-2 text-[10px] italic" style={{ color: "var(--app-text-very-muted)" }}>
          * every contest in the district had a single candidate
        </div>
      )}
    </div>
  );
}
