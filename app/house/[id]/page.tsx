import { houseData, houseDistrictInfo, houseStatewideResults, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import { AboutRaceCard, CandidatesSection, HouseOnlyDistrictBoundariesSection, HouseOnlyRecentStatewideResultsSection, MarginAndWinProbabilityCard, PastElectionResultsSection, PollAggregateCard } from "@/components/RaceDetailSections";

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

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/states/${race.state.toLowerCase().replace(/\s+/g, "-")}?from=${encodeURIComponent(`/house/${race.id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>{electionYear} U.S. House Race · {districtLabel}</p>
        </div>

        {/* District map */}
        <section
          className="rounded-xl overflow-hidden mb-6"
          style={{ border: "1px solid var(--app-border)" }}
        >
          <DistrictMiniMap raceId={race.id} stateAbbr={stateAbbr} margin={race.margin} />
        </section>

        <AboutRaceCard
          title="About this District"
          description={`[Placeholder — overview of ${districtLabel}, including its geography, key communities, and political history to be filled in.]`}
          items={[
            { label: "State", value: race.state },
            { label: "District", value: districtNum === "AL" ? "At-Large" : `${stateAbbr}-${districtNum}` },
            { label: "Incumbent", value: currentRepName },
            { label: "Party", value: currentRepParty ? (currentRepParty === "D" ? "Democrat" : currentRepParty === "R" ? "Republican" : "Independent") : "TBD" },
          ]}
        />

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MarginAndWinProbabilityCard margin={race.margin} demPct={demPct} repPct={repPct} />

          <PollAggregateCard
            rows={[
              { label: "RCP Average", type: "voteshare" },
              { label: "Kalshi Odds", type: "winprob" },
              { label: "Polymarket Odds", type: "winprob" },
            ]}
          />

          <PastElectionResultsSection
            results={race.pastResults}
            fallbackYears={[2024, 2022, 2020]}
            showElectionType={false}
          />

          <HouseOnlyRecentStatewideResultsSection results={houseStatewideResults[race.id]} />

          <HouseOnlyDistrictBoundariesSection entries={houseDistrictInfo[race.id] ?? []} />

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
