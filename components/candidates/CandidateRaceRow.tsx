import Link from "next/link";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { WAR_BAD, WAR_GOOD } from "@/components/tpl/format";

// One race on a candidate page (/candidates/[slug]), federal or state legislative, in a single
// layout shared with the site's result rows: see CandidateRaceRow below.

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

/** The two-party bar, Democrats from the left; the halves meet in the middle as the row comes into view. */
export function SplitBar({ demShare }: { demShare: number | null }) {
  if (demShare == null) return <span className="my-[2px] block h-[2px]" style={{ background: "repeating-linear-gradient(90deg, var(--app-border) 0 6px, transparent 6px 10px)" }} />;
  const d = Math.max(0, Math.min(100, demShare));
  return (
    <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
      <i className="vh-bar-d block h-full" style={{ width: `${d}%`, background: "var(--party-dem)" }} />
      <i className="vh-bar-r block h-full" style={{ width: `${100 - d}%`, background: "var(--party-rep)" }} />
    </div>
  );
}

export function OutcomePill({ won }: { won: boolean | null }) {
  if (won == null) return null;
  const c = won ? WAR_GOOD : WAR_BAD;
  return (
    <span className="text-[13px] font-bold px-3 py-1 rounded-full whitespace-nowrap shrink-0" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
      {won ? "Won" : "Lost"}
    </span>
  );
}

const FIG = { fontFamily: "var(--font-serif)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 } as const;

/** A small labelled figure under a race: "EXPECTED D+39.7". */
export function RaceMetric({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div title={title} className="grid gap-1">
      <dt className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>{label}</dt>
      <dd className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>{children}</dd>
    </div>
  );
}

/**
 * One race, in the layout of the site's result rows (components/ResultRowKit.tsx): the year in the
 * serif with the race beneath it on the left, the candidates over the split bar in the middle, the
 * margin in the serif on the right with the outcome under it. `children` (the model's figures for
 * the race) sit under the bar. Phones put the year and the margin on one line and the rest below.
 */
export function CandidateRaceRow({
  year, title, href, badges, won, status, contestants, demShare, margin, marginLabel, marginCaption, children, expandable = false,
}: {
  year: number;
  title: string;
  href: string;
  badges?: React.ReactNode;
  won?: boolean | null;
  /** Shown under the margin in place of Won/Lost (a 2026 race's rating). */
  status?: React.ReactNode;
  contestants: Contestant[];
  demShare: number | null;
  margin: number | null;
  marginLabel?: string;
  /** Small caption under the margin ("forecast"). */
  marginCaption?: string;
  children?: React.ReactNode;
  /** The row opens something (it sits inside ExpandableRace): draw the chevron under the outcome. */
  expandable?: boolean;
}) {
  return (
    <div className="vh-tint vh-hover grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-3 py-5 sm:grid-cols-[9.5rem_minmax(0,1fr)_6.5rem] sm:gap-x-10">
      <div className="col-start-1 row-start-1 grid min-w-0 gap-1.5">
        <span className="tabular-nums" style={{ ...FIG, fontSize: "1.4rem", color: "var(--app-text-primary)" }}>{year}</span>
        <Link prefetch={false} href={href} className="text-[10.5px] font-bold uppercase leading-snug tracking-wider hover:underline" style={{ color: "var(--app-text-muted)" }}>
          {title} <span aria-hidden>&rsaquo;</span>
        </Link>
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      </div>
      <div className="col-start-2 row-start-1 grid justify-items-end gap-1.5 text-right sm:col-start-3">
        <span className="vh-margin inline-block whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: "1.3rem", color: marginColor(margin) }}>{marginLabel ?? fmtMargin(margin)}</span>
        {marginCaption && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{marginCaption}</span>}
        {status ?? <OutcomePill won={won ?? null} />}
        {expandable && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="mr-1 mt-1 transition-transform duration-200 group-data-[open=true]:rotate-180" style={{ color: "var(--app-text-very-muted)" }}>
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <ContestantLines rows={contestants} />
        <div className="mt-2.5"><SplitBar demShare={demShare} /></div>
        {children}
      </div>
    </div>
  );
}
