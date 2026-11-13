import type { CSSProperties, ReactNode } from "react";
import type { ChamberSummaryData } from "@/lib/stateLegChamberSummary";
import { chamberOutcome, OUTCOME_LABEL, outcomeColor, type ChamberOutcome } from "@/lib/chamberOutcome";
import { flipBackground } from "@/components/FlipStripes";
import { FIG } from "@/components/ResultRowKit";

export const fmtChamberMargin = (m: number) => (m === 0 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const marginColor = (m: number) => (m === 0 ? "var(--app-text-primary)" : m > 0 ? "var(--party-rep)" : "var(--party-dem)");
export const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
const fmtVotes = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString("en-US"));

const DEM = "var(--party-dem)";
const REP = "var(--party-rep)";
const IND = "var(--party-ind)";
const INK = "var(--app-text-primary)";
const MUTED = "var(--app-text-muted)";
const FAINT = "var(--app-text-very-muted)";
const BORDER = "var(--app-border)";

const SEATS_SIZE = "clamp(1.75rem, 5.2vw, 2.35rem)";
const NOW_SIZE = "clamp(2.15rem, 6.4vw, 2.9rem)";
const MARGIN_SIZE = "clamp(1.25rem, 3.3vw, 1.5rem)";

type Seats = { dem: number; rep: number; oth?: number };

/**
 * Now → projected in one bar: the projected split, with the seats changing hands striped in the
 * party that gains them (D's from the now-edge of the blue in toward the red, R's the other way),
 * and a tick at the seat a majority takes. Without a projection it is simply today's split.
 */
export function ChangeBar({ now, next, total, majority, h = 14, delay = 0 }: { now: Seats | null; next: Seats | null; total: number; majority: number | null; h?: number; delay?: number }) {
  const shown = next ?? now;
  if (!shown) return null;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  const grow = { animationDelay: `${delay}ms` };
  const oth = shown.oth ?? 0;
  const stripe = (color: string) => flipBackground(color, 1.4);
  return (
    <div className="relative" style={{ height: h }}>
      <div className="absolute inset-0 overflow-hidden rounded-[2px]" style={{ background: "var(--party-ind-subtle)" }}>
        <div className="vh-bar-d absolute inset-y-0 left-0" style={{ width: pct(shown.dem), background: DEM, ...grow }} />
        {oth > 0 && <div className="vh-bar-d absolute inset-y-0" style={{ left: pct(shown.dem), width: pct(oth), background: IND, ...grow }} />}
        <div className="vh-bar-r absolute inset-y-0 right-0" style={{ width: pct(shown.rep), background: REP, ...grow }} />
        {now && next && next.dem > now.dem && (
          <div className="vh-in absolute inset-y-0" style={{ left: pct(now.dem), width: pct(next.dem - now.dem), background: stripe(DEM), animationDelay: `${delay + 500}ms` }} />
        )}
        {now && next && next.rep > now.rep && (
          <div className="vh-in absolute inset-y-0" style={{ right: pct(now.rep), width: pct(next.rep - now.rep), background: stripe(REP), animationDelay: `${delay + 500}ms` }} />
        )}
      </div>
      {majority != null && (
        <span aria-hidden className="absolute w-[2px] -translate-x-1/2" style={{ left: pct(majority - 0.5), top: -4, bottom: -4, background: INK }} />
      )}
    </div>
  );
}

/** Seats gained against a baseline, named for the party with the bigger gain (the history cards' rule). */
export function netSeats(now: { dem: number; rep: number }, base: { dem: number; rep: number }): { party: "D" | "R"; seats: number } | null {
  const demNet = now.dem - base.dem;
  const repNet = now.rep - base.rep;
  if (demNet > repNet && demNet > 0) return { party: "D", seats: demNet };
  if (repNet > demNet && repNet > 0) return { party: "R", seats: repNet };
  return null;
}

