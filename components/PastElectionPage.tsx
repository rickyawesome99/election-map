import Link from "next/link";
import Image from "next/image";
import CandidateLink from "@/components/CandidateLink";
import ReplaceLink from "@/components/ReplaceLink";
import { LedgerSectionHead, LedgerSubhead } from "@/components/LedgerSectionHead";
import { lastName } from "@/lib/personName";
import PastElectionMapPanel from "@/components/PastElectionMapPanel";
import PastCountyTable from "@/components/PastCountyTable";
import PastPollsChart from "@/components/PastPollsChart";
import PastElectionPrecinctMap from "@/components/PastElectionPrecinctMap";
import precinctStatesJson from "@/data/precincts/states.json";
import precinctCoverageJson from "@/data/precincts/coverage.json";
import type { Office } from "@/components/precincts/types";
import { fmtMargin, marginColor, fmtLean, leanColor, getRaceColor } from "@/lib/colorScale";
import type { BallotRace, PastElection, PastElectionCandidate } from "@/lib/pastElections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { SeatCrumbs } from "@/components/SeatBreadcrumb";
import { countyHref } from "@/lib/countyHref";
import { WAR_BAD, WAR_GOOD } from "@/components/tpl/format";

// The one shared renderer for /senate/[id]/[year] and /governor/[id]/[year]. The top block is
// composed to be captured as a single screenshot: eyebrow, headline, candidates, county map,
// with nothing else in the frame. Two sections follow it: the model (TPL expectation and its
// build, with each candidate's WAR beside it) and the polls (average, miss, every poll used, plotted). The county
// table, the state's other races that year and the source line follow below it.

// Set like the seat's year links opposite it: serif, muted, underlined on hover.
function partyColor(party: "D" | "R" | "I"): string {
  return party === "R" ? "var(--party-rep)" : party === "I" ? "var(--party-ind)" : "var(--party-dem)";
}

function partyName(party: "D" | "R" | "I"): string {
  return party === "R" ? "Republican" : party === "I" ? "Independent" : "Democratic";
}


function fmtInt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

function fmtMillions(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-US");
}

/** "D+3.3" style label for a D-positive quantity. */
function fmtDemPositive(v: number): string {
  if (Math.abs(v) < 0.05) return "EVEN";
  return `${v > 0 ? "D" : "R"}+${Math.abs(v).toFixed(1)}`;
}

function headline(e: PastElection): string {
  const w = e.winner === "dem" ? e.dem : e.rep;
  const l = e.winner === "dem" ? e.rep : e.dem;
  const pts = Math.abs(e.margin).toFixed(1);
  if (e.office === "president") {
    if (e.previous && e.previous.winnerParty !== w.party) return `${lastName(w.name)} flips ${e.stateName} by ${pts} points`;
    if (w.incumbent) return `${lastName(w.name)} holds ${e.stateName} by ${pts} points`;
    return `${lastName(w.name)} carries ${e.stateName} by ${pts} points`;
  }
  if (e.uncontested) return `${lastName(w.name)} wins unopposed`;
  if (w.incumbent && !w.appointed) return `${lastName(w.name)} re-elected over ${lastName(l.name)} by ${pts} points`;
  if (l.incumbent) return `${lastName(w.name)} unseats ${lastName(l.name)} by ${pts} points`;
  if (e.previous && e.previous.winnerParty !== w.party) return `${lastName(w.name)} flips the seat by ${pts} points`;
  if (e.previous) return `${lastName(w.name)} holds the open seat by ${pts} points`;
  return `${lastName(w.name)} defeats ${lastName(l.name)} by ${pts} points`;
}

function subhead(e: PastElection): string {
  const parts: string[] = [];
  const w = e.winner === "dem" ? e.dem : e.rep;
  const l = e.winner === "dem" ? e.rep : e.dem;
  if (e.office === "president") {
    if (e.electoralVotes != null) parts.push(`${e.electoralVotes} electoral vote${e.electoralVotes === 1 ? "" : "s"}${e.districtResults.length ? " statewide" : ""}.`);
    if (e.previous) parts.push(`${e.previous.winnerName} (${e.previous.winnerParty}) carried the state by ${Math.abs(e.previous.margin).toFixed(1)} in ${e.previous.year}.`);
    for (const d of e.districtResults) parts.push(`${d.label}: ${fmtMargin(d.margin)} (${d.electoralVotes} EV).`);
  } else if (l.incumbent) {
    parts.push(l.appointed ? `${lastName(l.name)} was the appointed incumbent.` : `${lastName(l.name)} was the incumbent.`);
  } else if (!w.incumbent && e.previous) {
    parts.push(`Open seat, previously held by ${e.previous.winnerName} (${e.previous.winnerParty}).`);
  } else if (w.appointed) {
    parts.push(`${lastName(w.name)} had been appointed to the seat.`);
  }
  if (e.totalVotes != null) {
    const change = e.turnoutChangePct != null && e.previous
      ? `, ${e.turnoutChangePct >= 0 ? "up" : "down"} ${Math.abs(e.turnoutChangePct).toFixed(1)}% from ${e.previous.year}`
      : "";
    parts.push(`Turnout ${fmtMillions(e.totalVotes)}${change}.`);
  }
  return parts.join(" ");
}

