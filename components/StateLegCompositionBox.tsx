"use client";

import { useState } from "react";
import type { HouseDelegationEntry, StateLegEntry } from "@/data/forecastData";

type CompositionEntry = StateLegEntry | HouseDelegationEntry;
type CompositionTab = "us-house" | "state-house" | "state-senate" | "state-legislature";

function EntryCard({ entry }: { entry: CompositionEntry }) {
  const hasSeats = entry.demSeats != null && entry.repSeats != null;
  const hasVoteData = entry.demPct != null && entry.repPct != null;
  const winner = hasVoteData ? (entry.demPct! > entry.repPct! ? "D" : "R") : null;
  const margin = hasVoteData ? Math.abs(entry.demPct! - entry.repPct!).toFixed(1) : null;
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--app-bg)" }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
          {entry.year}
        </span>
        {winner && margin ? (
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={winner === "D"
              ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
              : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
          >
            {winner}+{margin}
          </span>
        ) : (
          <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
        )}
      </div>
      {hasVoteData ? (
        <>
          <div className="mb-1.5 flex min-w-0 items-end gap-2">
            {hasSeats ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-xl font-bold leading-none tabular-nums">
                <span style={{ color: "var(--party-dem)" }}>{entry.demSeats}D</span>
                <span style={{ color: "var(--app-text-very-muted)" }}>-</span>
                <span style={{ color: "var(--party-rep)" }}>{entry.repSeats}R</span>
              </div>
            ) : (
              <span className="min-w-0 flex-1 text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Seats TBD</span>
            )}

            <div className="shrink-0">
              <div className="mb-1 flex items-baseline gap-1">
                <span className="w-7 text-sm font-bold" style={{ color: "var(--party-dem)" }}>D:</span>
                <span className="w-12 text-sm font-bold tabular-nums" style={{ color: "var(--party-dem)" }}>
                  {entry.demPct!.toFixed(1)}%
                </span>
                <span className="w-16 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                  {entry.demVotes != null ? entry.demVotes.toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="w-7 text-sm font-bold" style={{ color: "var(--party-rep)" }}>R:</span>
                <span className="w-12 text-sm font-bold tabular-nums" style={{ color: "var(--party-rep)" }}>
                  {entry.repPct!.toFixed(1)}%
                </span>
                <span className="w-16 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                  {entry.repVotes != null ? entry.repVotes.toLocaleString() : "—"}
                </span>
              </div>
            </div>
          </div>

        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          {hasSeats && (
            <div className="flex items-center gap-1.5 whitespace-nowrap text-xl font-bold leading-none tabular-nums">
              <span style={{ color: "var(--party-dem)" }}>{entry.demSeats}D</span>
              <span style={{ color: "var(--app-text-very-muted)" }}>-</span>
              <span style={{ color: "var(--party-rep)" }}>{entry.repSeats}R</span>
            </div>
          )}
          <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
            Vote data unavailable
          </div>
        </div>
      )}
    </div>
  );
}

export default function StateLegCompositionBox({
  federalEntries,
  houseEntries,
  senateEntries,
  isUnicameral = false,
}: {
  federalEntries: HouseDelegationEntry[];
  houseEntries: StateLegEntry[];
  senateEntries: StateLegEntry[];
  isUnicameral?: boolean;
}) {
  const hasFederal = federalEntries.length > 0;
  const hasHouse = houseEntries.length > 0;
  const hasSenate = senateEntries.length > 0;
  const [tab, setTab] = useState<CompositionTab>(hasFederal ? "us-house" : isUnicameral ? "state-legislature" : hasHouse ? "state-house" : "state-senate");

  if (!hasFederal && !hasHouse && !hasSenate) return null;

  const tabs: { key: CompositionTab; label: string }[] = [
    ...(hasFederal ? [{ key: "us-house" as const, label: "US House" }] : []),
    ...(hasHouse ? [{ key: (isUnicameral ? "state-legislature" : "state-house") as CompositionTab, label: isUnicameral ? "State Legislature" : "State House" }] : []),
    ...(!isUnicameral && hasSenate ? [{ key: "state-senate" as const, label: "State Senate" }] : []),
  ];
  const entries: CompositionEntry[] = tab === "us-house" ? federalEntries : tab === "state-senate" ? senateEntries : houseEntries;

  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-xl p-3"
      style={{
        background: "var(--app-panel)",
        border: "1px solid var(--app-border)",
        flex: "0 0 25rem",
        height: "25rem",
      }}
    >
      <div className="mb-3 flex shrink-0 flex-col items-start gap-2">
        <h2
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Legislative Composition · Since 2016
        </h2>
        {tabs.length > 1 && (
          <div className="flex overflow-hidden rounded-md" style={{ border: "1px solid var(--app-border)" }}>
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className="whitespace-nowrap px-2 py-1 text-[10px] font-semibold transition-colors"
                style={tab === item.key
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "var(--app-panel)", color: "var(--app-text-muted)" }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <EntryCard key={`${entry.year}-${"type" in entry ? entry.type : "US House"}`} entry={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
