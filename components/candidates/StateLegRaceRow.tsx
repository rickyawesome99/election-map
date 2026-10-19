import Link from "next/link";
import type { StateLegRace } from "@/lib/stateLegCandidateIndex";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";

// The 2026 state legislative contest on a candidate page (/candidates/[slug]); past generals use
// the shared CandidateRaceRow. Every opponent is linked to their page.

const PARTY_COLOR: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", O: "var(--party-ind)", I: "var(--party-ind)" };
const PARTY_SUBTLE: Record<string, string> = { D: "var(--party-dem-subtle)", R: "var(--party-rep-subtle)", O: "var(--party-ind-subtle)", I: "var(--party-ind-subtle)" };

export const fmtLegMargin = (v: number | null | undefined) => (v == null ? "—" : Math.abs(v) < 0.05 ? "Even" : `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`);

export function partyWord(party: string, label?: string): string {
  if (label) return label.replace(/ Party$/, "");
  return party === "D" ? "Democrat" : party === "R" ? "Republican" : "Other";
}

function Pill({ children, party }: { children: React.ReactNode; party: string }) {
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: PARTY_SUBTLE[party], color: PARTY_COLOR[party] }}>{children}</span>;
}

function RaceTitle({ race }: { race: StateLegRace }) {
  return (
    <Link href={race.href} className="text-sm font-semibold hover:underline truncate" style={{ color: "var(--app-text-muted)" }}>
      {race.stateName} {race.chamberLabel} &middot; {race.districtShort}{race.post && race.post !== "Special" ? ` (${race.post})` : ""}
    </Link>
  );
}

function Opponents({ race }: { race: StateLegRace }) {
  if (race.others.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
      <span style={{ color: "var(--app-text-very-muted)" }}>{race.isCurrent ? "Also on the ballot" : "Against"}</span>
      {race.others.map((o, i) => (
        <span key={`${o.name}-${i}`} className="whitespace-nowrap">
          <Link href={`/candidates/${o.slug}`} className="hover:underline font-semibold" style={{ color: PARTY_COLOR[o.party] }}>{o.name}</Link>
          <span> ({o.partyLabel ? o.partyLabel.replace(/ Party$/, "") : o.party}{o.incumbent ? ", inc." : ""}{o.writeIn ? ", write-in" : ""})</span>
          {o.votes != null && <span className="tabular-nums"> {o.votes.toLocaleString()}</span>}
          {o.winner && !race.isCurrent && <span style={{ color: "var(--app-text-very-muted)" }}> won</span>}
        </span>
      ))}
    </div>
  );
}

export type RaceMoney = { contributions: number | null; opponents: number | null; dataThrough: string | null; source: string } | null;

const fmtMoney = (v: number | null) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k` : `$${v.toFixed(0)}`);

function MoneyLine({ money }: { money: RaceMoney }) {
  if (!money || money.contributions == null) return null;
  return (
    <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
      Raised <b style={{ color: "var(--app-text-primary)" }}>{fmtMoney(money.contributions)}</b>
      {money.opponents != null && <> · opponents {fmtMoney(money.opponents)}</>}
      {money.dataThrough && <span style={{ color: "var(--app-text-very-muted)" }}> · through {money.dataThrough}</span>}
    </div>
  );
}

export type LegProjection = {
  margin: number | null; rating: string | null; pD: number | null; contest: string;
  /** The modeled independent-vs-party race, and whether this candidate is the independent. */
  indep?: { isMe: boolean; name: string; opp: "D" | "R"; advantage: number; pI: number; sameElectorate: boolean } | null;
  pI?: number | null;
  /** Seats the field decides for each party, and each party's nominee count: a party with as many decided seats as nominees is in. */
  guaranteed?: { dem: number; rep: number };
  nominees?: { dem: number; rep: number };
} | null;

export function StateLegCurrentRow({ race, projection, money = null, last }: { race: StateLegRace; projection: LegProjection; money?: RaceMoney; last: boolean }) {
  const accent = PARTY_COLOR[race.party];
  const decided = race.canceledGeneral ? "General election canceled: elected as the sole filer" : projection?.contest === "uncontested-D" ? "No Republican on the ballot" : projection?.contest === "uncontested-R" ? "No Democrat on the ballot"
    : projection?.contest === "other" && projection.pI === 1 ? "No major party on the ballot"
    : (projection?.contest === "contested" || projection?.contest === "split") && projection.guaranteed && projection.nominees && (race.party === "D" || race.party === "R")
      && projection.guaranteed[race.party === "D" ? "dem" : "rep"] >= projection.nominees[race.party === "D" ? "dem" : "rep"] && projection.guaranteed[race.party === "D" ? "dem" : "rep"] > 0
      ? "Seat decided by the field: the other party fields too few nominees" : null;
  const guaranteedMine = decided?.startsWith("Seat decided by the field") ?? false;
  const ind = projection?.contest === "independent" ? projection.indep ?? null : null;
  // This candidate's side of an independent's race: the independent, or the nominee they face.
  const indSide = ind && (ind.isMe || (race.party === ind.opp && !ind.sameElectorate)) ? { mine: ind.isMe ? ind.pI : 1 - ind.pI, adv: ind.isMe ? ind.advantage : -ind.advantage } : null;
  const rating = projection?.rating ? getRatingColors(projection.rating) : null;
  return (
    <div className="py-5" style={{ borderBottom: last ? "none" : "1px solid var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <RaceTitle race={race} />
            {race.incumbent && <Pill party={race.party}>Inc.</Pill>}
            {race.writeIn && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>Write-in</span>}
            {race.special && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>Special election</span>}
            {race.seats != null && race.seats > 1 && !race.special && <span className="text-[10px] shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{race.seats} seats</span>}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Running as {partyWord(race.party, race.partyLabel)}{decided ? ` · ${decided}` : ""}</div>
          <Opponents race={race} />
          <MoneyLine money={money} />
        </div>
        {projection && projection.contest === "contested" && projection.margin != null && !guaranteedMine && (
          <div className="text-right shrink-0">
            <div className="tabular-nums font-extrabold" style={{ fontSize: "1.4rem", lineHeight: 1, color: getRaceColor(projection.margin) }}>{fmtLegMargin(projection.margin)}</div>
            {rating && projection.rating && (
              <div className="mt-1.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: rating.bg, color: rating.text }}>{projection.rating}</span></div>
            )}
            {projection.pD != null && (
              <div className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                P({race.party === "R" ? "R" : "D"}) {Math.round((race.party === "R" ? 1 - projection.pD : projection.pD) * 100)}%
              </div>
            )}
          </div>
        )}
        {ind && indSide && (
          <div className="text-right shrink-0">
            <div className="tabular-nums font-extrabold" style={{ fontSize: "1.4rem", lineHeight: 1, color: indSide.adv > 0 ? accent : "var(--app-text-muted)" }}>
              {Math.abs(indSide.adv) < 0.05 ? "Even" : `${indSide.adv > 0 ? "+" : "−"}${Math.abs(indSide.adv).toFixed(1)}`}
            </div>
            <div className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>P(win) {Math.round(indSide.mine * 100)}% · vs {ind.isMe ? ind.opp : ind.name}</div>
          </div>
        )}
        {decided && (race.canceledGeneral || projection?.contest === `uncontested-${race.party}` || (projection?.contest === "other" && race.party === "O") || guaranteedMine) && (
          <div className="text-right shrink-0">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: PARTY_SUBTLE[race.party], color: accent }}>Decided</span>
          </div>
        )}
      </div>
    </div>
  );
}
