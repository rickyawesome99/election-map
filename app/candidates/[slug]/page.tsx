import { getPrebuiltCandidateSlugs, getCandidatePage } from "@/lib/candidateIndex";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Image from "next/image";
import ScrollToTop from "@/components/ScrollToTop";
import BackLink from "@/components/BackLink";

export const dynamicParams = true;

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

  // Separate history into current 2026 entries and past entries for display
  const currentEntries = candidate.history.filter(h => h.isCurrent);
  const pastEntries = candidate.history.filter(h => !h.isCurrent);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <ScrollToTop />
      <main className="max-w-4xl mx-auto px-4 py-4 sm:px-6">

        {/* Back link */}
        <div className="mb-4">
          <BackLink fallbackHref={backHref} label={backLabel} />
        </div>

        {/* Header card */}
        <section
          className="rounded-xl p-5 mb-3 flex items-start gap-5"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          {/* Photo */}
          <div
            className="w-24 h-28 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ border: `2px solid ${accent}`, background: "var(--app-tab-bg)" }}
          >
            {photo ? (
              <Image
                src={photo}
                alt={candidate.name}
                width={96}
                height={120}
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

          {/* Info */}
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="text-2xl font-bold leading-tight" style={{ color: "var(--app-text-primary)" }}>
              {candidate.name}
            </h1>
            {candidate.currentPosition && (
              <p className="text-sm font-medium mt-0.5 mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                {candidate.currentPosition}
              </p>
            )}
            <div className={`flex items-center gap-2 flex-wrap ${candidate.currentPosition ? "" : "mt-1.5"} mb-2`}>
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: subtle, color: accent }}
              >
                {partyLabel(candidate.party)}
              </span>
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
              >
                {raceTypeLabel(candidate.tab)}
              </span>
              {candidate.currentRace?.incumbent && (
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: subtle, color: accent }}
                >
                  Inc.
                </span>
              )}
            </div>
            {candidate.currentRace && (() => {
              const { bg, text } = getRatingColors(candidate.currentRace.rating);
              const demPct = Math.round(candidate.currentRace.probability * 100);
              const repPct = 100 - demPct;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={candidate.currentRace.racePath}
                    className="text-sm font-semibold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    {candidate.currentRace.raceName}{candidate.tab === "house" ? "" : raceTypeSuffix}
                  </a>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: text }}>
                    {candidate.currentRace.rating}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--party-dem)" }}>D {demPct}%</span>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>/</span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--party-rep)" }}>R {repPct}%</span>
                </div>
              );
            })()}
          </div>
        </section>

        {/* 2026 races (shown when candidate has multiple, e.g. running in both a primary special + general) */}
        {currentEntries.length > 1 && (
          <section
            className="rounded-xl p-3 mb-3"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
          >
            <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
              2026 Races
            </h2>
            <div className="flex flex-col gap-2">
              {currentEntries.map((entry, i) => {
                const entryAccent = partyAccent(entry.party);
                return (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--app-bg)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold shrink-0" style={{ color: entryAccent }}>{partyLabel(entry.party)}</span>
                      <a href={entry.racePath} className="text-sm font-semibold hover:underline truncate" style={{ color: "var(--app-text-primary)" }}>
                        {entry.raceName}
                      </a>
                      {entry.incumbent && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: partySubtle(entry.party), color: entryAccent }}>
                          Inc.
                        </span>
                      )}
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--app-text-muted)" }}>
                      {raceTypeLabel(entry.raceType)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Electoral history */}
        <section
          className="rounded-xl p-3"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
            Electoral History
          </h2>
          {pastEntries.length === 0 ? (
            <div className="text-sm italic" style={{ color: "var(--app-text-muted)" }}>
              No Recent Electoral History
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pastEntries.map((entry, i) => {
                const entryAccent = partyAccent(entry.party);
                // Fall back to vote counts when percentages are equal (e.g. IA-02 2020, 6-vote margin)
                const wonByPct = entry.side === "dem" ? entry.demPct > entry.repPct : entry.repPct > entry.demPct;
                const tiedByPct = entry.demPct === entry.repPct;
                const wonByVotes = tiedByPct && entry.demVotes != null && entry.repVotes != null
                  ? (entry.side === "dem" ? entry.demVotes > entry.repVotes : entry.repVotes > entry.demVotes)
                  : null;
                const won = wonByVotes ?? wonByPct;
                const pct = entry.side === "dem" ? entry.demPct : entry.repPct;
                const oppPct = entry.side === "dem" ? entry.repPct : entry.demPct;
                const oppLabel = entry.side === "dem" ? "R" : "D";
                const oppColor = entry.side === "dem" ? "var(--party-rep)" : "var(--party-dem)";
                const margin = Math.abs(pct - oppPct).toFixed(1);
                const total = entry.demPct + entry.repPct;
                const dWidth = total > 0 ? (entry.demPct / total) * 100 : 50;
                return (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2.5"
                    style={{ background: "var(--app-bg)" }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>
                          {entry.year}
                        </span>
                        <a
                          href={entry.racePath}
                          className="text-sm font-semibold hover:underline truncate"
                          style={{ color: "var(--app-text-muted)" }}
                        >
                          {entry.raceName} · {raceTypeLabel(entry.raceType)}
                        </a>
                        {entry.incumbent && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: partySubtle(entry.party), color: entryAccent }}>
                            Inc.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{
                            background: won ? partySubtle(entry.party) : "var(--app-tab-bg)",
                            color: won ? entryAccent : "var(--app-text-muted)",
                          }}
                        >
                          {won ? "Won" : "Lost"}
                        </span>
                      </div>
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
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
