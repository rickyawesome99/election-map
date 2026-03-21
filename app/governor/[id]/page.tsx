import { governorData, governorNoElection, NoElectionEntry } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { candidatePhotos } from "@/lib/candidatePhotos";
import BackButton from "@/components/BackButton";
import AppHeader from "@/components/AppHeader";

function stateSlug(name: string) { return name.toLowerCase().replace(/\s+/g, "-"); }

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
    title: `${race.name} Governor Race — 2026 Forecast`,
    description: `2026 Governor forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return { title: `${noEl.state} Governor — No Election in 2026` };
  return { title: "Race Not Found" };
}

function NoElectionPage({ entry, from }: { entry: NoElectionEntry; from: string }) {
  const partyColor = entry.party === "D" ? "var(--party-dem)" : entry.party === "R" ? "var(--party-rep)" : "var(--app-text-primary)";
  const partyLabel = entry.party === "D" ? "Democrat" : entry.party === "R" ? "Republican" : "Independent";
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Link href={`/states/${stateSlug(entry.state)}?from=${encodeURIComponent(from)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{entry.state}</Link>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
              No Election in 2026
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>Gubernatorial Office · No Election This Cycle</p>
        </div>

        {/* Incumbent info */}
        <section className="rounded-xl p-6 mb-6" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>
            Current Incumbent
          </h2>
          <div className="flex items-start gap-6">
            <div className="w-24 h-32 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
              style={{ border: `2px solid ${partyColor}`, background: "var(--app-tab-bg)" }}>
              <svg viewBox="0 0 96 128" className="w-full h-full" fill="none">
                <rect width="96" height="128" fill="var(--app-tab-bg)" />
                <circle cx="48" cy="44" r="22" fill="var(--app-border)" />
                <ellipse cx="48" cy="118" rx="38" ry="28" fill="var(--app-border)" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>{entry.incumbent}</div>
              <div className="text-sm font-medium mb-3" style={{ color: partyColor }}>{partyLabel} · Incumbent</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {[
                  { label: "State", value: entry.state },
                  { label: "Party", value: partyLabel },
                  { label: "Next Election", value: String(entry.nextElection) },
                  { label: "Term Started", value: "TBD" },
                  { label: "Term Ends", value: String(entry.nextElection) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>{label}</div>
                    <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* No election notice */}
        <section className="rounded-xl p-6 mb-6" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>Election Status</h2>
          <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>No Election This Cycle</div>
              <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                This governorship is not on the ballot in 2026. The next election is scheduled for{" "}
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{entry.nextElection}</span>.
                Incumbent and biographical information to be filled in.
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl p-6 mb-6" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>About this Office</h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
            {entry.raceDesc ?? `[Placeholder — overview of the ${entry.state} governorship, its powers, the incumbent's background, key issues, and political context to be filled in.]`}
          </p>
        </section>

        <section className="rounded-xl p-6" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>Past Election Results</h2>
          <div className="flex flex-col gap-4">
            {[entry.nextElection - 4, entry.nextElection - 8].map((year) => (
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

export default async function GovernorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const noEl = governorNoElection.find((e) => e.abbr.toLowerCase() === id.toLowerCase());
  if (noEl) return <NoElectionPage entry={noEl} from={`/governor/${id}`} />;

  const race = governorData.find((r) => r.id.toLowerCase() === id.toLowerCase());
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

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/states/${stateSlug(race.name)}?from=${encodeURIComponent(`/governor/${id}`)}`} className="text-3xl font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{race.name}</Link>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p style={{ color: "var(--app-text-muted)" }}>2026 Gubernatorial Race</p>
        </div>

        {/* Bio section */}
        <section
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
            About this Race
          </h2>
          <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--app-text-primary)" }}>
            {race.raceDesc ?? "[Placeholder — overview of this gubernatorial race, the powers of the office, key issues, and political context to be filled in.]"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "State", value: race.state },
              { label: "Term Length", value: "4 Years" },
              { label: "Current Governor", value: incumbent?.name ?? "TBD" },
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
        {race.candidates ? (
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
                const accentColor = isD ? "var(--party-dem)" : "var(--party-rep)";
                const textColor = isD ? "var(--party-dem)" : "var(--party-rep)";
                return (
                  <div key={candidate.name} className="flex flex-col items-center text-center w-40">
                    {/* Photo */}
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
        ) : (
          <section
            className="rounded-xl p-6 mb-6"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-6" style={{ color: "var(--app-text-muted)" }}>
              Candidates
            </h2>
            <div className="flex items-start justify-center gap-8 md:gap-16">
              {[
                { label: "Democrat", color: "var(--party-dem)", pct: demVoteShare },
                { label: "Republican", color: "var(--party-rep)", pct: repVoteShare },
              ].map(({ label, color, pct }) => (
                <div key={label} className="flex flex-col items-center text-center w-40">
                  <div
                    className="w-32 h-40 rounded-lg overflow-hidden mb-3 flex items-center justify-center"
                    style={{ border: `2px solid ${color}`, background: "var(--app-tab-bg)" }}
                  >
                    <svg viewBox="0 0 128 160" className="w-full h-full" fill="none">
                      <rect width="128" height="160" fill="var(--app-tab-bg)" />
                      <circle cx="64" cy="56" r="28" fill="var(--app-border)" />
                      <ellipse cx="64" cy="148" rx="48" ry="36" fill="var(--app-border)" />
                    </svg>
                  </div>
                  <div className="font-semibold text-sm leading-tight mb-1 italic" style={{ color: "var(--app-text-muted)" }}>
                    TBD
                  </div>
                  <div className="text-xs font-medium mb-1" style={{ color }}>
                    {label}
                  </div>
                  <div className="text-[10px] mb-1 h-4" style={{ color: "var(--app-text-muted)" }} />
                  <div className="text-lg font-bold tabular-nums mt-1" style={{ color }}>
                    {pct}%
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>win probability</div>
                </div>
              ))}
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
              <span style={{ color: "var(--party-dem)" }}>Dem {demPct}%</span>
              <span style={{ color: "var(--party-rep)" }}>Rep {repPct}%</span>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex">
              <div style={{ width: `${demPct}%`, background: "#1b408c" }} className="transition-all duration-300" />
              <div style={{ width: `${repPct}%`, background: "#be1c29" }} className="transition-all duration-300" />
            </div>

            <div className="mt-6">
              <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
                Projected Margin
              </h2>
              <div className="text-4xl font-bold" style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}>
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
              {([
                { label: "RCP Average",     dem: race.rcpDem,    rep: race.rcpRep,    type: "voteshare" },
                { label: "Kalshi Odds",     dem: race.kalshiDem, rep: race.kalshiRep, type: "winprob"   },
                { label: "Polymarket Odds", dem: race.polyDem,   rep: race.polyRep,   type: "winprob"   },
              ] as { label: string; dem?: number; rep?: number; type: string }[]).map(({ label, dem, rep, type }) => {
                const hasData = dem != null && rep != null;
                if (!hasData) return (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
                      <span className="text-xs font-medium italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }} />
                    <div className="text-[10px] mt-0.5 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                      {type === "voteshare" ? "vote share" : "win probability"}
                    </div>
                  </div>
                );
                const demPct = Math.round(dem! * 100);
                const repPct = Math.round(rep! * 100);
                const total = demPct + repPct;
                const dWidth = total > 0 ? (demPct / total) * 100 : 50;
                const winner = demPct >= repPct ? "D" : "R";
                return (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
                      <span className="text-xs font-bold" style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>
                        {winner === "D" ? `Dem +${demPct - repPct}` : `Rep +${repPct - demPct}`}
                      </span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                      <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: "var(--party-dem-muted)" }}>{demPct}%</span>
                      <span className="text-xs" style={{ color: "var(--party-rep-muted)" }}>{repPct}%</span>
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
          <section
            className="rounded-xl p-6 md:col-span-2"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-5" style={{ color: "var(--app-text-muted)" }}>
              Past Election Results
            </h2>
            <div className="flex flex-col gap-6">
              {(race.pastResults && race.pastResults.length > 0
                ? race.pastResults
                : [2022, 2018, 2014].map((year) => ({ year, demPct: 0, repPct: 0, placeholder: true }))
              ).map((res) => {
                const isPlaceholder = !("demPct" in res) || (res as { placeholder?: boolean }).placeholder;
                const winner = res.demPct > res.repPct ? "D" : "R";
                const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                const total = res.demPct + res.repPct;
                const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
                const demName = (res as { demCandidate?: string }).demCandidate ?? "Democratic Candidate";
                const repName = (res as { repCandidate?: string }).repCandidate ?? "Republican Candidate";
                return (
                  <div key={res.year} style={{ opacity: isPlaceholder ? 0.45 : 1 }}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                      {isPlaceholder ? (
                        <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                      ) : (
                        <>
                          {(res as { electionType?: string }).electionType && (
                            <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                              {(res as { electionType?: string }).electionType}
                            </span>
                          )}
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={winner === "D"
                              ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                              : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                          >
                            {winner === "D" ? "D" : "R"}+{margin}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                          {!isPlaceholder && (res as { demIncumbent?: boolean }).demIncumbent && (
                            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                          {isPlaceholder ? "TBD" : demName}
                        </span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {!isPlaceholder && (res as { repIncumbent?: boolean }).repIncumbent && (
                            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>
                          )}
                          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                        </div>
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                          {isPlaceholder ? "TBD" : repName}
                        </span>
                      </div>
                    </div>
                    <div className="flex h-4 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                      {!isPlaceholder && (
                        <>
                          <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                          <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                        </>
                      )}
                    </div>
                    {!isPlaceholder && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold" style={{ color: "var(--party-dem)" }}>{res.demPct}%</span>
                          <span className="text-xs font-semibold" style={{ color: "var(--party-rep)" }}>{res.repPct}%</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          {(res as { demVotes?: number }).demVotes != null
                            ? <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{((res as { demVotes?: number }).demVotes!).toLocaleString()} votes</span>
                            : <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>— votes</span>
                          }
                          {(res as { repVotes?: number }).repVotes != null
                            ? <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{((res as { repVotes?: number }).repVotes!).toLocaleString()} votes</span>
                            : <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>— votes</span>
                          }
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
