import { senateData, senateNoElection, senateHoldovers, electionYear, type PastResult } from "@/data/forecastData";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { getNationalMargin } from "@/lib/statewideMargins";
import { notFound } from "next/navigation";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { AboutRaceCard, CandidatesAndPollsCard, CurrentIncumbentCard, ElectionStatusCard, ForecastCalculationCard, MarginAndWinProbabilityCard, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import StateCountyMap from "@/components/StateCountyMap";
import SeatVoteHistoryChart from "@/components/SeatVoteHistoryChart";
import VoteHistoryTabbedSection from "@/components/VoteHistoryTabbedSection";
import { calculateStateTpl, effectiveGenericBallot, marginToProbability, computeIncumbentPts, computeRcpMargin, computeProjectedMargin } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";

function enrichSenateResults(pastResults: PastResult[] | undefined): DetailPastResult[] {
  if (!pastResults?.length) return [];
  const sorted = [...pastResults].sort((a, b) => a.year - b.year);
  return sorted.map((res, i) => {
    const nationalMargin = getNationalMargin("Senate", res.year);
    const swing = i > 0
      ? parseFloat(((sorted[i - 1].demPct - sorted[i - 1].repPct) - (res.demPct - res.repPct)).toFixed(1))
      : null;
    return { ...res, nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null, swing };
  }).reverse();
}

function stateSlug(name: string) { return name.toLowerCase().replace(/\s+/g, "-"); }
function isSpecialElection(electionType?: string) {
  return (electionType ?? "").toLowerCase().includes("special");
}

function SpecialBadge() {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
    >
      Special
    </span>
  );
}

