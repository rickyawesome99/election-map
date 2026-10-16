import Link from "next/link";
import type { ChamberSummaryData } from "@/lib/stateLegChamberSummary";

export const fmtChamberMargin = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const marginColor = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : m > 0 ? "var(--party-rep)" : "var(--party-dem)");
export const fmtProb = (p: number | null) => (p == null ? "—" : p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
const fmtVotes = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString("en-US"));

/** Horizontal seat bar: D from the left, R from the right, other/vacant between; notch at the majority line. */
export function SeatBar({ dem, rep, total }: { dem: number; rep: number; total: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  return (
    <div className="mt-2.5 relative h-3.5 rounded-[3px] overflow-hidden" style={{ background: "var(--party-ind-subtle)" }}>
      <div className="absolute inset-y-0 left-0" style={{ width: pct(dem), background: "var(--party-dem)" }} />
      <div className="absolute inset-y-0 right-0" style={{ width: pct(rep), background: "var(--party-rep)" }} />
      <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2" style={{ background: "var(--app-bg)" }} />
    </div>
  );
}

export function SeatLine({ dem, rep, oth, size = "text-2xl" }: { dem: React.ReactNode; rep: React.ReactNode; oth?: number; size?: string }) {
  return (
    <div className={`${size} font-bold tabular-nums leading-tight`}>
      <span style={{ color: "var(--party-dem)" }}>D {dem}</span>
      <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
      <span style={{ color: "var(--party-rep)" }}>R {rep}</span>
      {oth ? <><span style={{ color: "var(--app-text-very-muted)" }}> · </span><span style={{ color: "var(--party-ind)" }}>I {oth}</span></> : null}
    </div>
  );
}

/** The chamber's headline numbers: seats now, the 2026 projection, the corrected chamber margin, the projected popular vote, then the facts row. */
export default function ChamberSummary({ s, electionYear }: { s: ChamberSummaryData; electionYear: number }) {
  const { seats, totalSeats, projection, margin, popularVote, upcoming, fieldStats, mapInfo, calendar, currentEra } = s;
  const heading = (label: React.ReactNode) => (
    <div className="text-[10px] uppercase tracking-wider font-semibold pb-1.5 mb-2" style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{label}</div>
  );
  const barTotal = totalSeats ?? seats?.total ?? null;
  const projTotal = projection?.totalSeats ?? barTotal;
  const superParty = projection?.supermajority != null && (projection.pDemSuper ?? 0) + (projection.pRepSuper ?? 0) > 0.005
    ? ((projection.pDemSuper ?? 0) >= (projection.pRepSuper ?? 0) ? "D" : "R") : null;
  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-w-[120px]">
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--app-text-primary)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className={`grid gap-x-10 gap-y-6 md:grid-cols-2 ${popularVote ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {seats && (
          <section>
            {heading("Current")}
            <SeatLine dem={seats.dem} rep={seats.rep} oth={seats.oth} />
            {barTotal && <SeatBar dem={seats.dem} rep={seats.rep} total={Math.max(barTotal, seats.total)} />}
            <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              after the {seats.year} election{barTotal && barTotal > seats.total ? ` · ${barTotal - seats.total} vacant` : ""}{projection?.majority ? ` · ${projection.majority} for a majority` : ""}
            </div>
          </section>
        )}
        {projection && projTotal && (
          <section>
            {heading(`${electionYear} projection`)}
            {/* Each seat's projected winner, summed: the count the chamber map shows. The range and the
                control odds below come from the simulation. */}
            <SeatLine dem={projection.favored.dem} rep={projection.favored.rep} oth={projection.favored.oth} />
            <SeatBar dem={projection.favored.dem} rep={projection.favored.rep} total={projTotal} />
            <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              {projection.pDemControl == null ? `${projection.unprojected} seats unprojected` : (
                <>80% range D {projection.lo80}–{projection.hi80} · <span style={{ color: "var(--app-text-muted)" }}>P(D control) {fmtProb(projection.pDemControl)}</span>
                  {superParty && <> · P({superParty} supermajority) {fmtProb(superParty === "D" ? projection.pDemSuper : projection.pRepSuper)}</>}</>
              )}
            </div>
          </section>
        )}
        {margin && (
          <section>
            {heading(`Chamber margin · ${margin.year}`)}
            <div className="text-2xl font-bold tabular-nums leading-tight">
              <span className="text-base font-semibold" style={{ color: "var(--app-text-very-muted)" }}>raw </span>
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
            {heading(`${electionYear} popular vote`)}
            <div className="text-2xl font-bold tabular-nums leading-tight">
              <span className="text-base font-semibold" style={{ color: "var(--app-text-very-muted)" }}>raw </span>
              <span style={{ color: "var(--app-text-muted)" }}>{fmtChamberMargin(popularVote.raw)}</span>
              {popularVote.adjusted != null && <>
                <span style={{ color: "var(--app-text-very-muted)" }}> → </span>
                <span style={{ color: marginColor(popularVote.adjusted) }}>{fmtChamberMargin(popularVote.adjusted)}</span>
              </>}
            </div>
            <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
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

      <div className="mt-6 pt-3 flex flex-wrap gap-x-8 gap-y-3" style={{ borderTop: "1px solid var(--app-border)" }}>
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
