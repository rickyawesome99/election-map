import Image from "next/image";
import CandidateLink from "@/components/CandidateLink";
import { WinProbabilityLabel } from "@/components/WinProbabilityLabel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { POLL_WEIGHT, GENERIC_BALLOT } from "@/lib/tplCompute";

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
  nationalDiff?: number | null;
  swing?: number | null;
  note?: string;
  districtLabel?: string;
  placeholder?: boolean;
};

type DetailInfoItem = {
  label: string;
  value: string;
};

type CandidateCardEntry = {
  name: string;
  party: "D" | "R" | "I";
  incumbent?: boolean;
  photo?: string | null;
  pct: number;
  placeholder?: boolean;
};

type HouseBoundaryHistoryEntry = {
  year: number;
  pvi?: number;
  description?: string;
  pviOld?: number;
  pviNew?: number;
  boundaryChanged?: boolean;
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

export function AboutRaceCard({
  title,
  description,
  items,
  compact = false,
}: {
  title: string;
  description: string;
  items: DetailInfoItem[];
  compact?: boolean;
}) {
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
      {!compact && (
        <p className="text-sm leading-relaxed mb-2.5" style={{ color: "var(--app-text-primary)" }}>
          {description}
        </p>
      )}
      <div className={compact ? "flex flex-col gap-1.5" : `grid gap-2 ${gridClass}`}>
        {items.map(({ label, value }) => (
          <div key={label} className={compact ? "rounded-lg px-2.5 py-1.5 flex items-center justify-between" : "rounded-lg p-2.5 flex flex-col"} style={{ background: "var(--app-bg)" }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
              {label}
            </div>
            <div className={`text-xs font-semibold ${compact ? "" : "mt-auto"}`} style={{ color: "var(--app-text-primary)" }}>
              {value}
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
          const displayParty = partyLabel(candidate.party);
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
                    name={candidate.name}
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
                {candidate.pct}%
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
  party,
  photo,
  items = [],
  description,
}: {
  incumbentName: string;
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
            name={incumbentName}
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
          const displayParty = partyLabel(candidate.party);
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
                  <CandidateLink name={candidate.name} className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis hover:underline" style={{ color: "var(--app-text-primary)" }}>
                    {displayName}
                  </CandidateLink>
                )}
                {candidate.incumbent && !candidate.placeholder && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${accentColor}22`, color: accentColor }}>Inc.</span>
                )}
              </div>
              <div className="text-sm font-medium mb-3" style={{ color: accentColor }}>{displayParty}</div>
              <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: accentColor }}>{candidate.pct}%</div>
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

export function ForecastCalculationCard({
  tpl,
  genericBallot,
  tplLabel = "State TPL",
  tplHref,
  incumbentPts,
  fundraisingPts,
  candidatePts,
  pollingAvg,
  projectedMargin,
}: {
  tpl: number;
  genericBallot: number;
  tplLabel?: string;
  tplHref?: string;
  incumbentPts?: number;
  fundraisingPts?: number | null;
  candidatePts?: number | null;
  pollingAvg?: number | null;
  // Sourced from lib/tplCompute.ts computeProjectedMargin() — the same value used by the map,
  // race table, and state page — so this card always displays the number driving the rest of the app.
  projectedMargin: number;
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
  const incDisplay = incIsOpen ? "Open" : incPts > 0 ? `R+${incPts}` : `D+${Math.abs(incPts)}`;
  const incColor = incIsOpen ? "var(--app-text-very-muted)" : incPts > 0 ? "var(--party-rep)" : "var(--party-dem)";

  const effectivePollWeight = pollingAvg == null ? 0 : POLL_WEIGHT;
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
  const finalAccent = marginColor(projectedMargin);

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
              <a
                href={tplHref}
                className="text-[11px] font-semibold uppercase tracking-wider hover:underline underline-offset-2"
                style={{ color: "var(--app-text-muted)" }}
                title={`View ${tplLabel}`}
              >
                {tplLabel}
              </a>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{tplLabel}</span>
            )}
            <span className="text-sm font-bold" style={{ color: marginColor(tpl) }}>{fmtMargin(tpl)}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
            <InfoTooltip label="Generic Ballot">
              National environment ({Math.abs(GENERIC_BALLOT) < 0.05 ? "EVEN" : `${GENERIC_BALLOT < 0 ? "D" : "R"}+${Math.abs(GENERIC_BALLOT).toFixed(1)}`}) scaled by this state&apos;s wave sensitivity coefficient S.
              <br /><br />
              <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>Effective wave = GB × S</span>
              <br /><br />
              States that historically swing more with national tides get a larger adjustment.
            </InfoTooltip>
            <span className="text-sm font-bold" style={{ color: gbIsD ? "var(--party-dem)" : "var(--party-rep)" }}>{gbDisplay}</span>
          </div>
          {showIncumbentRow && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
              <InfoTooltip label="Incumbent">
                Additive point advantage for the incumbent running in 2026.
                <br /><br />
                <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>House ±3 · Senate ±2 · Governor ±7</span>
                <br /><br />
                R incumbent = positive · D incumbent = negative · Open seat = 0.
              </InfoTooltip>
              <span className="text-sm font-bold" style={{ color: incColor }}>{incDisplay}</span>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5" style={rowStyle}>
            <InfoTooltip label="Fundraising">
              Additive point adjustment based on cash-on-hand advantage.
              <br /><br />
              <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>pts = gap% × 0.06, capped at ±4</span>
              <br /><br />
              gap% = (R cash − D cash) / total × 100. A 50% gap ≈ +3 pts. Pending FEC data entry.
            </InfoTooltip>
            <span className="text-sm font-bold" style={{ color: "var(--app-text-very-muted)" }}>
              {fundraisingPts == null ? "—" : fundraisingPts > 0 ? `R+${fundraisingPts}` : fundraisingPts < 0 ? `D+${Math.abs(fundraisingPts)}` : "0"}
            </span>
          </div>
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 rounded-b-lg"
            style={{ ...rowStyle, borderBottom: "0" }}
          >
            <InfoTooltip label="Candidates">
              Additive point adjustment based on 2026 candidate quality matchup.
              <br /><br />
              <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>pts = WQ pts + LQ pts</span>
              <br /><br />
              Your candidate — Elite +4 · Strong +2 · Generic 0 · Weak −2 · Sacrificial −4.
              Opponent — Elite −4 · Strong −2 · Generic 0 · Weak +2 · Sacrificial +4.
              Pending manual input per race.
            </InfoTooltip>
            <span className="text-sm font-bold" style={{ color: "var(--app-text-very-muted)" }}>
              {candidatePts == null ? "—" : candidatePts > 0 ? `R+${candidatePts}` : candidatePts < 0 ? `D+${Math.abs(candidatePts)}` : "0"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg px-3 py-2.5" style={weightedRowStyle}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <InfoTooltip label="Model">
                Sum of State/District TPL, Generic Ballot, Incumbent, Fundraising, and Candidate points.
                <br /><br />
                <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>Model = TPL + GB + Incumbent + Fundraising + Candidates</span>
              </InfoTooltip>
              <span className="text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>
                {Math.round(effectiveModelWeight * 100)}%
              </span>
            </div>
            <div className="text-right text-2xl font-bold leading-none" style={{ color: marginColor(modelMargin) }}>{fmtMargin(modelMargin)}</div>
          </div>

          <div className="rounded-lg px-3 py-2.5" style={weightedRowStyle}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <InfoTooltip label="Polling Avg">
                {pollingAvg == null
                  ? "No polls currently available."
                  : "Sourced from the RCP Average margin shown on the Candidates card."}
              </InfoTooltip>
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
          <InfoTooltip label="Projected Margin" labelStyle={{ color: "var(--app-text-muted)" }}>
            <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>Projected Margin = 0.8 × Model + 0.2 × Polling Avg</span>
            <br /><br />
            {pollingAvg == null
              ? "No polls currently available, so this reflects the Model only."
              : `Blended ${Math.round(effectiveModelWeight * 100)}% Model / ${Math.round(effectivePollWeight * 100)}% Polling Avg.`}
          </InfoTooltip>
          <span className="text-3xl font-bold leading-none" style={{ color: finalAccent }}>{fmtMargin(projectedMargin)}</span>
        </div>
      </div>
    </section>
  );
}

export function PastElectionResultsSection({
  results,
  fallbackYears,
  showElectionType = true,
  showSpecialBadgeForSpecialElections = false,
  layoutClassName = "md:col-span-2",
  density = "default",
  scrollable = false,
  maxHeight,
  bare = false,
  swingCycleYears = 2,
}: {
  results?: DetailPastResult[];
  fallbackYears: number[];
  showElectionType?: boolean;
  showSpecialBadgeForSpecialElections?: boolean;
  layoutClassName?: string;
  density?: DetailDensity;
  scrollable?: boolean;
  maxHeight?: string;
  bare?: boolean;
  swingCycleYears?: number;
}) {
  const isCompact = density === "compact";
  const rows: DetailPastResult[] =
    results && results.length > 0
      ? results
      : fallbackYears.map((year) => ({ year, demPct: 0, repPct: 0, placeholder: true }));

  const cards = (
    <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"}`}>
        {rows.map((res) => {
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

          return (
            <div
              key={`${res.year}-${res.demCandidate ?? ""}-${res.repCandidate ?? ""}`}
              className="rounded-lg p-2.5"
              style={{ opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)" }}
            >
              {/* Row 1: year + election type | result margin */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  {showElectionType && res.electionType && (!showSpecialBadgeForSpecialElections || !res.electionType.toLowerCase().includes("special")) && (
                    <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{res.electionType}</span>
                  )}
                  {!isPlaceholder && res.districtLabel && (
                    <span
                      className="text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
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
                        <CandidateLink name={res.demCandidate} className="hover:underline">{demName}</CandidateLink>
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
                        <CandidateLink name={res.repCandidate} className="hover:underline">{repName}</CandidateLink>
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
                      N{diffIsD ? "↓" : "↑"}{diffAbs}
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
                      {swingVal === 0 ? `=${swingAbs}` : swingIsR ? `→R+${swingAbs}` : `←D+${swingAbs}`}
                    </span>
                  );
                })()}
                <div
                  className="ml-auto h-2 rounded-full overflow-hidden shrink-0"
                  style={{ width: "calc(3rem + 0.25rem + 4rem)", background: "var(--app-tab-bg)" }}
                >
                  {!isPlaceholder && (
                    <>
                      <div className="h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                      <div className="h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
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
    return (
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
  density = "default",
  bare = false,
  maxHeight,
}: {
  results?: {
    year: number;
    race: string;
    demPct: number;
    repPct: number;
    demCandidate?: string;
    repCandidate?: string;
    demVotes?: number;
    repVotes?: number;
    stateDiff?: number | null;
    nationalDiff?: number | null;
    swing?: number | null;
    placeholder?: boolean;
  }[];
  density?: DetailDensity;
  bare?: boolean;
  maxHeight?: string;
}) {
  const isCompact = density === "compact";

  const cards = (
    <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"}`}>
        {results.map((res) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          const hasDiffs = !isPlaceholder && (res.nationalDiff != null || res.stateDiff != null || res.swing != null);
          return (
            <div
              key={`${res.year}-${res.race}`}
              className="rounded-lg p-2.5"
              style={{ opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)" }}
            >
              {/* Row 1: year + race | result margin */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{res.race}</span>
                </div>
                {isPlaceholder ? (
                  <span className="text-xs italic shrink-0" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
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
                <span className="text-sm font-semibold shrink-0 w-8" style={{ color: "var(--party-dem)" }}>Dem</span>
                {res.demCandidate && (
                  <span className="text-sm min-w-0 flex-1 truncate" style={{ color: "var(--party-dem)" }}>{res.demCandidate}</span>
                )}
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
                <span className="text-sm font-semibold shrink-0 w-8" style={{ color: "var(--party-rep)" }}>Rep</span>
                {res.repCandidate && (
                  <span className="text-sm min-w-0 flex-1 truncate" style={{ color: "var(--party-rep)" }}>{res.repCandidate}</span>
                )}
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
                        N{diffIsD ? "↓" : "↑"}{diffAbs}
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
                        S{diffIsD ? "↓" : "↑"}{diffAbs}
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
                        {res.swing === 0 ? `=${swingAbs}` : swingIsR ? `→R+${swingAbs}` : `←D+${swingAbs}`}
                      </span>
                    );
                  })()}
                  <div className="ml-auto h-2 rounded-full overflow-hidden shrink-0" style={{ width: "calc(3rem + 0.25rem + 4rem)", background: "var(--app-tab-bg)" }}>
                    <div className="h-full float-left" style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                    <div className="h-full float-left" style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
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

function pviLabel(pvi: number): string {
  if (pvi === 0) return "EVEN";
  return pvi > 0 ? `R+${pvi}` : `D+${Math.abs(pvi)}`;
}

function PviBadge({ pvi }: { pvi: number }) {
  const isR = pvi > 0;
  const isEven = pvi === 0;
  const bg = isEven ? "var(--app-tab-bg)" : isR ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)";
  const color = isEven ? "var(--app-text-muted)" : isR ? "var(--party-rep)" : "var(--party-dem)";
  return (
    <span
      className="text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap tabular-nums"
      style={{ background: bg, color }}
    >
      {pviLabel(pvi)}
    </span>
  );
}

export function HouseOnlyDistrictBoundariesSection({
  entries,
  density = "default",
  scrollable = false,
  maxHeight,
}: {
  entries: HouseBoundaryHistoryEntry[];
  density?: DetailDensity;
  scrollable?: boolean;
  maxHeight?: string;
}) {
  const isCompact = density === "compact";

  return (
    <section
      className={`rounded-xl p-3 mb-0 ${(scrollable || maxHeight) ? "flex min-h-0 flex-col overflow-hidden" : ""}`}
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", ...(maxHeight ? { maxHeight } : {}) }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        District Boundaries
      </h2>
      <div
        className={`mb-2 ${(scrollable || maxHeight) ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}`}
      >
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
          PVI History
        </div>
        {entries.length === 0 ? (
          <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
            No PVI data recorded for this district.
          </p>
        ) : (
          <div className={`flex flex-col ${isCompact ? "gap-2" : "gap-2.5"}`}>
            {entries.map((entry, i) => {
              const displayPvi = entry.pvi ?? entry.pviNew;
              return (
                <div key={i} className="flex gap-3 items-start">
                  <div
                    className="shrink-0 text-xs font-semibold tabular-nums rounded px-2 py-1 mt-0.5"
                    style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", minWidth: 56, textAlign: "center" }}
                  >
                    {entry.year}
                  </div>
                  <div className="flex-1 min-w-0">
                    {entry.boundaryChanged && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "color-mix(in srgb, #b45309 15%, transparent)", color: "#b45309" }}
                        >
                          Boundaries Redrawn
                        </span>
                      </div>
                    )}
                    {displayPvi != null && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>PVI</span>
                        {entry.boundaryChanged && entry.pviOld != null ? (
                          <>
                            <PviBadge pvi={entry.pviOld} />
                            <span className="text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>→</span>
                            <PviBadge pvi={displayPvi} />
                          </>
                        ) : (
                          <PviBadge pvi={displayPvi} />
                        )}
                      </div>
                    )}
                    {entry.description && (
                      <div className="text-xs leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
                        {entry.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** County-page-only demographics box (right column). Values come from
 * data/countyDemographics.ts; any missing field (e.g. CT's legacy counties, see that
 * file's header comment) renders as "N/A" rather than a fabricated 0. */
export function CountyDemographicsCard({
  collegePct, whitePct, blackPct, hispanicPct, asianPct, medianHouseholdIncome,
}: {
  collegePct?: number;
  whitePct?: number;
  blackPct?: number;
  hispanicPct?: number;
  asianPct?: number;
  medianHouseholdIncome?: number;
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

  return (
    <section
      className="rounded-xl p-3 mb-0"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Demographics
      </h2>
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
    </section>
  );
}
