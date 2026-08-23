"use client";

import StateVoteHistoryChart from "./StateVoteHistoryChart";
import VoteHistoryTabbedSection from "./VoteHistoryTabbedSection";
import CandidateLink from "./CandidateLink";

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
  demCandidate?: string;
  repCandidate?: string;
};

type ChartResult = { year: number; race: string; demPct: number; repPct: number; label?: string };

function ResultCard({ entry }: { entry: StatewideHistoryEntry }) {
  const winner = entry.demPct > entry.repPct ? "D" : "R";
  const margin = Math.abs(entry.demPct - entry.repPct).toFixed(1);
  const labelClass = "min-w-0 truncate text-xs font-semibold";

  return (
    <div className="py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>
            {entry.year}
          </span>
          {entry.href ? (
            <a href={entry.href} className={`${labelClass} hover:underline`} style={{ color: "var(--app-text-muted)" }}>{entry.label}</a>
          ) : (
            <span className={labelClass} style={{ color: "var(--app-text-muted)" }}>{entry.label}</span>
          )}
        </div>
        <span
          className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums"
          style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}
        >
          {winner}+{margin}
        </span>
      </div>
      {(["D", "R"] as const).map((party) => {
        const dem = party === "D";
        const pct = dem ? entry.demPct : entry.repPct;
        const votes = dem ? entry.demVotes : entry.repVotes;
        const candidate = dem ? entry.demCandidate : entry.repCandidate;
        return (
          <div key={party} className="flex items-baseline gap-2 mb-0.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>
              {candidate ? <CandidateLink name={candidate} className="hover:underline" /> : (dem ? "Democratic Candidate" : "Republican Candidate")} ({party})
            </span>
            <div className="flex shrink-0 items-baseline gap-1">
              <span className="w-12 text-sm font-bold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{pct.toFixed(1)}%</span>
              <span className="w-16 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{votes?.toLocaleString() ?? "—"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StatewideVoteHistoryPanel({ entries, chartResults }: { entries: StatewideHistoryEntry[]; chartResults: ChartResult[] }) {
  return (
    <VoteHistoryTabbedSection
      variant="plain"
      defaultTabKey="race-results"
      height="400px"
      tabs={[
        {
          key: "race-results",
          label: "Race Results",
          content: (
            <div className="flex flex-col">
              {entries.map((entry) => (
                <ResultCard key={entry.key} entry={entry} />
              ))}
            </div>
          ),
        },
        { key: "graph", label: "Graph", content: <StateVoteHistoryChart results={chartResults} bare /> },
      ]}
    />
  );
}
