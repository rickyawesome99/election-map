"use client";

import { useMemo } from "react";
import type { StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { seatsUpIn } from "@/lib/stateLegUpcoming";
import { ELECTION_YEAR as electionYear } from "@/lib/electionYear";
import { isUnassignedResultKey } from "@/lib/stateLegDistrictKey";
import { fmtMargin } from "@/lib/colorScale";

/** Seats by projected winner, plus seats not on the ballot held by their sitting member. */
export type ProjectedSeats = { D: number; R: number; I: number; O: number; none: number };

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

/** Which party actually carried the district — an independent can outpoll both majors. */
function resultWinner(result: StateLegDistrictResult): "D" | "R" | "O" | null {
  if (result.totalVotes == null) return null;
  const dem = result.demVotes ?? 0;
  const rep = result.repVotes ?? 0;
  const oth = result.othVotes ?? 0;
  if (oth > dem && oth > rep) return "O";
  return rep > dem ? "R" : "D";
}

// Tallies whatever the map is currently showing: incumbent seats-by-party in "seats" mode
// (matching the hero stat row, including multi-member districts as one seat per incumbent),
// district-level 2024 presidential winners in "president" mode, or the districts each party
// carried in the selected past election, alongside that election's chamber-wide vote margin.
// `projected` (the atlas's 2026 projection view) replaces the tally with projected seats.
export default function DistrictCountBar({
  districts,
  pres2024,
  results,
  viewMode,
  projected,
}: {
  districts: StateLegDistrict[];
  pres2024: Record<string, StateLegPres2024>;
  results: Record<string, StateLegDistrictResult> | null;
  viewMode: MapViewMode;
  projected?: ProjectedSeats | null;
}) {
  const { stats, aggregateMargin } = useMemo(() => {
    if (projected) {
      const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "I", "O"] as const)
        .filter((p) => projected[p] || p === "D" || p === "R")
        .map((p) => ({ key: p, label: p, value: projected[p], color: PARTY_COLOR[p] }));
      if (projected.none > 0) entries.push({ key: "none", label: "No projection", value: projected.none, color: "var(--app-text-very-muted)" });
      return { stats: entries, aggregateMargin: null };
    }
    if (viewMode === "upcoming") {
      let up = 0;
      let notUp = 0;
      for (const d of districts) {
        const n = seatsUpIn(d, electionYear);
        up += n;
        notUp += Math.max(0, (d.seats ?? Math.max(d.incumbents?.length ?? 0, 1)) - n);
      }
      return {
        stats: [
          { key: "up", label: `Up in ${electionYear}`, value: up, color: "var(--app-text-primary)" },
          ...(notUp > 0 ? [{ key: "notUp", label: "Not up", value: notUp, color: "var(--app-text-very-muted)" }] : []),
        ],
        aggregateMargin: null,
      };
    }
    if (viewMode === "results") {
      if (!results) return { stats: [], aggregateMargin: null };
      const won: Record<string, number> = { D: 0, R: 0, O: 0 };
      let noCount = 0;
      let dem = 0;
      let rep = 0;
      let total = 0;
      for (const [key, result] of Object.entries(results)) {
        // Votes the source could not attribute to a district still belong in the chamber total,
        // but there is no district for them to have been won in.
        if (isUnassignedResultKey(key)) {
          dem += result.demVotes ?? 0;
          rep += result.repVotes ?? 0;
          total += result.totalVotes ?? 0;
          continue;
        }
        const winner = resultWinner(result);
        // A district with no published count contributes to neither the seat tally nor the vote
        // total — counting its nulls as zeros would drag the chamber margin toward even.
        if (!winner) {
          noCount++;
          continue;
        }
        won[winner]++;
        dem += result.demVotes ?? 0;
        rep += result.repVotes ?? 0;
        total += result.totalVotes ?? 0;
      }
      const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "O"] as const)
        .filter((p) => won[p])
        .map((p) => ({ key: p as string, label: p as string, value: won[p], color: PARTY_COLOR[p] }));
      if (noCount > 0) entries.push({ key: "noCount", label: "No count", value: noCount, color: "var(--app-text-very-muted)" });
      return { stats: entries, aggregateMargin: total ? ((rep - dem) / total) * 100 : null };
    }
    if (viewMode === "president") {
      let dem = 0;
      let rep = 0;
      let missing = 0;
      for (const d of districts) {
        const result = pres2024[d.number];
        if (!result) missing++;
        else if (result.margin <= 0) dem++;
        else rep++;
      }
      return {
        stats: [
          { key: "D", label: "D", value: dem, color: PARTY_COLOR.D },
          { key: "R", label: "R", value: rep, color: PARTY_COLOR.R },
          ...(missing > 0 ? [{ key: "missing", label: "No data", value: missing, color: "var(--app-text-very-muted)" }] : []),
        ],
        aggregateMargin: null,
      };
    }
    const counts: Record<string, number> = {};
    let vacant = 0;
    for (const d of districts) {
      const incumbents = d.incumbents ?? [];
      // A multi-member district can be PARTLY vacant, so count empty seats rather than empty
      // districts. Where seat counts aren't sourced, `seats` is absent and this falls back to the
      // old behaviour: one vacancy for a district with nobody in it, none otherwise.
      const seats = d.seats ?? Math.max(incumbents.length, 1);
      vacant += Math.max(0, seats - incumbents.length);
      for (const inc of incumbents) counts[inc.party] = (counts[inc.party] ?? 0) + 1;
    }
    const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "I", "O"] as const)
      .filter((p) => counts[p])
      .map((p) => ({ key: p, label: p, value: counts[p], color: PARTY_COLOR[p] }));
    if (vacant > 0) entries.push({ key: "vacant", label: "Vacant", value: vacant, color: "var(--app-text-very-muted)" });
    return { stats: entries, aggregateMargin: null };
  }, [districts, pres2024, results, viewMode, projected]);

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {stats.map((s) => (
        <span key={s.key} className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold tabular-nums" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            {s.label}
          </span>
        </span>
      ))}
      {aggregateMargin != null && (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            Chamber vote
          </span>
          <span className="text-sm font-extrabold tabular-nums" style={{ color: aggregateMargin <= 0 ? PARTY_COLOR.D : PARTY_COLOR.R }}>
            {fmtMargin(aggregateMargin)}
          </span>
        </span>
      )}
    </div>
  );
}