function Mini({ children, color = FAINT }: { children: ReactNode; color?: string }) {
  return <div className="text-[10px] font-bold uppercase tracking-wider sm:text-[11px]" style={{ color }}>{children}</div>;
}

// Both parts share the margin column's width, so the two vote margins stack.
const COLS = "grid items-start gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_15rem]";

/** A seat split in the site serif: "42D · 58R", independents between. */
function SeatFig({ dem, rep, oth = 0, size = SEATS_SIZE }: Seats & { size?: string }) {
  const sep = <span style={{ color: FAINT }}>&thinsp;·&thinsp;</span>;
  return (
    <span className="whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: size }}>
      <span style={{ color: DEM }}>{dem}D</span>{sep}
      {oth > 0 && <><span style={{ color: IND }}>{oth}I</span>{sep}</>}
      <span style={{ color: REP }}>{rep}R</span>
    </span>
  );
}

/** A majority status as a bubble beside a part's label, tinted in the holder's colour (grey when no one holds it). */
function StatusPill({ o }: { o: ChamberOutcome | null }) {
  if (!o) return null;
  const color = outcomeColor(o);
  return (
    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold sm:text-sm" style={{ color: color ?? MUTED, background: color ? `color-mix(in srgb, ${color} 13%, transparent)` : "var(--app-tab-bg)" }}>
      {OUTCOME_LABEL[o]}
    </span>
  );
}

/** One cycle's vote margin: adjusted in party colour beside raw in grey, each captioned below. */
function MarginPair({ title, adjusted, raw, children }: { title: string; adjusted: number | null | undefined; raw: number | null | undefined; children?: ReactNode }) {
  const fig = (m: number | null | undefined, caption: string, colored: boolean) => (
    <span className="inline-grid gap-1">
      <span className="whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: MARGIN_SIZE, color: m == null ? FAINT : colored ? marginColor(m) : MUTED }}>
        {m == null ? "—" : fmtChamberMargin(m)}
      </span>
      <Mini>{caption}</Mini>
    </span>
  );
  return (
    <div className="min-w-0">
      <Mini color={MUTED}>{title}</Mini>
      <div className="mt-2 flex items-start gap-7">
        {fig(adjusted, "Adjusted", true)}
        {fig(raw, "Raw", false)}
      </div>
      {children}
    </div>
  );
}

/** The chamber's headline: today's seats beside the last election's vote margin, the facts row
 *  (up this year · contested · map first used), then the 2026 projection card (seats, one bar of
 *  the change, control odds) beside its projected margin, adjusted and raw. */
