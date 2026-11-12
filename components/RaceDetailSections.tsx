import Link from "next/link";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
export { LedgerSectionHead };
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import CandidateLink from "@/components/CandidateLink";
import DemographicsStrip from "@/components/DemographicsStrip";
import { stateDemographics } from "@/data/demographics";
import { FORECAST_CONSTANTS } from "@/data/tplModelData";
import { WinProbabilityLabel } from "@/components/WinProbabilityLabel";
import { InfoTooltip } from "@/components/InfoTooltip";
import ExpandableTbody from "@/components/ExpandableTbody";
import type { RaceFinanceDetail } from "@/data/fundraisingData";
import { formatProjectedMargin, projectedMarginColor, leanColor } from "@/lib/colorScale";
import { getNationalEnvironment, nationalSigmaFor, incumbentAdvantage, type RacePolling, type RaceMoneyTerm } from "@/lib/tplCompute";

type PollRow = {
  label: string;
  dem?: number;
  rep?: number;
  type: "voteshare" | "winprob";
};

export type DetailPastResult = {
  year: number;
  demPct: number;
  repPct: number;
  demCandidate?: string;
  repCandidate?: string;
  demParty?: "D" | "R" | "I";
  repParty?: "D" | "R" | "I";
  demVotes?: number;
  repVotes?: number;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
  electionType?: string;
  electionHref?: string;
  nationalDiff?: number | null;
  swing?: number | null;
  note?: string;
  districtLabel?: string;
  placeholder?: boolean;
};

type DetailInfoItem = {
  label: string;
  value: string;
  // Optional link (e.g. the incumbent's candidate page) and text color (e.g. the party's).
  href?: string | null;
  color?: string;
};

function DetailInfoValue({ value, href, color }: DetailInfoItem) {
  return href
    ? <Link prefetch={false} href={href} className="hover:underline underline-offset-2" style={{ color: color ?? "var(--app-text-primary)" }}>{value}</Link>
    : <span style={{ color: color ?? "var(--app-text-primary)" }}>{value}</span>;
}

/** An "Incumbent" fact: "Kevin Hern (R)", in the party's color, linked to their page when there is one. */
export function incumbentFact(name: string | null | undefined, party: string | null | undefined, href?: string | null): DetailInfoItem {
  if (!name) return { label: "Incumbent", value: "Vacant" };
  const color = party === "D" ? "var(--party-dem)" : party === "R" ? "var(--party-rep)" : party ? "var(--party-ind)" : undefined;
  return { label: "Incumbent", value: party ? `${name} (${party})` : name, href, color };
}

