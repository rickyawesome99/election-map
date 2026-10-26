"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import CandidateLink from "@/components/CandidateLink";
import HouseDistrictCountyMap from "@/components/HouseDistrictCountyMap";
import PastElectionCountyMap, { type CountyMapEntry } from "@/components/PastElectionCountyMap";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { countyDisplayName } from "@/lib/countyName";
import { lastName, isRealName } from "@/lib/personName";
import { fmtInt, fmtMargin, marginSideColor, partyColor } from "@/lib/resultsFormat";
import type { Party, SeatPoint } from "@/lib/resultsTypes";
import { MarginTrend } from "@/components/results/SeatTrend";
import type { ResultsRow } from "@/components/results/ResultsPage";

// One race on the Results page, in the past-election pages' type (components/PastElectionPage.tsx):
// on the left the headline, compact candidate rows and the needle with its figures; on the right
// the county map (counted or projected margins); then the county table across the full width.

type CountyView = "counted" | "projected";
type Prior = ResultsRow["prior"];
type Cand = { name: string; party: string; slot: Party; votes: number; percent: number; winner: boolean; incumbent: boolean; photo: string | null; linked: boolean };

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const serif = (size: string, color?: string) => ({ fontFamily: "var(--font-serif)", fontSize: size, fontWeight: 700, lineHeight: 1.1, color: color ?? "var(--app-text-primary)" });
const OFFICE = { house: "U.S. House", senate: "U.S. Senate", governor: "Governor" } as const;
const thCls = "whitespace-nowrap py-1.5 pl-1 text-right font-bold min-[360px]:pl-2 sm:pl-4";
const tdCls = "whitespace-nowrap py-1.5 pl-1 text-right min-[360px]:pl-2 sm:pl-4";

function headline(prior: Prior, cands: Cand[], hasVotes: boolean, current: number | null): string {
  const d = prior.dem, r = prior.rep;
  if (prior.forecast.contest.startsWith("uncontested")) return `${lastName(prior.forecast.contest.endsWith("D") ? d.name : r.name)} runs unopposed`;
  const w = cands.find((c) => c.winner);
  if (w) {
    const l = cands.find((c) => c !== w);
    if (w.incumbent) return l ? `${lastName(w.name)} re-elected over ${lastName(l.name)}` : `${lastName(w.name)} re-elected`;
    if (l?.incumbent) return `${lastName(w.name)} unseats ${lastName(l.name)}`;
    if (prior.seatParty && w.slot !== prior.seatParty) return `${lastName(w.name)} flips the seat`;
    return l ? `${lastName(w.name)} defeats ${lastName(l.name)}` : `${lastName(w.name)} wins`;
  }
  if (hasVotes && current != null && cands.length >= 2) {
    if (Math.abs(current) < 0.05) return `${lastName(cands[0].name)} and ${lastName(cands[1].name)} are tied`;
    return `${lastName(cands[0].name)} leads ${lastName(cands[1].name)} by ${Math.abs(current).toFixed(1)} points`;
  }
  return isRealName(d.name) && isRealName(r.name) ? `${lastName(d.name)} vs. ${lastName(r.name)}` : `${d.name} vs. ${r.name}`;
}

