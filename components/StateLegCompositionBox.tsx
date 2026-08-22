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
    <div className="py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>
          {entry.year}
        </span>
        {winner && margin ? (
          <span
            className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums"
            style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {winner}+{margin}
          </span>
        ) : (
          <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
        )}
      </div>

      {hasSeats && (
        <div className="mb-1.5 flex items-center gap-1.5 whitespace-nowrap text-lg font-bold leading-none tabular-nums">
          <span style={{ color: "var(--party-dem)" }}>{entry.demSeats}D</span>
          <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
          <span style={{ color: "var(--party-rep)" }}>{entry.repSeats}R</span>
        </div>
      )}

      {hasVoteData ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="font-bold" style={{ color: "var(--party-dem)" }}>D {entry.demPct!.toFixed(1)}%</span>
            <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              {entry.demVotes != null ? entry.demVotes.toLocaleString() : "—"}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="font-bold" style={{ color: "var(--party-rep)" }}>R {entry.repPct!.toFixed(1)}%</span>
            <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              {entry.repVotes != null ? entry.repVotes.toLocaleString() : "—"}
            </span>
          </div>
        </div>
      ) : !hasSeats ? (
        <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Vote data unavailable</div>
      ) : null}
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
      className="flex min-w-0 flex-col"
      style={{
        flex: "0 0 25rem",
        height: "25rem",
      }}
    >
      <div className="mb-3 flex shrink-0 flex-col items-start gap-3">
        <h2
          className="text-[11px] uppercase tracking-wider font-bold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Legislative Composition · Since 2016
        </h2>
        {tabs.length > 1 && (
          <div className="flex items-end gap-4 w-full" style={{ borderBottom: "1px solid var(--app-border)" }}>
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className="whitespace-nowrap pb-2 text-xs font-semibold transition-colors"
                style={tab === item.key
                  ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                  : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
        <div className="flex flex-col">
          {entries.map((entry) => (
            <EntryCard key={`${entry.year}-${"type" in entry ? entry.type : "US House"}`} entry={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
