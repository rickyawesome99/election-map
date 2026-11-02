"use client";

import RaceHistoryGraph from "@/components/RaceHistoryGraph";
import type { DetailPastResult } from "@/components/RaceDetailSections";

/** The Graph tab of a Senate or Governor seat's Vote History: one series, the seat itself. */
export default function SeatVoteHistoryChart({
  results,
  electionType = "Election",
  forecast,
}: {
  results: DetailPastResult[];
  electionType?: string;
  forecast?: { year: number; margin: number } | null;
}) {
  const points = (results ?? [])
    .filter((r) => !r.placeholder)
    .map((r) => ({
      year: r.year,
      margin: Math.round((r.repPct - r.demPct) * 10) / 10,
      natDiff: r.nationalDiff != null ? Math.round(r.nationalDiff * 10) / 10 : null,
      demPct: r.demPct,
      repPct: r.repPct,
      demName: r.demCandidate,
      repName: r.repCandidate,
      special: /special/i.test(r.electionType ?? ""),
      href: r.electionHref,
    }));
  if (points.length === 0) return null;
  return <RaceHistoryGraph subject={electionType} series={[{ key: "seat", label: electionType, points }]} forecast={forecast} />;
}
