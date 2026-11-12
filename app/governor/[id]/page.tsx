import Link from "next/link";
import { candidatePageHref } from "@/lib/candidatePages";
import { governorData, governorNoElection, NoElectionEntry, electionYear, type PastResult } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import RaceHero from "@/components/RaceHero";
import { RaceRail, type RailItem } from "@/components/RaceLocator";
import { getNationalMargin } from "@/lib/statewideMargins";
import { notFound } from "next/navigation";
import { candidatePhoto } from "@/lib/candidatePhotos";
import { AboutRaceCard, incumbentFact, StateDemographicsSubsection, CandidatesLedgerSection, CurrentIncumbentLedgerRow, ForecastCalculationCard, FundraisingLedgerSection, LedgerSectionHead, LedgerSubhead, RacePollsSection, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import PastElectionCountyMap from "@/components/PastElectionCountyMap";
import { projectRaceResults, projectedCountyMapEntries } from "@/lib/countyProjection";
import ProjectedVoteSection, { ProjectedVoteFootnote, withProjectedVotes } from "@/components/ProjectedVoteSection";
import ElectionResultSection, { ElectionResultFootnote, electionResultMeta } from "@/components/ElectionResultSection";
import { raceResult2026 } from "@/lib/raceResults2026";
import SeatVoteHistoryChart from "@/components/SeatVoteHistoryChart";
import VoteHistoryTabbedSection from "@/components/VoteHistoryTabbedSection";
import { calculateStateTpl, effectiveEnvironment, raceIncumbencyPts, racePollingFor, computeProjectedMargin, raceMoneyTerm, raceFundraising2026, raceFundraisingSource2026, candidateQuality } from "@/lib/tplCompute";
import { forecastRace } from "@/lib/forecast";
import { getRaceForecastHistory } from "@/lib/forecastHistory";
import { RaceForecastTrend } from "@/components/ForecastTrend";
import { alignedParty } from "@/data/raceEligibility";
import { pastElectionHref } from "@/lib/pastElections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import FinalForecastPill from "@/components/FinalForecastPill";
import { StatePill, OfficePill, HeldPill, PILL } from "@/components/RaceHeroPills";


// abbr is the state's two letters; each row links to its /governor/[id]/[year] page when one exists.
function enrichGovResults(pastResults: PastResult[] | undefined, abbr: string): DetailPastResult[] {
  if (!pastResults?.length) return [];
  const sorted = [...pastResults].sort((a, b) => a.year - b.year);
  return sorted.map((res, i) => {
    const nationalMargin = getNationalMargin("Governor", res.year);
    const swing = i > 0
      ? parseFloat(((sorted[i - 1].demPct - sorted[i - 1].repPct) - (res.demPct - res.repPct)).toFixed(1))
      : null;
    return {
      ...res,
      nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null,
      swing,
      electionHref: pastElectionHref("governor", abbr.toLowerCase(), res.year),
    };
  }).reverse();
}

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
    description: `${electionYear} Governor forecast for ${race.name}: ${forecastRace(race).rating}, ${Math.round(forecastRace(race).probability * 100)}% Democratic win probability`,
  };
  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Governor — No Election in ${electionYear}` };
  return { title: "Race Not Found" };
}

function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

function NoElectionPage({ entry }: { entry: NoElectionEntry }) {
  const termStarted = entry.termLength ? String(entry.nextElection - entry.termLength) : "TBD";
  const enrichedPastResults = enrichGovResults(entry.pastResults, entry.abbr);
  const accentColor = partyAccent(entry.party);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${accentColor} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
          minHeight: "300px",
        }}
      >
        <div className={`${PAGE_CONTAINER} pt-6 pb-8 sm:pb-10`}>

          <div className="flex flex-row items-start justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatePill name={entry.state} abbr={entry.abbr} />
                <OfficePill office="governor" />
                <HeldPill party={entry.party} />
              </div>
              <h1
                className="mt-2"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance", color: "var(--app-text-primary)" }}
              >
                {entry.state} Governor
              </h1>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</div>
              <div className="mt-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
                Not on the ballot in {electionYear} — next election scheduled for <strong style={{ color: "var(--app-text-primary)" }}>{entry.nextElection}</strong>.
              </div>
            </div>

            <CurrentIncumbentLedgerRow incumbentName={entry.incumbent} state={entry.state} party={entry.party} photo={candidatePhoto(entry.incumbent, entry.state)} compact />
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} pb-10`}>
        <div className="flex flex-col gap-8">
          <section>
            <LedgerSectionHead label="About this Seat" />
            <AboutRaceCard
              bare
              title="About this Seat"
              description={entry.raceDesc ?? `[Placeholder — overview of the ${entry.state} governorship, its powers, the incumbent's background, key issues, and political context to be filled in.]`}
              items={[
                incumbentFact(entry.incumbent, entry.party, candidatePageHref(entry.incumbent, entry.state)),
                { label: "Elected", value: termStarted },
                { label: "Next Election", value: String(entry.nextElection) },
              ]}
            >
              <StateDemographicsSubsection abbr={entry.abbr} />
            </AboutRaceCard>
          </section>

          <section>
            <VoteHistoryTabbedSection
              variant="plain"
              defaultTabKey="race-results"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={enrichedPastResults}
                      state={entry.state}
                      fallbackYears={[entry.nextElection - 4, entry.nextElection - 8]}
                      showElectionType
                      density="compact"
                      cardStyle="ledger"
                      bare
                    />
                  ),
                },
                ...(enrichedPastResults.length > 0 ? [{
                  key: "graph",
                  label: "Graph",
                  content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Governor" />,
                }] : []),
              ]}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

