import { houseData, houseDistrictInfo, houseDistrictPvi, houseStatewideResults, electionYear } from "@/data/forecastData";
import { getStatewideMargin, getNationalMargin } from "@/lib/statewideMargins";
import { pviHistory } from "@/lib/pviHistory";
import { getRatingColors, marginToRating, fmtMargin, marginColor } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import { candidatePhotos } from "@/lib/candidatePhotos";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import { AboutRaceCard, CandidatesLedgerSection, ForecastCalculationCard, HouseOnlyDistrictBoundariesSection, HouseOnlyRecentStatewideResultsSection, LedgerSectionHead, PastElectionResultsSection } from "@/components/RaceDetailSections";
import DistrictVoteHistoryChart from "@/components/DistrictVoteHistoryChart";
import VoteHistoryTabbedSection from "@/components/VoteHistoryTabbedSection";
import { calculateDistrictTpl, effectiveGenericBallot, marginToProbability, computeIncumbentPts, computeRcpMargin, computeProjectedMargin } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";

const GENERAL_ELECTION = "November 3, 2026";

function inferCurrentHouseSeatFromPastResults(race: { pastResults?: { demIncumbent?: boolean; repIncumbent?: boolean; demCandidate?: string; repCandidate?: string }[] }) {
  for (const res of race.pastResults ?? []) {
    if (res.demIncumbent && res.demCandidate) return { name: res.demCandidate, party: "D" as const };
    if (res.repIncumbent && res.repCandidate) return { name: res.repCandidate, party: "R" as const };
  }
  return null;
}

export async function generateStaticParams() {
  return houseData.map((race) => ({ id: race.name.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = houseData.find((r) => r.name.toLowerCase() === id.toLowerCase());
  if (!race) return { title: "Race Not Found" };
  return {
    title: `${race.name} House Race — ${electionYear} Forecast`,
    description: `${electionYear} House forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
}

export default async function HousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = houseData.find((r) => r.name.toLowerCase() === id.toLowerCase());
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
  const incumbentParty = (incumbentCandidate?.party === "D" || incumbentCandidate?.party === "R") ? incumbentCandidate.party : null;
  const incumbentPts = computeIncumbentPts("H", incumbentParty);
  const gb = effectiveGenericBallot(stateAbbr);
  const rcpMargin = computeRcpMargin(race.rcpDem, race.rcpRep);
  const projectedMargin = computeProjectedMargin(race);
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const heldLabel = currentRepParty === "R" ? "Republican-held" : currentRepParty === "D" ? "Democratic-held" : "Open Seat";

  // Prediction-market win probability (Dem share) — averages Polymarket/Kalshi when both exist.
  const marketDemProb = race.polyDem != null && race.kalshiDem != null
    ? (race.polyDem + race.kalshiDem) / 2
    : (race.polyDem ?? race.kalshiDem ?? null);

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

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${marginColor(projectedMargin)} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-7">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={{ background: bg, color: text }}>
                  {forecastRating}
                </span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {heldLabel}
                </span>
              </div>
              <h1
                className="mt-2 whitespace-nowrap"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
              >
                {race.name}
              </h1>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {electionYear} U.S. House Race · {districtLabel} · General {GENERAL_ELECTION}
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                Projected Margin
              </div>
              <div
                className="tabular-nums"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: marginColor(projectedMargin) }}
              >
                {fmtMargin(projectedMargin)}
              </div>
            </div>
          </div>

          {/* Stat row */}
          <div className="mt-8 pt-5 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-2xl font-extrabold tabular-nums">
                <span style={{ color: "var(--party-dem)" }}>{demPct}%</span>
                <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}> / </span>
                <span style={{ color: "var(--party-rep)" }}>{repPct}%</span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Win Probability
              </div>
            </div>

            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: marginColor(rcpMargin) }}>
                {fmtMargin(rcpMargin)}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                RCP Average
              </div>
            </div>

            <div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{ color: marketDemProb == null ? "var(--app-text-very-muted)" : marketDemProb >= 0.5 ? "var(--party-dem)" : "var(--party-rep)" }}
              >
                {marketDemProb == null
                  ? "—"
                  : `${Math.round((marketDemProb >= 0.5 ? marketDemProb : 1 - marketDemProb) * 100)}% ${marketDemProb >= 0.5 ? "D" : "R"}`}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Prediction Markets
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-10 sm:px-6">
        <div className="flex flex-col gap-8">

          <section>
            <LedgerSectionHead label="Candidates" />
            <CandidatesLedgerSection
              candidates={race.candidates
                ? [
                    { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                    { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                  ]
                : [
                    { name: "Democrat", party: "D", pct: demVoteShare, placeholder: true },
                    { name: "Republican", party: "R", pct: repVoteShare, placeholder: true },
                  ]}
            />
          </section>

          <section>
            <LedgerSectionHead label="About this District" />
            <AboutRaceCard
              bare
              title="About this District"
              description={`[Placeholder — overview of ${districtLabel}, including its geography, key communities, and political history to be filled in.]`}
              items={[
                { label: "Incumbent", value: currentRepName },
                { label: "Party", value: currentRepParty ? (currentRepParty === "D" ? "Democrat" : currentRepParty === "R" ? "Republican" : "Independent") : "TBD" },
                { label: "PVI", value: pviDisplay },
              ]}
            />
          </section>

          <section>
            <LedgerSectionHead label="District Map" />
            <div style={{ height: 280 }}>
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
          </section>

          {boundaryEntries.length > 0 && (
            <section>
              <LedgerSectionHead label="District Boundaries & PVI History" />
              <HouseOnlyDistrictBoundariesSection bare scrollable maxHeight="380px" entries={boundaryEntries} />
            </section>
          )}

          <section>
            <LedgerSectionHead label="Forecast Calculation" />
            <ForecastCalculationCard
              bare
              tpl={districtTpl}
              genericBallot={gb}
              tplLabel="District TPL"
              tplHref={`/model/district?modelDistrict=${encodeURIComponent(districtTplId)}`}
              incumbentPts={incumbentPts}
              fundraisingPts={null}
              candidatePts={null}
              pollingAvg={rcpMargin}
              projectedMargin={projectedMargin}
            />
          </section>

          <section>
            <VoteHistoryTabbedSection
              variant="plain"
              defaultTabKey="race-results"
              height="440px"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={pastResultsWithDiff}
                      fallbackYears={[2024, 2022, 2020]}
                      showElectionType={false}
                      density="compact"
                      cardStyle="ledger"
                      bare
                    />
                  ),
                },
                {
                  key: "statewide-results",
                  label: "Statewide",
                  content: <HouseOnlyRecentStatewideResultsSection results={statewideResultsWithDiff} density="compact" cardStyle="ledger" bare />,
                },
                ...((pastResultsWithDiff.length > 0 || statewideResultsWithDiff.length > 0) ? [{
                  key: "chart",
                  label: "Graph",
                  content: <DistrictVoteHistoryChart houseResults={pastResultsWithDiff} statewideResults={statewideResultsWithDiff} bare />,
                }] : []),
              ]}
            />
          </section>

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