export default function ChamberSummary({ s, electionYear }: { s: ChamberSummaryData; electionYear: number }) {
  const { seats, totalSeats, projection, margin, popularVote, upcoming, fieldStats, mapInfo, calendar, currentEra } = s;
  const total = totalSeats ?? seats?.total ?? null;
  const projTotal = projection?.totalSeats ?? total ?? 1;
  const majority = projection?.majority ?? (total ? Math.floor(total / 2) + 1 : null);
  const supermajority = projection?.supermajority ?? mapInfo?.supermajoritySeats ?? null;
  const vacant = seats && total && total > seats.total ? total - seats.total : 0;
  const nowStatus = seats && majority != null ? chamberOutcome(seats.dem, seats.rep, majority, supermajority) : null;
  // Each seat's projected winner, summed: the count the chamber map shows. The range and the
  // control odds come from the simulation.
  const fav = projection?.favored;
  const projStatus = fav && majority != null ? chamberOutcome(fav.dem, fav.rep, majority, supermajority) : null;
  const net = seats && fav ? netSeats(fav, seats) : null;
  const projLead: "D" | "R" | null = fav ? (fav.dem > fav.rep ? "D" : fav.rep > fav.dem ? "R" : null) : null;
  const pLead = projection && projLead ? (projLead === "D" ? projection.pDemControl : projection.pRepControl) : null;
  const pSuperLead = projection && projLead ? (projLead === "D" ? projection.pDemSuper : projection.pRepSuper) : null;
  const leadColor = projLead === "D" ? DEM : REP;
  const frequency = mapInfo?.electionFrequency ?? calendar?.frequency ?? null;
  const asOf = seats ? ("asOf" in seats ? `as of ${new Date(`${seats.asOf}-15`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : `after the ${seats.year} election`) : null;

  const stat = (label: string, value: ReactNode, sub: ReactNode, i: number) => (
    <div className="vh-in min-w-0" style={{ animationDelay: `${260 + i * 70}ms` }}>
      <Mini>{label}</Mini>
      <div className="mt-1 font-bold leading-tight tabular-nums" style={{ fontSize: "clamp(1rem, 2.3vw, 1.15rem)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: FAINT }}>{sub}</div>}
    </div>
  );

  const facts = (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {stat(
            `Up in ${electionYear}`,
            upcoming ? (upcoming.wholeChamber ? `All ${upcoming.seatsUp}` : `${upcoming.seatsUp} of ${upcoming.totalSeats ?? total}`) : "None",
            upcoming ? (upcoming.wholeChamber ? "whole chamber" : upcoming.parity ? `${upcoming.parity}-numbered districts` : frequency) : frequency,
            0,
          )}
          {stat("Contested", fieldStats ? `${fieldStats.contested} of ${fieldStats.districts}` : "—", fieldStats ? `${fieldStats.districts - fieldStats.contested} one-party · ${fieldStats.open} open` : null, 1)}
          {stat("Map first used", mapInfo?.firstCycle ?? "—", mapInfo?.source ?? currentEra?.source ?? null, 2)}
        </div>
  );

  // The bar sits with the projection; a chamber not on this year's ballot keeps it under today's seats.
  const bar = total && (seats || fav) ? (
    <ChangeBar now={seats} next={fav ?? null} total={fav ? projTotal : Math.max(total, seats?.total ?? 0)} majority={majority} delay={80} />
  ) : null;
  const thresholds = [majority != null ? `${majority} for a majority` : null, supermajority != null ? `${supermajority} for a supermajority` : null];

  // The card takes the projected leader's colour; a projection without one stays neutral.
  const tint = projLead ? leadColor : null;
  const odds = projection && (projection.pDemControl == null
    ? <div className="text-xs" style={{ color: FAINT }}>{projection.unprojected} seats unprojected, so no control odds</div>
    : (
      <div className="flex flex-wrap gap-x-2.5 text-sm tabular-nums" style={{ color: MUTED }}>
        {[
          projLead && pLead != null ? <>P({projLead} control) <b style={{ color: leadColor }}>{fmtProb(pLead)}</b></> : null,
          projLead && pSuperLead != null && pSuperLead >= 0.01 && supermajority ? <>supermajority <b style={{ color: leadColor }}>{fmtProb(pSuperLead)}</b></> : null,
          projection.hi80 > projection.lo80 ? <span style={{ color: FAINT }}>80% range D {projection.lo80}–{projection.hi80}</span> : null,
        ].filter(Boolean).map((part, i) => <span key={i} className="whitespace-nowrap">{part}</span>)}
      </div>
    ));

  return (
      // Today's chamber as a plain header on the page, its facts row, then the projection as a card
      // tinted in its leader's colour. The card's padding is matched on the header's right so the
      // margins stack.
      <section className="flex flex-col gap-6">
        {seats && (
          <div className={`${COLS} pt-2 md:pr-7`}>
            <div className="vh-in min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Mini color={MUTED}>{["Now", asOf, vacant ? `${vacant} vacant` : null].filter(Boolean).join(" · ")}</Mini>
                <StatusPill o={nowStatus} />
              </div>
              <div className="mt-2">
                <SeatFig dem={seats.dem} rep={seats.rep} oth={seats.oth} size={NOW_SIZE} />
              </div>
              {!fav && bar && (
                <div className="mt-4">
                  {bar}
                  <div className="mt-2.5 flex flex-wrap gap-x-3 text-xs tabular-nums" style={{ color: FAINT }}>
                    {thresholds.filter(Boolean).map((t) => <span key={t} className="whitespace-nowrap">{t}</span>)}
                  </div>
                </div>
              )}
            </div>
            {margin ? (
              <div className="vh-in md:pt-1" style={{ animationDelay: "120ms" }}>
                <MarginPair title={`${margin.year} vote margin`} adjusted={margin.corrected} raw={margin.raw} />
              </div>
            ) : <div />}
          </div>
        )}
        {facts}
        {fav && (
          // The card reacts as a whole on hover (globals.css .ch-card); the rise-in sits on a wrapper
          // so its animation doesn't hold the card's transform.
          <div className="vh-in" style={{ animationDelay: "60ms" }}>
          <div
            className="ch-card rounded-2xl p-5 sm:p-7"
            style={{
              "--ch-border": tint ? `color-mix(in srgb, ${tint} 22%, var(--app-border))` : BORDER,
              "--ch-border-hover": tint ? `color-mix(in srgb, ${tint} 40%, var(--app-border))` : "var(--app-text-very-muted)",
              "--ch-shadow": tint ? `0 1px 2px rgb(0 0 0 / 0.04), 0 14px 32px -18px color-mix(in srgb, ${tint} 45%, transparent)` : "0 1px 2px rgb(0 0 0 / 0.04)",
              "--ch-shadow-hover": tint ? `0 2px 4px rgb(0 0 0 / 0.05), 0 22px 44px -18px color-mix(in srgb, ${tint} 60%, transparent)` : "0 2px 4px rgb(0 0 0 / 0.05), 0 18px 36px -18px rgb(0 0 0 / 0.25)",
              background: tint
                ? `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${tint} 11%, var(--app-bg)) 0%, color-mix(in srgb, ${tint} 3%, var(--app-bg)) 55%, var(--app-bg) 100%)`
                : "var(--app-tab-bg)",
            } as CSSProperties}
          >
            <div className={COLS}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Mini color={INK}>{electionYear} projection</Mini>
                  <StatusPill o={projStatus} />
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <SeatFig dem={fav.dem} rep={fav.rep} oth={fav.oth} />
                  {net && <span className="font-bold tabular-nums" style={{ fontSize: "clamp(0.95rem, 2.4vw, 1.2rem)", color: net.party === "D" ? DEM : REP }}>+{net.seats} {net.party}</span>}
                </div>
                {bar && <div className="mt-4">{bar}</div>}
                <div className="mt-2.5 flex flex-col gap-0.5">
                  {/* Each item wraps whole, so a line never starts or ends on a separator. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums" style={{ color: FAINT }}>
                    {net && (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: flipBackground(net.party === "D" ? DEM : REP, 1.4) }} />
                        projected flips
                      </span>
                    )}
                    {thresholds.filter(Boolean).map((t) => <span key={t} className="whitespace-nowrap">{t}</span>)}
                  </div>
                  {odds}
                </div>
              </div>
              {popularVote ? (
                <div className="vh-in md:pt-1" style={{ animationDelay: "180ms" }}>
                  <MarginPair title={`${electionYear} projected margin`} adjusted={popularVote.adjusted} raw={popularVote.raw}>
                    <div className="mt-2 text-xs tabular-nums" style={{ color: FAINT }}>
                      <span style={{ color: DEM }}>D {fmtVotes(popularVote.dem)}</span> · <span style={{ color: REP }}>R {fmtVotes(popularVote.rep)}</span> · {fmtVotes(popularVote.votes)} votes
                    </div>
                  </MarginPair>
                </div>
              ) : <div />}
            </div>
          </div>
          </div>
        )}
      </section>
  );
}