export default function RaceDetail({ row, history }: { row: ResultsRow; history: SeatPoint[] }) {
  const { prior, live, proj } = row;
  const [view, setView] = useState<CountyView>("counted");
  const [sortKey, setSortKey] = useState<"votes" | "name" | "margin" | "in">("votes");
  const hasVotes = !!live && live.total > 0;
  const liveByFips = useMemo(() => new Map((live?.counties ?? []).filter((c) => c.fips).map((c) => [c.fips!, c])), [live]);

  const entries: CountyMapEntry[] = useMemo(() => proj.counties.flatMap((c) => {
    const l = liveByFips.get(c.fips);
    const reporting = `${c.done ? 100 : Math.round(c.f * 100)}% in`;
    if (view === "counted") {
      if (!l || l.total <= 0) return [];
      return [{ fips: c.fips, name: c.name, result: { demVotes: l.dem, repVotes: l.rep, totalVotes: l.total, demPct: (l.dem / l.total) * 100, repPct: (l.rep / l.total) * 100, margin: ((l.rep - l.dem) / l.total) * 100, reporting, projectedMargin: c.projectedMargin } }];
    }
    const m = c.projectedMargin, other = prior.counties.find((p) => p.fips === c.fips)?.other ?? 0;
    const repPct = (100 - other + m) / 2, demPct = (100 - other - m) / 2;
    return [{ fips: c.fips, name: c.name, result: { demVotes: Math.round((c.projectedTotal * demPct) / 100), repVotes: Math.round((c.projectedTotal * repPct) / 100), totalVotes: c.projectedTotal, demPct, repPct, margin: m, reporting: "Projected" } }];
  }), [proj, liveByFips, view, prior.counties]);

  const tplByFips = useMemo(() => new Map(prior.counties.map((c) => [c.fips, c.tpl])), [prior.counties]);
  const sorted = useMemo(() => {
    const rows = proj.counties.map((c) => ({ c, l: liveByFips.get(c.fips) ?? null }));
    rows.sort((a, b) => {
      if (sortKey === "name") return a.c.name.localeCompare(b.c.name);
      if (sortKey === "margin") return (a.c.observedMargin ?? 999) - (b.c.observedMargin ?? 999);
      if (sortKey === "in") return b.c.f - a.c.f || b.c.expected - a.c.expected;
      return b.c.expected - a.c.expected;
    });
    return rows;
  }, [proj, liveByFips, sortKey]);

  // The feed's candidates, each matched to the forecast's D or R slot (anyone else is "I"), most
  // votes first; before any votes, the two nominees.
  const cands: Cand[] = useMemo(() => {
    const fromPrior = (s: "dem" | "rep") => ({ name: prior[s].name, party: s === "dem" ? "Democratic" : "Republican", slot: prior[s].party, votes: 0, percent: 0, winner: false, incumbent: prior[s].incumbent, photo: prior[s].photo, linked: isRealName(prior[s].name) });
    if (!live?.candidates.length) return [fromPrior("dem"), fromPrior("rep")];
    return live.candidates.map((c): Cand => {
      const s = c.name === prior.dem.name || /^Democrat/.test(c.party) ? "dem" : c.name === prior.rep.name || /^Republican/.test(c.party) ? "rep" : null;
      const own = !!s && prior[s].name === c.name;
      return { ...c, slot: s ? prior[s].party : "I", incumbent: c.incumbent || (!!s && own && prior[s].incumbent), photo: s && own ? prior[s].photo : null, linked: own };
    }).sort((a, b) => b.votes - a.votes).slice(0, 5);
  }, [live, prior]);

  const pD = proj.probD, pSide = pD >= 0.5 ? prior.dem : prior.rep, pWin = pD >= 0.5 ? pD : 1 - pD;
  const district = prior.office === "house" ? Number(prior.id.slice(2)) : 0;
  const noDetail = hasVotes && !live?.counties;
  const reporting = proj.counties.filter((c) => c.counted > 0).length, done = proj.counties.filter((c) => c.done).length;
  const lo80 = proj.margin - 1.2816 * proj.sigma, hi80 = proj.margin + 1.2816 * proj.sigma;
  const voteLead = hasVotes ? Math.abs(live!.rep - live!.dem) : null;

  const eyebrow = [prior.label.replace(/ \(special\)$/, ""), OFFICE[prior.office], prior.special ? "Special election" : null, prior.jungle ? "Jungle round" : null, "November 3, 2026"].filter(Boolean).join(" · ");
  const note = [
    prior.forecast.contest !== "contested" ? "Not a contested two-party race: the projection is the forecast's." : proj.tier === "topline" ? "County detail not loaded for this race yet; projected from the race total." : proj.tier === "none" ? "No votes in." : `${reporting} of ${proj.counties.length} counties reporting, ${done} done.`,
    prior.rcv ? "Ranked-choice: first choices shown; the needle projects the final round." : null,
    prior.jungle ? "Louisiana jungle round: a runoff follows if nobody clears 50%." : null,
  ].filter(Boolean).join(" ");

  return (
    <section style={{ borderTop: "2px solid var(--app-text-primary)", paddingTop: "1.25rem" }} aria-label="Result">
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={muted}>{eyebrow}</div>
            <Link href={prior.href} prefetch={false} className="text-xs hover:underline" style={muted}>Race page →</Link>
          </div>
          <h1 className="mt-1.5" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.5rem, 3vw, 1.85rem)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em", textWrap: "balance" }}>
            {headline(prior, cands, hasVotes, proj.currentMargin)}
          </h1>
          <p className="mt-1 text-[13px]" style={muted}>
            {prior.seatHolder && <>Seat held by {prior.seatHolder} ({prior.seatParty})</>}
            {prior.seatHolder && live && " · "}
            {live && <span className="tabular-nums" title="Precincts reporting, as the feed counts them; it runs ahead of the vote">{Math.round(live.percentReporting)}% of precincts reporting</span>}
          </p>

          <div className="mt-3">
            {cands.map((c) => <CandidateRow key={c.name} c={c} hasVotes={hasVotes} state={prior.state} />)}
          </div>
          <p className="mt-3 text-[12px] tabular-nums" style={muted}>
            {hasVotes
              ? <><b style={{ color: "var(--app-text-primary)" }}>{fmtInt(proj.counted)}</b> votes counted · <b style={{ color: marginSideColor(proj.currentMargin, prior) }}>{fmtMargin(proj.currentMargin, prior)}</b>{voteLead != null ? ` (${fmtInt(voteLead)}-vote lead)` : ""} · {Math.round(proj.countedShare * 100)}% of ~{fmtInt(proj.projectedTotal)} projected</>
              : <>No votes counted · ~{fmtInt(proj.projectedTotal)} expected</>}
          </p>

          {/* The needle */}
          <div className="mt-2" style={{ borderTop: "2px solid var(--app-text-primary)", paddingTop: "0.75rem" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wider" style={muted}>Projected final margin</div>
              <div className="text-[11.5px] font-semibold tabular-nums" style={{ color: proj.locked || hasVotes ? partyColor(pSide.party) : "var(--app-text-muted)" }}>
                {proj.locked ? `Called for ${proj.winner} by the feed` : hasVotes ? `${Math.round(pWin * 100)}% ${pSide.party} ${lastName(pSide.name)}` : "nothing counted: the forecast"}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="tabular-nums" style={serif("2.25rem", marginSideColor(proj.margin, prior))}>{fmtMargin(proj.margin, prior)}</span>
                  <span className="text-sm tabular-nums" style={muted}>± {proj.sigma.toFixed(1)}</span>
                </div>
                <div className="mt-1 text-[12.5px] tabular-nums" style={muted}>
                  80% range <b style={{ color: marginSideColor(lo80, prior) }}>{fmtMargin(lo80, prior)}</b> to <b style={{ color: marginSideColor(hi80, prior) }}>{fmtMargin(hi80, prior)}</b>
                </div>
              </div>
              <span className="ml-auto text-[13px] tabular-nums" style={muted}>forecast {fmtMargin(prior.forecast.margin, prior)} ({prior.forecast.rating})</span>
            </div>
            <Needle margin={proj.margin} sigma={proj.sigma} forecast={prior.forecast.margin} current={proj.currentMargin} prior={prior} />
            <div className="mt-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={muted}>Projected margin over the night</div>
              <MarginTrend points={history} prior={prior} />
            </div>
            {/* The needle's two internal inputs, as a footnote. */}
            {hasVotes && (
              <p className="mt-3 text-[11px] tabular-nums" style={veryMuted}>
                Counties are running <span style={{ color: marginSideColor(proj.swing, prior) }}>{fmtMargin(proj.swing, prior, 1)}</span> against their priors (shared swing, shrunk while little is in) · finished counties turned out ×{proj.turnoutFactor.toFixed(2)} their expected vote.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider sm:gap-4">
            {(["counted", "projected"] as CountyView[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className="whitespace-nowrap pb-0.5 uppercase transition-colors hover:text-[var(--app-text-primary)]"
                style={view === v ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)" } : { ...muted, borderBottom: "2px solid transparent" }}>
                {v === "counted" ? "Counted" : "Projected"}<span className="hidden sm:inline"> by county</span>
              </button>
            ))}
            {noDetail && <span className="font-normal normal-case tracking-normal" style={veryMuted}>loading counties…</span>}
          </div>
          {prior.office === "house" ? (
            <HouseDistrictCountyMap piecesUrl={`/house-county-pieces/2026/${prior.state}.json`} district={district} districtLabel={prior.label} stateAbbr={prior.state} counties={entries} demName={prior.dem.name} repName={prior.rep.name} demParty={prior.dem.party} repParty={prior.rep.party} height={280} caption={mapCaption(note)} panelSize="compact" />
          ) : (
            <PastElectionCountyMap stateAbbr={prior.state} stateName={prior.stateName} counties={entries} demName={prior.dem.name} repName={prior.rep.name} demParty={prior.dem.party} repParty={prior.rep.party} height={280} caption={mapCaption(note)} panelSize="compact" />
          )}

        </div>
      </div>
      {proj.counties.length > 0 && (
        <div className="mx-auto mt-10 max-w-4xl">
          <LedgerSectionHead label="Counties" meta={`${reporting} of ${proj.counties.length} reporting, ${done} done`} />
          {/* Phones get five columns, some with two figures stacked (counted over projected margin,
              the vote margin, model over TPL, counted over projected total, % in under the name);
              sm+ spreads them across nine. */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] tabular-nums min-[360px]:text-[12px] sm:text-[13px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-left align-bottom text-[10.5px] uppercase tracking-wider" style={muted}>
                  {([
                    ["County", "name", "all"], ["Vote margin", null, "all"],
                    ["Margin", "margin", "all", undefined, "proj."],
                    ["Proj.", null, "wide"], ["Model", null, "all", undefined, "TPL"], ["TPL", null, "wide"],
                    ["Counted", "votes", "all", undefined, "of proj."], ["Proj. total", null, "wide"], ["In", "in", "wide"],
                  ] as [string, typeof sortKey | null, "all" | "wide" | "narrow", string?, string?][]).map(([h, k, vis, color, sub], i) => (
                    <th key={`${h}-${vis}`} className={`${i === 0 ? "py-1.5 font-bold" : thCls} ${h === "Vote margin" ? "!text-left" : ""} ${vis === "wide" ? "hidden sm:table-cell" : vis === "narrow" ? "sm:hidden" : ""}`} style={{ borderBottom: "1px solid var(--app-border)", cursor: k ? "pointer" : undefined, color: k === sortKey ? "var(--app-text-primary)" : color }} onClick={() => k && setSortKey(k)}>
                      {h === "Vote margin" ? <>Vote<br className="sm:hidden" /><span className="hidden sm:inline"> </span>margin</> : h === "Counted" ? <><span className="sm:hidden">Votes</span><span className="hidden sm:inline">Counted</span></> : h}{k === sortKey ? " ▾" : ""}
                      {sub && <div className="text-[9.5px] font-semibold normal-case tracking-normal sm:hidden" style={veryMuted}>{sub}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ c, l }) => {
                  const counted = !!l && l.total > 0;
                  const tpl = tplByFips.get(c.fips) ?? null;
                  const tplColor = tpl != null ? marginSideColor(tpl) : "var(--app-text-very-muted)";
                  const inPct = <>{c.done ? "100%" : counted ? `${Math.round(c.f * 100)}%` : "0%"}{l?.pct != null && !c.done ? <span className="text-[10px]" style={veryMuted}> ({Math.round(l.pct)})</span> : null}</>;
                  const sub = "text-[10.5px] font-normal sm:hidden";
                  return (
                    <tr key={c.fips} style={{ borderBottom: "1px solid var(--app-border)", opacity: counted ? 1 : 0.6 }}>
                      <td className="py-1.5 leading-tight sm:whitespace-nowrap">
                        {countyDisplayName(c.fips, c.name).replace(/ County$/, "")}
                        <div className={sub} style={muted}>{inPct} in</div>
                      </td>
                      <td className={`${tdCls} !text-left font-bold sm:text-[14px] sm:[font-family:var(--font-serif)]`} style={{ color: counted ? marginSideColor(l!.rep - l!.dem, prior) : undefined }}>{counted ? fmtVoteMargin(l!.rep - l!.dem, prior) : "—"}</td>
                      <td className={`${tdCls} font-semibold`} style={{ color: marginSideColor(c.observedMargin, prior) }}>
                        {fmtMargin(c.observedMargin, prior)}
                        <div className={sub} style={{ color: marginSideColor(c.projectedMargin, prior) }}>{fmtMargin(c.projectedMargin, prior)}</div>
                      </td>
                      <td className={`${tdCls} hidden sm:table-cell`} style={{ color: marginSideColor(c.projectedMargin, prior) }}>{fmtMargin(c.projectedMargin, prior)}</td>
                      <td className={tdCls} style={{ color: marginSideColor(c.priorMargin, prior) }}>
                        {fmtMargin(c.priorMargin, prior)}
                        <div className={sub} style={{ color: tplColor }}>{fmtMargin(tpl)}</div>
                      </td>
                      <td className={`${tdCls} hidden sm:table-cell`} style={{ color: tplColor }}>{fmtMargin(tpl)}</td>
                      <td className={tdCls}>
                        {counted ? fmtInt(l!.total) : "—"}
                        <div className={sub} style={muted}>{fmtInt(c.projectedTotal)}</div>
                      </td>
                      <td className={`${tdCls} hidden sm:table-cell`} style={muted}>{fmtInt(c.projectedTotal)}</td>
                      <td className={`${tdCls} hidden sm:table-cell`} style={muted}>{inPct}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** A raw vote lead, R-positive, as "D+20,000" / "R+1,569" with the race's party letters. */
function fmtVoteMargin(diff: number, prior: Prior): string {
  if (diff === 0) return "Even";
  return `${diff > 0 ? prior.rep.party : prior.dem.party}+${fmtInt(Math.abs(diff))}`;
}

function CandidateRow({ c, hasVotes, state }: { c: Cand; hasVotes: boolean; state: string }) {
  const color = partyColor(c.slot);
  return (
    <div className="flex min-h-12 items-center gap-x-3 py-1.5">
      {c.photo && (
        <div className="h-12 w-10 shrink-0 overflow-hidden rounded-sm" style={{ background: "var(--app-tab-bg)" }}>
          <Image src={c.photo} alt={c.name} width={80} height={96} className="h-full w-full object-cover object-top" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="leading-tight" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.15rem, 4vw, 1.4rem)", fontWeight: 700, color }}>
          {c.linked ? <CandidateLink name={c.name} state={state} className="hover:underline">{c.name}</CandidateLink> : c.name}
        </span>
        {c.winner && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>Winner</span>}
        <span className="text-[12px]" style={muted}>{c.party}{c.incumbent ? " · Incumbent" : ""}</span>
      </div>
      <span className="shrink-0 text-[15px] tabular-nums sm:text-[16px]" style={{ color: "var(--app-text-primary)" }}>{hasVotes ? fmtInt(c.votes) : "0"}</span>
      <span className="w-[4.75rem] shrink-0 text-right tabular-nums sm:w-[5.5rem]" style={serif("clamp(1.4rem, 5vw, 1.75rem)", hasVotes ? color : "var(--app-text-very-muted)")}>{hasVotes ? `${c.percent.toFixed(1)}%` : "—"}</span>
    </div>
  );
}

// The colour key under the map, as on the past-election pages (lib/colorScale getRaceColor's buckets).
const SWATCHES = ["#1b408c", "#587ccc", "#8bafff", "#959bb3", "#cf8980", "#ff8b98", "#ff5864", "#be1c29"];
// The race's reporting note sits on its left, in the caption so a county's click panel opens below it.
const mapCaption = (note: string) => (
  <div className="mt-1 flex items-start justify-between gap-3">
    <p className="text-[11px]" style={veryMuted}>{note}</p>
    <span className="mt-1 flex shrink-0 items-center gap-px" aria-hidden="true">{SWATCHES.map((s) => <i key={s} className="block h-2 w-3.5" style={{ background: s }} />)}</span>
  </div>
);

/** A horizontal needle: the projected margin with its 80% band over a D–R axis, the forecast and the counted margin as ticks. */
function Needle({ margin, sigma, forecast, current, prior }: { margin: number; sigma: number; forecast: number; current: number | null; prior: Prior }) {
  const span = Math.max(20, Math.ceil((Math.max(Math.abs(margin) + 1.3 * sigma, Math.abs(forecast), Math.abs(current ?? 0)) + 2) / 5) * 5);
  const x = (m: number) => 50 + (Math.max(-span, Math.min(span, m)) / span) * 50;
  const lo = margin - 1.2816 * sigma, hi = margin + 1.2816 * sigma;
  return (
    <div className="mt-4">
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3.5 h-1 rounded-sm" style={{ background: `linear-gradient(90deg, var(--party-dem-fill), var(--app-border) 50%, var(--party-rep-fill))` }} />
        <div className="absolute top-2.5 h-3 rounded-sm" style={{ left: `${x(lo)}%`, width: `${Math.max(0.5, x(hi) - x(lo))}%`, background: marginSideColor(margin, prior), opacity: 0.3 }} />
        <div className="absolute top-0.5 h-7 w-px" style={{ left: `${x(0)}%`, background: "var(--app-text-very-muted)" }} />
        <div className="absolute top-1 h-6 w-1 rounded-sm" style={{ left: `calc(${x(margin)}% - 2px)`, background: marginSideColor(margin, prior) }} title={`Projected ${fmtMargin(margin, prior)}`} />
        <div className="absolute top-3 h-2 w-2 rotate-45" style={{ left: `calc(${x(forecast)}% - 4px)`, border: "1.5px solid var(--app-text-muted)", background: "var(--app-bg)" }} title={`Forecast ${fmtMargin(forecast, prior)}`} />
        {current != null && <div className="absolute top-4 h-0 w-0" style={{ left: `calc(${x(current)}% - 4px)`, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "6px solid var(--app-text-primary)" }} title={`Counted ${fmtMargin(current, prior)}`} />}
      </div>
      <div className="flex justify-between text-[10.5px] tabular-nums" style={veryMuted}>
        <span>{prior.dem.party}+{span}</span><span>needle ▮ · 80% band · forecast ◇ · counted ▲</span><span>{prior.rep.party}+{span}</span>
      </div>
    </div>
  );
}
