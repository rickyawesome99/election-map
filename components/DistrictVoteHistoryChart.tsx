"use client";

import RaceHistoryGraph, { type HistoryPoint, type HistorySeries } from "@/components/RaceHistoryGraph";

/**
 * The Graph tab of a House district's Vote History: the House race plus the statewide races the
 * district voted in, one line each. House and President start on; Senate and Governor are a
 * legend click away.
 */

type HouseResultInput = {
  year: number;
  demPct: number;
  repPct: number;
  electionType?: string;
  nationalDiff?: number | null;
  demCandidate?: string;
  repCandidate?: string;
  electionHref?: string;
};

type StatewideResultInput = {
  year: number;
  race: string;
  demPct: number;
  repPct: number;
  nationalDiff?: number | null;
  demCandidate?: string;
  repCandidate?: string;
  raceHref?: string;
};

const toPoint = (r: { year: number; demPct: number; repPct: number; nationalDiff?: number | null; demCandidate?: string; repCandidate?: string }, special: boolean, href?: string): HistoryPoint => ({
  year: r.year,
  margin: Math.round((r.repPct - r.demPct) * 10) / 10,
  natDiff: r.nationalDiff != null ? Math.round(r.nationalDiff * 10) / 10 : null,
  demPct: r.demPct,
  repPct: r.repPct,
  demName: r.demCandidate,
  repName: r.repCandidate,
  special,
  href,
});

const STATEWIDE: { key: string; label: string; match: RegExp; on: boolean }[] = [
  { key: "president", label: "President", match: /president/i, on: true },
  { key: "senate", label: "Senate", match: /senate/i, on: false },
  { key: "governor", label: "Governor", match: /governor/i, on: false },
];

export default function DistrictVoteHistoryChart({
  houseResults,
  statewideResults,
  forecast,
}: {
  houseResults: HouseResultInput[];
  statewideResults: StatewideResultInput[];
  forecast?: { year: number; margin: number } | null;
}) {
  const series: HistorySeries[] = [
    { key: "house", label: "House", on: true, points: (houseResults ?? []).map((r) => toPoint(r, /special/i.test(r.electionType ?? ""), r.electionHref)) },
    ...STATEWIDE.map((s) => ({
      key: s.key,
      label: s.label,
      on: s.on,
      points: (statewideResults ?? []).filter((r) => s.match.test(r.race)).map((r) => toPoint(r, /special/i.test(r.race), r.raceHref)),
    })),
  ];
  if (series.every((s) => s.points.length === 0)) return null;
  return <RaceHistoryGraph subject="House" series={series} forecast={series[0].points.length ? forecast : null} />;
}
