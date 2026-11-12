import Link from "next/link";
import type { ReactNode } from "react";
import { CandidatesLedgerSection } from "@/components/RaceDetailSections";
import type { RaceResult2026 } from "@/lib/raceResults2026";

// A 2026 race's counted result (lib/raceResults2026.ts): the race pages' section that held the
// projected vote before the election. Same rows and map; the numbers are the saved post-election
// counts. The projection it replaced is archived in data/forecast-final-2026/.

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

const decidedContest = (r: RaceResult2026) => r.contest === "uncontested-D" || r.contest === "uncontested-R";
/** Called for a person, not just a party (a same-party final can be called for the party first). */
export const resultCalled = (r: RaceResult2026) => r.called && r.candidates.some((c) => c.winner);

const partyColor = (p: RaceResult2026["candidates"][number]["party"]) => (p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : "var(--party-dem)");

/** The leader's margin over the runner-up, in points of all votes, named for the leader: their party
 *  ("R+6.9"), or their surname when both lead candidates share a party (a top-two final). "EVEN" only
 *  on equal counts; null with one candidate or no count. */
function leadMargin(r: RaceResult2026): { label: string; color: string } | null {
  // Alaska's ranked-choice count pools a party's candidates, so its margin is the slots' blocs.
  if (r.rcv && (r.bloc.dem || r.bloc.rep) && r.slotMargin != null && r.slotMargin !== 0) {
    const p = r.slotMargin > 0 ? r.repParty : r.demParty;
    return { label: `${p}+${Math.abs(r.slotMargin).toFixed(1)}`, color: partyColor(p) };
  }
  const [a, b] = r.candidates;
  if (!a || !b || r.total <= 0) return null;
  const pts = ((a.votes - b.votes) / r.total) * 100;
  if (a.votes === b.votes) return { label: "EVEN", color: "var(--app-text-primary)" };
  const who = a.party === b.party ? `${a.name.split(" ").pop()} ` : a.party;
  return { label: `${who}+${pts.toFixed(1)}`, color: partyColor(a.party) };
}

/** The section head's meta line: the count, the leader's margin, how much of the expected vote is in, and the call. */
export function electionResultMeta(r: RaceResult2026): ReactNode {
  if (r.total <= 0) return decidedContest(r) ? "Unopposed · no count printed" : "No votes counted yet";
  const lead = leadMargin(r);
  const parts = [];
  if (r.countedShare > 0 && r.countedShare < 0.995) parts.push(`about ${Math.round(r.countedShare * 100)}% counted`);
  if (!resultCalled(r)) parts.push("not yet called");
  return (
    <>
      {fmtInt(r.total)} votes
      {lead && <> · <span className="font-semibold" style={{ color: lead.color }}>{lead.label}</span></>}
      {parts.map((t) => ` · ${t}`).join("")}
    </>
  );
}

export function ElectionResultFootnote({ r, house = false }: { r: RaceResult2026; house?: boolean }) {
  const partyAdj = (p: string) => (p === "R" ? "Republican" : "Democratic");
  const blocNote = r.bloc.dem && r.bloc.rep ? " The map counts each party's candidates together."
    : r.bloc.rep ? ` The map counts every ${partyAdj(r.repParty)} candidate together.`
    : r.bloc.dem ? ` The map counts every ${partyAdj(r.demParty)} candidate together.` : "";
  return (
    <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
      {r.total <= 0
        ? "The only candidate on the ballot; the state prints no count for an unopposed race."
        : <>Votes counted as of {fmtDate(r.asOf)}{house ? ", by the district's part of each county" : ", by county"}, from the <a href="https://civicapi.org" className="underline underline-offset-2" target="_blank" rel="noreferrer">civicAPI</a> feed. Unofficial until certified.</>}
      {r.total > 0 ? blocNote : ""}
      {r.called && !resultCalled(r) ? ` The seat is called for the ${r.winnerParty === "R" ? "Republicans" : "Democrats"}; the race between the two finalists is not.` : ""}{" "}
      <Link href="/analysis/post-election" className="underline underline-offset-2" prefetch={false}>All results</Link>.
    </p>
  );
}

type SlotInfo = { photo?: string | null; incumbent?: boolean };

/** The candidate rows: the slot candidates with their portraits, any other candidate at MIN_OWN_ROW_PCT, then everyone else. */
export default function ElectionResultSection({ r, state, dem, rep }: { r: RaceResult2026; state?: string; dem?: SlotInfo; rep?: SlotInfo }) {
  const rows = r.candidates.map((c) => {
    const slot = c.slot === "dem" ? dem : c.slot === "rep" ? rep : undefined;
    return {
      name: c.name, state, party: c.party, partyName: c.partyLabel,
      incumbent: slot?.incumbent, photo: slot?.photo ?? null,
      // An unopposed race with no count printed: the one candidate has the whole (uncounted) vote.
      pct: r.total > 0 ? Math.round(c.pct * 10) / 10 : 100,
      votes: r.total > 0 ? c.votes : undefined,
      winner: c.winner,
      // Over/under the final forecast's projected share, in points.
      vsProjected: r.total > 0 && c.projectedPct != null ? c.pct - c.projectedPct : undefined,
    };
  });
  return (
    <div>
      <CandidatesLedgerSection compact candidates={rows} />
      {r.others.votes > 0 && (
        <div className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto", borderBottom: "1px solid var(--app-border)", borderTop: "1px solid var(--app-border)" }}>
          <span className="h-6 rounded-sm" style={{ background: "var(--party-ind)", opacity: 0.6 }} />
          <div className="text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Others</div>
          <div className="text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{r.others.pct.toFixed(1)}%</div>
            <div className="text-[11px]">{fmtInt(r.others.votes)} votes</div>
          </div>
        </div>
      )}
    </div>
  );
}