function CandidateRow({ c, e }: { c: PastElectionCandidate; e: PastElection }) {
  const color = partyColor(c.party);
  const isWinner = (e.winner === "dem" ? e.dem : e.rep) === c;
  const hasName = !c.name.endsWith("candidate");
  return (
    <div className="grid items-center py-[11px]" style={{ gridTemplateColumns: "4px 60px minmax(0,1fr) auto", borderBottom: "1px solid var(--app-border)" }}>
      <span className="h-12 rounded-sm" style={{ background: color }} />
      <div className="ml-1.5 h-16 w-[54px] overflow-hidden rounded" style={{ background: "var(--app-tab-bg)" }}>
        {c.photo ? (
          <Image src={c.photo} alt={c.name} width={108} height={128} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base font-bold" style={{ color: "var(--app-text-very-muted)" }}>{c.party}</div>
        )}
      </div>
      <div className="ml-3 min-w-0">
        {/* A long name wraps rather than truncating; the badge follows its last word. */}
        <div className="min-w-0 text-[17px] font-semibold leading-tight" style={{ color: "var(--app-text-primary)" }}>
          {hasName ? <CandidateLink name={c.name} state={e.stateAbbr} className="hover:underline">{c.name}</CandidateLink> : c.name}
          {isWinner && !e.uncontested && (
            <span className="ml-2 inline-block whitespace-nowrap rounded px-1.5 py-0.5 align-[2px] text-[10.5px] font-bold uppercase leading-none tracking-wider" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>Winner</span>
          )}
        </div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {partyName(c.party)}
          {c.incumbent ? (c.appointed ? " · Appointed incumbent" : " · Incumbent") : ""}
        </div>
      </div>
      <div className="ml-3 text-right">
        <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1, color }}>
          {c.pct.toFixed(1)}%
        </div>
        <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(c.votes)}</div>
      </div>
    </div>
  );
}

