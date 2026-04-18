import { governorData, governorNoElection, NoElectionEntry, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import { candidatePhotos } from "@/lib/candidatePhotos";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import { AboutRaceCard, CandidatesSection, CurrentIncumbentCard, ElectionStatusCard, MarginAndWinProbabilityCard, PastElectionResultsSection } from "@/components/RaceDetailSections";

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

      <main className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Link href={`/states/${stateSlug(entry.state)}?from=${encodeURIComponent(from)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{entry.state}</Link>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
              No Election in {electionYear}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 mb-4">
          <div className="md:col-span-2 [&>section]:mb-0 [&>section]:h-full">
            <CurrentIncumbentCard
              incumbentName={entry.incumbent}
              party={entry.party}
              items={[
                { label: "State", value: entry.state },
                { label: "Party", value: partyLabel },
                { label: "Next Election", value: String(entry.nextElection) },
                { label: "Term Started", value: termStarted },
              ]}
              description={entry.raceDesc ?? `[Placeholder — overview of the ${entry.state} governorship, its powers, the incumbent's background, key issues, and political context to be filled in.]`}
            />
          </div>

          <div className="md:col-span-1 [&>section]:mb-0 [&>section]:h-full">
            <ElectionStatusCard
              message={`This governorship is not on the ballot in ${electionYear}. The next election is scheduled for ${entry.nextElection}. Incumbent and biographical information to be filled in.`}
            />
          </div>
        </div>

        <PastElectionResultsSection
          results={entry.pastResults}
          fallbackYears={[entry.nextElection - 4, entry.nextElection - 8]}
          showElectionType
        />
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

      <main className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        {/* Title block */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Link href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/governor/${id}`)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>{electionYear} Gubernatorial Race</p>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <div className="[&>section]:mb-0 [&>section]:h-full">
            <AboutRaceCard
              title="About this Race"
              description={race.raceDesc ?? "[Placeholder — overview of this gubernatorial race, the powers of the office, key issues, and political context to be filled in.]"}
              items={[
                { label: "State", value: race.state },
                { label: "Term Length", value: "4 Years" },
                { label: "Incumbent", value: currentGovernorName },
                { label: "Party", value: currentGovernorParty ? (currentGovernorParty === "D" ? "Democrat" : currentGovernorParty === "R" ? "Republican" : "Independent") : "TBD" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>div>section]:mb-0 [&>div>section]:h-full">
            <div>
              <CandidatesSection
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

            <div>
              <MarginAndWinProbabilityCard
                margin={race.margin}
                demPct={demPct}
                repPct={repPct}
                rcpDem={race.rcpDem}
                rcpRep={race.rcpRep}
                polyDem={race.polyDem}
                polyRep={race.polyRep}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <PastElectionResultsSection results={race.pastResults} fallbackYears={[2022, 2018, 2014]} showElectionType layoutClassName="" />
        </div>
      </main>
    </div>
  );
}
