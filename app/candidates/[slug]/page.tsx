import { getPrebuiltCandidateSlugs, getCandidatePage, type CandidateHistoryEntry } from "@/lib/candidateIndex";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { getRatingColors, fmtMargin, marginColor } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Image from "next/image";
import ScrollToTop from "@/components/ScrollToTop";
import BackLink from "@/components/BackLink";

export const dynamicParams = true;

const GENERAL_ELECTION = "November 3, 2026";

export async function generateStaticParams() {
  return getPrebuiltCandidateSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const candidate = getCandidatePage(slug);
  if (!candidate) return { title: "Candidate Not Found" };
  return { title: `${candidate.name} — Candidate Profile` };
}

function partyLabel(party: "D" | "R" | "I") {
  return party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
}

function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

function partySubtle(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep-subtle)";
  if (party === "I") return "var(--party-ind-subtle)";
  return "var(--party-dem-subtle)";
}

function raceTypeLabel(raceType: "house" | "senate" | "governor") {
  if (raceType === "house") return "U.S. House";
  if (raceType === "senate") return "U.S. Senate";
  return "Governor";
}

// Fall back to vote counts when percentages are tied (e.g. IA-02 2020, 6-vote margin)
function wonEntry(entry: CandidateHistoryEntry): boolean {
  const wonByPct = entry.side === "dem" ? entry.demPct > entry.repPct : entry.repPct > entry.demPct;
  const tiedByPct = entry.demPct === entry.repPct;
  const wonByVotes = tiedByPct && entry.demVotes != null && entry.repVotes != null
    ? (entry.side === "dem" ? entry.demVotes > entry.repVotes : entry.repVotes > entry.demVotes)
    : null;
  return wonByVotes ?? wonByPct;
}

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const candidate = getCandidatePage(slug);
  if (!candidate) notFound();

  const photo = candidatePhotos[candidate.name] ?? null;
  const accent = partyAccent(candidate.party);
  const subtle = partySubtle(candidate.party);

  const backHref = candidate.currentRace?.racePath ?? `/${candidate.tab}`;
  const raceTypeSuffix = candidate.tab === "house" ? " House" : candidate.tab === "senate" ? " Senate" : " Governor";
  const backLabel =
    candidate.currentRace
      ? candidate.currentRace.raceName + raceTypeSuffix
      : candidate.tab === "house" ? "House Races" : candidate.tab === "senate" ? "Senate Races" : "Governor Races";

  const currentEntries = candidate.history.filter(h => h.isCurrent);
  const pastEntries = candidate.history.filter(h => !h.isCurrent);
  const otherCurrentEntries = currentEntries.filter(e => e.raceId !== candidate.currentRace?.id);

  const wins = pastEntries.filter(wonEntry).length;
  const losses = pastEntries.length - wins;

  const positionLabel = candidate.currentPosition ? candidate.currentPosition.split(" · ")[0] : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <ScrollToTop />

      <div
        style={{
          background: `linear-gradient(to bottom, color-mix(in srgb, ${accent} 10%, var(--app-bg)) 0px, var(--app-bg) 460px)`,
        }}
      >
        <main className="mx-auto px-4 py-4 sm:px-6" style={{ maxWidth: "960px" }}>

          <BackLink fallbackHref={backHref} label={backLabel} />

          <div className="grid grid-cols-1 gap-7 mt-6 md:grid-cols-[260px_1fr] md:items-start">

            {/* Profile column */}
            <div>
              <div
                className="w-[148px] overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: "4 / 5", borderRadius: "10px", border: `2px solid ${accent}`, background: "var(--app-tab-bg)" }}
              >
                {photo ? (
                  <Image
                    src={photo}
                    alt={candidate.name}
                    width={148}
                    height={185}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
                    <rect width="64" height="80" fill="var(--app-tab-bg)" />
                    <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
                    <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
                  </svg>
                )}
              </div>

              <h1
                className="mt-3.5 leading-tight"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.6rem, 3.5vw, 2.1rem)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--app-text-primary)" }}
              >
                {candidate.name}
              </h1>

              {positionLabel && (
                <p className="text-[13.5px] font-medium mt-1" style={{ color: "var(--app-text-muted)" }}>
                  {positionLabel}
                </p>
              )}

              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: subtle, color: accent }}>
                  {partyLabel(candidate.party)}
                </span>
                {candidate.state && (
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
                  >
                    {candidate.state}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-very-muted)" }}>
                  Race Record
                </div>
                <div className="text-[1.15rem] font-extrabold tabular-nums mt-0.5">
                  {wins}W&ndash;{losses}L
                </div>
              </div>
            </div>

            {/* Race column */}
            <div className="flex flex-col gap-9">

              {candidate.currentRace && (() => {
                const { bg, text } = getRatingColors(candidate.currentRace.rating);
                const opponent = candidate.currentRace.opponent;
                const opponentAccent = opponent ? partyAccent(opponent.party) : null;
                return (
                  <section>
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                      <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
                        {currentEntries.length > 1 ? "2026 Races" : "2026 Race"}
                      </h2>
                      <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                        General &middot; {GENERAL_ELECTION}
                      </span>
                    </div>

                    <a href={candidate.currentRace.racePath} className="block py-5" style={{ borderBottom: otherCurrentEntries.length > 0 ? "1px solid var(--app-border)" : "none" }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
                            {candidate.currentRace.raceName} &middot; {raceTypeLabel(candidate.currentRace.raceType)}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {opponent && (
                              <span className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: opponentAccent! }}>
                                {opponent.name}
                              </span>
                            )}
                            <span className="truncate" style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700, color: accent }}>
                              {candidate.name}
                              {candidate.currentRace.incumbent && (
                                <span className="text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}> Inc.</span>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="tabular-nums font-extrabold" style={{ fontSize: "1.6rem", lineHeight: 1, color: marginColor(candidate.currentRace.margin) }}>
                            {fmtMargin(candidate.currentRace.margin)}
                          </div>
                          <div className="mt-1.5">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>
                              {candidate.currentRace.rating}
                            </span>
                          </div>
                        </div>
                      </div>
                    </a>

                    {otherCurrentEntries.map((entry, i) => (
                      <a
                        key={i}
                        href={entry.racePath}
                        className="flex items-center justify-between gap-3 py-3.5"
                        style={{ borderBottom: i < otherCurrentEntries.length - 1 ? "1px solid var(--app-border)" : "none" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold hover:underline truncate" style={{ color: "var(--app-text-primary)" }}>
                            {entry.raceName}
                          </span>
                          {entry.incumbent && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: partySubtle(entry.party), color: partyAccent(entry.party) }}>
                              Inc.
                            </span>
                          )}
                        </div>
                        <span className="text-xs shrink-0" style={{ color: "var(--app-text-muted)" }}>
                          {raceTypeLabel(entry.raceType)}
                        </span>
                      </a>
                    ))}
                  </section>
                );
              })()}

              <section>
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                  <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
                    Electoral History
                  </h2>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                    {pastEntries.length} prior race{pastEntries.length !== 1 ? "s" : ""} on file
                  </span>
                </div>

                {pastEntries.length === 0 ? (
                  <div className="text-sm italic py-5" style={{ color: "var(--app-text-muted)" }}>
                    No Recent Electoral History
                  </div>
                ) : (
                  pastEntries.map((entry, i) => {
                    const entryAccent = partyAccent(entry.party);
                    const won = wonEntry(entry);
                    const pct = entry.side === "dem" ? entry.demPct : entry.repPct;
                    const oppPct = entry.side === "dem" ? entry.repPct : entry.demPct;
                    const oppLabel = entry.side === "dem" ? "R" : "D";
                    const oppColor = entry.side === "dem" ? "var(--party-rep)" : "var(--party-dem)";
                    const margin = Math.abs(pct - oppPct).toFixed(1);
                    const total = entry.demPct + entry.repPct;
                    const dWidth = total > 0 ? (entry.demPct / total) * 100 : 50;
                    return (
                      <div key={i} className="py-5" style={{ borderBottom: i < pastEntries.length - 1 ? "1px solid var(--app-border)" : "none" }}>
                        <div className="flex items-start justify-between gap-4 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>
                              {entry.year}
                            </span>
                            <a
                              href={entry.racePath}
                              className="text-sm font-semibold hover:underline truncate"
                              style={{ color: "var(--app-text-muted)" }}
                            >
                              {entry.raceName} &middot; {raceTypeLabel(entry.raceType)}
                            </a>
                            {entry.incumbent && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: partySubtle(entry.party), color: entryAccent }}>
                                Inc.
                              </span>
                            )}
                          </div>
                          <span
                            className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                            style={{
                              background: won ? partySubtle(entry.party) : "var(--app-tab-bg)",
                              color: won ? entryAccent : "var(--app-text-muted)",
                            }}
                          >
                            {won ? "Won" : "Lost"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }}>
                            <div className="h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                            <div className="h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: oppColor }}>
                            {oppLabel} {oppPct.toFixed(1)}%
                          </span>
                          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: entryAccent }}>
                            {partyLabel(entry.party)[0]} {pct.toFixed(1)}%
                          </span>
                          <span className="text-xs tabular-nums shrink-0" style={{ color: entryAccent }}>
                            {won ? `+${margin}` : `-${margin}`}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
