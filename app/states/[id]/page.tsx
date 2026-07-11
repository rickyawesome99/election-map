import { statesData } from "@/data/statesData";
import { senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, houseData, housePastResults, senateCurrent, pres2024, presPastResults, houseDelegationHistory, houseStatewideResults, stateLegData, PresResult, RaceForecast, NoElectionEntry, HouseStatewideResult, electionYear } from "@/data/forecastData";
import { computeProjectedMargin } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import StateMapSection from "@/components/StateMapSection";
import StateVoteHistoryChart from "@/components/StateVoteHistoryChart";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";


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


// Card for a seat that has no 2026 election — shows incumbent info + link
function IncumbentCard({ entry, href, label }: { entry: NoElectionEntry; href: string; label: string }) {
  const partyColor = entry.party === "D" ? "var(--party-dem)" : entry.party === "R" ? "var(--party-rep)" : "var(--app-text-primary)";
  const partyLabel = entry.party === "D" ? "Dem" : entry.party === "R" ? "Rep" : "Ind";
  return (
    <a
      href={href}
      className="block px-1 py-4 transition-colors min-w-0"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      <div className="sm:hidden">
        <div className="mb-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
            {label}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>No Election</span>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{entry.incumbent}</span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ color: partyColor, background: entry.party === "D" ? "var(--party-dem-subtle)" : entry.party === "R" ? "var(--party-rep-subtle)" : "var(--app-tab-bg)" }}
          >
            {partyLabel}
          </span>
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>
          Incumbent · Next election: {entry.nextElection}
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-3 sm:gap-4 min-w-0">
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
      </div>
    </a>
  );
}

function ElectionCard({ race, href, label }: { race: RaceForecast; href: string; label: string }) {
  const dem = race.candidates?.dem;
  const rep = race.candidates?.rep;
  const demPct = ((100 - race.margin) / 2).toFixed(1);
  const repPct = ((100 + race.margin) / 2).toFixed(1);
  return (
    <a
      href={href}
      className="block px-1 py-4 transition-colors min-w-0"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="mb-1.5">
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
            {label}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{GENERAL_ELECTION}</span>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold tabular-nums" style={{ color: race.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                {race.margin <= 0 ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
              </span>
              <RatingBadge rating={marginToRating(race.margin)} />
            </div>
          </div>
        </div>
        {dem && rep ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate text-sm" style={{ color: "var(--party-dem)" }}>{dem.name}</span>
              <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-dem)" }}>D {demPct}%</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate text-sm" style={{ color: "var(--party-rep)" }}>{rep.name}</span>
              <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-rep)" }}>R {repPct}%</span>
            </div>
          </div>
        ) : (
          <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-3 sm:gap-4 min-w-0">
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
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate text-sm" style={{ color: "var(--party-dem)" }}>{dem.name}</span>
                <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-dem)" }}>D {demPct}%</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate text-sm" style={{ color: "var(--party-rep)" }}>{rep.name}</span>
                <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-rep)" }}>R {repPct}%</span>
              </div>
            </div>
          ) : (
            <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5 sm:gap-3">
          <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: race.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
            {race.margin <= 0 ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
          </span>
          <RatingBadge rating={marginToRating(race.margin)} />
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </a>
  );
}

