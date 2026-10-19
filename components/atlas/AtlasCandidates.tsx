"use client";
import Link from "next/link";

import Image from "next/image";
import type { AtlasDistrict } from "@/lib/stateLegAtlas";
import { contest2026, fieldPersons, fmtMoney, projectedNomineeShare } from "@/lib/stateLegAtlas";
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
      style={{ width: "4.5rem", height: "4.5rem", borderRadius: "12px", border: `3px solid ${PARTY_COLOR[party]}`, background: "var(--app-tab-bg)" }}
    >
      {party === "R" ? (
        <Image src="/candidates/placeholder-republican.png" alt="Republican" width={144} height={144} className="w-full h-full object-contain p-2" />
      ) : party === "D" ? (
        <Image src="/candidates/placeholder-democrat.png" alt="Democrat" width={144} height={144} className="w-full h-full object-contain p-2" />
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
          {post && (
            <div className="pt-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
              {abbr === "ID" ? `Seat ${post}` : `Position ${post}`}
            </div>
          )}
          {cands.map((x, i) => {
            const color = PARTY_COLOR[x.party];
            const p = projectedNomineeShare(x, cands, posts.length > 1, margin, votes);
            const share = p?.share ?? null;
            const v = p?.votes != null ? { votes: p.votes } : null;
            return (
              <div
                key={`${x.name}-${i}`}
                className="flex items-center justify-between gap-4 py-3.5"
                style={{ borderBottom: i === cands.length - 1 ? "none" : "1px solid var(--app-border)" }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Portrait party={x.party} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CandidateLink name={x.name} abbr={abbr} color={color} weight={700} style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem" }} />
                      {x.incumbent && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>Inc.</span>}
                      {x.writeIn && <Pill>Write-in</Pill>}
                    </div>
                    <div className="text-sm font-medium mt-0.5" style={{ color }}>{partyName(x.party, x.partyLabel)}{x.lines.length > 1 && <span className="font-normal" style={{ color: "var(--app-text-very-muted)" }}> · {x.lines.length} ballot lines{x.lines.includes("D") && x.lines.includes("R") ? " (Democratic and Republican)" : ""}</span>}</div>
                  </div>
                </div>
                {share != null && (
                  <div className="shrink-0 text-right tabular-nums" style={{ color }}>
                    <div className="text-3xl font-extrabold">{share.toFixed(1)}%</div>
                    {v ? (
                      <div className="text-sm font-medium mt-0.5">{v.votes.toLocaleString("en-US")} votes</div>
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

/** Cycle-to-date contributions for the 2026 field as one split bar (D left, R right), matching the federal race pages. */
export function AtlasFundraisingSection({ district, electionYear }: { district: AtlasDistrict; electionYear: number }) {
  const m = district.money?.find((x) => x.year === electionYear);
  if (!m) {
    return <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>Fundraising TBD — no {electionYear} campaign-finance records on file for this state yet.</p>;
  }
  const sideOrder: Record<string, number> = { D: 0, I: 1, O: 1, R: 2 };
  const rows = [...m.candidates].sort((a, b) => sideOrder[a.party] - sideOrder[b.party] || (b.contributions ?? -1) - (a.contributions ?? -1));
  const total = rows.reduce((s, r) => s + (r.matched ? r.contributions ?? 0 : 0), 0);
  const shareOf = (r: (typeof rows)[number]) => (r.matched && total > 0 ? ((r.contributions ?? 0) / total) * 100 : null);
  const lead = m.demTotal != null && m.repTotal != null && m.demTotal !== m.repTotal ? (m.demTotal > m.repTotal ? "D" : "R") : null;
  const twoSided = rows.length === 2;

  const label = (r: (typeof rows)[number], i: number, alignRight: boolean) => {
    const share = shareOf(r);
    return (
      <div key={`${r.name}-${i}`} className={`min-w-0 ${alignRight ? "text-right" : ""}`}>
        <div className="text-xs truncate" style={{ color: "var(--app-text-muted)" }}>{r.name} ({r.party === "O" ? "I" : r.party})</div>
        <div className="text-lg font-bold tabular-nums leading-tight" style={{ color: r.matched ? PARTY_COLOR[r.party] : "var(--app-text-very-muted)" }}>
          {r.matched ? fmtMoney(r.contributions) : <span className="text-sm font-normal italic">no filings found</span>}
          {share != null && <span className="ml-1.5 text-xs font-medium" style={{ color: "var(--app-text-very-muted)" }}>{share.toFixed(0)}%</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className={twoSided ? "flex items-end justify-between gap-4" : "flex flex-wrap gap-x-6 gap-y-2"}>
        {rows.map((r, i) => label(r, i, twoSided && i === 1))}
      </div>
      {total > 0 && (
        <div className="mt-2 flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--app-tab-bg)" }}>
          {rows.map((r, i) => {
            const share = shareOf(r);
            return share ? <div key={`${r.name}-${i}`} title={`${r.name}: ${fmtMoney(r.contributions)}`} style={{ width: `${share}%`, background: PARTY_COLOR[r.party], borderLeft: i > 0 ? "1px solid var(--app-bg)" : undefined }} /> : null;
          })}
        </div>
      )}
      <p className="mt-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
        <b className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtMoney(total)}</b> raised
        {m.demTotal != null && m.repTotal != null && (
          <>
            {" · "}
            <b className="tabular-nums" style={{ color: lead ? PARTY_COLOR[lead] : "var(--app-text-primary)" }}>
              {lead ? `${lead}+${fmtMoney(Math.abs(m.demTotal - m.repTotal))}` : "Even"}
            </b>
            {lead && " advantage"}
            {m.gapPct != null && <> · {Math.abs(m.gapPct).toFixed(0)}-point gap in two-party money</>}
          </>
        )}
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        Contributions per {m.source}, through {m.dataThrough ?? "the latest report"}. Not yet a term in the projection.
      </p>
    </div>
  );
}
