import Link from "next/link";
import type { CandidateHistoryEntry } from "@/lib/candidateIndex";
import { candidatePhotos } from "@/lib/candidatePhotos";
import { getRatingColors, fmtMargin, marginColor } from "@/lib/colorScale";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import ScrollToTop from "@/components/ScrollToTop";
import BackLink from "@/components/BackLink";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import type { WarSlim } from "@/lib/modelSlices";
import { WAR_BAD, WAR_GOOD, careerWar } from "@/components/tpl/format";
import type { StateLegRace } from "@/lib/stateLegCandidateIndex";
import { StateLegCurrentRow } from "@/components/candidates/StateLegRaceRow";
import { CandidateRaceRow, ContestantLines, MarginBar, type Contestant } from "@/components/candidates/CandidateRaceRow";
import { statesData } from "@/data/statesData";
import { candidateSlugAlias, getCandidatePagePayload } from "@/lib/candidatePages";

// ~3,500 federal and ~37,000 state legislative candidate pages: rendered on first request and
// cached until the next deploy rather than prebuilt, the same arrangement as the county pages.
// A person with both records (a state legislator who ran for Congress) gets one page: the two
// indexes are joined on name and state, and either index's slug resolves to it. The join and
// every figure on the page are precomputed into data/generated/candidate-pages/ by
// scripts/buildCandidatePages.ts (lib/candidatePageBuild.ts holds the computation), so this route
// imports no model and parses one state's shard on its first request.
export const dynamicParams = true;

const GENERAL_ELECTION = "November 3, 2026";

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getCandidatePagePayload(slug);
  if (!page) return { title: "Candidate Not Found" };
  const { federal, leg } = page;
  const name = federal?.name ?? leg!.name;
  const canonical = federal ? `/candidates/${federal.slug}` : `/candidates/${leg!.slug}`;
  return { title: `${name} — Candidate Profile`, alternates: { canonical } };
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

const WAR_OFFICE = { house: "H", senate: "S", governor: "G", president: "P" } as const;

// The WAR rows behind one history entry: the seat's single row (matched on office, year and the
// seat id that ends the race path), or every state's row for a presidential year.
function warRowsFor(war: WarSlim[], entry: CandidateHistoryEntry): WarSlim[] {
  if (entry.raceType === "president") return war.filter((r) => r.office === "P" && r.year === entry.year);
  const seatId = entry.racePath.split("/").pop();
  return war.filter((r) => r.office === WAR_OFFICE[entry.raceType] && r.year === entry.year && r.seatId === seatId);
}

const fmtWar = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const warColor = (v: number) => (v > 0 ? WAR_GOOD : v < 0 ? WAR_BAD : "var(--app-text-muted)");
const warBg = (v: number) => `color-mix(in srgb, ${warColor(v)} 14%, transparent)`;

// Major parties by letter, anyone else by their own label ("Libertarian").
const legPartyTag = (party: string, label?: string) => (party === "D" || party === "R" ? party : label ? label.replace(/ Party$/, "") : "I");
// Biggest vote first; candidates without a count go last.
const byVotes = (a: Contestant, b: Contestant) =>
  a.votes != null || b.votes != null ? (b.votes ?? -1) - (a.votes ?? -1) : (b.pct ?? -1) - (a.pct ?? -1);

function raceTypeLabel(raceType: "house" | "senate" | "governor" | "president") {
  if (raceType === "house") return "U.S. House";
  if (raceType === "senate") return "U.S. Senate";
  if (raceType === "president") return "President";
  return "Governor";
}

