import { statesData } from "@/data/statesData";
import { senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, houseData, senateCurrent, pres2024, presPastResults, houseDelegationHistory, PresResult, RaceForecast, NoElectionEntry, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import StateMapSection from "@/components/StateMapSection";


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

function isSpecialElection(electionType?: string) {
  return (electionType ?? "").toLowerCase().includes("special");
}

function SpecialBadge() {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
    >
      Special
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
      className="flex items-center gap-3 sm:gap-4 rounded-lg px-4 py-3 transition-colors min-w-0"
      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="w-20 sm:w-24 shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </div>
        <div className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>No Election</div>
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
      className="flex items-center gap-3 sm:gap-4 rounded-lg px-4 py-3 transition-colors min-w-0"
      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="w-20 sm:w-24 shrink-0">
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
      <div className="shrink-0 flex items-center gap-1.5 sm:gap-3">
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
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
      className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-lg transition-colors min-w-0"
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
        className="text-xs font-semibold px-2 py-0.5 rounded-full text-center shrink-0 w-[4.1rem] sm:w-[4.5rem]"
        style={{ background: bg, color: text }}
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
      <div className="hidden sm:flex h-3 rounded-full overflow-hidden">
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
    title: `${state.name} — ${electionYear} Forecast`,
    description: `${electionYear} election forecast for ${state.name}`,
  };
}

