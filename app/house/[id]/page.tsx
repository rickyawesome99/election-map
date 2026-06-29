import { houseData, houseDistrictInfo, houseDistrictPvi, houseStatewideResults, electionYear } from "@/data/forecastData";
import { getStatewideMargin, getNationalMargin } from "@/lib/statewideMargins";
import { pviHistory } from "@/lib/pviHistory";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import { AboutRaceCard, CandidatesAndPollsCard, ForecastCalculationCard, HouseOnlyDistrictBoundariesSection, HouseOnlyRecentStatewideResultsSection, PastElectionResultsSection } from "@/components/RaceDetailSections";
import DistrictVoteHistoryChart from "@/components/DistrictVoteHistoryChart";
import { calculateDistrictTpl, GENERIC_BALLOT, marginToProbability } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";
const HOUSE_BOUNDARIES_CARD_HEIGHT = "275px";

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
  const districtTpl = calculateDistrictTpl(race.id);
  const districtTplId = parseInt(race.id, 10).toString();
  const projectedMargin = districtTpl + GENERIC_BALLOT;
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));

  const pastResultsWithDiff = (race.pastResults ?? []).map((res) => {
    const nationalMargin = getNationalMargin("House", res.year);
    return {
      ...res,
      nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null,
    };
  });

  const rawStatewideResults = houseStatewideResults[race.id] ?? [];
  const stateDistrictCount = houseData.filter(r => r.state === race.state && r.raceType === "house").length;
  // Year from which the state had multiple districts (for states that recently gained seats)
  const multiDistrictSince: Record<string, number> = { MT: 2022 };

  function prevElectionYear(race: string, year: number): number | null {
    if (race === "President") return year - 4;
    if (race.includes("Senate")) return year - 6;
    if (race.includes("Governor")) return (stateAbbr === "NH" || stateAbbr === "VT") ? year - 2 : year - 4;
    return null;
  }

  const statewideResultsWithDiff = rawStatewideResults.map((res) => {
    const districtMargin = res.demPct - res.repPct;
    const statewideMargin = getStatewideMargin(stateAbbr, res.year, res.race);
    const nationalMargin = getNationalMargin(res.race, res.year);
    const prevYear = prevElectionYear(res.race, res.year);
    const prevRes = prevYear != null
      ? rawStatewideResults.find((r) => r.race === res.race && r.year === prevYear)
      : null;
    const swing = prevRes != null
      ? parseFloat(((prevRes.demPct - prevRes.repPct) - districtMargin).toFixed(1))
      : null;
    return {
      ...res,
      stateDiff: stateDistrictCount > 1 && statewideMargin != null && res.year >= (multiDistrictSince[stateAbbr] ?? 0) ? districtMargin + statewideMargin : null,
      nationalDiff: nationalMargin != null ? -districtMargin - nationalMargin : null,
      swing,
    };
  });

  const PVI_DISPLAY_YEARS = [2026, 2024, 2022, 2020, 2018, 2016] as const;
  const districtPviByYear = pviHistory[race.id] ?? {};
  const boundaryByYear = new Map((houseDistrictInfo[race.id] ?? []).map(e => [e.year, e]));
  const boundaryEntries = PVI_DISPLAY_YEARS
    .filter(year => districtPviByYear[year] != null || boundaryByYear.has(year))
    .map(year => {
      const boundary = boundaryByYear.get(year);
      const pvi = districtPviByYear[year];
      return {
        year,
        pvi,
        description: boundary?.description,
        pviOld: boundary?.pviOld,
        pviNew: pvi ?? boundary?.pviNew,
        boundaryChanged: !!boundary,
      };
    });

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>
        {/* Title block */}
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/states/${race.state.toLowerCase().replace(/\s+/g, "-")}?from=${encodeURIComponent(`/house/${race.id}${fromParam ? `?from=${encodeURIComponent(fromParam)}` : ""}`)}`} className="text-2xl font-bold leading-none hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</a>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {forecastRating}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{electionYear} U.S. House Race · {districtLabel}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          {/* Left column — display:contents on mobile so children become direct grid items (enabling order-based reflow), flex-col on desktop */}
          <div className="contents md:flex md:flex-col md:gap-3">
            <div
              className="order-1 min-h-[220px] overflow-hidden rounded-xl"
              style={{ border: "1px solid var(--app-border)" }}
            >
              <DistrictMiniMap
                raceId={race.id}
                stateAbbr={stateAbbr}
                margin={projectedMargin}
                boundaryYears={(() => {
                  const entries = houseDistrictInfo[race.id] ?? [];
                  if (entries.length === 0) return [];
                  const years = new Set(entries.map(e => e.year));
                  years.add(2016);
                  return [...years].sort((a, b) => b - a);
                })()}
              />
            </div>

            <div className="order-2">
              <AboutRaceCard
                title="About this District"
                description={`[Placeholder — overview of ${districtLabel}, including its geography, key communities, and political history to be filled in.]`}
                items={[
                  { label: "Incumbent", value: currentRepName },
                  { label: "Party", value: currentRepParty ? (currentRepParty === "D" ? "Democrat" : currentRepParty === "R" ? "Republican" : "Independent") : "TBD" },
                  { label: "PVI", value: pviDisplay },
                ]}
              />
            </div>

            <div className="order-7">
              <DistrictVoteHistoryChart houseResults={pastResultsWithDiff} statewideResults={statewideResultsWithDiff} />
            </div>

            <div className="order-8 [&>section]:h-full" style={{ height: HOUSE_BOUNDARIES_CARD_HEIGHT }}>
              <HouseOnlyDistrictBoundariesSection
                entries={boundaryEntries}
                density="compact"
                maxHeight={HOUSE_BOUNDARIES_CARD_HEIGHT}
                scrollable
              />
            </div>
          </div>

          {/* Right column — display:contents on mobile, flex-col on desktop */}
          <div className="contents md:flex md:flex-col md:gap-3">
            <div className="order-3">
              <CandidatesAndPollsCard
                candidates={race.candidates
                  ? [
                      { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, pct: demVoteShare },
                      { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, pct: repVoteShare },
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

            <div className="order-4">
              <ForecastCalculationCard
                tpl={districtTpl}
                genericBallot={GENERIC_BALLOT}
                tplLabel="District TPL"
                tplHref={`/?tab=district&modelDistrict=${encodeURIComponent(districtTplId)}`}
              />
            </div>

            <div className="order-5">
              <PastElectionResultsSection
                results={pastResultsWithDiff}
                fallbackYears={[2024, 2022, 2020]}
                showElectionType={false}
                density="compact"
                scrollable
                maxHeight="400px"
              />
            </div>

            <div className="order-6">
              <HouseOnlyRecentStatewideResultsSection results={statewideResultsWithDiff} density="compact" maxHeight="380px" />
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
