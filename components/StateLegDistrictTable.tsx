"use client";

import { useMemo } from "react";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { districtResultMargin } from "@/lib/useStateLegResults";
import { isUnassignedResultKey } from "@/lib/stateLegDistrictKey";
import { getRatingColors, fmtMargin } from "@/lib/colorScale";

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

const SEATS_COLUMNS = ["District", "Incumbent", "Party", "Last Election", "Margin", "Rating", "2024 President"];
const RESULTS_COLUMNS = ["District", "Democratic", "Republican", "Other", "Total", "Margin"];

/** "2" before "10", and "12A" before "12B" — a plain string sort scatters a numbered chamber. */
function compareDistrictKeys(a: string, b: string): number {
  const [, aNum, aRest] = a.match(/^(\d*)(.*)$/) as RegExpMatchArray;
  const [, bNum, bRest] = b.match(/^(\d*)(.*)$/) as RegExpMatchArray;
  if (aNum && bNum && aNum !== bNum) return Number(aNum) - Number(bNum);
  if (!!aNum !== !!bNum) return aNum ? -1 : 1;
  return aRest.localeCompare(bRest);
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
  // The count in the header is of DISTRICTS, so a row of votes the source left unattributed to
  // any district (RI 2024) is listed but not counted as one.
  const districtRowCount = isResultsView ? resultRows.filter(([key]) => !isUnassignedResultKey(key)).length : rowCount;

  return (
    <section className="flex min-w-0 flex-col" style={{ height: "25rem" }}>
      <div
        className="flex shrink-0 items-baseline justify-between gap-3 pb-3 mb-1"
        style={{ borderBottom: "2px solid var(--app-text-primary)" }}
      >
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          {isResultsView ? `${resultsYear} ${chamberLabel} Results` : `${chamberLabel} Districts`}
        </h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {districtRowCount} district{districtRowCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
              {columns.map((label, i) => (
                <th
                  key={label}
                  className={`pb-2 pr-3 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${i === 0 || (!isResultsView && i === 1) ? "text-left" : "text-right"}`}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {label}
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
                return (
                  <tr
                    key={key}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      background: isSelected ? "var(--app-tab-bg)" : undefined,
                    }}
                  >
                    <td
                      className="py-3 pr-3 text-left font-semibold whitespace-nowrap tabular-nums"
                      style={{ color: "var(--app-text-primary)" }}
                      title={isUnassignedResultKey(key) ? "Votes the source could not attribute to a district" : undefined}
                    >
                      {key}
                      {isUnassignedResultKey(key) && (
                        <span className="ml-1 font-normal italic" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>unassigned</span>
                      )}
                    </td>
                    {margin == null ? (
                      <td colSpan={4} className="py-3 pr-3 text-right italic" style={{ color: "var(--app-text-very-muted)" }}>
                        No vote count published
                      </td>
                    ) : (
                      <>
                        <td className="py-3 pr-3 text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                          {(result.demVotes ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                          {(result.repVotes ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                          {(result.othVotes ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                          {(result.totalVotes ?? 0).toLocaleString()}
                        </td>
                      </>
                    )}
                    <td
                      className="py-3 text-right tabular-nums font-semibold whitespace-nowrap"
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
                const { bg, text } = d.rating ? getRatingColors(d.rating) : { bg: "", text: "" };
                const pres = pres2024[d.number];
                const isSelected = selectedKey === d.number;
                return (
                  <tr
                    key={d.id}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      background: isSelected ? "var(--app-tab-bg)" : undefined,
                    }}
                  >
                    <td className="py-3 pr-3 text-left font-semibold whitespace-nowrap tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {d.number}
                    </td>
                    <td className="py-3 pr-3 text-left" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.length > 0 ? (
                        incumbents.map((inc) => inc.name).join(", ")
                      ) : (
                        <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold whitespace-nowrap">
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
                    <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
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
                    <td className="py-3 pr-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: d.margin != null ? (d.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
                      {d.margin != null ? `${d.margin <= 0 ? "D" : "R"}+${Math.abs(d.margin).toFixed(1)}` : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      {d.rating ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: bg, color: text }}>
                          {d.rating}
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: pres ? (pres.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
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
    </section>
  );
}