export default function PastElectionPage({ election: e }: { election: PastElection }) {
  const demShare = e.dem.pct;
  const repShare = e.rep.pct;
  const otherShare = e.otherPct ?? Math.max(0, 100 - demShare - repShare);
  const counted = e.counties.length;
  const precinctShell = precinctMapFor(e);
  const areaSingular = e.stateAbbr === "LA" ? "parish" : e.stateAbbr === "AK" ? "borough" : "county";
  const areaWord = e.stateAbbr === "LA" ? "parishes" : e.stateAbbr === "AK" ? "boroughs" : "counties";
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  // The state and district are in the breadcrumb above, so the eyebrow leaves them out and fits
  // on one line.
  const eyebrow = [
    e.officeLabel,
    e.seatClass != null ? `Class ${e.seatClass}` : null,
    e.electoralVotes != null ? `${e.electoralVotes} electoral votes` : null,
    e.isSpecial ? "Special election" : null,
    e.dateLabel,
  ].filter(Boolean).join(" · ");
  const seatEls = e.seatElections;

  // Under the map: the colour key only, so a clicked county's panel sits close to the map. The
  // data-quality notes that used to follow it are in the source line at the foot of the page.
  const mapCaption = (
    <div className="mt-1 flex justify-end" aria-hidden="true">
      <span className="flex items-center gap-px">
        {[-20, -10, -3, -0.5, 0.5, 3, 10, 20].map((m) => <i key={m} className="block h-2 w-3.5" style={{ background: getSwatch(m) }} />)}
      </span>
    </div>
  );
  const countyNote = e.house ? [
    e.house.gaps.length > 0 ? `No district breakdown on file for ${e.house.gaps.map((g) => g.name).join(", ")}.` : "",
    e.house.status === "exact" ? `${houseSourceLabel(e.house.source)}; the rows sum to the certified district total.` : "",
    e.house.status === "close" ? `${houseSourceLabel(e.house.source)}; the rows come within 2.5% of the certified district total.` : "",
    e.house.status === "final-round" ? `${houseSourceLabel(e.house.source)}; ranked-choice final round. Overseas ballots and a few unorganized townships cannot be assigned to a county, so the rows fall just short of the certified total.` : "",
    e.house.status === "first-round" ? `${houseSourceLabel(e.house.source)}; ranked-choice first-round counts, so they do not sum to the certified final-round total.` : "",
    e.house.status === "unverified" ? `${houseSourceLabel(e.house.source)}; the rows do not sum to the certified district total, so treat them as incomplete.` : "",
    e.house.splitCounties ? `Counties shared with other districts are hatched on the map.` : "",
  ].filter(Boolean).join(" ") : "";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className={`${PAGE_CONTAINER} pt-3 pb-12`}>
        {/* Seat context: links up to the seat and the state + this seat's other elections */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <SeatCrumbs
            crumbs={[
              ...(e.office !== "president" ? [{ label: e.stateName, href: `/states/${e.stateAbbr.toLowerCase()}` }] : []),
              { label: e.seatLabel, href: e.seatHref },
            ]}
          />
          <nav aria-label="Other elections for this seat" className="flex items-baseline gap-3 overflow-x-auto">
            <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>This seat</span>
            {seatEls.map((s) => s.year === e.year ? (
              <span key={s.href} className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-primary)" }} aria-current="page">
                {s.year}{s.isSpecial ? "*" : ""}
              </span>
            ) : (
              <ReplaceLink key={s.href} href={s.href} className="tabular-nums hover:underline" style={{ fontFamily: "var(--font-serif)", fontSize: "1rem", color: "var(--app-text-muted)" }}>
                {s.year}{s.isSpecial ? "*" : ""}
              </ReplaceLink>
            ))}
          </nav>
        </div>

        {/* ── Share block ─────────────────────────────────────────────────── */}
        <section className="mt-2" style={{ borderTop: "2px solid var(--app-text-primary)", paddingTop: "1.25rem" }} aria-label="Result">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{eyebrow}</div>
              <h1 className="mt-1.5" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.6rem, 3.4vw, 2rem)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em", textWrap: "balance" }}>
                {headline(e)}
              </h1>
              <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>{subhead(e)}</p>

              {/* No share bar: its height went to the candidate cards, so the block stays as tall. */}
              <div className="mt-[14px]">
                <CandidateRow c={e.winner === "dem" ? e.dem : e.rep} e={e} />
                <CandidateRow c={e.winner === "dem" ? e.rep : e.dem} e={e} />
                {e.otherVotes != null && e.otherVotes > 0 && (
                  <div className="grid items-center py-2" style={{ gridTemplateColumns: "4px 60px minmax(0,1fr) auto" }}>
                    <span className="h-6 rounded-sm" style={{ background: "var(--party-ind-fill)", opacity: 0.6 }} />
                    <span />
                    <div className="ml-3 text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Others</div>
                    <div className="ml-3 text-right">
                      <div className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-muted)" }}>{otherShare.toFixed(1)}%</div>
                      <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(e.otherVotes)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Margin</div>
                  <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: marginColor(e.margin) }}>{fmtMargin(e.margin)}</div>
                  <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{e.voteMargin != null ? `${fmtInt(Math.abs(e.voteMargin))} votes` : ""}</div>
                </div>
                <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Swing</div>
                  <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: e.swing != null ? leanColor(e.swing) : "var(--app-text-very-muted)" }}>{e.swing != null ? fmtLean(e.swing) : "—"}</div>
                  <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{e.previous ? `from ${fmtMargin(e.previous.margin)} in ${e.previous.year}${e.house?.linesChanged ? ", old lines" : ""}` : "no prior result on file"}</div>
                </div>
                <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Ballots</div>
                  <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700 }}>{e.totalVotes != null ? fmtMillions(e.totalVotes) : "—"}</div>
                  <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{e.turnoutChangePct != null && e.previous ? `${e.turnoutChangePct >= 0 ? "+" : "−"}${Math.abs(e.turnoutChangePct).toFixed(1)}% vs ${e.previous.year}` : ""}</div>
                </div>
              </div>
            </div>

            {/* On desktop the map column adds no height of its own: it fills the row the left
                column sets, so opening a county's panel shrinks the map a little instead of
                pushing the rule below down. */}
            {/* At least the full 300px map plus its tabs and county line (116px), so a short left
                column moves the rule below down rather than shrinking the map. */}
            <div className="min-w-0 md:relative md:min-h-[420px]">
              <div className="md:absolute md:inset-0">
              {precinctShell ? (
                <PastElectionPrecinctMap
                  shell={precinctShell.shell}
                  year={e.year}
                  office={precinctShell.office}
                  demName={e.dem.name}
                  repName={e.rep.name}
                  height={300}
                  caption={mapCaption}
                  fill
                />
              ) : counted > 0 || e.house ? (
                <PastElectionMapPanel
                  stateAbbr={e.stateAbbr}
                  stateName={e.stateName}
                  dem={{ name: e.dem.name, party: e.dem.party }}
                  rep={{ name: e.rep.name, party: e.rep.party }}
                  counties={e.counties.map((c) => ({
                    fips: c.fips, name: c.name,
                    result: { demVotes: c.result.demVotes, repVotes: c.result.repVotes, totalVotes: c.result.totalVotes, demPct: c.result.demPct, repPct: c.result.repPct, margin: c.result.margin },
                    prevMargin: c.previous?.margin ?? null,
                  }))}
                  previous={e.previous ? { year: e.previous.year, isSpecial: e.previous.isSpecial } : null}
                  house={e.house ? { piecesUrl: e.house.piecesUrl, district: e.house.district, label: e.seatId.toUpperCase(), linesChanged: e.house.linesChanged } : null}
                  noSwing={!!e.uncontested || e.dem.party === e.rep.party}
                  areaSingular={areaSingular}
                  areaPlural={areaWord}
                />
              ) : (
                <div className="flex h-[300px] items-center justify-center rounded text-center text-xs" style={{ border: "1px dashed var(--app-border)", color: "var(--app-text-very-muted)" }}>
                  No county-level results on file for this election.
                </div>
              )}
              </div>
            </div>
          </div>

        </section>

        <ModelSection e={e} />
        <PollsSection e={e} />

        {/* ── Counties ────────────────────────────────────────────────────── */}
        {counted > 0 && (
          <>
            <PastCountyTable
              label={cap(areaWord)}
              noun={areaSingular}
              dem={{ name: lastName(e.dem.name), party: e.dem.party }}
              rep={{ name: lastName(e.rep.name), party: e.rep.party }}
              prevYear={e.previous?.year ?? null}
              prevNote={e.house?.linesChanged ? "*" : undefined}
              rows={e.counties.map((c) => ({
                fips: c.fips, name: c.name, href: countyHref(c.fips), split: !!c.houseSplit,
                demVotes: c.result.demVotes, repVotes: c.result.repVotes, demPct: c.result.demPct, repPct: c.result.repPct,
                margin: c.result.margin, prevMargin: c.previous?.margin ?? null, total: c.result.totalVotes,
              }))}
            />
            {e.house?.linesChanged && e.previous && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>* The district was redrawn for {e.year}; the {e.previous.year} column is the same county&apos;s result in the district as numbered then, on different lines.</p>
            )}
          </>
        )}

        <BallotSection e={e} />

        <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Sources: {e.sources.join(" · ")}{countyNote && <> · {countyNote}</>}</p>
      </div>
    </div>
  );
}

