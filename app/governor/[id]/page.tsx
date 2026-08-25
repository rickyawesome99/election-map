import { governorData, governorNoElection, NoElectionEntry, electionYear, type PastResult } from "@/data/forecastData";
import { GOVERNOR_MANUAL_MARGINS } from "@/data/manualOverrides";
import { getRatingColors, marginToRating, fmtMargin, marginColor } from "@/lib/colorScale";
import { getNationalMargin } from "@/lib/statewideMargins";
import { notFound } from "next/navigation";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { AboutRaceCard, CandidatesLedgerSection, CurrentIncumbentLedgerRow, ForecastCalculationCard, LedgerSectionHead, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import StateCountyMap from "@/components/StateCountyMap";
import SeatVoteHistoryChart from "@/components/SeatVoteHistoryChart";
import VoteHistoryTabbedSection from "@/components/VoteHistoryTabbedSection";
import { calculateStateTpl, effectiveGenericBallot, marginToProbability, computeIncumbentPts, computeRcpMargin, computeProjectedMargin } from "@/lib/tplCompute";
import BackButton from "@/components/BackButton";

const GENERAL_ELECTION = "November 3, 2026";

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

function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

function NoElectionPage({ entry }: { entry: NoElectionEntry }) {
  const partyLabel = entry.party === "D" ? "Democrat" : entry.party === "R" ? "Republican" : "Independent";
  const termStarted = entry.termLength ? String(entry.nextElection - entry.termLength) : "TBD";
  const enrichedPastResults = enrichGovResults(entry.pastResults);
  const accentColor = partyAccent(entry.party);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
          minHeight: "300px",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-8 sm:pb-10">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-row items-start justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <a href={`/states/${entry.abbr.toLowerCase()}`} aria-label={`View ${entry.state} state page`} className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 hover:underline" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {entry.abbr}
                </a>
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {entry.state}
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</div>
              <div className="mt-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
                Not on the ballot in {electionYear} — next election scheduled for <strong style={{ color: "var(--app-text-primary)" }}>{entry.nextElection}</strong>.
              </div>
            </div>

            <CurrentIncumbentLedgerRow incumbentName={entry.incumbent} party={entry.party} photo={candidatePhotos[entry.incumbent] ?? null} compact />
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-10 sm:px-6">
        <div className="flex flex-col gap-8">
          <section>
            <LedgerSectionHead label="About this Seat" />
            <AboutRaceCard
              bare
              title="About this Seat"
              description={entry.raceDesc ?? `[Placeholder — overview of the ${entry.state} governorship, its powers, the incumbent's background, key issues, and political context to be filled in.]`}
              items={[
                { label: "Party", value: partyLabel },
                { label: "Elected", value: termStarted },
                { label: "Next Election", value: String(entry.nextElection) },
              ]}
            />
          </section>

          <section>
            <VoteHistoryTabbedSection
              variant="plain"
              defaultTabKey="race-results"
              height="400px"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={enrichedPastResults}
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
                  content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Governor" bare />,
                }] : []),
              ]}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default async function GovernorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return <NoElectionPage entry={noEl} />;

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
  const rcpMargin = computeRcpMargin(race.rcpDem, race.rcpRep);
  const projectedMargin = computeProjectedMargin(race);
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentGovernorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentGovernorParty = incumbent?.party ?? race.seatParty ?? null;
  const enrichedPastResults = enrichGovResults(race.pastResults);

  // Prediction-market win probability (Dem share) — averages Polymarket/Kalshi when both exist.
  const marketDemProb = race.polyDem != null && race.kalshiDem != null
    ? (race.polyDem + race.kalshiDem) / 2
    : (race.polyDem ?? race.kalshiDem ?? null);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${marginColor(projectedMargin)} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
          minHeight: "300px",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-8 sm:pb-10">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <a href={`/states/${id.toLowerCase()}`} aria-label={`View ${race.name} state page`} className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 hover:underline" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {id.toUpperCase()}
                </a>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={{ background: bg, color: text }}>
                  {forecastRating}
                </span>
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {race.name}
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {electionYear} Gubernatorial Race · General {GENERAL_ELECTION}
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
          <div className="mt-8 grid grid-cols-3 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="min-w-0 pr-2 sm:pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold tabular-nums sm:text-2xl">
                <span style={{ color: demPct >= repPct ? "var(--party-dem)" : "var(--party-rep)" }}>{Math.max(demPct, repPct)}% {demPct >= repPct ? "D" : "R"}</span>
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                Win Prob.
              </div>
            </div>

            <div className="min-w-0 px-2 sm:px-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold tabular-nums sm:text-2xl" style={{ color: marginColor(rcpMargin) }}>
                {fmtMargin(rcpMargin)}
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                RCP Avg.
              </div>
            </div>

            <div className="min-w-0 pl-2 sm:pl-8">
              <div
                className="text-xl font-extrabold tabular-nums sm:text-2xl"
                style={{ color: marketDemProb == null ? "var(--app-text-very-muted)" : marketDemProb >= 0.5 ? "var(--party-dem)" : "var(--party-rep)" }}
              >
                {marketDemProb == null
                  ? "—"
                  : `${Math.round((marketDemProb >= 0.5 ? marketDemProb : 1 - marketDemProb) * 100)}% ${marketDemProb >= 0.5 ? "D" : "R"}`}
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                Markets
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-10 sm:px-6">
        <div className="flex flex-col gap-8">

          <section>
            <LedgerSectionHead label="Candidates" />
            {race.candidates ? (
              <CandidatesLedgerSection
                candidates={[
                  { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                  { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                ]}
              />
            ) : (
              <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</p>
            )}
          </section>

          <section>
            <LedgerSectionHead label="About this Race" />
            <AboutRaceCard
              bare
              title="About this Race"
              description={race.raceDesc ?? "[Placeholder — overview of this gubernatorial race, the powers of the office, key issues, and political context to be filled in.]"}
              items={[
                { label: "Term Length", value: "4 Years" },
                { label: "Incumbent", value: currentGovernorName },
                { label: "Party", value: currentGovernorParty ? (currentGovernorParty === "D" ? "Democrat" : currentGovernorParty === "R" ? "Republican" : "Independent") : "TBD" },
              ]}
            />
          </section>

          <section>
            <LedgerSectionHead label="State Map" />
            <StateCountyMap stateAbbr={id.toUpperCase()} stateName={race.name} height={280} showLabel={false} />
          </section>

          <section>
            <LedgerSectionHead label="Forecast Calculation" />
            <ForecastCalculationCard
              bare
              tpl={stateTpl}
              genericBallot={gb}
              tplLabel="State TPL"
              tplHref={`/model/state?modelState=${encodeURIComponent(id.toUpperCase())}`}
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
              height="400px"
              tabs={[
                {
                  key: "race-results",
                  label: "Race Results",
                  content: (
                    <PastElectionResultsSection
                      results={enrichedPastResults}
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
                  content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Governor" bare />,
                }] : []),
              ]}
            />
          </section>

        </div>
      </main>
    </div>
  );
}
