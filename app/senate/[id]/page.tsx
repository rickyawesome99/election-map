import { senateData, senateNoElection, senateHoldovers, electionYear, type PastResult } from "@/data/forecastData";
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

function enrichSenateResults(pastResults: PastResult[] | undefined): DetailPastResult[] {
  if (!pastResults?.length) return [];
  const sorted = [...pastResults].sort((a, b) => a.year - b.year);
  return sorted.map((res, i) => {
    const nationalMargin = getNationalMargin("Senate", res.year);
    const swing = i > 0
      ? parseFloat(((sorted[i - 1].demPct - sorted[i - 1].repPct) - (res.demPct - res.repPct)).toFixed(1))
      : null;
    return { ...res, nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null, swing };
  }).reverse();
}

function isSpecialElection(electionType?: string) {
  return (electionType ?? "").toLowerCase().includes("special");
}

function SpecialBadge() {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
    >
      Special
    </span>
  );
}

function senateUrlId(id: string): string {
  return id.toLowerCase().replace(/-2$/, "2");
}

export async function generateStaticParams() {
  return [
    ...senateData.map((race) => ({ id: senateUrlId(race.id) })),
    ...senateNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
    ...senateHoldovers.map((e) => ({ id: `${e.abbr.toLowerCase()}2` })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = senateData.find((r) => senateUrlId(r.id) === id.toLowerCase());
  if (race) return {
    title: `${race.name} Senate Race — ${electionYear} Forecast`,
    description: `${electionYear} Senate forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Senate — No Election in ${electionYear}` };
  const abbr = id.replace(/2$/i, "").toUpperCase();
  const holdover = senateHoldovers.find((e) => e.abbr === abbr);
  if (holdover) return { title: `${holdover.state} Senate (Seat 2) — Incumbent Info` };
  return { title: "Race Not Found" };
}

// ── Shared "no election this cycle" page ─────────────────────────────────────

function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

function NoElectionPage({
  state,
  abbr,
  incumbent,
  party,
  nextElection,
  termLength,
  seatLabel,
  raceDesc,
  pastResults,
}: {
  state: string;
  abbr: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  seatLabel: string;
  raceDesc?: string;
  pastResults?: DetailPastResult[];
}) {
  const partyLabel = party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
  const termYears = termLength ?? 6;
  const termStarted = String(nextElection - termYears);
  const accentColor = partyAccent(party);

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
                <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {abbr}
                </span>
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {state}
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{seatLabel}</div>
              <div className="mt-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
                Not on the ballot in November {electionYear} — next election scheduled for <strong style={{ color: "var(--app-text-primary)" }}>{nextElection}</strong>.
              </div>
            </div>

            <CurrentIncumbentLedgerRow incumbentName={incumbent} party={party} photo={candidatePhotos[incumbent] ?? null} compact />
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
              description={raceDesc ?? "[Placeholder — overview of this seat, its history, the incumbent's background, key issues, and political context to be filled in.]"}
              items={[
                { label: "Party", value: partyLabel },
                { label: "Elected", value: termStarted },
                { label: "Next Election", value: String(nextElection) },
              ]}
            />
          </section>

          {pastResults && pastResults.length > 0 && (
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
                        results={pastResults}
                        fallbackYears={[nextElection - termYears, nextElection - termYears * 2]}
                        showElectionType
                        showSpecialBadgeForSpecialElections
                        density="compact"
                        cardStyle="ledger"
                        bare
                      />
                    ),
                  },
                  ...(pastResults.length > 0 ? [{
                    key: "graph",
                    label: "Graph",
                    content: <SeatVoteHistoryChart results={pastResults} electionType="Senate" bare />,
                  }] : []),
                ]}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function SenatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abbr = id.replace(/2$/i, "").toUpperCase();
  const isSeat2Url = /2$/i.test(id);

  // Case 1: 2026 active race — checked FIRST to avoid collision with holdover entries
  const race = senateData.find((r) => senateUrlId(r.id) === id.toLowerCase());
  if (race) {
    // fall through to race rendering below
  } else if (isSeat2Url) {
    // Case 2: holdover second senator (e.g. /senate/ma2) — seat 2 not up in 2026
    const holdover = senateHoldovers.find((e) => e.abbr === abbr);
    if (holdover) {
      return (
        <NoElectionPage
          state={holdover.state}
          abbr={holdover.abbr}
          incumbent={holdover.incumbent}
          party={holdover.party}
          nextElection={holdover.nextElection}
          termLength={holdover.termLength}
          seatLabel={`U.S. Senate · Seat 2 · Not Up in ${electionYear}`}
          raceDesc={holdover.raceDesc}
          pastResults={enrichSenateResults(holdover.pastResults)}
        />
      );
    }
  } else {
    // Case 3: seat 1 not up in 2026
    const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
    if (noEl) {
      return (
        <NoElectionPage
          state={noEl.state}
          abbr={noEl.abbr}
          incumbent={noEl.incumbent}
          party={noEl.party}
          nextElection={noEl.nextElection}
          termLength={noEl.termLength}
          seatLabel={`U.S. Senate · No Election in ${electionYear}`}
          raceDesc={noEl.raceDesc}
          pastResults={enrichSenateResults(noEl.pastResults)}
        />
      );
    }
  }

  if (!race) notFound();

  const stateTpl = calculateStateTpl(abbr, race.name);
  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = (incumbent?.party === "D" || incumbent?.party === "R") ? incumbent.party : null;
  const incumbentPts = computeIncumbentPts("S", incumbentParty);
  const gb = effectiveGenericBallot(abbr);
  const rcpMargin = computeRcpMargin(race.rcpDem, race.rcpRep);
  const projectedMargin = computeProjectedMargin(race);
  const demPct = Math.round(marginToProbability(projectedMargin) * 100);
  const repPct = 100 - demPct;
  const forecastRating = marginToRating(projectedMargin);
  const { bg, text } = getRatingColors(forecastRating);
  const demVoteShare = parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentSenatorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentSenatorParty = incumbent?.party ?? race.seatParty ?? null;
  const enrichedPastResults = enrichSenateResults(race.pastResults);

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
                <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {abbr}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={{ background: bg, color: text }}>
                  {forecastRating}
                </span>
                {isSpecialElection(race.electionType) && <SpecialBadge />}
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {race.name}
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {electionYear} {race.electionType ?? "Regular"} U.S. Senate Race{race.seatClass ? ` · Class ${race.seatClass}` : ""} · General {GENERAL_ELECTION}
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
              description={race.raceDesc ?? "[Placeholder — overview of this Senate seat, its history, key issues, and political context to be filled in.]"}
              items={[
                { label: "Incumbent", value: currentSenatorName },
                { label: "Party", value: currentSenatorParty ? (currentSenatorParty === "D" ? "Democrat" : currentSenatorParty === "R" ? "Republican" : "Independent") : "TBD" },
                { label: "Seat Class", value: race.seatClass ? `Class ${race.seatClass}` : "TBD" },
              ]}
            />
          </section>

          <section>
            <LedgerSectionHead label="State Map" />
            <StateCountyMap stateAbbr={abbr} stateName={race.name} height={280} showLabel={false} />
          </section>

          <section>
            <LedgerSectionHead label="Forecast Calculation" />
            <ForecastCalculationCard
              bare
              tpl={stateTpl}
              genericBallot={gb}
              tplLabel="State TPL"
              tplHref={`/model/state?modelState=${encodeURIComponent(abbr)}`}
              incumbentPts={incumbentPts}
              fundraisingPts={null}
              candidatePts={null}
              pollingAvg={rcpMargin}
              projectedMargin={projectedMargin}
            />
          </section>

          {race.pastResults && race.pastResults.length > 0 && (
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
                        fallbackYears={[]}
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
                    content: <SeatVoteHistoryChart results={enrichedPastResults} electionType="Senate" bare />,
                  }] : []),
                ]}
              />
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
