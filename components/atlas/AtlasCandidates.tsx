"use client";
import Link from "next/link";

import Image from "next/image";
import type { AtlasDistrict, AtlasRace2026, AtlasResult2026, AtlasResultCandidate2026 } from "@/lib/stateLegAtlas";
import { FundraisingLedgerSection, formatReceipts } from "@/components/FundraisingLedger";
import { contest2026, fieldPersons, personKey, projectedNomineeShare } from "@/lib/stateLegAtlas";
import { candidateSlug } from "@/lib/candidateSlug";

type Party = "D" | "R" | "I" | "O";

export const PARTY_COLOR: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)", O: "var(--party-ind)" };
const partyName = (p: Party, label?: string) => (p === "D" ? "Democrat" : p === "R" ? "Republican" : label ? label.replace(/ Party$/, "") : "Independent");

const NON_CANDIDATE = /write.?in|scatter|blank|void|under.?vote|over.?vote|none of/i;

/** Every named person links to their candidate page (/candidates/[name]-[st], any spelling resolves). */
export function CandidateLink({ name, abbr, color, weight, style }: { name: string; abbr: string; color: string; weight?: number; style?: React.CSSProperties }) {
  if (NON_CANDIDATE.test(name) || name.trim().length < 3) return <span style={{ color, fontWeight: weight, ...style }}>{name}</span>;
  return <Link prefetch={false} href={`/candidates/${candidateSlug(name)}-${abbr.toLowerCase()}`} className="hover:underline" style={{ color, fontWeight: weight, ...style }}>{name}</Link>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
      {children}
    </span>
  );
}

