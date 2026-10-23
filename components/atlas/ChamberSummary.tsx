import Link from "next/link";
import type { ReactNode } from "react";
import type { ChamberSummaryData } from "@/lib/stateLegChamberSummary";
import { chamberOutcome, OUTCOME_LABEL, outcomeColor, type ChamberOutcome } from "@/lib/chamberOutcome";

export const fmtChamberMargin = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const marginColor = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : m > 0 ? "var(--party-rep)" : "var(--party-dem)");
export const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
const fmtVotes = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString("en-US"));

const DEM = "var(--party-dem)";
const REP = "var(--party-rep)";
const IND = "var(--party-ind)";
const INK = "var(--app-text-primary)";
const MUTED = "var(--app-text-muted)";
const FAINT = "var(--app-text-very-muted)";
const BORDER = "var(--app-border)";

const SEATS_SIZE = "clamp(1.9rem, 5.2vw, 2.75rem)";
const ADJ_SIZE = "clamp(1.3rem, 3.4vw, 1.7rem)";
const RAW_SIZE = "clamp(1.05rem, 2.6vw, 1.3rem)";
const ARROW_SIZE = "clamp(1.4rem, 3.8vw, 2rem)";

/** Horizontal seat bar: D from the left, R from the right, other/vacant between; notch at the halfway line. */
export function SeatBar({ dem, rep, oth = 0, total, h }: { dem: number; rep: number; oth?: number; total: number; h?: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  return (
    <div className={`relative overflow-hidden rounded-[2px] ${h ? "" : "mt-1.5 h-[7px] sm:mt-2 sm:h-2"}`} style={{ height: h, background: "var(--party-ind-subtle)" }}>
      <div className="absolute inset-y-0 left-0" style={{ width: pct(dem), background: DEM }} />
      {oth > 0 && <div className="absolute inset-y-0" style={{ left: pct(dem), width: pct(oth), background: IND }} />}
      <div className="absolute inset-y-0 right-0" style={{ width: pct(rep), background: REP }} />
      <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2" style={{ background: "var(--app-bg)" }} />
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

function Head({ children }: { children: ReactNode }) {
  return <div className="mb-2.5 text-sm font-bold uppercase tracking-wider">{children}</div>;
}

function Split({ dem, rep, oth = 0, muted = false }: { dem: number; rep: number; oth?: number; muted?: boolean }) {
  return (
    <span className="whitespace-nowrap font-extrabold leading-none tabular-nums" style={{ fontSize: SEATS_SIZE, letterSpacing: "-0.02em", opacity: muted ? 0.75 : 1 }}>
      <span style={{ color: DEM }}>{dem}</span><span style={{ color: FAINT }}>–</span><span style={{ color: REP }}>{rep}</span>
      {oth > 0 && <><span style={{ color: FAINT }}>–</span><span style={{ color: IND }}>{oth}</span></>}
    </span>
  );
}

const Arrow = ({ size }: { size: string }) => <span className="px-1.5 font-normal sm:px-2.5" style={{ color: FAINT, fontSize: size }}>→</span>;

/** The majority status at the end of a bar row: what the chamber is now, what the projection makes it. */
function Status({ o, faded = false }: { o: ChamberOutcome | null; faded?: boolean }) {
  if (!o) return <span />;
  return <span className="whitespace-nowrap text-xs font-bold sm:text-sm" style={{ color: outcomeColor(o) ?? INK, opacity: faded ? 0.75 : 1 }}>{OUTCOME_LABEL[o]}</span>;
}

/** One margin line, old → new: adjusted in party colour, raw in grey. */
function MarginLine({ label, from, to, size, colored }: { label: string; from: number | null | undefined; to: number | null | undefined; size: string; colored: boolean }) {
  return (
    <>
      <Mini>{label}</Mini>
      <div className="flex items-baseline whitespace-nowrap leading-none tabular-nums" style={{ fontSize: size, fontWeight: colored ? 800 : 700, color: colored ? undefined : MUTED }}>
        {from != null && <span style={colored ? { color: marginColor(from), opacity: to != null ? 0.75 : 1 } : undefined}>{fmtChamberMargin(from)}</span>}
        {from != null && to != null && <Arrow size={size} />}
        {to != null && <span style={colored ? { color: marginColor(to) } : undefined}>{fmtChamberMargin(to)}</span>}
      </div>
    </>
  );
}

/** The chamber's headline: seats now → the 2026 projection with a bar and majority status for each,
 *  the vote margin (last election → 2026 projected, adjusted and raw), then the facts row. */
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

  const stat = (label: string, value: ReactNode, sub: ReactNode) => (
    <div className="min-w-0">
      <Mini>{label}</Mini>
      <div className="mt-1 font-bold leading-tight tabular-nums" style={{ fontSize: "clamp(1.1rem, 2.6vw, 1.35rem)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: FAINT }}>{sub}</div>}
    </div>
  );

  // Each imputed count said once, with the one methodology link.
  const notes: string[] = [];
  if (margin?.imputed) notes.push(`${margin.year}: ${margin.imputed} uncontested seat${margin.imputed === 1 ? "" : "s"} filled with the presidential vote`);
  if (popularVote?.imputed) notes.push(`${electionYear}: ${popularVote.imputed} one-party seat${popularVote.imputed === 1 ? "" : "s"} imputed as contested`);
  if (popularVote?.uncounted) notes.push(`${popularVote.uncounted} unopposed seat${popularVote.uncounted === 1 ? "" : "s"} with no count in the raw`);
  if (popularVote?.multiVote) notes.push("multi-member districts: voters cast more than one vote");

  return (
    <div className="flex flex-col gap-7">
      <section className="grid gap-x-10 gap-y-6 pt-3 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" style={{ borderTop: `2px solid ${INK}` }}>
        <div className="min-w-0">
          <Head>{fav ? <>Now <span style={{ color: FAINT }}>→</span> {electionYear} projection</> : "Current"}</Head>
          {/* Arrow, projected count and net gain wrap as one unit: on a big chamber (NH's 400) the
              whole projection drops below the current count instead of stranding the net gain. */}
          <div className="flex flex-wrap items-baseline gap-y-1">
            {seats && <Split dem={seats.dem} rep={seats.rep} oth={seats.oth} muted={!!fav} />}
            {fav && (
              <span className="flex items-baseline whitespace-nowrap">
                {seats && <Arrow size={ARROW_SIZE} />}
                <Split dem={fav.dem} rep={fav.rep} oth={fav.oth} />
                {net && <span className="ml-3 font-bold tabular-nums" style={{ fontSize: "clamp(0.95rem, 2.4vw, 1.2rem)", color: net.party === "D" ? DEM : REP }}>+{net.seats} {net.party}</span>}
              </span>
            )}
          </div>
          <div className="mt-3 grid items-center gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "2.5rem minmax(0,1fr) auto" }}>
            {seats && total && <>
              <Mini>Now</Mini>
              <div style={{ opacity: fav ? 0.55 : 1 }}><SeatBar dem={seats.dem} rep={seats.rep} oth={seats.oth} total={Math.max(total, seats.total)} h={fav ? 8 : 14} /></div>
              <Status o={nowStatus} faded={!!fav} />
            </>}
            {fav && <>
              <Mini color={INK}>{electionYear}</Mini>
              <SeatBar dem={fav.dem} rep={fav.rep} oth={fav.oth} total={projTotal} h={14} />
              <Status o={projStatus} />
            </>}
          </div>
          <div className="mt-2.5 flex flex-col gap-0.5">
            <div className="text-xs tabular-nums" style={{ color: FAINT }}>{[asOf, vacant ? `${vacant} vacant` : null, majority != null ? `${majority} for a majority` : null].filter(Boolean).join(" · ")}</div>
            {projection && (projection.pDemControl == null
              ? <div className="text-xs" style={{ color: FAINT }}>{projection.unprojected} seats unprojected, so no control odds</div>
              : (
                <div className="text-sm tabular-nums" style={{ color: MUTED }}>
                  {projLead && pLead != null && <>P({projLead} control) <b style={{ color: leadColor }}>{fmtProb(pLead)}</b></>}
                  {projLead && pSuperLead != null && pSuperLead >= 0.01 && supermajority && <> · supermajority <b style={{ color: leadColor }}>{fmtProb(pSuperLead)}</b></>}
                  {projection.hi80 > projection.lo80 && <span style={{ color: FAINT }}> · 80% range D {projection.lo80}–{projection.hi80}</span>}
                </div>
              ))}
          </div>
        </div>
        {(margin || popularVote) && (
          <div className="min-w-0">
            <Head>Vote margin <span className="font-semibold normal-case tracking-normal" style={{ color: FAINT }}>{[margin?.year, popularVote ? `${electionYear} proj.` : null].filter(Boolean).join(" → ")}</span></Head>
            <div className="grid items-baseline gap-x-3 gap-y-2.5" style={{ gridTemplateColumns: "4.25rem auto" }}>
              <MarginLine label="Adjusted" from={margin?.corrected} to={popularVote?.adjusted} size={ADJ_SIZE} colored />
              <MarginLine label="Raw" from={margin?.raw} to={popularVote?.raw} size={RAW_SIZE} colored={false} />
            </div>
            {popularVote && (
              <div className="mt-2.5 text-xs tabular-nums" style={{ color: FAINT }}>
                {electionYear}: <span style={{ color: DEM }}>D {fmtVotes(popularVote.dem)}</span> · <span style={{ color: REP }}>R {fmtVotes(popularVote.rep)}</span> · {fmtVotes(popularVote.votes)} votes
              </div>
            )}
          </div>
        )}
      </section>

      <div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 sm:grid-cols-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          {stat(
            `Up in ${electionYear}`,
            upcoming ? (upcoming.wholeChamber ? `All ${upcoming.seatsUp}` : `${upcoming.seatsUp} of ${upcoming.totalSeats ?? total}`) : "None",
            upcoming ? (upcoming.wholeChamber ? "whole chamber" : upcoming.parity ? `${upcoming.parity}-numbered districts` : frequency) : frequency,
          )}
          {stat("Contested", fieldStats ? `${fieldStats.contested} of ${fieldStats.districts}` : "—", fieldStats ? `${fieldStats.districts - fieldStats.contested} one-party · ${fieldStats.open} open` : null)}
          {stat("Map first used", mapInfo?.firstCycle ?? "—", mapInfo?.source ?? currentEra?.source ?? null)}
        </div>
        {notes.length > 0 && (
          <div className="mt-2 text-xs leading-relaxed" style={{ color: FAINT }}>
            {notes.join(" · ")} · <Link prefetch={false} href="/methodology/state-leg#popular-vote" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">How the adjustment works</Link>
          </div>
        )}
      </div>
    </div>
  );
}
