"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { flipBackground } from "@/components/FlipStripes";
import { LegislatureCard, tiltCard, untiltCard } from "@/components/post-election/StateRaceCards";
import { useTouchHover } from "@/lib/useTouchHover";
import type { ResultsYear, YearCandidate, YearRaceCard } from "@/lib/stateResultsByYear";

/**
 * "By year" results on the state page: a strip of the state's election years, each with its blended
 * popular vote (the year's offices blended with the TPL's weights, environment included), and under
 * the chosen year every race it held as the /overview cards: Statewide (the House popular vote, the
 * statewide races and the legislature's chambers, the overview's own card), then the House seats.
 * A race card fills with the winner's colour and carries more than the overview's: both candidates
 * and their shares, and the swing (House) or the gap to the year's blended vote (statewide). Motion is the overview's (globals.css rc-*): cards rise in staggered when the
 * year changes and tilt toward the pointer.
 */

// Never "Even": a margin names its leader (margin <= 0 is D, as everywhere on the site).
const fmt = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const sideColor = (m: number) => (m > 0 ? "var(--party-rep)" : "var(--party-dem)");
const fillOf = (p: string | null) => (p === "R" ? "var(--party-rep-fill)" : p === "D" ? "var(--party-dem-fill)" : p ? "var(--party-ind-fill)" : null);
const surname = (name: string) => name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").split(" ").pop() ?? name;
const FIG = { fontFamily: "var(--font-serif)", fontWeight: 700 } as const;

function tiltToPointer(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") tiltCard(e.currentTarget, e.clientX, e.clientY);
}
function resetTilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") untiltCard(e.currentTarget);
}

function Candidate({ c, won, style }: { c: YearCandidate; won: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`flex min-w-0 items-baseline justify-between gap-2 ${won ? "font-bold" : ""}`} style={style} title={`${c.name}${c.incumbent ? " (incumbent)" : ""}${c.pct != null ? ` ${c.pct.toFixed(1)}%` : ""}`}>
      <span className="min-w-0 truncate">{surname(c.name)}{c.incumbent && "*"}</span>
      {c.pct != null && <span className="shrink-0 tabular-nums">{c.pct.toFixed(1)}%</span>}
    </div>
  );
}

function RaceCard({ card, blended, index }: { card: YearRaceCard; blended: number | null; index: number }) {
  const fill = fillOf(card.winner);
  const soft = { color: fill ? "rgba(255,255,255,0.82)" : "var(--app-text-muted)" };
  const on = (c: string) => (fill ? "#ffffff" : c);
  const winnerIsDem = card.winner != null && card.dem?.party === card.winner;
  const first = winnerIsDem ? card.dem : card.rep ?? card.dem;
  const second = first === card.dem ? card.rep : card.dem;
  const compare = card.office === "house"
    ? card.swing && { label: "Swing", value: card.swing.value, star: card.swing.estimated, title: card.swing.estimated ? "From an estimate of the district's previous margin on these lines" : "Change from the district's previous margin" }
    : card.margin != null && blended != null ? { label: "Vs. blended", value: card.margin - blended, star: false, title: "This race's margin minus the year's blended popular vote" } : null;
  const body = (
    <div className="flex flex-col pb-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-semibold">{card.label}</span>
        {card.flip && <span className="rc-badge font-mono text-[10px] font-bold uppercase tracking-wider" title="The seat changed party from its previous election">Flip</span>}
      </div>
      <div className="mt-1 text-xl font-extrabold leading-none tabular-nums" style={{ color: on(card.margin != null ? sideColor(card.margin) : "var(--app-text-primary)") }}>
        {card.margin != null ? fmt(card.margin) : "Unopposed"}
      </div>
      {first && (
        <div className="mt-1.5 grid text-[11.5px] leading-snug">
          <Candidate c={first} won />
          {second && <Candidate c={second} won={false} style={soft} />}
        </div>
      )}
      {compare && (
        <div className="mt-0.5 truncate text-[11px] tabular-nums" style={soft} title={compare.title}>
          {compare.label} <b style={{ color: on(sideColor(compare.value)) }}>{fmt(compare.value)}{compare.star && "*"}</b>
        </div>
      )}
    </div>
  );
  const className = `rc-card group block h-full w-full py-1.5 pl-3 text-left align-top${fill ? " rounded-r-md pr-2" : ""}`;
  const style = {
    animationDelay: `${Math.min(index, 10) * 40}ms`,
    borderLeft: `1px solid ${fill ?? "var(--app-border)"}`,
    backgroundColor: fill ?? undefined,
    backgroundImage: card.flip ? flipBackground("linear-gradient(transparent, transparent)", 3, "rgba(255,255,255,0.18)") : undefined,
    color: fill ? "#ffffff" : undefined,
  };
  const common = { onPointerMove: tiltToPointer, onPointerLeave: resetTilt, "data-touch-hover": "", "data-filled": fill ? "" : undefined, className, style };
  return card.href ? <Link prefetch={false} href={card.href} aria-label={`${card.label} results`} {...common}>{body}</Link> : <div {...common}>{body}</div>;
}