function houseSourceLabel(source: string | null): string {
  switch (source) {
    case "precinct": return "County rows summed from precinct returns";
    case "maine-rcv": return "County rows tabulated from the Maine Secretary of State's cast-vote records";
    case "remainder": return "Shared counties by subtraction from the county canvass and the neighbouring district's certified rows";
    case "indiana": return "County rows from the Indiana Secretary of State's canvass";
    case "louisiana": return "Parish rows from the Louisiana Secretary of State's canvass";
    case "openelections": return "County rows from OpenElections' county-level file";
    case "wikipedia": return "County rows from the race's certified by-county table";
    case "district": return "The district lies within one county";
    case "aggregate": return "County rows from the county canvasses, shared counties from precinct returns";
    default: return "County rows from precinct returns";
  }
}

// Places drawn by precinct instead of by county: one county-equivalent, so a county map is a single
// blob (DC). Only when the Precincts tab has this year and office loaded for the state.
const PRECINCT_MAP_STATES: Record<string, string> = { DC: "11" };
const PRECINCT_OFFICE: Record<PastElection["office"], Office> = { president: "PRES", senate: "USS", governor: "GOV", house: "USH" };
function precinctMapFor(e: PastElection) {
  const fips = PRECINCT_MAP_STATES[e.stateAbbr];
  if (!fips) return null;
  const geo = (precinctStatesJson as unknown as Record<string, { n: number; first: number; bbox: [number, number, number, number] | null }>)[e.stateAbbr];
  const office = PRECINCT_OFFICE[e.office];
  const cell = (precinctCoverageJson as unknown as { states: Record<string, { years: Record<string, Partial<Record<Office, { status: string }>>> }> })
    .states[e.stateAbbr]?.years[String(e.year)]?.[office];
  if (!geo?.bbox || !cell || !["reconciled", "explained", "loaded"].includes(cell.status)) return null;
  return { office, shell: { abbr: e.stateAbbr, name: e.stateName, fips, n: geo.n, first: geo.first, bbox: geo.bbox } };
}

