import Image from "next/image";
import CandidateLink from "@/components/CandidateLink";
import ReplaceLink from "@/components/ReplaceLink";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { lastName } from "@/lib/personName";
import PastElectionCountyMap from "@/components/PastElectionCountyMap";
import HouseDistrictCountyMap from "@/components/HouseDistrictCountyMap";
import ExpandableTbody from "@/components/ExpandableTbody";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import type { PastElection, PastElectionCandidate } from "@/lib/pastElections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { SeatCrumbs } from "@/components/SeatBreadcrumb";

// The one shared renderer for /senate/[id]/[year] and /governor/[id]/[year]. The top block is
// composed to be captured as a single screenshot: eyebrow, headline, candidates, county map,
// three post-analysis tiles, with nothing else in the frame. The county
// table, related links and the source line follow below it.

// Set like the seat's year links opposite it: serif, muted, underlined on hover.
function partyColor(party: "D" | "R" | "I"): string {
  return party === "R" ? "var(--party-rep)" : party === "I" ? "var(--party-ind)" : "var(--party-dem)";
}

function partyFill(party: "D" | "R" | "I"): string {
  return party === "R" ? "var(--party-rep-fill)" : party === "I" ? "var(--party-ind-fill)" : "var(--party-dem-fill)";
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
    <div className="grid items-center gap-x-3 py-2.5" style={{ gridTemplateColumns: "4px 44px minmax(0,1fr) auto", borderBottom: "1px solid var(--app-border)" }}>
      <span className="h-10 rounded-sm" style={{ background: color }} />
      <div className="h-[52px] w-[44px] overflow-hidden rounded" style={{ background: "var(--app-tab-bg)" }}>
        {c.photo ? (
          <Image src={c.photo} alt={c.name} width={88} height={104} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold" style={{ color: "var(--app-text-very-muted)" }}>{c.party}</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-[15px] font-semibold" style={{ color: "var(--app-text-primary)" }}>
            {hasName ? <CandidateLink name={c.name} className="hover:underline">{c.name}</CandidateLink> : c.name}
          </span>
          {isWinner && !e.uncontested && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>Winner</span>
          )}
        </div>
        <div className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
          {partyName(c.party)}
          {c.incumbent ? (c.appointed ? " · Appointed incumbent" : " · Incumbent") : ""}
          {c.war != null ? ` · WAR ${c.war > 0 ? "+" : ""}${c.war.toFixed(1)}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.1, color }}>
          {c.pct.toFixed(1)}%
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(c.votes)}</div>
      </div>
    </div>
  );
}

function PollStrip({ e }: { e: PastElection }) {
  const p = e.polling;
  if (!p) return null;
  const w = 260, h = 56, pad = 12;
  const actualDem = -e.margin;
  // Axis spans at least R+12…D+12 and widens (in steps of 5) to fit every poll and the result,
  // so a lopsided race's markers are not all pinned to one edge.
  const values = [...p.polls.map((poll) => poll.dem - poll.rep), p.avgDemMargin, ...(e.runoff ? [] : [actualDem])];
  const lo = Math.min(-12, Math.floor((Math.min(...values) - 1) / 5) * 5);
  const hi = Math.max(12, Math.ceil((Math.max(...values) + 1) / 5) * 5);
  const x = (v: number) => pad + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (w - pad * 2);
  const step = hi - lo <= 30 ? 5 : hi - lo <= 60 ? 10 : 20;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  // Labels sit on the outer side of each line, clamped inside the chart and kept from overlapping.
  const pollsLabel = `polls ${fmtDemPositive(p.avgDemMargin)}`;
  const resultLabel = `result ${fmtMargin(e.margin)}`;
  const textW = (s: string, bold = false) => s.length * (bold ? 5.6 : 5.2);
  const pollsLeft = p.avgDemMargin <= actualDem;
  const place = (lineX: number, width: number, toLeft: boolean) =>
    Math.max(0, Math.min(w - width, toLeft ? lineX - 3 - width : lineX + 3));
  let pollsX = place(x(p.avgDemMargin), textW(pollsLabel), pollsLeft);
  let resultX = place(x(actualDem), textW(resultLabel, true), !pollsLeft);
  if (!e.runoff) {
    if (pollsLeft) resultX = Math.min(w - textW(resultLabel, true), Math.max(resultX, pollsX + textW(pollsLabel) + 6));
    else pollsX = Math.min(w - textW(pollsLabel), Math.max(pollsX, resultX + textW(resultLabel, true) + 6));
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 block w-full max-w-[300px]" role="img" aria-label="Late polls compared with the result">
      <line x1={x(lo)} x2={x(hi)} y1={30} y2={30} stroke="var(--app-border)" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={27} y2={33} stroke="var(--app-border)" />
          <text x={x(v)} y={50} textAnchor="middle" fontSize={9} fill="var(--app-text-very-muted)">{v === 0 ? "Even" : `${v < 0 ? "R" : "D"}+${Math.abs(v)}`}</text>
        </g>
      ))}
      {p.polls.map((poll, i) => {
        const m = poll.dem - poll.rep;
        return <circle key={i} cx={x(m)} cy={30 + ((i % 3) - 1) * 4.5} r={3} fill={m < 0 ? "var(--party-rep)" : "var(--party-dem)"} fillOpacity={0.55} />;
      })}
      <line x1={x(p.avgDemMargin)} x2={x(p.avgDemMargin)} y1={14} y2={40} stroke="var(--app-text-primary)" strokeWidth={1.5} strokeDasharray="3 2" />
      <text x={pollsX} y={10} fontSize={9} fill="var(--app-text-muted)">{pollsLabel}</text>
      {!e.runoff && (
        <>
          <line x1={x(actualDem)} x2={x(actualDem)} y1={14} y2={40} stroke={marginColor(e.margin)} strokeWidth={2} />
          <text x={resultX} y={10} fontSize={9} fontWeight={700} fill={marginColor(e.margin)}>{resultLabel}</text>
        </>
      )}
    </svg>
  );
}

function Tile({ label, value, valueColor, children }: { label: string; value: string; valueColor?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1, color: valueColor ?? "var(--app-text-primary)" }}>{value}</div>
      <div className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{children}</div>
    </div>
  );
}

export default function PastElectionPage({ election: e }: { election: PastElection }) {
  const winner = e.winner === "dem" ? e.dem : e.rep;
  const loser = e.winner === "dem" ? e.rep : e.dem;
  const demShare = e.dem.pct;
  const repShare = e.rep.pct;
  const otherShare = e.otherPct ?? Math.max(0, 100 - demShare - repShare);
  const counted = e.counties.length;
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

  const residualLabel = e.model ? fmtMargin(e.model.residual) : null;
  const overLabel = e.model
    ? `${lastName(winner.name)} ${winner.war != null ? `WAR ${winner.war > 0 ? "+" : ""}${winner.war.toFixed(1)}` : ""}${loser.war != null ? ` · ${lastName(loser.name)} ${loser.war > 0 ? "+" : ""}${loser.war.toFixed(1)}` : ""}`
    : "";

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

              <div className="mt-4 flex h-3.5 overflow-hidden rounded-sm" style={{ background: "var(--map-unfilled)" }} aria-hidden="true">
                <span style={{ width: `${demShare}%`, background: partyFill(e.dem.party) }} />
                {otherShare > 0 && <span style={{ width: `${otherShare}%`, background: "var(--party-ind-fill)", opacity: 0.5 }} />}
                <span style={{ width: `${repShare}%`, background: partyFill(e.rep.party) }} />
              </div>

              <div className="mt-3">
                <CandidateRow c={e.winner === "dem" ? e.dem : e.rep} e={e} />
                <CandidateRow c={e.winner === "dem" ? e.rep : e.dem} e={e} />
                {e.otherVotes != null && e.otherVotes > 0 && (
                  <div className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: "4px 44px minmax(0,1fr) auto" }}>
                    <span className="h-6 rounded-sm" style={{ background: "var(--party-ind)", opacity: 0.6 }} />
                    <span />
                    <div className="text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Others</div>
                    <div className="text-right">
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
                  <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: e.swing != null ? marginColor(e.swing) : "var(--app-text-very-muted)" }}>{e.swing != null ? fmtMargin(e.swing) : "—"}</div>
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
            <div className="min-w-0 md:relative">
              <div className="md:absolute md:inset-0">
              {counted > 0 || e.house ? (
                <>
                  {e.house ? (
                    <HouseDistrictCountyMap
                      piecesUrl={e.house.piecesUrl}
                      district={e.house.district}
                      districtLabel={e.seatId.toUpperCase()}
                      stateAbbr={e.stateAbbr}
                      counties={e.counties.map((c) => ({ fips: c.fips, name: c.name, result: c.result }))}
                      demName={e.dem.name}
                      repName={e.rep.name}
                      demParty={e.dem.party}
                      repParty={e.rep.party}
                      height={300}
                      caption={mapCaption}
                      panelSize="small"
                      fill
                    />
                  ) : (
                    <PastElectionCountyMap
                      stateAbbr={e.stateAbbr}
                      stateName={e.stateName}
                      counties={e.counties.map((c) => ({ fips: c.fips, name: c.name, result: c.result }))}
                      demName={e.dem.name}
                      repName={e.rep.name}
                      demParty={e.dem.party}
                      repParty={e.rep.party}
                      height={300}
                      caption={mapCaption}
                      panelSize="small"
                      fill
                    />
                  )}
                </>
              ) : (
                <div className="flex h-[300px] items-center justify-center rounded text-center text-xs" style={{ border: "1px dashed var(--app-border)", color: "var(--app-text-very-muted)" }}>
                  No county-level results on file for this election.
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Post-analysis tiles */}
          <div className="mt-6 grid gap-5 sm:grid-cols-3" style={{ borderTop: "2px solid var(--app-text-primary)", paddingTop: "0.85rem" }}>
            <Tile label="TPL expected margin" value={e.model ? fmtMargin(e.model.expected) : "—"} valueColor={e.model ? marginColor(e.model.expected) : undefined}>
              {e.model
                ? e.office === "president"
                  ? `Retrospective fit: the state's fitted lean and the ${e.year} national environment, before any candidate effect.`
                  : `Retrospective fit: state lean, the ${e.year} national environment and incumbency, before any candidate effect.`
                : "No model row for this race."}
            </Tile>
            <Tile label="Result vs expected" value={residualLabel ?? "—"} valueColor={e.model ? marginColor(e.model.residual) : undefined}>
              {e.model ? overLabel : "—"}
            </Tile>
            <Tile
              label={e.polling ? (e.runoff ? "Late polls, first round" : "Polls missed by") : "Polls"}
              value={e.polling ? (e.polling.errorTowardDem != null ? `${Math.abs(e.polling.errorTowardDem).toFixed(1)} toward ${e.polling.errorTowardDem >= 0 ? "D" : "R"}` : fmtDemPositive(e.polling.avgDemMargin)) : "—"}
              valueColor={e.polling ? (e.polling.errorTowardDem != null ? (e.polling.errorTowardDem >= 0 ? "var(--party-dem)" : "var(--party-rep)") : marginColor(-e.polling.avgDemMargin)) : undefined}
            >
              {e.polling ? (
                <>
                  {e.polling.errorTowardDem != null
                    ? `Average of ${e.polling.polls.length} poll${e.polling.polls.length === 1 ? "" : "s"} ending in the final ${e.polling.windowDays} days: ${fmtDemPositive(e.polling.avgDemMargin)}. Result ${fmtMargin(e.margin)}.`
                    : `Average of ${e.polling.polls.length} poll${e.polling.polls.length === 1 ? "" : "s"} before the November round. The result above is the runoff, so no error is scored.`}
                  <PollStrip e={e} />
                </>
              ) : e.year < 2018 && e.office !== "president" ? "The poll archive starts with the 2018 cycle." : "No polls of this race in the archive."}
            </Tile>
          </div>
        </section>

        {/* ── Counties ────────────────────────────────────────────────────── */}
        {counted > 0 && (
          <section className="mt-10">
            <LedgerSectionHead label={cap(areaWord)} meta={`${counted} · sorted by ballots cast`} />
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums sm:text-[13px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                    <th className="py-1.5 font-bold" style={{ borderBottom: "1px solid var(--app-border)" }}>{cap(areaSingular)}</th>
                    <th className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3 font-bold" style={{ borderBottom: "1px solid var(--app-border)", color: partyColor(e.dem.party) }}>{lastName(e.dem.name)}</th>
                    <th className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3 font-bold" style={{ borderBottom: "1px solid var(--app-border)", color: partyColor(e.rep.party) }}>{lastName(e.rep.name)}</th>
                    <th className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3 font-bold" style={{ borderBottom: "1px solid var(--app-border)" }}>Margin</th>
                    <th className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3 font-bold" style={{ borderBottom: "1px solid var(--app-border)" }}>{e.previous ? `vs ${e.previous.year}${e.house?.linesChanged ? "*" : ""}` : ""}</th>
                  </tr>
                </thead>
                <ExpandableTbody colSpan={5} noun={areaWord} rows={e.counties.map((c) => {
                    const shift = c.previous ? c.result.margin - c.previous.margin : null;
                    return (
                      <tr key={c.fips} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="whitespace-nowrap py-1.5">
                          <a href={`/historical/${c.fips}`} className="hover:underline">{c.name}</a>
                          {c.houseSplit && <span className="ml-1.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }} title="This county is shared with another district; the row is this district's share">split</span>}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3">{fmtInt(c.result.demVotes)} <span className="text-[10px] sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{c.result.demPct.toFixed(1)}%</span></td>
                        <td className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3">{fmtInt(c.result.repVotes)} <span className="text-[10px] sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{c.result.repPct.toFixed(1)}%</span></td>
                        <td className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3 font-semibold" style={{ color: marginColor(c.result.margin) }}>{fmtMargin(c.result.margin)}</td>
                        <td className="whitespace-nowrap py-1.5 pl-1.5 text-right sm:pl-3" style={{ color: shift != null ? marginColor(shift) : "var(--app-text-very-muted)" }}>{shift != null ? fmtMargin(shift) : "—"}</td>
                      </tr>
                    );
                  })} />
              </table>
            </div>
            {e.house?.linesChanged && e.previous && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>* The district was redrawn for {e.year}; the {e.previous.year} column is the same county&apos;s result in the district as numbered then, on different lines.</p>
            )}
          </section>
        )}

        {/* ── Related ─────────────────────────────────────────────────────── */}
        {/* Same office, same year, nearest first; the seat, the state and this seat's other years
            are all linked from the top of the page. */}
        {e.related.items.length > 0 && (
          <section className="mt-10">
            <LedgerSectionHead label={e.related.title} />
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {e.related.items.map((r) => (
                <a key={r.href} href={r.href} className="group flex items-baseline justify-between gap-3 py-2 min-w-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="whitespace-nowrap text-sm font-bold group-hover:underline" style={{ color: "var(--app-text-primary)" }}>{r.label}</span>
                    {r.winner && <span className="truncate text-xs" style={{ color: "var(--app-text-very-muted)" }}>{lastName(r.winner)} ({r.winnerParty})</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: marginColor(r.margin) }}>{fmtMargin(r.margin)}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Sources: {e.sources.join(" · ")}{countyNote && <> · {countyNote}</>}</p>
      </div>
    </div>
  );
}

function houseSourceLabel(source: string | null): string {
  switch (source) {
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
