"use client";

import { useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { BallotCandidate, BallotHoldover, BallotRace, ChamberBlock, HouseRow } from "@/lib/statePage";
import { getRatingColors } from "@/lib/colorScale";
import CandidateLink from "@/components/CandidateLink";
import { useRevealOnce } from "@/lib/useRevealOnce";
import { MiniDistrictLocator } from "@/components/RaceLocator";

/**
 * The state page's "On the ballot" section, in two parts. Federal: the Senate seats as matchup
 * cards (photos, the margin between them), then the House delegation
 * as ledger rows (Democrat · Republican · margin · rating). State: the governor and the
 * legislature's chambers as ledger rows, so a long list stays a list.
 * Motion is the race pages' (globals.css .vh-*): rows rise in staggered once on screen, tint on
 * hover, the margin swells and arrows lean.
 */

// The race pages' stagger: 55 ms a row, capped so a long list doesn't trail.
const enter = (i: number) => Math.min(i, 8) * 55;

// Never "Even": margin <= 0 is D, as everywhere on the site, so a rounded-to-zero margin reads D+0.0.
const fmtMargin = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const fmtProb = (p: number) => (p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
const partyColor = (p: string) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : "var(--party-ind)");
const partyWord = (p: string) => (p === "D" ? "Democrat" : p === "R" ? "Republican" : "Independent");
// Figures in the site serif, as in the state hero (its TPL and seat counts).
const FIG = { fontFamily: "var(--font-serif)", fontWeight: 700, letterSpacing: "-0.01em" } as const;

// A chamber's rating from its control odds (the races' labels, on a probability scale).
function chamberRating(pDem: number): string {
  const p = Math.max(pDem, 1 - pDem);
  const side = pDem >= 0.5 ? "D" : "R";
  return `${p >= 0.95 ? "Safe" : p >= 0.75 ? "Likely" : p >= 0.6 ? "Lean" : "Tilt"} ${side}`;
}

function RatingPill({ rating }: { rating: string }) {
  const { bg, text } = getRatingColors(rating);
  return <span className="text-xs font-semibold py-0.5 rounded-full text-center shrink-0 w-[4.6rem]" style={{ background: bg, color: text }}>{rating}</span>;
}

function QuietPill({ children }: { children: string }) {
  return <span className="text-xs font-medium py-0.5 rounded-full text-center shrink-0 w-[4.6rem]" style={{ color: "var(--app-text-very-muted)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}>{children}</span>;
}

function Eyebrow({ children, sub }: { children: string; sub?: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="shrink-0 text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{children}</span>
      {sub && <span className="truncate text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>{sub}</span>}
    </span>
  );
}

/** The race pages' photo frame: rounded, party-colored border, the party placeholder when there's no photo. */
function Photo({ name, party, photo, w }: { name: string; party: string; photo: string | null; w: number }) {
  const h = Math.round(w * 1.25);
  const placeholder = party === "D" ? "/candidates/placeholder-democrat.png" : party === "R" ? "/candidates/placeholder-republican.png" : null;
  return (
    <span className="block shrink-0 overflow-hidden" style={{ width: w, height: h, borderRadius: w > 40 ? 9 : 7, border: `2px solid ${partyColor(party)}`, background: "var(--app-tab-bg)" }}>
      {photo ? (
        <Image src={photo} alt={name} width={w * 2} height={h * 2} className="w-full h-full object-cover object-top" />
      ) : placeholder ? (
        <Image src={placeholder} alt="" width={w * 2} height={h * 2} className="w-full h-full object-contain p-1 opacity-55" />
      ) : (
        <svg viewBox="0 0 64 80" className="w-full h-full" aria-hidden="true">
          <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
          <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
        </svg>
      )}
    </span>
  );
}

/**
 * Given name over surname, so every name is the same two lines whatever its length; a long surname
 * steps down a size and truncates last. An incumbent's party-colored asterisk sits on the side of
 * the surname that faces the other candidate.
 */
function Name({ c, state, dot, align = "left", size = "md" }: { c: BallotCandidate; state: string; dot: "before" | "after"; align?: "left" | "right"; size?: "md" | "sm" }) {
  const parts = c.name.split(" ");
  const given = parts.length > 1 ? parts[0] : "";
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : c.name;
  const base = size === "md" ? 1.12 : 1;
  const fontSize = `${surname.length > 13 ? base * 0.8 : surname.length > 10 ? base * 0.9 : base}rem`;
  // The incumbent mark: a party-colored asterisk tucked against the surname.
  const incMark = (side: "before" | "after") => c.incumbent ? <span className={`shrink-0 self-start font-bold leading-none ${side === "after" ? "-ml-1" : "-mr-1"}`} style={{ color: partyColor(c.party) }} aria-label="incumbent">*</span> : null;
  return (
    <span className={`grid min-w-0 leading-[1.15] ${align === "right" ? "text-right" : ""}`}>
      <span className="truncate text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>{given}{c.party === "I" ? " · Ind." : ""}</span>
      <span className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`} title={c.incumbent ? `${c.name} (incumbent)` : c.name}>
        {dot === "before" && incMark("before")}
        <CandidateLink
          name={c.name}
          state={state}
          className="relative min-w-0 truncate hover:underline"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize, color: partyColor(c.party) }}
          onClick={(e) => e.stopPropagation()}
        >
          {surname}
        </CandidateLink>
        {dot === "after" && incMark("after")}
      </span>
    </span>
  );
}

const samePair = (dem: BallotCandidate, rep: BallotCandidate) => dem.party === rep.party;

function Result({ margin, dem, rep, size, origin = "right center" }: { margin: number; dem: BallotCandidate | null; rep: BallotCandidate | null; size: string; origin?: string }) {
  const same = dem && rep && samePair(dem, rep);
  return (
    <span className="vh-margin inline-block whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: size, lineHeight: 1, transformOrigin: origin, color: same ? partyColor(dem.party) : margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
      {same ? `${dem.party} v ${rep.party}` : fmtMargin(margin)}
    </span>
  );
}

function IdleTrack({ label }: { label: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{label}</span>
      <span className="block h-[2px] my-[3px]" style={{ background: "repeating-linear-gradient(90deg, var(--app-border) 0 6px, transparent 6px 10px)" }} />
    </div>
  );
}

// "Senate (Seat 2)" → U.S. Senate / Seat 2.
function officeLabel(label: string): { title: string; sub: string | null } {
  const m = label.match(/^Senate \(Seat (\d)\)$/);
  return m ? { title: "U.S. Senate", sub: `Seat ${m[1]}` } : { title: label, sub: null };
}

// The Federal heading's rule runs across both Senate seats, so the cards drop their own.
const NO_RULE = { borderTop: "none" } as const;

/** A statewide race as a matchup card. */
function RaceCard({ race, state, delay }: { race: BallotRace; state: string; delay: number }) {
  const { title, sub } = officeLabel(race.label);
  const open = race.dem && race.rep && !race.dem.incumbent && !race.rep.incumbent;
  return (
    <div className="bl-card vh-row" style={{ ...NO_RULE, animationDelay: `${delay}ms` }}>
      <Link prefetch={false} href={race.href} aria-label={`View ${race.label} race`} className="absolute inset-0" />
      <div className="relative pointer-events-none grid gap-3">
        <div className="flex items-center gap-2.5 min-h-[30px]">
          <Eyebrow sub={[sub, open ? "Open seat" : null].filter(Boolean).join(" · ") || null}>{title}</Eyebrow>
          <RatingPill rating={race.rating} />
        </div>
        {race.dem && race.rep ? (
          <>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
              <Photo name={race.dem.name} party={race.dem.party} photo={race.dem.photo} w={60} />
              <div className="text-center">
                <Result margin={race.margin} dem={race.dem} rep={race.rep} size="1.85rem" origin="center" />
                <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>forecast</span>
              </div>
              <Photo name={race.rep.name} party={race.rep.party} photo={race.rep.photo} w={60} />
            </div>
            <div className="grid grid-cols-2 gap-3 pointer-events-auto">
              <Name c={race.dem} state={state} dot="after" />
              <Name c={race.rep} state={state} dot="before" align="right" />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 py-6">
            <span className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</span>
            <Result margin={race.margin} dem={null} rep={null} size="1.85rem" />
          </div>
        )}
      </div>
    </div>
  );
}

/** A seat with no election this year: who holds it and when it's next up. */
function HoldoverCard({ seat, delay }: { seat: BallotHoldover; delay: number }) {
  const { title, sub } = officeLabel(seat.label);
  return (
    <Link prefetch={false} href={seat.href} className="bl-card vh-row !flex flex-col gap-3" style={{ ...NO_RULE, animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 min-h-[30px]">
        <Eyebrow sub={sub}>{title}</Eyebrow>
        <QuietPill>Not up</QuietPill>
      </div>
      <div className="flex items-center gap-3">
        <Photo name={seat.name} party={seat.party} photo={seat.photo} w={60} />
        <div className="min-w-0">
          <div className="truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.2rem", color: partyColor(seat.party) }}>{seat.name}</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--app-text-very-muted)" }}>{partyWord(seat.party)} · next election {seat.nextElection}</div>
        </div>
      </div>
      {/* Pinned to the card's foot, level with the matchup's names beside it. */}
      <div className="mt-auto"><IdleTrack label="No race this year" /></div>
    </Link>
  );
}

/** The two Senate seats side by side. */
export function SenateCards({ senate, state }: { senate: (BallotRace | BallotHoldover)[]; state: string }) {
  const items = senate;
  const { ref, vh } = useRevealOnce();
  if (items.length === 0) return null;
  return (
    <div ref={ref} data-vh={vh} className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {items.map((x, i) => (x.kind === "race" ? <RaceCard key={x.href} race={x} state={state} delay={enter(i)} /> : <HoldoverCard key={x.href} seat={x} delay={enter(i)} />))}
    </div>
  );
}

const FOLD_AT = 10;

/** The House delegation as ledger rows; clicking a row shows that district on the map above. */
export function HouseLedger({ rows, state, activeId, onSelect }: { rows: HouseRow[]; state: string; activeId: string | null; onSelect: (row: HouseRow) => void }) {
  const [all, setAll] = useState(false);
  const { ref, vh } = useRevealOnce();
  const folded = !all && rows.length > FOLD_AT + 2;
  const shown = folded ? rows.slice(0, FOLD_AT) : rows;
  const key = (row: HouseRow) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } };
  return (
    <div ref={ref} data-vh={vh} className="bl-ledger">
      {shown.map((row, i) => {
        const active = row.id === activeId;
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            onClick={() => onSelect(row)}
            onKeyDown={key(row)}
            className="bl-row bl-row-house vh-row cursor-pointer"
            style={{ background: active ? "var(--app-tab-bg)" : undefined, boxShadow: active ? "inset 2px 0 0 var(--app-text-primary)" : undefined, animationDelay: `${enter(i)}ms` }}
          >
            <div className="bl-off">
              <MiniDistrictLocator stateAbbr={state} geoid={row.geoid} fill={getRatingColors(row.rating).bg} />
              <span className="min-w-0 leading-tight">
                <span className="flex items-baseline gap-2">
                  <Link prefetch={false} href={row.href} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-sm font-semibold tabular-nums hover:underline" style={{ color: "var(--app-text-primary)" }}>{row.label}</Link>
                  {/* The old row's open-seat tag, beside the district name. */}
                  {row.openHolder && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--redistrict-ss)" }} title={row.openHolder === "open seat" ? "Open seat" : `Open seat · ${row.openHolder} is not running`}>
                      Open
                    </span>
                  )}
                </span>
              </span>
            </div>
            {row.dem && row.rep ? (
              <>
                <div className="bl-dem"><Photo name={row.dem.name} party={row.dem.party} photo={row.dem.photo} w={34} /><Name c={row.dem} state={state} dot="after" size="sm" /></div>
                <div className="bl-rep"><Photo name={row.rep.name} party={row.rep.party} photo={row.rep.photo} w={34} /><Name c={row.rep} state={state} dot="after" size="sm" /></div>
              </>
            ) : (
              <div className="bl-span text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
            )}
            <div className="bl-mg"><Result margin={row.margin} dem={row.dem} rep={row.rep} size="1.2rem" /></div>
            <div className="bl-pill"><RatingPill rating={row.rating} /></div>
          </div>
        );
      })}
      {folded && (
        <div className="col-span-full flex justify-center pt-3.5">
          <button type="button" onClick={() => setAll(true)} className="ix-press rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
            Show all {rows.length} districts
          </button>
        </div>
      )}
    </div>
  );
}

// A seat's square: its rating's color; a sitting member off the ballot counts as safe for their party.
function toneStyle(t: string): React.CSSProperties {
  if (t.startsWith("not-up ")) {
    const p = t.slice(7);
    return { background: p === "D" || p === "R" ? getRatingColors(`Safe ${p}`).bg : "var(--party-ind)" };
  }
  if (t === "I") return { background: "var(--party-ind)" };
  if (t === "none") return { background: "var(--party-ind-subtle)" };
  return { background: getRatingColors(t).bg };
}

/**
 * One square per seat, most Democratic to most Republican, each in its own projected rating's color
 * (`tones`, from the server); a line at the majority mark.
 */
function SeatSquares({ dem, rep, total, tones }: { dem: number; rep: number; total: number; tones: string[] | null }) {
  const rows = total > 120 ? 3 : 2;
  const cols = Math.ceil(total / rows);
  const majCol = Math.ceil((Math.floor(total / 2) + 1) / rows);
  const style = (i: number): React.CSSProperties => (tones?.[i] ? toneStyle(tones[i]) : { background: i < dem ? "var(--party-dem)" : i >= total - rep ? "var(--party-rep)" : "var(--party-ind-subtle)" });
  return (
    <div className="relative grid w-full gap-[2px]" style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, auto)`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => <i key={i} className="block aspect-square rounded-[1.5px]" style={style(i)} title={tones?.[i]?.replace(/^not-up (\w)$/, "Not up · $1")} />)}
      <span className="absolute -top-1 -bottom-1 w-[2px]" style={{ left: `calc(${(majCol / cols) * 100}% - ${(majCol / cols) * 2}px)`, background: "var(--app-text-primary)" }} />
      <span className="sr-only">{`${dem} Democratic, ${rep} Republican of ${total} seats`}</span>
    </div>
  );
}
const squaresWidth = (total: number) => {
  const rows = total > 120 ? 3 : 2, cols = Math.ceil(total / rows);
  return Math.max(300, cols * (Math.min(12, Math.max(3.4, 560 / cols - 2)) + 2));
};

/** The governor's race as a ledger row in the chambers' columns: Democrat · Republican · margin · rating. */
function GovernorRow({ gov, state, electionYear }: { gov: BallotRace | BallotHoldover; state: string; electionYear: number }) {
  if (gov.kind !== "race") {
    return (
      <div className="bl-row vh-row">
        <div className="bl-off">
          <span className="min-w-0 leading-tight">
            <Link href={gov.href} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Governor</Link>
            <span className="block text-xs" style={{ color: "var(--app-text-very-muted)" }}>Not on the {electionYear} ballot</span>
          </span>
        </div>
        <div className="bl-span gap-3">
          <Photo name={gov.name} party={gov.party} photo={gov.photo} w={40} />
          <span className="min-w-0 leading-tight">
            <Link href={gov.href} prefetch={false} className="block truncate hover:underline" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.12rem", color: partyColor(gov.party) }}>{gov.name}</Link>
            <span className="block text-xs" style={{ color: "var(--app-text-very-muted)" }}>{partyWord(gov.party)} · next election {gov.nextElection}</span>
          </span>
        </div>
        <div className="bl-mg" />
        <div className="bl-pill"><QuietPill>Not up</QuietPill></div>
      </div>
    );
  }
  const open = gov.dem && gov.rep && !gov.dem.incumbent && !gov.rep.incumbent;
  return (
    <div className="bl-row vh-row">
      <div className="bl-off">
        <span className="min-w-0 leading-tight">
          <Link href={gov.href} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Governor</Link>
          {open && <span className="block text-xs" style={{ color: "var(--app-text-very-muted)" }}>Open seat</span>}
          <Link href={gov.href} prefetch={false} className="mt-0.5 block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>View race <span className="vh-lean" data-dir="r">→</span></Link>
        </span>
      </div>
      {gov.dem && gov.rep ? (
        <>
          <div className="bl-dem"><Photo name={gov.dem.name} party={gov.dem.party} photo={gov.dem.photo} w={40} /><Name c={gov.dem} state={state} dot="after" /></div>
          <div className="bl-rep"><Photo name={gov.rep.name} party={gov.rep.party} photo={gov.rep.photo} w={40} /><Name c={gov.rep} state={state} dot="after" /></div>
        </>
      ) : (
        <div className="bl-span text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Candidates TBD</div>
      )}
      <div className="bl-mg"><Result margin={gov.margin} dem={gov.dem} rep={gov.rep} size="1.2rem" /></div>
      <div className="bl-pill"><RatingPill rating={gov.rating} /></div>
    </div>
  );
}

/**
 * The state offices as ledger rows: the governor first, then each chamber with its projected seats
 * as squares across the candidate columns, control odds and rating.
 */
export function StateLedger({ governor, chambers, state, electionYear }: { governor: BallotRace | BallotHoldover | null; chambers: ChamberBlock[]; state: string; electionYear: number }) {
  const { ref, vh } = useRevealOnce();
  const offset = governor ? 1 : 0;
  return (
    <div ref={ref} data-vh={vh} className="bl-ledger">
      {governor && <GovernorRow gov={governor} state={state} electionYear={electionYear} />}
      {chambers.map((c, j) => {
        const i = j + offset;
        const hasProj = c.upText != null && c.projDem != null && c.projRep != null && !!c.projTotal;
        const dem = Math.round(c.projDem ?? 0), rep = Math.round(c.projRep ?? 0), total = c.projTotal ?? 0;
        const lead = c.pDem != null && c.pDem >= 0.5;
        return (
          <div key={c.chamber} className="bl-row vh-row" style={{ animationDelay: `${enter(i)}ms` }}>
            <div className="bl-off">
              <span className="min-w-0 leading-tight">
                <Link href={c.exploreHref} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>{c.label}</Link>
                <span className="block text-xs" style={{ color: "var(--app-text-very-muted)" }}>{c.upText ?? (c.totalSeats ? `${c.totalSeats} seats` : "")}</span>
                <Link href={c.exploreHref} prefetch={false} className="mt-0.5 block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>Explore {c.map.roster.length} districts <span className="vh-lean" data-dir="r">→</span></Link>
              </span>
            </div>
            {hasProj ? (
              <>
                <div className="bl-seats">
                  <div className="grid w-full gap-1.5" style={{ maxWidth: squaresWidth(total) }}>
                    <div className="flex items-baseline justify-between gap-3 tabular-nums">
                      <b style={{ ...FIG, fontSize: "1.25rem", color: "var(--party-dem)" }}>D {dem}</b>
                      <span className="truncate text-xs" style={{ color: "var(--app-text-very-muted)" }}>{Math.floor(total / 2) + 1} for majority · {c.within5} within 5 pts</span>
                      <b style={{ ...FIG, fontSize: "1.25rem", color: "var(--party-rep)" }}>R {rep}</b>
                    </div>
                    <SeatSquares dem={dem} rep={rep} total={total} tones={c.seatTones?.length === total ? c.seatTones : null} />
                  </div>
                </div>
                <div className="bl-mg flex-col !items-end gap-0.5">
                  {c.pDem != null ? (
                    <>
                      <span className="vh-margin inline-block tabular-nums whitespace-nowrap" style={{ ...FIG, fontSize: "1.2rem", lineHeight: 1, color: lead ? "var(--party-dem)" : "var(--party-rep)" }}>{lead ? "D" : "R"} {fmtProb(lead ? c.pDem : 1 - c.pDem)}</span>
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>control</span>
                    </>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{c.unprojected} unprojected</span>
                  )}
                </div>
                <div className="bl-pill">{c.pDem != null ? <RatingPill rating={chamberRating(c.pDem)} /> : <QuietPill>—</QuietPill>}</div>
              </>
            ) : (
              <>
                <div className="bl-seats text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>Not on the {electionYear} ballot</div>
                <div className="bl-mg" />
                <div className="bl-pill"><QuietPill>Not up</QuietPill></div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