export default async function StateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  // Senate seat 1: 2026 race (id=abbr) or holdover (in senateNoElection)
  const senateSeat1Race = senateData.find((r) => r.id === state.abbr);
  const senateSeat1NoEl = !senateSeat1Race ? senateNoElection.find((e) => e.abbr === state.abbr) : null;
  // Senate seat 2: 2026 race (id=abbr-2) or holdover (in senateHoldovers)
  const senateSeat2Race = senateData.find((r) => r.id === `${state.abbr}-2`);
  const senateSeat2Holdover = !senateSeat2Race ? senateHoldovers.find((e) => e.abbr === state.abbr) : null;
  // The active 2026 senate race (either seat)
  const anySenateRace = senateSeat1Race ?? senateSeat2Race;
  // Governor: 2026 race or no-election holdover
  const governorRace = governorData.find((r) => r.id === state.abbr);
  const governorNoEl = !governorRace ? governorNoElection.find((e) => e.abbr === state.abbr) : null;

  const houseRaces = houseData.filter((r) => r.state === state.name);
  const senatePastResults = [
    ...(senateSeat1Race?.pastResults ?? senateSeat1NoEl?.pastResults ?? []).map((r) => ({ ...r, seat: 1 as const })),
    ...(senateSeat2Race?.pastResults ?? senateSeat2Holdover?.pastResults ?? []).map((r) => ({ ...r, seat: 2 as const })),
  ].filter((r) => r.year >= 2016).sort((a, b) => b.year - a.year || a.seat - b.seat);
  const govPastResults = (governorRace?.pastResults ?? governorNoEl?.pastResults ?? []).filter((r) => r.year >= 2016);
  const govPageId = governorRace ? governorRace.id.toLowerCase() : governorNoEl?.abbr.toLowerCase();
  const totalRaces2026 = houseRaces.length + (anySenateRace ? 1 : 0) + (governorRace ? 1 : 0);

  // Helper: current party from a race — explicit incumbent flag first, then margin sign as fallback
  function raceParty(race: RaceForecast): "D" | "R" {
    if (race.candidates?.dem.incumbent) return "D";
    if (race.candidates?.rep.incumbent) return "R";
    return race.margin >= 0 ? "D" : "R";
  }

  const stateDelegationHistory = houseDelegationHistory[state.name] ?? [];

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

  // Presidential past results for this state (handles ME/NE congressional-district allocations)
  const stateAbbr = state.abbr;
  const presKeys =
    stateAbbr === "ME" ? ["ME", "ME-01", "ME-02"] :
    stateAbbr === "NE" ? ["NE", "NE-01", "NE-02", "NE-03"] :
    [stateAbbr];
  const presRows: PresResult[] = presKeys
    .flatMap((k, ki) =>
      (presPastResults[k] ?? []).map((r) => ({ ...r, _ki: ki }))
    )
    .sort((a, b) => b.year !== a.year ? b.year - a.year : (a as { _ki: number })._ki - (b as { _ki: number })._ki);

  function presRaceLabel(abbr: string): string {
    if (abbr === stateAbbr) return "Presidential";
    const m = abbr.match(/-(\d+)$/);
    return m ? `Pres. (CD-${m[1]})` : "Presidential";
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={
        <Link href={from ?? "/states"} className="text-sm transition-colors" style={{ color: "var(--app-text-muted)" }}>
          ← {from?.startsWith("/senate") ? "Back to Senate" : from?.startsWith("/governor") ? "Back to Governor" : from?.startsWith("/house") ? "Back to District" : "All States"}
        </Link>
      } />

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
              {anySenateRace
                ? ` A U.S. Senate seat is on the ballot in ${electionYear}.`
                : ` No Senate seat is up for election in ${electionYear}.`}
              {governorRace ? ` A gubernatorial election is also scheduled for November ${electionYear}.` : ""}
            </p>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
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
              {totalRaces2026} race{totalRaces2026 !== 1 ? "s" : ""} on ballot in {electionYear} · General: {GENERAL_ELECTION}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* Senate seat 1 */}
            {senateSeat1Race ? (
              <ElectionCard
                race={senateSeat1Race}
                href={`/senate/${senateSeat1Race.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Senate (Seat 1)"
              />
            ) : senateSeat1NoEl ? (
              <IncumbentCard
                entry={senateSeat1NoEl}
                href={`/senate/${senateSeat1NoEl.abbr.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Senate (Seat 1)"
              />
            ) : null}

            {/* Senate seat 2 — 2026 race or holdover */}
            {senateSeat2Race ? (
              <ElectionCard
                race={senateSeat2Race}
                href={`/senate/${senateSeat2Race.id.toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Senate (Seat 2)"
              />
            ) : senateSeat2Holdover ? (
              <IncumbentCard
                entry={senateSeat2Holdover}
                href={`/senate/${senateSeat2Holdover.abbr.toLowerCase()}-2?from=${encodeURIComponent(`/states/${id}`)}`}
                label="Senate (Seat 2)"
              />
            ) : null}

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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-1.5">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                  <span className="text-xs sm:text-xs" style={{ color: "var(--app-text-very-muted)" }}>
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
            className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[auto_auto_1fr_1fr_1fr] gap-2 sm:gap-4 pb-2 mb-3 text-[10px] uppercase tracking-wider font-semibold"
            style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}
          >
            <span className="w-12">Year</span>
            <span className="w-20 sm:w-24">Race</span>
            <span className="hidden sm:block">Democrat</span>
            <span className="hidden sm:block">Republican</span>
            <span>Result</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Presidential rows */}
            {presRows.length > 0 ? presRows.map((res, i) => (
              <div
                key={`pres-${res.year}-${res.stateAbbr}-${i}`}
                className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[auto_auto_1fr_1fr_1fr] gap-2 sm:gap-4 items-center"
              >
                <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {res.year}
                </span>
                <span className="text-xs w-20 sm:w-24 font-medium" style={{ color: "var(--app-text-muted)" }}>
                  {presRaceLabel(res.stateAbbr)}
                </span>
                <div className="hidden sm:flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--party-dem)" }}>{res.demCandidate ?? "Democratic Candidate"}</span>
                  {res.demIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>}
                </div>
                <div className="hidden sm:flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--party-rep)" }}>{res.repCandidate ?? "Republican Candidate"}</span>
                  {res.repIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>}
                </div>
                <HistoryResultBar demPct={res.demPct} repPct={res.repPct} />
              </div>
            )) : [2024, 2020, 2016].map((year) => (
              <div
                key={`pres-${year}`}
                className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[auto_auto_1fr_1fr_1fr] gap-2 sm:gap-4 items-center"
              >
                <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>{year}</span>
                <span className="text-xs w-20 sm:w-24 font-medium" style={{ color: "var(--app-text-muted)" }}>Presidential</span>
                <span className="hidden sm:block text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                <span className="hidden sm:block text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
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
            {senatePastResults.map((res, idx) => (
              <div
                key={`senate-${res.year}-${res.seat}-${res.electionType ?? "regular"}-${idx}`}
                className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[auto_auto_1fr_1fr_1fr] gap-2 sm:gap-4 items-center"
              >
                <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                <div className="w-20 sm:w-24 flex items-center gap-1.5">
                  <Link
                    href={`/senate/${(res.seat === 2 ? `${state.abbr}-2` : state.abbr).toLowerCase()}?from=${encodeURIComponent(`/states/${id}`)}`}
                    className="text-xs font-medium transition-colors hover:underline"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {isSpecialElection(res.electionType) ? "Senate Special" : "Senate"}
                  </Link>
                </div>
                <div className="hidden sm:flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--party-dem)" }}>{res.demCandidate ?? "Democratic Candidate"}</span>
                  {res.demIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>}
                </div>
                <div className="hidden sm:flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--party-rep)" }}>{res.repCandidate ?? "Republican Candidate"}</span>
                  {res.repIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>}
                </div>
                <HistoryResultBar demPct={res.demPct} repPct={res.repPct} />
              </div>
            ))}

            {/* Governor past results */}
            {govPastResults.length > 0 && govPageId && (
              <>
                <div className="h-px my-1" style={{ background: "var(--app-border)" }} />
                {govPastResults.map((res) => (
                  <div
                    key={`gov-${res.year}`}
                    className="grid grid-cols-[auto_auto_1fr] sm:grid-cols-[auto_auto_1fr_1fr_1fr] gap-2 sm:gap-4 items-center"
                  >
                    <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                    <div className="w-20 sm:w-24 flex items-center gap-1.5">
                      <Link
                        href={`/governor/${govPageId}?from=${encodeURIComponent(`/states/${id}`)}`}
                        className="text-xs font-medium transition-colors hover:underline"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        Governor
                      </Link>
                      {isSpecialElection(res.electionType) && <span className="hidden sm:inline-flex"><SpecialBadge /></span>}
                    </div>
                    <div className="hidden sm:flex items-center gap-1 min-w-0">
                      <span className="text-sm font-semibold truncate" style={{ color: "var(--party-dem)" }}>{res.demCandidate ?? "Democratic Candidate"}</span>
                      {res.demIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>}
                    </div>
                    <div className="hidden sm:flex items-center gap-1 min-w-0">
                      <span className="text-sm font-semibold truncate" style={{ color: "var(--party-rep)" }}>{res.repCandidate ?? "Republican Candidate"}</span>
                      {res.repIncumbent && <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>}
                    </div>
                    <HistoryResultBar demPct={res.demPct} repPct={res.repPct} />
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
              className="grid grid-cols-[auto_auto_auto_1fr] gap-3 pb-2 mb-3 text-[10px] uppercase tracking-wider font-semibold"
              style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}
            >
              <span className="w-12">Year</span>
              <span className="w-10 text-center">D</span>
              <span className="w-10 text-center">R</span>
              <span>House Popular Vote</span>
            </div>

            <div className="flex flex-col gap-3">
              {([2024, 2022, 2020, 2018, 2016] as const).map((year) => {
                const entry = stateDelegationHistory.find((e) => e.year === year);
                let popVote = null;
                if (entry) {
                  const total = entry.demPct + entry.repPct;
                  const dWidth = total > 0 ? (entry.demPct / total) * 100 : 50;
                  const winner = entry.demPct > entry.repPct ? "D" : "R";
                  const margin = Math.abs(entry.demPct - entry.repPct).toFixed(1);
                  popVote = { dWidth, winner, margin };
                }
                return (
                  <div
                    key={year}
                    className="grid grid-cols-[auto_auto_auto_1fr] gap-3 items-center"
                  >
                    <span className="text-sm font-bold w-12 tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {year}
                    </span>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums" style={{ color: "var(--party-dem)" }}>
                      {entry ? entry.demSeats : "—"}
                    </span>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums" style={{ color: "var(--party-rep)" }}>
                      {entry && popVote ? entry.repSeats : "—"}
                    </span>
                    {entry && popVote ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={popVote.winner === "D"
                              ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                              : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                          >
                            {popVote.winner}+{popVote.margin}
                          </span>
                          <span className="text-xs" style={{ color: "var(--party-dem)" }}>{entry.demPct.toFixed(1)}%</span>
                          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>·</span>
                          <span className="text-xs" style={{ color: "var(--party-rep)" }}>{entry.repPct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-3 rounded-full overflow-hidden hidden sm:flex" style={{ flex: "0 1 9rem", minWidth: "4rem" }}>
                            <div style={{ width: `${popVote.dWidth}%`, background: "#1b408c" }} />
                            <div style={{ width: `${100 - popVote.dWidth}%`, background: "#be1c29" }} />
                          </div>
                          {(entry.demVotes || entry.repVotes) && (
                            <div className="flex gap-3 text-[10px] tabular-nums">
                              {entry.demVotes && <span style={{ color: "var(--party-dem)" }}>{entry.demVotes.toLocaleString()}</span>}
                              {entry.repVotes && <span style={{ color: "var(--party-rep)" }}>{entry.repVotes.toLocaleString()}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
