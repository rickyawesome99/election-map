import Link from "next/link";
import { notFound } from "next/navigation";
import { statesData } from "@/data/statesData";
import { electionYear, stateLegData } from "@/data/forecastData";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegPres2024 } from "@/data/stateLegPres2024";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { chamberName, chamberShortLabel, chamberSummary } from "@/lib/stateLegChamberSummary";
import LegislativeAtlas from "@/components/atlas/LegislativeAtlas";
import ChamberSummary from "@/components/atlas/ChamberSummary";
import StateSwitcher from "@/components/StateSwitcher";
import { StatePill } from "@/components/RaceHeroPills";
import { PAGE_CONTAINER, heroTint, HERO_NEUTRAL_BG } from "@/lib/pageLayout";
import precinctCoverage from "@/data/precincts/coverage.json";

// A precinct return for the election year is on file for this chamber: its district maps colour the
// precincts by result; every other chamber's district maps stay grey.
function hasPrecinctResults(abbr: string, chamber: Chamber, year: number): boolean {
  const states = (precinctCoverage as { states: Record<string, { years?: Record<string, Record<string, { status?: string }>> }> }).states;
  const status = states[abbr]?.years?.[String(year)]?.[chamber === "house" ? "SLDL" : "SLDU"]?.status;
  return status === "reconciled" || status === "explained" || status === "loaded";
}

const CHAMBERS: Chamber[] = ["house", "senate"];

export async function generateStaticParams() {
  const out: { id: string; chamber: Chamber }[] = [];
  for (const s of statesData) {
    if (UNICAMERAL_STATES.has(s.abbr)) out.push({ id: s.id, chamber: "senate" });
    else for (const chamber of CHAMBERS) out.push({ id: s.id, chamber });
  }
  return out;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; chamber: string }> }) {
  const { id, chamber } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state || !CHAMBERS.includes(chamber as Chamber)) return { title: "Not Found" };
  const name = chamberName(state.name, chamber as Chamber, UNICAMERAL_STATES.has(state.abbr));
  return {
    title: `${name} Districts`,
    description: `Every ${name} district: incumbents, election results since 2016, presidential results on each map, redistricting history and the ${electionYear} outlook.`,
  };
}

export default async function ChamberPage({ params }: { params: Promise<{ id: string; chamber: string }> }) {
  const { id, chamber: chamberParam } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state || !CHAMBERS.includes(chamberParam as Chamber)) notFound();
  const chamber = chamberParam as Chamber;
  const unicameral = UNICAMERAL_STATES.has(state.abbr);
  if (unicameral && chamber !== "senate") notFound();

  const s = chamberSummary(state.abbr, state.name, chamber);
  if (s.roster.length === 0) notFound();
  const entries = stateLegData[state.name] ?? [];

  // The party holding the most seats now (Nebraska's nonpartisan members counted by caucus) tints
  // the header. No held pill: the seat line right below says it.
  const holder = s.seats ? (s.seats.dem > s.seats.rep ? "D" : s.seats.rep > s.seats.dem ? "R" : null) : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: holder ? heroTint(holder === "D" ? "var(--party-dem)" : "var(--party-rep)") : HERO_NEUTRAL_BG }}>
        <div className={`${PAGE_CONTAINER} pt-6`}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StatePill name={state.name} abbr={state.abbr} />
            <div className="ml-auto">
              <StateSwitcher id={state.id} chamber={chamber} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}>{state.name} Legislature</h1>
          </div>
          <nav className="mt-5 inline-flex max-w-full rounded-full p-1" style={{ background: "var(--app-tab-bg)" }} aria-label="Chamber">
            {(unicameral ? (["senate"] as Chamber[]) : CHAMBERS).map((c) => (
              <ChamberSwitch key={c} stateId={state.id} chamber={c} unicameral={unicameral} active={c === chamber} />
            ))}
          </nav>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} pt-6 pb-12`}>
        <LegislativeAtlas
          abbr={state.abbr}
          stateName={state.name}
          chamber={chamber}
          isUnicameral={unicameral}
          mapInfo={s.mapInfo}
          roster={s.roster}
          pres2024={stateLegPres2024[state.abbr]?.[chamber] ?? {}}
          calendar={s.calendar ?? null}
          historicalMaps={stateLegHistoricalMaps[state.abbr]?.[chamber] ?? {}}
          houseEntries={entries.filter((e) => e.type === "House")}
          senateEntries={entries.filter((e) => e.type === "Senate")}
          adjustedMargins={s.adjustedMargins}
          electionYear={electionYear}
          summary={<ChamberSummary s={s} electionYear={electionYear} />}
          precinctResults={hasPrecinctResults(state.abbr, chamber, electionYear)}
        />
      </main>
    </div>
  );
}

/**
 * The chamber switcher (user, 2026-11-18: bigger and more visual than the old underline tabs, and
 * no seat counts — the sections below already show them; then smaller, no icons): a pill-shaped
 * toggle, the chamber on screen filled dark.
 */
function ChamberSwitch({ stateId, chamber, unicameral, active }: { stateId: string; chamber: Chamber; unicameral: boolean; active: boolean }) {
  return (
    <Link
      href={`/states/${stateId}/legislature/${chamber}`}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className="ix-press whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
      style={active
        ? { background: "var(--app-text-primary)", color: "var(--app-bg)", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }
        : { color: "var(--app-text-muted)" }}
    >
      {chamberShortLabel(chamber, unicameral)}
    </Link>
  );
}
