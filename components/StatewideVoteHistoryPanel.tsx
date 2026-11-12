"use client";
import Link from "next/link";

import StateVoteHistoryChart from "./StateVoteHistoryChart";
import VoteHistoryTabbedSection from "./VoteHistoryTabbedSection";
import CandidateLink from "./CandidateLink";
import { HeadToHead, ResultRowFrame, RowEyebrow, RowMargin, RowYear, Side } from "./ResultRowKit";

export type StatewideHistoryEntry = {
  key: string;
  group: "president" | "senate" | "governor" | "house";
  year: number;
  label: string;
  href?: string;
  demPct: number;
  repPct: number;
  demVotes?: number;
  repVotes?: number;
  demCandidate?: string;
  repCandidate?: string;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
};

type ChartResult = { year: number; race: string; demPct: number; repPct: number; label?: string };

/**
 * One statewide result. With an `href` the whole card links to that election's page; the
 * candidate names inside stay their own links to the candidate pages.
 */
export function ResultCard({ entry, state }: { entry: StatewideHistoryEntry; /** State abbreviation, for the candidate links. */ state?: string }) {
  const winner = entry.demPct > entry.repPct ? "D" : "R";
  const margin = Math.abs(entry.demPct - entry.repPct).toFixed(1);
  // The card link is an overlay rather than a wrapper, since the candidate links can't nest
  // inside another <a>; they sit above it with pointer events back on.
  return (
    <div className="relative block w-full py-4 pl-2.5 pr-1 text-left" style={{ borderBottom: "1px solid var(--app-border)", borderLeft: "2px solid transparent" }}>
      {entry.href && <Link prefetch={false} href={entry.href} aria-label={`${entry.year} ${entry.label} results`} className="absolute inset-0" />}
      <div className="relative pointer-events-none">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>
              {entry.year}
            </span>
            <span className="min-w-0 truncate text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{entry.label}</span>
          </div>
          <span
            className="vh-margin shrink-0 whitespace-nowrap text-sm font-bold tabular-nums"
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
                {candidate ? <CandidateLink name={candidate} state={state} className="relative pointer-events-auto hover:underline" /> : (dem ? "Democratic Candidate" : "Republican Candidate")} ({party})
              </span>
              <div className="flex shrink-0 items-baseline gap-1">
                <span className="w-12 text-sm font-bold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{pct.toFixed(1)}%</span>
                <span className="w-16 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{votes?.toLocaleString() ?? "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The same result as one head-to-head row (the state page's results list; ResultRowKit). */
export function ResultRow({ entry, state, delay }: { entry: StatewideHistoryEntry; state?: string; delay?: number }) {
  const winner = entry.demPct > entry.repPct ? "D" : "R";
  const two = entry.demPct + entry.repPct;
  const side = (party: "D" | "R") => {
    const dem = party === "D";
    const candidate = dem ? entry.demCandidate : entry.repCandidate;
    const votes = dem ? entry.demVotes : entry.repVotes;
    const incumbent = dem ? entry.demIncumbent : entry.repIncumbent;
    // The incumbent mark: a party-colored asterisk after the Democrat's name and before the
    // Republican's, on the side facing the other candidate.
    return (
      <Side
        party={party}
        align={dem ? "left" : "right"}
        top={
          <span className="inline-flex max-w-full items-center gap-1.5" title={incumbent ? `${candidate ?? ""} (incumbent)` : undefined}>
            {incumbent && !dem && <span className="shrink-0 self-start font-bold leading-none -mr-1" style={{ color: "var(--party-rep)" }} aria-label="incumbent">*</span>}
            <span className="min-w-0 truncate">{candidate ? <CandidateLink name={candidate} state={state} className="relative pointer-events-auto hover:underline" /> : (dem ? "Democrat" : "Republican")}</span>
            {incumbent && dem && <span className="shrink-0 self-start font-bold leading-none -ml-1" style={{ color: "var(--party-dem)" }} aria-label="incumbent">*</span>}
          </span>
        }
        headline={`${(dem ? entry.demPct : entry.repPct).toFixed(1)}%`}
        detail={votes?.toLocaleString() ?? "—"}
      />
    );
  };
  return (
    <ResultRowFrame
      delay={delay}
      link={entry.href && <Link prefetch={false} href={entry.href} aria-label={`${entry.year} ${entry.label} results`} className="absolute inset-0" />}
      left={<RowYear year={entry.year}><RowEyebrow>{entry.label}</RowEyebrow></RowYear>}
      middle={<HeadToHead dem={side("D")} rep={side("R")} split={two > 0 ? (entry.demPct / two) * 100 : null} />}
      margin={<RowMargin party={winner} value={`${winner}+${Math.abs(entry.demPct - entry.repPct).toFixed(1)}`} />}
    />
  );
}

export default function StatewideVoteHistoryPanel({ entries, chartResults }: { entries: StatewideHistoryEntry[]; chartResults: ChartResult[] }) {
  const racePriority: Record<StatewideHistoryEntry["group"], number> = {
    president: 0,
    governor: 1,
    senate: 2,
    house: 3,
  };
  const sortedEntries = [...entries].sort((a, b) =>
    b.year - a.year || racePriority[a.group] - racePriority[b.group]
  );

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
              {sortedEntries.map((entry) => (
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