function HousePvCard({ pv, index }: { pv: NonNullable<ResultsYear["housePv"]>; index: number }) {
  const fill = pv.margin > 0 ? "var(--party-rep-fill)" : "var(--party-dem-fill)";
  return (
    <div onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" data-filled="" className="rc-card block h-full w-full rounded-r-md py-1.5 pl-3 pr-2 text-left"
      style={{ animationDelay: `${index * 40}ms`, borderLeft: `1px solid ${fill}`, backgroundColor: fill, color: "#ffffff" }}
      title="Every House race's votes summed by party, margin over all votes">
      <div className="flex flex-col pb-1">
        <div className="truncate text-[15px] font-semibold">House popular vote</div>
        <div className="mt-1 text-xl font-extrabold leading-none tabular-nums">{fmt(pv.margin)}</div>
        <div className="mt-1.5 grid text-[11.5px] leading-snug tabular-nums">
          {[{ k: "Democrats", v: pv.demPct, won: pv.margin <= 0 }, { k: "Republicans", v: pv.repPct, won: pv.margin > 0 }].sort((a, b) => Number(b.won) - Number(a.won)).map((p) => (
            <div key={p.k} className={`flex items-baseline justify-between gap-2 ${p.won ? "font-bold" : ""}`} style={p.won ? undefined : { color: "rgba(255,255,255,0.82)" }}>
              <span>{p.k}</span><span>{p.v.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

export default function ResultsByYear({ years: newestFirst, stateId, unicameral }: { years: ResultsYear[]; stateId: string; unicameral: boolean }) {
  // The strip reads left to right in time; the newest year starts selected.
  const years = [...newestFirst].sort((a, b) => a.year - b.year);
  const latest = years[years.length - 1]?.year ?? 0;
  const [sel, setSel] = useState(latest);
  useTouchHover(tiltCard, untiltCard);
  // On a narrow screen the strip scrolls sideways: start it at the newest year.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = stripRef.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  const y = years.find((x) => x.year === sel) ?? years[years.length - 1];
  if (!y) return null;

  const races = y.statewide.length + y.house.length;
  const flips = [...y.statewide, ...y.house].filter((c) => c.flip).length;
  const houseD = y.house.filter((c) => c.winner === "D").length, houseR = y.house.filter((c) => c.winner === "R").length, houseO = y.house.length - houseD - houseR;
  const governor = y.statewide.find((c) => c.office === "governor");
  let i = 0;

  return (
    <div>
      {/* The years, each with its blended popular vote: the state's environment that year. */}
      <div ref={stripRef} className="flex overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ boxShadow: "inset 0 -1px 0 var(--app-border)" }} role="tablist" aria-label="Election year">
        {years.map((x) => {
          const active = x.year === y.year;
          return (
            <button key={x.year} type="button" role="tab" aria-selected={active} onClick={() => setSel(x.year)}
              className="ix-press shrink-0 px-3 pb-2 pt-1 text-center outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:px-4" style={{ boxShadow: active ? "inset 0 -2px 0 var(--app-text-primary)" : undefined }}>
              <span className="block text-[12px] font-bold tabular-nums" style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{x.year}</span>
              <span className="block whitespace-nowrap text-[1.05rem] leading-tight tabular-nums sm:text-[1.2rem]" style={{ ...FIG, color: x.blended != null ? sideColor(x.blended) : "var(--app-text-very-muted)", opacity: active ? 1 : 0.7 }}>
                {x.blended != null ? fmt(x.blended) : "—"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        Under each year, its blended popular vote: the year&apos;s offices weighted as the TPL weights them, environment included
        {" · "}{y.year}: {races} race{races === 1 ? "" : "s"}{y.legislature.length > 0 && `, ${y.legislature.length} chamber${y.legislature.length === 1 ? "" : "s"}`} · {flips} flip{flips === 1 ? "" : "s"}
        {y.counting && " · counts as saved after the election"}
      </div>

      <div key={y.year}>
        {(y.statewide.length > 0 || y.housePv || y.legislature.length > 0) && (
          <Group label="Statewide">
            {y.housePv && <HousePvCard pv={y.housePv} index={i++} />}
            {y.statewide.map((c) => <RaceCard key={c.key} card={c} blended={y.blended} index={i++} />)}
            {y.legislature.map((c) => <LegislatureCard key={c.chamber} result={c} stateId={stateId} unicameral={unicameral} governorParty={governor?.winner ?? null} year={y.year} index={i++} />)}
          </Group>
        )}
        {y.house.length > 0 && (
          <Group label={<>U.S. House · {y.house.length} {y.house.length === 1 ? "seat" : "seats"} · <span style={{ color: "var(--party-dem)" }}>{houseD}D</span> <span style={{ color: "var(--party-rep)" }}>{houseR}R</span>{houseO > 0 && ` ${houseO} other`}</>}>
            {y.house.map((c) => <RaceCard key={c.key} card={c} blended={y.blended} index={i++} />)}
          </Group>
        )}
      </div>
    </div>
  );
}