// Legend swatches mirror lib/colorScale getRaceColor's buckets.
function getSwatch(margin: number): string {
  if (margin >= 15) return "#be1c29";
  if (margin >= 5) return "#ff5864";
  if (margin >= 1) return "#ff8b98";
  if (margin >= 0) return "#cf8980";
  if (margin > -1) return "#959bb3";
  if (margin > -5) return "#8bafff";
  if (margin > -15) return "#587ccc";
  return "#1b408c";
}

// ── Shared chart pieces ───────────────────────────────────────────────────────
// Both sections draw on one horizontal margin axis, R on the left and D on the right, in plain
// HTML (percent positions) so labels stay crisp at any width. Long explanations sit in hover
// titles; the page itself shows labels and figures.

const signedWar = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
// The WAR pages' green/red (components/tpl/format.ts), so a figure reads the same on both.
const warColor = (v: number) => (Math.abs(v) <= 0.05 ? "var(--app-text-muted)" : v > 0 ? WAR_GOOD : WAR_BAD);
const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const serifFig = (size: string, color: string) => ({ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: size, lineHeight: 1.1, color });
/** A D-positive quantity's colour (toward D blue, toward R red). */
const dColor = (d: number) => (Math.abs(d) < 0.05 ? "var(--app-text-muted)" : d > 0 ? "var(--party-dem)" : "var(--party-rep)");

/** An axis over D-positive values: [lo, hi] padded and rounded out to a multiple of `step`. */
function axisFor(values: number[], step = 5, pad = 2, withZero = true) {
  const base = withZero ? [0, ...values] : values;
  const lo = Math.floor((Math.min(...base) - pad) / step) * step;
  const hi = Math.ceil((Math.max(...base) + pad) / step) * step;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const span = hi - lo, tickStep = span > 60 ? 20 : span > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v);
  return { lo, hi, x, ticks };
}
const tickLabel = (v: number) => (v === 0 ? "Even" : `${v < 0 ? "R" : "D"}+${Math.abs(v)}`);

function AxisLabels({ ticks, x, className = "" }: { ticks: number[]; x: (v: number) => number; className?: string }) {
  return (
    <div className={`relative h-4 text-[10px] tabular-nums ${className}`} style={veryMuted} aria-hidden="true">
      {/* Every other label drops out on phones, where they would collide. */}
      {/* Even always stays: the alternation counts out from it. */}
      {ticks.map((t) => <span key={t} className={`absolute -translate-x-1/2 whitespace-nowrap ${(ticks.indexOf(t) - ticks.indexOf(0)) % 2 ? "max-sm:hidden" : ""}`} style={{ left: `${x(t)}%` }}>{tickLabel(t)}</span>)}
    </div>
  );
}

/** A bar's fill: the map's Safe D / Safe R colour (fixed hex, so dark mode draws the same colour). */
const safeFill = (d: number) => getRaceColor(d > 0 ? -20 : 20);

/** Just the Even line, for a chart that should read as bars, not a grid. */
function ZeroLine({ x }: { x: (v: number) => number }) {
  return <i className="absolute inset-y-0 w-px" style={{ left: `${x(0)}%`, background: "var(--app-text-very-muted)", opacity: 0.7 }} />;
}

function SectionShell({ label, meta, right, children }: { label: string; meta?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <LedgerSectionHead label={label} meta={meta} right={right} />
      {children}
    </section>
  );
}

