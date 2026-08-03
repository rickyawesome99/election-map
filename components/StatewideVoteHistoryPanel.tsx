"use client";

import StateVoteHistoryChart from "./StateVoteHistoryChart";
import VoteHistoryTabbedSection from "./VoteHistoryTabbedSection";

export type StatewideHistoryEntry = {
  key: string;
  group: "president" | "senate" | "governor";
  year: number;
  label: string;
  href?: string;
  demPct: number;
  repPct: number;
  demVotes?: number;
  repVotes?: number;
};

type ChartResult = { year: number; race: string; demPct: number; repPct: number; label?: string };

function ResultCard({ entry }: { entry: StatewideHistoryEntry }) {
  const winner = entry.demPct > entry.repPct ? "D" : "R";
  const margin = Math.abs(entry.demPct - entry.repPct).toFixed(1);
  const total = entry.demPct + entry.repPct;
  const demWidth = total > 0 ? (entry.demPct / total) * 100 : 50;
  const labelClass = "min-w-0 truncate text-sm font-semibold";

  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--app-bg)" }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{entry.year}</span>
          {entry.href ? (
            <a href={entry.href} className={`${labelClass} hover:underline`} style={{ color: "var(--app-text-muted)" }}>{entry.label}</a>
          ) : (
            <span className={labelClass} style={{ color: "var(--app-text-muted)" }}>{entry.label}</span>
          )}
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={winner === "D"
            ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
            : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
        >
          {winner}+{margin}
        </span>
      </div>
      {(["D", "R"] as const).map((party) => {
        const dem = party === "D";
        const pct = dem ? entry.demPct : entry.repPct;
        const votes = dem ? entry.demVotes : entry.repVotes;
        return (
          <div key={party} className={`${dem ? "mb-1" : "mb-1.5"} flex items-baseline gap-2`}>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>
              {dem ? "Dem" : "Rep"}
            </span>
            <div className="flex shrink-0 items-baseline gap-1">
              <span className="w-12 text-sm font-bold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{pct.toFixed(1)}%</span>
              <span className="w-16 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{votes?.toLocaleString() ?? "—"}</span>
            </div>
          </div>
        );
      })}
      <div className="flex">
        <div className="ml-auto h-2 shrink-0 overflow-hidden rounded-full" style={{ width: "calc(3rem + 0.25rem + 4rem)", background: "var(--app-tab-bg)" }}>
          <div className="h-full float-left" style={{ width: `${demWidth}%`, background: "#1b408c" }} />
          <div className="h-full float-left" style={{ width: `${100 - demWidth}%`, background: "#be1c29" }} />
        </div>
      </div>
    </div>
  );
}

export default function StatewideVoteHistoryPanel({ entries, chartResults }: { entries: StatewideHistoryEntry[]; chartResults: ChartResult[] }) {
  return (
    <VoteHistoryTabbedSection
      defaultTabKey="race-results"
      height="400px"
      tabs={[
        {
          key: "race-results",
          label: "Race Results",
          content: (
            <div className="flex flex-col gap-2.5">
              {entries.map((entry, index) => (
                <div key={entry.key} className="contents">
                  {index > 0 && entries[index - 1].group !== entry.group && <div className="my-1 h-px" style={{ background: "var(--app-border)" }} />}
                  <ResultCard entry={entry} />
                </div>
              ))}
            </div>
          ),
        },
        { key: "graph", label: "Graph", content: <StateVoteHistoryChart results={chartResults} bare /> },
      ]}
    />
  );
}
