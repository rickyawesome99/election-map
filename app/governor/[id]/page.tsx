import { governorData, governorNoElection, NoElectionEntry, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import { candidatePhotos } from "@/lib/candidatePhotos";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import { AboutRaceCard, CandidatesSection, CurrentIncumbentCard, ElectionStatusCard, MarginAndWinProbabilityCard, PastElectionResultsSection } from "@/components/RaceDetailSections";
import StateCountyMap from "@/components/StateCountyMap";

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
      <AppHeader back={<BackButton />} />

      <main className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/states/${stateSlug(entry.state)}?from=${encodeURIComponent(from)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{entry.state}</Link>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
              No Election in {electionYear}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-start">
          <div className="flex flex-col gap-3">
            <CurrentIncumbentCard
              incumbentName={entry.incumbent}
              party={entry.party}
            />
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

          <div className="grid grid-cols-1 gap-3">
            <ElectionStatusCard
              message={`This governorship is not on the ballot in ${electionYear}. The next election is scheduled for ${entry.nextElection}. Incumbent and biographical information to be filled in.`}
            />

            <PastElectionResultsSection
              results={entry.pastResults}
              fallbackYears={[entry.nextElection - 4, entry.nextElection - 8]}
              showElectionType
              layoutClassName="lg:max-h-[34rem]"
              density="compact"
              scrollable
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default async function GovernorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return <NoElectionPage entry={noEl} from={`/governor/${id}`} />;

  const race = governorData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const { bg, text } = getRatingColors(race.rating);
  const demVoteShare = parseFloat(((100 + race.margin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 - race.margin) / 2).toFixed(1));

  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const currentGovernorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentGovernorParty = incumbent?.party ?? race.seatParty ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        {/* Title block */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/governor/${id}`)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{electionYear} Gubernatorial Race</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-start">
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
              <StateCountyMap stateAbbr={id.toUpperCase()} stateName={race.name} />
            </div>
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

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-8">
            <div className="lg:col-span-5 [&>section]:h-full">
              <CandidatesSection
                density="compact"
                candidates={race.candidates
                  ? [
                      {
                        name: race.candidates.dem.name,
                        party: race.candidates.dem.party,
                        incumbent: race.candidates.dem.incumbent,
                        photo: demPhoto,
                        pct: demVoteShare,
                      },
                      {
                        name: race.candidates.rep.name,
                        party: race.candidates.rep.party,
                        incumbent: race.candidates.rep.incumbent,
                        photo: repPhoto,
                        pct: repVoteShare,
                      },
                    ]
                  : [
                      { name: "Democrat", party: "D", pct: demVoteShare, placeholder: true },
                      { name: "Republican", party: "R", pct: repVoteShare, placeholder: true },
                    ]}
                />
            </div>

            <div className="lg:col-span-3 [&>section]:h-full">
              <MarginAndWinProbabilityCard
                density="compact"
                margin={race.margin}
                demPct={demPct}
                repPct={repPct}
                rcpDem={race.rcpDem}
                rcpRep={race.rcpRep}
                polyDem={race.polyDem}
                polyRep={race.polyRep}
                kalshiDem={race.kalshiDem}
                kalshiRep={race.kalshiRep}
              />
            </div>

            <PastElectionResultsSection
              results={race.pastResults}
              fallbackYears={[2022, 2018, 2014]}
              showElectionType
              layoutClassName="lg:col-span-8 lg:max-h-[34rem]"
              density="compact"
              scrollable
            />
          </div>
        </div>
      </main>
    </div>
  );
}
