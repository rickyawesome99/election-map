import { houseData, houseDistrictInfo, houseDistrictPvi, houseStatewideResults, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import { AboutRaceCard, CandidatesSection, HouseOnlyDistrictBoundariesSection, HouseOnlyRecentStatewideResultsSection, MarginAndWinProbabilityCard, PastElectionResultsSection } from "@/components/RaceDetailSections";

const HOUSE_BOUNDARIES_CARD_HEIGHT = "445px";

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
  const pvi2026 = houseDistrictPvi[race.id];
  const pviDisplay = pvi2026 != null
    ? pvi2026 === 0 ? "EVEN" : pvi2026 > 0 ? `R+${pvi2026}` : `D+${Math.abs(pvi2026)}`
    : "TBD";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        {/* Title block */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/states/${race.state.toLowerCase().replace(/\s+/g, "-")}?from=${encodeURIComponent(`/house/${race.id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{electionYear} U.S. House Race · {districtLabel}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-start">
          <div className="flex flex-col gap-3">
            <div
              className="min-h-[220px] overflow-hidden rounded-xl"
              style={{ border: "1px solid var(--app-border)" }}
            >
              <DistrictMiniMap raceId={race.id} stateAbbr={stateAbbr} margin={race.margin} />
            </div>

            <AboutRaceCard
              title="About this District"
              description={`[Placeholder — overview of ${districtLabel}, including its geography, key communities, and political history to be filled in.]`}
              items={[
                { label: "Incumbent", value: currentRepName },
                { label: "Party", value: currentRepParty ? (currentRepParty === "D" ? "Democrat" : currentRepParty === "R" ? "Republican" : "Independent") : "TBD" },
                { label: "PVI", value: pviDisplay },
              ]}
            />

            <div className="[&>section]:h-full" style={{ height: HOUSE_BOUNDARIES_CARD_HEIGHT }}>
              <HouseOnlyDistrictBoundariesSection
                entries={houseDistrictInfo[race.id] ?? []}
                density="compact"
                maxHeight={HOUSE_BOUNDARIES_CARD_HEIGHT}
                scrollable
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-8 lg:items-stretch">
              <div className="lg:col-span-5 [&>section]:h-full">
                <CandidatesSection
                  density="compact"
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

              <div className="lg:col-span-3 [&>section]:h-full">
                <MarginAndWinProbabilityCard density="compact" margin={race.margin} demPct={demPct} repPct={repPct} rcpDem={race.rcpDem} rcpRep={race.rcpRep} polyDem={race.polyDem} polyRep={race.polyRep} kalshiDem={race.kalshiDem} kalshiRep={race.kalshiRep} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-8 lg:h-[700px]">
              <div className="lg:col-span-4 [&>section]:h-full" style={{ height: "700px" }}>
                <PastElectionResultsSection
                  results={race.pastResults}
                  fallbackYears={[2024, 2022, 2020]}
                  showElectionType={false}
                  density="compact"
                  scrollable
                />
              </div>
              <div className="lg:col-span-4 [&>section]:h-full" style={{ height: "700px" }}>
                <HouseOnlyRecentStatewideResultsSection results={houseStatewideResults[race.id]} density="compact" />
              </div>
            </div>
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
