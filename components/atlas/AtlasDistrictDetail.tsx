"use client";

import { Fragment } from "react";
import { LedgerSectionHead, LedgerSubhead } from "@/components/LedgerSectionHead";
import DemographicsStrip from "@/components/DemographicsStrip";
import AtlasTrendChart from "./AtlasTrendChart";
import AtlasOutlook from "./AtlasOutlook";
import { AtlasCandidatesSection, AtlasFundraisingSection, AtlasResultSection, CandidateLink, PARTY_COLOR, result2026Meta } from "./AtlasCandidates";
import { AtlasOverlayMap, AtlasTransitionMaps } from "./AtlasEraMaps";
import type { Chamber } from "@/data/stateLegDistricts";
import type { AtlasDistrict, AtlasEra, AtlasMoney, AtlasResult } from "@/lib/stateLegAtlas";
import { resultMargin } from "@/lib/stateLegAtlas";
import { formatReceipts } from "@/components/FundraisingLedger";
import { getRatingColors, projectedMarginColor, fmtLean, leanColor } from "@/lib/colorScale";
import { PILL } from "@/components/RaceHeroPills";
import { useRevealOnce } from "@/lib/useRevealOnce";

// The race pages' stagger: 55 ms a row, capped so a long list doesn't trail.
const enter = (i: number) => Math.min(i, 8) * 55;

/** A section that rises in once it scrolls into view; rows inside hold their own entrance until then. */
function Reveal({ children, as = "section" }: { children: React.ReactNode; as?: "section" | "div" }) {
  const { ref, vh } = useRevealOnce<HTMLElement>(0.02);
  return as === "section"
    ? <section ref={ref} data-vh={vh} className="vh-in">{children}</section>
    : <div ref={ref as React.RefObject<HTMLDivElement | null>} data-vh={vh} className="vh-in">{children}</div>;
}

/** Margin text in the site's standard party colors (not the Safe/Likely/Lean shade scale). */
const marginText = (m: number) => projectedMarginColor(m);

/** A vote or projected margin: names the leader ("R+0.0"), "Even" only at an exact tie. */
function fmtMargin(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "Even";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}

const PILL_TONE = {
  muted: { background: "var(--app-tab-bg)", color: "var(--app-text-muted)" },
  primary: { background: "var(--app-text-primary)", color: "var(--app-bg)" },
  D: { background: "var(--party-dem)", color: "#fff" },
  R: { background: "var(--party-rep)", color: "#fff" },
  I: { background: "var(--party-ind)", color: "#fff" },
};

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: keyof typeof PILL_TONE }) {
  return (
    <span className={`inline-block ${PILL}`} style={PILL_TONE[tone]}>
      {children}
    </span>
  );
}

// Chambers whose multi-member districts elect each seat as its own race (Washington's Position 1/2,
// Idaho's Seat A/B), so the label holds even when no 2026 ballot is loaded to show the posts.
const POST_CHAMBERS = new Set(["WA-house", "ID-house"]);

function eraLabel(eras: AtlasEra[], key: string): string {
  const e = eras.find((x) => x.key === key);
  if (!e) return key;
  return e.key === "current" ? "current map" : `${e.label} map`;
}

const SUBTLE: Record<string, string> = {
  D: "color-mix(in srgb, var(--party-dem) 14%, transparent)",
  R: "color-mix(in srgb, var(--party-rep) 14%, transparent)",
  O: "color-mix(in srgb, var(--party-ind) 14%, transparent)",
};

