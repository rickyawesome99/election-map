import Link from "next/link";
import CandidateLink from "@/components/CandidateLink";
import type { ProjectedRaceResult } from "@/lib/countyProjection";

// A 2026 race's projected vote: the county projection (lib/countyProjection.ts) added up. The
// margin is the forecast's, the total is the turnout estimate's, and the third-party share is the
// counties' 2024 presidential one, so every number here is downstream of those two models.

type Party = "D" | "R" | "I";

const partyColor = (p: Party) => (p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : "var(--party-dem)");
const partyFill = (p: Party) => (p === "R" ? "var(--party-rep-fill)" : p === "I" ? "var(--party-ind-fill)" : "var(--party-dem-fill)");
const partyName = (p: Party) => (p === "R" ? "Republican" : p === "I" ? "Independent" : "Democratic");
const PLACEHOLDER = /^(Democratic|Republican|Generic) (Candidate|Democrat|Republican)$|^TBD$|^(Democrat|Republican)$/i;
const fmtInt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

export default function ProjectedVoteSection({ p }: { p: ProjectedRaceResult }) {
  const decided = p.contest === "uncontested-D" || p.contest === "uncontested-R";
  // Two nominees of one party: the forecast only says the party keeps the seat, not which of them
  // wins, so the section shows the electorate but no split between them.
  const sameParty = p.contest === "same-party-D" || p.contest === "same-party-R";
  // R-positive margin → the label of the side it favours: its party, or, in a same-party contest, its candidate.
  const sideLabel = (m: number) => (m > 0 ? p.repParty : p.demParty);
  const sideColor = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : partyColor(m > 0 ? p.repParty : p.demParty));
  const fmtM = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${sideLabel(m)}+${Math.abs(m).toFixed(1)}`);

  const cands = [
    { name: p.demName, party: p.demParty, votes: p.demVotes, share: p.shares.dem },
    { name: p.repName, party: p.repParty, votes: p.repVotes, share: p.shares.rep },
  ].filter((c) => !decided || c.votes > 0).sort((a, b) => b.votes - a.votes);
  const margin = p.shares.rep - p.shares.dem;
  const netVotes = Math.abs(p.repVotes - p.demVotes);
  const [lo80, hi80] = p.interval80;
  const prior = p.turnout.prior?.votes != null ? { year: p.turnout.prior.year, votes: p.turnout.prior.votes } : null;
  const change = prior ? pct(p.votes - prior.votes, prior.votes) : null;

  return (
    <div>
      {sameParty ? (
        <p className="text-sm" style={{ color: "var(--app-text-primary)" }}>
          Both nominees are {p.demParty === "R" ? "Republicans" : "Democrats"}, so the seat stays {partyName(p.demParty)} either way. The forecast doesn&apos;t split the vote between {p.demName} and {p.repName}; the electorate below is the 2026 turnout estimate.
        </p>
      ) : (<>
      <div className="flex h-3.5 overflow-hidden rounded-sm" style={{ background: "var(--map-unfilled)" }} aria-hidden="true">
        <span style={{ width: `${pct(p.demVotes, p.votes)}%`, background: partyFill(p.demParty) }} />
        {p.othVotes > 0 && <span style={{ width: `${pct(p.othVotes, p.votes)}%`, background: "var(--party-ind-fill)", opacity: 0.5 }} />}
        <span style={{ width: `${pct(p.repVotes, p.votes)}%`, background: partyFill(p.repParty) }} />
      </div>

      <div className="mt-2">
        {cands.map((c) => {
          const color = partyColor(c.party);
          return (
            <div key={c.name} className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto", borderBottom: "1px solid var(--app-border)" }}>
              <span className="h-8 rounded-sm" style={{ background: color }} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" style={{ color }}>
                  {PLACEHOLDER.test(c.name.trim()) ? c.name : <CandidateLink name={c.name} className="hover:underline">{c.name}</CandidateLink>}
                </div>
                <div className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>{partyName(c.party)}{decided && c.votes > 0 ? " · Unopposed" : ""}</div>
              </div>
              <div className="text-right tabular-nums" style={{ color }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.1 }}>{fmtInt(c.votes)}</div>
                <div className="text-[11px]">{c.share.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
        {p.othVotes > 0 && (
          <div className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto", borderBottom: "1px solid var(--app-border)" }}>
            <span className="h-6 rounded-sm" style={{ background: "var(--party-ind)", opacity: 0.6 }} />
            <div className="text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Others</div>
            <div className="text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              <div className="text-sm font-bold">{fmtInt(p.othVotes)}</div>
              <div className="text-[11px]">{p.shares.oth.toFixed(1)}%</div>
            </div>
          </div>
        )}
      </div>

      </>)}

      <div className={`mt-3 grid gap-3 ${sameParty ? "grid-cols-2" : "grid-cols-3"}`}>
        {!sameParty && <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
          <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Margin</div>
          <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: sideColor(margin) }}>{decided ? "Unopposed" : fmtM(margin)}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {fmtInt(netVotes)} votes{!decided && <><br />80%: {fmtM(lo80)} to {fmtM(hi80)}</>}
          </div>
        </div>}
        <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
          <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Total votes</div>
          <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{fmtInt(p.votes)}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>range {fmtInt(p.turnout.low)}–{fmtInt(p.turnout.high)}</div>
        </div>
        <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
          <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Turnout</div>
          <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{p.turnout.rate != null ? `${p.turnout.rate.toFixed(1)}%` : "—"}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            of eligible voters{prior && change != null ? <><br />{change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(1)}% vs {fmtInt(prior.votes)} in {prior.year}</> : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        {sameParty
          ? "The total is the 2026 turnout estimate."
          : decided
          ? "Only one candidate is on the ballot, so every projected vote goes to them. The total is the 2026 turnout estimate, figured as if the seat were contested."
          : <>The forecast margin applied to the 2026 turnout estimate, county by county, with each county&apos;s 2024 third-party share set aside for other candidates.</>}{" "}
        <Link href="/methodology/turnout#county-results" className="underline underline-offset-2">How this is built</Link>.
      </p>
    </div>
  );
}
