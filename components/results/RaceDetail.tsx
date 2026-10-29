"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import CandidateLink from "@/components/CandidateLink";
import HouseDistrictCountyMap from "@/components/HouseDistrictCountyMap";
import PastElectionCountyMap, { type CountyMapEntry, type CountySide } from "@/components/PastElectionCountyMap";
import { partyOf } from "@/lib/resultsFeed";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { countyDisplayName } from "@/lib/countyName";
import { lastName, isRealName } from "@/lib/personName";
import { fmtInt, fmtMargin, marginSideColor, partyColor, fmtCall, callSideColor, fmtIn, inColor, inState } from "@/lib/resultsFormat";
import type { Party, RaceHistory } from "@/lib/resultsTypes";
import { MarginTrend } from "@/components/results/SeatTrend";
import type { ResultsRow } from "@/components/results/ResultsPage";

// One race on the Results page, in the past-election pages' type (components/PastElectionPage.tsx):
// on the left the headline, compact candidate rows and the needle with its figures; on the right
// the county map (counted or projected margins); then the county table across the full width.

type CountyView = "counted" | "projected";
type MapView = CountyView | "remaining";
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

export default function RaceDetail({ row, history }: { row: ResultsRow; history: RaceHistory }) {
  const { prior, live, proj } = row;
  const [view, setView] = useState<MapView>("counted");
  const [trendView, setTrendView] = useState<CountyView>("projected");
  const [sortKey, setSortKey] = useState<"votes" | "name" | "margin" | "in">("votes");
  const hasVotes = !!live && live.total > 0;
  const liveByFips = useMemo(() => new Map((live?.counties ?? []).filter((c) => c.fips).map((c) => [c.fips!, c])), [live]);
  // A jungle or ranked-choice race's D and R sides are party blocs (lib/resultsFeed.ts tallyRegion),
  // named on the map for each bloc's leading candidate in the feed (the forecast's nominee before any votes).
  const blocSides = useMemo(() => {
    if (!prior.jungle && !prior.rcv) return {};
    const lead = (slot: "dem" | "rep", party: Party) => (!live?.total ? null : live.candidates.find((c) => c.name === prior[slot].name || partyOf(c.party) === party)?.name) ?? prior[slot].name;
    return { sides: { dem: { name: lead("dem", "D"), party: prior.dem.party }, rep: { name: lead("rep", "R"), party: prior.rep.party } } };
  }, [prior, live]);

  const entries: CountyMapEntry[] = useMemo(() => proj.counties.flatMap((c) => {
    const l = liveByFips.get(c.fips);
    const reporting = `${fmtIn(c.f * 100, c.done)} in`;
    const counted = !!l && l.total > 0;
    // Remaining: the projected final, less what is counted. The net is the projected final lead
    // minus the counted one, so counted + remaining always adds up to the projection.
    const leftVotes = c.done ? 0 : Math.max(0, c.projectedTotal - (counted ? l!.total : 0));
    const current = counted ? l!.rep - l!.dem : 0;
    const remaining = { votes: leftVotes, net: leftVotes > 0 ? (c.projectedMargin / 100) * c.projectedTotal - current : 0, current };
    if (view === "counted" || (view === "remaining" && counted)) {
      if (!counted) return [];
      // A jungle or ranked-choice race's counted map is each county's own top two (first choices);
      // its projected and remaining views are the party blocs the needle projects.
      const pair = view === "counted" && l!.top?.length === 2 ? junglePair(l!.top) : null;
      if (pair) {
        const { dem: d, rep: r } = pair;
        return [{ fips: c.fips, name: c.name, result: { demVotes: d.votes, repVotes: r.votes, totalVotes: l!.total, demPct: (d.votes / l!.total) * 100, repPct: (r.votes / l!.total) * 100, margin: ((r.votes - d.votes) / l!.total) * 100, reporting, projectedMargin: c.projectedMargin, sides: { dem: d, rep: r } } }];
      }
      return [{ fips: c.fips, name: c.name, result: { demVotes: l!.dem, repVotes: l!.rep, totalVotes: l!.total, demPct: (l!.dem / l!.total) * 100, repPct: (l!.rep / l!.total) * 100, margin: ((l!.rep - l!.dem) / l!.total) * 100, reporting, projectedMargin: c.projectedMargin, ...(view === "remaining" ? { remaining } : {}), ...blocSides } }];
    }
    const m = c.projectedMargin, other = prior.counties.find((p) => p.fips === c.fips)?.other ?? 0;
    const repPct = (100 - other + m) / 2, demPct = (100 - other - m) / 2;
    return [{ fips: c.fips, name: c.name, result: { demVotes: Math.round((c.projectedTotal * demPct) / 100), repVotes: Math.round((c.projectedTotal * repPct) / 100), totalVotes: c.projectedTotal, demPct, repPct, margin: m, ...(view === "remaining" ? { reporting: "0% in", projectedMargin: m, remaining } : { reporting: "Projected" }), ...blocSides } }];
  }), [proj, liveByFips, view, prior.counties, blocSides]);
  const maxLeftNet = useMemo(() => Math.max(0, ...entries.map((e) => Math.abs(e.result.remaining?.net ?? 0))), [entries]);

  const tplByFips = useMemo(() => new Map(prior.counties.map((c) => [c.fips, c.tpl])), [prior.counties]);
  const benchByFips = useMemo(() => new Map(prior.counties.map((c) => [c.fips, c.benchmark])), [prior.counties]);
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
  // A jungle or ranked-choice race's counted lead is between its top two candidates (first
  // choices), whatever their parties.
  const topLead = (prior.jungle || prior.rcv) && hasVotes && live!.candidates.length >= 2
    ? { leader: live!.candidates[0].name, second: live!.candidates[1].name, party: partyOf(live!.candidates[0].party) ?? "I", votes: live!.candidates[0].votes - live!.candidates[1].votes }
    : null;

  const eyebrow = [prior.label.replace(/ \(special\)$/, ""), OFFICE[prior.office], prior.special ? "Special election" : null, prior.jungle ? "Jungle round" : null, "November 3, 2026"].filter(Boolean).join(" · ");
  const note = [
    prior.forecast.contest !== "contested" ? "Not a contested two-party race: the projection is the forecast's." : proj.tier === "topline" ? "County detail not loaded for this race yet; projected from the race total." : proj.tier === "none" ? "No votes in." : `${reporting} of ${proj.counties.length} counties reporting, ${done} done.`,
    prior.rcv ? "Ranked-choice: first choices shown; the needle projects the final round as every Democrat (with the forecast's named opponent) against every Republican." : null,
    prior.jungle ? "Louisiana jungle round: a runoff follows if nobody clears 50%. Counted map: each parish's top two; the projection is every Democrat (with the forecast's named opponent) against every Republican." : null,
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
            {live && <span className="tabular-nums" title="Precincts reporting, as the feed counts them; it runs ahead of the vote"><b style={{ color: inColor(inState(live.percentReporting)) }}>{inState(live.percentReporting) === "done" && "✓ "}{fmtIn(live.percentReporting)}</b> of precincts reporting</span>}
          </p>

          <div className="mt-3">
            {cands.map((c) => <CandidateRow key={c.name} c={c} hasVotes={hasVotes} state={prior.state} />)}
          </div>
          <p className="mt-3 text-[12px] tabular-nums" style={muted}>
            {hasVotes
              ? <><b style={{ color: "var(--app-text-primary)" }}>{fmtInt(proj.counted)}</b> votes counted · {topLead
                ? <><b style={{ color: partyColor(topLead.party) }}>{lastName(topLead.leader)}</b> leads {lastName(topLead.second)} by {fmtInt(topLead.votes)} · parties <b style={{ color: callSideColor(proj.currentMargin, prior) }}>{fmtCall(proj.currentMargin, prior)}</b></>
                : <><b style={{ color: callSideColor(proj.currentMargin, prior) }}>{fmtCall(proj.currentMargin, prior)}</b>{voteLead != null ? ` (${fmtInt(voteLead)}-vote lead)` : ""}</>} · <b style={{ color: inColor(inState(proj.countedShare * 100)) }}>{fmtIn(proj.countedShare * 100)}</b> of ~{fmtInt(proj.projectedTotal)} projected</>
              : <>No votes counted · ~{fmtInt(proj.projectedTotal)} expected</>}
          </p>

          {/* The needle */}
          <div className="mt-2" style={{ borderTop: "2px solid var(--app-text-primary)", paddingTop: "0.75rem" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wider" style={muted}>{prior.jungle ? "Projected party margin" : "Projected final margin"}</div>
              <div className="text-[11.5px] font-semibold tabular-nums" style={{ color: proj.locked || hasVotes ? partyColor(pSide.party) : "var(--app-text-muted)" }}>
                {proj.locked ? `Called for ${proj.winner} by the feed` : hasVotes ? `${Math.round(pWin * 100)}% ${pSide.party} ${lastName(pSide.name)}` : "nothing counted: the forecast"}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="tabular-nums" style={serif("2.25rem", callSideColor(proj.margin, prior))}>{fmtCall(proj.margin, prior)}</span>
                  <span className="text-sm tabular-nums" style={muted}>± {proj.sigma.toFixed(1)}</span>
                </div>
                <div className="mt-1 text-[12.5px] tabular-nums" style={muted}>
                  80% range <b style={{ color: callSideColor(lo80, prior) }}>{fmtCall(lo80, prior)}</b> to <b style={{ color: callSideColor(hi80, prior) }}>{fmtCall(hi80, prior)}</b>
                </div>
              </div>
              <span className="ml-auto text-right text-[13px] tabular-nums" style={muted}>
                {prior.tpl != null && <><span title="The district's TPL: its partisan lean from past results, before the environment, incumbency, money and candidates">TPL <b style={{ color: marginSideColor(prior.tpl, prior) }}>{fmtMargin(prior.tpl, prior)}</b></span> · </>}
                forecast {fmtCall(prior.forecast.margin, prior)} ({prior.forecast.rating})
              </span>
            </div>
            <Needle margin={proj.margin} sigma={proj.sigma} forecast={prior.forecast.margin} current={proj.currentMargin} prior={prior} />
            <div className="mt-4">
              {/* Projected or counted margin over the night, one chart with a toggle in its heading. */}
              <div className="mb-1 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                {(["projected", "counted"] as CountyView[]).map((v) => (
                  <button key={v} onClick={() => setTrendView(v)} className="whitespace-nowrap pb-0.5 uppercase tracking-wider transition-colors hover:text-[var(--app-text-primary)]"
                    style={trendView === v ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)" } : { ...muted, borderBottom: "2px solid transparent" }}>
                    {v === "counted" ? "Counted" : "Projected"}
                  </button>
                ))}
                <span style={muted}>margin over the night</span>
              </div>
              <MarginTrend points={history[trendView]} prior={prior} kind={trendView} />
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
            {(["counted", "projected", "remaining"] as MapView[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className="whitespace-nowrap pb-0.5 uppercase transition-colors hover:text-[var(--app-text-primary)]"
                style={view === v ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)" } : { ...muted, borderBottom: "2px solid transparent" }}>
                {v === "counted" ? "Counted" : v === "projected" ? "Projected" : "Remaining"}
              </button>
            ))}
            {noDetail && <span className="font-normal normal-case tracking-normal" style={veryMuted}>loading counties…</span>}
          </div>
          {prior.office === "house" ? (
            <HouseDistrictCountyMap piecesUrl={`/house-county-pieces/2026/${prior.state}.json`} district={district} districtLabel={prior.label} stateAbbr={prior.state} counties={entries} demName={prior.dem.name} repName={prior.rep.name} demParty={prior.dem.party} repParty={prior.rep.party} height={280} caption={view === "remaining" ? remainingCaption(note, maxLeftNet, prior) : mapCaption(note)} panelSize="compact" bubbles={view === "remaining"} />
          ) : (
            <PastElectionCountyMap stateAbbr={prior.state} stateName={prior.stateName} counties={entries} demName={prior.dem.name} repName={prior.rep.name} demParty={prior.dem.party} repParty={prior.rep.party} height={280} caption={view === "remaining" ? remainingCaption(note, maxLeftNet, prior) : mapCaption(note)} panelSize="compact" bubbles={view === "remaining"} />
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
                    ["Margin", "margin", "all", undefined, "proj."], ["Proj.", null, "wide"],
                    ["Edge", null, "all", undefined, "TPL"], ["TPL", null, "wide"],
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
                  // Edge: how far the counted margin runs from the county's tied-race margin (its
                  // benchmark); before any votes nobody has one, so EVEN (greyed).
                  const bench = benchByFips.get(c.fips) ?? null;
                  const vsBench = bench != null && c.observedMargin != null ? c.observedMargin - bench : null;
                  const tplColor = tpl != null ? marginSideColor(tpl) : "var(--app-text-very-muted)";
                  const inSt = inState(counted ? Math.max(c.f * 100, 0.01) : 0, c.done);
                  const inPct = <><span style={{ color: inColor(inSt), fontWeight: inSt === "none" ? undefined : 600 }}>{inSt === "done" && "✓ "}{fmtIn(counted ? Math.max(c.f * 100, 0.01) : 0, c.done)}</span>{l?.pct != null && !c.done ? <span className="text-[10px]" style={veryMuted}> ({Math.round(l.pct)})</span> : null}</>;
                  const sub = "text-[10.5px] font-normal sm:hidden";
                  return (
                    <tr key={c.fips} style={{ borderBottom: "1px solid var(--app-border)", opacity: counted ? 1 : 0.6 }}>
                      <td className="py-1.5 leading-tight sm:whitespace-nowrap">
                        {countyDisplayName(c.fips, c.name).replace(/ County$/, "")}
                        <div className={sub} style={muted}>{inPct} in</div>
                      </td>
                      <td className={`${tdCls} !text-left font-bold sm:text-[14px] sm:[font-family:var(--font-serif)]`} style={{ color: counted ? marginSideColor(l!.rep - l!.dem, prior) : undefined }}>{counted ? fmtVoteMargin(l!.rep - l!.dem, prior) : "—"}</td>
                      <td className={`${tdCls} font-semibold`} style={{ color: callSideColor(c.observedMargin, prior) }}>
                        {fmtCall(c.observedMargin, prior)}
                        <div className={sub} style={{ color: callSideColor(c.projectedMargin, prior) }}>{fmtCall(c.projectedMargin, prior)}</div>
                      </td>
                      <td className={`${tdCls} hidden sm:table-cell`} style={{ color: callSideColor(c.projectedMargin, prior) }}>{fmtCall(c.projectedMargin, prior)}</td>
                      <td className={tdCls} title={bench != null ? `A tied race has this county at ${fmtMargin(bench, prior)}` : undefined}
                        style={{ color: vsBench != null ? marginSideColor(vsBench, prior) : "var(--app-text-very-muted)" }}>
                        {vsBench != null ? fmtMargin(vsBench, prior) : bench != null ? "EVEN" : "—"}
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
          <p className="mt-3 text-[11px] leading-relaxed" style={veryMuted}>
            <b style={muted}>Edge:</b> how far each county&apos;s counted margin runs from the margin it would show if the race finished tied (the model&apos;s county pattern, shifted to even). {fmtMargin(-3.2, prior)} means the county is running 3.2 points better for {isRealName(prior.dem.name) ? lastName(prior.dem.name) : "the Democrat"} than a tie needs; a county with no votes yet is EVEN.
          </p>
        </div>
      )}
    </section>
  );
}

