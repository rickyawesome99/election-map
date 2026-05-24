import Image from "next/image";

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
  demVotes?: number;
  repVotes?: number;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
  electionType?: string;
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
  return party === "R" ? "var(--party-rep)" : "var(--party-dem)";
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
            {winner === "D" ? `D +${marginVal}${pctMargin ? "%" : ""}` : `R +${marginVal}${pctMargin ? "%" : ""}`}
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
                ) : (
                  <svg viewBox="0 0 64 80" className="w-full h-full" fill="none">
                    <rect width="64" height="80" fill="var(--app-tab-bg)" />
                    <circle cx="32" cy="28" r="14" fill="var(--app-border)" />
                    <ellipse cx="32" cy="76" rx="25" ry="18" fill="var(--app-border)" />
                  </svg>
                )}
              </div>
              <div className="flex items-center justify-center gap-1 mb-1 w-full">
                <div
                  className={`font-bold whitespace-nowrap overflow-hidden text-ellipsis ${isCompact ? "text-sm" : "text-xl"} ${candidate.placeholder ? "italic" : ""}`}
                  style={{ color: candidate.placeholder ? "var(--app-text-muted)" : "var(--app-text-primary)" }}
                >
                  {displayName}
                </div>
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
  items = [],
  description,
}: {
  incumbentName: string;
  party: "D" | "R" | "I";
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
      <div className="flex items-end gap-4">
        <div
          className="w-20 h-24 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
          style={{ border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
        >
          <svg viewBox="0 0 80 96" className="w-full h-full" fill="none">
            <rect width="80" height="96" fill="var(--app-tab-bg)" />
            <circle cx="40" cy="34" r="18" fill="var(--app-border)" />
            <ellipse cx="40" cy="88" rx="32" ry="22" fill="var(--app-border)" />
          </svg>
        </div>
        <div className="flex-1 flex flex-col justify-end pb-3">
          <div className="text-xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            {incumbentName}
          </div>
          <div className="text-sm font-medium" style={{ color: accentColor }}>
            {partyLabel(party)} · Incumbent
          </div>
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
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
            <div className="mt-3 rounded-lg p-3" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
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
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Election Status
      </h2>
      <div
        className="rounded-lg p-3 flex items-start gap-3"
        style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}
      >
        <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--app-text-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>
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
  const marginIsD = margin >= 0;
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
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
        Win Probability
      </h2>
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

export function PastElectionResultsSection({
  results,
  fallbackYears,
  showElectionType = true,
  showSpecialBadgeForSpecialElections = false,
  layoutClassName = "md:col-span-2",
  density = "default",
  scrollable = false,
  maxHeight,
}: {
  results?: DetailPastResult[];
  fallbackYears: number[];
  showElectionType?: boolean;
  showSpecialBadgeForSpecialElections?: boolean;
  layoutClassName?: string;
  density?: DetailDensity;
  scrollable?: boolean;
  maxHeight?: string;
}) {
  const isCompact = density === "compact";
  const rows: DetailPastResult[] =
    results && results.length > 0
      ? results
      : fallbackYears.map((year) => ({ year, demPct: 0, repPct: 0, placeholder: true }));

  return (
    <section
      className={`rounded-xl p-3 mb-0 ${(scrollable || maxHeight) ? "flex flex-col" : ""} ${layoutClassName}`}
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", ...(maxHeight ? { maxHeight } : {}) }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Past Election Results
      </h2>
      <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"} ${(scrollable || maxHeight) ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}`}>
        {rows.map((res) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          const demName = res.demCandidate ?? "Democratic Candidate";
          const repName = res.repCandidate ?? "Republican Candidate";

          return (
            <div
              key={`${res.year}-${res.demCandidate ?? ""}-${res.repCandidate ?? ""}`}
              className="rounded-lg p-2.5"
              style={{ opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  {showElectionType && res.electionType && (!showSpecialBadgeForSpecialElections || !res.electionType.toLowerCase().includes("special")) && (
                    <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{res.electionType}</span>
                  )}
                  {showElectionType && res.electionType && showSpecialBadgeForSpecialElections && res.electionType.toLowerCase().includes("special") && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                    >
                      Special
                    </span>
                  )}
                </div>
                {isPlaceholder ? (
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={winner === "D"
                      ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                      : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                  >
                    {winner}+{margin}
                  </span>
                )}
              </div>
              <div className="mb-2">
                {(() => {
                  const hasNames = isPlaceholder || res.demCandidate || res.repCandidate;
                  return hasNames ? (
                    <>
                      <div className="mb-0.5 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                          {!isPlaceholder && res.demIncumbent && (
                            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>
                          )}
                        </div>
                        <div className="flex min-w-0 items-center justify-end gap-1.5">
                          {!isPlaceholder && res.repIncumbent && (
                            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>
                          )}
                          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm leading-tight">
                        <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: isPlaceholder ? "var(--app-text-muted)" : "var(--party-dem)" }}>
                          {isPlaceholder ? "TBD" : demName}
                        </span>
                        <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                        <span className="min-w-0 flex-1 truncate text-right font-semibold" style={{ color: isPlaceholder ? "var(--app-text-muted)" : "var(--party-rep)" }}>
                          {isPlaceholder ? "TBD" : repName}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                        {res.demIncumbent && (
                          <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                      <div className="flex min-w-0 items-center justify-end gap-1.5">
                        {res.repIncumbent && (
                          <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>
                        )}
                        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className={`${isCompact ? "h-3 mb-1.5" : "h-3.5 mb-1.5"} flex rounded-full overflow-hidden`} style={{ background: "var(--app-tab-bg)" }}>
                {!isPlaceholder && (
                  <>
                    <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                    <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                  </>
                )}
              </div>
              {!isPlaceholder && (
                <>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-xs font-semibold" style={{ color: "var(--party-dem)" }}>{res.demPct}%</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--party-rep)" }}>{res.repPct}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5 gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                    {res.demVotes != null
                      ? <span className="truncate">{res.demVotes.toLocaleString()} votes</span>
                      : <span className="italic">— votes</span>
                    }
                    {res.repVotes != null
                      ? <span className="truncate text-right">{res.repVotes.toLocaleString()} votes</span>
                      : <span className="italic text-right">— votes</span>
                    }
                  </div>
                </>
              )}
            </div>
          );
        })}
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
    placeholder?: boolean;
  }[];
  density?: DetailDensity;
}) {
  const isCompact = density === "compact";

  return (
    <section
      className="rounded-xl p-3 mb-0 flex flex-col"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Recent Statewide Results
      </h2>
      <div className={`flex flex-col ${isCompact ? "gap-2.5" : "gap-3"} min-h-0 flex-1 overflow-y-auto`}>
        {results.map((res) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          return (
            <div
              key={`${res.year}-${res.race}`}
              className="rounded-lg p-2.5"
              style={{ opacity: isPlaceholder ? 0.45 : 1, background: "var(--app-bg)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>{res.race}</span>
                </div>
                {isPlaceholder ? (
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {res.stateDiff != null && (() => {
                      const diffIsD = res.stateDiff >= 0;
                      const diffAbs = Math.abs(res.stateDiff).toFixed(1);
                      return (
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={diffIsD
                            ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                            : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                          title="State Differential: district result minus statewide result"
                        >
                          {diffIsD ? "↓" : "↑"}{diffAbs}
                        </span>
                      );
                    })()}
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={winner === "D"
                        ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                        : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                    >
                      {winner}+{margin}
                    </span>
                  </div>
                )}
              </div>
              <div className="mb-2">
                {(() => {
                  const hasNames = isPlaceholder || res.demCandidate || res.repCandidate;
                  return hasNames ? (
                    <>
                      <div className="mb-0.5 flex items-center justify-between gap-3">
                        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm leading-tight">
                        {(isPlaceholder || res.demCandidate) && (
                          <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: isPlaceholder ? "var(--app-text-muted)" : "var(--party-dem)" }}>
                            {isPlaceholder ? "TBD" : res.demCandidate}
                          </span>
                        )}
                        <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                        {(isPlaceholder || res.repCandidate) && (
                          <span className="min-w-0 flex-1 truncate text-right font-semibold" style={{ color: isPlaceholder ? "var(--app-text-muted)" : "var(--party-rep)" }}>
                            {isPlaceholder ? "TBD" : res.repCandidate}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                    </div>
                  );
                })()}
              </div>
              <div className={`${isCompact ? "h-3 mb-1.5" : "h-3.5 mb-1.5"} flex rounded-full overflow-hidden`} style={{ background: "var(--app-tab-bg)" }}>
                {!isPlaceholder && (
                  <>
                    <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                    <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                  </>
                )}
              </div>
              {!isPlaceholder && (
                <>
                  <div className="flex justify-between text-xs font-semibold">
                    <span style={{ color: "var(--party-dem)" }}>{res.demPct}%</span>
                    <span style={{ color: "var(--party-rep)" }}>{res.repPct}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5 gap-3 text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                    {res.demVotes != null
                      ? <span className="truncate">{res.demVotes.toLocaleString()} votes</span>
                      : <span className="italic">— votes</span>
                    }
                    {res.repVotes != null
                      ? <span className="truncate text-right">{res.repVotes.toLocaleString()} votes</span>
                      : <span className="italic text-right">— votes</span>
                    }
                  </div>
                </>
              )}
            </div>
          );
        })}
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
