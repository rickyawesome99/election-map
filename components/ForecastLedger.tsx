"use client";

import { useMemo, useState } from "react";
import { RaceForecast, RaceType, electionYear } from "@/data/forecastData";
import { getRatingColors, marginToRating, fmtMargin } from "@/lib/colorScale";
import RaceTable, { CandidateName } from "./RaceTable";

// ─────────────────────────────────────────────────────────────────────────
// Flat race-type switcher — sits above the map as its own header (replaces
// the old floating pill toggle) instead of floating over it.
// ─────────────────────────────────────────────────────────────────────────
const RACE_TYPE_LABEL: Record<RaceType, string> = { house: "House", senate: "Senate", governor: "Governor" };

export function RaceTypeHeader({
  raceType,
  onSelect,
  count,
}: {
  raceType: RaceType;
  onSelect: (rt: RaceType) => void;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-end justify-between border-b" style={{ borderColor: "var(--app-border)" }}>
      <nav className="flex gap-5">
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
      <span className="pb-2 text-[10px] md:hidden" style={{ color: "var(--app-text-muted)" }}>
        {count} {raceType === "house" ? "districts" : "races"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Hero — mobile gets the big scoreboard, desktop collapses to one line so
// the map (which follows immediately) is the first large thing on screen.
// ─────────────────────────────────────────────────────────────────────────
const RACE_TYPE_TITLE: Record<RaceType, string> = { house: "U.S. House", senate: "U.S. Senate", governor: "Governors" };

export function ForecastHero({
  raceType,
  demSeats,
  repSeats,
  totalSeats,
  seatsUp,
  genericBallotDiff,
  tossUps,
  flipped,
}: {
  raceType: RaceType;
  demSeats: number;
  repSeats: number;
  totalSeats: number;
  seatsUp: number;
  genericBallotDiff: number;
  tossUps: number;
  flipped: number;
}) {
  const threshold = Math.floor(totalSeats / 2) + 1;
  const demPct = (demSeats / totalSeats) * 100;
  const repPct = (repSeats / totalSeats) * 100;

  return (
    <>
      {/* Mobile */}
      <div className="mb-4 md:hidden">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          {electionYear} Midterms
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>
          {RACE_TYPE_TITLE[raceType]}
        </h1>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: "var(--party-dem)" }}>{demSeats}</span>
          <span className="text-2xl" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-very-muted)" }}>&mdash;</span>
          <span className="text-4xl font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: "var(--party-rep)" }}>{repSeats}</span>
        </div>
        <div className="mt-0.5 flex max-w-[14em] justify-between font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          <span>Democrats</span><span>Republicans</span>
        </div>
        <div className="mt-2 flex h-1.5 max-w-[24em] overflow-hidden rounded-full" style={{ background: "var(--app-tab-bg)" }}>
          <div style={{ width: `${demPct}%`, background: "var(--party-dem)" }} />
          <div style={{ width: `${repPct}%`, background: "var(--party-rep)" }} />
        </div>
        <div className="mt-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
          {threshold} needed for control &middot; {seatsUp} of {totalSeats} seats up in {electionYear}
        </div>
        <div className="mt-3 flex border-t" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex-1 border-r py-2 pr-3" style={{ borderColor: "var(--app-border)" }}>
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtMargin(genericBallotDiff)}</div>
            <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Generic Ballot</div>
          </div>
          <div className="flex-1 border-r px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{tossUps}</div>
            <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Toss-Ups</div>
          </div>
          <div className="flex-1 py-2 pl-3">
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{flipped}</div>
            <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Seats Flipped</div>
          </div>
        </div>
      </div>

      {/* Desktop — title, score, and race count on one line; the map does the rest of the talking */}
      <div className="mb-3 hidden md:block">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          {electionYear} Midterms
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[1.65rem] font-bold tracking-tight" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>
            {RACE_TYPE_TITLE[raceType]}
          </h1>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[1.4rem] font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: "var(--party-dem)" }}>{demSeats}</span>
            <span style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-very-muted)" }}>&mdash;</span>
            <span className="text-[1.4rem] font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: "var(--party-rep)" }}>{repSeats}</span>
          </div>
          <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            {seatsUp} {raceType === "house" ? "districts" : "races"}
          </span>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Race list — mobile: a tiered ledger with full detail for every rating.
