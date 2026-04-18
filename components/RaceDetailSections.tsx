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
  description: string;
};

function partyLabel(party: "D" | "R" | "I") {
  return party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
}

function partyAccent(party: "D" | "R" | "I") {
  return party === "R" ? "var(--party-rep)" : "var(--party-dem)";
}

function MarginPollRow({ label, dem, rep }: { label: string; dem?: number; rep?: number }) {
  const hasData = dem != null && rep != null;
  const demR = hasData ? Math.round(dem * 100) : null;
  const repR = hasData ? Math.round(rep * 100) : null;
  const total = hasData ? demR + repR : 0;
  const dWidth = total > 0 ? (demR! / total) * 100 : 50;
  const winner = hasData && demR! >= repR! ? "D" : "R";

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
        {hasData ? (
          <span className="text-xs font-bold" style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>
            {winner === "D" ? `D +${demR! - repR!}` : `R +${repR! - demR!}`}
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
}: {
  title: string;
  description: string;
  items: DetailInfoItem[];
}) {
  const gridColsClass =
    items.length >= 4 ? "md:grid-cols-4" : items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <section
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--app-text-primary)" }}>
        {description}
      </p>
      <div className={`grid grid-cols-2 gap-2 ${gridColsClass}`}>
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
    </section>
  );
}

