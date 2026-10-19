import Link from "next/link";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { WAR_BAD, WAR_GOOD } from "@/components/tpl/format";

// One race on a candidate page (/candidates/[slug]), federal or state legislative, in a single
// layout: the race title (linked to its result page), a line per candidate with votes and share,
// the two-party bar with the margin, then whatever the caller adds below (the WAR line).

export const PARTY_COLOR: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", O: "var(--party-ind)", I: "var(--party-ind)" };
export const PARTY_SUBTLE: Record<string, string> = { D: "var(--party-dem-subtle)", R: "var(--party-rep-subtle)", O: "var(--party-ind-subtle)", I: "var(--party-ind-subtle)" };

export type Contestant = {
  name: string;
  party: string;
  /** Short party letter or label shown after the name ("R", "Libertarian"). */
  partyTag: string;
  votes?: number | null;
  /** Share of the vote, 0–100. */
  pct?: number | null;
  /** Shown in the share column when there is no share (a 2026 win chance). */
  extra?: string;
  href?: string;
  self?: boolean;
  incumbent?: boolean;
  won?: boolean | null;
  /** Muted text after the party tag ("365 EV", "write-in"). */
  note?: string;
};

export function IncPill({ party }: { party: string }) {
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: PARTY_SUBTLE[party], color: PARTY_COLOR[party] }}>Inc.</span>;
}

/** One line per candidate: name in the party color (others link to their pages), votes, share. */
export function ContestantLines({ rows }: { rows: Contestant[] }) {
  return (
    <div className="grid items-baseline gap-x-4 gap-y-0.5" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
      {rows.map((c, i) => (
        <div key={`${c.name}-${i}`} className="contents">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {c.href && !c.self ? (
              <Link prefetch={false} href={c.href} className="truncate font-semibold hover:underline" style={{ color: PARTY_COLOR[c.party] ?? "var(--party-ind)" }}>{c.name}</Link>
            ) : (
              <span className="truncate font-bold" style={{ color: PARTY_COLOR[c.party] ?? "var(--party-ind)" }}>{c.name}</span>
            )}
            <span className="shrink-0 text-xs" style={{ color: "var(--app-text-very-muted)" }}>({c.partyTag}){c.note ? ` · ${c.note}` : ""}</span>
            {c.incumbent && <IncPill party={c.party} />}
          </div>
          <span className="text-right text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {c.votes != null ? c.votes.toLocaleString() : ""}
          </span>
          <span className={`text-right text-sm tabular-nums ${c.won ? "font-bold" : "font-semibold"}`} style={{ color: PARTY_COLOR[c.party] ?? "var(--app-text-muted)", minWidth: "3.5rem" }}>
            {c.pct != null ? `${c.pct.toFixed(1)}%` : c.extra ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The two-party bar, Democrats from the left, with the R-positive margin beside it. */
export function MarginBar({ demShare, margin, label }: { demShare: number | null; margin: number | null; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-tab-bg)" }}>
        {demShare != null && <>
          <div className="float-left h-full" style={{ width: `${demShare}%`, background: "var(--party-dem)" }} />
          <div className="float-left h-full" style={{ width: `${100 - demShare}%`, background: "var(--party-rep)" }} />
        </>}
      </div>
      <span className="shrink-0 text-right text-sm font-extrabold tabular-nums" style={{ color: marginColor(margin), minWidth: "3.5rem" }}>
        {label ?? fmtMargin(margin)}
      </span>
    </div>
  );
}

export function OutcomePill({ won }: { won: boolean | null }) {
  if (won == null) return null;
  const c = won ? WAR_GOOD : WAR_BAD;
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
      {won ? "Won" : "Lost"}
    </span>
  );
}

export function CandidateRaceRow({
  year, title, href, badges, won, contestants, demShare, margin, marginLabel, children,
}: {
  year: number;
  title: string;
  href: string;
  badges?: React.ReactNode;
  won: boolean | null;
  contestants: Contestant[];
  demShare: number | null;
  margin: number | null;
  marginLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{year}</span>
          <Link prefetch={false} href={href} className="truncate text-sm font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
            {title} <span aria-hidden>&rsaquo;</span>
          </Link>
          {badges}
        </div>
        <OutcomePill won={won} />
      </div>
      <ContestantLines rows={contestants} />
      <div className="mt-2"><MarginBar demShare={demShare} margin={margin} label={marginLabel} /></div>
      {children}
    </div>
  );
}