/** Framed square portrait, as on the House pages' candidate rows; party placeholder art (no state-leg photos on file). */
function Portrait({ party }: { party: Party }) {
  return (
    <div
      className="shrink-0 overflow-hidden flex items-center justify-center"
      style={{ width: "5.25rem", height: "5.25rem", borderRadius: "14px", border: `3px solid ${PARTY_COLOR[party]}`, background: "var(--app-tab-bg)" }}
    >
      {party === "R" ? (
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
  );
}

/**
 * The district's 2026 field as portrait rows, mirroring the House pages' Candidates section. Where the
 * race has one nominee per party, each row carries its projected votes and share of all votes cast;
 * where only a two-party margin applies (a post, several nominees of one party), the two-party share.
 */
export function AtlasCandidatesSection({ district, abbr }: { district: AtlasDistrict; abbr: string }) {
  const field = district.candidates2026;
  if (!field) return null;
  const c = contest2026(field, district.incumbents)!;
  const pr = district.projection;
  const margin = pr?.contest === "contested" ? pr.margin : null;
  const canceled = field.candidates.some((x) => x.canceledGeneral);
  // One row per person: a fusion nominee (Oregon, Vermont, New York) holds several lines.
  const persons = fieldPersons(field, district.incumbents);
  const g = pr?.guaranteed ?? { dem: 0, rep: 0 };
  const guaranteedPills = [g.dem ? `${g.dem} Democratic seat${g.dem > 1 ? "s" : ""} decided by the field` : "", g.rep ? `${g.rep} Republican seat${g.rep > 1 ? "s" : ""} decided by the field` : ""].filter(Boolean);

  // Idaho's seat A/B and Washington's position 1/2 are separate races inside one district.
  const posts = [...new Set(persons.map((x) => x.post ?? ""))];
  const groups = posts.map((post) => ({ post, cands: persons.filter((x) => (x.post ?? "") === post) }));

  const votes = pr?.votes;

  return (
    <div>
      {field.special && (
        <p className="mb-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{c.special === "post" ? "Includes a special election" : "Special election"}</span>
          {" "}for the rest of the term, through {field.special.termEnds}{field.special.vacancy ? ` — ${field.special.vacancy.replace(/\.$/, "")}` : ""}.
        </p>
      )}
      {(c.open && field.candidates.length > 0) || c.status === "uncontested-D" || c.status === "uncontested-R" || canceled || pr?.indep || guaranteedPills.length ? (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {c.open && field.candidates.length > 0 && <Pill>Open seat</Pill>}
          {c.status === "uncontested-D" && <Pill>No Republican</Pill>}
          {c.status === "uncontested-R" && <Pill>No Democrat</Pill>}
          {guaranteedPills.map((t) => <Pill key={t}>{t}</Pill>)}
          {pr?.indep && <Pill>{pr.indep.name}: modeled in the {pr.indep.slot === "D" ? "Democrats'" : "Republicans'"} place{pr.indep.endorsedBy ? ` (${pr.indep.endorsedBy}-backed)` : ""}</Pill>}
          {canceled && <Pill>General canceled</Pill>}
        </div>
      ) : null}
      {field.candidates.length === 0 && <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>No candidates listed yet.</p>}
      {groups.map(({ post, cands }) => (
        <div key={post || "all"}>
          {(post || posts.length > 1) && (
            <div className="pt-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
              {post === "Special" ? "Special election (unexpired term)" : post === "" ? "Regular election" : abbr === "ID" ? `Seat ${post}` : `Position ${post}`}
            </div>
          )}
          {cands
            // Leader first, as on the House pages: by projected votes (or share), highest first; a
            // candidate with no projection keeps the ballot order after those that have one.
            .map((x, idx) => ({ x, idx, p: projectedNomineeShare(x, cands, posts.length > 1, margin, votes) }))
            .sort((a, b) => (b.p?.votes ?? b.p?.share ?? -1) - (a.p?.votes ?? a.p?.share ?? -1) || a.idx - b.idx)
            .map(({ x, p }, i) => {
            const color = PARTY_COLOR[x.party];
            const share = p?.share ?? null;
            const v = p?.votes != null ? { votes: p.votes } : null;
            return (
              <div
                key={`${x.name}-${i}`}
                className="vh-row flex items-center justify-between gap-3 py-2.5"
                style={{ borderBottom: i === cands.length - 1 ? "none" : "1px solid var(--app-border)", animationDelay: `${Math.min(i, 8) * 55}ms` }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Portrait party={x.party} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CandidateLink name={x.name} abbr={abbr} color={color} weight={700} style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem" }} />
                      {x.incumbent && <span className="text-[10px] font-semibold px-1.5 py-0.5 shrink-0" style={{ color }}>Inc.</span>}
                      {x.writeIn && <Pill>Write-in</Pill>}
                    </div>
                    <div className="text-sm font-medium" style={{ color }}>{partyName(x.party, x.partyLabel)}{x.lines.length > 1 && <span className="font-normal" style={{ color: "var(--app-text-very-muted)" }}> · {x.lines.length} ballot lines{x.lines.includes("D") && x.lines.includes("R") ? " (Democratic and Republican)" : ""}</span>}</div>
                  </div>
                </div>
                {share != null && (
                  <div className="shrink-0 text-right tabular-nums" style={{ color }}>
                    <div className="vh-margin text-3xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{share === 0 || share === 100 ? String(share) : share.toFixed(1)}%</div>
                    {v ? (
                      <div className="text-sm font-medium">{v.votes.toLocaleString("en-US")} votes</div>
                    ) : (
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text-very-muted)" }}>projected</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── The counted 2026 election (lib/stateLegResults2026.ts) ────────────────────
// The section that held the projected vote before the election, in the House race pages' form:
// candidates by votes, a check on a called winner, each share against the projected one.

/** A candidate outside the two major parties gets a row of their own from this share of the vote. */
const MIN_OWN_ROW_PCT = 5;
const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtPct = (pct: number) => (pct === 0 || pct === 100 ? String(pct) : pct.toFixed(1));

/** The leader's margin over the runner-up in points of all votes, named for the leader: their party
 *  ("R+6.9"), or their surname when the top two share one. "EVEN" only on equal counts; null with
 *  one candidate, no count, or a race for several seats. */
function leadMargin(r: AtlasRace2026): { label: string; color: string } | null {
  const [a, b] = r.candidates;
  if (r.seats !== 1 || !a || !b || r.total <= 0 || a.votes == null || b.votes == null) return null;
  if (a.votes === b.votes) return { label: "EVEN", color: "var(--app-text-primary)" };
  const pts = ((a.votes - b.votes) / r.total) * 100;
  const who = a.party === b.party ? `${a.name.split(" ").pop()} ` : a.party === "O" ? "I" : a.party;
  return { label: `${who}+${pts.toFixed(1)}`, color: PARTY_COLOR[a.party] };
}

/** One race's meta line: the count, the leader's margin, how much of the expected vote is in, and the call. */
function raceMeta(r: AtlasRace2026): React.ReactNode {
  if (r.total <= 0) return r.candidates.length <= r.seats ? "Unopposed · no count printed" : "No votes counted yet";
  const lead = leadMargin(r);
  const parts: string[] = [];
  if (r.seats > 1) parts.push(`${r.seats} seats`);
  if (r.counted != null && r.counted > 0 && r.counted < 0.995) parts.push(`about ${Math.round(r.counted * 100)}% counted`);
  if (!r.called) parts.push("not yet called");
  return (
    <>
      {fmtInt(r.total)} votes
      {lead && <> · <span className="font-semibold" style={{ color: lead.color }}>{lead.label}</span></>}
      {parts.map((t) => ` · ${t}`).join("")}
    </>
  );
}

/** The 2026 Election section head's meta: the race's own line, or the district's total where it held several races. */
export function result2026Meta(res: AtlasResult2026): React.ReactNode {
  if (res.races.length === 1) return raceMeta(res.races[0]);
  const total = res.races.reduce((s, r) => s + r.total, 0);
  return `${total > 0 ? `${fmtInt(total)} votes · ` : ""}${res.races.length} races`;
}

/** A counted share against the projected one: ▲ over, ▼ under, in points. */
function VsProjected({ pts }: { pts: number }) {
  const r = Math.round(pts * 10) / 10;
  const arrow = r > 0 ? "▲" : r < 0 ? "▼" : "";
  return (
    <span className="text-sm font-semibold" style={{ opacity: 0.75 }} title={`${r > 0 ? "Over" : r < 0 ? "Under" : "Matched"} the final projection's share by ${Math.abs(r).toFixed(1)} points`}>
      {arrow}{Math.abs(r).toFixed(1)}%
    </span>
  );
}

function ResultRow({ c, abbr, last, i, soleUncounted, vsProjected }: { c: AtlasResultCandidate2026; abbr: string; last: boolean; i: number; soleUncounted: boolean; vsProjected: number | null }) {
  const color = PARTY_COLOR[c.party];
  // An unopposed race with no count printed: the one candidate has the whole (uncounted) vote.
  const pct = c.pct ?? (soleUncounted ? 100 : null);
  return (
    <div className="vh-row flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: last ? "none" : "1px solid var(--app-border)", animationDelay: `${Math.min(i, 8) * 55}ms` }}>
      <div className="flex items-center gap-4 min-w-0">
        <Portrait party={c.party} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CandidateLink name={c.name} abbr={abbr} color={color} weight={700} style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem" }} />
            {c.incumbent && <span className="text-[10px] font-semibold px-1.5 py-0.5 shrink-0" style={{ color }}>Inc.</span>}
            {c.winner && (
              <svg viewBox="0 0 16 16" width="18" height="18" className="shrink-0" role="img" aria-label="Winner">
                <title>Winner</title>
                <circle cx="8" cy="8" r="8" fill={color} />
                <path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="var(--app-bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="text-sm font-medium" style={{ color }}>{partyName(c.party, c.partyLabel)}</div>
        </div>
      </div>
      {pct != null && (
        <div className="shrink-0 text-right tabular-nums" style={{ color }}>
          <div className="flex items-baseline justify-end gap-2">
            {vsProjected != null && <VsProjected pts={vsProjected} />}
            <div className="vh-margin text-3xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{fmtPct(pct)}%</div>
          </div>
          {c.votes != null && <div className="text-sm font-medium">{fmtInt(c.votes)} votes</div>}
        </div>
      )}
    </div>
  );
}

/**
 * The district's counted 2026 race(s): one row per candidate, most votes first, with a check on a
 * called winner and each share set against the final projection's where it projected one nominee
 * per party. A candidate of neither major party under MIN_OWN_ROW_PCT joins the write-ins in "Others".
 */
export function AtlasResultSection({ district, abbr }: { district: AtlasDistrict; abbr: string }) {
  const res = district.result2026;
  if (!res) return null;
  const field = district.candidates2026;
  const c = field ? contest2026(field, district.incumbents) : null;
  const pr = district.projection;
  const persons = field ? fieldPersons(field, district.incumbents) : [];
  const multiPost = new Set(persons.map((x) => x.post ?? "")).size > 1;
  /** The final projection's share of all votes for this person, where it split the vote by nominee. */
  const projected = (name: string, race: AtlasRace2026): number | null => {
    if (race.seats !== 1 || res.races.length !== 1 || race.total <= 0) return null;
    const x = persons.find((p) => personKey(p.name) === personKey(name));
    const p = x ? projectedNomineeShare(x, persons, multiPost, pr?.contest === "contested" ? pr.margin : null, pr?.votes) : null;
    return p && p.votes != null ? p.share : null;
  };
  const sources = [...new Set(res.races.map((r) => r.source))];
  const unofficialAp = res.races.some((r) => r.unofficial);
  const anyCount = res.races.some((r) => r.total > 0);
  const asOf = res.asOf ? new Date(res.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : null;

  return (
    <div>
      {field?.special && c && (
        <p className="mb-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{c.special === "post" ? "Includes a special election" : "Special election"}</span>
          {" "}for the rest of the term, through {field.special.termEnds}{field.special.vacancy ? ` — ${field.special.vacancy.replace(/\.$/, "")}` : ""}.
        </p>
      )}
      {res.races.map((race, ri) => {
        const shown = race.candidates.filter((x) => x.party !== "O" || x.winner || (x.pct ?? 0) >= MIN_OWN_ROW_PCT || race.total <= 0);
        const rest = race.candidates.filter((x) => !shown.includes(x)).reduce((s, x) => s + (x.votes ?? 0), 0) + race.others;
        const soleUncounted = race.total <= 0 && race.candidates.length <= race.seats;
        return (
          <div key={`${race.post ?? ""}-${ri}`}>
            {res.races.length > 1 && (
              <div className="pt-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  {race.special ? "Special election (unexpired term)" : race.post == null ? "Regular election" : abbr === "ID" ? `Seat ${race.post}` : `Position ${race.post}`}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{raceMeta(race)}</span>
              </div>
            )}
            {shown.map((x, i) => {
              const proj = projected(x.name, race);
              return <ResultRow key={`${x.name}-${i}`} c={x} abbr={abbr} i={i} last={i === shown.length - 1 && rest <= 0} soleUncounted={soleUncounted} vsProjected={proj != null && x.pct != null ? x.pct - proj : null} />;
            })}
            {rest > 0 && race.total > 0 && (
              <div className="grid items-center gap-x-3 py-2" style={{ gridTemplateColumns: "4px minmax(0,1fr) auto", borderTop: "1px solid var(--app-border)" }}>
                <span className="h-6 rounded-sm" style={{ background: "var(--party-ind)", opacity: 0.6 }} />
                <div className="text-[13px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Others</div>
                <div className="text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{((rest / race.total) * 100).toFixed(1)}%</div>
                  <div className="text-[11px]">{fmtInt(rest)} votes</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        {!anyCount
          ? "No count is on file for this race: the state prints none for an unopposed seat, or the count has not been read yet."
          : <>Votes counted{asOf ? ` as of ${asOf}` : ""}, from {unofficialAp ? "the Associated Press's count (no official count read yet)" : sources.join(" and ")}. Unofficial until certified.</>}
      </p>
    </div>
  );
}

/** Cycle-to-date contributions for the 2026 field as one split bar (D left, R right), matching the federal race pages. */
export function AtlasFundraisingSection({ district, electionYear }: { district: AtlasDistrict; electionYear: number }) {
  const m = district.money?.find((x) => x.year === electionYear);
  if (!m) {
    return <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Fundraising TBD — no {electionYear} campaign-finance records on file for this state yet.</p>;
  }
  const footnote = <>Contributions per {m.source}, through {m.dataThrough ?? "the latest report"}.</>;
  const sideOrder: Record<string, number> = { D: 0, I: 1, O: 1, R: 2 };
  const rows = [...m.candidates].sort((a, b) => sideOrder[a.party] - sideOrder[b.party] || (b.contributions ?? -1) - (a.contributions ?? -1));
  const money = district.projection?.money ?? null;
  const gapNote = m.gapPct != null ? <> That is a {Math.abs(m.gapPct).toFixed(0)}-point gap in two-party money.</> : null;

  // One Democrat against one Republican, both with money on file: the House race page's section,
  // with the seat's money term (lib/stateLegMoneyModel.ts, R-positive like the House's) and its typical gap.
  const dRow = rows.length === 2 && rows[0].party === "D" ? rows[0] : null;
  const rRow = rows.length === 2 && rows[1].party === "R" ? rows[1] : null;
  if (dRow && rRow && dRow.matched && rRow.matched) {
    return (
      <FundraisingLedgerSection
        dem={dRow.contributions ?? 0}
        rep={rRow.contributions ?? 0}
        demName={dRow.name}
        repName={rRow.name}
        fundraisingPts={money?.pts ?? null}
        typicalGapPct={money?.structuralGapPct ?? null}
        footnote={footnote}
        animateBar
        summaryExtra={gapNote}
      />
    );
  }

  // Any other field (a multi-member seat, an independent, a candidate with no filings found): the
  // same type and bar, one figure per candidate.
  const total = rows.reduce((s, r) => s + (r.matched ? r.contributions ?? 0 : 0), 0);
  const shareOf = (r: (typeof rows)[number]) => (r.matched && total > 0 ? ((r.contributions ?? 0) / total) * 100 : null);
  const lead = m.demTotal != null && m.repTotal != null && m.demTotal !== m.repTotal ? (m.demTotal > m.repTotal ? "D" : "R") : null;
  const twoSided = rows.length === 2;

  return (
    <div>
      <div className={twoSided ? "flex items-end justify-between gap-6" : "flex flex-wrap gap-x-8 gap-y-3"}>
        {rows.map((r, i) => {
          const share = shareOf(r);
          const right = twoSided && i === 1;
          return (
            <div key={`${r.name}-${i}`} className={`min-w-0 ${right ? "text-right" : ""}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--app-text-muted)" }}>{r.name} ({r.party === "O" ? "I" : r.party})</div>
              <div className="mt-1 flex items-baseline gap-2 tabular-nums" style={{ justifyContent: right ? "flex-end" : "flex-start" }}>
                {r.matched ? (
                  <span style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(1.6rem, 4vw, 1.9rem)", lineHeight: 1, color: PARTY_COLOR[r.party] }}>{formatReceipts(r.contributions ?? 0)}</span>
                ) : (
                  <span className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>no filings found</span>
                )}
                {share != null && <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{share.toFixed(0)}%</span>}
              </div>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <div className="relative mt-4" style={{ height: 22 }}>
          <div className="absolute inset-x-0 flex overflow-hidden rounded-full" style={{ top: 7, height: 8, background: "var(--app-tab-bg)" }}>
            {rows.map((r, i) => {
              const share = shareOf(r);
              // The race pages' vote bar motion: the first side grows from the left, the last from the right.
              return share ? <div key={`${r.name}-${i}`} className={i === rows.length - 1 && i > 0 ? "vh-bar-r" : "vh-bar-d"} title={`${r.name}: ${formatReceipts(r.contributions ?? 0)}`} style={{ width: `${share}%`, background: PARTY_COLOR[r.party], borderLeft: i > 0 ? "1px solid var(--app-bg)" : undefined, animationDelay: "120ms" }} /> : null;
            })}
          </div>
          <div className="absolute" style={{ left: "50%", top: 0, height: 22, borderLeft: "1px dashed var(--app-text-very-muted)" }} />
        </div>
      )}
      <p className="mt-3 text-sm" style={{ lineHeight: 1.5, color: "var(--app-text-muted)", textWrap: "pretty" }}>
        <b className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{formatReceipts(total)}</b> raised in all
        {m.demTotal != null && m.repTotal != null && (lead
          ? <>; {lead === "D" ? "Democrats" : "Republicans"} lead by <b className="tabular-nums" style={{ color: PARTY_COLOR[lead] }}>{formatReceipts(Math.abs(m.demTotal - m.repTotal))}</b></>
          : <>; the parties have raised the same amount</>)}
        .
        {gapNote}
        {money && (Math.abs(money.pts) < 0.05
          ? <> Measured against the typical split for a race like this, it moves the forecast by no points.</>
          : <> Measured against the typical split for a race like this, the forecast counts it as <b className="tabular-nums" style={{ color: PARTY_COLOR[money.pts > 0 ? "R" : "D"] }}>{money.pts > 0 ? "R" : "D"}+{Math.abs(money.pts).toFixed(1)}</b>.</>)}
      </p>
      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{footnote}</p>
    </div>
  );
}
