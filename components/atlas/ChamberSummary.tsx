import Link from "next/link";
import type { ChamberSummaryData } from "@/lib/stateLegChamberSummary";
import { CHAMBER_OUTCOMES, chamberOutcome, OUTCOME_LABEL, outcomeColor, type ChamberOutcome } from "@/lib/chamberOutcome";

export const fmtChamberMargin = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const marginColor = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : m > 0 ? "var(--party-rep)" : "var(--party-dem)");
export const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
const fmtVotes = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString("en-US"));

/** Horizontal seat bar: D from the left, R from the right, other/vacant between; notch at the majority line. */
export function SeatBar({ dem, rep, total }: { dem: number; rep: number; total: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  return (
    <div className="relative mt-1.5 h-[7px] sm:mt-2 sm:h-2 overflow-hidden rounded-[2px]" style={{ background: "var(--party-ind-subtle)" }}>
      <div className="absolute inset-y-0 left-0" style={{ width: pct(dem), background: "var(--party-dem)" }} />
      <div className="absolute inset-y-0 right-0" style={{ width: pct(rep), background: "var(--party-rep)" }} />
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

export function SeatLine({ dem, rep, oth, net, size = "text-[1.35rem] sm:text-[1.65rem]" }: { dem: React.ReactNode; rep: React.ReactNode; oth?: number; net?: { party: "D" | "R"; seats: number } | null; size?: string }) {
  return (
    <div className={`${size} font-extrabold tabular-nums leading-none`}>
      <span style={{ color: "var(--party-dem)" }}>D {dem}</span>
      <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
      <span style={{ color: "var(--party-rep)" }}>R {rep}</span>
      {oth ? <><span style={{ color: "var(--app-text-very-muted)" }}> · </span><span style={{ color: "var(--party-ind)" }}>I {oth}</span></> : null}
      {net ? <><span style={{ color: "var(--app-text-very-muted)" }}> · </span><span style={{ color: net.party === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>Net +{net.seats} {net.party}</span></> : null}
    </div>
  );
}

function StatusTag({ o }: { o: ChamberOutcome }) {
  return <span className="normal-case tracking-normal font-semibold" style={{ color: outcomeColor(o) ?? "var(--app-text-muted)" }}>{OUTCOME_LABEL[o]}</span>;
}

/** The chance of each majority status after the election, D side to R side; "No majority" only where it can happen. */
function OutcomeOdds({ outcomes, supermajority }: { outcomes: Record<ChamberOutcome, number>; supermajority: number | null }) {
  const shown = CHAMBER_OUTCOMES.filter((x) => (x !== "none" || outcomes.none > 0) && (supermajority != null || (x !== "dSuper" && x !== "rSuper")));
  return (
    <div className="mt-2.5 grid gap-x-3 gap-y-1 text-xs tabular-nums" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((x) => (
        <div key={x} className="min-w-0">
          <div className="truncate text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{OUTCOME_LABEL[x].replace("Supermajority", "Super.")}</div>
          <div className="font-bold" style={{ color: outcomes[x] >= 0.005 ? outcomeColor(x) ?? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{fmtProb(outcomes[x])}</div>
        </div>
      ))}
    </div>
  );
}

/** The chamber's headline numbers: seats now, the 2026 projection, the corrected chamber margin, the projected popular vote, then the facts row. */
export default function ChamberSummary({ s, electionYear }: { s: ChamberSummaryData; electionYear: number }) {
  const { seats, totalSeats, projection, margin, popularVote, upcoming, fieldStats, mapInfo, calendar, currentEra } = s;
  const heading = (label: React.ReactNode) => (
    <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold pb-1.5 mb-2.5" style={{ color: "var(--app-text-very-muted)", borderBottom: "1px solid var(--app-border)" }}>{label}</div>
  );
  const barTotal = totalSeats ?? seats?.total ?? null;
  const projTotal = projection?.totalSeats ?? barTotal;
  const majority = projection?.majority ?? (barTotal ? Math.floor(barTotal / 2) + 1 : null);
  const supermajority = projection?.supermajority ?? mapInfo?.supermajoritySeats ?? null;
  const nowStatus = seats && majority != null ? chamberOutcome(seats.dem, seats.rep, majority, supermajority) : null;
  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-w-0">
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums leading-tight" style={{ color: "var(--app-text-primary)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {seats && (
          <section>
            {heading(<span className="flex items-baseline justify-between gap-2">Current{nowStatus && <StatusTag o={nowStatus} />}</span>)}
            <SeatLine dem={seats.dem} rep={seats.rep} oth={seats.oth} />
            {barTotal && <SeatBar dem={seats.dem} rep={seats.rep} total={Math.max(barTotal, seats.total)} />}
            <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              {"asOf" in seats ? `as of ${new Date(`${seats.asOf}-15`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : `after the ${seats.year} election`}{barTotal && barTotal > seats.total ? ` · ${barTotal - seats.total} vacant` : ""}{projection?.majority ? ` · ${projection.majority} for a majority` : ""}
            </div>
          </section>
        )}
        {projection && projTotal && (
          <section>
            {heading(<span className="flex items-baseline justify-between gap-2">{`${electionYear} projection`}{majority != null && <StatusTag o={chamberOutcome(projection.favored.dem, projection.favored.rep, majority, supermajority)} />}</span>)}
            {/* Each seat's projected winner, summed: the count the chamber map shows. The range and the
                control odds below come from the simulation. */}
            <SeatLine dem={projection.favored.dem} rep={projection.favored.rep} oth={projection.favored.oth} net={seats ? netSeats(projection.favored, seats) : null} />
            <SeatBar dem={projection.favored.dem} rep={projection.favored.rep} total={projTotal} />
            <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              {projection.pDemControl == null ? `${projection.unprojected} seats unprojected` : (
                <>80% range D {projection.lo80}–{projection.hi80} · <span style={{ color: "var(--app-text-muted)" }}>P(D control) {fmtProb(projection.pDemControl)}</span></>
              )}
            </div>
            {projection.outcomes && <OutcomeOdds outcomes={projection.outcomes} supermajority={supermajority} />}
          </section>
        )}
        {margin && (
          <section>
            {heading(`Chamber margin · ${margin.year}`)}
            <div className="text-[1.35rem] sm:text-[1.65rem] font-extrabold tabular-nums leading-none">
              <span className="text-sm font-semibold" style={{ color: "var(--app-text-very-muted)" }}>raw </span>
              <span style={{ color: "var(--app-text-muted)" }}>{fmtChamberMargin(margin.raw)}</span>
              {margin.corrected != null && <>
                <span style={{ color: "var(--app-text-very-muted)" }}> → </span>
                <span style={{ color: marginColor(margin.corrected) }}>{fmtChamberMargin(margin.corrected)}</span>
              </>}
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Corrected fills {margin.imputed} uncontested seat{margin.imputed === 1 ? "" : "s"} with the presidential vote ·{" "}
              <Link href="/methodology/state-tpl" className="underline underline-offset-2 hover:opacity-80">Methodology</Link>
            </div>
          </section>
        )}
        {popularVote && (
          <section>
            {heading(`${electionYear} projected vote`)}
            <div className="text-[1.35rem] sm:text-[1.65rem] font-extrabold tabular-nums leading-none">
              <span className="text-sm font-semibold" style={{ color: "var(--app-text-very-muted)" }}>raw </span>
              <span style={{ color: "var(--app-text-muted)" }}>{fmtChamberMargin(popularVote.raw)}</span>
              {popularVote.adjusted != null && <>
                <span style={{ color: "var(--app-text-very-muted)" }}> → </span>
                <span style={{ color: marginColor(popularVote.adjusted) }}>{fmtChamberMargin(popularVote.adjusted)}</span>
              </>}
            </div>
            <div className="mt-2 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              <span style={{ color: "var(--party-dem)" }}>D {fmtVotes(popularVote.dem)}</span> · <span style={{ color: "var(--party-rep)" }}>R {fmtVotes(popularVote.rep)}</span> · {fmtVotes(popularVote.votes)} votes
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              {popularVote.imputed > 0
                ? <>Adjusted imputes {popularVote.imputed} seat{popularVote.imputed === 1 ? "" : "s"} without both parties as contested</>
                : <>Every seat has both parties on the ballot</>}
              {popularVote.uncounted > 0 && <> · {popularVote.uncounted} unopposed seat{popularVote.uncounted === 1 ? "" : "s"} with no count in the raw</>}
              {popularVote.multiVote && <> · multi-member districts: voters cast more than one vote</>}
              {" · "}<Link href="/methodology/state-leg#popular-vote" className="underline underline-offset-2 hover:opacity-80">Methodology</Link>
            </div>
          </section>
        )}
      </div>

      <div className="mt-6 pt-3 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3" style={{ borderTop: "1px solid var(--app-border)" }}>
        {stat("Seats", totalSeats ?? "—", mapInfo?.electionFrequency ?? (calendar?.frequency ?? undefined))}
        {stat(
          `Up in ${electionYear}`,
          upcoming ? `${upcoming.seatsUp}${upcoming.totalSeats ? ` of ${upcoming.totalSeats}` : ""}` : "none",
          upcoming ? (upcoming.wholeChamber ? "whole chamber" : upcoming.parity ? `${upcoming.parity}-numbered districts` : `${upcoming.districtsUp} of ${upcoming.totalDistricts} districts`) : "sitting this cycle out",
        )}
        {fieldStats && stat(`${electionYear} field`, `${fieldStats.contested} of ${fieldStats.districts} contested`, `${fieldStats.districts - fieldStats.contested} without both parties · ${fieldStats.open} open seats`)}
        {stat("Current map", currentEra?.enactedDate ? `enacted ${currentEra.enactedDate}` : mapInfo?.firstCycle ? `first used ${mapInfo.firstCycle}` : "—", mapInfo?.source ?? currentEra?.source)}
      </div>
    </div>
  );
}