export async function generateStaticParams() {
  return [
    ...senateData.map((race) => ({ id: race.id.toLowerCase() })),
    ...senateNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
    ...senateHoldovers.map((e) => ({ id: `${e.abbr.toLowerCase()}-2` })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (race) return {
    title: `${race.name} Senate Race — ${electionYear} Forecast`,
    description: `${electionYear} Senate forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Senate — No Election in ${electionYear}` };
  const abbr = id.replace(/-2$/, "").toUpperCase();
  const holdover = senateHoldovers.find((e) => e.abbr === abbr);
  if (holdover) return { title: `${holdover.state} Senate (Seat 2) — Incumbent Info` };
  return { title: "Race Not Found" };
}

// ── Shared "no election this cycle" page ─────────────────────────────────────

function NoElectionPage({
  state,
  incumbent,
  party,
  nextElection,
  termLength,
  seatLabel,
  from,
  raceDesc,
  pastResults,
}: {
  state: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  seatLabel: string;
  from: string;
  raceDesc?: string;
  pastResults?: DetailPastResult[];
}) {
  const partyLabel = party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
  const termYears = termLength ?? 6;
  const termStarted = String(nextElection - termYears);
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        {/* Title + banner */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/states/${stateSlug(state)}?from=${encodeURIComponent(from)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{state}</a>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              No Election in {electionYear}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{seatLabel}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-3">
            <div className="order-1">
              <CurrentIncumbentCard
                incumbentName={incumbent}
                party={party}
              />
            </div>
            <div className="order-2">
              <AboutRaceCard
                title="About this Seat"
                description={raceDesc ?? "[Placeholder — overview of this seat, its history, the incumbent's background, key issues, and political context to be filled in.]"}
                items={[
                  { label: "Party", value: partyLabel },
                  { label: "Elected", value: termStarted },
                  { label: "Next Election", value: String(nextElection) },
                ]}
              />
            </div>
            <VoteHistoryTabbedSection
              className="order-3"
              defaultTabKey="race-results"
              height="430px"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={pastResults}
                      fallbackYears={[nextElection - termYears, nextElection - termYears * 2]}
                      showElectionType
                      showSpecialBadgeForSpecialElections
                      density="compact"
                      bare
                    />
                  ),
                },
                ...((pastResults?.length ?? 0) > 0 ? [{
                  key: "chart",
                  label: "Graph",
                  content: <SeatVoteHistoryChart results={pastResults ?? []} electionType="Senate" bare />,
                }] : []),
              ]}
            />
          </div>

          <div className="contents lg:grid lg:grid-cols-1 lg:gap-3">
            <div className="order-3">
              <ElectionStatusCard
                message={`This seat is not on the ballot in November ${electionYear}. The next election for this seat is scheduled for ${nextElection}. Incumbent and biographical information to be filled in.`}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function SenatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from: fromParam } = await searchParams;
  const abbr = id.replace(/-2$/, "").toUpperCase();
  const isSeat2Url = id.toLowerCase().endsWith("-2");

  // Case 1: 2026 active race — checked FIRST to avoid collision with holdover entries
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (race) {
    // fall through to race rendering below
  } else if (isSeat2Url) {
    // Case 2: holdover second senator (e.g. /senate/ma-2) — seat 2 not up in 2026
    const holdover = senateHoldovers.find((e) => e.abbr === abbr);
    if (holdover) {
      return (
        <NoElectionPage
          state={holdover.state}
          incumbent={holdover.incumbent}
          party={holdover.party}
          nextElection={holdover.nextElection}
          termLength={holdover.termLength}
          seatLabel={`U.S. Senate · Seat 2 · Not Up in ${electionYear}`}
          from={`/senate/${id}`}
          raceDesc={holdover.raceDesc}
          pastResults={enrichSenateResults(holdover.pastResults)}
        />
      );
    }
  } else {
    // Case 3: seat 1 not up in 2026
    const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
    if (noEl) {
      return (
        <NoElectionPage
          state={noEl.state}
          incumbent={noEl.incumbent}
          party={noEl.party}
          nextElection={noEl.nextElection}
          termLength={noEl.termLength}
          seatLabel={`U.S. Senate · No Election in ${electionYear}`}
          from={`/senate/${id}`}
          raceDesc={noEl.raceDesc}
          pastResults={enrichSenateResults(noEl.pastResults)}
        />
      );
    }
  }

  if (!race) notFound();

  const stateTpl = calculateStateTpl(abbr, race.name);
  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = (incumbent?.party === "D" || incumbent?.party === "R") ? incumbent.party : null;
  const incumbentPts = computeIncumbentPts("S", incumbentParty);
  const gb = effectiveGenericBallot(abbr);
  const rcpMargin = computeRcpMargin(race.rcpDem, race.rcpRep);
  const projectedMargin = computeProjectedMargin(race);
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentSenatorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentSenatorParty = incumbent?.party ?? race.seatParty ?? null;
  const enrichedPastResults = enrichSenateResults(race.pastResults);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>
        {/* Title block */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/senate/${id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</a>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {forecastRating}
            </span>
            {isSpecialElection(race.electionType) && <SpecialBadge />}
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            {electionYear} {race.electionType ?? "Regular"} U.S. Senate Race{race.seatClass ? ` · Class ${race.seatClass}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-3">
            <div className="order-1 overflow-hidden rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
              <StateCountyMap
                stateAbbr={abbr}
                stateName={race.name}
                height={300}
                fromPath={`/senate/${id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`}
              />
            </div>
            <div className="order-5 lg:order-2">
              <AboutRaceCard
                title="About this Race"
                description={race.raceDesc ?? "[Placeholder — overview of this Senate seat, its history, key issues, and political context to be filled in.]"}
                items={[
                  { label: "Incumbent", value: currentSenatorName },
                  { label: "Party", value: currentSenatorParty ? (currentSenatorParty === "D" ? "Democrat" : currentSenatorParty === "R" ? "Republican" : "Independent") : "TBD" },
                  { label: "Seat Class", value: race.seatClass ? `Class ${race.seatClass}` : "TBD" },
                ]}
              />
            </div>
            {race.pastResults && race.pastResults.length > 0 && (
              <VoteHistoryTabbedSection
                className="order-6 lg:order-3"
                defaultTabKey="race-results"
                height="430px"
                tabs={[
                  {
                    key: "race-results",
                    label: "Race Results",
                    content: (
                      <PastElectionResultsSection
                        results={enrichedPastResults}
                        fallbackYears={[]}
                        showElectionType
                        density="compact"
                        bare
                      />
                    ),
                  },
                  ...(enrichedPastResults.length > 0 ? [{
                    key: "chart",
                    label: "Graph",
                    content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Senate" bare />,
                  }] : []),
                ]}
              />
            )}
          </div>

          <div className="contents lg:grid lg:grid-cols-8 lg:gap-3">
            {race.candidates ? (
              <div className="order-3 lg:col-span-8">
                <CandidatesAndPollsCard
                  candidates={[
                    { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                    { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                  ]}
                  demPct={demPct} repPct={repPct}
                  rcpDem={race.rcpDem} rcpRep={race.rcpRep}
                  polyDem={race.polyDem} polyRep={race.polyRep}
                  kalshiDem={race.kalshiDem} kalshiRep={race.kalshiRep}
                />
              </div>
            ) : (
              <div className="order-3 lg:col-span-8 [&>section]:h-full">
                <MarginAndWinProbabilityCard density="compact" margin={projectedMargin} demPct={demPct} repPct={repPct} rcpDem={race.rcpDem} rcpRep={race.rcpRep} polyDem={race.polyDem} polyRep={race.polyRep} kalshiDem={race.kalshiDem} kalshiRep={race.kalshiRep} />
              </div>
            )}

            <div className="order-4 lg:col-span-8">
              <ForecastCalculationCard
                tpl={stateTpl}
                genericBallot={gb}
                tplLabel="State TPL"
                tplHref={`/?tab=state&modelState=${encodeURIComponent(abbr)}`}
                incumbentPts={incumbentPts}
                fundraisingPts={null}
                candidatePts={null}
                pollingAvg={rcpMargin}
                projectedMargin={projectedMargin}
              />
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
