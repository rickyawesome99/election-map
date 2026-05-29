"use client";

import { useState } from "react";
import type { StateLegEntry } from "@/data/forecastData";

function EntryCard({ entry }: { entry: StateLegEntry }) {
  const hasSeats = entry.demSeats != null && entry.repSeats != null;
  const hasVoteData = entry.demPct != null && entry.repPct != null;
  const winner = hasVoteData ? (entry.demPct! > entry.repPct! ? "D" : "R") : null;
  const margin = hasVoteData ? Math.abs(entry.demPct! - entry.repPct!).toFixed(1) : null;
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--app-bg)" }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
            {entry.year}
          </span>
          {hasSeats ? (
            <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <span style={{ color: "var(--party-dem)" }}>{entry.demSeats}D</span>
              <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>/</span>
              <span style={{ color: "var(--party-rep)" }}>{entry.repSeats}R</span>
            </div>
          ) : (
            <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Seats TBD</span>
          )}
        </div>
        {winner && margin ? (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
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
          <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
            <div style={{ width: `${entry.demPct}%`, background: "#1b408c" }} />
            <div style={{ width: `${entry.repPct}%`, background: "#be1c29" }} />
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span style={{ color: "var(--party-dem)" }}>{entry.demPct!.toFixed(1)}%</span>
            <span style={{ color: "var(--party-rep)" }}>{entry.repPct!.toFixed(1)}%</span>
          </div>
          {(entry.demVotes != null || entry.repVotes != null) && (
            <div className="mt-0.5 flex justify-between gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              <span className="truncate">
                {entry.demVotes != null ? entry.demVotes.toLocaleString() + " D votes" : ""}
              </span>
              <span className="truncate text-right">
                {entry.repVotes != null ? entry.repVotes.toLocaleString() + " R votes" : ""}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
          Vote data unavailable
        </div>
      )}
    </div>
  );
}

export default function StateLegCompositionBox({
  houseEntries,
  senateEntries,
}: {
  houseEntries: StateLegEntry[];
  senateEntries: StateLegEntry[];
}) {
  const hasHouse = houseEntries.length > 0;
  const hasSenate = senateEntries.length > 0;
  const [tab, setTab] = useState<"house" | "senate">(hasHouse ? "house" : "senate");

  if (!hasHouse && !hasSenate) return null;

  const entries = tab === "house" ? houseEntries : senateEntries;
  const showToggle = hasHouse && hasSenate;

  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl p-3"
      style={{
        background: "var(--app-panel)",
        border: "1px solid var(--app-border)",
        flex: "0 0 23rem",
        height: "23rem",
      }}
    >
      <div className="mb-3 shrink-0 flex items-center justify-between gap-2">
        <h2
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          State Legislature Composition
        </h2>
        {showToggle && (
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
            <button
              onClick={() => setTab("house")}
              className="text-[10px] font-semibold px-2 py-1 transition-colors"
              style={tab === "house"
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                : { background: "var(--app-panel)", color: "var(--app-text-muted)" }}
            >
              House
            </button>
            <button
              onClick={() => setTab("senate")}
              className="text-[10px] font-semibold px-2 py-1 transition-colors"
              style={tab === "senate"
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                : { background: "var(--app-panel)", color: "var(--app-text-muted)" }}
            >
              Senate
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <EntryCard key={`${entry.year}-${entry.type}`} entry={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
