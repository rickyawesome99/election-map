import Link from "next/link";
import type { StateLegRace } from "@/lib/stateLegCandidateIndex";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";

// The state legislative rows of a candidate page (/candidates/[slug]): one past general, or the
// 2026 contest. Same visual language as the federal rows beside them, with the district's
// two-party bar, the candidate's own vote and share, and every opponent linked to their page.

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
      {race.stateName} {race.chamberLabel} &middot; {race.districtShort}{race.post ? ` (${race.post})` : ""}
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

export function StateLegPastRow({ race, money = null, last }: { race: StateLegRace; money?: RaceMoney; last: boolean }) {
  const accent = PARTY_COLOR[race.party];
  const total = (race.demVotes ?? 0) + (race.repVotes ?? 0);
  const dWidth = total > 0 ? ((race.demVotes ?? 0) / total) * 100 : 50;
  const demPct = race.totalVotes && race.demVotes != null ? (race.demVotes / race.totalVotes) * 100 : null;
  const repPct = race.totalVotes && race.repVotes != null ? (race.repVotes / race.totalVotes) * 100 : null;
  const outcome = race.winner == null ? null : race.winner ? "Won" : "Lost";
  return (
    <div className="py-5" style={{ borderBottom: last ? "none" : "1px solid var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4 mb-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>{race.year}</span>
          <RaceTitle race={race} />
          {race.incumbent && <Pill party={race.party}>Inc.</Pill>}
          {race.uncontested && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>Unopposed</span>}
          {race.era !== "current" && <span className="text-[10px] shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{race.eraLabel}</span>}
        </div>
        {outcome && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0" style={{ background: race.winner ? PARTY_SUBTLE[race.party] : "var(--app-tab-bg)", color: race.winner ? accent : "var(--app-text-muted)" }}>
            {outcome}
          </span>
        )}
      </div>
      {race.noCount ? (
        <div className="text-xs italic" style={{ color: "var(--app-text-muted)" }}>Declared elected without a vote: the state printed no count for this race.</div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[120px] h-2 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }}>
            <div className="h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c" }} />
            <div className="h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
          </div>
          {demPct != null && <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-dem)" }}>D {demPct.toFixed(1)}%</span>}
          {repPct != null && <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--party-rep)" }}>R {repPct.toFixed(1)}%</span>}
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: race.margin == null ? "var(--app-text-very-muted)" : getRaceColor(race.margin) }}>{fmtLegMargin(race.margin)}</span>
          {race.votes != null && (
            <span className="text-xs tabular-nums shrink-0" style={{ color: accent }}>
              {race.votes.toLocaleString()} votes{race.share != null ? ` · ${race.share.toFixed(1)}%` : ""}
            </span>
          )}
        </div>
      )}
      <Opponents race={race} />
      <MoneyLine money={money} />
    </div>
  );
}

export type LegProjection = { margin: number | null; rating: string | null; pD: number | null; contest: string } | null;

export function StateLegCurrentRow({ race, projection, money = null, last }: { race: StateLegRace; projection: LegProjection; money?: RaceMoney; last: boolean }) {
  const accent = PARTY_COLOR[race.party];
  const decided = race.canceledGeneral ? "General election canceled: elected as the sole filer" : projection?.contest === "uncontested-D" ? "No Republican on the ballot" : projection?.contest === "uncontested-R" ? "No Democrat on the ballot" : null;
  const rating = projection?.rating ? getRatingColors(projection.rating) : null;
  return (
    <div className="py-5" style={{ borderBottom: last ? "none" : "1px solid var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <RaceTitle race={race} />
            {race.incumbent && <Pill party={race.party}>Inc.</Pill>}
            {race.writeIn && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>Write-in</span>}
            {race.seats != null && race.seats > 1 && <span className="text-[10px] shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{race.seats} seats</span>}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Running as {partyWord(race.party, race.partyLabel)}{decided ? ` · ${decided}` : ""}</div>
          <Opponents race={race} />
          <MoneyLine money={money} />
        </div>
        {projection && projection.contest === "contested" && projection.margin != null && (
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
        {decided && (race.canceledGeneral || projection?.contest === `uncontested-${race.party}`) && (
          <div className="text-right shrink-0">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: PARTY_SUBTLE[race.party], color: accent }}>Decided</span>
          </div>
        )}
      </div>
    </div>
  );
}
