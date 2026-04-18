import { houseData, houseDistrictInfo, houseStatewideResults, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import { AboutRaceCard, CandidatesSection, HouseOnlyDistrictBoundariesSection, HouseOnlyRecentStatewideResultsSection, MarginAndWinProbabilityCard, PastElectionResultsSection } from "@/components/RaceDetailSections";

function inferCurrentHouseSeatFromPastResults(race: { pastResults?: { demIncumbent?: boolean; repIncumbent?: boolean; demCandidate?: string; repCandidate?: string }[] }) {
  for (const res of race.pastResults ?? []) {
    if (res.demIncumbent && res.demCandidate) return { name: res.demCandidate, party: "D" as const };
    if (res.repIncumbent && res.repCandidate) return { name: res.repCandidate, party: "R" as const };
  }
  return null;
}

export async function generateStaticParams() {
  return houseData.map((race) => ({ id: race.id.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = houseData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) return { title: "Race Not Found" };
  return {
    title: `${race.name} House Race — ${electionYear} Forecast`,
    description: `${electionYear} House forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
}

export default async function HousePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from: fromParam } = await searchParams;
  const race = houseData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const { bg, text } = getRatingColors(race.rating);
  const demVoteShare = parseFloat(((100 + race.margin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 - race.margin) / 2).toFixed(1));

  // Parse district label for display (e.g. "CA-12" → state + district number)
  const [stateAbbr, districtNum] = race.name.split("-");
  const districtLabel = districtNum === "AL"
    ? `${race.state} At-Large`
    : `${race.state}'s ${districtNum}${getOrdinalSuffix(parseInt(districtNum))} Congressional District`;
  const incumbentCandidate = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const inferredSeat = inferCurrentHouseSeatFromPastResults(race);
  const currentRepName = incumbentCandidate?.name ?? race.seatHolder ?? inferredSeat?.name ?? "TBD";
  const currentRepParty = incumbentCandidate?.party ?? race.seatParty ?? inferredSeat?.party ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        {/* Title block */}
        <div className="mb-4 flex flex-col gap-2 sm:mb-5">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Link href={`/states/${race.state.toLowerCase().replace(/\s+/g, "-")}?from=${encodeURIComponent(`/house/${race.id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-3xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>{electionYear} U.S. House Race · {districtLabel}</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 mb-4">
          <section
            className="order-1 rounded-xl overflow-hidden h-full md:order-2 md:col-span-1"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <DistrictMiniMap raceId={race.id} stateAbbr={stateAbbr} margin={race.margin} />
          </section>

          <div className="order-2 md:order-1 md:col-span-2 grid grid-cols-1 gap-4">
            <div className="[&>section]:mb-0 [&>section]:h-full">
              <AboutRaceCard
                title="About this District"
                description={`[Placeholder — overview of ${districtLabel}, including its geography, key communities, and political history to be filled in.]`}
                items={[
                  { label: "District", value: districtNum === "AL" ? "At-Large" : `${stateAbbr}-${districtNum}` },
                  { label: "Incumbent", value: currentRepName },
                  { label: "Party", value: currentRepParty ? (currentRepParty === "D" ? "Democrat" : currentRepParty === "R" ? "Republican" : "Independent") : "TBD" },
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
                          pct: demVoteShare,
                        },
                        {
                          name: race.candidates.rep.name,
                          party: race.candidates.rep.party,
                          incumbent: race.candidates.rep.incumbent,
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
                <MarginAndWinProbabilityCard margin={race.margin} demPct={demPct} repPct={repPct} rcpDem={race.rcpDem} rcpRep={race.rcpRep} polyDem={race.polyDem} polyRep={race.polyRep} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <PastElectionResultsSection
            results={race.pastResults}
            fallbackYears={[2024, 2022, 2020]}
            showElectionType={false}
            layoutClassName="xl:col-span-7"
          />

          <div className="space-y-4 xl:col-span-5">
            <HouseOnlyRecentStatewideResultsSection results={houseStatewideResults[race.id]} />
            <HouseOnlyDistrictBoundariesSection entries={houseDistrictInfo[race.id] ?? []} />
          </div>
        </div>
      </main>
    </div>
  );
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
