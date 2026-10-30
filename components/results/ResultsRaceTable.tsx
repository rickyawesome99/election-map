"use client";

import { lastName } from "@/lib/personName";
import { fmtClose, fmtInt, raceHash, fmtCall, callSideColor, fmtIn, inColor, inState } from "@/lib/resultsFormat";
import type { Party } from "@/lib/resultsTypes";
import type { ResultsRow } from "@/components/results/ResultsPage";

// The Results page's race table, built like the /historical race list (components/PastRaceTable):
// each race a head-to-head bar sized by the counted two-party share, last names, shares and votes
// inside. A called race's winner is solid party colour, everything else a tint. From lg up a race
// is one grid row with the counted margin, the needle's projection, the forecast, how much is in
// and the poll close beside the bar; below lg it stacks.

const PARTY_TEXT: Record<Party, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };
const PARTY_FILL: Record<Party, string> = { D: "var(--party-dem-fill)", R: "var(--party-rep-fill)", I: "var(--party-ind-fill)" };
const PARTY_TINT: Record<Party, string> = { D: "var(--party-dem-subtle)", R: "var(--party-rep-subtle)", I: "var(--party-ind-subtle)" };
const GRID = "lg:grid lg:grid-cols-[8.5rem_minmax(0,1fr)_5rem_6rem_5.5rem_6rem] lg:items-center lg:gap-x-4";
/** Below this share of the two-party count a segment drops the name. */
const NAME_MIN_SHARE = 30;
/** CandidateStack's columns: name, bar, pct, votes. Phones split the free width between name and
 *  bar (a 9rem name column would squeeze the bar to nothing). */
const STACK_COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.4rem_4.9rem] lg:grid-cols-[minmax(5.5rem,9rem)_minmax(0,1fr)_3.4rem_5.6rem]";
const VERY_MUTED = { color: "var(--app-text-very-muted)" };
const MUTED = { color: "var(--app-text-muted)" };
const serif = { fontFamily: "var(--font-serif)" };

function Segment({ name, party, inc, share, pct, won, align, compact }: {
  name: string; party: Party; inc: boolean; share: number; pct: number | null; won: boolean; align: "left" | "right"; compact: boolean;
}) {
  const showName = share >= NAME_MIN_SHARE;
  const color = won ? "#fff" : PARTY_TEXT[party];
  const nameEl = showName ? <span className="min-w-0 truncate" title={name}>{lastName(name)}{inc && <span title="Incumbent">{compact ? " •" : " · inc."}</span>}{won ? " ✓" : ""}</span> : <span />;
  const figs = <span className="shrink-0 tabular-nums">{pct == null ? "" : `${pct.toFixed(1)}%`}</span>;
  return (
    <div className={`flex min-w-0 items-center justify-between gap-1.5 ${compact ? "px-[7px] text-[11.5px]" : "px-3 text-[13px]"} ${won ? "font-bold" : "font-medium"}`}
      style={{ ...(align === "left" ? { width: `${share}%` } : { flex: 1 }), background: won ? PARTY_FILL[party] : PARTY_TINT[party], color }}>
      {align === "left" ? <>{nameEl}{figs}</> : <>{figs}{nameEl}</>}
    </div>
  );
}

export function SplitBar({ row, compact }: { row: ResultsRow; compact: boolean }) {
  const { prior, live, proj } = row;
  const hasVotes = !!live && live.total > 0;
  const two = hasVotes ? live!.dem + live!.rep : 0;
  const dShare = two > 0 ? (live!.dem / two) * 100 : 50;
  const won = (p: Party) => proj.locked && proj.winner === p;
  const pct = (v: number) => (hasVotes ? (v / live!.total) * 100 : null);
  return (
    <div className={`flex overflow-hidden transition-[filter] duration-150 group-hover:brightness-[0.93] ${compact ? "h-6 rounded" : "h-10 rounded-md"}`}>
      <Segment name={prior.dem.name} party={prior.dem.party} inc={prior.dem.incumbent} share={dShare} pct={pct(live?.dem ?? 0)} won={won(prior.dem.party) && prior.dem.party !== prior.rep.party} align="left" compact={compact} />
      <Segment name={prior.rep.name} party={prior.rep.party} inc={prior.rep.incumbent} share={100 - dShare} pct={pct(live?.rep ?? 0)} won={won(prior.rep.party)} align="right" compact={compact} />
    </div>
  );
}

