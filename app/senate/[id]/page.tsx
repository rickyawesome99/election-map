import { senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { candidatePhotos } from "@/lib/candidatePhotos";
import ThemeToggle from "@/components/ThemeToggle";

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
    title: `${race.name} Senate Race — 2026 Forecast`,
    description: `2026 Senate forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Senate — No Election in 2026` };
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
  seatLabel,
  raceType,
}: {
  state: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  seatLabel: string;
  raceType: "senate" | "governor";
}) {
  const partyColor = party === "D" ? "#1b408c" : party === "R" ? "#be1c29" : "var(--app-text-primary)";
  const partyLabel = party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
  const backLabel = raceType === "senate" ? "Senate" : "Governor";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm transition-colors shrink-0"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Map
        </Link>
        <div className="h-4 w-px shrink-0" style={{ background: "var(--app-border)" }} />
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <span className="text-[10px] uppercase tracking-wider font-semibold shrink-0" style={{ color: "var(--app-text-muted)" }}>
            {backLabel}
          </span>
          <span className="shrink-0" style={{ color: "var(--app-text-very-muted)" }}>/</span>
          <span className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{state}</span>
        </div>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title + banner */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold" style={{ color: "var(--app-text-primary)" }}>{state}</h1>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              No Election in 2026
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>{seatLabel}</p>
        </div>

        {/* Incumbent info */}
        <section
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>
            Current Incumbent
          </h2>

          <div className="flex items-start gap-6">
            {/* Silhouette placeholder */}
            <div
              className="w-24 h-32 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
              style={{ border: `2px solid ${partyColor}`, background: "var(--app-tab-bg)" }}
            >
              <svg viewBox="0 0 96 128" className="w-full h-full" fill="none">
                <rect width="96" height="128" fill="var(--app-tab-bg)" />
                <circle cx="48" cy="44" r="22" fill="var(--app-border)" />
                <ellipse cx="48" cy="118" rx="38" ry="28" fill="var(--app-border)" />
              </svg>
            </div>

            <div className="flex-1">
              <div className="text-xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
                {incumbent}
              </div>
              <div className="text-sm font-medium mb-3" style={{ color: partyColor }}>
                {partyLabel} · Incumbent
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {[
                  { label: "State", value: state },
                  { label: "Party", value: partyLabel },
                  { label: "Next Election", value: String(nextElection) },
                  { label: "Term Started", value: "TBD" },
                  { label: "Term Ends", value: String(nextElection) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
                      {label}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* No election notice */}
        <section
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
            Election Status
          </h2>
          <div
            className="rounded-lg p-4 flex items-start gap-3"
            style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}
          >
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>
                No Election This Cycle
              </div>
              <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                This seat is not on the ballot in November 2026. The next election for this seat is
                scheduled for <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{nextElection}</span>.
                Incumbent and biographical information to be filled in.
              </div>
            </div>
          </div>
        </section>

        {/* Biographical overview (placeholder) */}
        <section
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
            About this Seat
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
            [Placeholder — overview of this seat, its history, the incumbent&apos;s background, key issues, and political context to be filled in.]
          </p>
        </section>

        {/* Past results placeholder */}
        <section
          className="rounded-xl p-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>
            Past Election Results
          </h2>
          <div className="flex flex-col gap-4">
            {[nextElection - 6, nextElection - 12].map((year) => (
              <div key={year} style={{ opacity: 0.45 }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{year}</span>
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-2">
                  <div>
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                    <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>TBD</div>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                  <div className="text-right">
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                    <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>TBD</div>
                  </div>
                </div>
                <div className="flex h-4 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function SenatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Case 1: no-election state (e.g. /senate/az)
  const noEl = senateNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) {
    return (
      <NoElectionPage
        state={noEl.state}
        incumbent={noEl.incumbent}
        party={noEl.party}
        nextElection={noEl.nextElection}
        seatLabel="U.S. Senate · No Election in 2026"
        raceType="senate"
      />
    );
  }

  // Case 2: holdover second senator (e.g. /senate/ma-2)
  const abbr = id.replace(/-2$/, "").toUpperCase();
  const holdover = id.endsWith("-2") ? senateHoldovers.find((e) => e.abbr === abbr) : undefined;
  if (holdover) {
    return (
      <NoElectionPage
        state={holdover.state}
        incumbent={holdover.incumbent}
        party={holdover.party}
        nextElection={holdover.nextElection}
        seatLabel="U.S. Senate · Seat 2 · Not up in 2026"
        raceType="senate"
      />
    );
  }

  // Case 3: 2026 race
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const { bg, text } = getRatingColors(race.rating);
  const marginIsD = race.margin >= 0;
  const demVoteShare = parseFloat(((100 + race.margin) / 2).toFixed(1));
  const repVoteShare = parseFloat(((100 - race.margin) / 2).toFixed(1));

  const demPhoto = race.candidates ? (candidatePhotos[race.candidates.dem.name] ?? null) : null;
  const repPhoto = race.candidates ? (candidatePhotos[race.candidates.rep.name] ?? null) : null;
  const incumbent = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const lastContested = race.pastResults && race.pastResults.length > 0
    ? Math.max(...race.pastResults.map((r) => r.year))
    : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      {/* Nav bar */}
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm transition-colors shrink-0"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Map
        </Link>
        <div className="h-4 w-px shrink-0" style={{ background: "var(--app-border)" }} />
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <span className="text-[10px] uppercase tracking-wider font-semibold shrink-0" style={{ color: "var(--app-text-muted)" }}>Senate</span>
          <span className="shrink-0" style={{ color: "var(--app-text-very-muted)" }}>/</span>
          <span className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{race.name}</span>
        </div>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold" style={{ color: "var(--app-text-primary)" }}>{race.name}</h1>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>2026 U.S. Senate Race · Class 2</p>
        </div>

        {/* Bio section */}
        <section
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
            About this Seat
          </h2>
          <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--app-text-primary)" }}>
            [Placeholder — overview of this Senate seat, its history, key issues, and political context to be filled in.]
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "State", value: race.state },
              { label: "Seat Class", value: "Class 2" },
              { label: "Current Senator", value: incumbent?.name ?? "TBD" },
              { label: "Last Contested", value: lastContested ? String(lastContested) : "TBD" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
                  {label}
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Candidate profiles */}
        {race.candidates && (
          <section
            className="rounded-xl p-6 mb-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-6" style={{ color: "var(--app-text-muted)" }}>
              Candidates
            </h2>
            <div className="flex items-start justify-center gap-8 md:gap-16">
              {[
                { candidate: race.candidates.dem, photo: demPhoto, pct: demVoteShare },
                { candidate: race.candidates.rep, photo: repPhoto, pct: repVoteShare },
              ].map(({ candidate, photo, pct }) => {
                const isD = candidate.party === "D" || candidate.party === "I";
                const partyLabel = candidate.party === "I" ? "Independent" : candidate.party === "D" ? "Democrat" : "Republican";
                const accentColor = isD ? "#1b408c" : "#be1c29";
                const textColor = isD ? "#1b408c" : "#be1c29";
                return (
                  <div key={candidate.name} className="flex flex-col items-center text-center w-40">
                    <div
                      className="w-32 h-40 rounded-lg overflow-hidden mb-3 flex items-center justify-center"
                      style={{ border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
                    >
                      {photo ? (
                        <Image
                          src={photo}
                          alt={candidate.name}
                          width={128}
                          height={160}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <svg viewBox="0 0 128 160" className="w-full h-full" fill="none">
                          <rect width="128" height="160" fill="var(--app-tab-bg)" />
                          <circle cx="64" cy="56" r="28" fill="var(--app-border)" />
                          <ellipse cx="64" cy="148" rx="48" ry="36" fill="var(--app-border)" />
                        </svg>
                      )}
                    </div>
                    <div className="font-semibold text-sm leading-tight mb-1" style={{ color: "var(--app-text-primary)" }}>
                      {candidate.name}
                    </div>
                    <div className="text-xs font-medium mb-1" style={{ color: accentColor }}>
                      {partyLabel}
                    </div>
                    <div className="text-[10px] mb-1 h-4" style={{ color: "var(--app-text-muted)" }}>
                      {candidate.incumbent ? "Incumbent" : ""}
                    </div>
                    <div className="text-lg font-bold tabular-nums mt-1" style={{ color: textColor }}>
                      {pct}%
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>projected vote share</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-6">
              <div className="flex-1 h-px" style={{ background: "var(--app-border)" }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
              <div className="flex-1 h-px" style={{ background: "var(--app-border)" }} />
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Win probability */}
          <section
            className="rounded-xl p-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
              Win Probability
            </h2>
            <div className="flex justify-between text-sm font-semibold mb-3">
              <span style={{ color: "#1b408c" }}>Dem {demPct}%</span>
              <span style={{ color: "#be1c29" }}>Rep {repPct}%</span>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex">
              <div style={{ width: `${demPct}%`, background: "#1b408c" }} className="transition-all duration-300" />
              <div style={{ width: `${repPct}%`, background: "#be1c29" }} className="transition-all duration-300" />
            </div>
            <div className="mt-6">
              <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
                Projected Margin
              </h2>
              <div className="text-4xl font-bold" style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}>
                {marginIsD ? "+" : ""}{race.margin.toFixed(1)}
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
                {marginIsD ? "Democratic" : "Republican"} advantage
              </div>
            </div>
          </section>

          {/* Poll aggregate */}
          <section
            className="rounded-xl p-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
              Poll Aggregate
            </h2>
            <div className="flex flex-col gap-4">
              {[
                { label: "RCP Average", dem: 46, rep: 48, type: "voteshare" },
                { label: "Kalshi Odds", dem: 44, rep: 56, type: "winprob" },
                { label: "Polymarket Odds", dem: 42, rep: 58, type: "winprob" },
              ].map(({ label, dem, rep, type }) => {
                const total = dem + rep;
                const dWidth = (dem / total) * 100;
                const winner = dem >= rep ? "D" : "R";
                return (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
                      <span className="text-xs font-bold" style={{ color: winner === "D" ? "#1b408c" : "#be1c29" }}>
                        {winner === "D" ? `Dem +${dem - rep}` : `Rep +${rep - dem}`}
                      </span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                      <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: "#1b408c99" }}>{dem}%</span>
                      <span className="text-xs" style={{ color: "#be1c2999" }}>{rep}%</span>
                    </div>
                    <div className="text-[10px] mt-0.5 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                      {type === "voteshare" ? "vote share" : "win probability"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Past results */}
          {race.pastResults && race.pastResults.length > 0 && (
            <section
              className="rounded-xl p-6 md:col-span-2"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>
                Past Election Results
              </h2>
              <div className="flex flex-col gap-6">
                {race.pastResults.map((res) => {
                  const winner = res.demPct > res.repPct ? "D" : "R";
                  const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                  const total = res.demPct + res.repPct;
                  const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
                  const demName = res.demCandidate ?? "Democratic Candidate";
                  const repName = res.repCandidate ?? "Republican Candidate";
                  return (
                    <div key={res.year}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={winner === "D"
                            ? { background: "#1b408c33", color: "#1b408c" }
                            : { background: "#be1c2933", color: "#be1c29" }}
                        >
                          {winner === "D" ? "D" : "R"}+{margin}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-2">
                        <div className="flex flex-col">
                          <span className="text-xs mb-0.5" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{demName}</span>
                        </div>
                        <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                        <div className="flex flex-col items-end">
                          <span className="text-xs mb-0.5" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{repName}</span>
                        </div>
                      </div>
                      <div className="flex h-4 rounded-full overflow-hidden mb-1.5">
                        <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                        <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold" style={{ color: "#1b408c" }}>{res.demPct}%</span>
                        <span className="text-xs font-semibold" style={{ color: "#be1c29" }}>{res.repPct}%</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD votes</span>
                        <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD votes</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