function HouseDistrictRow({ race }: { race: RaceForecast }) {
  const parts = race.name.split("-");
  const distNum = parts[1];
  const isAL = distNum === "AL";
  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const demVS = ((100 - race.margin) / 2).toFixed(1);
  const repVS = ((100 + race.margin) / 2).toFixed(1);
  const { bg, text } = getRatingColors(marginToRating(race.margin));
  return (
    <a
      href={`/house/${race.name.toLowerCase()}`}
      className="flex items-center gap-2 sm:gap-3 px-0 py-2.5 transition-colors min-w-0"
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
      <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: race.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
        {race.margin <= 0 ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
      </span>

      {/* Rating badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full text-center shrink-0 w-[4.1rem] sm:w-[4.5rem]"
        style={{ background: bg, color: text }}
      >
        {marginToRating(race.margin)}
      </span>

      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-very-muted)" }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </a>
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

export default async function StateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // Projected 2026 margins (structural forecast blended with RCP Average polling) for all active races on this state page
  const projectedHouseRaces = houseRaces.map(r => ({ ...r, margin: computeProjectedMargin(r) }));
  const projectedGovernorRace = governorRace ? { ...governorRace, margin: computeProjectedMargin(governorRace) } : null;
  const projectedSenateSeat1Race = senateSeat1Race ? { ...senateSeat1Race, margin: computeProjectedMargin(senateSeat1Race) } : null;
  const projectedSenateSeat2Race = senateSeat2Race ? { ...senateSeat2Race, margin: computeProjectedMargin(senateSeat2Race) } : null;
  const senatePastResults = [
    ...(senateSeat1Race?.pastResults ?? senateSeat1NoEl?.pastResults ?? []).map((r) => ({ ...r, seat: 1 as const })),
    ...(senateSeat2Race?.pastResults ?? senateSeat2Holdover?.pastResults ?? []).map((r) => ({ ...r, seat: 2 as const })),
  ].filter((r) => r.year >= 2016).sort((a, b) => b.year - a.year || a.seat - b.seat);
  const govPastResults = (governorRace?.pastResults ?? governorNoEl?.pastResults ?? []).filter((r) => r.year >= 2016);
  const govPageId = governorRace ? governorRace.id.toLowerCase() : governorNoEl?.abbr.toLowerCase();
  const totalRaces2026 = houseRaces.length + (anySenateRace ? 1 : 0) + (governorRace ? 1 : 0);

  // Helper: current party from a race — explicit incumbent flag first, then margin sign as fallback
  function raceParty(race: RaceForecast): "D" | "R" | "I" {
    if (race.seatParty) return race.seatParty;
    if (race.candidates?.dem.incumbent) return "D";
    if (race.candidates?.rep.incumbent) return "R";
    return race.margin <= 0 ? "D" : "R";
  }

  const STATE_FIPS: Record<string, string> = {
    AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09",
    DE: "10", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18",
    IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25",
    MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32",
    NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
    OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47",
    TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55",
    WY: "56",
  };
  const stateFips = STATE_FIPS[state.abbr] ?? "";
  const MAJOR_RACES = new Set(["President", "Governor", "Senate"]);
  const statePastResults: Record<string, HouseStatewideResult[]> = {};
  for (const [geoid, results] of Object.entries(houseStatewideResults)) {
    if (stateFips && geoid.startsWith(stateFips)) {
      const filtered = results.filter(r => r.year >= 2016 && MAJOR_RACES.has(r.race));
      if (filtered.length > 0) statePastResults[geoid] = filtered;
    }
  }
  const stateHousePastResults = Object.fromEntries(
    Object.entries(housePastResults).filter(([geoid]) => stateFips && geoid.startsWith(stateFips))
  );

  const stateDelegationHistory = houseDelegationHistory[state.name] ?? [];
  const stateLegEntries = (stateLegData[state.name] ?? []).filter(e =>
    e.type === "House" &&
    (e.demSeats != null || e.repSeats != null || e.demPct != null || e.repPct != null)
  );
  const stateLegSenateEntries = (stateLegData[state.name] ?? []).filter(e =>
    e.type === "Senate" &&
    (e.demSeats != null || e.repSeats != null || e.demPct != null || e.repPct != null)
  );

  // House current composition — use 2024 delegation history if available, else infer from incumbents
  const houseDel2024 = stateDelegationHistory.find((e) => e.year === 2024);
  const houseDemCurrent = houseDel2024 ? houseDel2024.demSeats : houseRaces.filter((r) => raceParty(r) === "D").length;
  const houseRepCurrent = houseDel2024 ? houseDel2024.repSeats : houseRaces.filter((r) => raceParty(r) === "R").length;

  // House projected composition (2026 forecast, from projected margins)
  const houseDemProj = projectedHouseRaces.filter((r) => r.margin <= 0).length;
  const houseRepProj = projectedHouseRaces.filter((r) => r.margin > 0).length;

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

  const voteHistoryResults = [
    ...stateDelegationHistory
      .filter((r) => r.year >= 2016)
      .map((r) => ({
        year: r.year,
        race: "House",
        demPct: r.demPct,
        repPct: r.repPct,
      })),
    ...presRows.map((r) => ({
      year: r.year,
      race: "President",
      demPct: r.demPct,
      repPct: r.repPct,
      label: r.stateAbbr === stateAbbr ? String(r.year) : `${r.year} ${presRaceLabel(r.stateAbbr).replace("Pres. ", "")}`,
    })),
    ...senatePastResults.map((r) => ({
      year: r.year,
      race: isSpecialElection(r.electionType) ? "Senate Special" : "Senate",
      demPct: r.demPct,
      repPct: r.repPct,
      label: `${r.year}${r.seat === 2 ? " S2" : ""}`,
    })),
    ...govPastResults.map((r) => ({
      year: r.year,
      race: "Governor",
      demPct: r.demPct,
      repPct: r.repPct,
    })),
    ...stateLegEntries
      .filter((e) => e.demPct != null && e.repPct != null)
      .map((e) => ({
        year: e.year,
        race: "State House",
        demPct: e.demPct!,
        repPct: e.repPct!,
      })),
    ...stateLegSenateEntries
      .filter((e) => e.demPct != null && e.repPct != null)
      .map((e) => ({
        year: e.year,
        race: "State Senate",
        demPct: e.demPct!,
        repPct: e.repPct!,
      })),
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>
        {/* Title */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="text-xs font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
          >
            {state.abbr}
          </span>
          <h1 className="text-2xl font-bold leading-none" style={{ color: "var(--app-text-primary)" }}>
            {state.name}
          </h1>
        </div>

        {/* Overview + Map */}
        <StateMapSection
          houseRaces={projectedHouseRaces}
          housePastResults={stateHousePastResults}
          stateAbbr={state.abbr}
          stateName={state.name}
          stateFips={stateFips}
          pastElectionResults={statePastResults}
          overview={(
            <>
              <div className="order-2">
              <section
                className="rounded-xl p-3"
                style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              >
                <h2
                  className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Overview
                </h2>
                <p className="text-sm leading-relaxed mb-2.5" style={{ color: "var(--app-text-primary)" }}>
                  {state.name} is represented by {houseRaces.length} congressional district{houseRaces.length !== 1 ? "s" : ""} in the U.S. House.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                      House
                    </div>
                    <div className="text-lg font-bold flex items-center justify-center gap-1">
                      <span style={{ color: "var(--party-dem)" }}>{houseDemCurrent}D</span>
                      <span style={{ color: "var(--app-text-very-muted)", fontSize: "0.75rem" }}>·</span>
                      <span style={{ color: "var(--party-rep)" }}>{houseRepCurrent}R</span>
                    </div>
                  </div>

                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
                      Senate
                    </div>
                    <div className="text-lg font-bold flex items-center justify-center gap-1">
                      {senateInds > 0 ? (
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

                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--app-bg)" }}>
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

                  {(() => {
                    const m = pres2024[state.abbr];
                    const isD = m != null && m <= 0;
                    return (
                      <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--app-bg)" }}>
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
              </div>

              {houseRaces.length > 0 && (
                <div className="order-6">
                <section
                  className="flex flex-col overflow-hidden rounded-xl p-3"
                  style={{
                    background: "var(--app-panel)",
                    border: "1px solid var(--app-border)",
                    flex: "0 0 23rem",
                    height: "23rem",
                  }}
                >
                  <h2
                    className="mb-3 shrink-0 text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    US House Delegation Composition · Since 2016
                  </h2>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-2.5">
                      {([2024, 2022, 2020, 2018, 2016] as const).map((year) => {
                        const entry = stateDelegationHistory.find((e) => e.year === year);
                        let popVote = null;
                        if (entry) {
                          const winner = entry.demPct > entry.repPct ? "D" : "R";
                          const margin = Math.abs(entry.demPct - entry.repPct).toFixed(1);
                          popVote = { winner, margin };
                        }
                        return (
                          <div
                            key={year}
                            className="rounded-lg p-2.5"
                            style={{ background: "var(--app-bg)" }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                                  {year}
                                </span>
                                <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                                  <span style={{ color: "var(--party-dem)" }}>{entry ? entry.demSeats : "—"}D</span>
                                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>/</span>
                                  <span style={{ color: "var(--party-rep)" }}>{entry && popVote ? entry.repSeats : "—"}R</span>
                                </div>
                              </div>
                              {entry && popVote ? (
                                <span
                                  className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={popVote.winner === "D"
                                    ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                                    : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                                >
                                  {popVote.winner}+{popVote.margin}
                                </span>
                              ) : (
                                <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                              )}
                            </div>
                            {entry && popVote ? (
                              <>
                                <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                                  <div style={{ width: `${entry.demPct}%`, background: "#1b408c" }} />
                                  <div style={{ width: `${entry.repPct}%`, background: "#be1c29" }} />
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span style={{ color: "var(--party-dem)" }}>{entry.demPct.toFixed(1)}%</span>
                                  <span style={{ color: "var(--party-rep)" }}>{entry.repPct.toFixed(1)}%</span>
                                </div>
                                <div className="mt-0.5 flex justify-between gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                                  <span className="truncate">
                                    {(entry.demVotes ?? 0).toLocaleString()} D votes
                                  </span>
                                  <span className="truncate text-right">
                                    {(entry.repVotes ?? 0).toLocaleString()} R votes
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>
                                Election data TBD
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
                </div>
              )}

            {(stateLegEntries.length > 0 || stateLegSenateEntries.length > 0) && (
              <div className="order-7">
                <StateLegCompositionBox
                  houseEntries={stateLegEntries}
                  senateEntries={stateLegSenateEntries}
                />
              </div>
            )}
            </>
          )}
        >
        {/* Federal Offices */}
        <section
          className="order-3 rounded-xl p-3"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 mb-3">
            <h2
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Federal Offices
            </h2>
            <span className="text-xs leading-relaxed sm:leading-normal" style={{ color: "var(--app-text-very-muted)" }}>
              {totalRaces2026} race{totalRaces2026 !== 1 ? "s" : ""} on ballot in {electionYear} · General: {GENERAL_ELECTION}
            </span>
          </div>

          <div className="max-h-[38rem] overflow-y-auto pr-1">
          <div className="flex flex-col" style={{ borderTop: "1px solid var(--app-border)" }}>
            {/* Governor */}
            {projectedGovernorRace ? (
              <ElectionCard
                race={projectedGovernorRace}
                href={`/governor/${projectedGovernorRace.id.toLowerCase()}`}
                label="Governor"
              />
            ) : governorNoEl ? (
              <IncumbentCard
                entry={governorNoEl}
                href={`/governor/${governorNoEl.abbr.toLowerCase()}`}
                label="Governor"
              />
            ) : null}

            {/* Senate seat 1 */}
            {projectedSenateSeat1Race ? (
              <ElectionCard
                race={projectedSenateSeat1Race}
                href={`/senate/${projectedSenateSeat1Race.id.toLowerCase()}`}
                label="Senate (Seat 1)"
              />
            ) : senateSeat1NoEl ? (
              <IncumbentCard
                entry={senateSeat1NoEl}
                href={`/senate/${senateSeat1NoEl.abbr.toLowerCase()}`}
                label="Senate (Seat 1)"
              />
            ) : null}

            {/* Senate seat 2 — 2026 race or holdover */}
            {projectedSenateSeat2Race ? (
              <ElectionCard
                race={projectedSenateSeat2Race}
                href={`/senate/${projectedSenateSeat2Race.id.toLowerCase().replace(/-2$/, "2")}`}
                label="Senate (Seat 2)"
              />
            ) : senateSeat2Holdover ? (
              <IncumbentCard
                entry={senateSeat2Holdover}
                href={`/senate/${senateSeat2Holdover.abbr.toLowerCase()}2`}
                label="Senate (Seat 2)"
              />
            ) : null}

            {/* House subsection */}
            {houseRaces.length > 0 && (
              <div
                className="py-4"
                style={{ borderBottom: "1px solid var(--app-border)" }}
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
                <div className="flex flex-col" style={{ borderTop: "1px solid var(--app-border)" }}>
                  {projectedHouseRaces.map((race) => (
                    <div key={race.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <HouseDistrictRow race={race} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </section>

          {/* Electoral History */}
          <section
            className="order-5 md:order-7 flex flex-col overflow-hidden rounded-xl p-3"
            style={{
              background: "var(--app-panel)",
              border: "1px solid var(--app-border)",
              flex: "0 0 38rem",
              height: "38rem",
            }}
          >
            <h2
              className="mb-3 shrink-0 text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Electoral History · Statewide Races Since 2016
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2.5">
                {presRows.length > 0 ? presRows.map((res, i) => {
                  const winner = res.demPct > res.repPct ? "D" : "R";
                  const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                  return (
                    <div
                      key={`pres-${res.year}-${res.stateAbbr}-${i}`}
                      className="rounded-lg p-2.5"
                      style={{ background: "var(--app-bg)" }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                            {res.year}
                          </span>
                          <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
                            {presRaceLabel(res.stateAbbr)}
                          </span>
                        </div>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={winner === "D"
                            ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                            : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                        >
                          {winner}+{margin}
                        </span>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                        <div style={{ width: `${res.demPct}%`, background: "#1b408c" }} />
                        <div style={{ width: `${res.repPct}%`, background: "#be1c29" }} />
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span style={{ color: "var(--party-dem)" }}>{res.demPct.toFixed(1)}%</span>
                        <span style={{ color: "var(--party-rep)" }}>{res.repPct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-0.5 flex justify-between gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                        {res.demVotes != null ? (
                          <span className="truncate">{res.demVotes.toLocaleString()} votes</span>
                        ) : (
                          <span className="italic">TBD votes</span>
                        )}
                        {res.repVotes != null ? (
                          <span className="truncate text-right">{res.repVotes.toLocaleString()} votes</span>
                        ) : (
                          <span className="italic text-right">TBD votes</span>
                        )}
                      </div>
                    </div>
                  );
                }) : [2024, 2020, 2016].map((year) => (
                  <div
                    key={`pres-${year}`}
                    className="rounded-lg p-2.5"
                    style={{ background: "var(--app-bg)" }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{year}</span>
                        <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>Presidential</span>
                      </div>
                      <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                    </div>
                    <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Election data TBD</div>
                  </div>
                ))}

                {senatePastResults.length > 0 && (
                  <div className="h-px my-1" style={{ background: "var(--app-border)" }} />
                )}
                {senatePastResults.map((res, idx) => {
                  const winner = res.demPct > res.repPct ? "D" : "R";
                  const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                  return (
                    <div
                      key={`senate-${res.year}-${res.seat}-${res.electionType ?? "regular"}-${idx}`}
                      className="rounded-lg p-2.5"
                      style={{ background: "var(--app-bg)" }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                          <a
                            href={`/senate/${(res.seat === 2 ? `${state.abbr}2` : state.abbr).toLowerCase()}`}
                            className="truncate text-sm font-semibold transition-colors hover:underline"
                            style={{ color: "var(--app-text-muted)" }}
                          >
                            {isSpecialElection(res.electionType) ? "Senate Special" : "Senate"}
                          </a>
                        </div>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={winner === "D"
                            ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                            : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                        >
                          {winner}+{margin}
                        </span>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                        <div style={{ width: `${res.demPct}%`, background: "#1b408c" }} />
                        <div style={{ width: `${res.repPct}%`, background: "#be1c29" }} />
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span style={{ color: "var(--party-dem)" }}>{res.demPct.toFixed(1)}%</span>
                        <span style={{ color: "var(--party-rep)" }}>{res.repPct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-0.5 flex justify-between gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                        {res.demVotes != null ? (
                          <span className="truncate">{res.demVotes.toLocaleString()} votes</span>
                        ) : (
                          <span className="italic">TBD votes</span>
                        )}
                        {res.repVotes != null ? (
                          <span className="truncate text-right">{res.repVotes.toLocaleString()} votes</span>
                        ) : (
                          <span className="italic text-right">TBD votes</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {govPastResults.length > 0 && govPageId && (
                  <>
                    <div className="h-px my-1" style={{ background: "var(--app-border)" }} />
                    {govPastResults.map((res) => {
                      const winner = res.demPct > res.repPct ? "D" : "R";
                      const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                      return (
                        <div
                          key={`gov-${res.year}`}
                          className="rounded-lg p-2.5"
                          style={{ background: "var(--app-bg)" }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                              <a
                                href={`/governor/${govPageId}`}
                                className="truncate text-sm font-semibold transition-colors hover:underline"
                                style={{ color: "var(--app-text-muted)" }}
                              >
                                Governor
                              </a>
                            </div>
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={winner === "D"
                                ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                                : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                            >
                              {winner}+{margin}
                            </span>
                          </div>
                          <div className="flex h-2.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                            <div style={{ width: `${res.demPct}%`, background: "#1b408c" }} />
                            <div style={{ width: `${res.repPct}%`, background: "#be1c29" }} />
                          </div>
                          <div className="flex justify-between text-xs font-semibold">
                            <span style={{ color: "var(--party-dem)" }}>{res.demPct.toFixed(1)}%</span>
                            <span style={{ color: "var(--party-rep)" }}>{res.repPct.toFixed(1)}%</span>
                          </div>
                          <div className="mt-0.5 flex justify-between gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                            {res.demVotes != null ? (
                              <span className="truncate">{res.demVotes.toLocaleString()} votes</span>
                            ) : (
                              <span className="italic">TBD votes</span>
                            )}
                            {res.repVotes != null ? (
                              <span className="truncate text-right">{res.repVotes.toLocaleString()} votes</span>
                            ) : (
                              <span className="italic text-right">TBD votes</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </section>

          <div className="order-4 md:order-5">
            <StateVoteHistoryChart results={voteHistoryResults} />
          </div>
        </StateMapSection>
      </main>
    </div>
  );
}
