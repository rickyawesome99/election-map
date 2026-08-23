import { statesData } from "@/data/statesData";
import { senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, houseData, housePastResults, senateCurrent, presPastResults, houseDelegationHistory, stateLegData, PresResult, RaceForecast, NoElectionEntry, electionYear } from "@/data/forecastData";
import { computeProjectedMargin, calculateStateTpl } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import StateMapSection from "@/components/StateMapSection";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";
import StatewideVoteHistoryPanel, { type StatewideHistoryEntry } from "@/components/StatewideVoteHistoryPanel";


const GENERAL_ELECTION = "November 3, 2026";

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
      className="block py-5 min-w-0"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
            {label}
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: partyColor }}>
              {entry.incumbent}
            </span>
            <span className="text-xs font-semibold shrink-0" style={{ color: "var(--app-text-muted)" }}>({partyLabel})</span>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
          <div className="italic">No election</div>
          <div className="mt-0.5">Next: {entry.nextElection}</div>
        </div>
      </div>
    </a>
  );
}

function ElectionCard({ race, href, label }: { race: RaceForecast; href: string; label: string }) {
  const dem = race.candidates?.dem;
  const rep = race.candidates?.rep;
  const isD = race.margin <= 0;
  return (
    <a
      href={href}
      className="block py-5 min-w-0"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
            {label}
          </div>
          {dem && rep ? (
            <div className="flex flex-col gap-0.5">
              <span className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--party-dem)" }}>
                {dem.name}
              </span>
              <span className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--party-rep)" }}>
                {rep.name}
              </span>
            </div>
          ) : (
            <div className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular-nums font-extrabold" style={{ fontSize: "1.75rem", lineHeight: 1, color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
            {isD ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
          </div>
          <div className="text-xs font-bold mt-1.5" style={{ color: "var(--app-text-muted)" }}>
            {marginToRating(race.margin)}
          </div>
        </div>
      </div>
    </a>
  );
}

function HouseDistrictRow({ race }: { race: RaceForecast }) {
  const parts = race.name.split("-");
  const distNum = parts[1];
  const isAL = distNum === "AL";
  const isD = race.margin <= 0;
  const { bg, text } = getRatingColors(marginToRating(race.margin));
  return (
    <a
      href={`/house/${race.name.toLowerCase()}`}
      className="flex items-center justify-between gap-3 py-3 min-w-0"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
        {isAL ? "At-Large" : `District ${distNum}`}
      </span>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold tabular-nums" style={{ color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
          {isD ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
        </span>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full text-center shrink-0 w-[4.1rem]"
          style={{ background: bg, color: text }}
        >
          {marginToRating(race.margin)}
        </span>
      </div>
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
  const totalRaces2026 = houseRaces.length
    + (senateSeat1Race ? 1 : 0)
    + (senateSeat2Race ? 1 : 0)
    + (governorRace ? 1 : 0);

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

  const statewideHistoryEntries: StatewideHistoryEntry[] = [
    ...presRows.map((res, i) => ({
      key: `pres-${res.year}-${res.stateAbbr}-${i}`,
      group: "president" as const,
      year: res.year,
      label: presRaceLabel(res.stateAbbr),
      demPct: res.demPct,
      repPct: res.repPct,
      demVotes: res.demVotes,
      repVotes: res.repVotes,
    })),
    ...senatePastResults.map((res, idx) => ({
      key: `senate-${res.year}-${res.seat}-${res.electionType ?? "regular"}-${idx}`,
      group: "senate" as const,
      year: res.year,
      label: isSpecialElection(res.electionType) ? "Senate Special" : "Senate",
      href: `/senate/${(res.seat === 2 ? `${state.abbr}2` : state.abbr).toLowerCase()}`,
      demPct: res.demPct,
      repPct: res.repPct,
      demVotes: res.demVotes,
      repVotes: res.repVotes,
    })),
    ...(govPageId ? govPastResults.map((res) => ({
      key: `gov-${res.year}`,
      group: "governor" as const,
      year: res.year,
      label: "Governor",
      href: `/governor/${govPageId}`,
      demPct: res.demPct,
      repPct: res.repPct,
      demVotes: res.demVotes,
      repVotes: res.repVotes,
    })) : []),
  ];

  // Hero headline stat — state TPL margin, drives the hero's gradient wash and headline number
  const stateTpl = calculateStateTpl(state.abbr, state.name);
  const heroMargin = Number.isFinite(stateTpl) ? stateTpl : null;
  const heroIsD = heroMargin != null && heroMargin <= 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: heroMargin != null
            ? `linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
            : "var(--app-bg)",
          minHeight: "300px",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-8 sm:pb-10">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                >
                  {state.abbr}
                </span>
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {state.name}
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {totalRaces2026} race{totalRaces2026 !== 1 ? "s" : ""} on ballot in {electionYear} · General {GENERAL_ELECTION}
              </div>
            </div>

            {heroMargin != null && (
              <div className="shrink-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                  State TPL
                </div>
                <div
                  className="tabular-nums"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: heroIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                >
                  {heroIsD ? "D" : "R"}+{Math.abs(heroMargin).toFixed(1)}
                </div>
              </div>
            )}
          </div>

          {/* Stat row */}
          <div className="mt-8 pt-5 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-2xl font-extrabold tabular-nums">
                <span style={{ color: "var(--party-dem)" }}>{houseDemCurrent}D</span>
                <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>–</span>
                <span style={{ color: "var(--party-rep)" }}>{houseRepCurrent}R</span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                U.S. House
              </div>
            </div>

            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-2xl font-extrabold tabular-nums flex items-center gap-1.5">
                {senateInds > 0 ? (
                  <>
                    {senateDems > 0 && <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>}
                    {senateReps > 0 && <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>}
                    <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>{senateDems > 0 || senateReps > 0 ? "·" : ""}</span>
                    <span style={{ color: "var(--app-text-muted)" }}>{senateInds}I</span>
                  </>
                ) : senateReps === 0 ? (
                  <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>
                ) : senateDems === 0 ? (
                  <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>
                ) : (
                  <>
                    <span style={{ color: "var(--party-dem)" }}>{senateDems}D</span>
                    <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>–</span>
                    <span style={{ color: "var(--party-rep)" }}>{senateReps}R</span>
                  </>
                )}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Senate
              </div>
            </div>

            <div>
              {govParty ? (
                <div
                  className="text-2xl font-extrabold"
                  style={{ color: govParty === "D" ? "var(--party-dem)" : govParty === "R" ? "var(--party-rep)" : "var(--app-text-primary)" }}
                >
                  {govParty === "D" ? "Dem" : govParty === "R" ? "Rep" : "Ind"}
                </div>
              ) : (
                <div className="text-2xl font-extrabold" style={{ color: "var(--app-text-very-muted)" }}>—</div>
              )}
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Governor
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 pt-4 pb-4 sm:px-6">

        {/* Overview + Map */}
        <StateMapSection
          houseRaces={projectedHouseRaces}
          housePastResults={stateHousePastResults}
          stateAbbr={state.abbr}
          stateName={state.name}
          stateFips={stateFips}
          overview={(
            <>
              {(stateDelegationHistory.length > 0 || stateLegEntries.length > 0 || stateLegSenateEntries.length > 0) && (
                <div className="order-4 md:order-6">
                  <StateLegCompositionBox
                    federalEntries={stateDelegationHistory}
                    houseEntries={stateLegEntries}
                    senateEntries={stateLegSenateEntries}
                    isUnicameral={state.abbr === "NE"}
                  />
                </div>
              )}
            </>
          )}
        >
        {/* Federal Offices */}
        <section className="order-3">
          <div
            className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1"
            style={{ borderBottom: "2px solid var(--app-text-primary)" }}
          >
            <h2
              className="text-[11px] uppercase tracking-wider font-bold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Federal Offices
            </h2>
            <span className="text-xs leading-relaxed sm:leading-normal" style={{ color: "var(--app-text-very-muted)" }}>
              {totalRaces2026} race{totalRaces2026 !== 1 ? "s" : ""} on ballot in {electionYear} · General: {GENERAL_ELECTION}
            </span>
          </div>

          <div className="max-h-[42rem] overflow-y-auto pr-1">
          <div className="flex flex-col">
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
              <div className="pt-6">
                <div
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 pb-3 gap-1.5"
                  style={{ borderBottom: "2px solid var(--app-text-primary)" }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="text-[11px] uppercase tracking-wider font-bold"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      U.S. House · {houseRaces.length} District{houseRaces.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-1 text-xs font-bold tabular-nums">
                      <span style={{ color: "var(--party-dem)" }}>{houseDemProj}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}>·</span>
                      <span style={{ color: "var(--party-rep)" }}>{houseRepProj}R</span>
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                    {GENERAL_ELECTION}
                  </span>
                </div>
                <div className="flex flex-col">
                  {projectedHouseRaces.map((race) => (
                    <HouseDistrictRow key={race.id} race={race} />
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </section>

          <div className="order-6 md:order-5">
            <StatewideVoteHistoryPanel entries={statewideHistoryEntries} chartResults={voteHistoryResults} />
          </div>
        </StateMapSection>
      </main>
    </div>
  );
}