/** A county's top two in the map's D and R slots: a lone Republican on the R side, else the
 *  leader there; a party the feed doesn't name is an independent. */
function junglePair(top: { name: string; party: Party | null; votes: number }[]): { dem: CountySide & { votes: number }; rep: CountySide & { votes: number } } {
  const [a, b] = top.map((c) => ({ name: c.name, party: c.party ?? "I", votes: c.votes }));
  const rOnly = (a.party === "R") !== (b.party === "R");
  const rep = rOnly ? (a.party === "R" ? a : b) : a;
  return { rep, dem: rep === a ? b : a };
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

// The Remaining view's key: circle area is the net votes left; the largest circle's figure.
const remainingCaption = (note: string, maxNet: number, prior: Prior) => (
  <div className="mt-1 flex items-start justify-between gap-3">
    <p className="text-[11px]" style={veryMuted}>{note}</p>
    <span className="mt-0.5 flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums" style={muted}>
      <span className="flex items-center gap-1" aria-hidden="true">
        <i className="block h-2 w-2 rounded-full" style={{ background: partyColor(prior.dem.party), opacity: 0.72 }} />
        <i className="block h-3 w-3 rounded-full" style={{ background: partyColor(prior.rep.party), opacity: 0.72 }} />
      </span>
      {maxNet >= 1 ? <>Net votes left · largest {fmtInt(maxNet)}</> : "Nothing left to count"}
    </span>
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
        <div className="absolute top-2.5 h-3 rounded-sm" style={{ left: `${x(lo)}%`, width: `${Math.max(0.5, x(hi) - x(lo))}%`, background: callSideColor(margin, prior), opacity: 0.3 }} />
        <div className="absolute top-0.5 h-7 w-px" style={{ left: `${x(0)}%`, background: "var(--app-text-very-muted)" }} />
        <div className="absolute top-1 h-6 w-1 rounded-sm" style={{ left: `calc(${x(margin)}% - 2px)`, background: callSideColor(margin, prior) }} title={`Projected ${fmtCall(margin, prior)}`} />
        <div className="absolute top-3 h-2 w-2 rotate-45" style={{ left: `calc(${x(forecast)}% - 4px)`, border: "1.5px solid var(--app-text-muted)", background: "var(--app-bg)" }} title={`Forecast ${fmtCall(forecast, prior)}`} />
        {current != null && <div className="absolute top-4 h-0 w-0" style={{ left: `calc(${x(current)}% - 4px)`, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "6px solid var(--app-text-primary)" }} title={`Counted ${fmtCall(current, prior)}`} />}
      </div>
      <div className="flex justify-between text-[10.5px] tabular-nums" style={veryMuted}>
        <span>{prior.dem.party}+{span}</span><span>needle ▮ · 80% band · forecast ◇ · counted ▲</span><span>{prior.rep.party}+{span}</span>
      </div>
    </div>
  );
}