// Label-over-value facts: the same figure style as the Projected Result's
// footer blocks. Used by the About sections and their Demographics subsection.
export function LedgerFacts({ items, className }: { items: DetailInfoItem[]; className?: string }) {
  return (
    // Each fact as wide as its value (a long incumbent name stays on one line), wrapping only at the row's end.
    <dl className={`flex flex-wrap gap-x-6 gap-y-3 ${className ?? ""}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-[10.5rem]">
          <dt className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{item.label}</dt>
          <dd className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", fontWeight: 700 }}><DetailInfoValue {...item} /></dd>
        </div>
      ))}
    </dl>
  );
}

// A subsection inside a ledger section: a small label on a thin rule, with an optional note at right.
export function LedgerSubhead({ label, meta, rule = true, top = "mt-7" }: { label: string; meta?: ReactNode; rule?: boolean; /** Space above, as a margin class. */ top?: string }) {
  return (
    <div className={`${top} flex flex-wrap items-baseline gap-x-3 gap-y-0.5 ${rule ? "mb-3 pb-2" : "mb-1.5"}`} style={rule ? { borderBottom: "1px solid var(--app-border)" } : undefined}>
      <h3 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>{label}</h3>
      {meta && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{meta}</span>}
    </div>
  );
}

// The Senate and Governor pages' Demographics subsection: the state's ACS figures, laid out like
// the House pages' district ones. State lines never move, so there is no vintage caveat.
export function StateDemographicsSubsection({ abbr }: { abbr: string }) {
  const demographics = stateDemographics[abbr.toUpperCase()];
  if (!demographics) return null;
  return (
    <>
      <LedgerSubhead rule={false} label="Demographics" meta="ACS 2020–24 5-year estimates." />
      <DemographicsStrip {...demographics} layout="grid" />
    </>
  );
}

type CandidateCardEntry = {
  name: string;
  /** The race's state: tells apart two candidates who share a name (lib/candidateSlug.ts). */
  state?: string;
  party: "D" | "R" | "I";
  incumbent?: boolean;
  photo?: string | null;
  pct: number;
  placeholder?: boolean;
  // Projected votes (lib/countyProjection.ts); shown small under the share when present.
  votes?: number;
  /** The race's called winner (the results section, headed 2026 Election): a check beside the name. */
  winner?: boolean;
  /** Shown in place of the party name, for a candidate of neither major party ("Libertarian"). */
  partyName?: string;
  /** The counted share minus the final forecast's projected share, in points: "▲2.1%" left of the share. */
  vsProjected?: number;
};

type DetailDensity = "default" | "compact";

function partyLabel(party: "D" | "R" | "I") {
  return party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
}

function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

function partySubtle(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep-subtle)";
  if (party === "I") return "var(--party-ind-subtle)";
  return "var(--party-dem-subtle)";
}

function MarginPollRow({ label, dem, rep, precision = 0, pctMargin = false }: { label: string; dem?: number; rep?: number; precision?: number; pctMargin?: boolean }) {
  const hasData = dem != null && rep != null;
  const demR = hasData ? parseFloat((dem * 100).toFixed(precision)) : null;
  const repR = hasData ? parseFloat((rep * 100).toFixed(precision)) : null;
  const total = demR !== null && repR !== null ? demR + repR : 0;
  const dWidth = total > 0 ? (demR! / total) * 100 : 50;
  const winner = hasData && demR! >= repR! ? "D" : "R";
  const marginVal = hasData ? Math.abs(demR! - repR!).toFixed(precision) : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
        {hasData ? (
          <span className="text-xs font-bold" style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>
            {pctMargin ? `${winner === "D" ? demR : repR}% ${winner}` : `${winner} +${marginVal}`}
          </span>
        ) : (
          <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
        )}
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }}>
        {hasData && (
          <>
            <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
            <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
          </>
        )}
      </div>
      {hasData && (
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px]" style={{ color: "var(--party-dem-muted)" }}>{demR}%</span>
          <span className="text-[10px]" style={{ color: "var(--party-rep-muted)" }}>{repR}%</span>
        </div>
      )}
    </div>
  );
}

function PollSummaryRow({ label, dem, rep, precision = 0, pctMargin = false }: { label: string; dem?: number; rep?: number; precision?: number; pctMargin?: boolean }) {
  const hasData = dem != null && rep != null;
  const demR = hasData ? parseFloat((dem * 100).toFixed(precision)) : null;
  const repR = hasData ? parseFloat((rep * 100).toFixed(precision)) : null;
  const winner = hasData && demR! >= repR! ? "D" : "R";
  const winnerColor = winner === "D" ? "var(--party-dem)" : "var(--party-rep)";
  const marginVal = hasData ? Math.abs(demR! - repR!).toFixed(precision) : null;
  const mainValue = hasData
    ? pctMargin
      ? `${winner === "D" ? demR : repR}% ${winner}`
      : `${winner} +${marginVal}`
    : "TBD";

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</div>
        {hasData && (
          <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold tabular-nums">
            <span style={{ color: "var(--party-dem-muted)" }}>Dem {demR}%</span>
            <span style={{ color: "var(--app-text-very-muted)" }}>/</span>
            <span style={{ color: "var(--party-rep-muted)" }}>Rep {repR}%</span>
          </div>
        )}
      </div>
      <div className="text-right text-lg font-bold tabular-nums" style={{ color: hasData ? winnerColor : "var(--app-text-very-muted)", fontStyle: hasData ? "normal" : "italic" }}>
        {mainValue}
      </div>
    </div>
  );
}

function WinProbabilitySummary({ demPct, repPct }: { demPct: number; repPct: number }) {
  const winner = demPct >= repPct ? "D" : "R";
  const winnerColor = winner === "D" ? "var(--party-dem)" : "var(--party-rep)";
  const winnerPct = winner === "D" ? demPct : repPct;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>
      <div>
        <WinProbabilityLabel />
        <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold tabular-nums">
          <span style={{ color: "var(--party-dem)" }}>Dem {demPct}%</span>
          <span style={{ color: "var(--app-text-very-muted)" }}>/</span>
          <span style={{ color: "var(--party-rep)" }}>Rep {repPct}%</span>
        </div>
      </div>
      <div className="text-right text-lg font-bold tabular-nums" style={{ color: winnerColor }}>
        {winnerPct}% {winner}
      </div>
    </div>
  );
}

// Section header for the states-page-style layout — a bold uppercase label under a thick rule,
// matching the "Federal Offices" / "U.S. House" section heads on the state page.


/** A vote share to one decimal ("44.0", not "44"), except a whole 0 or 100 (an unopposed seat). */
/** A counted share against the forecast's projection: ▲ over, ▼ under, in points. */
function VsProjected({ pts }: { pts: number }) {
  const r = Math.round(pts * 10) / 10;
  const arrow = r > 0 ? "▲" : r < 0 ? "▼" : "";
  return (
    <span className="text-sm font-semibold" style={{ opacity: 0.75 }} title={`${r > 0 ? "Over" : r < 0 ? "Under" : "Matched"} the final forecast's projected share by ${Math.abs(r).toFixed(1)} points`}>
      {arrow}{Math.abs(r).toFixed(1)}%
    </span>
  );
}

function fmtCandidatePct(pct: number): string {
  return pct === 0 || pct === 100 ? String(pct) : pct.toFixed(1);
}

export function AboutRaceCard({
  title,
  description,
  items,
  compact = false,
  bare = false,
  children,
}: {
  title: string;
  // Optional: a race whose lead paragraph has nothing to say yet renders the label/value row on
  // its own rather than a placeholder line (see the House district page, which leads with the
  // district's demographics instead).
  description?: string;
  items: DetailInfoItem[];
  compact?: boolean;
  // Renders as a plain paragraph + a row of ruled facts, no card chrome or boxed tiles —
  // the caller supplies its own section header (see LedgerSectionHead).
  bare?: boolean;
  /** Subsections under the facts (bare only), e.g. the House page's demographics. */
  children?: ReactNode;
}) {
  if (bare) {
    return (
      <div>
        {items.length > 0 && <LedgerFacts items={items} />}
        {description && (
          <p className={`text-[15px] leading-relaxed ${items.length > 0 ? "mt-4" : ""}`} style={{ color: "var(--app-text-primary)", textWrap: "pretty" }}>
            {description}
          </p>
        )}
        {children}
      </div>
    );
  }

  const gridClass =
    items.length >= 4 ? "grid-cols-2 md:grid-cols-4" :
    items.length === 3 ? "grid-cols-3" :
    "grid-cols-2";

  return (
    <section
      className="rounded-xl p-3 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
        {title}
      </h2>
      {!compact && description && (
        <p className="text-sm leading-relaxed mb-2.5" style={{ color: "var(--app-text-primary)" }}>
          {description}
        </p>
      )}
      <div className={compact ? "flex flex-col gap-1.5" : `grid gap-2 ${gridClass}`}>
        {items.map((item) => (
          <div key={item.label} className={compact ? "rounded-lg px-2.5 py-1.5 flex items-center justify-between" : "rounded-lg p-2.5 flex flex-col"} style={{ background: "var(--app-bg)" }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
              {item.label}
            </div>
            <div className={`text-xs font-semibold ${compact ? "" : "mt-auto"}`}>
              <DetailInfoValue {...item} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CandidatesSection({
  candidates,
  density = "default",
}: {
  candidates: [CandidateCardEntry, CandidateCardEntry];
  density?: DetailDensity;
}) {
  const isCompact = density === "compact";

  return (
    <section
      className="rounded-xl p-5 mb-0 flex flex-col"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Candidates
      </h2>
      <div className="grid w-full grid-cols-2 gap-4 mt-3">
        {candidates.map((candidate) => {
          const accentColor = partyAccent(candidate.party);
          const displayName = candidate.placeholder ? "TBD" : candidate.name;
          const displayParty = candidate.partyName ?? partyLabel(candidate.party);
          return (
            <div key={`${candidate.name}-${candidate.party}`} className="flex h-full flex-col items-center text-center w-full">
              <div
                className={`${isCompact ? "w-20 h-24" : "w-full aspect-[4/5]"} rounded-xl overflow-hidden mb-3 flex items-center justify-center`}
                style={{ border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
              >
                {candidate.photo && !candidate.placeholder ? (
                  <Image
                    src={candidate.photo}
                    alt={candidate.name}
                    width={240}
                    height={300}
                    className="w-full h-full object-cover object-top"
                  />
                ) : candidate.party === "R" && !candidate.placeholder ? (
                  <Image
                    src="/candidates/placeholder-republican.png"
                    alt="Republican"
                    width={240}
                    height={300}
                    className="w-full h-full object-contain p-2"
                  />
                ) : candidate.party === "D" && !candidate.placeholder ? (
                  <Image
                    src="/candidates/placeholder-democrat.png"
                    alt="Democrat"
                    width={240}
                    height={300}
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
                    <rect width="64" height="80" fill="var(--app-tab-bg)" />
                    <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
                    <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
                  </svg>
                )}
              </div>
              <div className="flex items-center justify-center gap-1 mb-1 w-full">
                {candidate.placeholder ? (
                  <div
                    className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis italic ${isCompact ? "text-sm" : "text-xl"}`}
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {displayName}
                  </div>
                ) : (
                  <CandidateLink
                    name={candidate.name} state={candidate.state}
                    className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis hover:underline ${isCompact ? "text-sm" : "text-xl"}`}
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    {displayName}
                  </CandidateLink>
                )}
                {candidate.incumbent && !candidate.placeholder && (
                  <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: `${accentColor}22`, color: accentColor }}>Inc.</span>
                )}
              </div>
              <div className={`${isCompact ? "mb-1.5 text-xs" : "mb-3 text-base"} font-medium`} style={{ color: accentColor }}>
                {displayParty}
              </div>
              <div className={`${isCompact ? "text-2xl" : "text-6xl"} mt-auto font-bold tabular-nums leading-none`} style={{ color: accentColor }}>
                {fmtCandidatePct(candidate.pct)}%
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CurrentIncumbentCard({
  incumbentName,
  state,
  party,
  photo,
  items = [],
  description,
}: {
  incumbentName: string;
  /** The seat's state, for the candidate link (two candidates can share a name). */
  state?: string;
  party: "D" | "R" | "I";
  photo?: string | null;
  items?: DetailInfoItem[];
  description?: string;
}) {
  const accentColor = partyAccent(party);
  return (
    <section
      className="rounded-xl p-4 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Current Incumbent
      </h2>
      <div className="flex flex-col items-center text-center">
        <div
          className="aspect-[3/4] rounded-xl overflow-hidden mb-3 flex items-center justify-center"
          style={{ width: "min(42vw, 160px)", border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
        >
          {photo ? (
            <Image
              src={photo}
              alt={incumbentName}
              width={300}
              height={400}
              className="w-full h-full object-cover object-top"
            />
          ) : party === "R" ? (
            <Image
              src="/candidates/placeholder-republican.png"
              alt="Republican"
              width={300}
              height={400}
              className="w-full h-full object-contain p-3"
            />
          ) : party === "D" ? (
            <Image
              src="/candidates/placeholder-democrat.png"
              alt="Democrat"
              width={300}
              height={400}
              className="w-full h-full object-contain p-3"
            />
          ) : (
            <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
              <rect width="64" height="80" fill="var(--app-tab-bg)" />
              <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
              <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
            </svg>
          )}
        </div>
        <div className="w-full">
          <CandidateLink
            name={incumbentName} state={state}
            className="text-xl font-bold leading-tight mb-1 hover:underline inline-block"
            style={{ color: "var(--app-text-primary)" }}
          >
            {incumbentName}
          </CandidateLink>
          <div className="text-sm font-medium" style={{ color: accentColor }}>
            {partyLabel(party)} · Incumbent
          </div>
          {items.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-3 text-left">
              {items.map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2.5 flex flex-col" style={{ background: "var(--app-bg)" }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
                    {label}
                  </div>
                  <div className="text-sm font-semibold mt-auto" style={{ color: "var(--app-text-primary)" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {description && (
            <div className="mt-3 rounded-lg p-3 text-left" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                About this Seat
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
                {description}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Borderless incumbent row for the states-page-style "no election this cycle" pages — same framed
// square portrait treatment as CandidatesLedgerSection, without a vote-share figure.
export function CurrentIncumbentLedgerRow({
  incumbentName,
  state,
  party,
  photo,
  compact = false,
}: {
  incumbentName: string;
  /** The seat's state, for the candidate link (two candidates can share a name). */
  state?: string;
  party: "D" | "R" | "I";
  photo?: string | null;
  // Smaller, right-aligned treatment for the race-detail hero (mirrors the
  // "Projected Margin" stat block on active-race pages).
  compact?: boolean;
}) {
  const accentColor = partyAccent(party);

  if (compact) {
    // Large portrait card that anchors the race-detail hero as its right-side
    // focal point — the photo, not the name, is the dominant element here.
    return (
      <div className="flex flex-col items-end shrink-0">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)", lineHeight: 1 }}>
          Current Incumbent
        </div>
        <div
          className="shrink-0 overflow-hidden flex items-center justify-center"
          style={{ width: "7rem", height: "8.5rem", borderRadius: "18px", border: `3px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
        >
          {photo ? (
            <Image src={photo} alt={incumbentName} width={224} height={272} className="w-full h-full object-cover object-top" />
          ) : party === "R" ? (
            <Image src="/candidates/placeholder-republican.png" alt="Republican" width={224} height={272} className="w-full h-full object-contain p-2" />
          ) : party === "D" ? (
            <Image src="/candidates/placeholder-democrat.png" alt="Democrat" width={224} height={272} className="w-full h-full object-contain p-2" />
          ) : (
            <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
              <rect width="64" height="80" fill="var(--app-tab-bg)" />
              <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
              <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
            </svg>
          )}
        </div>
        <div className="mt-0.5 text-right">
          <CandidateLink
            name={incumbentName} state={state}
            className="hover:underline inline-block"
            style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", fontWeight: 700, color: "var(--app-text-primary)", lineHeight: 1.1 }}
          >
            {incumbentName}
          </CandidateLink>
          <div className="text-sm font-medium" style={{ color: accentColor, lineHeight: 1.2 }}>{partyLabel(party)} &middot; Incumbent</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="shrink-0 overflow-hidden flex items-center justify-center"
        style={{ width: "5.25rem", height: "5.25rem", borderRadius: "14px", border: `3px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
      >
        {photo ? (
          <Image src={photo} alt={incumbentName} width={168} height={168} className="w-full h-full object-cover object-top" />
        ) : party === "R" ? (
          <Image src="/candidates/placeholder-republican.png" alt="Republican" width={168} height={168} className="w-full h-full object-contain p-2" />
        ) : party === "D" ? (
          <Image src="/candidates/placeholder-democrat.png" alt="Democrat" width={168} height={168} className="w-full h-full object-contain p-2" />
        ) : (
          <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
            <rect width="64" height="80" fill="var(--app-tab-bg)" />
            <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
            <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <CandidateLink
          name={incumbentName} state={state}
          className="hover:underline inline-block"
          style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, color: "var(--app-text-primary)", lineHeight: 1.15 }}
        >
          {incumbentName}
        </CandidateLink>
        <div className="text-sm font-medium mt-0.5" style={{ color: accentColor }}>{partyLabel(party)} &middot; Incumbent</div>
      </div>
    </div>
  );
}

export function ElectionStatusCard({
  message,
}: {
  message: string;
}) {
  return (
    <section
      className="rounded-xl p-5 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
        Election Status
      </h2>
      <div
        className="rounded-lg p-4 flex items-start gap-3"
        style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M6 21h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="text-lg font-bold leading-tight mb-1" style={{ color: "var(--app-text-primary)" }}>
            No Election This Cycle
          </div>
          <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            {message}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CandidatesAndPollsCard({
  candidates,
  demPct,
  repPct,
  rcpDem,
  rcpRep,
  polyDem,
  polyRep,
  kalshiDem,
  kalshiRep,
  showPolls = true,
}: {
  candidates: [CandidateCardEntry, CandidateCardEntry];
  demPct: number;
  repPct: number;
  rcpDem?: number;
  rcpRep?: number;
  polyDem?: number;
  polyRep?: number;
  kalshiDem?: number;
  kalshiRep?: number;
  showPolls?: boolean;
}) {
  const marketDem = polyDem != null && kalshiDem != null ? (polyDem + kalshiDem) / 2 : (polyDem ?? kalshiDem);
  const marketRep = polyRep != null && kalshiRep != null ? (polyRep + kalshiRep) / 2 : (polyRep ?? kalshiRep);

  return (
    <section
      className="rounded-xl p-5 mb-0 flex flex-col"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "var(--app-text-muted)" }}>
        Candidates
      </h2>

      <div className="grid grid-cols-2 gap-6 sm:gap-10 mb-5 w-full max-w-[520px] mx-auto">
        {candidates.map((candidate) => {
          const accentColor = partyAccent(candidate.party);
          const displayName = candidate.placeholder ? "TBD" : candidate.name;
          const displayParty = candidate.partyName ?? partyLabel(candidate.party);
          return (
            <div key={`${candidate.name}-${candidate.party}`} className="flex flex-col items-center text-center">
              <div
                className="w-full max-w-[160px] mx-auto aspect-[3/4] rounded-xl overflow-hidden mb-3 flex items-center justify-center"
                style={{ border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
              >
                {candidate.photo && !candidate.placeholder ? (
                  <Image src={candidate.photo} alt={candidate.name} width={300} height={400} className="w-full h-full object-cover object-top" />
                ) : candidate.party === "R" && !candidate.placeholder ? (
                  <Image src="/candidates/placeholder-republican.png" alt="Republican" width={300} height={400} className="w-full h-full object-contain p-3" />
                ) : candidate.party === "D" && !candidate.placeholder ? (
                  <Image src="/candidates/placeholder-democrat.png" alt="Democrat" width={300} height={400} className="w-full h-full object-contain p-3" />
                ) : (
                  <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
                    <rect width="64" height="80" fill="var(--app-tab-bg)" />
                    <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
                    <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
                  </svg>
                )}
              </div>
              <div className="flex items-center justify-center gap-1.5 mb-1 w-full">
                {candidate.placeholder ? (
                  <div className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis italic" style={{ color: "var(--app-text-muted)" }}>{displayName}</div>
                ) : (
                  <CandidateLink name={candidate.name} state={candidate.state} className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis hover:underline" style={{ color: "var(--app-text-primary)" }}>
                    {displayName}
                  </CandidateLink>
                )}
                {candidate.incumbent && !candidate.placeholder && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${accentColor}22`, color: accentColor }}>Inc.</span>
                )}
              </div>
              <div className="text-sm font-medium mb-3" style={{ color: accentColor }}>{displayParty}</div>
              <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: accentColor }}>{fmtCandidatePct(candidate.pct)}%</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4" style={{ borderTop: "1px solid var(--app-border)" }} />

      <WinProbabilitySummary demPct={demPct} repPct={repPct} />

      {showPolls && (
        <div className="flex flex-col gap-2.5 mt-2.5">
          <PollSummaryRow label="RCP Average" dem={rcpDem} rep={rcpRep} precision={1} />
          <PollSummaryRow label="Prediction Markets" pctMargin dem={marketDem} rep={marketRep} />
        </div>
      )}
    </section>
  );
}

// Borderless candidate rows for the states-page-style layout — framed square portrait, serif name,
// party label, tabular vote share. Win probability and polls move up into the page's own hero stat row.
export function CandidatesLedgerSection({
  candidates,
  compact = false,
}: {
  /** The two nominees; the results section (headed 2026 Election) also passes any other candidate with a row of their own. */
  candidates: CandidateCardEntry[];
  /** Tighter row spacing, for the race pages' result section that also carries the map. */
  compact?: boolean;
}) {
  return (
    <div>
      {candidates.map((candidate, i) => {
        const accentColor = partyAccent(candidate.party);
        const displayName = candidate.placeholder ? "TBD" : candidate.name;
        const displayParty = candidate.partyName ?? partyLabel(candidate.party);
        const isLast = i === candidates.length - 1;
        return (
          <div
            key={`${candidate.name}-${candidate.party}`}
            className={`flex items-center justify-between ${compact ? "gap-3 py-2.5" : "gap-4 py-4"}`}
            style={{ borderBottom: isLast ? "none" : "1px solid var(--app-border)" }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="shrink-0 overflow-hidden flex items-center justify-center"
                style={{ width: "5.25rem", height: "5.25rem", borderRadius: "14px", border: `3px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
              >
                {candidate.photo && !candidate.placeholder ? (
                  <Image src={candidate.photo} alt={candidate.name} width={168} height={168} className="w-full h-full object-cover object-top" />
                ) : candidate.party === "R" && !candidate.placeholder ? (
                  <Image src="/candidates/placeholder-republican.png" alt="Republican" width={168} height={168} className="w-full h-full object-contain p-2" />
                ) : candidate.party === "D" && !candidate.placeholder ? (
                  <Image src="/candidates/placeholder-democrat.png" alt="Democrat" width={168} height={168} className="w-full h-full object-contain p-2" />
                ) : (
                  <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
                    <rect width="64" height="80" fill="var(--app-tab-bg)" />
                    <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
                    <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {candidate.placeholder ? (
                    <span className="italic" style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 700, color: "var(--app-text-muted)" }}>{displayName}</span>
                  ) : (
                    <CandidateLink
                      name={candidate.name} state={candidate.state}
                      className="hover:underline"
                      style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 700, color: accentColor }}
                    >
                      {displayName}
                    </CandidateLink>
                  )}
                  {candidate.incumbent && !candidate.placeholder && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${accentColor}22`, color: accentColor }}>Inc.</span>
                  )}
                  {candidate.winner && (
                    <svg viewBox="0 0 16 16" width="18" height="18" className="shrink-0" role="img" aria-label="Winner">
                      <title>Winner</title>
                      <circle cx="8" cy="8" r="8" fill={accentColor} />
                      <path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="var(--app-bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className={`text-sm font-medium${compact ? "" : " mt-0.5"}`} style={{ color: accentColor }}>{displayParty}</div>
              </div>
            </div>
            <div className="shrink-0 text-right tabular-nums" style={{ color: accentColor }}>
              <div className="flex items-baseline justify-end gap-2">
                {candidate.vsProjected != null && <VsProjected pts={candidate.vsProjected} />}
                <div className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{fmtCandidatePct(candidate.pct)}%</div>
              </div>
              {candidate.votes != null && (
                <div className={`text-sm font-medium${compact ? "" : " mt-0.5"}`}>{candidate.votes.toLocaleString("en-US")} votes</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Fundraising ───────────────────────────────────────────────────────────────
// Cycle-to-date receipts for the two general-election candidates, shown as a share
// split. Numbers come from data/fundraisingData.ts (FEC filings for House/Senate,
// state filings for governors — see the source line). A null side means the race
// isn't sourced yet, and the section says so rather than showing a one-sided total.

function formatReceipts(v: number): string {
  if (v >= 100_000_000) return `$${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `$${Math.round(v / 1_000)}K`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

export function FundraisingLedgerSection({
  dem,
  rep,
  demName,
  repName,
  source,
  pendingNote,
  fundraisingPts,
  typicalGapPct,
  detail,
}: {
  // Whole dollars raised; null on either side = not yet sourced.
  dem: number | null;
  rep: number | null;
  demName?: string;
  repName?: string;
  source?: string | null;
  // Why the numbers are missing, e.g. governors filing with the state, not the FEC.
  pendingNote?: string;
  // The race's FF points in the forecast, R-positive (see raceMoneyTerm).
  fundraisingPts?: number | null;
  // The receipts gap a generic pair of nominees in this situation would have (R-positive %);
  // the forecast pays points only on the gap beyond it (see raceMoneyTerm).
  typicalGapPct?: number | null;
  // FEC cash on hand / spending / outside spending / small-dollar share (House/Senate only).
  detail?: RaceFinanceDetail | null;
}) {
  const typical = typicalGapPct == null ? null : Math.abs(typicalGapPct) < 0.5 ? "an even split" : `${typicalGapPct > 0 ? "R" : "D"}+${Math.abs(typicalGapPct).toFixed(0)}%`;
  if (dem == null || rep == null) {
    return (
      <div>
        <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
          Fundraising TBD{pendingNote ? ` — ${pendingNote}` : ""}.
        </p>
        {typical && (
          <p className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>
            Until receipts are on file the forecast assumes the typical money gap for a race like this ({typical} of
            receipts), which adds no points either way.
          </p>
        )}
      </div>
    );
  }

  const total = dem + rep;
  const demShare = total > 0 ? (dem / total) * 100 : 50;
  const leader = dem === rep ? null : dem > rep ? "D" : "R";
  const gap = Math.abs(dem - rep);
  const ffPts = fundraisingPts ?? null;
  const ffDisplay = ffPts == null ? null
    : Math.abs(ffPts) < 0.05 ? null
    : `${ffPts > 0 ? "R" : "D"}+${Math.abs(ffPts).toFixed(1)}`;
  // The typical gap (R share − D share) as a D-share position on the split bar.
  const typicalDemShare = typicalGapPct == null ? null : Math.min(100, Math.max(0, 50 - typicalGapPct / 2));
  const surname = (n: string | undefined, fallback: string) => (n ? n.replace(/\s*\(.*\)\s*$/, "").trim().split(/\s+/).slice(-1)[0] : fallback);
  const sides = [
    { party: "D" as const, name: demName ?? "Democrat", short: surname(demName, "the Democrat"), amount: dem, share: demShare },
    { party: "R" as const, name: repName ?? "Republican", short: surname(repName, "the Republican"), amount: rep, share: 100 - demShare },
  ];
  const [lead, trail] = leader === "R" ? [sides[1], sides[0]] : [sides[0], sides[1]];
  const reportNote = detail ? financeReportNote(detail) : null;

  return (
    <div>
      {/* One split bar instead of a row per candidate, so it doesn't read like the candidates section. */}
      <div className="flex items-end justify-between gap-6">
        {sides.map((side) => (
          <div key={side.party} className={`min-w-0 ${side.party === "R" ? "text-right" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--app-text-muted)" }}>
              {side.name} ({side.party})
            </div>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums" style={{ justifyContent: side.party === "R" ? "flex-end" : "flex-start" }}>
              <span
                style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(1.6rem, 4vw, 1.9rem)", lineHeight: 1, color: partyAccent(side.party) }}
                title={`$${side.amount.toLocaleString()}`}
              >
                {formatReceipts(side.amount)}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{side.share.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-4" style={{ height: 22 }}>
        <div className="absolute inset-x-0 flex overflow-hidden rounded-full" style={{ top: 7, height: 8 }}>
          <div style={{ width: `${demShare}%`, background: partyAccent("D") }} />
          <div style={{ width: `${100 - demShare}%`, background: partyAccent("R") }} />
        </div>
        {/* 50% mark, dashed like the Forecast Calculation's even line */}
        <div className="absolute" style={{ left: "50%", top: 0, height: 22, borderLeft: "1px dashed var(--app-text-very-muted)" }} />
        {typicalDemShare != null && (
          <div
            className="absolute rounded-sm"
            style={{ left: `${typicalDemShare}%`, top: 1, height: 20, width: 4, transform: "translateX(-50%)", background: "var(--app-text-primary)", border: "1px solid var(--app-bg)" }}
            title={`Typical split for a race like this: ${typical}`}
          />
        )}
      </div>
      {typicalDemShare != null && (
        <div className="relative h-4 mt-1">
          <span
            className="absolute text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap tabular-nums"
            style={{
              left: `${typicalDemShare}%`,
              transform: `translateX(${typicalDemShare < 15 ? "0" : typicalDemShare > 85 ? "-100%" : "-50%"})`,
              color: "var(--app-text-muted)",
            }}
          >
            Typical · {typical}
          </span>
        </div>
      )}

      <p className="mt-3 text-sm" style={{ lineHeight: 1.5, color: "var(--app-text-muted)", textWrap: "pretty" }}>
        {leader ? (
          <>{lead.short} has out-raised {trail.short} by <LedgerFig color={partyAccent(lead.party)}>{formatReceipts(gap)}</LedgerFig>, of <LedgerFig color="var(--app-text-primary)">{formatReceipts(total)}</LedgerFig> raised in all.</>
        ) : (
          <>The two campaigns have raised the same amount, <LedgerFig color="var(--app-text-primary)">{formatReceipts(total)}</LedgerFig> in all.</>
        )}
        {fundraisingPts != null && (
          <>
            {" "}{typical ? <>Measured against the typical split for a race like this, </> : null}
            {ffDisplay
              ? <>{typical ? "the" : "The"} forecast counts it as <LedgerFig color={partyAccent(ffPts! > 0 ? "R" : "D")}>{ffDisplay}</LedgerFig>.</>
              : <>{typical ? "it" : "It"} moves the forecast by no points.</>}
          </>
        )}
      </p>

      {detail && <FinanceDetailCells detail={detail} />}

      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        Candidate-committee receipts, cycle to date{source ? ` · ${source}` : ""}.
        {reportNote && ` ${reportNote}.`}
        {(dem === 0 || rep === 0) && " $0 means no filings on record."}
      </p>
    </div>
  );
}

function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Campaigns file on their own schedules, so the two sides' reports can end on different dates.
function financeReportNote(detail: RaceFinanceDetail): string | null {
  const dEnd = formatAsOf(detail.dem?.coverageEnd ?? null), rEnd = formatAsOf(detail.rep?.coverageEnd ?? null);
  const reportThrough = dEnd && rEnd && dEnd !== rEnd ? `${dEnd} (D) and ${rEnd} (R)` : dEnd ?? rEnd;
  const ieThrough = formatAsOf(detail.ieThrough);
  const parts = [reportThrough && `Campaign reports through ${reportThrough}`, ieThrough && `outside spending filed through ${ieThrough}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// Cash on hand, spending, outside spending and small-dollar share, D · R per cell, laid out (and
// tinted on hover) like the Forecast Calculation's term cells. Outside spending on a side = independent expenditures supporting
// that candidate plus those opposing the opponent, so the two figures read as "help" for each side.
function FinanceDetailCells({ detail }: { detail: RaceFinanceDetail }) {
  const d = detail.dem, r = detail.rep;
  const help = (own?: RaceFinanceDetail["dem"], opp?: RaceFinanceDetail["dem"]) =>
    own || opp ? (own?.ieFor ?? 0) + (opp?.ieAgainst ?? 0) : null;
  const pct = (v: number | null | undefined) => (v == null ? null : `${Math.round(v * 100)}%`);
  const money = (v: number | null | undefined) => (v == null ? null : formatReceipts(v));
  const rows: { label: string; tip: string; dem: string | null; rep: string | null }[] = [
    { label: "Cash on hand", tip: "Cash in the bank at the end of each campaign's latest FEC report.", dem: money(d?.cashOnHand), rep: money(r?.cashOnHand) },
    { label: "Spent", tip: "Campaign disbursements this cycle to date.", dem: money(d?.spent), rep: money(r?.spent) },
    {
      label: "Outside spending",
      tip: "Independent expenditures by super PACs, parties and other groups that support the candidate or oppose their opponent, from 24/48-hour FEC reports (whole cycle, primaries included).",
      dem: money(help(d, r)), rep: money(help(r, d)),
    },
    { label: "Small-dollar share", tip: "Share of individual contributions given in amounts under $200 (unitemized).", dem: pct(d?.smallDollarShare), rep: pct(r?.smallDollarShare) },
  ];
  const visible = rows.filter((row) => row.dem != null || row.rep != null);
  if (!visible.length) return null;
  return (
    <div className="mt-1.5" style={LEDGER_ROW_STYLE}>
    <div className="-mx-2 grid grid-cols-2 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
      {visible.map((row) => (
        <div key={row.label} className="vh-row vh-row-boxed flex flex-col gap-1 px-2 py-2.5 hover:z-10 focus-within:z-10">
          <InfoTooltip label={row.label}>{row.tip}</InfoTooltip>
          <span className="text-xl font-bold leading-tight tabular-nums whitespace-nowrap" style={{ fontFamily: "var(--font-serif)" }}>
            <span style={{ color: partyAccent("D") }}>{row.dem ?? "—"}</span>
            <span className="mx-1.5 text-base" style={{ color: "var(--app-text-very-muted)" }}>·</span>
            <span style={{ color: partyAccent("R") }}>{row.rep ?? "—"}</span>
          </span>
        </div>
      ))}
    </div>
    </div>
  );
}

export function MarginAndWinProbabilityCard({
  margin,
  demPct,
  repPct,
  rcpDem,
  rcpRep,
  polyDem,
  polyRep,
  kalshiDem,
  kalshiRep,
  showPolls = true,
  density = "default",
}: {
  margin: number;
  demPct: number;
  repPct: number;
  rcpDem?: number;
  rcpRep?: number;
  polyDem?: number;
  polyRep?: number;
  kalshiDem?: number;
  kalshiRep?: number;
  showPolls?: boolean;
  density?: DetailDensity;
}) {
  const marginIsD = margin <= 0;
  const isCompact = density === "compact";

  return (
    <section
      className="rounded-xl p-3 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
        Projected Margin
      </h2>
      <div className={`${isCompact ? "text-xl mb-1.5" : "text-2xl mb-2"} font-bold`} style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}>
        {marginIsD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
      </div>
      <div className="relative group inline-flex items-center gap-1 mb-1.5">
        <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Win Probability</h2>
        <span className="text-[10px] cursor-help select-none" style={{ color: "var(--app-text-very-muted)" }}>ⓘ</span>
        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-lg px-3 py-2 text-[11px] leading-relaxed z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", color: "var(--app-text-muted)" }}>
          Derived from projected margin via logistic function:<br />
          <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>P(D) = 1 / (1 + e^(0.13 × margin))</span><br />
          Clamped to 2–98%.
        </div>
      </div>
      <div className="flex justify-between text-xs font-semibold mb-1.5">
        <span style={{ color: "var(--party-dem)" }}>Dem {demPct}%</span>
        <span style={{ color: "var(--party-rep)" }}>Rep {repPct}%</span>
      </div>
      <div className={`${isCompact ? "mb-2.5" : "mb-3"} h-3.5 rounded-full overflow-hidden flex`}>
        <div style={{ width: `${demPct}%`, background: "#1b408c" }} className="transition-all duration-300" />
        <div style={{ width: `${repPct}%`, background: "#be1c29" }} className="transition-all duration-300" />
      </div>
      {showPolls && (
        <>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
            Polls
          </h2>
          <div className="flex flex-col gap-2.5">
            <MarginPollRow label="RCP Average" dem={rcpDem} rep={rcpRep} precision={1} />
            <MarginPollRow
              label="Market Average"
              pctMargin
              dem={
                polyDem != null && kalshiDem != null ? (polyDem + kalshiDem) / 2
                : polyDem ?? kalshiDem
              }
              rep={
                polyRep != null && kalshiRep != null ? (polyRep + kalshiRep) / 2
                : polyRep ?? kalshiRep
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

export function RecentPollsCard() {
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Recent Polls
      </h2>
      <div className="flex flex-col gap-3">
        {["Poll 1", "Poll 2", "Poll 3"].map((label) => (
          <div key={label}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
              <span className="text-xs font-medium italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }} />
            <div className="text-[10px] mt-0.5 text-center" style={{ color: "var(--app-text-very-muted)" }}>
              vote share
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PollAggregateCard({ rows }: { rows: PollRow[] }) {
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Poll Aggregate
      </h2>
      <div className="flex flex-col gap-3">
        {rows.map(({ label, dem, rep, type }) => {
          const hasData = dem != null && rep != null;
          if (!hasData) {
            return (
              <div key={label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
                  <span className="text-xs font-medium italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }} />
                <div className="text-[10px] mt-0.5 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                  {type === "voteshare" ? "vote share" : "win probability"}
                </div>
              </div>
            );
          }

          const demRounded = Math.round(dem * 100);
          const repRounded = Math.round(rep * 100);
          const total = demRounded + repRounded;
          const dWidth = total > 0 ? (demRounded / total) * 100 : 50;
          const winner = demRounded >= repRounded ? "D" : "R";

          return (
            <div key={label}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
                <span className="text-xs font-bold" style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>
                  {winner === "D" ? `Dem +${demRounded - repRounded}` : `Rep +${repRounded - demRounded}`}
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: "var(--party-dem-muted)" }}>{demRounded}%</span>
                <span className="text-xs" style={{ color: "var(--party-rep-muted)" }}>{repRounded}%</span>
              </div>
              <div className="text-[10px] mt-0.5 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                {type === "voteshare" ? "vote share" : "win probability"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const LEDGER_ROW_STYLE = { borderBottom: "1px solid var(--app-border)" } as const;
// A figure inside the Forecast Calculation's serif sentence: set in the sans, in its party color.
function LedgerFig({ color, children }: { color: string; children: ReactNode }) {
  return <b className="font-bold tabular-nums" style={{ color }}>{children}</b>;
}

export function ForecastCalculationCard({
  tpl,
  genericBallot,
  tplLabel = "State TPL",
  tplHref,
  incumbentPts,
  appointedIncumbent = null,
  fundraisingPts,
  moneyTerm,
  candidatePts,
  candidateDetail,
  polling,
  projectedMargin,
  probabilityD,
  interval80,
  bare = false,
}: {
  tpl: number;
  genericBallot: number;
  tplLabel?: string;
  tplHref?: string;
  incumbentPts?: number;
  // Party of an incumbent who holds the seat by appointment or succession and has never won
  // it (Candidate.appointed); their advantage is scaled by APPOINTED_INCUMBENCY_SHARE.
  appointedIncumbent?: "D" | "R" | null;
  fundraisingPts?: number | null;
  // The pieces behind fundraisingPts, for the tooltip (raceMoneyTerm in lib/tplCompute.ts).
  moneyTerm?: RaceMoneyTerm;
  candidatePts?: number | null;
  // Phase 4: the nominees' ridge track-record effects behind candidatePts.
  candidateDetail?: { dem: { name: string; effect: number; n: number; latestYear: number; latestOffice: string } | null; rep: { name: string; effect: number; n: number; latestYear: number; latestOffice: string } | null } | null;
  // Phase 5: the race poll average and its evidence weight (lib/tplCompute.ts racePollingFor).
  polling?: RacePolling | null;
  // Sourced from lib/tplCompute.ts computeProjectedMargin() — the same value used by the map,
  // race table, and state page — so this card always displays the number driving the rest of the app.
  projectedMargin: number;
  // Phase 3: P(D wins) and the 80% margin interval from lib/forecast (forecastRace).
  probabilityD?: number;
  interval80?: [number, number];
  // Renders as flat, unboxed ledger rows (no card chrome) for pages using the states-page-style layout.
  bare?: boolean;
}) {
  const incPts = incumbentPts ?? 0;
  const ffPts = fundraisingPts ?? 0;
  const cqPts = candidatePts ?? 0;
  const modelMargin = tpl + genericBallot + incPts + ffPts + cqPts;

  function fmtMargin(v: number): string {
    if (Math.abs(v) < 0.05) return "EVEN";
    return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
  }

  function marginColor(v: number): string {
    if (Math.abs(v) < 0.05) return "var(--app-text-primary)";
    return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
  }

  const gbIsD = genericBallot < 0;
  const gbDisplay = Math.abs(genericBallot) < 0.05
    ? "EVEN"
    : `${gbIsD ? "D" : "R"}+${Math.abs(genericBallot).toFixed(1)}`;

  const showIncumbentRow = incumbentPts !== undefined;
  const incIsOpen = incPts === 0;
  const incDisplay = incIsOpen ? (appointedIncumbent ? "Appointed · 0" : "Open") : incPts > 0 ? `R+${incPts.toFixed(1)}` : `D+${Math.abs(incPts).toFixed(1)}`;
  const incColor = incIsOpen ? "var(--app-text-very-muted)" : incPts > 0 ? "var(--party-rep)" : "var(--party-dem)";

  const ffIsZero = Math.abs(ffPts) < 0.05;
  const ffDisplay = fundraisingPts == null ? "—" : ffIsZero ? "0" : ffPts > 0 ? `R+${ffPts.toFixed(1)}` : `D+${Math.abs(ffPts).toFixed(1)}`;
  const ffColor = fundraisingPts == null || ffIsZero ? "var(--app-text-very-muted)" : ffPts > 0 ? "var(--party-rep)" : "var(--party-dem)";

  const pollingAvg = polling?.avg?.diff ?? null;
  const effectivePollWeight = polling?.avg ? polling.weight : 0;
  const effectiveModelWeight = 1 - effectivePollWeight;
  const rowStyle = {
    background: "color-mix(in srgb, var(--app-bg) 82%, var(--app-panel))",
    borderBottom: "1px solid color-mix(in srgb, var(--app-border) 72%, transparent)",
  };
  const weightedRowStyle = {
    background: "color-mix(in srgb, var(--app-panel) 72%, var(--app-bg))",
    border: "1px solid var(--app-border)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  };
  const finalAccent = projectedMarginColor(projectedMargin);

  const env = getNationalEnvironment();
  const fmtNat = (v: number) => (Math.abs(v) < 0.05 ? "EVEN" : `${v < 0 ? "D" : "R"}+${Math.abs(v).toFixed(1)}`);
  const gbTooltip = (
    <>
      How much the national mood is expected to help one party this year. Polls asking voters which party they&apos;d back for Congress show {fmtNat(env.gb)}. After adjusting for how those polls have compared with actual results in past elections, the model counts that as {fmtNat(env.eHat)} nationally.
      <br /><br />
      Some states swing harder with the national mood than others, so that figure is scaled up or down by how much this state has usually moved.
      <br /><br />
      The national mood could still shift by about {nationalSigmaFor(tplLabel.startsWith("District") ? "H" : "S").toFixed(1)} points either way before election day. That doesn&apos;t change this number, but it is built into the win chance.
    </>
  );
  const appointedShare = FORECAST_CONSTANTS.APPOINTED_INCUMBENCY_SHARE;
  const incTooltip = (
    <>
      A boost for a candidate running for re-election, since officeholders usually do better than a newcomer would. It&apos;s worth about {(incumbentAdvantage().H ?? 0).toFixed(1)} points in House races, {(incumbentAdvantage().S ?? 0).toFixed(1)} in Senate races and {(incumbentAdvantage().G ?? 0).toFixed(1)} in governor races. Open seats get 0.
      {FORECAST_CONSTANTS.COMPETITIVE_INCUMBENCY.H > 0 && <><br /><br />House incumbents in close districts get up to {FORECAST_CONSTANTS.COMPETITIVE_INCUMBENCY.H} extra points, because in 2022 and 2024 they beat expectations in tight races. The number shown includes that.</>}
      <br /><br />
      {appointedShare === 0
        ? "Someone appointed to the seat who has never won an election for it gets no boost: appointees have historically done no better than any other nominee."
        : `Someone appointed to the seat who has never won an election for it gets ${Math.round(appointedShare * 100)}% of the boost.`}
      {appointedIncumbent ? " That applies to this race." : ""}
    </>
  );
  const fmtGap = (v: number) => (Math.abs(v) < 0.5 ? "even" : `${v > 0 ? "Republican" : "Democrat"} +${Math.abs(v).toFixed(0)} pts`);
  const frTooltip = (
    <>
      Credit for a fundraising edge bigger than usual. Incumbents and the favored party nearly always raise more, and the model already accounts for that, so only the unusual part of the gap counts. The effect is capped, so money alone can only move a race a few points.
      {moneyTerm && (
        <>
          <br /><br />
          {moneyTerm.known && moneyTerm.gapPct != null && moneyTerm.residualGapPct != null
            ? <>In this race, the money gap (difference in each side&apos;s share of the total raised) is {fmtGap(moneyTerm.gapPct)}. A race like this would usually see {moneyTerm.structuralGapPct == null ? "no typical figure" : fmtGap(moneyTerm.structuralGapPct)}, so the unusual part is {fmtGap(moneyTerm.residualGapPct)}.</>
            : <>Fundraising totals for this race aren&apos;t on file, so it&apos;s treated as a typical race (0 points).</>}
        </>
      )}
    </>
  );
  const describe = (c: { name: string; effect: number; n: number; latestYear: number; latestOffice: string } | null | undefined, label: string) => {
    if (!c) return `${label}: no past general-election record, so counted as an average candidate.`;
    const races = `${c.n} race${c.n === 1 ? "" : "s"}, most recent ${c.latestYear}`;
    if (Math.abs(c.effect) < 0.05) return `${c.name}: has run about even with a typical candidate (${races}).`;
    return `${c.name}: has run ${Math.abs(c.effect).toFixed(1)} points ${c.effect > 0 ? "ahead of" : "behind"} a typical candidate (${races}).`;
  };
  const candTooltip = (
    <>
      How each nominee has done in past races compared with a typical candidate from their party running in the same place and year. Candidates who have consistently outperformed get credit; those who have underperformed lose some. Recent races count more.
      <br /><br />
      {describe(candidateDetail?.dem, "Democrat")}
      <br />
      {describe(candidateDetail?.rep, "Republican")}
    </>
  );
  const modelTooltip = (
    <>
      The forecast before looking at polls: the {tplLabel ? tplLabel.replace(/ TPL$/, "").toLowerCase() : "state"}&apos;s usual partisan lean, plus the adjustments for the national mood, incumbency, fundraising and the candidates, added together.
    </>
  );
  const pollTooltip = !polling?.avg
    ? "No general-election polls for this race yet, so the forecast is the model alone."
    : (
      <>
        An average of the latest poll from each of {polling.avg.n} pollster{polling.avg.n === 1 ? "" : "s"}. Recent polls and polls with more respondents count more.
        <br /><br />
        Before averaging, each poll gets a few fixes: undecided voters are split between the candidates in proportion to their support; older polls are nudged for how the national mood has shifted since they were taken; and pollsters that consistently lean toward one party this year have that lean taken out.
        <br /><br />
        The more polling a race has, the more the forecast relies on it, but the model always keeps at least {Math.round(100 * (1 - FORECAST_CONSTANTS.POLL_W_MAX))}% of the say.
        {polling.shade !== 0 && <><br /><br />Final polls have missed toward Republicans on average in every recent election, so the forecast reads this average {Math.abs(polling.shade).toFixed(1)} points {polling.shade > 0 ? "more Republican" : "more Democratic"} than its face value, half the historical miss for this office.</>}
      </>
    );
  const marginTooltip = (
    <>
      Our final estimate of who wins and by how much.{" "}
      {!polling?.avg
        ? "There are no polls for this race yet, so it is the model alone."
        : `It blends the model (${Math.round(effectiveModelWeight * 100)}%) with the polling average (${Math.round(effectivePollWeight * 100)}%). Races with more polling lean more on the polls.`}
    </>
  );

  if (bare) {
    // Answer-first layout: the Projected Margin and win probability lead; the blend lever shows the
    // Model and Polling Avg on one margin axis, weighted, with the projection at their balance point
    // inside the 80% range; the structural terms that sum to the Model sit in one row below.
    const wModel = Math.round(effectiveModelWeight * 100);
    const wPoll = Math.round(effectivePollWeight * 100);
    const pollMeta = polling?.avg ? `${polling.avg.n} pollster${polling.avg.n === 1 ? "" : "s"} · ${polling.avg.nEff.toFixed(1)} effective` : null;
    const candDisplay = candidatePts == null ? "—" : Math.abs(candidatePts) < 0.05 ? "0" : candidatePts > 0 ? `R+${candidatePts.toFixed(1)}` : `D+${Math.abs(candidatePts).toFixed(1)}`;
    const candColor = candidatePts == null || Math.abs(candidatePts) < 0.05 ? "var(--app-text-very-muted)" : candidatePts > 0 ? "var(--party-rep)" : "var(--party-dem)";
    const pollColor = pollingAvg == null ? "var(--app-text-very-muted)" : pollingAvg > 0 ? "var(--party-rep)" : "var(--party-dem)";
    const winD = probabilityD != null && probabilityD >= 0.5;

    // Lever axis: symmetric about EVEN, D on the left, at least ±10, and wide enough that every mark
    // sits inside the middle 90% (a dot at the very end would hang off the section).
    const extent = Math.max(10, ...[modelMargin, projectedMargin, pollingAvg ?? 0, ...(interval80 ?? [])].map((v) => Math.ceil(Math.abs(v) / 0.9 / 5) * 5));
    const pos = (v: number) => 50 + (v / extent) * 50;
    const xModel = pos(modelMargin);
    const xPoll = pollingAvg == null ? null : pos(pollingAvg);
    const xProj = pos(projectedMargin);
    // The Model tag sits above the axis and the Polling tag below it, so the two never collide
    // however close the estimates are; a tag near either end anchors to that edge.
    const AXIS_Y = 49;
    const tagStyle = (x: number, top: number): CSSProperties =>
      x < 14 ? { top, left: `max(0px, calc(${x}% - 14px))` }
        : x > 86 ? { top, right: `max(0px, calc(${100 - x}% - 14px))`, textAlign: "right" }
        : { top, left: `${x}%`, transform: "translateX(-50%)", textAlign: "center" };
    const fmtTerm = (v: number) => (Math.abs(v) < 0.05 ? "0" : fmtMargin(v));
    const termCells: { key: string; label: ReactNode; value: string; color: string }[] = [
      {
        key: "tpl",
        label: tplHref
          ? <Link prefetch={false} href={tplHref} className="text-[11px] font-semibold uppercase tracking-wider hover:underline underline-offset-2" style={{ color: "var(--app-text-muted)" }} title={`View ${tplLabel}`}>{tplLabel}</Link>
          : <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{tplLabel}</span>,
        value: fmtTerm(tpl), color: leanColor(tpl),
      },
      { key: "env", label: <InfoTooltip label="+ Environment">{gbTooltip}</InfoTooltip>, value: gbDisplay, color: gbIsD ? "var(--party-dem)" : "var(--party-rep)" },
      ...(showIncumbentRow ? [{ key: "inc", label: <InfoTooltip label="+ Incumbent">{incTooltip}</InfoTooltip>, value: incDisplay, color: incColor }] : []),
      { key: "ff", label: <InfoTooltip label="+ Fundraising">{frTooltip}</InfoTooltip>, value: ffDisplay, color: ffColor },
      { key: "cand", label: <InfoTooltip label="+ Candidates">{candTooltip}</InfoTooltip>, value: candDisplay, color: candColor },
    ];
    return (
      <div className="flex flex-col">
        {/* Hero: the answer, with the favored side's win chance on the same line at right */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <InfoTooltip label="Projected Margin">{marginTooltip}</InfoTooltip>
            <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(2.1rem, 5.6vw, 3rem)", lineHeight: 0.95, color: finalAccent }}>
              {formatProjectedMargin(projectedMargin)}
            </div>
          </div>
          {probabilityD != null && (
            <div className="ml-auto flex flex-col items-end text-right">
              <InfoTooltip label={winD ? "Dem win chance" : "Rep win chance"}>
                How likely this candidate is to win, given how far off forecasts like this have been in past elections, including misses in the national mood that hit every race at once. Races with plenty of polling are a bit more certain.
              </InfoTooltip>
              <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(1.85rem, 4.8vw, 2.4rem)", lineHeight: 1, color: winD ? "var(--party-dem)" : "var(--party-rep)" }}>
                {(winD ? probabilityD : 1 - probabilityD) >= 0.995 ? ">99" : Math.round((winD ? probabilityD : 1 - probabilityD) * 100)}%
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-sm" style={{ lineHeight: 1.5, color: "var(--app-text-muted)", textWrap: "pretty" }}>
          {pollingAvg == null ? (
            <>No polls on file, so this is the Model alone at <LedgerFig color={projectedMarginColor(modelMargin)}>{formatProjectedMargin(modelMargin)}</LedgerFig>.</>
          ) : (
            <>Blends the Model at <LedgerFig color={projectedMarginColor(modelMargin)}>{formatProjectedMargin(modelMargin)}</LedgerFig> with a polling average of <LedgerFig color={pollColor}>{fmtMargin(pollingAvg)}</LedgerFig> ({pollMeta}){polling?.shade ? <>, read {Math.abs(polling.shade).toFixed(1)} pts {polling.shade > 0 ? "R" : "D"} of face value for the historical poll miss</> : null}.</>
          )}
        </p>

        {/* The structural terms that sum to the Model: no rules, each cell tints on hover (the race
            pages' row tint). Pulled out by the cells' padding so their text lines up with the section. */}
        <div className="mt-5 -mx-2 grid grid-cols-2 sm:grid-cols-3 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
          {termCells.map((c) => (
            <div key={c.key} className="vh-row vh-row-boxed flex flex-col gap-1 px-2 py-2.5 hover:z-10 focus-within:z-10">
              {c.label}
              <span className="text-2xl font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-serif)", color: c.color }}>{c.value}</span>
            </div>
          ))}
          <div className="vh-row vh-row-boxed flex flex-col gap-1 px-2 py-2.5 hover:z-10 focus-within:z-10">
            <InfoTooltip label="= Model" labelStyle={{ color: "var(--app-text-primary)" }}>{modelTooltip}</InfoTooltip>
            <span className="text-2xl font-bold leading-tight tabular-nums" style={{ fontFamily: "var(--font-serif)", color: projectedMarginColor(modelMargin) }}>{formatProjectedMargin(modelMargin)}</span>
          </div>
        </div>
        {interval80 && interval80[1] - interval80[0] > 0.05 && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold tabular-nums">
            <InfoTooltip label="80% range" labelStyle={{ color: "var(--app-text-very-muted)" }}>Eight times out of ten, the final result should land somewhere in this range (the grey band).</InfoTooltip>
            <span style={{ color: "var(--app-text-muted)" }}>{formatProjectedMargin(interval80[0])} to {formatProjectedMargin(interval80[1])}</span>
          </div>
        )}

        {/* Blend lever: Model and Polling Avg on one axis, the projection at their weighted balance point */}
        <div className="relative mt-6" style={{ height: xPoll != null ? 100 : 70 }} role="img"
          aria-label={pollingAvg == null ? `Model ${formatProjectedMargin(modelMargin)}, no polls` : `Model ${formatProjectedMargin(modelMargin)} at ${wModel}% and polling ${fmtMargin(pollingAvg)} at ${wPoll}% blend to ${formatProjectedMargin(projectedMargin)}`}>
          {interval80 && (
            <div className="absolute rounded-full" style={{ top: AXIS_Y - 9, height: 18, left: `${pos(interval80[0])}%`, width: `${pos(interval80[1]) - pos(interval80[0])}%`, background: "color-mix(in srgb, var(--app-text-primary) 7%, transparent)" }} />
          )}
          <div className="absolute inset-x-0" style={{ top: AXIS_Y - 1, height: 2, background: "var(--app-border)" }} />
          <div className="absolute" style={{ left: "50%", top: AXIS_Y - 17, height: 34, borderLeft: "1px dashed var(--app-text-very-muted)" }} />
          {xPoll != null && (
            <div className="absolute rounded-sm" style={{ top: AXIS_Y - 2, height: 4, left: `${Math.min(xModel, xPoll)}%`, width: `${Math.abs(xModel - xPoll)}%`, background: "var(--app-text-primary)" }} />
          )}
          <div className="absolute flex flex-col gap-0.5 whitespace-nowrap" style={tagStyle(xModel, 0)}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Model · {wModel}%</span>
            <span className="text-xl font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-serif)", color: projectedMarginColor(modelMargin) }}>{formatProjectedMargin(modelMargin)}</span>
          </div>
          {xPoll != null && pollingAvg != null && (
            <div className="absolute flex flex-col gap-0.5 whitespace-nowrap" style={tagStyle(xPoll, AXIS_Y + 18)}>
              <span className="text-xl font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-serif)", color: pollColor }}>{fmtMargin(pollingAvg)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Polling · {wPoll}%</span>
            </div>
          )}
          {/* The heavier source gets the bigger weight */}
          <div className="absolute rounded-full" style={{ top: AXIS_Y - (wModel >= wPoll ? 12 : 9), left: `${xModel}%`, width: wModel >= wPoll ? 24 : 18, height: wModel >= wPoll ? 24 : 18, transform: "translateX(-50%)", background: projectedMarginColor(modelMargin), border: "3px solid var(--app-bg)" }} />
          {xPoll != null && (
            <div className="absolute rounded-full" style={{ top: AXIS_Y - (wPoll > wModel ? 12 : 9), left: `${xPoll}%`, width: wPoll > wModel ? 24 : 18, height: wPoll > wModel ? 24 : 18, transform: "translateX(-50%)", background: pollColor, border: "3px solid var(--app-bg)" }} />
          )}
          {/* The projection: its number is the hero above, so the tick goes unlabeled */}
          <div className="absolute rounded-sm" style={{ top: AXIS_Y - 15, height: 30, width: 4, left: `${xProj}%`, transform: "translateX(-50%)", background: finalAccent }} />
          {/* The axis ends, just under the line */}
          <span className="absolute left-0 text-[10px] font-semibold tabular-nums" style={{ top: AXIS_Y + 6, color: "var(--app-text-very-muted)" }}>D+{extent}</span>
          <span className="absolute right-0 text-[10px] font-semibold tabular-nums" style={{ top: AXIS_Y + 6, color: "var(--app-text-very-muted)" }}>R+{extent}</span>
        </div>
      </div>
    );
  }

  return (
    <section
      className="rounded-xl"
      style={{
        background: "linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 94%, var(--app-bg)), var(--app-panel))",
        border: "1px solid var(--app-border)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="flex items-center px-3.5 py-3"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Forecast Calculation
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-lg" style={{ border: "1px solid var(--app-border)" }}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 rounded-t-lg" style={rowStyle}>
            {tplHref ? (
              <Link prefetch={false}
                href={tplHref}
                className="text-[11px] font-semibold uppercase tracking-wider hover:underline underline-offset-2"
                style={{ color: "var(--app-text-muted)" }}
                title={`View ${tplLabel}`}
              >
                {tplLabel}
              </Link>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{tplLabel}</span>
            )}
            <span className="text-sm font-bold" style={{ color: marginColor(tpl) }}>{fmtMargin(tpl)}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
            <InfoTooltip label="Environment">{gbTooltip}</InfoTooltip>
            <span className="text-sm font-bold" style={{ color: gbIsD ? "var(--party-dem)" : "var(--party-rep)" }}>{gbDisplay}</span>
          </div>
          {showIncumbentRow && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
              <InfoTooltip label="Incumbent">{incTooltip}</InfoTooltip>
              <span className="text-sm font-bold" style={{ color: incColor }}>{incDisplay}</span>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
            <InfoTooltip label="Fundraising">{frTooltip}</InfoTooltip>
            <span className="text-sm font-bold" style={{ color: ffColor }}>{ffDisplay}</span>
          </div>
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 rounded-b-lg"
            style={{ ...rowStyle, borderBottom: "0" }}
          >
            <InfoTooltip label="Candidates">{candTooltip}</InfoTooltip>
            <span className="text-sm font-bold" style={{ color: "var(--app-text-very-muted)" }}>
              {candidatePts == null ? "—" : Math.abs(candidatePts) < 0.05 ? "0" : candidatePts > 0 ? `R+${candidatePts.toFixed(1)}` : `D+${Math.abs(candidatePts).toFixed(1)}`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg px-3 py-2.5" style={weightedRowStyle}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <InfoTooltip label="Model">{modelTooltip}</InfoTooltip>
              <span className="text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
                {Math.round(effectiveModelWeight * 100)}%
              </span>
            </div>
            <div className="text-right text-2xl font-bold leading-none" style={{ color: projectedMarginColor(modelMargin) }}>{formatProjectedMargin(modelMargin)}</div>
          </div>

          <div className="rounded-lg px-3 py-2.5" style={weightedRowStyle}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <InfoTooltip label="Polling Avg">{pollTooltip}</InfoTooltip>
              <span className="text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
                {Math.round(effectivePollWeight * 100)}%
              </span>
            </div>
            <div className="text-right text-2xl font-bold leading-none" style={{ color: pollingAvg == null ? "var(--app-text-very-muted)" : pollingAvg > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
              {pollingAvg == null ? "—" : fmtMargin(pollingAvg)}
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-3.5 py-3"
          style={{
            background: "linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 70%, var(--app-panel)), var(--app-panel))",
            border: "1px solid var(--app-border)",
            borderLeft: `3px solid ${finalAccent}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <InfoTooltip label="Projected Margin" labelStyle={{ color: "var(--app-text-muted)" }}>{marginTooltip}</InfoTooltip>
          <span className="text-3xl font-bold leading-none" style={{ color: finalAccent }}>{formatProjectedMargin(projectedMargin)}</span>
        </div>
      </div>
    </section>
  );
}

export function PastElectionResultsSection({
  results,
  state,
  fallbackYears,
  showElectionType = true,
  showSpecialBadgeForSpecialElections = false,
  layoutClassName = "md:col-span-2",
  density = "default",
  scrollable = false,
  maxHeight,
  bare = false,
  swingCycleYears = 2,
  cardStyle = "boxed",
}: {
  results?: DetailPastResult[];
  /** The race's state, for the candidate links (two candidates can share a name). */
  state?: string;
  fallbackYears: number[];
  showElectionType?: boolean;
  showSpecialBadgeForSpecialElections?: boolean;
  layoutClassName?: string;
  density?: DetailDensity;
  scrollable?: boolean;
  maxHeight?: string;
  bare?: boolean;
  swingCycleYears?: number;
  // "ledger" mirrors the states page's ResultCard row — serif year, plain-text margin,
  // border-bottom divider instead of a boxed background. Used by the states-page-style
  // race pages; "boxed" (default) keeps the existing look for House/Counties pages.
  cardStyle?: "boxed" | "ledger";
}) {
  const isCompact = density === "compact";
  const isLedger = cardStyle === "ledger";
  const rows: DetailPastResult[] =
    results && results.length > 0
      ? results
      : fallbackYears.map((year) => ({ year, demPct: 0, repPct: 0, placeholder: true }));

  const cards = (
    <div className={`flex flex-col ${isLedger ? "" : (isCompact ? "gap-2.5" : "gap-3")}`}>
        {rows.map((res, idx) => {
          const isPlaceholder = !!res.placeholder;
          const isSpecial = res.electionType?.toLowerCase().includes("special") ?? false;
          const demParty = res.demParty ?? "D";
          const repParty = res.repParty ?? "R";
          const demAccent = partyAccent(demParty);
          const repAccent = partyAccent(repParty);
          const winnerParty = res.demPct > res.repPct ? demParty : repParty;
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          const demName = res.demCandidate ?? "Democratic Candidate";
          const repName = res.repCandidate ?? "Republican Candidate";
          const swingVal: number | null = !isPlaceholder
            ? (res.swing !== undefined
              ? res.swing
              : (!isSpecial
                  ? (() => {
                      const prevRow = rows.find(r => r.year === res.year - swingCycleYears && !r.placeholder && !r.electionType?.toLowerCase().includes("special"));
                      return prevRow != null
                        ? parseFloat(((prevRow.demPct - prevRow.repPct) - (res.demPct - res.repPct)).toFixed(1))
                        : null;
                    })()
                  : null))
            : null;

          const isLastRow = idx === rows.length - 1;
          // Staggered entrance (globals.css .vh-row); placeholders keep their dimmed opacity.
          const enterMs = Math.min(idx, 8) * 55;

          return (
            <div
              key={`${res.year}-${res.demCandidate ?? ""}-${res.repCandidate ?? ""}`}
              className={`${isLedger ? "" : "rounded-lg p-2.5"} ${isPlaceholder ? "" : isLedger ? "vh-row" : "vh-row vh-row-boxed"}`}
              style={
                isLedger
                  ? { opacity: isPlaceholder ? 0.45 : 1, padding: "1rem 0", borderBottom: isLastRow ? "none" : "1px solid var(--app-border)", animationDelay: `${enterMs}ms` }
                  : { opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)", animationDelay: `${enterMs}ms` }
              }
            >
              {/* Row 1: year + election type | result margin */}
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                  {isLedger ? (
                    <span className="tabular-nums shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{res.year}</span>
                  ) : (
                    <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  )}
                  {showElectionType && res.electionType && (() => {
                    const electionLabel = showSpecialBadgeForSpecialElections
                      ? res.electionType.replace(/\s+special/i, "")
                      : res.electionType;
                    const electionTypeLabel = (
                      <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{electionLabel}</span>
                    );
                    return electionTypeLabel;
                  })()}
                  {!isPlaceholder && res.electionHref && (
                    <Link prefetch={false}
                      href={res.electionHref}
                      className="shrink-0 text-[11px] font-semibold hover:underline"
                      style={{ color: "var(--app-text-muted)" }}
                      aria-label={`${res.year} election details`}
                    >
                      Details <span className="vh-lean" data-dir="r">→</span>
                    </Link>
                  )}
                  {!isPlaceholder && res.districtLabel && (
                    // A county can span many districts (e.g. Cook County, IL spans 10) -
                    // no nowrap/shrink-0 here, so a long list wraps within the pill
                    // instead of overflowing past the card.
                    <span
                      className="min-w-0 max-w-full whitespace-normal break-words rounded px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                    >
                      {res.districtLabel}
                    </span>
                  )}
                  {showElectionType && res.electionType && showSpecialBadgeForSpecialElections && res.electionType.toLowerCase().includes("special") && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                    >
                      Special
                    </span>
                  )}
                </div>
                {isPlaceholder ? (
                  <span className="text-xs italic shrink-0" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : isLedger ? (
                  <span className="vh-margin text-sm font-bold whitespace-nowrap shrink-0" style={{ color: partyAccent(winnerParty) }}>
                    {winnerParty}+{margin}
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                    style={{ background: partySubtle(winnerParty), color: partyAccent(winnerParty) }}
                  >
                    {winnerParty}+{margin}
                  </span>
                )}
              </div>

              {/* Dem row */}
              <div className="flex items-baseline gap-2 mb-1">
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  {isPlaceholder ? (
                    <span className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--app-text-muted)" }}>TBD</span>
                  ) : (
                    <span className="text-sm font-semibold min-w-0 truncate" style={{ color: demAccent }}>
                      {res.demCandidate ? (
                        <CandidateLink name={res.demCandidate} state={state} className="hover:underline">{demName}</CandidateLink>
                      ) : demName}
                      {" "}({demParty})
                    </span>
                  )}
                  {!isPlaceholder && res.demIncumbent && (
                    <span className="text-[10px] font-semibold shrink-0 px-1 py-0.5 rounded" style={{ background: partySubtle(demParty), color: demAccent }}>Inc.</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-sm font-bold tabular-nums w-12" style={{ color: demAccent }}>
                    {isPlaceholder ? "—" : `${res.demPct.toFixed(1)}%`}
                  </span>
                  <span className="text-xs tabular-nums w-16 text-right" style={{ color: "var(--app-text-very-muted)" }}>
                    {!isPlaceholder && (res.demVotes != null ? res.demVotes.toLocaleString() : "—")}
                  </span>
                </div>
              </div>

              {/* Rep row */}
              <div className="flex items-baseline gap-2 mb-1.5">
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  {isPlaceholder ? (
                    <span className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--app-text-muted)" }}>TBD</span>
                  ) : (
                    <span className="text-sm font-semibold min-w-0 truncate" style={{ color: repAccent }}>
                      {res.repCandidate ? (
                        <CandidateLink name={res.repCandidate} state={state} className="hover:underline">{repName}</CandidateLink>
                      ) : repName}
                      {" "}({repParty})
                    </span>
                  )}
                  {!isPlaceholder && res.repIncumbent && (
                    <span className="text-[10px] font-semibold shrink-0 px-1 py-0.5 rounded" style={{ background: partySubtle(repParty), color: repAccent }}>Inc.</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-sm font-bold tabular-nums w-12" style={{ color: repAccent }}>
                    {isPlaceholder ? "—" : `${res.repPct.toFixed(1)}%`}
                  </span>
                  <span className="text-xs tabular-nums w-16 text-right" style={{ color: "var(--app-text-very-muted)" }}>
                    {!isPlaceholder && (res.repVotes != null ? res.repVotes.toLocaleString() : "—")}
                  </span>
                </div>
              </div>

              {/* Bottom row: national diff + swing + progress bar */}
              <div className="flex items-center gap-2">
                {!isPlaceholder && res.nationalDiff != null && (() => {
                  const diffIsD = res.nationalDiff <= 0;
                  const diffAbs = Math.abs(res.nationalDiff).toFixed(1);
                  return (
                    <span
                      className="text-[11px] font-bold whitespace-nowrap shrink-0"
                      style={{ color: diffIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                      title="National Differential: national popular vote minus district result"
                    >
                      N<span className="vh-lean" data-dir={diffIsD ? "d" : "u"}>{diffIsD ? "↓" : "↑"}</span>{diffAbs}
                    </span>
                  );
                })()}
                {!isPlaceholder && swingVal != null && (() => {
                  const swingIsR = swingVal > 0;
                  const swingAbs = Math.abs(swingVal).toFixed(1);
                  return (
                    <span
                      className="text-[11px] font-bold whitespace-nowrap shrink-0"
                      style={{ color: swingVal === 0 ? "var(--app-text-muted)" : swingIsR ? "var(--party-rep)" : "var(--party-dem)" }}
                      title="Swing: change in margin vs previous election"
                    >
                      {swingVal === 0 ? `=${swingAbs}` : swingIsR ? <><span className="vh-lean" data-dir="r">→</span>R+{swingAbs}</> : <><span className="vh-lean" data-dir="l">←</span>D+{swingAbs}</>}
                    </span>
                  );
                })()}
                <div
                  className="ml-auto h-2 rounded-full overflow-hidden shrink-0"
                  style={{ width: "calc(3rem + 0.25rem + 4rem)", background: "var(--app-tab-bg)" }}
                >
                  {!isPlaceholder && (
                    <>
                      <div className="vh-bar-d h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c", animationDelay: `${enterMs + 140}ms` }} />
                      <div className="vh-bar-r h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29", animationDelay: `${enterMs + 140}ms` }} />
                    </>
                  )}
                </div>
              </div>

              {!isPlaceholder && res.note && (
                <div
                  className="mt-1.5 text-[11px] leading-snug rounded px-2 py-1"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                >
                  {res.note}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  if (bare) {
    return (scrollable || maxHeight) ? (
      <div className="overflow-y-auto pr-1" style={maxHeight ? { maxHeight } : undefined}>
        {cards}
      </div>
    ) : (
      <div>
        {cards}
      </div>
    );
  }

  return (
    <section
      className={`rounded-xl p-3 mb-0 ${(scrollable || maxHeight) ? "flex flex-col" : ""} ${layoutClassName}`}
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", ...(maxHeight ? { maxHeight } : {}) }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Past Race Results
      </h2>
      <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"} ${(scrollable || maxHeight) ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}`}>
        {cards}
      </div>
    </section>
  );
}

export function HouseOnlyRecentStatewideResultsSection({
  results = [
    { year: 2024, race: "Presidential", demPct: 0, repPct: 0, demCandidate: "TBD", repCandidate: "TBD", placeholder: true },
    { year: 2024, race: "Senate", demPct: 0, repPct: 0, demCandidate: "TBD", repCandidate: "TBD", placeholder: true },
    { year: 2022, race: "Governor", demPct: 0, repPct: 0, demCandidate: "TBD", repCandidate: "TBD", placeholder: true },
  ],
  state,
  density = "default",
  bare = false,
  maxHeight,
  cardStyle = "boxed",
}: {
  results?: {
    year: number;
    race: string;
    raceHref?: string;
    demCandidate?: string;
    repCandidate?: string;
    demPct: number;
    repPct: number;
    demVotes?: number;
    repVotes?: number;
    stateDiff?: number | null;
    nationalDiff?: number | null;
    swing?: number | null;
    placeholder?: boolean;
  }[];
  /** The state, for the candidate links (two candidates can share a name). */
  state?: string;
  density?: DetailDensity;
  bare?: boolean;
  maxHeight?: string;
  // "ledger" mirrors PastElectionResultsSection's ledger row treatment — serif year, plain-text
  // margin, border-bottom divider instead of a boxed background. Used by the states-page-style
  // House district page; "boxed" (default) keeps the original card look.
  cardStyle?: "boxed" | "ledger";
}) {
  const isCompact = density === "compact";
  const isLedger = cardStyle === "ledger";

  const cards = (
    <div className={`flex flex-col ${isLedger ? "" : (isCompact ? "gap-2.5" : "gap-3")}`}>
        {results.map((res, idx) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          const hasDiffs = !isPlaceholder && (res.nationalDiff != null || res.stateDiff != null || res.swing != null);
          const isLastRow = idx === results.length - 1;
          const enterMs = Math.min(idx, 8) * 55;
          return (
            <div
              key={`${res.year}-${res.race}`}
              className={`${isLedger ? "" : "rounded-lg p-2.5"} ${isPlaceholder ? "" : isLedger ? "vh-row" : "vh-row vh-row-boxed"}`}
              style={
                isLedger
                  ? { opacity: isPlaceholder ? 0.45 : 1, padding: "1rem 0", borderBottom: isLastRow ? "none" : "1px solid var(--app-border)", animationDelay: `${enterMs}ms` }
                  : { opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)", animationDelay: `${enterMs}ms` }
              }
            >
              {/* Row 1: year + race | result margin */}
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  {isLedger ? (
                    <span className="tabular-nums shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{res.year}</span>
                  ) : (
                    <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  )}
                  {res.raceHref ? (
                    <Link prefetch={false} href={res.raceHref} className="truncate text-sm font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
                      {res.race}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{res.race}</span>
                  )}
                </div>
                {isPlaceholder ? (
                  <span className="text-xs italic shrink-0" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : isLedger ? (
                  <span className="vh-margin text-sm font-bold whitespace-nowrap shrink-0" style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>
                    {winner}+{margin}
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                    style={winner === "D"
                      ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                      : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                  >
                    {winner}+{margin}
                  </span>
                )}
              </div>

              {/* Dem row */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-semibold min-w-0 flex-1 truncate" style={{ color: "var(--party-dem)" }}>
                  {res.demCandidate ? <CandidateLink name={res.demCandidate} state={state} className="hover:underline" /> : "Democratic Candidate"} (D)
                </span>
                <div className="flex items-baseline gap-1 ml-auto shrink-0">
                  <span className="text-sm font-bold tabular-nums w-12" style={{ color: "var(--party-dem)" }}>
                    {isPlaceholder ? "—" : `${res.demPct.toFixed(1)}%`}
                  </span>
                  <span className="text-xs tabular-nums w-16 text-right" style={{ color: "var(--app-text-very-muted)" }}>
                    {!isPlaceholder && (res.demVotes != null ? res.demVotes.toLocaleString() : "—")}
                  </span>
                </div>
              </div>

              {/* Rep row */}
              <div className={`flex items-baseline gap-2 ${hasDiffs ? "mb-1.5" : ""}`}>
                <span className="text-sm font-semibold min-w-0 flex-1 truncate" style={{ color: "var(--party-rep)" }}>
                  {res.repCandidate ? <CandidateLink name={res.repCandidate} state={state} className="hover:underline" /> : "Republican Candidate"} (R)
                </span>
                <div className="flex items-baseline gap-1 ml-auto shrink-0">
                  <span className="text-sm font-bold tabular-nums w-12" style={{ color: "var(--party-rep)" }}>
                    {isPlaceholder ? "—" : `${res.repPct.toFixed(1)}%`}
                  </span>
                  <span className="text-xs tabular-nums w-16 text-right" style={{ color: "var(--app-text-very-muted)" }}>
                    {!isPlaceholder && (res.repVotes != null ? res.repVotes.toLocaleString() : "—")}
                  </span>
                </div>
              </div>

              {/* Bottom row: N / S diffs + progress bar */}
              {hasDiffs && (
                <div className="flex items-center gap-2">
                  {res.nationalDiff != null && (() => {
                    const diffIsD = res.nationalDiff <= 0;
                    const diffAbs = Math.abs(res.nationalDiff).toFixed(1);
                    return (
                      <span
                        className="text-[11px] font-bold whitespace-nowrap shrink-0"
                        style={{ color: diffIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                        title="National Differential: national popular vote minus district result"
                      >
                        N<span className="vh-lean" data-dir={diffIsD ? "d" : "u"}>{diffIsD ? "↓" : "↑"}</span>{diffAbs}
                      </span>
                    );
                  })()}
                  {res.stateDiff != null && (() => {
                    const diffIsD = res.stateDiff >= 0;
                    const diffAbs = Math.abs(res.stateDiff).toFixed(1);
                    return (
                      <span
                        className="text-[11px] font-bold whitespace-nowrap shrink-0"
                        style={{ color: diffIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                        title="State Differential: district result minus statewide result"
                      >
                        S<span className="vh-lean" data-dir={diffIsD ? "d" : "u"}>{diffIsD ? "↓" : "↑"}</span>{diffAbs}
                      </span>
                    );
                  })()}
                  {res.swing != null && (() => {
                    const swingIsR = res.swing > 0;
                    const swingAbs = Math.abs(res.swing).toFixed(1);
                    return (
                      <span
                        className="text-[11px] font-bold whitespace-nowrap shrink-0"
                        style={{ color: res.swing === 0 ? "var(--app-text-muted)" : swingIsR ? "var(--party-rep)" : "var(--party-dem)" }}
                        title="Swing: change in margin vs previous election of same type"
                      >
                        {res.swing === 0 ? `=${swingAbs}` : swingIsR ? <><span className="vh-lean" data-dir="r">→</span>R+{swingAbs}</> : <><span className="vh-lean" data-dir="l">←</span>D+{swingAbs}</>}
                      </span>
                    );
                  })()}
                  <div className="ml-auto h-2 rounded-full overflow-hidden shrink-0" style={{ width: "calc(3rem + 0.25rem + 4rem)", background: "var(--app-tab-bg)" }}>
                    <div className="vh-bar-d h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c", animationDelay: `${enterMs + 140}ms` }} />
                    <div className="vh-bar-r h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29", animationDelay: `${enterMs + 140}ms` }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  if (bare) {
    return (
      <div>
        {cards}
      </div>
    );
  }

  return (
    <section
      className="rounded-xl p-3 mb-0 flex flex-col"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", ...(maxHeight ? { maxHeight } : {}) }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Past Statewide Results
      </h2>
      <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"} min-h-0 flex-1 overflow-y-auto pr-1`}>
        {cards}
      </div>
    </section>
  );
}

/** County-page-only demographics box (right column). Values come from
 * data/countyDemographics.ts; any missing field (e.g. CT's legacy counties, see that
 * file's header comment) renders as "N/A" rather than a fabricated 0. */
export function CountyDemographicsCard({
  collegePct, whitePct, blackPct, hispanicPct, asianPct, medianHouseholdIncome, bare = false,
}: {
  collegePct?: number;
  whitePct?: number;
  blackPct?: number;
  hispanicPct?: number;
  asianPct?: number;
  medianHouseholdIncome?: number;
  bare?: boolean;
}) {
  const noCollegePct = collegePct != null ? parseFloat((100 - collegePct).toFixed(1)) : undefined;
  const stats: { label: string; value?: number; format: "pct" | "usd" }[] = [
    { label: "College", value: collegePct, format: "pct" },
    { label: "No College", value: noCollegePct, format: "pct" },
    { label: "White", value: whitePct, format: "pct" },
    { label: "Black", value: blackPct, format: "pct" },
    { label: "Hispanic", value: hispanicPct, format: "pct" },
    { label: "Asian", value: asianPct, format: "pct" },
  ];

  const content = (
    <>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2.5 flex flex-col" style={{ background: "var(--app-bg)" }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
              {label}
            </div>
            <div className="text-sm font-bold mt-auto tabular-nums" style={{ color: value != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
              {value != null ? `${value.toFixed(1)}%` : "N/A"}
            </div>
          </div>
        ))}
        <div className="col-span-2 rounded-lg p-2.5 flex flex-col" style={{ background: "var(--app-bg)" }}>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
            Median Household Income
          </div>
          <div className="text-sm font-bold mt-auto tabular-nums" style={{ color: medianHouseholdIncome != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
            {medianHouseholdIncome != null ? `$${medianHouseholdIncome.toLocaleString()}` : "N/A"}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[9px]" style={{ color: "var(--app-text-very-muted)" }}>
        Source: County Health Rankings &amp; Roadmaps / USDA ERS, ACS 5-year estimates.
      </p>
    </>
  );

  if (bare) return content;

  return (
    <section
      className="rounded-xl p-3 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Demographics
      </h2>
      {content}
    </section>
  );
}


// ── Race polls table (Phase 5) ───────────────────────────────────────────────
// Every general-election poll on file for the race, newest first, with the weight
// each carries in the average (lib/racePollAverage.ts). Only a pollster's latest poll of
// the race is listed, as only it counts. Flat rows on the page background, like the other
// ledger sections.
/** Polls listed before the race page's "Show all N polls" button. */
const POLLS_FIRST = 10;

export function RacePollsSection({ polling, demName, repName }: { polling: RacePolling; demName: string; repName: string }) {
  const avg = polling.avg;
  if (!avg) return null;
  const fmtMargin = (v: number) => (Math.abs(v) < 0.05 ? "EVEN" : `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`);
  const marginColor = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");
  const fmtDate = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
  const maxWeight = Math.max(...avg.polls.map((p) => p.weight));
  const surname = (n: string) => n.replace(/\s*\(.*\)\s*$/, "").trim().split(/\s+/).slice(-1)[0];
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-0.5 pb-1.5">
        <span className="text-[30px] font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-serif)", color: marginColor(avg.diff) }}>{fmtMargin(avg.diff)}</span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-primary)" }}>Polling average</span>
      </div>
      {/* Phones: dates and sample move under the pollster so every column fits without scrolling. */}
      <table className="w-full text-[13px] tabular-nums sm:hidden" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            <th className="text-left font-semibold py-2 pr-2">Pollster</th>
            <th className="text-right font-semibold py-2 pr-2">{surname(demName)}</th>
            <th className="text-right font-semibold py-2 pr-2">{surname(repName)}</th>
            <th className="text-right font-semibold py-2 pr-2">Margin</th>
            <th className="text-right font-semibold py-2 pr-2" title="The published margin, aged by the generic ballot's movement and net of the pollster's house effect — what the average uses">Adj.</th>
            <th className="text-right font-semibold py-2">Wt.</th>
          </tr>
        </thead>
        <ExpandableTbody pill first={POLLS_FIRST} colSpan={6} noun="polls" rows={avg.polls.map((p) => (
            <tr key={`${p.pollster}-${p.endDate}`} className="align-top" style={{ borderTop: "1px solid color-mix(in srgb, var(--app-border) 72%, transparent)", color: "var(--app-text-primary)" }}>
              <td className="py-2 pr-2">
                <div>{p.pollster}{p.partisan ? <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>({p.partisan})</span> : null}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                  <span className="whitespace-nowrap">{p.startDate === p.endDate ? fmtDate(p.endDate) : `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`}</span>
                  {p.sample != null ? <> · <span className="whitespace-nowrap">{p.sample.toLocaleString()}{p.population ? ` ${p.population}` : ""}</span></> : null}
                </div>
              </td>
              <td className="py-2 pr-2 text-right font-semibold" style={{ color: "var(--party-dem)" }}>{p.dem.toFixed(0)}%</td>
              <td className="py-2 pr-2 text-right font-semibold" style={{ color: "var(--party-rep)" }}>{p.rep.toFixed(0)}%</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap">{fmtMargin(p.diff)}</td>
              <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap" style={{ color: marginColor(p.diff + p.shift - p.house) }}>{fmtMargin(p.diff + p.shift - p.house)}</td>
              <td className="py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>{maxWeight > 0 ? `${Math.round((p.weight / maxWeight) * 100)}%` : "—"}</td>
            </tr>
          ))} />
      </table>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm tabular-nums" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
              <th className="text-left font-semibold py-2 pr-2">Pollster</th>
              <th className="text-left font-semibold py-2 pr-2">Dates</th>
              <th className="text-right font-semibold py-2 pr-2">Sample</th>
              <th className="text-right font-semibold py-2 pr-2">{surname(demName)}</th>
              <th className="text-right font-semibold py-2 pr-2">{surname(repName)}</th>
              <th className="text-right font-semibold py-2 pr-2">Margin</th>
              <th className="text-right font-semibold py-2 pr-2" title="The published margin, aged by the generic ballot's movement and net of the pollster's house effect — what the average uses">Adjusted</th>
              <th className="text-right font-semibold py-2">Weight</th>
            </tr>
          </thead>
          <ExpandableTbody pill first={POLLS_FIRST} colSpan={8} noun="polls" rows={avg.polls.map((p) => (
              <tr key={`${p.pollster}-${p.endDate}`} style={{ borderTop: "1px solid color-mix(in srgb, var(--app-border) 72%, transparent)", color: "var(--app-text-primary)" }}>
                <td className="py-1.5 pr-2 whitespace-nowrap">{p.pollster}{p.partisan ? <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>({p.partisan})</span> : null}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{p.startDate === p.endDate ? fmtDate(p.endDate) : `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`}</td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{p.sample != null ? p.sample.toLocaleString() : "—"}{p.population ? ` ${p.population}` : ""}</td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: "var(--party-dem)" }}>{p.dem.toFixed(0)}%</td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: "var(--party-rep)" }}>{p.rep.toFixed(0)}%</td>
                <td className="py-1.5 pr-2 text-right">{fmtMargin(p.diff)}</td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: marginColor(p.diff + p.shift - p.house) }}>{fmtMargin(p.diff + p.shift - p.house)}</td>
                <td className="py-1.5 text-right" style={{ color: "var(--app-text-very-muted)" }}>{maxWeight > 0 ? `${Math.round((p.weight / maxWeight) * 100)}%` : "—"}</td>
              </tr>
            ))} />
        </table>
      </div>
    </div>
  );
}
