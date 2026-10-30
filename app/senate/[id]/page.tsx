import Link from "next/link";
import { candidatePageHref, partyTextColor } from "@/lib/candidatePages";
import { senateData, senateNoElection, senateHoldovers, electionYear, type PastResult } from "@/data/forecastData";
import { getRatingColors, fmtMargin, marginColor, formatProjectedMargin, projectedMarginColor, fmtLean, leanColor } from "@/lib/colorScale";
import { getNationalMargin } from "@/lib/statewideMargins";
import { notFound } from "next/navigation";
import { candidatePhoto } from "@/lib/candidatePhotos";
import { AboutRaceCard, CandidatesLedgerSection, CurrentIncumbentLedgerRow, ForecastCalculationCard, FundraisingLedgerSection, LedgerSectionHead, RacePollsSection, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import PastElectionCountyMap from "@/components/PastElectionCountyMap";
import { projectRaceResults, projectedCountyMapEntries } from "@/lib/countyProjection";
import ProjectedVoteSection, { withProjectedVotes } from "@/components/ProjectedVoteSection";
import SeatVoteHistoryChart from "@/components/SeatVoteHistoryChart";
import VoteHistoryTabbedSection from "@/components/VoteHistoryTabbedSection";
import { calculateStateTpl, effectiveEnvironment, computeIncumbentPts, raceIncumbencyPts, racePollingFor, computeProjectedMargin, raceMoneyTerm, raceFundraising2026, raceFundraisingSource2026, raceFinanceDetail2026, candidateQuality } from "@/lib/tplCompute";
import { forecastRace } from "@/lib/forecast";
import { getRaceForecastHistory } from "@/lib/forecastHistory";
import { RaceForecastTrend } from "@/components/ForecastTrend";
import { alignedParty } from "@/data/raceEligibility";
import { pastElectionHref } from "@/lib/pastElections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { StatePill, OfficePill, HeldPill, SeatArrows, PILL, type SeatNavLink } from "@/components/RaceHeroPills";

const GENERAL_ELECTION = "November 3, 2026";

// seatUrlId is the seat's URL id ("pa" / "pa2"); each row links to its /senate/[id]/[year] page when one exists.
// The party the incumbent ran under at their latest win. senateNoElection/senateHoldovers store
// the caucus party (King, Sanders → D) because the seat counts need it; the held pill shows
// the senator's own label.
function incumbentOwnParty(incumbent: string, caucusParty: "D" | "R" | "I", pastResults: PastResult[] | undefined): "D" | "R" | "I" {
  for (const r of [...(pastResults ?? [])].sort((a, b) => b.year - a.year)) {
    if (r.demCandidate === incumbent && r.demParty) return r.demParty;
    if (r.repCandidate === incumbent && r.repParty) return r.repParty;
  }
  return caucusParty;
}

function enrichSenateResults(pastResults: PastResult[] | undefined, seatUrlId: string): DetailPastResult[] {
  if (!pastResults?.length) return [];
  const sorted = [...pastResults].sort((a, b) => a.year - b.year);
  return sorted.map((res, i) => {
    const nationalMargin = getNationalMargin("Senate", res.year);
    const swing = i > 0
      ? parseFloat(((sorted[i - 1].demPct - sorted[i - 1].repPct) - (res.demPct - res.repPct)).toFixed(1))
      : null;
    return {
      ...res,
      nationalDiff: nationalMargin != null ? (res.repPct - res.demPct) - nationalMargin : null,
      swing,
      electionHref: pastElectionHref("senate", seatUrlId, res.year),
    };
  }).reverse();
}

function isSpecialElection(electionType?: string) {
  return (electionType ?? "").toLowerCase().includes("special");
}

function SpecialBadge() {
  return (
    <span className={`${PILL} whitespace-nowrap`} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
      Special
    </span>
  );
}

function senateUrlId(id: string): string {
  return id.toLowerCase().replace(/-2$/, "2");
}

/** The state's other Senate seat page (seat 1 ↔ seat 2), for the arrows beside the title. Null
 *  when that seat has no page (a state with only one seat on file). */
function otherSenateSeat(id: string): { prev: SeatNavLink | null; next: SeatNavLink | null } {
  const lc = id.toLowerCase();
  const seat2 = /2$/.test(lc);
  const otherId = seat2 ? lc.slice(0, -1) : `${lc}2`;
  const exists = senateData.some((r) => senateUrlId(r.id) === otherId)
    || (seat2 ? senateNoElection.some((e) => e.abbr.toLowerCase() === otherId) : senateHoldovers.some((e) => `${e.abbr.toLowerCase()}2` === otherId));
  if (!exists) return { prev: null, next: null };
  const link = { href: `/senate/${otherId}`, label: seat2 ? "Seat 1" : "Seat 2" };
  return seat2 ? { prev: link, next: null } : { prev: null, next: link };
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
    description: `${electionYear} Senate forecast for ${race.name}: ${forecastRace(race).rating}, ${Math.round(forecastRace(race).probability * 100)}% Democratic win probability`,
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
  heldParty,
  raceDesc,
  pastResults,
  pageId,
}: {
  pageId: string;
  state: string;
  abbr: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  seatLabel: string;
  // The incumbent's own label (King and Sanders are I here; `party` keeps their D caucus alignment).
  heldParty: "D" | "R" | "I";
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
          background: `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${accentColor} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
          minHeight: "300px",
        }}
      >
        <div className={`${PAGE_CONTAINER} pt-6 pb-8 sm:pb-10`}>

          <div className="flex flex-row items-start justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatePill name={state} abbr={abbr} />
                <OfficePill office="senate" />
                <HeldPill party={heldParty} />
              </div>
              <div className="mt-2">
                <h1
                  className="inline"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance", color: "var(--app-text-primary)" }}
                >
                  {state} U.S.{" "}
                  <span className="whitespace-nowrap">
                    Senate
                    <SeatArrows {...otherSenateSeat(pageId)} label="Other Senate seat" />
                  </span>
                </h1>
              </div>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{seatLabel}</div>
              <div className="mt-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
                Not on the ballot in November {electionYear} — next election scheduled for <strong style={{ color: "var(--app-text-primary)" }}>{nextElection}</strong>.
              </div>
            </div>

            <CurrentIncumbentLedgerRow incumbentName={incumbent} state={state} party={party} photo={candidatePhoto(incumbent, state)} compact />
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
              description={raceDesc ?? "[Placeholder — overview of this seat, its history, the incumbent's background, key issues, and political context to be filled in.]"}
              items={[
                { label: "Party", value: partyLabel, color: partyTextColor(party) },
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
                        state={state}
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
          pageId={id}
          state={holdover.state}
          abbr={holdover.abbr}
          incumbent={holdover.incumbent}
          party={holdover.party}
          nextElection={holdover.nextElection}
          termLength={holdover.termLength}
          seatLabel={`U.S. Senate · Seat 2 · Not Up in ${electionYear}`}
          heldParty={incumbentOwnParty(holdover.incumbent, holdover.party, holdover.pastResults)}
          raceDesc={holdover.raceDesc}
          pastResults={enrichSenateResults(holdover.pastResults, `${holdover.abbr.toLowerCase()}2`)}
        />
      );
    }
  } else {
    // Case 3: seat 1 not up in 2026
    const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
    if (noEl) {
      return (
        <NoElectionPage
          pageId={id}
          state={noEl.state}
          abbr={noEl.abbr}
          incumbent={noEl.incumbent}
          party={noEl.party}
          nextElection={noEl.nextElection}
          termLength={noEl.termLength}
          seatLabel={`U.S. Senate · No Election in ${electionYear}`}
          heldParty={incumbentOwnParty(noEl.incumbent, noEl.party, noEl.pastResults)}
          raceDesc={noEl.raceDesc}
          pastResults={enrichSenateResults(noEl.pastResults, noEl.abbr.toLowerCase())}
        />
      );
    }
  }

  if (!race) notFound();

  const stateTpl = calculateStateTpl(abbr, race.name);
  const demPhoto = race.candidates ? candidatePhoto(race.candidates.dem.name, race.state) : null;
  const repPhoto = race.candidates ? candidatePhoto(race.candidates.rep.name, race.state) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = incumbent ? alignedParty(incumbent) : null;
  const incumbentPts = raceIncumbencyPts(race); // office advantage + competitive-seat extra
  const fundraising = raceFundraising2026("senate", race.id);
  const fundraisingSource = raceFundraisingSource2026("senate", race.id);
  const financeDetail = raceFinanceDetail2026("senate", race.id);
  const moneyTerm = raceMoneyTerm(race);
  const fundraisingPts = moneyTerm.pts;
  const gb = effectiveEnvironment(abbr);
  const polling = racePollingFor(race);
  const pollMargin = polling.avg?.diff ?? null;
  const projectedMargin = computeProjectedMargin(race);
  const forecast = forecastRace(race);
  const countyProjection = projectRaceResults("senate", race.id);
  const raceHistory = getRaceForecastHistory("senate", race);
  const quality = candidateQuality(race);
  const demPct = Math.round(forecast.probability * 100);
  const repPct = 100 - demPct;
  const forecastRating = forecast.rating; // Safe for a decided (same-party or uncontested) race, whatever the margin
  const { bg, text } = getRatingColors(forecastRating);
  // Headline shares are the projected vote's (shares of all votes, others set aside), except in a
  // same-party contest, where the projection makes no split between the two nominees.
  const useProjectedShares = countyProjection != null && !countyProjection.contest.startsWith("same-party");
  const demVoteShare = useProjectedShares ? countyProjection.shares.dem : parseFloat(((100 - projectedMargin) / 2).toFixed(1));
  const repVoteShare = useProjectedShares ? countyProjection.shares.rep : parseFloat(((100 + projectedMargin) / 2).toFixed(1));
  const currentSenatorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentSenatorParty = incumbent?.party ?? race.seatParty ?? null;
  const enrichedPastResults = enrichSenateResults(race.pastResults, senateUrlId(race.id));

  // Prediction-market win probability (Dem share) — averages Polymarket/Kalshi when both exist.
  const marketDemProb = race.polyDem != null && race.kalshiDem != null
    ? (race.polyDem + race.kalshiDem) / 2
    : (race.polyDem ?? race.kalshiDem ?? null);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${projectedMarginColor(projectedMargin)} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
          minHeight: "300px",
        }}
      >
        <div className={`${PAGE_CONTAINER} pt-6 pb-8 sm:pb-10`}>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatePill name={race.name} abbr={abbr} />
                <OfficePill office="senate" />
                <span className={PILL} style={{ background: bg, color: text }}>
                  {forecastRating}
                </span>
                {isSpecialElection(race.electionType) && <SpecialBadge />}
                <HeldPill party={currentSenatorParty} />
              </div>
              <div className="mt-2">
                <h1
                  className="inline"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance", color: "var(--app-text-primary)" }}
                >
                  {race.name} U.S.{" "}
                  <span className="whitespace-nowrap">
                    Senate
                    <SeatArrows {...otherSenateSeat(id)} label="Other Senate seat" />
                  </span>
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
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: projectedMarginColor(projectedMargin) }}
              >
                {formatProjectedMargin(projectedMargin)}
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
              <div className="text-xl font-extrabold tabular-nums sm:text-2xl" style={{ color: pollMargin == null ? "var(--app-text-very-muted)" : leanColor(pollMargin) }}>
                {pollMargin == null ? "—" : fmtLean(pollMargin)}
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                Polling Avg.
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

      <main className={`${PAGE_CONTAINER} pb-10`}>
        <div className="flex flex-col gap-8">

          <section>
            <LedgerSectionHead label="About this Race" />
            <AboutRaceCard
              bare
              title="About this Race"
              description={race.raceDesc ?? "[Placeholder — overview of this Senate seat, its history, key issues, and political context to be filled in.]"}
              items={[
                { label: "Incumbent", value: currentSenatorName, href: candidatePageHref(currentSenatorName, race.state) },
                { label: "Party", value: currentSenatorParty ? (currentSenatorParty === "D" ? "Democrat" : currentSenatorParty === "R" ? "Republican" : "Independent") : "TBD", color: partyTextColor(currentSenatorParty) },
                { label: "Seat Class", value: race.seatClass ? `Class ${race.seatClass}` : "TBD" },
              ]}
            />
          </section>

          <section>
            <LedgerSectionHead label={countyProjection ? "Projected Vote" : "Candidates"} meta={countyProjection ? `${countyProjection.votes.toLocaleString()} estimated votes` : undefined} />
            {race.candidates ? (() => {
              const rows = (
                <CandidatesLedgerSection
                  candidates={withProjectedVotes([
                    { name: race.candidates.dem.name, state: race.state, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent, photo: demPhoto, pct: demVoteShare },
                    { name: race.candidates.rep.name, state: race.state, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent, photo: repPhoto, pct: repVoteShare },
                  ], countyProjection)}
                />
              );
              return countyProjection ? <ProjectedVoteSection p={countyProjection} candidates={rows} state={race.state} /> : rows;
            })() : (
              <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</p>
            )}
          </section>

          <section>
            <LedgerSectionHead label="Fundraising" />
            <FundraisingLedgerSection
              dem={fundraising?.dem ?? null}
              rep={fundraising?.rep ?? null}
              demName={race.candidates?.dem.name}
              repName={race.candidates?.rep.name}
              source={fundraisingSource}
              pendingNote={`no ${electionYear} FEC filings on record for this race yet`}
              fundraisingPts={fundraisingPts}
              typicalGapPct={moneyTerm.structuralGapPct}
              detail={financeDetail}
            />
          </section>

          {polling.avg && race.candidates && (
            <section>
              <LedgerSectionHead label="Polls" meta={`${polling.avg.n} pollster${polling.avg.n === 1 ? "" : "s"} · ${Math.round(polling.weight * 100)}% of the projection`} />
              <RacePollsSection polling={polling} demName={race.candidates.dem.name} repName={race.candidates.rep.name} />
            </section>
          )}

          <section>
            <LedgerSectionHead label="Forecast Calculation" />
            <ForecastCalculationCard
              bare
              tpl={stateTpl}
              genericBallot={gb}
              tplLabel="State TPL"
              tplHref={`/model/${abbr.toLowerCase()}`}
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
          </section>

          {raceHistory && (
            <section>
              <LedgerSectionHead label="Forecast Over Time" meta={`${raceHistory.dates.length} days · today's model on each day's polls`} />
              <RaceForecastTrend dates={raceHistory.dates} probD={raceHistory.probD} margins={raceHistory.margins}
                dem={{ name: race.candidates?.dem.name ?? "Democrat", party: race.candidates?.dem.party ?? "D" }}
                rep={{ name: race.candidates?.rep.name ?? "Republican", party: race.candidates?.rep.party ?? "R" }} />
              <div className="px-1 pt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Today&rsquo;s model rerun on the polls available each day, not what the site said then: a later model change, nominee or filing applies to every day. With no polls the line moves only with the national environment. <Link href="/analysis/internal-methodology#over-time" className="underline underline-offset-2" prefetch={false}>How this is built</Link>.</div>
            </section>
          )}

          <section>
            <LedgerSectionHead label="Projected County Results" meta={countyProjection ? `${countyProjection.votes.toLocaleString()} estimated votes` : undefined} />
            {countyProjection ? (
              <PastElectionCountyMap
                panelSize="wide"
                stateAbbr={abbr}
                stateName={race.name}
                counties={projectedCountyMapEntries(countyProjection)}
                demName={countyProjection.demName}
                repName={countyProjection.repName}
                demParty={countyProjection.demParty}
                repParty={countyProjection.repParty}
                height={280}
                caption={<div className="px-1 pt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>The forecast margin ({countyProjection.margin > 0 ? countyProjection.repParty : countyProjection.demParty}+{Math.abs(countyProjection.margin).toFixed(1)}) spread over the state&apos;s counties by their lean, on the 2026 turnout estimate. <Link href="/analysis/internal-methodology/turnout#county-results" className="underline underline-offset-2" prefetch={false}>How this is built</Link>.</div>}
              />
            ) : (
              <div className="flex h-[280px] items-center justify-center rounded text-center text-xs" style={{ border: "1px dashed var(--app-border)", color: "var(--app-text-very-muted)" }}>No county projection for this race.</div>
            )}
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
                        state={race.state}
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