function WinnerCheck({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" className="shrink-0 self-center" role="img" aria-label="Won">
      <title>Won</title>
      <circle cx="8" cy="8" r="8" fill={color} />
      <path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="var(--app-bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One line of a result block: name (party), Inc./post/won marks, money raised, then share and votes at right. */
function ResultLine({ name, party, color, pct, votes, incumbent, winner, post, raised, abbr }: {
  name: React.ReactNode; party: string; color: string; pct: string; votes: number | null | undefined;
  incumbent?: boolean; winner?: boolean; post?: string; raised?: React.ReactNode; abbr?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-sm font-semibold min-w-0" style={{ color }}>
          {typeof name === "string" && abbr ? <CandidateLink name={name} abbr={abbr} color={color} weight={600} /> : name}
          {party && <> ({party})</>}
        </span>
        {incumbent && <span className="text-[10px] font-semibold shrink-0 px-1 py-0.5 rounded" style={{ background: SUBTLE[party] ?? SUBTLE.O, color }}>Inc.</span>}
        {post && <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--app-text-very-muted)" }}>{post}</span>}
        {winner && <WinnerCheck color={color} />}
        {raised}
      </div>
      <span className="text-sm font-bold tabular-nums w-14 text-right shrink-0" style={{ color }}>{pct}</span>
      <span className="text-xs tabular-nums w-16 text-right shrink-0" style={{ color: "var(--app-text-primary)" }}>{votes === undefined ? "" : votes == null ? "—" : votes.toLocaleString("en-US")}</span>
    </div>
  );
}

/**
 * A district's past general elections in the race pages' Vote History ledger: one block per year
 * with the serif year, an Unopposed pill, the money gap and any old map beside it, and the margin, then a line per candidate
 * (votes descending, as the source lists them) with share, votes and the cycle's money, and a foot
 * with the money gap and, for an election on superseded lines, the map it was held on.
 */
function ElectoralHistory({ results, eras, abbr, chamber, money }: { results: AtlasResult[]; eras: AtlasEra[]; abbr: string; chamber: Chamber; money: AtlasMoney[] }) {
  return (
    <div>
      {results.map((r, i) => {
        const m = resultMargin(r);
        const total = r.totalVotes ?? 0;
        const pct = (v: number | null | undefined) => (total > 0 && v != null ? `${((v / total) * 100).toFixed(1)}%` : "—");
        const cands = (r.candidates ?? []).filter((c) => c.votes == null || c.votes > 0);
        const yearMoney = money.find((x) => x.year === r.year);
        const byName = new Map((yearMoney?.candidates ?? []).map((c) => [c.name, c]));
        const oldMap = r.era !== "current";
        const enterMs = enter(i);
        return (
          <div key={r.year} className="vh-row" style={{ padding: i === 0 ? "0.15rem 0 0.5rem" : "0.5rem 0", borderBottom: i === results.length - 1 ? "none" : "1px solid var(--app-border)", animationDelay: `${enterMs}ms` }}>
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular-nums shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{r.year}</span>
                {r.uncontested && <Pill>Unopposed</Pill>}
                {yearMoney?.gapPct != null && cands.length > 1 && (
                  <span className="text-xs font-semibold whitespace-nowrap shrink-0" style={{ color: "var(--app-text-muted)" }} title="Gap in the two parties' shares of the money raised">
                    Raised <span style={{ color: yearMoney.gapPct > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{yearMoney.gapPct > 0 ? "R" : "D"}+{Math.abs(yearMoney.gapPct).toFixed(0)}%</span>
                  </span>
                )}
                {oldMap && (
                  <span className="text-xs whitespace-nowrap shrink-0" style={{ color: "var(--app-text-muted)" }} title="Held on superseded lines: see Redistricting history">
                    {eraLabel(eras, r.era).replace(/^./, (c) => c.toUpperCase())}
                  </span>
                )}
              </div>
              {r.noCount
                ? <span className="text-xs whitespace-nowrap shrink-0" style={{ color: "var(--app-text-very-muted)" }}>No count printed</span>
                : <span className="vh-margin tabular-nums whitespace-nowrap shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: m == null ? "var(--app-text-very-muted)" : marginText(m) }}>{fmtMargin(m)}</span>}
            </div>

            {cands.length > 0 ? cands.map((c, j) => {
              const color = PARTY_COLOR[c.party] ?? "var(--app-text-primary)";
              const mm = byName.get(c.name);
              const raised = yearMoney && c.party !== "O" ? (
                <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--app-text-very-muted)" }}>
                  {mm?.matched ? `${formatReceipts(mm.contributions ?? 0)} raised` : "no filing"}
                </span>
              ) : null;
              const post = c.post ? (abbr.toUpperCase() === "ID" ? `Seat ${c.post}` : POST_CHAMBERS.has(`${abbr.toUpperCase()}-${chamber}`) ? `Pos. ${c.post}` : `Post ${c.post}`) : undefined;
              return <ResultLine key={`${c.name}-${j}`} name={c.name} abbr={abbr} party={c.party} color={color} pct={r.noCount ? "" : pct(c.votes)} votes={r.noCount ? undefined : c.votes} incumbent={c.incumbent} winner={c.winner} post={post} raised={raised} />;
            }) : r.noCount ? (
              <p className="text-sm py-[3px]" style={{ color: "var(--app-text-muted)" }}>Candidates not on file</p>
            ) : (
              // Party totals only: the source printed the parties' votes, not the people.
              <>
                {r.demVotes != null && r.demVotes > 0 && <ResultLine name="Democrats" party="" color={PARTY_COLOR.D} pct={pct(r.demVotes)} votes={r.demVotes} />}
                {r.repVotes != null && r.repVotes > 0 && <ResultLine name="Republicans" party="" color={PARTY_COLOR.R} pct={pct(r.repVotes)} votes={r.repVotes} />}
                {r.othVotes != null && r.othVotes > 0 && <ResultLine name="Others" party="" color="var(--app-text-muted)" pct={pct(r.othVotes)} votes={r.othVotes} />}
              </>
            )}

          </div>
        );
      })}
    </div>
  );
}

/** Which filings the "raised" figures come from, by cycle: sources differ by state and year, and some undercount. */
function MoneySources({ money }: { money: AtlasMoney[] }) {
  const bySource = new Map<string, number[]>();
  for (const m of money) bySource.set(m.source, [...(bySource.get(m.source) ?? []), m.year]);
  return (
    <p className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
      Raised: each candidate&rsquo;s contributions for the cycle, per{" "}
      {[...bySource].map(([source, years], i) => (
        <span key={source}>{i > 0 && "; "}{source} ({[...years].sort((a, b) => a - b).join(", ")})</span>
      ))}
      . &ldquo;No filing&rdquo; is a candidate with none on record.
    </p>
  );
}

export default function AtlasDistrictDetail({
  abbr,
  chamber,
  district,
  eras,
  electionYear,
  selector,
  locatorMap,
  chamberLabel,
  onBack,
}: {
  abbr: string;
  chamber: Chamber;
  district: AtlasDistrict;
  eras: AtlasEra[];
  electionYear: number;
  /** The district selector, at the end of the pill row (under the title on a phone). */
  selector?: React.ReactNode;
  /** The chamber's locator map, at the right of the title line. */
  locatorMap?: React.ReactNode;
  /** "State House": the first pill reads "MN State House" and returns to the chamber's district explorer. */
  chamberLabel?: string;
  onBack?: () => void;
}) {
  const hasMoney = (district.money ?? []).some((m) => m.year !== electionYear);
  const up = district.nextElection === electionYear || district.incumbents.some((i) => (i.nextElection ?? district.nextElection) === electionYear);
  const currentEra = eras.find((e) => e.key === "current");
  const latestRedraw = district.redistricting.at(-1);
  const counties = latestRedraw?.counties ?? [];
  const presRows = (["2016", "2020", "2024"] as const).map((y) => {
    const thenEra = district.presByEra.find((e) => e.years.includes(Number(y))) ?? (Number(y) >= 2024 ? district.presByEra.find((e) => e.era === "current") : undefined);
    return { year: y, thenEra: thenEra?.era ?? null, then: thenEra?.pres[y] ?? null, now: district.presCurrent[y] ?? null };
  });

  const pr = district.projection;
  const rating = pr?.contest === "contested" && pr.rating ? getRatingColors(pr.rating) : null;
  const headline = !pr || pr.contest === "not-up" ? null
    : pr.contest === "uncontested-D" ? { label: "Projected", value: "Safe D", color: "var(--party-dem)" }
    : pr.contest === "uncontested-R" ? { label: "Projected", value: "Safe R", color: "var(--party-rep)" }
    : pr.contest === "contested" && pr.margin != null ? { label: "Projected Margin", value: fmtMargin(pr.margin), color: marginText(pr.margin) }
    : pr.contest === "independent" && pr.indep ? (() => {
      const opp = pr.indep.slot === "D" ? "R" : "D", a = pr.indep.advantage;
      return { label: `Projected · ${pr.indep.name} vs ${opp}`, value: a === 0 ? "Even" : `${a > 0 ? "I" : opp}+${Math.abs(a).toFixed(1)}`, color: a > 0 ? "var(--party-ind)" : opp === "D" ? "var(--party-dem)" : "var(--party-rep)" };
    })()
    : pr.contest === "other" && pr.pI === 1 ? { label: "Projected", value: "Independent", color: "var(--party-ind)" }
    : pr.contest === "split" && pr.guaranteed ? { label: "Projected · decided by the field", value: `${pr.guaranteed.dem} D · ${pr.guaranteed.rep} R`, color: "var(--app-text-primary)" }
    : null;
  const parties = new Set(district.incumbents.map((i) => i.party));
  const heldBy = district.incumbents.length === 0 ? "Vacant" : parties.size === 1 ? `${[...parties][0] === "D" ? "Dem" : [...parties][0] === "R" ? "GOP" : "Ind."} held` : "Split delegation";
  // One-party seats take that party's color, like the chamber's "Democratic-held" pill up top.
  const heldParty = district.incumbents.length > 0 && parties.size === 1 ? ({ D: "D", R: "R", I: "I" } as const)[[...parties][0] as "D" | "R" | "I"] ?? null : null;
  const lastResult = [...district.results].sort((x, y) => y.year - x.year).find((r) => resultMargin(r) != null);
  const lastMargin = lastResult ? resultMargin(lastResult) : null;
  const pres24 = district.presCurrent["2024"]?.margin ?? null;
  const muted = "var(--app-text-very-muted)";
  // The About row: who holds the seat, whether they're leaving, and the map it sits on.
  const incs = district.incumbents;
  const joinNodes = (nodes: React.ReactNode[]) => nodes.map((n, i) => <span key={i}>{i > 0 && ", "}{n}</span>);
  const uniq = (xs: (number | null | undefined)[]) => [...new Set(xs.filter((x): x is number => x != null))];
  const elected = uniq(incs.map((i) => i.lastElection ?? district.lastElection));
  const nextElections = uniq(incs.length ? incs.map((i) => i.nextElection ?? district.nextElection) : [district.nextElection]);
  // How many members the district elects: the sourced count where there is one (NH House), else the
  // most seen among today's incumbents and the 2026 ballot (a vacancy can hide one in either).
  const posts = new Set((district.candidates2026?.candidates ?? []).map((c) => c.post).filter((x): x is string => !!x && x !== "Special"));
  const members = district.seats ?? Math.max(incs.length, district.candidates2026?.seats ?? 0, posts.size, 1);
  const staggered = members > 1 && uniq(incs.map((i) => i.nextElection ?? district.nextElection)).length > 1;
  const byPost = members > 1 && (posts.size > 1 || POST_CHAMBERS.has(`${abbr.toUpperCase()}-${chamber}`));
  const districtType = members > 1
    ? `${members}-member district${byPost ? ", separate posts" : staggered ? ", staggered terms" : ""}${district.overlay ? " (floterial)" : ""}`
    : district.overlay ? "Floterial district" : null;
  // How many votes each voter casts. One race for all the seats is block voting: vote for up to
  // as many candidates as there are seats (a voter may stop at one). Posts are separate races,
  // one vote in each; a staggered district puts one seat on the ballot at a time.
  const votingRule = members <= 1 ? null
    : byPost ? `One vote in each of the ${Math.max(posts.size, members)} post races`
    : staggered ? "One vote; one seat is up at a time"
    : `Vote for up to ${members}; the top ${members} win`;
  const aboutItems: { label: string; value: React.ReactNode }[] = [
    ...(districtType ? [{ label: "Type", value: districtType }] : []),
    ...(votingRule ? [{ label: "Voting", value: votingRule }] : []),
    ...(elected.length ? [{ label: "Elected", value: elected.join(", ") }] : []),
    ...(nextElections.length ? [{ label: "Next Election", value: nextElections.join(", ") }] : []),
    ...(district.outgoing2026?.length ? [{ label: "Incumbent not running", value: joinNodes(district.outgoing2026.map((o) => (
      <Fragment key={o.name}>
        {(incs.length !== 1 || incs[0].name !== o.name) && <><CandidateLink name={o.name} abbr={abbr} color={PARTY_COLOR[o.party] ?? "var(--app-text-primary)"} weight={700} />{o.post ? ` (seat ${o.post})` : ""}{o.reason ? " · " : ""}</>}
        {o.reason && o.reason[0].toUpperCase() + o.reason.slice(1)}
      </Fragment>
    ))) }] : []),
    ...(counties.length ? [{ label: counties.length === 1 ? "County" : "Counties", value: counties.map((c) => `${c.county}${counties.length > 1 && c.popPct < 99 ? ` (${c.popPct.toFixed(0)}%)` : ""}`).join(", ") }] : []),
    // The year the current map was first used; the commission, enactment date and prior maps are left out.
    ...(currentEra?.years.length ? [{ label: "Map", value: `${currentEra.years[0]}` }] : []),
  ];
  // The header's one line of checks, like a House page's Proj. · Polls · Markets · TPL.
  const stats = [
    // The district's structural lean (the Forecast Calculation's first term), then the projection built on it.
    ...(pr?.lean != null ? [{ label: "TPL", value: fmtLean(pr.lean), color: leanColor(pr.lean) }] : []),
    ...(headline ? [{ label: "Proj.", value: headline.value, color: headline.color }] : []),
    { label: "2024 Pres.", value: fmtMargin(pres24), color: pres24 == null ? muted : marginText(pres24) },
    (() => {
      // A race an independent won: their margin over the runner-up, not the two-party one.
      const top = [...(lastResult?.candidates ?? [])].filter((c) => c.votes != null).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
      if (lastResult?.totalVotes && top[0]?.party === "O" && top.length > 1) {
        const m = (((top[0].votes ?? 0) - (top[1].votes ?? 0)) / lastResult.totalVotes) * 100;
        return { label: `${lastResult.year} Result`, value: `I+${m.toFixed(1)}`, color: "var(--party-ind)" };
      }
      return { label: lastResult ? `${lastResult.year} Result` : "Last Result", value: lastResult?.uncontested && lastMargin != null ? `Unopposed ${lastMargin > 0 ? "R" : "D"}` : fmtMargin(lastMargin), color: lastMargin == null ? muted : marginText(lastMargin) };
    })(),
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Header — the House race pages' hero: pills with the district selector at their end, the
          title with the locator map at its right, one small line of checks under the title. */}
      <div>
        <div className="vh-in flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {onBack && chamberLabel && (
              <button type="button" onClick={onBack} aria-label={`All ${chamberLabel} districts`} className={`${PILL} ix-lift hover:underline`} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
                {abbr} {chamberLabel}
              </button>
            )}
            {rating && <span className={PILL} style={{ background: rating.bg, color: rating.text }}>{pr!.rating}</span>}
            {up ? <Pill tone="primary">Up in {electionYear}</Pill> : district.nextElection ? <Pill>Next election {district.nextElection}</Pill> : null}
            {up && district.candidates2026?.special && <Pill>Special</Pill>}
            {heldBy && <Pill tone={heldParty ?? "muted"}>{heldBy}</Pill>}
            {district.seats != null && district.seats > 1 && <Pill>{district.seats} seats</Pill>}
          </div>
          {selector && <div className="hidden w-full max-w-sm sm:block">{selector}</div>}
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="vh-in min-w-0" style={{ animationDelay: "60ms" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.25rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance" }}>
              {district.label}
            </h2>
            {selector && <div className="mt-3 sm:hidden">{selector}</div>}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              {stats.map((st) => (
                <span key={st.label} className="whitespace-nowrap">{st.label} <b className="font-bold tabular-nums" style={{ color: st.color }}>{st.value}</b></span>
              ))}
            </div>
            {/* The House page's opening fact: "Name (R)" in the party's serif colour under a small label. */}
            <dl className="mt-6">
              <dt className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{incs.length > 1 ? "Incumbents" : "Incumbent"}</dt>
              <dd style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", fontWeight: 700 }}>
                {incs.length === 0 ? <span style={{ color: "var(--app-text-muted)" }}>Vacant</span> : joinNodes(incs.map((inc) => {
                  const color = PARTY_COLOR[inc.party] ?? "var(--app-text-primary)";
                  return <span key={inc.name} style={{ color }}><CandidateLink name={inc.name} abbr={abbr} color={color} weight={700} /> ({inc.party})</span>;
                }))}
              </dd>
            </dl>
          </div>
          {locatorMap && <div className="vh-in w-28 shrink-0 sm:w-44" style={{ animationDelay: "110ms" }}>{locatorMap}</div>}
        </div>
      </div>

      {/* About — the House district page's format: the facts row, then a Demographics subsection
          with the big-figure grid strip. */}
      <Reveal>
        <LedgerSectionHead label="About this District" />
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {aboutItems.map((it) => (
            <div key={it.label} className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              {it.label} <span className="font-bold" style={{ color: "var(--app-text-primary)" }}>{it.value}</span>
            </div>
          ))}
        </div>
        <LedgerSubhead rule={false} label="Demographics" meta={district.demographics ? "ACS 2020–24 5-year estimates." : undefined} top={aboutItems.length ? "mt-7" : "mt-0"} />
        {district.demographics ? (
          <DemographicsStrip {...district.demographics} layout="grid" />
        ) : (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No demographic data.</p>
        )}
      </Reveal>

      {/* The counted election takes the place of the projected vote; a district with no result on file keeps the projection. */}
      {district.result2026 && (
        <Reveal>
          <LedgerSectionHead label={`${electionYear} Election`} meta={result2026Meta(district.result2026)} />
          <AtlasResultSection district={district} abbr={abbr} />
        </Reveal>
      )}
      {district.candidates2026 && (
        <>
          {!district.result2026 && <Reveal>
            <LedgerSectionHead label={district.projection?.votes ? `${electionYear} Projected Vote` : `${electionYear} Candidates`} meta={`${district.projection?.votes ? `${district.projection.votes.total.toLocaleString("en-US")} estimated votes · ` : ""}Ballotpedia list${district.candidates2026.seats && district.candidates2026.seats > 1 ? ` · ${district.candidates2026.seats} seats` : ""}`} />
            <AtlasCandidatesSection district={district} abbr={abbr} />
          </Reveal>}
          <Reveal>
            <LedgerSectionHead label="Fundraising" />
            <AtlasFundraisingSection district={district} electionYear={electionYear} />
          </Reveal>
        </>
      )}

      {district.projection && <Reveal as="div"><AtlasOutlook district={district} eras={eras} electionYear={electionYear} /></Reveal>}

      {/* Electoral history */}
      <Reveal>
        <LedgerSectionHead label="Electoral history" meta={`${district.results.length} general election${district.results.length === 1 ? "" : "s"} for this district number`} />
        {district.results.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No results on file.</p>
        ) : (
          <div>
            <ElectoralHistory results={district.results} eras={eras} abbr={abbr} chamber={chamber} money={hasMoney ? district.money ?? [] : []} />
            {district.results.some((r) => r.era !== "current") && (
              <p className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                Rows on a superseded map are the race held under this district number on those lines, which may cover different ground than today&rsquo;s district. See Redistricting history.
              </p>
            )}
            {hasMoney && <MoneySources money={district.money ?? []} />}
          </div>
        )}
      </Reveal>

      {/* Trend */}
      <Reveal>
        <LedgerSectionHead label="TPL lean trend" meta="neutral lean on today's lines · Republican up" />
        <AtlasTrendChart district={district} />
      </Reveal>

      {/* President by boundary */}
      <Reveal>
        <LedgerSectionHead label="Presidential results by boundary" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-w-xl" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Election</th>
                <th className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Lines then</th>
                <th className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Map</th>
                <th className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Today&rsquo;s lines</th>
              </tr>
            </thead>
            <tbody>
              {presRows.map((row, i) => (
                <tr key={row.year} className="vh-tr vh-hover" style={{ borderBottom: "1px solid var(--app-border)", animationDelay: `${enter(i)}ms` }}>
                  <td className="py-1.5 pr-3 font-semibold">{row.year}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: row.then ? marginText(row.then.margin) : "var(--app-text-very-muted)" }}>{fmtMargin(row.then?.margin)}</td>
                  <td className="py-1.5 pr-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>{row.thenEra ? eraLabel(eras, row.thenEra) : ""}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: row.now ? marginText(row.now.margin) : "var(--app-text-very-muted)" }}>
                    <span className="vh-margin inline-block">{fmtMargin(row.now?.margin)}</span>{row.now?.estimated && <span className="ml-1 text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>est.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* Redistricting */}
      <Reveal>
        <LedgerSectionHead label="Redistricting history" meta={district.redistricting.length ? `${district.redistricting.length} map change${district.redistricting.length === 1 ? "" : "s"} since 2016` : undefined} />
        {district.overlay && district.components?.length ? (
          <div className="mb-5">
            <p className="text-sm mb-3" style={{ color: "var(--app-text-primary)", maxWidth: "72ch" }}>
              {district.label} is a floterial: an overlay district with no lines of its own, whose voters elect its member{district.seats != null && district.seats > 1 ? "s" : ""} in addition to those of the base districts it covers.
            </p>
            <AtlasOverlayMap abbr={abbr} chamber={chamber} districtKey={district.key} components={district.components} seats={district.seats} />
          </div>
        ) : null}
        {district.redistricting.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{district.overlay ? "No redistricting record: overlay districts have no polygon in the boundary files." : "Lines unchanged across the years on file."}</p>
        ) : (
          <div className="flex flex-col gap-7">
            {[...district.redistricting].reverse().map((e, i) => (
              <div key={e.toEra} className="vh-in vh-hover text-sm" style={{ animationDelay: `${enter(i)}ms` }}>
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <span className="font-semibold">{eraLabel(eras, e.fromEra)} <span className="vh-lean" data-dir="r">→</span> {eraLabel(eras, e.toEra)}</span>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>kept {e.retainedPopPct.toFixed(0)}% of its population</span>
                </div>
                <p style={{ color: "var(--app-text-primary)", maxWidth: "72ch" }}>{e.text}</p>
                <div className="mt-3">
                  <AtlasTransitionMaps abbr={abbr} chamber={chamber} districtKey={district.key} entry={e} eras={eras} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Reveal>
      <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        {abbr} {chamber === "house" ? "House" : "Senate"} district {district.key}. Presidential figures on superseded lines are area-apportioned from VTD returns; see the methodology for the measured error.
      </p>
    </div>
  );
}