/** Every 2026 governor's race, alphabetical, for the header's race switcher. */
const GOVERNOR_RAIL: RailItem[] = governorData
  .map((r) => ({ value: r.id.toLowerCase(), label: r.name, href: `/governor/${r.id.toLowerCase()}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default async function GovernorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return <NoElectionPage entry={noEl} />;

  const race = governorData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const stateTpl = calculateStateTpl(id.toUpperCase(), race.name);
  const demPhoto = race.candidates ? candidatePhoto(race.candidates.dem.name, race.state) : null;
  const repPhoto = race.candidates ? candidatePhoto(race.candidates.rep.name, race.state) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = incumbent ? alignedParty(incumbent) : null;
  const incumbentPts = raceIncumbencyPts(race); // office advantage + competitive-seat extra
  const fundraising = raceFundraising2026("governor", race.id);
  const fundraisingSource = raceFundraisingSource2026("governor", race.id);
  const moneyTerm = raceMoneyTerm(race);
  const fundraisingPts = moneyTerm.pts;
  const gb = effectiveEnvironment(id.toUpperCase());
  const polling = racePollingFor(race);
  const pollMargin = polling.avg?.diff ?? null;
  const projectedMargin = computeProjectedMargin(race);
  const forecast = forecastRace(race);
  const countyProjection = projectRaceResults("governor", race.id);
  // The counted result, which the race page shows in place of the projection (archived in data/forecast-final-2026/).
  const result = raceResult2026("governor", race.id);
  const raceHistory = getRaceForecastHistory("governor", race);
  const quality = candidateQuality(race);
  const forecastRating = forecast.rating; // Safe for a decided (same-party or uncontested) race, whatever the margin
  const { bg, text } = getRatingColors(forecastRating);
  // Headline shares are the projected vote's (shares of all votes, others set aside), except in a
  // same-party contest, where the projection makes no split between the two nominees.
  const useProjectedShares = countyProjection != null && !countyProjection.contest.startsWith("same-party");
  const demVoteShare = useProjectedShares ? countyProjection.shares.dem : parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = useProjectedShares ? countyProjection.shares.rep : parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentGovernorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentGovernorParty = incumbent?.party ?? race.seatParty ?? null;
  const enrichedPastResults = enrichGovResults(race.pastResults, race.id);

  // Prediction-market win probability (Dem share) — averages Polymarket/Kalshi when both exist.
  const marketDemProb = race.polyDem != null && race.kalshiDem != null
    ? (race.polyDem + race.kalshiDem) / 2
    : (race.polyDem ?? race.kalshiDem ?? null);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <RaceHero
        pills={<>
          <StatePill name={race.name} abbr={id} />
          <OfficePill office="governor" />
          <span className={PILL} style={{ background: bg, color: text }}>
            {forecastRating}
          </span>
          <HeldPill party={currentGovernorParty} />
          <FinalForecastPill />
        </>}
        nav={<RaceRail items={GOVERNOR_RAIL} current={race.id.toLowerCase()} label="Choose a governor's race" />}
        fitTitle={{ chars: `${race.name} Governor`.length, emPerChar: 0.62, reservePx: 0 }}
        title={<>{race.name} Governor</>}
        projectedMargin={projectedMargin}
        pollMargin={pollMargin}
        marketDemProb={marketDemProb}
        tpl={stateTpl}
        introBelow
      />

      <main className={`${PAGE_CONTAINER} pb-10`}>
        <div className="flex flex-col gap-8">
          <section>
            <AboutRaceCard
              bare
              title="About this Race"
              description={race.raceDesc ?? "[Placeholder — overview of this gubernatorial race, the powers of the office, key issues, and political context to be filled in.]"}
              items={[
                incumbentFact(currentGovernorName, currentGovernorParty, candidatePageHref(currentGovernorName, race.state)),
                { label: "Term Length", value: "4 years" },
              ]}
            >
              <StateDemographicsSubsection abbr={id} />
            </AboutRaceCard>
          </section>

          <section>
            {result ? (<>
              <LedgerSectionHead label="2026 Election" meta={electionResultMeta(result)} />
              <ElectionResultSection
                r={result}
                state={race.state}
                dem={{ photo: demPhoto, incumbent: race.candidates?.dem.incumbent }}
                rep={{ photo: repPhoto, incumbent: race.candidates?.rep.incumbent }}
              />
              {result.counties.length > 0 ? (
                <div className="mt-4">
                  <PastElectionCountyMap
                    panelSize="wide"
                    stateAbbr={id.toUpperCase()}
                    stateName={race.name}
                    counties={result.counties}
                    demName={result.demName}
                    repName={result.repName}
                    demParty={result.demParty}
                    repParty={result.repParty}
                    height={240}
                    caption={<div key="caption" className="px-1"><ElectionResultFootnote r={result} /></div>}
                  />
                </div>
              ) : <ElectionResultFootnote r={result} />}
            </>) : (<>
            <LedgerSectionHead label={countyProjection ? "Projected Result" : "Candidates"} meta={countyProjection ? `${countyProjection.votes.toLocaleString()} estimated votes` : undefined} />
            {race.candidates ? (() => {
              const rows = (
                <CandidatesLedgerSection
                  compact
                  candidates={withProjectedVotes([
                    { name: race.candidates.dem.name, state: race.state, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                    { name: race.candidates.rep.name, state: race.state, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                  ], countyProjection)}
                />
              );
              return countyProjection ? <ProjectedVoteSection p={countyProjection} candidates={rows} state={race.state} footnote={false} /> : rows;
            })() : (
              <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</p>
            )}
            {countyProjection && (
              <div className="mt-4">
                <PastElectionCountyMap
                  panelSize="wide"
                  stateAbbr={id.toUpperCase()}
                  stateName={race.name}
                  counties={projectedCountyMapEntries(countyProjection)}
                  demName={countyProjection.demName}
                  repName={countyProjection.repName}
                  demParty={countyProjection.demParty}
                  repParty={countyProjection.repParty}
                  height={240}
                  caption={<div key="caption" className="px-1"><ProjectedVoteFootnote p={countyProjection} /></div>}
                />
              </div>
            )}
            </>)}
          </section>

          <section>
            <LedgerSectionHead label="Forecast Calculation" />
            <ForecastCalculationCard
              bare
              tpl={stateTpl}
              genericBallot={gb}
              tplLabel="State TPL"
              tplHref={`/model/${id.toLowerCase()}`}
              incumbentPts={incumbentPts}
              appointedIncumbent={incumbent?.appointed ? incumbentParty : null}
              fundraisingPts={fundraising ? fundraisingPts : null}
              moneyTerm={moneyTerm}
              candidatePts={quality.pts}
              candidateDetail={quality}
              polling={polling}
              projectedMargin={projectedMargin}
              probabilityD={forecast.probability}
              interval80={forecast.interval80}
            />
            {raceHistory && (<>
              <LedgerSubhead rule={false} top="mt-3" label="Forecast Over Time" meta={<Link href="/analysis/internal-methodology#over-time" className="underline underline-offset-2" prefetch={false}>How this is built</Link>} />
              <RaceForecastTrend inline dates={raceHistory.dates} probD={raceHistory.probD} margins={raceHistory.margins}
                dem={{ name: race.candidates?.dem.name ?? "Democrat", party: race.candidates?.dem.party ?? "D" }}
                rep={{ name: race.candidates?.rep.name ?? "Republican", party: race.candidates?.rep.party ?? "R" }} />
            </>)}
          </section>

          {polling.avg && race.candidates && (
            <section>
              <LedgerSectionHead label="Polls" meta={`${polling.avg.n} pollster${polling.avg.n === 1 ? "" : "s"} (${polling.avg.nEff.toFixed(1)} effective) · ${Math.round(polling.weight * 100)}% of the projection`} />
              <RacePollsSection polling={polling} demName={race.candidates.dem.name} repName={race.candidates.rep.name} />
            </section>
          )}

          <section>
            <LedgerSectionHead label="Fundraising" />
            <FundraisingLedgerSection
              dem={fundraising?.dem ?? null}
              rep={fundraising?.rep ?? null}
              demName={race.candidates?.dem.name}
              repName={race.candidates?.rep.name}
              source={fundraisingSource}
              pendingNote="gubernatorial campaigns file with the state rather than the FEC, and those filings are still being collected"
              fundraisingPts={fundraisingPts}
              typicalGapPct={moneyTerm.structuralGapPct}
            />
          </section>

          <section>
            <VoteHistoryTabbedSection
              variant="plain"
              defaultTabKey="race-results"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={enrichedPastResults}
                      state={race.state}
                      fallbackYears={[2022, 2018, 2014]}
                      showElectionType
                      density="compact"
                      cardStyle="ledger"
                      bare
                    />
                  ),
                },
                ...(enrichedPastResults.length > 0 ? [{
                  key: "graph",
                  label: "Graph",
                  content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Governor" forecast={{ year: electionYear, margin: projectedMargin }} />,
                }] : []),
              ]}
            />
          </section>

        </div>
      </main>
    </div>
  );
}