/** The section's three headline figures in a row: label over a serif number, nothing more. */
type Stat = { label: string; value: string; color: string; title?: string; href?: string; /** A thin rule before it, starting a new group. */ divider?: boolean };
function StatRow({ stats }: { stats: Stat[] }) {
  return (
    // Phones: two per row, so four figures make a square; wider screens: one row.
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10">
      {stats.map((st) => {
        const body = (
          <>
            <div className="text-[10.5px] font-bold uppercase tracking-wider" style={muted}>{st.label}</div>
            <div className="mt-0.5 tabular-nums" style={serifFig("1.6rem", st.color)}>{st.value}</div>
          </>
        );
        const cls = st.divider ? "sm:border-l sm:pl-10" : "";
        const style = st.divider ? { borderColor: "var(--app-border)" } : undefined;
        return st.href
          ? <Link prefetch={false} key={st.label} href={st.href} title={st.title} className={`block hover:opacity-80 ${cls}`} style={style}>{body}</Link>
          : <div key={st.label} title={st.title} className={cls} style={style}>{body}</div>;
      })}
    </div>
  );
}

// ── Model: TPL and WAR ────────────────────────────────────────────────────────

/** A side's share of the two candidates' money from the R-positive gap (R$ − D$)/(R$ + D$) × 100. */
const repMoneyShare = (gapPct: number) => (gapPct + 100) / 2;

