import { statesData } from "@/data/statesData";
import { senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, houseData, senateCurrent, pres2024, RaceForecast, NoElectionEntry } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import StateMapSection from "@/components/StateMapSection";

const NAV = [
  { label: "States",   href: "/states" },
  { label: "House",    href: "/house" },
  { label: "Senate",   href: "/senate" },
  { label: "Governor", href: "/governor" },
];

const GENERAL_ELECTION = "November 3, 2026";

function RatingBadge({ rating }: { rating: string }) {
  const { bg, text } = getRatingColors(rating);
  return (
    <span
      className="text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: bg, color: text }}
    >
      {rating}
    </span>
  );
}


// Card for a seat that has no 2026 election — shows incumbent info + link
function IncumbentCard({ entry, href, label }: { entry: NoElectionEntry; href: string; label: string }) {
  const partyColor = entry.party === "D" ? "var(--party-dem)" : entry.party === "R" ? "var(--party-rep)" : "var(--app-text-primary)";
  const partyLabel = entry.party === "D" ? "Dem" : entry.party === "R" ? "Rep" : "Ind";
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg px-4 py-3 transition-colors"
      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="w-24 shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
        >
          No 2026 Election
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{entry.incumbent}</span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ color: partyColor, background: entry.party === "D" ? "var(--party-dem-subtle)" : entry.party === "R" ? "var(--party-rep-subtle)" : "var(--app-tab-bg)" }}
          >
            {partyLabel}
          </span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>
          Incumbent · Next election: {entry.nextElection}
        </div>
      </div>
      <div className="shrink-0 flex items-center">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function ElectionCard({ race, href, label }: { race: RaceForecast; href: string; label: string }) {
  const dem = race.candidates?.dem;
  const rep = race.candidates?.rep;
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg px-4 py-3 transition-colors"
      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="w-24 shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </div>
        <div className="text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>
          {GENERAL_ELECTION}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {dem && rep ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold truncate" style={{ color: "var(--party-dem)" }}>{dem.name}</span>
            <span className="text-xs shrink-0" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
            <span className="font-semibold truncate" style={{ color: "var(--party-rep)" }}>{rep.name}</span>
          </div>
        ) : (
          <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--party-dem)" }}>
            D {((100 + race.margin) / 2).toFixed(1)}%
          </span>
          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>·</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--party-rep)" }}>
            R {((100 - race.margin) / 2).toFixed(1)}%
          </span>
        </div>
        <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: race.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
          {race.margin >= 0 ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
        </span>
        <RatingBadge rating={race.rating} />
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function HouseDistrictRow({ race, from }: { race: RaceForecast; from: string }) {
  const parts = race.name.split("-");
  const distNum = parts[1];
  const isAL = distNum === "AL";
  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const demVS = ((100 + race.margin) / 2).toFixed(1);
  const repVS = ((100 - race.margin) / 2).toFixed(1);
  const { bg, text } = getRatingColors(race.rating);
  return (
    <Link
      href={`/house/${race.id}?from=${encodeURIComponent(from)}`}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors"
      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
    >
      {/* District name */}
      <span className="text-sm font-bold tabular-nums w-24 shrink-0 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
        {isAL ? "At-Large" : `District ${distNum}`}
      </span>

      {/* Bar + vote shares — hidden on mobile */}
      <div className="hidden sm:flex flex-1 items-center gap-3 min-w-0">
        <div className="flex h-2 rounded-full overflow-hidden flex-1">
          <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
          <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--party-dem)" }}>D {demVS}%</span>
          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>·</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--party-rep)" }}>R {repVS}%</span>
        </div>
      </div>

      {/* Spacer on mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Margin */}
      <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: race.margin >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
        {race.margin >= 0 ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
      </span>

      {/* Rating badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full text-center shrink-0"
        style={{ background: bg, color: text, minWidth: "4.5rem" }}
      >
        {race.rating}
      </span>

      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function HistoryResultBar({
  demPct,
  repPct,
  placeholder,
}: {
  demPct: number | null;
  repPct: number | null;
  placeholder?: boolean;
}) {
  if (placeholder || demPct === null || repPct === null) {
    return (
      <div className="flex h-4 rounded-full overflow-hidden" style={{ background: "var(--app-border)", opacity: 0.4 }}>
        <div className="w-full" style={{ background: "var(--app-border)" }} />
      </div>
    );
  }
  const total = demPct + repPct;
  const dWidth = total > 0 ? (demPct / total) * 100 : 50;
  const winner = demPct > repPct ? "D" : "R";
  const margin = Math.abs(demPct - repPct).toFixed(1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={
            winner === "D"
              ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
              : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }
          }
        >
          {winner}+{margin}
        </span>
        <span className="text-xs" style={{ color: "var(--party-dem)" }}>{demPct.toFixed(1)}%</span>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>·</span>
        <span className="text-xs" style={{ color: "var(--party-rep)" }}>{repPct.toFixed(1)}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
        <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return {
    title: `${state.name} — 2026 Forecast`,
    description: `2026 election forecast for ${state.name}`,
  };
}

export default async function StateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  // Senate seat 1: 2026 race or no-election holdover
  const senateRace = senateData.find((r) => r.id === state.abbr);
  const senateNoEl = !senateRace ? senateNoElection.find((e) => e.abbr === state.abbr) : null;
  // Senate seat 2: always a holdover (the other senator)
  const senateHoldover = senateHoldovers.find((e) => e.abbr === state.abbr);
  // Governor: 2026 race or no-election holdover
  const governorRace = governorData.find((r) => r.id === state.abbr);
  const governorNoEl = !governorRace ? governorNoElection.find((e) => e.abbr === state.abbr) : null;

  const houseRaces = houseData.filter((r) => r.state === state.name);
  const senatePastResults = senateRace?.pastResults?.filter((r) => r.year >= 2016) ?? [];
  const totalRaces2026 = houseRaces.length + (senateRace ? 1 : 0) + (governorRace ? 1 : 0);

  // Helper: current party from a race — explicit incumbent flag first, then margin sign as fallback
  function raceParty(race: RaceForecast): "D" | "R" {
    if (race.candidates?.dem.incumbent) return "D";
    if (race.candidates?.rep.incumbent) return "R";
    return race.margin >= 0 ? "D" : "R";
  }

  // House current composition (incumbent party per district)
  const houseDemCurrent = houseRaces.filter((r) => raceParty(r) === "D").length;
  const houseRepCurrent = houseRaces.filter((r) => raceParty(r) === "R").length;

  // House projected composition (2026 forecast)
  const houseDemProj = houseRaces.filter((r) => r.margin >= 0).length;
  const houseRepProj = houseRaces.filter((r) => r.margin < 0).length;

  // Senate current composition — sourced from explicit lookup, not 2026 projections
  const [senSeat1, senSeat2] = senateCurrent[state.abbr] ?? ["R", "R"];
  const senateDems = [senSeat1, senSeat2].filter((p) => p === "D").length;
  const senateReps = [senSeat1, senSeat2].filter((p) => p === "R").length;
  const senateInds = [senSeat1, senSeat2].filter((p) => p === "I").length;

  // Governor current incumbent party
  const govParty: "D" | "R" | "I" | null = governorRace ? raceParty(governorRace) : (governorNoEl?.party ?? null);

  // Placeholder presidential years shown since 2016
  const presidentialYears = [2024, 2020, 2016];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10">
      <header
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link href="/" className="font-bold text-lg tracking-tight" style={{ color: "var(--app-text-primary)" }}>
          CT Strategies
        </Link>
        <div className="hidden md:block h-4 w-px" style={{ background: "var(--app-border)" }} />
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={{ color: "var(--app-text-muted)" }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <Link href="/states" className="text-sm transition-colors" style={{ color: "var(--app-text-muted)" }}>
            ← All States
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <nav className="md:hidden flex border-b" style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }}>
        {NAV.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 py-2 text-center text-sm font-medium"
            style={{ color: "var(--app-text-muted)" }}
          >
            {label}
          </Link>
        ))}
      </nav>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Title */}
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
          >
            {state.abbr}
          </span>
          <h1 className="text-3xl font-bold" style={{ color: "var(--app-text-primary)" }}>
            {state.name}
          </h1>
        </div>

        {/* Overview + Map */}
        <StateMapSection houseRaces={houseRaces} stateAbbr={state.abbr} stateName={state.name}>
          {/* Overview */}
          <section
            className="rounded-xl p-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2
              className="text-[10px] uppercase tracking-wider font-semibold mb-4"
              style={{ color: "var(--app-text-muted)" }}
            >
              Overview
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--app-text-primary)" }}>
              {state.name} is represented by {houseRaces.length} congressional district{houseRaces.length !== 1 ? "s" : ""} in the U.S. House.
              {senateRace
                ? ` The state's Class 2 Senate seat is on the ballot in 2026.`
                : " No Senate seat is up for election in 2026."}
              {governorRace ? " A gubernatorial election is also scheduled for November 2026." : ""}
            </p>

            <div className="grid grid-cols-4 gap-2">
              {/* House: current incumbent composition */}
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                  House
                </div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  <span style={{ color: "var(--party-dem)" }}>{houseDemCurrent}D</span>
                  <span style={{ color: "var(--app-text-very-muted)", fontSize: "0.75rem" }}>·</span>
                  <span style={{ color: "var(--party-rep)" }}>{houseRepCurrent}R</span>
                </div>
              </div>

              {/* Senate: current composition of both seats */}
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                  Senate
                </div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  {senateInds > 0 ? (
                    // Mixed with independent (ME: 1R·1I, VT: 1D·1I)
                    <>
                      {senateDems > 0 && <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>}
                      {senateReps > 0 && <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>}
                      {(senateDems > 0 || senateReps > 0) && <span style={{ color: "var(--app-text-very-muted)", fontSize: "0.75rem" }}>·</span>}
                      <span style={{ color: "var(--app-text-muted)" }}>{senateInds}I</span>
                    </>
                  ) : senateReps === 0 ? (
                    <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>
                  ) : senateDems === 0 ? (
                    <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>
                  ) : (
                    <>
                      <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>
                      <span style={{ color: "var(--app-text-very-muted)", fontSize: "0.75rem" }}>·</span>
                      <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>
                    </>
                  )}
                </div>
              </div>

              {/* Governor: incumbent party */}
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                  Governor
                </div>
                {govParty ? (
                  <span
                    className="text-lg font-bold"
                    style={{
                      color: govParty === "D" ? "var(--party-dem)" : govParty === "R" ? "var(--party-rep)" : "var(--app-text-primary)",
                    }}
                  >
                    {govParty}
                  </span>
                ) : (
                  <span className="text-lg font-bold" style={{ color: "var(--app-text-very-muted)" }}>—</span>
                )}
              </div>

              {/* President 2024 */}
              {(() => {
                const m = pres2024[state.abbr];
                const isD = m != null && m >= 0;
                return (
                  <div className="rounded-lg p-3 text-center" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                      Pres. 2024
                    </div>
                    {m != null ? (
                      <div className="text-lg font-bold" style={{ color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
                        {isD ? "D" : "R"}+{Math.abs(m).toFixed(1)}
                      </div>
                    ) : (
                      <span className="text-lg font-bold" style={{ color: "var(--app-text-very-muted)" }}>—</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>

        </StateMapSection>

        {/* Federal Offices */}
        <section
          className="rounded-xl p-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <div className="flex items-baseline gap-3 mb-5">
            <h2
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Federal Offices
            </h2>
            <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              {totalRaces2026} race{totalRaces2026 !== 1 ? "s" : ""} on ballot in 2026 · General: {GENERAL_ELECTION}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* Senate seat 1 */}
            {senateRace ? (
              <ElectionCard
                race={senateRace}
                href={`/senate/${senateRace.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="U.S. Senate (Seat 1)"
              />
            ) : senateNoEl ? (
              <IncumbentCard
                entry={senateNoEl}
                href={`/senate/${senateNoEl.abbr.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="U.S. Senate (Seat 1)"
              />
            ) : null}

            {/* Senate seat 2 — always a holdover */}
            {senateHoldover && (
              <IncumbentCard
                entry={senateHoldover}
                href={`/senate/${senateHoldover.abbr.toLowerCase()}-2?from=${encodeURIComponent(`/states/${id}`)}`}
                label="U.S. Senate (Seat 2)"
              />
            )}

            {/* Governor */}
            {governorRace ? (
              <ElectionCard
                race={governorRace}
                href={`/governor/${governorRace.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Governor"
              />
            ) : governorNoEl ? (
              <IncumbentCard
                entry={governorNoEl}
                href={`/governor/${governorNoEl.abbr.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Governor"
              />
            ) : null}

            {/* House subsection */}
            {houseRaces.length > 0 && (
              <div
                className="rounded-lg p-4"
                style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      U.S. House · {houseRaces.length} District{houseRaces.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-1 text-xs font-semibold">
                      <span style={{ color: "var(--party-dem)" }}>{houseDemProj}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}>·</span>
                      <span style={{ color: "var(--party-rep)" }}>{houseRepProj}R</span>
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                    {GENERAL_ELECTION}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {houseRaces.map((race) => (
                    <HouseDistrictRow key={race.id} race={race} from={`/states/${id}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Electoral History */}
        <section
          className="rounded-xl p-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2
            className="text-[10px] uppercase tracking-wider font-semibold mb-6"
            style={{ color: "var(--app-text-muted)" }}
          >
            Electoral History · Statewide Races Since 2016
          </h2>

          {/* Table header */}
          <div
            className="grid grid-cols-[auto_auto_1fr_1fr_1fr] gap-4 pb-2 mb-3 text-[10px] uppercase tracking-wider font-semibold"
            style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}
          >
            <span className="w-12">Year</span>
            <span className="w-24">Race</span>
            <span>Democrat</span>
            <span>Republican</span>
            <span>Result</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Presidential rows (placeholder) */}
            {presidentialYears.map((year) => (
              <div
                key={`pres-${year}`}
                className="grid grid-cols-[auto_auto_1fr_1fr_1fr] gap-4 items-center"
              >
                <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {year}
                </span>
                <span className="text-xs w-24 font-medium" style={{ color: "var(--app-text-muted)" }}>
                  Presidential
                </span>
                <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                <HistoryResultBar demPct={null} repPct={null} placeholder />
              </div>
            ))}

            {/* Senate past results */}
            {senatePastResults.length > 0 && (
              <div
                className="h-px my-1"
                style={{ background: "var(--app-border)" }}
              />
            )}
            {senatePastResults.map((res) => (
              <div
                key={`senate-${res.year}`}
                className="grid grid-cols-[auto_auto_1fr_1fr_1fr] gap-4 items-center"
              >
                <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {res.year}
                </span>
                <Link
                  href={senateRace ? `/senate/${senateRace.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}` : "#"}
                  className="text-xs w-24 font-medium transition-colors hover:underline"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  U.S. Senate
                </Link>
                <span className="text-sm font-semibold truncate" style={{ color: "var(--party-dem)" }}>
                  {res.demCandidate ?? "Democratic Candidate"}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: "var(--party-rep)" }}>
                  {res.repCandidate ?? "Republican Candidate"}
                </span>
                <HistoryResultBar demPct={res.demPct} repPct={res.repPct} />
              </div>
            ))}

            {/* Governor placeholder rows */}
            {governorRace && (
              <>
                <div className="h-px my-1" style={{ background: "var(--app-border)" }} />
                {[2022, 2018].map((year) => (
                  <div
                    key={`gov-${year}`}
                    className="grid grid-cols-[auto_auto_1fr_1fr_1fr] gap-4 items-center"
                  >
                    <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {year}
                    </span>
                    <Link
                      href={`/governor/${governorRace.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                      className="text-xs w-24 font-medium transition-colors hover:underline"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Governor
                    </Link>
                    <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                    <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                    <HistoryResultBar demPct={null} repPct={null} placeholder />
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* House Composition History */}
        {houseRaces.length > 0 && (
          <section
            className="rounded-xl p-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2
              className="text-[10px] uppercase tracking-wider font-semibold mb-6"
              style={{ color: "var(--app-text-muted)" }}
            >
              House Delegation Composition · Since 2016
            </h2>

            {/* Table header */}
            <div
              className="grid grid-cols-[auto_auto_auto_1fr] gap-4 pb-2 mb-3 text-[10px] uppercase tracking-wider font-semibold"
              style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}
            >
              <span className="w-12">Year</span>
              <span className="w-16 text-center">D Seats</span>
              <span className="w-16 text-center">R Seats</span>
              <span>House Popular Vote</span>
            </div>

            <div className="flex flex-col gap-3">
              {([2024, 2022, 2020, 2018, 2016] as const).map((year) => (
                <div
                  key={year}
                  className="grid grid-cols-[auto_auto_auto_1fr] gap-4 items-center"
                >
                  <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {year}
                  </span>
                  <span className="w-16 text-center text-sm font-semibold tabular-nums" style={{ color: "var(--party-dem)" }}>
                    —
                  </span>
                  <span className="w-16 text-center text-sm font-semibold tabular-nums" style={{ color: "var(--party-rep)" }}>
                    —
                  </span>
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
                    Popular vote TBD
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
