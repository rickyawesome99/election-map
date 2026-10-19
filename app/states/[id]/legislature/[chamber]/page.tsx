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
import { PILL, StatePill } from "@/components/RaceHeroPills";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

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

  // Control pill, as the race pages' held pill: the party holding the most seats now (Nebraska's
  // nonpartisan members counted by caucus). An even split shows as tied.
  const holder = s.seats ? (s.seats.dem > s.seats.rep ? "D" : s.seats.rep > s.seats.dem ? "R" : null) : null;
  const controlLabel = holder === "D" ? "Democratic-held" : holder === "R" ? "Republican-held" : s.seats ? "Tied" : null;

  const tab = (c: Chamber, active: boolean) => (
    <Link
      key={c}
      href={`/states/${state.id}/legislature/${c}`}
      className="pb-2.5 text-sm font-semibold transition-colors"
      style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: `2px solid ${active ? "var(--app-text-primary)" : "transparent"}`, marginBottom: "-1px" }}
    >
      {chamberShortLabel(c, unicameral)}
    </Link>
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: holder ? `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${holder === "D" ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)` : "linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, var(--app-tab-bg) 0%, var(--app-bg) 65%)" }}>
        <div className={`${PAGE_CONTAINER} pt-6`}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StatePill name={state.name} abbr={state.abbr} />
            {controlLabel && (
              <span className={PILL} style={holder ? { background: holder === "D" ? "var(--party-dem)" : "var(--party-rep)", color: "#fff" } : { background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{controlLabel}</span>
            )}
            <div className="ml-auto">
              <StateSwitcher id={state.id} chamber={chamber} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}>{state.name} Legislature</h1>
          </div>
          <nav className="mt-6 sm:mt-7 flex items-end gap-5" style={{ borderBottom: "1px solid var(--app-border)" }} aria-label="Chamber">
            {unicameral ? tab("senate", true) : CHAMBERS.map((c) => tab(c, c === chamber))}
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
          electionYear={electionYear}
          summary={<ChamberSummary s={s} electionYear={electionYear} />}
        />
      </main>
    </div>
  );
}
