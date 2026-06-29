import { governorData, governorNoElection, NoElectionEntry, electionYear, type PastResult } from "@/data/forecastData";
import { GOVERNOR_MANUAL_MARGINS } from "@/data/manualOverrides";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { getNationalMargin } from "@/lib/statewideMargins";
import { notFound } from "next/navigation";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { AboutRaceCard, CandidatesAndPollsCard, CurrentIncumbentCard, ElectionStatusCard, ForecastCalculationCard, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import StateCountyMap from "@/components/StateCountyMap";
import SeatVoteHistoryChart from "@/components/SeatVoteHistoryChart";
import { calculateStateTpl, effectiveGenericBallot, marginToProbability, computeIncumbentPts } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";

function enrichGovResults(pastResults: PastResult[] | undefined): DetailPastResult[] {
  if (!pastResults?.length) return [];
  const sorted = [...pastResults].sort((a, b) => a.year - b.year);
  return sorted.map((res, i) => {
    const nationalMargin = getNationalMargin("Governor", res.year);
    const swing = i > 0
      ? parseFloat(((sorted[i - 1].demPct - sorted[i - 1].repPct) - (res.demPct - res.repPct)).toFixed(1))
      : null;
    return { ...res, nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null, swing };
  }).reverse();
}

function stateSlug(name: string) { return name.toLowerCase().replace(/\s+/g, "-"); }

export async function generateStaticParams() {
  return [
    ...governorData.map((race) => ({ id: race.id.toLowerCase() })),
    ...governorNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = governorData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (race) return {
    title: `${race.name} Governor Race — ${electionYear} Forecast`,
    description: `${electionYear} Governor forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Governor — No Election in ${electionYear}` };
  return { title: "Race Not Found" };
}

function NoElectionPage({ entry, from }: { entry: NoElectionEntry; from: string }) {
  const partyLabel = entry.party === "D" ? "Democrat" : entry.party === "R" ? "Republican" : "Independent";
  const termStarted = entry.termLength ? String(entry.nextElection - entry.termLength) : "TBD";
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/states/${stateSlug(entry.state)}?from=${encodeURIComponent(from)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{entry.state}</a>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
              No Election in {electionYear}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-3">
            <div className="order-1">
              <CurrentIncumbentCard
                incumbentName={entry.incumbent}
                party={entry.party}
              />
            </div>
            <div className="order-2">
              <AboutRaceCard
                title="About this Seat"
                description={entry.raceDesc ?? `[Placeholder — overview of the ${entry.state} governorship, its powers, the incumbent's background, key issues, and political context to be filled in.]`}
                items={[
                  { label: "Party", value: partyLabel },
                  { label: "Elected", value: termStarted },
                  { label: "Next Election", value: String(entry.nextElection) },
                ]}
              />
            </div>
            {entry.pastResults && entry.pastResults.length > 0 && (
              <div className="order-4">
                <SeatVoteHistoryChart results={enrichGovResults(entry.pastResults)} electionType="Governor" />
              </div>
            )}
          </div>

          <div className="contents lg:grid lg:grid-cols-1 lg:gap-3">
            <div className="order-3">
              <ElectionStatusCard
                message={`This governorship is not on the ballot in ${electionYear}. The next election is scheduled for ${entry.nextElection}. Incumbent and biographical information to be filled in.`}
              />
            </div>

            <PastElectionResultsSection
              results={enrichGovResults(entry.pastResults)}
              fallbackYears={[entry.nextElection - 4, entry.nextElection - 8]}
              showElectionType
              layoutClassName="order-5 lg:max-h-[34rem]"
              density="compact"
              scrollable
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default async function GovernorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from: fromParam } = await searchParams;

  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return <NoElectionPage entry={noEl} from={`/governor/${id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`} />;

  const race = governorData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const stateTpl = calculateStateTpl(id.toUpperCase(), race.name);
  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = (incumbent?.party === "D" || incumbent?.party === "R") ? incumbent.party : null;
  const standardIncumbentPts = computeIncumbentPts("G", incumbentParty);
  const incumbentPts = GOVERNOR_MANUAL_MARGINS[id.toUpperCase()] ?? standardIncumbentPts;
  const gb = effectiveGenericBallot(id.toUpperCase());
  const projectedMargin = stateTpl + gb + incumbentPts;
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentGovernorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentGovernorParty = incumbent?.party ?? race.seatParty ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>
        {/* Title block */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/governor/${id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</a>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {forecastRating}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{electionYear} Gubernatorial Race</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-3">
            <div className="order-1 overflow-hidden rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
              <StateCountyMap stateAbbr={id.toUpperCase()} stateName={race.name} height={300} />
            </div>
            <div className="order-5 lg:order-2">
              <AboutRaceCard
                title="About this Race"
                description={race.raceDesc ?? "[Placeholder — overview of this gubernatorial race, the powers of the office, key issues, and political context to be filled in.]"}
                items={[
                  { label: "Term Length", value: "4 Years" },
                  { label: "Incumbent", value: currentGovernorName },
                  { label: "Party", value: currentGovernorParty ? (currentGovernorParty === "D" ? "Democrat" : currentGovernorParty === "R" ? "Republican" : "Independent") : "TBD" },
                ]}
              />
            </div>
            {race.pastResults && race.pastResults.length > 0 && (
              <div className="order-7">
                <SeatVoteHistoryChart results={enrichGovResults(race.pastResults)} electionType="Governor" />
              </div>
            )}
          </div>

          <div className="contents lg:grid lg:grid-cols-8 lg:gap-3">
            <div className="order-3 lg:col-span-8">
              <CandidatesAndPollsCard
                candidates={race.candidates
                  ? [
                      { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                      { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                    ]
                  : [
                      { name: "Democrat", party: "D", pct: demVoteShare, placeholder: true },
                      { name: "Republican", party: "R", pct: repVoteShare, placeholder: true },
                    ]}
                demPct={demPct} repPct={repPct}
                rcpDem={race.rcpDem} rcpRep={race.rcpRep}
                polyDem={race.polyDem} polyRep={race.polyRep}
                kalshiDem={race.kalshiDem} kalshiRep={race.kalshiRep}
              />
            </div>

            <div className="order-4 lg:col-span-8">
              <ForecastCalculationCard
                tpl={stateTpl}
                genericBallot={gb}
                tplLabel="State TPL"
                tplHref={`/?tab=state&modelState=${encodeURIComponent(id.toUpperCase())}`}
                incumbentPts={incumbentPts}
                fundraisingPts={null}
                candidatePts={null}
                pollingAvg={null}
              />
            </div>

            <PastElectionResultsSection
              results={enrichGovResults(race.pastResults)}
              fallbackYears={[2022, 2018, 2014]}
              showElectionType
              layoutClassName="order-6 lg:col-span-8 lg:max-h-[34rem]"
              density="compact"
              scrollable
            />
          </div>
        </div>
      </main>
    </div>
  );
}