function raceNote(row: ResultsRow): string | null {
  const { prior } = row;
  if (prior.forecast.contest.startsWith("uncontested")) return "Uncontested";
  if (prior.forecast.contest.startsWith("same-party")) return "Same party";
  if (prior.rcv) return "RCV first choices";
  if (prior.jungle) return "Jungle round";
  return null;
}

/** Under the bar: each side's votes at its end. */
export function VoteLine({ row }: { row: ResultsRow }) {
  const { prior, live } = row;
  if (!live || live.total <= 0) return <div className="mt-1 h-4" />;
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
      <span style={{ color: PARTY_TEXT[prior.dem.party] }}>{fmtInt(live.dem)}</span>
      <span style={{ color: PARTY_TEXT[prior.rep.party] }}>{fmtInt(live.rep)}</span>
    </div>
  );
}

/** The stacked candidate layout (trial, 2026-10-26): one line per candidate, Democrat over
 *  Republican, with last name, a thin bar sized by share (solid once that candidate is called the
 *  winner), share and votes. SplitBar + VoteLine above are the head-to-head layout it replaces. */
function CandidateStack({ row }: { row: ResultsRow }) {
  const { prior, live, proj } = row;
  const hasVotes = !!live && live.total > 0;
  const lines = [
    { c: prior.dem, votes: live?.dem ?? 0 },
    { c: prior.rep, votes: live?.rep ?? 0 },
  ];
  const leader = hasVotes ? (live!.dem >= live!.rep ? 0 : 1) : -1;
  return (
    <div className="grid gap-1">
      {lines.map(({ c, votes }, i) => {
        const pct = hasVotes ? (votes / live!.total) * 100 : null;
        const won = proj.locked && proj.winner === c.party && (i === 1 || prior.dem.party !== prior.rep.party);
        const lead = i === leader;
        return (
          <div key={i} className={`grid items-center gap-x-2 text-[13px] tabular-nums lg:gap-x-3 ${STACK_COLS}`}>
            <span className="truncate" style={{ color: PARTY_TEXT[c.party], fontWeight: won || lead ? 700 : 500 }} title={c.name}>
              {lastName(c.name)}{c.incumbent && <span className="text-[11px] font-medium" style={VERY_MUTED}> · inc.</span>}{won ? " ✓" : ""}
            </span>
            <span className="h-2.5 overflow-hidden rounded-sm" style={{ background: "var(--app-tab-bg)" }}>
              <span className="block h-full rounded-sm" style={{ width: `${pct ?? 0}%`, background: won ? PARTY_FILL[c.party] : `color-mix(in srgb, ${PARTY_TEXT[c.party]} 45%, transparent)` }} />
            </span>
            <span className="text-right" style={{ color: pct == null ? "var(--app-text-very-muted)" : PARTY_TEXT[c.party], fontWeight: won || lead ? 700 : 500 }}>{pct == null ? "—" : `${pct.toFixed(1)}%`}</span>
            <span className="text-right text-[12px]" style={MUTED}>{hasVotes ? fmtInt(votes) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ResultsRaceTable({ rows, selected, onSelect }: { rows: ResultsRow[]; selected: string | null; onSelect: (r: ResultsRow) => void }) {
  return (
    <div>
      <div className={`hidden pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider ${GRID}`} style={MUTED}>
        <span>Race</span>
        <span className={`grid gap-x-3 ${STACK_COLS}`}><span>Candidate</span><span /><span className="text-right">Pct</span><span className="text-right">Votes</span></span>
        <span className="text-right">Margin</span>
        <span className="text-right">Projected</span>
        <span className="text-right">Forecast</span>
        <span className="text-right">In</span>
      </div>
      <div className="lg:flex lg:flex-col lg:gap-2">
        {rows.map((row) => {
          const { prior, live, proj } = row;
          const key = raceHash(prior);
          const hasVotes = !!live && live.total > 0;
          const pWin = proj.probD >= 0.5 ? proj.probD : 1 - proj.probD;
          const pSide = proj.probD >= 0.5 ? prior.dem.party : prior.rep.party;
          const note = raceNote(row);
          const margin = <span className="font-bold tabular-nums" style={{ ...serif, fontSize: 18, color: callSideColor(proj.currentMargin, prior) }}>{hasVotes ? fmtCall(proj.currentMargin, prior) : "—"}</span>;
          // "7 PM"; a state split across time zones "7/8 PM" (the first close, then the last).
          const close = prior.pollsClose.last !== prior.pollsClose.first
            ? `${fmtClose(prior.pollsClose.first).replace(/ [AP]M$/, "")}/${fmtClose(prior.pollsClose.last)}`
            : fmtClose(prior.pollsClose.first);
          return (
            <div key={key} data-race-row={key} role="button" tabIndex={0} onClick={() => onSelect(row)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } }}
              className={`group -mx-2 flex cursor-pointer flex-col gap-1 rounded-md border-b px-2 py-2 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)] lg:border-b-0 lg:py-1 ${GRID}`}
              style={{ borderColor: "var(--app-border)", background: selected === key ? "color-mix(in srgb, var(--app-text-primary) 7%, transparent)" : undefined }}>
              {/* Race (+ margin on phones) */}
              <div className="flex items-baseline justify-between gap-2 lg:flex-col lg:items-start lg:gap-0.5">
                <div className="flex min-w-0 items-baseline gap-1.5 lg:flex-col lg:items-start lg:gap-0.5">
                  <span className="text-[15px] font-bold group-hover:underline lg:text-sm">{prior.label}</span>
                  <span className="hidden whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums lg:inline-block" title={`Polls close ${close} ET${prior.pollsClose.note ? ` · ${prior.pollsClose.note}` : ""}`}
                    style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>{close}</span>
                  {(prior.office === "house" || note) && (
                    <span className="truncate text-[11px]" style={VERY_MUTED}>
                      {prior.office === "house" && prior.stateName}
                      {note && <span className={`${prior.office === "house" ? "ml-1 " : ""}font-bold uppercase tracking-wider`} style={MUTED}>{note}</span>}
                    </span>
                  )}
                </div>
                <span className="lg:hidden">{margin}</span>
              </div>

              <CandidateStack row={row} />

              {/* Columns (lg+) */}
              <div className="hidden flex-col items-end gap-0.5 lg:flex">
                {margin}
                {proj.locked && proj.winner && <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white" style={{ background: PARTY_FILL[proj.winner] }}>Called</span>}
              </div>
              <div className="hidden text-right lg:block">
                {hasVotes ? <>
                  <div className="text-sm font-bold tabular-nums" style={{ color: callSideColor(proj.margin, prior) }}>{fmtCall(proj.margin, prior)} <span className="text-[11px] font-normal" style={VERY_MUTED}>±{proj.sigma.toFixed(1)}</span></div>
                  <div className="text-[11px] tabular-nums" style={MUTED}>{proj.locked ? "Called" : `${Math.round(pWin * 100)}% ${pSide}`}</div>
                </> : <span style={VERY_MUTED}>—</span>}
              </div>
              <div className="hidden text-right lg:block">
                <div className="text-sm font-semibold tabular-nums" style={{ color: callSideColor(prior.forecast.margin, prior) }}>{fmtCall(prior.forecast.margin, prior)}</div>
                <div className="text-[11px]" style={MUTED}>{prior.forecast.rating}</div>
              </div>
              <div className="hidden text-right lg:block">
                {hasVotes ? <>
                  <div className="text-sm font-semibold tabular-nums" style={{ color: inColor(inState(proj.countedShare * 100)) }}>{inState(proj.countedShare * 100) === "done" && "✓ "}{fmtIn(proj.countedShare * 100)}</div>
                  <div className="text-[11px] tabular-nums" style={MUTED}>feed {Math.round(live!.percentReporting)}%</div>
                </> : <span className="text-sm" style={VERY_MUTED}>0%</span>}
              </div>

              {/* Phones: the lg+ columns in one line (projection + odds, % in; forecast, poll close) */}
              <div className="flex flex-wrap justify-between gap-x-3 text-[11px] tabular-nums lg:hidden" style={VERY_MUTED}>
                <span>{hasVotes ? <>Proj. <b style={{ color: callSideColor(proj.margin, prior) }}>{fmtCall(proj.margin, prior)}</b> ({proj.locked ? "called" : `${Math.round(pWin * 100)}% ${pSide}`}) · <span style={{ color: inColor(inState(proj.countedShare * 100)) }}>{fmtIn(proj.countedShare * 100)} in</span></> : <>Forecast <b style={{ color: callSideColor(prior.forecast.margin, prior) }}>{prior.forecast.rating}</b></>}</span>
                <span>{hasVotes && <>Fcst <span style={{ color: callSideColor(prior.forecast.margin, prior) }}>{fmtCall(prior.forecast.margin, prior)}</span> · </>}Closes {close}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

