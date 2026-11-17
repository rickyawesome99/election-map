"use client";

// The forecast race list's shared pieces: the candidate name line and the sort (used by
// ForecastLedger's race cards, which replaced the old Cards/Table toggle, user 2026-11-17).

import { marginToRating } from "@/lib/colorScale";
import CandidateLink from "./CandidateLink";

type RaceForecast = {
  id: string;
  name: string;
  /** The race's state, for the candidate links (two candidates can share a name). */
  state?: string;
  rating?: string;
  margin?: number;
  probability?: number;
  electionType?: string;
  candidates?: {
    dem: { name: string; incumbent: boolean; party?: "D" | "R" | "I" };
    rep: { name: string; incumbent: boolean; party?: "D" | "R" | "I" };
  };
};

export type SortKey = "name" | "rating" | "margin" | "competitive";
export type SortDir = "asc" | "desc";

const RATING_ORDER = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "margin", label: "Margin" },
  { key: "name", label: "State" },
  { key: "rating", label: "Rating" },
  { key: "competitive", label: "Competitive" },
];

export function sortRaces<T extends RaceForecast>(races: T[], key: SortKey, dir: SortDir): T[] {
  const sorted = [...races].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "rating":
        cmp = RATING_ORDER.indexOf(marginToRating(a.margin ?? 0)) - RATING_ORDER.indexOf(marginToRating(b.margin ?? 0));
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "margin":
        // Intentionally reversed so "asc" (down arrow) shows larger margins first.
        cmp = (b.margin ?? 0) - (a.margin ?? 0);
        break;
      case "competitive":
        cmp = Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--app-text-secondary)",
};
const PARTY_SUBTLE: Record<string, string> = {
  D: "var(--party-dem-subtle)",
  R: "var(--party-rep-subtle)",
  I: "var(--app-tab-bg)",
};
const PARTY_LABEL: Record<string, string> = {
  D: "Dem",
  R: "Rep",
  I: "Ind",
};

export function CandidateName({
  candidate,
  state,
  slot,
  showPartyLabel = false,
}: {
  candidate: { name: string; incumbent: boolean; party?: "D" | "R" | "I" } | undefined;
  /** The race's state (lib/candidateSlug.ts tells apart two candidates who share a name). */
  state?: string;
  slot: "dem" | "rep";
  showPartyLabel?: boolean;
}) {
  const actualParty = candidate?.party ?? (slot === "dem" ? "D" : "R");
  const color = PARTY_COLOR[actualParty] ?? "var(--app-text-primary)";
  const subtle = PARTY_SUBTLE[actualParty] ?? "var(--app-tab-bg)";
  const label = PARTY_LABEL[actualParty] ?? actualParty;

  return (
    <span className="flex min-w-0 items-center gap-1.5" style={{ color }}>
      {showPartyLabel && (
        <span
          className="w-7 shrink-0 text-[9px] font-bold"
          aria-label={label}
        >
          {label}
        </span>
      )}
      <span className="min-w-0 truncate font-semibold">
        {candidate?.name ? (
          <CandidateLink
            name={candidate.name}
            state={state}
            className="hover:underline"
            onClick={e => e.stopPropagation()}
          >
            {candidate.name}
          </CandidateLink>
        ) : (
          <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
        )}
      </span>
      {candidate?.incumbent && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
          style={{ background: subtle, color }}
        >
          Inc.
        </span>
      )}
    </span>
  );
}