export function CandidatesSection({
  candidates,
}: {
  candidates: [CandidateCardEntry, CandidateCardEntry];
}) {
  return (
    <section
      className="rounded-xl p-4 mb-4 h-full flex flex-col"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Candidates
      </h2>
      <div className="mx-auto grid w-full max-w-sm flex-1 grid-cols-2 gap-4 sm:max-w-md sm:gap-4">
        {candidates.map((candidate) => {
          const accentColor = partyAccent(candidate.party);
          const displayName = candidate.placeholder ? "TBD" : candidate.name;
          const displayParty = partyLabel(candidate.party);
          return (
            <div key={`${candidate.name}-${candidate.party}`} className="flex h-full flex-col items-center text-center w-full">
              <div
                className="w-24 h-30 rounded-lg overflow-hidden mb-2.5 flex items-center justify-center"
                style={{ border: `2px solid ${accentColor}`, background: "var(--app-tab-bg)" }}
              >
                {candidate.photo && !candidate.placeholder ? (
                  <Image
                    src={candidate.photo}
                    alt={candidate.name}
                    width={96}
                    height={120}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <svg viewBox="0 0 96 120" className="w-full h-full" fill="none">
                    <rect width="96" height="120" fill="var(--app-tab-bg)" />
                    <circle cx="48" cy="42" r="21" fill="var(--app-border)" />
                    <ellipse cx="48" cy="114" rx="38" ry="28" fill="var(--app-border)" />
                  </svg>
                )}
              </div>
              <div className="flex min-h-[3.5rem] items-start justify-center gap-1 mb-0.5">
                <div
                  className={`font-semibold text-sm leading-tight ${candidate.placeholder ? "italic" : ""}`}
                  style={{ color: candidate.placeholder ? "var(--app-text-muted)" : "var(--app-text-primary)" }}
                >
                  {displayName}
                </div>
                {candidate.incumbent && !candidate.placeholder && (
                  <span className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0" style={{ background: `${accentColor}22`, color: accentColor }}>Inc.</span>
                )}
              </div>
              <div className="text-xs font-medium mb-2" style={{ color: accentColor }}>
                {displayParty}
              </div>
              <div className="mt-auto text-2xl font-bold tabular-nums leading-none" style={{ color: accentColor }}>
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
  items,
  description,
}: {
  incumbentName: string;
  party: "D" | "R" | "I";
  items: DetailInfoItem[];
  description?: string;
}) {
  const accentColor = partyAccent(party);
  return (
    <section
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Current Incumbent
      </h2>
      <div className="flex items-start gap-4">
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
        <div className="flex-1">
          <div className="text-xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            {incumbentName}
          </div>
          <div className="text-sm font-medium mb-2" style={{ color: accentColor }}>
            {partyLabel(party)} · Incumbent
          </div>
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
  showPolls = true,
}: {
  margin: number;
  demPct: number;
  repPct: number;
  rcpDem?: number;
  rcpRep?: number;
  polyDem?: number;
  polyRep?: number;
  showPolls?: boolean;
}) {
  const marginIsD = margin >= 0;

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
        Projected Margin
      </h2>
      <div className="text-3xl font-bold mb-3" style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}>
        {marginIsD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
      </div>
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
        Win Probability
      </h2>
      <div className="flex justify-between text-sm font-semibold mb-2">
        <span style={{ color: "var(--party-dem)" }}>Dem {demPct}%</span>
        <span style={{ color: "var(--party-rep)" }}>Rep {repPct}%</span>
      </div>
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        <div style={{ width: `${demPct}%`, background: "#1b408c" }} className="transition-all duration-300" />
        <div style={{ width: `${repPct}%`, background: "#be1c29" }} className="transition-all duration-300" />
      </div>
      {showPolls && (
        <>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
            Polls
          </h2>
          <div className="flex flex-col gap-3">
            <MarginPollRow label="RCP Average" dem={rcpDem} rep={rcpRep} />
            <MarginPollRow label="Polymarket" dem={polyDem} rep={polyRep} />
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
}: {
  results?: DetailPastResult[];
  fallbackYears: number[];
  showElectionType?: boolean;
  showSpecialBadgeForSpecialElections?: boolean;
  layoutClassName?: string;
}) {
  const rows: DetailPastResult[] =
    results && results.length > 0
      ? results
      : fallbackYears.map((year) => ({ year, demPct: 0, repPct: 0, placeholder: true }));

  return (
    <section
      className={`rounded-xl p-4 ${layoutClassName}`}
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Past Election Results
      </h2>
      <div className="flex flex-col gap-4">
        {rows.map((res) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          const demName = res.demCandidate ?? "Democratic Candidate";
          const repName = res.repCandidate ?? "Republican Candidate";

          return (
            <div key={`${res.year}-${res.demCandidate ?? ""}-${res.repCandidate ?? ""}`} style={{ opacity: isPlaceholder ? 0.45 : 1 }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{res.year}</span>
                {isPlaceholder ? (
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : (
                  <>
                    {showElectionType && res.electionType && (
                      showSpecialBadgeForSpecialElections && res.electionType.toLowerCase().includes("special")
                        ? (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                          >
                            Special
                          </span>
                        )
                        : <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{res.electionType}</span>
                    )}
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={winner === "D"
                        ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                        : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                    >
                      {winner}+{margin}
                    </span>
                  </>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-2">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                    {!isPlaceholder && res.demIncumbent && (
                      <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>Inc.</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                    {isPlaceholder ? "TBD" : demName}
                  </span>
                </div>
                <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                <div className="flex flex-col items-end min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!isPlaceholder && res.repIncumbent && (
                      <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>Inc.</span>
                    )}
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                  </div>
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                    {isPlaceholder ? "TBD" : repName}
                  </span>
                </div>
              </div>
              <div className="flex h-3.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                {!isPlaceholder && (
                  <>
                    <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                    <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                  </>
                )}
              </div>
              {!isPlaceholder && (
                <>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold" style={{ color: "var(--party-dem)" }}>{res.demPct}%</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--party-rep)" }}>{res.repPct}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    {res.demVotes != null
                      ? <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{res.demVotes.toLocaleString()} votes</span>
                      : <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>— votes</span>
                    }
                    {res.repVotes != null
                      ? <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{res.repVotes.toLocaleString()} votes</span>
                      : <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>— votes</span>
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
}: {
  results?: {
    year: number;
    race: string;
    demPct: number;
    repPct: number;
    demCandidate?: string;
    repCandidate?: string;
    placeholder?: boolean;
  }[];
}) {
  return (
    <section
      className="rounded-xl p-4 md:col-span-2"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        Recent Statewide Results
      </h2>
      <div className="flex flex-col gap-4">
        {results.map((res) => {
          const isPlaceholder = !!res.placeholder;
          const winner = res.demPct > res.repPct ? "D" : "R";
          const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
          const total = res.demPct + res.repPct;
          const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
          return (
            <div key={`${res.year}-${res.race}`} style={{ opacity: isPlaceholder ? 0.45 : 1 }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{res.year} {res.race}</span>
                {isPlaceholder ? (
                  <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Data TBD</span>
                ) : (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={winner === "D"
                      ? { background: "var(--party-dem-subtle)", color: "var(--party-dem)" }
                      : { background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}
                  >
                    {winner}+{margin}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs mb-0.5" style={{ color: "var(--app-text-muted)" }}>Democrat</span>
                  {(isPlaceholder || res.demCandidate) && (
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                      {isPlaceholder ? "TBD" : res.demCandidate}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>vs.</span>
                <div className="flex flex-col items-end min-w-0">
                  <span className="text-xs mb-0.5" style={{ color: "var(--app-text-muted)" }}>Republican</span>
                  {(isPlaceholder || res.repCandidate) && (
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                      {isPlaceholder ? "TBD" : res.repCandidate}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex h-3.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--app-tab-bg)" }}>
                {!isPlaceholder && (
                  <>
                    <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                    <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                  </>
                )}
              </div>
              {!isPlaceholder && (
                <>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold" style={{ color: "var(--party-dem)" }}>{res.demPct}%</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--party-rep)" }}>{res.repPct}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD votes</span>
                    <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD votes</span>
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

export function HouseOnlyDistrictBoundariesSection({
  entries,
}: {
  entries: HouseBoundaryHistoryEntry[];
}) {
  return (
    <section
      className="rounded-xl p-4 md:col-span-2"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--app-text-muted)" }}>
        District Boundaries
      </h2>
      <div className="mb-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--app-text-muted)" }}>
          Change History
        </div>
        {entries.length === 0 ? (
          <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
            No redistricting changes recorded for this district.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {entries.map((entry, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div
                  className="shrink-0 text-xs font-semibold tabular-nums rounded px-2 py-1 mt-0.5"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", minWidth: 56, textAlign: "center" }}
                >
                  {entry.year}
                </div>
                <div className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
                  {entry.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
