import { senateData, senateNoElection, senateHoldovers, electionYear } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import { candidatePhotos } from "@/lib/candidatePhotos";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";
import { AboutRaceCard, CandidatesSection, CurrentIncumbentCard, ElectionStatusCard, MarginAndWinProbabilityCard, PastElectionResultsSection, PollAggregateCard } from "@/components/RaceDetailSections";

function stateSlug(name: string) { return name.toLowerCase().replace(/\s+/g, "-"); }
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

export async function generateStaticParams() {
  return [
    ...senateData.map((race) => ({ id: race.id.toLowerCase() })),
    ...senateNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
    ...senateHoldovers.map((e) => ({ id: `${e.abbr.toLowerCase()}-2` })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (race) return {
    title: `${race.name} Senate Race — ${electionYear} Forecast`,
    description: `${electionYear} Senate forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Senate — No Election in ${electionYear}` };
  const abbr = id.replace(/-2$/, "").toUpperCase();
  const holdover = senateHoldovers.find((e) => e.abbr === abbr);
  if (holdover) return { title: `${holdover.state} Senate (Seat 2) — Incumbent Info` };
  return { title: "Race Not Found" };
}

// ── Shared "no election this cycle" page ─────────────────────────────────────

function NoElectionPage({
  state,
  incumbent,
  party,
  nextElection,
  termLength,
  seatLabel,
  from,
  raceDesc,
  pastResults,
}: {
  state: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  seatLabel: string;
  from: string;
  raceDesc?: string;
  pastResults?: { year: number; demPct: number; repPct: number; demCandidate?: string; repCandidate?: string; demVotes?: number; repVotes?: number; electionType?: string }[];
}) {
  const partyLabel = party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
  const termYears = termLength ?? 6;
  const termStarted = String(nextElection - termYears);
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title + banner */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Link href={`/states/${stateSlug(state)}?from=${encodeURIComponent(from)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{state}</Link>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              No Election in {electionYear}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>{seatLabel}</p>
        </div>

        <CurrentIncumbentCard
          incumbentName={incumbent}
          party={party}
          items={[
            { label: "State", value: state },
            { label: "Party", value: partyLabel },
            { label: "Next Election", value: String(nextElection) },
            { label: "Term Started", value: termStarted },
          ]}
          description={raceDesc ?? "[Placeholder — overview of this seat, its history, the incumbent's background, key issues, and political context to be filled in.]"}
        />

        <ElectionStatusCard
          message={`This seat is not on the ballot in November ${electionYear}. The next election for this seat is scheduled for ${nextElection}. Incumbent and biographical information to be filled in.`}
        />

        <PastElectionResultsSection
          results={pastResults}
          fallbackYears={[nextElection - termYears, nextElection - termYears * 2]}
          showElectionType
          showSpecialBadgeForSpecialElections
        />
      </main>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function SenatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abbr = id.replace(/-2$/, "").toUpperCase();
  const isSeat2Url = id.toLowerCase().endsWith("-2");

  // Case 1: 2026 active race — checked FIRST to avoid collision with holdover entries
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (race) {
    // fall through to race rendering below
  } else if (isSeat2Url) {
    // Case 2: holdover second senator (e.g. /senate/ma-2) — seat 2 not up in 2026
    const holdover = senateHoldovers.find((e) => e.abbr === abbr);
    if (holdover) {
      return (
        <NoElectionPage
          state={holdover.state}
          incumbent={holdover.incumbent}
          party={holdover.party}
          nextElection={holdover.nextElection}
          termLength={holdover.termLength}
          seatLabel={`U.S. Senate · Seat 2 · Not up in ${electionYear}`}
          from={`/senate/${id}`}
          raceDesc={holdover.raceDesc}
          pastResults={holdover.pastResults}
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
          incumbent={noEl.incumbent}
          party={noEl.party}
          nextElection={noEl.nextElection}
          termLength={noEl.termLength}
          seatLabel={`U.S. Senate · No Election in ${electionYear}`}
          from={`/senate/${id}`}
          raceDesc={noEl.raceDesc}
          pastResults={noEl.pastResults}
        />
      );
    }
  }

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
  const currentSenatorName = race.seatHolder ?? incumbent?.name ?? "TBD";
  const currentSenatorParty = incumbent?.party ?? race.seatParty ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/senate/${id}`)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
            {isSpecialElection(race.electionType) && <SpecialBadge />}
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>
            {electionYear} {race.electionType ?? "Regular"} U.S. Senate Race{race.seatClass ? ` · Class ${race.seatClass}` : ""}
          </p>
        </div>

        <AboutRaceCard
          title="About this Race"
          description={race.raceDesc ?? "[Placeholder — overview of this Senate seat, its history, key issues, and political context to be filled in.]"}
          items={[
            { label: "State", value: race.state },
            { label: "Seat Class", value: race.seatClass ? `Class ${race.seatClass}` : "TBD" },
            { label: "Incumbent", value: currentSenatorName },
            { label: "Party", value: currentSenatorParty ? (currentSenatorParty === "D" ? "Democrat" : currentSenatorParty === "R" ? "Republican" : "Independent") : "TBD" },
          ]}
        />

        {race.candidates && (
          <CandidatesSection
            candidates={[
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
            ]}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MarginAndWinProbabilityCard margin={race.margin} demPct={demPct} repPct={repPct} />

          <PollAggregateCard
            rows={[
              { label: "RCP Average", dem: race.rcpDem, rep: race.rcpRep, type: "voteshare" },
              { label: "Kalshi Odds", dem: race.kalshiDem, rep: race.kalshiRep, type: "winprob" },
              { label: "Polymarket Odds", dem: race.polyDem, rep: race.polyRep, type: "winprob" },
            ]}
          />

          {/* Past results */}
          {race.pastResults && race.pastResults.length > 0 && (
            <PastElectionResultsSection results={race.pastResults} fallbackYears={[]} showElectionType />
          )}
        </div>
      </main>
    </div>
  );
}