function ModelSection({ e }: { e: PastElection }) {
  const m = e.model;
  const place = e.office === "house" ? "district" : "state";
  // The state's TPL page; a House race opens at its district's row there.
  const tplLink = (
    <Link prefetch={false} href={`/model/${e.stateAbbr.toLowerCase()}${e.office === "house" ? `#${e.seatId}` : ""}`} className="text-[12px] font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
      {e.office === "house" ? e.seatId.toUpperCase() : e.stateName} TPL →
    </Link>
  );
  if (!m) {
    return (
      <SectionShell label="TPL" right={tplLink}>
        <p className="text-[12.5px]" style={muted}>No model row for this race.</p>
      </SectionShell>
    );
  }
  const winner = e.winner === "dem" ? e.dem : e.rep;
  const loser = e.winner === "dem" ? e.rep : e.dem;
  const incumbent = e.dem.incumbent && !e.dem.appointed ? e.dem : e.rep.incumbent && !e.rep.appointed ? e.rep : null;
  const pct = (v: number) => `${Math.round(v)}%`;
  const blended = m.ballotWeight > 0.005 && m.ballotWeight < 0.995;

  // The waterfall, D-positive: each part steps on from where the last ended; then the expectation
  // and the result as bars from Even.
  type Step = { label: string; sub?: string; title: string; d: number };
  const steps: Step[] = [
    {
      label: m.ballotWeight > 0.005 ? "Rest of ballot" : "Lean",
      sub: blended ? `${pct(m.ballotWeight * 100)} ballot · ${pct((1 - m.ballotWeight) * 100)} lean` : undefined,
      title: m.ballotWeight >= 0.995
        ? `How the ${place} voted in its other ${e.year} races, this one left out, with their incumbency and money taken out.`
        : blended
          ? `${pct(m.ballotWeight * 100)} the ${place}'s other ${e.year} races (${fmtLean(m.ballotMargin)}), ${pct((1 - m.ballotWeight) * 100)} its modelled lean and the ${e.year} environment (${fmtLean(m.leanMargin)}).`
          : `The ${place}'s modelled lean and the ${e.year} national environment.`,
      d: -m.baseline,
    },
    { label: "Incumbency", sub: incumbent ? lastName(incumbent.name) : "open seat", title: incumbent ? `${incumbent.name} ran as the incumbent.` : "Open seat, or an appointed incumbent: no incumbency term.", d: -m.incumbency },
    ...(e.office !== "president" ? [{
      label: "Fundraising",
      sub: m.moneyGapPct != null ? `${lastName(e.rep.name)} ${pct(repMoneyShare(m.moneyGapPct))} of $ · typical ${pct(repMoneyShare(m.structuralGapPct))}` : "no $ on file",
      title: m.moneyGapPct != null
        ? `${lastName(e.rep.name)} raised ${pct(repMoneyShare(m.moneyGapPct))} of the two candidates' money; a generic pair in this seat would be expected at ${pct(repMoneyShare(m.structuralGapPct))}. Only the expected share counts in the model.`
        : "No fundraising on file for both candidates.",
      d: -m.money,
    }] : []),
    ...(Math.abs(m.houseOthers) >= 0.05 ? [{ label: "Other House races", title: `How the ${e.stateName} House races ran against their own districts' baselines in ${e.year}.`, d: -m.houseOthers }] : []),
  ];
  let cum = 0;
  const bars = steps.map((st) => { const from = cum; cum += st.d; return { ...st, from, to: cum }; });
  const expD = -m.expected;
  const ax = axisFor([...bars.flatMap((b) => [b.from, b.to]), expD]);
  const rowCls = `grid items-center gap-x-3 py-1.5 ${BUILD_COLS}`;
  const seg = (a: number, b: number, color: string, opacity = 1, h = "h-3") => (
    <span className={`absolute top-1/2 -translate-y-1/2 rounded-sm ${h}`} style={{ left: `${ax.x(Math.min(a, b))}%`, width: `${Math.max(0.6, Math.abs(ax.x(b) - ax.x(a)))}%`, background: color, opacity }} />
  );

  return (
    <SectionShell label="TPL" right={tplLink}>
      <StatRow stats={[
        { label: "TPL expected", value: fmtLean(m.expected), color: leanColor(m.expected), title: "The model's margin before any candidate effect." },
        { label: "Result vs expected", value: fmtLean(m.residual), color: leanColor(m.residual), title: "How far the result ran from the expectation." },
        // Each candidate's WAR, opening this race on the WAR page.
        ...[winner, loser].map((c, i) => ({
          label: `${lastName(c.name)} WAR`, value: c.war != null ? signedWar(c.war) : "—", color: c.war != null ? warColor(c.war) : "var(--app-text-very-muted)",
          title: `Wins above replacement: points ${c.name} ran ahead of (or behind) a generic, non-incumbent ${partyName(c.party)} nominee against the same opponent. Opens this race on the WAR page.`,
          href: e.warHref, divider: i === 0,
        })),
      ]} />

      {/* The expectation, built step by step; its total is the first figure above. */}
      <div className="mt-5 max-w-2xl">
        <LedgerSubhead label="How the expectation is built" top="mt-0" />
        {bars.map((b, i) => (
          <div key={b.label} className={rowCls} title={b.title}>
            <div className="min-w-0 leading-tight">
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{b.label}</div>
              {b.sub && <div className="mt-0.5 text-[10.5px] leading-snug" style={veryMuted}>{b.sub}</div>}
            </div>
            <div className="relative h-6">
              <ZeroLine x={ax.x} />
              {/* Where this step picks up: the previous step's end, dotted. */}
              {i > 0 && <i className="absolute inset-y-0 w-0" style={{ left: `${ax.x(b.from)}%`, borderLeft: "1px dotted var(--app-text-very-muted)" }} />}
              {seg(b.from, b.to, safeFill(b.d))}
            </div>
            <div className="text-right text-[12.5px] font-semibold tabular-nums" style={{ color: dColor(b.d) }}>{fmtLean(-b.d)}</div>
          </div>
        ))}
        <div className={`grid gap-x-3 ${BUILD_COLS}`}><span /><AxisLabels ticks={ax.ticks} x={ax.x} /><span /></div>
      </div>
    </SectionShell>
  );
}

// Fixed label and figure columns (a minmax label column would grow before the bars got any room).
const BUILD_COLS = "grid-cols-[7rem_minmax(0,1fr)_3.75rem] sm:grid-cols-[9.5rem_minmax(0,1fr)_4.25rem]";

// ── Polls ─────────────────────────────────────────────────────────────────────

function PollsSection({ e }: { e: PastElection }) {
  const p = e.polling;
  if (!p) {
    return (
      <SectionShell label="Polls">
        <p className="text-[12.5px]" style={muted}>{e.year < 2018 && e.office !== "president" ? "The poll archive starts with the 2018 cycle." : "No polls of this race in the archive."}</p>
      </SectionShell>
    );
  }
  const avg = p.avgDemMargin, err = p.errorTowardDem;
  return (
    <SectionShell label="Polls" meta={`${p.polls.length} ending in the final ${p.windowDays} days · ${p.totalPolls} in the archive`}>
      <StatRow stats={[
        { label: "Poll average", value: fmtDemPositive(avg), color: dColor(avg), title: `Mean of ${p.polls.length} poll${p.polls.length === 1 ? "" : "s"} ending in the final ${p.windowDays} days${e.runoff ? ", before the November round" : ""}.` },
        { label: e.runoff ? "Runoff result" : "Result", value: fmtMargin(e.margin), color: marginColor(e.margin), title: e.runoff ? "Not the race the polls asked about." : undefined },
        { label: "Polls missed by", value: err != null ? `${Math.abs(err).toFixed(1)} toward ${err >= 0 ? "D" : "R"}` : "—", color: err != null ? dColor(err) : "var(--app-text-very-muted)", title: err != null ? `The result ran ${Math.abs(err).toFixed(1)} points ${err >= 0 ? "more Democratic" : "more Republican"} than the average.` : "No error is scored against a runoff." },
      ]} />
      {e.runoff && <p className="mt-2 text-[11.5px]" style={veryMuted}>No error is scored against a runoff.</p>}
      <PastPollsChart
        polls={p.polls}
        electionDay={p.electionDay}
        windowDays={p.windowDays}
        avgDemMargin={avg}
        result={e.runoff ? null : e.margin}
        demName={lastName(e.dem.name)}
        repName={lastName(e.rep.name)}
        demColor={partyColor(e.dem.party)}
        repColor={partyColor(e.rep.party)}
      />
    </SectionShell>
  );
}

// ── The state's ballot ────────────────────────────────────────────────────────

/** A race's fill: the winner's party, shaded by margin (the map's buckets), with dark text on the light shades. */
function ballotTone(r: BallotRace) {
  const bg = getRaceColor(r.winnerParty === "R" ? r.margin : -r.margin);
  return { bg, fg: ["#8bafff", "#959bb3", "#cf8980", "#ff8b98"].includes(bg) ? "#1f2328" : "#ffffff" };
}
// An uncontested race (the winner took every two-party vote) reads as such, not "R+100.0".
const ballotMargin = (r: BallotRace) => (r.margin >= 99.95 ? `${r.winnerParty} unopp.` : `${r.winnerParty}+${r.margin.toFixed(1)}`);

/** Every race on the state's ballot that year, each a tile that opens its page: statewide races
 *  large, House seats the same tile smaller (seat, margin, winner). This page's race is ringed. */
function BallotSection({ e }: { e: PastElection }) {
  const { statewide, house } = e.ballot;
  if (statewide.length + house.length <= 1) return null;
  const ring = (self: boolean) => (self ? { outline: "2px solid var(--app-text-primary)", outlineOffset: 2 } : undefined);
  const flipTag = <span className="rounded-sm px-1 py-px text-[9.5px] font-bold uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.22)" }}>Flip</span>;
  const houseD = house.filter((r) => r.winnerParty === "D").length, houseR = house.filter((r) => r.winnerParty === "R").length;
  return (
    <section className="mt-10">
      <LedgerSectionHead label={`On the ${e.stateName} ballot, ${e.year}`} />
      {statewide.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statewide.map((r) => {
            const t = ballotTone(r);
            return (
              <Link prefetch={false} key={r.href} href={r.href} aria-current={r.self ? "page" : undefined} className="block rounded px-3 py-2.5 transition-opacity hover:opacity-90" style={{ background: t.bg, color: t.fg, ...ring(r.self) }}>
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-wider opacity-90">{r.label}{r.flip && flipTag}</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.05 }}>{ballotMargin(r)}</div>
                <div className="mt-0.5 truncate text-[12px] font-medium opacity-90">{r.winner ? lastName(r.winner) : "—"}</div>
              </Link>
            );
          })}
        </div>
      )}
      {house.length > 0 && (
        <>
          <div className={`${statewide.length ? "mt-5" : ""} mb-2 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-wider`} style={{ color: "var(--app-text-muted)" }}>
            U.S. House
            <span className="font-semibold normal-case tracking-normal" style={{ color: "var(--app-text-very-muted)" }}>
              {house.length} seat{house.length === 1 ? "" : "s"} · <b style={{ color: "var(--party-dem)" }}>{houseD} D</b> <b style={{ color: "var(--party-rep)" }}>{houseR} R</b>
            </span>
          </div>
          {/* The statewide tiles, smaller: seat, margin, winner. */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
            {house.map((r) => {
              const t = ballotTone(r);
              return (
                <Link prefetch={false} key={r.href} href={r.href} aria-current={r.self ? "page" : undefined} title={`${r.label}: ${r.winner} (${r.winnerParty}) ${ballotMargin(r)}${r.flip ? ", flipped" : ""}`}
                  className="block min-w-0 rounded px-2.5 py-2 transition-opacity hover:opacity-90" style={{ background: t.bg, color: t.fg, ...ring(r.self) }}>
                  <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider opacity-90">{r.label}{r.flip && flipTag}</div>
                  <div className="mt-0.5 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.1rem", lineHeight: 1.1 }}>{ballotMargin(r)}</div>
                  <div className="truncate text-[11px] font-medium opacity-90">{r.winner ? lastName(r.winner) : "—"}</div>
                </Link>
              );
            })}
          </div>
        </>
      )}
      {(statewide.some((r) => r.flip) || house.some((r) => r.flip)) && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Flip: the seat changed party from its previous election.</p>
      )}
    </section>
  );
}