// Desktop: the same tiered ledger, laid out
// in text columns per tier (more columns as a tier gets larger), with a
// "show all" expand for tiers over TIER_EXPAND_AT (matters mainly for House
// Safe, which can run into the hundreds).
// ─────────────────────────────────────────────────────────────────────────
type Tier = "Toss-Up" | "Lean" | "Likely" | "Safe";

function tierOf(rating: string): Tier {
  if (rating.startsWith("Tilt")) return "Toss-Up";
  if (rating.startsWith("Lean")) return "Lean";
  if (rating.startsWith("Likely")) return "Likely";
  return "Safe";
}

const TIER_ORDER: Tier[] = ["Toss-Up", "Lean", "Likely", "Safe"];

function TierHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b-2 pb-1.5" style={{ borderColor: "var(--app-text-primary)" }}>
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-primary)" }}>{label}</h3>
      <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>{count} race{count === 1 ? "" : "s"}</span>
    </div>
  );
}

function raceHref(basePath: string, race: RaceForecast): string {
  return `${basePath}/${(basePath === "/house" ? race.name : race.id).toLowerCase().replace(/-2$/, "2")}`;
}

function isSpecialRace(race: RaceForecast): boolean {
  return !!race.electionType?.toLowerCase().includes("special");
}

function MarginFigure({ margin, className = "" }: { margin: number; className?: string }) {
  const isD = margin <= 0;
  return (
    <span className={`tabular-nums font-extrabold ${className}`} style={{ color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
      {isD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
    </span>
  );
}

function RatingPill({ rating }: { rating: string }) {
  const { bg, text } = getRatingColors(rating);
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: bg, color: text }}>
      {rating}
    </span>
  );
}