// Fall back to vote counts when percentages are tied (e.g. IA-02 2020, 6-vote margin)
function wonEntry(entry: CandidateHistoryEntry): boolean {
  // Presidential elections are decided by the Electoral College, not the national
  // popular vote (e.g. 2016: Clinton led the popular vote but lost the election).
  if (entry.raceType === "president" && entry.demEV != null && entry.repEV != null) {
    return entry.side === "dem" ? entry.demEV > entry.repEV : entry.repEV > entry.demEV;
  }
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
  const page = getCandidatePagePayload(slug);
  if (!page) {
    // An alternate spelling of a merged person ("timi-brownpowers-ia"): send it to the page.
    const alias = candidateSlugAlias(slug);
    if (alias) permanentRedirect(`/candidates/${alias}`);
    notFound();
  }
  const { federal, leg } = page;

  // The federal record leads the profile where there is one; the state legislative record fills in.
  const legParty: "D" | "R" | "I" = leg?.party === "D" || leg?.party === "R" ? leg.party : "I";
  const candidate = federal ?? {
    name: leg!.name, slug: leg!.slug, party: legParty, tab: "house" as const, state: leg!.stateName,
    currentPosition: leg!.position, currentRace: undefined, history: [],
  };
  const photo = candidatePhotos[candidate.name] ?? null;
  const accent = partyAccent(candidate.party);
  const subtle = partySubtle(candidate.party);

  const legCurrent = (leg?.races ?? []).filter((r) => r.isCurrent);
  const legPast = (leg?.races ?? []).filter((r) => !r.isCurrent);
  const legPositionHref = leg?.positionHref ?? legCurrent[0]?.href ?? legPast[0]?.href;
  // Precomputed per race, aligned with leg.races (lib/candidatePageBuild.ts).
  const legRace = (race: StateLegRace) => page.legRaces[leg!.races.indexOf(race)];
  const legMoney = (race: StateLegRace) => legRace(race)?.money ?? null;
  // A past Senate or Governor row opens that election's own page; everything else opens the seat page.
  const historyHref = (entry: CandidateHistoryEntry) => page.historyHrefs[candidate.history.indexOf(entry)] ?? entry.racePath;

  const backHref = candidate.currentRace?.racePath ?? (federal ? (candidate.tab === "president" ? "/analysis/popular-vote" : `/${candidate.tab}`) : legPositionHref ?? "/legislatures");
  const raceTypeSuffix = candidate.tab === "house" ? " House" : candidate.tab === "senate" ? " Senate" : candidate.tab === "governor" ? " Governor" : " President";
  const backLabel =
    candidate.currentRace
      ? candidate.currentRace.raceName + raceTypeSuffix
      : federal
        ? candidate.tab === "house" ? "House Races" : candidate.tab === "senate" ? "Senate Races" : candidate.tab === "governor" ? "Governor Races" : "Popular Vote"
        : (legCurrent[0] ?? legPast[0]) ? `${leg!.stateName} ${(legCurrent[0] ?? legPast[0]).chamberLabel}` : "State Legislatures";

  const currentEntries = candidate.history.filter(h => h.isCurrent);
  const pastEntries = candidate.history.filter(h => !h.isCurrent);
  const otherCurrentEntries = currentEntries.filter(e => e.raceId !== candidate.currentRace?.id);

  const wins = pastEntries.filter(wonEntry).length + (leg?.wins ?? 0);
  const losses = (pastEntries.length - pastEntries.filter(wonEntry).length) + (leg?.losses ?? 0);

  const positionLabel = candidate.currentPosition ? candidate.currentPosition.split(" · ")[0] : leg?.position ? leg.position.split(" · ")[0] : null;
  // A state legislator's seat is named next to the title and links to the district.
  const positionDetail = !federal?.currentPosition && leg?.position ? leg.position.split(" · ")[1] : null;

  // One timeline: federal and state legislative races interleaved, newest first.
  type Item = { year: number; order: number; node: React.ReactNode };
  const legProjections = new Map(legCurrent.map((r) => [r, legRace(r)?.projection ?? null]));
  const hasCurrent = !!candidate.currentRace || legCurrent.length > 0;
  const totalPast = pastEntries.length + legPast.length;

  // Wins Above Replacement, the same numbers as the TPL tab's candidate record (/model/candidates).
  const war: WarSlim[] = page.war;
  const career = careerWar(war);
  const isPresidential = war.some((r) => r.office === "P");
  const lastWar = war[war.length - 1];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <ScrollToTop />

      <div
        style={{
          background: `linear-gradient(to bottom, color-mix(in srgb, ${accent} 10%, var(--app-bg)) 0px, var(--app-bg) 460px)`,
        }}
      >
        <main className={`${PAGE_CONTAINER} py-4`}>

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
                  {positionDetail && legPositionHref ? <Link prefetch={false} href={legPositionHref} className="hover:underline">{positionLabel} &middot; {positionDetail}</Link> : positionLabel}
                </p>
              )}

              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: subtle, color: accent }}>
                  {leg && !federal && leg.party === "O" && legCurrent[0]?.partyLabel ? legCurrent[0].partyLabel.replace(/ Party$/, "") : partyLabel(candidate.party)}
                </span>
                {candidate.state && (() => {
                  const st = statesData.find((s) => s.name === candidate.state);
                  const cls = "text-xs font-semibold px-2.5 py-0.5 rounded-full";
                  const style = { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" };
                  return st
                    ? <Link prefetch={false} href={`/states/${st.id}`} aria-label={`View ${st.name} state page`} className={`${cls} hover:underline`} style={style}>{candidate.state}</Link>
                    : <span className={cls} style={{ ...style, color: "var(--app-text-muted)" }}>{candidate.state}</span>;
                })()}
              </div>

              {leg?.outgoing2026 && (
                <p className="text-[12px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  Not seeking re-election to <Link prefetch={false} href={leg.outgoing2026.href} className="hover:underline font-semibold">{leg.stateName} {leg.outgoing2026.districtShort}</Link> in 2026: {leg.outgoing2026.reason || leg.outgoing2026.category}.
                </p>
              )}

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-very-muted)" }}>
                  Race Record
                </div>
                <div className="text-[1.15rem] font-extrabold tabular-nums mt-0.5">
                  <span style={{ color: wins ? WAR_GOOD : "var(--app-text-muted)" }}>{wins}W</span>
                  <span style={{ color: "var(--app-text-very-muted)" }}>&ndash;</span>
                  <span style={{ color: WAR_BAD }}>{losses}L</span>
                </div>
                {leg && legPast.length > 0 && (
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text-very-muted)" }}>
                    {legPast.length} state legislative general{legPast.length === 1 ? "" : "s"} on file{legPast.some((r) => r.winner == null) ? ", some without a marked winner" : ""}
                  </div>
                )}
              </div>

              {lastWar && (
                <div className="mt-4">
                  <div className="flex gap-6">
                    <div title={isPresidential ? "Average WAR per state per election: presidential WAR is scored state by state" : "Sum of WAR over every scored race: points of margin above a generic candidate of the same party against this opponent"}>
                      <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-very-muted)" }}>Career WAR</div>
                      <div className="text-[1.15rem] font-extrabold tabular-nums mt-0.5" style={{ color: warColor(career) }}>{fmtWar(career)}</div>
                    </div>
                    <div title="The candidate's own effect as of their latest race: past residuals faded 0.8 per year">
                      <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-very-muted)" }}>Effect</div>
                      <div className="text-[1.15rem] font-extrabold tabular-nums mt-0.5" style={{ color: warColor(lastWar.effect) }}>{fmtWar(lastWar.effect)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    {isPresidential
                      ? <>avg of {war.length} state results &middot;{" "}</>
                      : <>{war.length} scored race{war.length === 1 ? "" : "s"} &middot;{" "}</>}
                    <Link prefetch={false} href={`/model/candidates?c=${candidate.slug}`} className="underline hover:no-underline">WAR breakdown &rsaquo;</Link>
                  </div>
                </div>
              )}
            </div>

            {/* Race column */}
            <div className="flex flex-col gap-9">

              {hasCurrent && (() => {
                const { bg, text } = candidate.currentRace ? getRatingColors(candidate.currentRace.rating) : { bg: "", text: "" };
                const opponent = candidate.currentRace?.opponent;
                const nCurrent = currentEntries.length + legCurrent.length;
                return (
                  <section>
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                      <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
                        {nCurrent > 1 ? "2026 Races" : "2026 Race"}
                      </h2>
                      <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                        General &middot; {GENERAL_ELECTION}
                      </span>
                    </div>

                    {candidate.currentRace && (() => {
                      const r = candidate.currentRace;
                      // Projected two-party vote share per side, from the R-positive forecast margin.
                      const mine = r.side === "dem" ? 50 - r.margin / 2 : 50 + r.margin / 2;
                      const rows: Contestant[] = [
                        { name: candidate.name, party: candidate.party, partyTag: candidate.party, self: true, incumbent: r.incumbent, pct: mine, won: mine > 50 },
                        ...(opponent ? [{ name: opponent.name, party: opponent.party, partyTag: opponent.party, href: `/candidates/${opponent.slug}`, pct: 100 - mine, won: mine < 50 }] : []),
                      ].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
                      return (
                        <div className="py-4" style={{ borderBottom: otherCurrentEntries.length > 0 || legCurrent.length > 0 ? "1px solid var(--app-border)" : "none" }}>
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <Link prefetch={false} href={r.racePath} className="truncate text-sm font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
                              {r.raceName} &middot; {raceTypeLabel(r.raceType)} <span aria-hidden>&rsaquo;</span>
                            </Link>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: bg, color: text }}>{r.rating}</span>
                          </div>
                          <ContestantLines rows={rows} />
                          <div className="mt-2"><MarginBar demShare={50 - r.margin / 2} margin={r.margin} /></div>
                          <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Forecast margin</div>
                        </div>
                      );
                    })()}

                    {otherCurrentEntries.map((entry, i) => (
                      <Link prefetch={false}
                        key={i}
                        href={entry.racePath}
                        className="flex items-center justify-between gap-3 py-3.5"
                        style={{ borderBottom: i < otherCurrentEntries.length - 1 || legCurrent.length > 0 ? "1px solid var(--app-border)" : "none" }}
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
                      </Link>
                    ))}
                    {legCurrent.map((race, i) => (
                      <StateLegCurrentRow key={`${race.chamber}-${race.district}-${i}`} race={race} projection={legProjections.get(race) ?? null} money={legMoney(race)} last={i === legCurrent.length - 1} />
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
                    {totalPast} prior race{totalPast !== 1 ? "s" : ""} on file
                  </span>
                </div>

                {totalPast === 0 ? (
                  <div className="text-sm italic py-5" style={{ color: "var(--app-text-muted)" }}>
                    No Recent Electoral History
                  </div>
                ) : (
                  ([
                    ...pastEntries.map((entry, i): Item => ({ year: entry.year, order: 0, node: renderFederal(entry, i) })),
                    ...legPast.map((race, i): Item => ({ year: race.year, order: 1, node: renderLeg(race, i) })),
                  ] as Item[]).sort((a, b) => b.year - a.year || a.order - b.order).map((item, i, all) => (
                    <div key={i} style={{ borderBottom: i < all.length - 1 ? "1px solid var(--app-border)" : "none" }}>{item.node}</div>
                  ))
                )}
              </section>

            </div>
          </div>
        </main>
      </div>
    </div>
  );

  function renderFederal(entry: CandidateHistoryEntry, i: number) {
    const won = wonEntry(entry);
    const mine = entry.side === "dem";
    const ev = mine ? entry.demEV : entry.repEV;
    const oppEv = mine ? entry.repEV : entry.demEV;
    const evNote = (n: number | undefined) => (entry.raceType === "president" && n != null ? `${n} EV` : undefined);
    const contestants: Contestant[] = [
      { name: candidate.name, party: entry.party, partyTag: entry.party, self: true, incumbent: entry.incumbent, won,
        votes: mine ? entry.demVotes : entry.repVotes, pct: mine ? entry.demPct : entry.repPct, note: evNote(ev) },
    ];
    if (entry.oppName) contestants.push({
      name: entry.oppName, party: entry.oppParty, partyTag: entry.oppParty, href: entry.oppSlug ? `/candidates/${entry.oppSlug}` : undefined, won: !won,
      votes: mine ? entry.repVotes : entry.demVotes, pct: mine ? entry.repPct : entry.demPct, note: evNote(oppEv),
    });
    const two = entry.demPct + entry.repPct;
    const entryWar = warRowsFor(war, entry);
    return (
      <CandidateRaceRow key={i} year={entry.year} title={`${entry.raceName} · ${raceTypeLabel(entry.raceType)}`} href={historyHref(entry)} won={won}
        contestants={contestants.sort(byVotes)} demShare={two > 0 ? (entry.demPct / two) * 100 : null} margin={entry.repPct - entry.demPct}>
        {entryWar.length === 1 && (() => {
          const w = entryWar[0];
          return (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              <span title="Generic vs generic: the seat's lean plus the year's environment, incumbency and structural money">Expected <b style={{ color: marginColor(w.expected) }}>{fmtMargin(w.expected)}</b></span>
              <span title="Expected, adjusted for this specific opponent's own effect">vs opponent <b style={{ color: marginColor(w.vsOpp) }}>{fmtMargin(w.vsOpp)}</b></span>
              <span title="Wins Above Replacement: actual margin minus vs-opponent, signed toward this candidate">WAR <b className="rounded px-1.5 py-0.5" style={{ color: warColor(w.war), background: warBg(w.war) }}>{fmtWar(w.war)}</b></span>
            </div>
          );
        })()}
        {entryWar.length > 1 && (() => {
          const avg = entryWar.reduce((t, r) => t + r.war, 0) / entryWar.length;
          const best = entryWar.reduce((b, r) => (r.war > b.war ? r : b));
          const worst = entryWar.reduce((b, r) => (r.war < b.war ? r : b));
          return (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              <span title="Presidential WAR is scored state by state; this is the average over the states">WAR <b className="rounded px-1.5 py-0.5" style={{ color: warColor(avg), background: warBg(avg) }}>{fmtWar(avg)}</b> avg across {entryWar.length} states</span>
              <span>best {best.state} <b style={{ color: warColor(best.war) }}>{fmtWar(best.war)}</b></span>
              <span>worst {worst.state} <b style={{ color: warColor(worst.war) }}>{fmtWar(worst.war)}</b></span>
            </div>
          );
        })()}
      </CandidateRaceRow>
    );
  }

  // A past state legislative general, in the same layout minus the model figures (no WAR is
  // scored for these races) and the fundraising line.
  function renderLeg(race: StateLegRace, i: number) {
    const pctOf = (v: number | null) => (race.totalVotes && v != null ? (v / race.totalVotes) * 100 : null);
    const contestants: Contestant[] = [
      { name: candidate.name, party: race.party, partyTag: legPartyTag(race.party, race.partyLabel), self: true, incumbent: race.incumbent, won: race.winner,
        votes: race.votes, pct: race.share ?? pctOf(race.votes), note: race.writeIn ? "write-in" : undefined },
      ...race.others.map((o): Contestant => ({
        name: o.name, party: o.party, partyTag: legPartyTag(o.party, o.partyLabel), href: `/candidates/${o.slug}`, incumbent: o.incumbent, won: o.winner,
        votes: o.votes, pct: pctOf(o.votes), note: o.writeIn ? "write-in" : undefined,
      })),
    ];
    const two = (race.demVotes ?? 0) + (race.repVotes ?? 0);
    return (
      <CandidateRaceRow key={`leg-${i}`} year={race.year} won={race.winner} href={race.href}
        title={`${race.stateName} ${race.chamberLabel} · ${race.districtShort}${race.post ? ` (${race.post})` : ""}`}
        badges={<>
          {race.uncontested && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>Unopposed</span>}
          {race.seats != null && race.seats > 1 && <span className="text-[10px] shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{race.seats} seats</span>}
          {race.era !== "current" && <span className="text-[10px] shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{race.eraLabel}</span>}
        </>}
        contestants={contestants.sort(byVotes)} demShare={two > 0 ? ((race.demVotes ?? 0) / two) * 100 : null} margin={race.noCount ? null : race.margin}>
        {race.noCount && <div className="mt-2 text-xs italic" style={{ color: "var(--app-text-muted)" }}>Declared elected without a vote: the state printed no count for this race.</div>}
      </CandidateRaceRow>
    );
  }
}
