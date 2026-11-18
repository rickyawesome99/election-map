"use client";
import Link from "next/link";

import { useMemo, useState } from "react";
import type { RaceType } from "@/data/forecastData";
import type { ForecastSummary } from "@/lib/forecastTypes";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { CandidateName, sortRaces, SORT_OPTIONS, type SortDir, type SortKey } from "./RaceTable";

// ─────────────────────────────────────────────────────────────────────────
// Flat race-type switcher — sits above the map as its own header (replaces
// the old floating pill toggle) instead of floating over it.
// ─────────────────────────────────────────────────────────────────────────
const RACE_TYPE_LABEL: Record<RaceType, string> = { house: "House", senate: "Senate", governor: "Governor" };

export function RaceTypeHeader({
  raceType,
  onSelect,
  count,
  demSeats,
  repSeats,
}: {
  raceType: RaceType;
  onSelect: (rt: RaceType) => void;
  count: number;
  demSeats: number;
  repSeats: number;
}) {
  // Tabs on the left; the projected seat count and race count share the line on the right
  // (user, 2026-11-17: no big "U.S. House" title — the tab says which chamber it is).
  return (
    <div className="mb-3 mt-2 flex items-end justify-between gap-3 border-b" style={{ borderColor: "var(--app-border)" }}>
      <nav className="flex gap-4 sm:gap-5">
        {(["house", "senate", "governor"] as RaceType[]).map((rt) => (
          <button
            key={rt}
            onClick={() => onSelect(rt)}
            aria-current={raceType === rt}
            className="-mb-px border-b-2 pb-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors"
            style={{
              color: raceType === rt ? "var(--app-text-primary)" : "var(--app-text-very-muted)",
              borderColor: raceType === rt ? "var(--app-text-primary)" : "transparent",
            }}
          >
            {RACE_TYPE_LABEL[rt]}
          </button>
        ))}
      </nav>
      <div className="flex items-baseline gap-x-2 pb-1.5 sm:gap-x-3">
        <span className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none tabular-nums sm:text-2xl" style={{ fontFamily: "var(--font-serif)", color: "var(--party-dem)" }}>{demSeats}</span>
          <span className="leading-none" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-very-muted)" }}>&mdash;</span>
          <span className="text-xl font-bold leading-none tabular-nums sm:text-2xl" style={{ fontFamily: "var(--font-serif)", color: "var(--party-rep)" }}>{repSeats}</span>
        </span>
        <span className="whitespace-nowrap text-[11px] sm:text-sm" style={{ color: "var(--app-text-muted)" }}>
          {count} {raceType === "house" ? "districts" : "races"}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Race list — one grid of same-size compact cards with a sort (user, 2026-11-17:
// replaced the Cards/Table toggle and the tier sections). Flat, like the rest
// of the site: each card is a row on the page
// background, no box: name and candidates on the left, the margin (serif) over
// its rating pill on the right.
// ─────────────────────────────────────────────────────────────────────────
function raceHref(basePath: string, race: ForecastSummary): string {
  return `${basePath}/${(basePath === "/house" ? race.name : race.id).toLowerCase().replace(/-2$/, "2")}`;
}

function isSpecialRace(race: ForecastSummary): boolean {
  return !!race.electionType?.toLowerCase().includes("special");
}

function RaceCard({ race, basePath, showSpecialBadge }: { race: ForecastSummary; basePath: string; showSpecialBadge?: boolean }) {
  const margin = race.margin ?? 0;
  const rating = marginToRating(margin);
  const { bg, text } = getRatingColors(rating);
  const isD = margin <= 0;
  return (
    // The seat link's ::after covers the card, so a click anywhere opens the race page; the
    // candidate links sit above it (relative z-10) and still go to the candidate pages.
    // content-visibility skips off-screen cards (the House grid is 435).
    <div
      className="group relative flex min-w-0 items-center justify-between gap-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_4%,transparent)] md:px-1.5"
      style={{ borderBottom: "1px solid var(--app-border)", contentVisibility: "auto", containIntrinsicSize: "auto 76px" }}
    >
      <div className="min-w-0">
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
          <Link prefetch={false} href={raceHref(basePath, race)} className="truncate text-[13px] font-bold after:absolute after:inset-0 after:content-[''] group-hover:underline" style={{ color: "var(--app-text-primary)" }}>
            {race.name}
          </Link>
          {showSpecialBadge && isSpecialRace(race) && (
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>Special</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-snug [&_a]:relative [&_a]:z-10">
          <CandidateName candidate={race.candidates?.dem} state={race.state} slot="dem" />
          <CandidateName candidate={race.candidates?.rep} state={race.state} slot="rep" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-serif)", color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
          {isD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
        </div>
        <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: bg, color: text }}>{rating}</span>
      </div>
    </div>
  );
}

// Long lists (the House) open on the first few rows of cards with a "show all".
const GRID_EXPAND_AT = 48;
const GRID_EXPAND_SHOW = 24;

export function ForecastRaceCards({
  races,
  basePath,
  showSpecialBadge = false,
}: {
  races: ForecastSummary[];
  basePath: string;
  showSpecialBadge?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("competitive");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => sortRaces(races, sortKey, sortDir), [races, sortKey, sortDir]);
  const truncated = !expanded && sorted.length > GRID_EXPAND_AT;
  const visible = truncated ? sorted.slice(0, GRID_EXPAND_SHOW) : sorted;
  const control = { background: "var(--app-bg)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" };

  return (
    <section>
      {/* Header: the race count and the sort, over the site's section rule */}
      <div className="flex items-center justify-between gap-4 border-b-2 pb-2" style={{ borderColor: "var(--app-text-primary)" }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-primary)" }}>All races</h3>
          <span className="text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{races.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Sort</span>
            <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setSortDir("asc"); }} className="rounded-md border px-2 py-1 text-xs font-semibold outline-none" style={control}>
              {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.key === "name" && basePath === "/house" ? "District" : option.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            className="shrink-0 rounded-md border px-2 py-1 text-xs font-semibold"
            style={control}
            aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
          >
            {sortDir === "asc" ? "▼" : "▲"}
          </button>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => <RaceCard key={r.id} race={r} basePath={basePath} showSpecialBadge={showSpecialBadge} />)}
      </div>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 w-full border-t pt-3 text-center text-[10px] font-semibold uppercase tracking-wider underline decoration-dotted underline-offset-4 hover:decoration-solid"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
        >
          Show all {sorted.length} races
        </button>
      )}
    </section>
  );
}