function SpecialBadge() {
  return (
    <span
      className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
      style={{ borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
    >
      Special
    </span>
  );
}

function LedgerRow({ race, basePath, showSpecialBadge }: { race: RaceForecast; basePath: string; showSpecialBadge?: boolean }) {
  const margin = race.margin ?? 0;
  const rating = marginToRating(margin);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-1.5">
          <a href={raceHref(basePath, race)} className="truncate text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
            {race.name}
          </a>
          {showSpecialBadge && isSpecialRace(race) && <SpecialBadge />}
        </div>
        <div className="flex flex-col gap-0.5" style={{ fontFamily: "var(--font-serif)" }}>
          <CandidateName candidate={race.candidates?.dem} slot="dem" />
          <CandidateName candidate={race.candidates?.rep} slot="rep" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <MarginFigure margin={margin} className="block text-lg" />
        <div className="mt-1"><RatingPill rating={rating} /></div>
      </div>
    </div>
  );
}

const TIER_EXPAND_AT = 24;
const TIER_EXPAND_SHOW = 18;

function columnsFor(count: number): number {
  if (count <= 2) return 1;
  if (count <= 10) return 2;
  if (count <= 24) return 3;
  return 4;
}

function DesktopTierBlock({
  tier,
  races,
  basePath,
  showSpecialBadge,
}: {
  tier: Tier;
  races: RaceForecast[];
  basePath: string;
  showSpecialBadge?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = !expanded && races.length > TIER_EXPAND_AT;
  const visible = truncated ? races.slice(0, TIER_EXPAND_SHOW) : races;

  return (
    <div className="mt-6 first:mt-0">
      <TierHeader label={tier} count={races.length} />
      <div
        style={{
          columnCount: columnsFor(visible.length),
          columnGap: "2.5rem",
          columnRuleWidth: 1,
          columnRuleStyle: "solid",
          columnRuleColor: "var(--app-border)",
        }}
      >
        {visible.map((r) => (
          <div key={r.id} style={{ breakInside: "avoid" }}>
            <LedgerRow race={r} basePath={basePath} showSpecialBadge={showSpecialBadge} />
          </div>
        ))}
        {truncated && (
          <div style={{ columnSpan: "all" }} className="pt-3">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="font-mono text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--app-text-very-muted)" }}
            >
              Show all {races.length} {tier} races
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Key Races — the closest margins, full detail, for the column beside the map.
// ─────────────────────────────────────────────────────────────────────────
export function KeyRaces({
  races,
  basePath,
  showSpecialBadge = false,
  count = 8,
}: {
  races: RaceForecast[];
  basePath: string;
  showSpecialBadge?: boolean;
  count?: number;
}) {
  const key = useMemo(
    () => [...races].sort((a, b) => Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0)).slice(0, count),
    [races, count]
  );
  if (!key.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between border-b-2 pb-1.5" style={{ borderColor: "var(--app-text-primary)" }}>
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-primary)" }}>Key Races</h3>
        <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>{key.length}</span>
      </div>
      {key.map((r) => <LedgerRow key={r.id} race={r} basePath={basePath} showSpecialBadge={showSpecialBadge} />)}
    </div>
  );
}

export function ForecastRaceCards({
  races,
  basePath,
  showSpecialBadge = false,
}: {
  races: RaceForecast[];
  basePath: string;
  showSpecialBadge?: boolean;
}) {
  const [desktopView, setDesktopView] = useState<"cards" | "table">("cards");
  const sorted = useMemo(
    () => [...races].sort((a, b) => Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0)),
    [races]
  );
  const byTier = useMemo(() => {
    const groups: Record<Tier, RaceForecast[]> = { "Toss-Up": [], Lean: [], Likely: [], Safe: [] };
    for (const r of sorted) groups[tierOf(marginToRating(r.margin ?? 0))].push(r);
    groups.Safe = [...groups.Safe].sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [sorted]);

  return (
    <>
      {/* Mobile: tiered ledger */}
      <div className="md:hidden">
        {(["Toss-Up", "Lean", "Likely"] as Tier[]).map((tier) => {
          const rows = byTier[tier];
          if (!rows.length) return null;
          return (
            <div key={tier} className="mt-6 first:mt-0">
              <TierHeader label={tier} count={rows.length} />
              {rows.map((r) => <LedgerRow key={r.id} race={r} basePath={basePath} showSpecialBadge={showSpecialBadge} />)}
            </div>
          );
        })}
        {byTier.Safe.length > 0 && (
          <div className="mt-6">
            <TierHeader label="Safe" count={byTier.Safe.length} />
            {byTier.Safe.map((r) => <LedgerRow key={r.id} race={r} basePath={basePath} showSpecialBadge={showSpecialBadge} />)}
          </div>
        )}
      </div>

      {/* Desktop: tier-grouped column ledger — same row as mobile, column count tapers with tier size */}
      <div className="hidden md:block">
        <div className="mb-2 flex justify-start">
          <div
            className="inline-flex rounded-lg border p-0.5"
            style={{ background: "var(--app-tab-bg)", borderColor: "var(--app-border)" }}
            role="group"
            aria-label="Race display"
          >
            <button
              type="button"
              onClick={() => setDesktopView("cards")}
              aria-pressed={desktopView === "cards"}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: desktopView === "cards" ? "var(--app-panel)" : "transparent",
                color: desktopView === "cards" ? "var(--app-text-primary)" : "var(--app-text-muted)",
                boxShadow: desktopView === "cards" ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
              Cards
            </button>
            <button
              type="button"
              onClick={() => setDesktopView("table")}
              aria-pressed={desktopView === "table"}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                background: desktopView === "table" ? "var(--app-panel)" : "transparent",
                color: desktopView === "table" ? "var(--app-text-primary)" : "var(--app-text-muted)",
                boxShadow: desktopView === "table" ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" />
                <rect x="1" y="12" width="14" height="2" rx="1" />
              </svg>
              Table
            </button>
          </div>
        </div>

        {desktopView === "cards" ? (
          <div>
            {TIER_ORDER.map((tier) => {
              const rows = byTier[tier];
              if (!rows.length) return null;
              return <DesktopTierBlock key={tier} tier={tier} races={rows} basePath={basePath} showSpecialBadge={showSpecialBadge} />;
            })}
          </div>
        ) : (
          <RaceTable
            races={races}
            basePath={basePath}
            nameLabel={basePath === "/house" ? "District" : "State"}
            showSpecialBadge={showSpecialBadge}
            initialSortKey="competitive"
            initialSortDir="asc"
          />
        )}
      </div>
    </>
  );
}
