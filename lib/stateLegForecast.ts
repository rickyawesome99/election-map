import "server-only";

import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { electionYear } from "@/data/forecastData";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegRedistricting } from "@/data/stateLegRedistricting";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { stateLegCandidates2026, type StateLegDistrictCandidates2026 } from "@/data/stateLegCandidates2026";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { getTplFit, getNationalEnvironment, winProbabilityD } from "@/lib/tplCompute";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { seatsUpIn } from "@/lib/stateLegUpcoming";
import { contest2026, fieldPersons, personKey, projectedSeatWinners } from "@/lib/stateLegAtlas";
export { personKey };
import { marginToRating } from "@/lib/colorScale";
import { stateLegIndependents } from "@/data/stateLegIndependents";

/**
 * The 2026 projection for every state legislative district on the ballot: a district TPL built
 * from the seat's own races relocated onto today's lines plus the presidential vote on those
 * lines, projected forward with the fitted national environment and incumbency, then simulated
 * chamber by chamber. Specification: /methodology/state-leg. A change here gets an entry in
 * data/methodologyChangelog.ts and a re-run of scripts/stateLegBacktest.ts.
 *
 *   1. Rows      presidential rows on today's lines (2016, 2020, 2024); the seat's general-election
 *                margin in each year it was contested. A race run on a superseded map is relocated
 *                through the population crosswalk (data/stateLegRedistricting.ts contributors,
 *                chained across eras): the population-weighted margin of the old districts today's
 *                district draws from, corrected by the presidential delta between those old polygons
 *                and today's, kept only when contested old districts cover MIN_COVERAGE of today's
 *                population.
 *   2. Neutral   NM = margin − INCUMBENCY_PTS × incumbent sign − β*(state) × E(year), the state
 *                model's rule with a legislative incumbency term fitted by the backtest.
 *   3. Lean      per year: P and L rows combined on TYPE_WEIGHTS (renormalised over the types
 *                present; the seat row's weight × RECENT_SEAT_BOOST in the latest year that has one),
 *                years on YEAR_WEIGHTS × coverage, two-pass Huber (HUBER_C) on seat rows.
 *   4. Forward   margin = lean + β* × E(2026) + INCUMBENCY_PTS × incumbent sign (the 2026 field's
 *                incumbent); no Democrat or no Republican in the field decides the seat outright.
 *   5. Spread    σ² = SIGMA² + STATE_SHOCK² + (β* σ_E)²; P(D) is the normal tail.
 *   6. Chamber   5,000 draws of a shared national shock, a shared chamber shock (STATE_SHOCK) and
 *                independent SIGMA noise per seat;
 *                seats not on the ballot hold their sitting member's party.
 *   6b. Decided seats  a multi-member district where a party fields fewer nominees than seats, or a
 *                post with one party's nominee, gives that party the seats it cannot lose; only the
 *                rest are drawn. A nominee on both major lines (Oregon, Vermont, New York fusion) is
 *                one person, in the party they sit for.
 *   7. Independents  a credible independent facing only one major party (sitting, or IND_RECORD_SHARE
 *                in their last head-to-head here, or backed by the absent party: data/stateLegIndependents.ts)
 *                takes the absent party's place in step 4, plus a personal effect: the mean residual of
 *                their last two head-to-heads in this seat, shrunk toward IND_PRIOR_PTS (0 for a backed
 *                newcomer) by K = IND_SHRINK_K, with IND_SIGMA more noise. An appointed incumbent gets
 *                no incumbency. A party backing an independent over its own nominee (Alaska's ranked
 *                choice) puts the independent in its place. No major party on the ballot at all: an
 *                independent seat outright.
 */

export const STATE_LEG_FORECAST_CONSTANTS = {
  TYPE_WEIGHTS: { P: 0.6, L: 0.2 } as Record<"P" | "L", number>, // the District TPL's P/H ratio: a seat's own race is to its district what a House race is to a congressional district
  RECENT_SEAT_BOOST: 3,  // the seat row's type weight × this in the latest year that has one (L 0.2 → 0.6, half that year's lean): the backtest's sweep (2026-10-14), MAE 5.85 → 5.74 (2022) and 5.39 → 5.18 (2024)
  INCUMBENCY_PTS: 3.0,   // fitted by scripts/stateLegBacktest.ts: 3.7 (2022) / 1.8 (2024) with RECENT_SEAT_BOOST (2026-10-16 re-run), set at their rounded mean
  SIGMA: 7.0,            // seat-level noise beyond the national and chamber shocks, fitted by the backtest (holdout residual spread after τ: 7.4 / 6.9)
  STATE_SHOCK: 3.5,      // chamber-level shock τ shared by every seat of a chamber in a year, fitted by the backtest (chamber-mean residual spread: 3.4 / 3.5 with RECENT_SEAT_BOOST, 2026-10-16 re-run)
  MIN_COVERAGE: 0.5,     // a relocated row needs contested old districts covering this share of today's population
  IND_RECORD_SHARE: 40,  // a non-incumbent independent is modeled when they took this share of their last head-to-head in the seat
  IND_PRIOR_PTS: 14,     // a modeled independent runs this far ahead of a generic nominee of the absent party before their own record: the median of the 16 head-to-heads 2022-24 (scripts/stateLegIndependentBacktest.ts)
  IND_SHRINK_K: 1,       // their record (mean residual of the last two head-to-heads) is shrunk toward IND_PRIOR_PTS: (n·mean + K·prior) / (n + K)
  IND_SIGMA: 0,          // extra seat noise in an independent's race: the backtest's robust residual spread (7.1 with RECENT_SEAT_BOOST) is within SIGMA and STATE_SHOCK, so none
  SIMS: 5000,
};

const C = STATE_LEG_FORECAST_CONSTANTS;
const PRES_YEARS = ["2016", "2020", "2024"] as const;
type PresYear = (typeof PRES_YEARS)[number];

export interface ProjectionRow {
  year: number;
  kind: "P" | "L";
  label: string;
  era: string;
  raw: number;          // R-positive margin (relocated onto today's lines for a superseded era)
  relocated: boolean;
  coverage: number;     // share of today's population the row's old districts covered (1 on today's lines)
  presDelta: number;    // the relocation's presidential correction, 0 on today's lines
  incSign: number;      // +1 R incumbent, −1 D incumbent (fractional when relocated)
  incPts: number;
  envPts: number;
  NM: number;
  huber: number;
  weight: number;       // final share of the lean
}

export interface DistrictProjection {
  key: string;
  label: string;
  rows: ProjectionRow[];
  lean: number | null;
  beta: number;
  envPts: number;
  incSign: number;
  incPts: number;
  margin: number | null;
  sigma: number;
  pD: number | null;
  rating: string | null;
  contest: "contested" | "uncontested-D" | "uncontested-R" | "independent" | "split" | "none" | "other" | "not-up";
  seats: number;
  /** Seats a party cannot lose because the other fields too few nominees (a multi-member district, or a post with one party). */
  guaranteed: { dem: number; rep: number };
  /** Seats drawn on the margin: `seats` less the guaranteed ones (0 under contest "split"). */
  contestedSeats: number;
  candidates2026: StateLegDistrictCandidates2026 | null;
  /** The independent-vs-party contest (contest "independent"); `margin` then carries the independent in `slot`. */
  indep: IndependentContest | null;
  /** P(an independent wins): the modeled independent, or 1 where no major party is on the ballot. */
  pI: number | null;
}

/** One of an independent's past head-to-heads in the seat, against a single major party. */
export interface IndependentRecordRace {
  year: number;
  opponentParty: "D" | "R";
  share: number;         // the independent's share of the vote
  advantage: number;     // independent minus major-party opponent, points of the total vote
  expected: number;      // a generic nominee of the absent party's advantage that year (lean + environment + incumbency)
  residual: number;
}

export interface IndependentContest {
  name: string;
  partyLabel: string;
  /** The absent major party whose place the independent takes. */
  slot: "D" | "R";
  opponent: string | null;
  basis: "incumbent" | "record" | "endorsed";
  endorsedBy: "D" | "R" | null;
  note: string | null;
  record: IndependentRecordRace[];
  personal: number;      // shrunk mean residual, independent-positive points
  advantage: number;     // projected independent margin over the major-party opponent
  /** Seats this contest decides; the rest of a multi-member district go to the party with enough nominees. */
  seats: number;
  /**
   * A multi-member district where the party fields a nominee for every seat: the independent races
   * that party's last nominee inside one electorate (Vermont's Chittenden-15), so neither the lean
   * nor the national environment separates them; only incumbency and noise do.
   */
  sameElectorate: boolean;
}

export interface ChamberProjection {
  abbr: string;
  chamber: Chamber;
  year: number;
  districts: DistrictProjection[];
  totalSeats: number | null;
  seatsUp: number;
  holdover: { dem: number; rep: number; oth: number };
  decided: { dem: number; rep: number; oth: number };
  expectedDem: number;
  expectedRep: number;
  /** Independents and third parties: holdovers, decided seats and modeled independent wins. */
  expectedOth: number;
  /** The sum of each seat's projected winner (lib/stateLegAtlas.ts projectedSeatWinners): the
   *  headline count, the same one the chamber map shows. `expected*` stay the simulation means. */
  favored: { dem: number; rep: number; oth: number; none: number };
  lo80: number;
  hi80: number;
  majority: number | null;
  supermajority: number | null;
  pDemControl: number | null;
  pRepControl: number | null;
  pDemSuper: number | null;
  pRepSuper: number | null;
  /** Seats on the ballot with no projection (nonpartisan, no listed field, or no lean). */
  unprojected: number;
  sims: number;
}

// ── crosswalk ────────────────────────────────────────────────────────────────

function eraOrder(abbr: string, chamber: Chamber): string[] {
  const vintages = new Set(Object.values(stateLegHistoricalMaps[abbr]?.[chamber] ?? {}).map(String));
  return [...vintages].sort((a, b) => Number(a) - Number(b)).concat("current");
}

function eraOf(abbr: string, chamber: Chamber, year: number): string {
  const v = stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)];
  return v == null ? "current" : String(v);
}

/** Population shares of `targetEra`'s districts inside today's district `key` (sum ≤ 1). */
export function compositeShares(abbr: string, chamber: Chamber, key: string, targetEra: string): Record<string, number> {
  const order = eraOrder(abbr, chamber);
  const redistricting = stateLegRedistricting[abbr]?.[chamber] ?? {};
  let shares: Record<string, number> = { [key]: 1 };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const next = order[i];
    if (next === targetEra) break;
    const prev = order[i - 1];
    const out: Record<string, number> = {};
    for (const [k, w] of Object.entries(shares)) {
      for (const c of redistricting[next]?.[k]?.contributors ?? []) out[c.key] = (out[c.key] ?? 0) + (w * c.popPct) / 100;
    }
    shares = out;
    if (prev === targetEra) break;
  }
  return shares;
}

function contestedMargin(r: { demVotes: number | null; repVotes: number | null; totalVotes: number | null; noCount?: boolean; candidates?: { name: string; party: string }[] }): number | null {
  if (r.noCount || !r.totalVotes || !r.demVotes || !r.repVotes) return null;
  if (r.demVotes <= 0 || r.repVotes <= 0) return null;
  // A fusion nominee on both major lines (New York, Oregon, Vermont) is no D-vs-R contest.
  if (r.candidates?.length) {
    const dem = new Set(r.candidates.filter((c) => c.party === "D").map((c) => personKey(c.name)));
    if (r.candidates.some((c) => c.party === "R" && dem.has(personKey(c.name)))) return null;
  }
  return ((r.repVotes - r.demVotes) / r.totalVotes) * 100;
}

function incumbentSign(r: { candidates?: { party: string; incumbent?: boolean }[] }): number {
  const inc = (r.candidates ?? []).filter((c) => c.incumbent);
  const parties = new Set(inc.map((c) => c.party));
  if (parties.size !== 1) return 0;
  const p = [...parties][0];
  return p === "R" ? 1 : p === "D" ? -1 : 0;
}

function nearestPresYear(year: number, available: PresYear[]): PresYear | null {
  if (available.length === 0) return null;
  return [...available].sort((a, b) => Math.abs(Number(a) - year) - Math.abs(Number(b) - year) || Number(b) - Number(a))[0];
}

// ── independents ─────────────────────────────────────────────────────────────

/** The independent's head-to-heads against one major party in this seat on today's lines, oldest first. */
export function independentRecord(abbr: string, chamber: Chamber, key: string, who: string, beforeYear: number): { year: number; share: number; advantage: number; opponentParty: "D" | "R"; incI: number; incOpp: number }[] {
  const out: { year: number; share: number; advantage: number; opponentParty: "D" | "R"; incI: number; incOpp: number }[] = [];
  const years = (stateLegCalendar[abbr]?.[chamber]?.electionYears ?? []).filter((y) => y < beforeYear).sort((a, b) => a - b);
  let wonLast = false;
  for (const year of years) {
    if (eraOf(abbr, chamber, year) !== "current") continue;
    const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
    const r = block ? lookupByDistrictCode(indexByNormalizedKey(block.districts), abbr, chamber, key) : undefined;
    if (!r?.candidates || !r.totalVotes || r.noCount) continue;
    const majors = r.candidates.filter((c) => c.party !== "O");
    // Not a fusion line of a major nominee (New York's "(WOR)"), not a write-in or scattering total.
    const me = r.candidates.find((c) => c.party === "O" && personKey(c.name) === who
      && !majors.some((m) => personKey(m.name) === who) && !/write-?in|scatter|blank|void/i.test(c.name));
    if (!me) { wonLast = false; continue; }
    const parties = new Set(majors.map((c) => c.party));
    const top = Math.max(...r.candidates.map((c) => c.votes ?? 0));
    const won = me.winner ?? (me.votes ?? 0) === top;
    if (parties.size === 1 && me.votes != null) {
      const opp = majors.reduce((a, b) => ((b.votes ?? 0) > (a.votes ?? 0) ? b : a));
      out.push({
        year, share: (me.votes / r.totalVotes) * 100, advantage: ((me.votes - (opp.votes ?? 0)) / r.totalVotes) * 100,
        opponentParty: opp.party as "D" | "R", incI: me.incumbent ?? wonLast ? 1 : 0, incOpp: opp.incumbent ? 1 : 0,
      });
    }
    wonLast = won;
  }
  return out;
}

/**
 * An independent's projected advantage over the major-party nominee (independent-positive points):
 * a generic nominee of the absent party (lean + β·E, flipped for a D slot) + incumbency + the
 * personal effect, their record's mean residual shrunk toward the prior. Shared with
 * scripts/stateLegIndependentBacktest.ts, which passes its own prior and K.
 */
export function independentAdvantage(a: {
  abbr: string; chamber: Chamber; key: string; who: string; slot: "D" | "R"; lean: number; beta: number; E: number;
  incI: number; incOpp: number; sameElectorate: boolean; beforeYear: number; incPts?: number; prior?: number; k?: number;
}): { record: IndependentRecordRace[]; personal: number; advantage: number } {
  const incPts = a.incPts ?? C.INCUMBENCY_PTS, prior = a.prior ?? C.IND_PRIOR_PTS, k = a.k ?? C.IND_SHRINK_K;
  const incTerm = incPts * (a.incI - a.incOpp);
  if (a.sameElectorate) return { record: [], personal: 0, advantage: incTerm };
  const fit = getTplFit();
  const generic = (m: number) => (a.slot === "R" ? m : -m);
  const party = a.slot === "D" ? "R" : "D";
  const record: IndependentRecordRace[] = independentRecord(a.abbr, a.chamber, a.key, a.who, a.beforeYear)
    .filter((r) => r.opponentParty === party)
    .map((r) => {
      const expected = generic(a.lean + a.beta * (fit.E[r.year] ?? 0)) + incPts * (r.incI - r.incOpp);
      return { year: r.year, opponentParty: r.opponentParty, share: r.share, advantage: r.advantage, expected, residual: r.advantage - expected };
    });
  const recent = record.slice(-2);
  const personal = (recent.reduce((s, r) => s + r.residual, 0) + k * prior) / (recent.length + k);
  return { record, personal, advantage: generic(a.lean + a.beta * a.E) + incTerm + personal };
}

/**
 * The independent a one-party ballot is really a contest with, or null: sitting, a strong last
 * head-to-head, or backed by the absent party. data/stateLegIndependents.ts adds endorsements and
 * can exclude a candidate the automatic rules would pick.
 */
function findIndependent(abbr: string, chamber: Chamber, district: StateLegDistrict, field: StateLegDistrictCandidates2026, beforeYear: number, contested: boolean) {
  const real = field.candidates.filter((x) => !x.writeIn);
  const majorNames = new Set(real.filter((x) => x.party !== "O").map((x) => personKey(x.name)));
  const sitting = new Set((district.incumbents ?? []).filter((x) => x.party !== "D" && x.party !== "R").map((x) => personKey(x.name)));
  const curated = stateLegIndependents[abbr]?.[chamber]?.[district.number] ?? [];
  let best: { cand: (typeof real)[number]; basis: IndependentContest["basis"]; endorsedBy: "D" | "R" | null; note: string | null; appointed: boolean; rank: number } | null = null;
  for (const cand of real) {
    if (cand.party !== "O") continue;
    const who = personKey(cand.name);
    if (majorNames.has(who)) continue;   // a fusion line of a major-party nominee
    const cur = curated.find((x) => personKey(x.name) === who);
    if (cur?.exclude) continue;
    if (contested && !cur?.supersedesNominee) continue;   // both majors on the ballot: only a backed independent replaces one
    const record = independentRecord(abbr, chamber, district.number, who, beforeYear);
    const last = record.at(-1);
    const basis: IndependentContest["basis"] | null = cand.incumbent || sitting.has(who) ? "incumbent"
      : cur?.endorsedBy ? "endorsed"
      : last && last.share >= C.IND_RECORD_SHARE ? "record" : null;
    if (!basis) continue;
    const rank = basis === "incumbent" ? 3 : basis === "endorsed" ? 2 : 1;
    if (!best || rank > best.rank) best = { cand, basis, endorsedBy: cur?.endorsedBy ?? null, note: cur?.note ?? null, appointed: !!cur?.appointed, rank };
  }
  return best;
}

// ── district projection ───────────────────────────────────────────────────────

export interface ProjectOptions {
  /** Use only rows from years ≤ maxYear (the backtest's information cutoff). */
  maxYear?: number;
  /** Environment to project into and the incumbent sign to apply (defaults: 2026 and the 2026 field). */
  targetYear?: number;
  targetE?: number;
  targetIncSign?: number;
  incumbencyPts?: number;
  sigma?: number;
  /** The backtest's sweep: presidential vs seat-row weights in place of TYPE_WEIGHTS. */
  typeWeights?: Record<"P" | "L", number>;
  /** The backtest's sweep: the most recent seat row's type weight × this in place of RECENT_SEAT_BOOST (1 = none). */
  recentSeatBoost?: number;
}

export function projectDistrict(abbr: string, chamber: Chamber, district: StateLegDistrict, opts: ProjectOptions = {}): DistrictProjection {
  const fit = getTplFit();
  const beta = fit.beta[abbr]?.shrunk ?? 1;
  const key = district.number;
  const maxYear = opts.maxYear ?? Number.POSITIVE_INFINITY;
  const incPts = opts.incumbencyPts ?? C.INCUMBENCY_PTS;
  const TW = opts.typeWeights ?? C.TYPE_WEIGHTS;
  const presByEra = stateLegPresByEra[abbr]?.[chamber] ?? {};
  const current = presByEra["current"] ?? {};
  const currentIndex = indexByNormalizedKey(current);
  const presNow = lookupByDistrictCode(currentIndex, abbr, chamber, key);
  const rows: ProjectionRow[] = [];

  for (const p of PRES_YEARS) {
    const v = presNow?.[p];
    if (!v || Number(p) > maxYear) continue;
    const envPts = -(beta * (fit.E[Number(p)] ?? 0));
    rows.push({ year: Number(p), kind: "P", label: `${p} President`, era: "current", raw: v.margin, relocated: false, coverage: 1, presDelta: 0, incSign: 0, incPts: 0, envPts, NM: v.margin + envPts, huber: 1, weight: 0 });
  }

  const years = (stateLegCalendar[abbr]?.[chamber]?.electionYears ?? []).filter((y) => y <= maxYear);
  for (const year of years) {
    const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
    if (!block) continue;
    const era = eraOf(abbr, chamber, year);
    const index = indexByNormalizedKey(block.districts);
    let raw: number | null = null, coverage = 1, presDelta = 0, incSign = 0, relocated = false;
    if (era === "current") {
      const r = lookupByDistrictCode(index, abbr, chamber, key);
      if (!r) continue;
      raw = contestedMargin(r);
      if (raw == null) continue;
      incSign = incumbentSign(r);
    } else {
      relocated = true;
      const shares = compositeShares(abbr, chamber, key, era);
      const presOld = presByEra[era] ?? {};
      const presOldIndex = indexByNormalizedKey(presOld);
      const available = PRES_YEARS.filter((p) => presNow?.[p] && Object.values(presOld).some((d) => d[p]));
      const p = nearestPresYear(year, available);
      let wSum = 0, mSum = 0, iSum = 0, pSum = 0, pW = 0;
      for (const [oldKey, w] of Object.entries(shares)) {
        if (isUnassignedResultKey(oldKey)) continue;
        const r = lookupByDistrictCode(index, abbr, chamber, oldKey);
        if (!r) continue;
        const m = contestedMargin(r);
        if (m == null) continue;
        wSum += w; mSum += w * m; iSum += w * incumbentSign(r);
        const po = p ? lookupByDistrictCode(presOldIndex, abbr, chamber, oldKey)?.[p] : undefined;
        if (po) { pSum += w * po.margin; pW += w; }
      }
      if (wSum < C.MIN_COVERAGE) continue;
      raw = mSum / wSum;
      incSign = iSum / wSum;
      coverage = wSum;
      if (p && pW > 0 && presNow?.[p]) presDelta = presNow[p]!.margin - pSum / pW;
      raw += presDelta;
    }
    const envPts = -(beta * (fit.E[year] ?? 0));
    const incStrip = -incPts * incSign;
    rows.push({ year, kind: "L", label: `${year} ${chamber === "house" ? "House" : "Senate"}`, era, raw, relocated, coverage, presDelta, incSign, incPts: incStrip, envPts, NM: raw + incStrip + envPts, huber: 1, weight: 0 });
  }

  // Lean: two passes, the second with Huber factors on the seat rows.
  // The seat's most recent race says the most about it: its type weight × RECENT_SEAT_BOOST in the
  // latest year that has a seat row (State Navigate's emphasis on the last legislative result).
  const boost = opts.recentSeatBoost ?? C.RECENT_SEAT_BOOST;
  const latestL = Math.max(...rows.filter((r) => r.kind === "L").map((r) => r.year), -1);
  const twFor = (y: number): Record<"P" | "L", number> => (boost !== 1 && y === latestL ? { P: TW.P, L: TW.L * boost } : TW);
  const computeLean = (): number | null => {
    const years = [...new Set(rows.map((r) => r.year))].sort();
    let num = 0, den = 0;
    const yearShare: Record<number, number> = {};
    for (const y of years) {
      const typeNM: Partial<Record<"P" | "L", number>> = {};
      const typeW: Partial<Record<"P" | "L", number>> = {};
      for (const r of rows.filter((x) => x.year === y)) {
        const w = r.coverage * r.huber;
        typeNM[r.kind] = (typeNM[r.kind] ?? 0) + w * r.NM;
        typeW[r.kind] = (typeW[r.kind] ?? 0) + w;
      }
      const present = (["P", "L"] as const).filter((t) => (typeW[t] ?? 0) > 0);
      if (present.length === 0) continue;
      const tw = twFor(y);
      const base = present.reduce((s, t) => s + tw[t], 0);
      const wrs = present.reduce((s, t) => s + (tw[t] / base) * (typeNM[t]! / typeW[t]!), 0);
      const yw = (G.YEAR_WEIGHTS[y] ?? 0) * base;
      yearShare[y] = yw;
      num += yw * wrs;
      den += yw;
    }
    if (den <= 0) return null;
    // Record each row's final share of the lean for the ledger.
    for (const r of rows) {
      const y = r.year;
      const sameType = rows.filter((x) => x.year === y && x.kind === r.kind);
      const typeW = sameType.reduce((s, x) => s + x.coverage * x.huber, 0);
      const present = (["P", "L"] as const).filter((t) => rows.some((x) => x.year === y && x.kind === t));
      const tw = twFor(y);
      const base = present.reduce((s, t) => s + tw[t], 0);
      r.weight = ((yearShare[y] ?? 0) / den) * (tw[r.kind] / base) * ((r.coverage * r.huber) / (typeW || 1));
    }
    return num / den;
  };
  let lean = computeLean();
  if (lean != null) {
    for (const r of rows) if (r.kind === "L") { const res = Math.abs(r.NM - lean); r.huber = res <= G.HUBER_C ? 1 : G.HUBER_C / res; }
    lean = computeLean();
  }

  const targetYear = opts.targetYear ?? electionYear;
  const env = getNationalEnvironment();
  const E = opts.targetE ?? env.eHat;
  const sigmaE = opts.targetE != null ? 0 : env.sigmaE;
  const field = targetYear === electionYear ? (stateLegCandidates2026[abbr]?.[chamber]?.[key] ?? null) : null;
  const sitting = district.incumbents ?? [];
  const c26 = contest2026(field ?? undefined, sitting);
  const persons = field ? fieldPersons(field, sitting).filter((x) => !x.writeIn) : [];
  const up = seatsUpIn(district, targetYear) > 0;
  let incSign = opts.targetIncSign ?? 0;
  if (opts.targetIncSign == null && field) {
    const inc = persons.filter((x) => x.incumbent);
    const parties = new Set(inc.map((x) => x.party));
    incSign = parties.size === 1 ? ([...parties][0] === "R" ? 1 : [...parties][0] === "D" ? -1 : 0) : 0;
  }
  const envPts = beta * E;
  const sigma = Math.sqrt((opts.sigma ?? C.SIGMA) ** 2 + C.STATE_SHOCK ** 2 + (beta * sigmaE) ** 2);
  let contest: DistrictProjection["contest"] = !up ? "not-up" : c26 ? c26.status : "contested";
  // Seats on the ballot in this district: the roster's per-seat cycle (West Virginia's Senate
  // puts one of a district's two seats up each cycle), falling back to the field's seat count.
  const seats = up ? Math.max(1, seatsUpIn(district, targetYear)) : (field?.seats ?? district.seats ?? 1);

  // A one-party ballot with a credible independent is a contest: the independent takes the absent
  // party's place, with their own record on top.
  let indep: IndependentContest | null = null;
  if (field && lean != null && (contest === "uncontested-D" || contest === "uncontested-R" || contest === "contested")) {
    const found = findIndependent(abbr, chamber, district, field, targetYear, contest === "contested");
    if (found) {
      // One major party on the ballot: the independent takes the other's place. Both on it: the
      // backing party's (its nominee's votes transfer under ranked choice).
      const slot: "D" | "R" = contest === "contested" ? found.endorsedBy! : contest === "uncontested-D" ? "R" : "D";
      const party = slot === "D" ? "R" : "D";
      const nominees = persons.filter((x) => x.party === party);
      const who = personKey(found.cand.name);
      const incI = found.basis === "incumbent" && !found.appointed ? 1 : 0;
      const sameElectorate = seats > 1 && nominees.length >= seats;
      // In one electorate the independent faces the party's weakest nominee: an incumbent only if all are.
      const incOpp = (sameElectorate ? nominees.every((x) => x.incumbent) : nominees.some((x) => x.incumbent)) ? 1 : 0;
      const { record, personal, advantage } = independentAdvantage({
        abbr, chamber, key, who, slot, lean, beta, E, incI, incOpp, sameElectorate, incPts, beforeYear: Math.min(targetYear, maxYear + 1),
        // The prior was measured on sitting and proven independents; a backed newcomer is the party's generic nominee.
        prior: found.basis === "endorsed" ? 0 : C.IND_PRIOR_PTS,
      });
      indep = {
        name: found.cand.name, partyLabel: found.cand.partyLabel ?? "Independent", slot,
        opponent: nominees.length === 1 ? nominees[0].name : nominees.length ? `${nominees.length} ${party} nominees` : null,
        basis: found.basis, endorsedBy: found.endorsedBy, note: found.note,
        record, personal, advantage, sameElectorate,
        seats: 1,   // a multi-member district's other seats go to the party's nominees (Vermont's Chittenden-15)
      };
      contest = "independent";
      incSign = slot === "D" ? -(incI - incOpp) : incI - incOpp;
    }
  }
  // Seats the field decides inside a contested district: a multi-member district where a party
  // fields fewer nominees than seats, or a post (Idaho's A/B, Washington's 1/2) with one party.
  const guaranteed = { dem: 0, rep: 0 };
  if (contest === "contested" && persons.length) {
    const posts = [...new Set(persons.map((x) => x.post ?? ""))];
    if (posts.length > 1 || posts[0] !== "") {
      for (const post of posts) {
        const inPost = persons.filter((x) => (x.post ?? "") === post);
        const hasD = inPost.some((x) => x.party === "D"), hasR = inPost.some((x) => x.party === "R");
        if (hasD && !hasR) guaranteed.dem += 1; else if (hasR && !hasD) guaranteed.rep += 1;
      }
    } else if (seats > 1) {
      const nD = persons.filter((x) => x.party === "D").length, nR = persons.filter((x) => x.party === "R").length;
      guaranteed.dem = Math.min(seats, Math.max(0, seats - nR));
      guaranteed.rep = Math.min(seats - guaranteed.dem, Math.max(0, seats - nD));
    }
    if (guaranteed.dem + guaranteed.rep >= seats) contest = "split";
  }
  const contestedSeats = contest === "contested" ? seats - guaranteed.dem - guaranteed.rep : contest === "independent" ? indep!.seats : 0;
  const incFwd = incPts * incSign;
  const margin = lean == null ? null : indep ? (indep.slot === "R" ? indep.advantage : -indep.advantage) : lean + envPts + incFwd;
  const indepSigma = indep?.sameElectorate ? Math.hypot(C.SIGMA, C.IND_SIGMA) : Math.sqrt(sigma ** 2 + C.IND_SIGMA ** 2);
  const pIndep = indep ? winProbabilityD(-indep.advantage, indepSigma) : null;
  const pD = margin == null || contest === "not-up" ? null
    : contest === "uncontested-D" ? 1 : contest === "uncontested-R" ? 0
    : contest === "independent" ? (indep!.slot === "D" ? 0 : 1 - pIndep!)
    : contest === "contested" ? winProbabilityD(margin, sigma) : null;
  const pI = contest === "independent" ? pIndep : contest === "other" && abbr !== "NE" ? 1 : null;
  return {
    key, label: district.label, rows, lean, beta, envPts, incSign, incPts: incFwd, margin, sigma, pD,
    rating: margin == null || contest !== "contested" ? null : marginToRating(margin),
    contest, seats, guaranteed, contestedSeats, candidates2026: field, indep, pI,
  };
}

// ── chamber simulation ────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number): number {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const _chamberCache = new Map<string, ChamberProjection | null>();

export function projectChamber(abbr: string, chamber: Chamber, year: number = electionYear): ChamberProjection | null {
  const cacheKey = `${abbr}:${chamber}:${year}`;
  if (_chamberCache.has(cacheKey)) return _chamberCache.get(cacheKey)!;
  const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
  if (roster.length === 0 || (UNICAMERAL_STATES.has(abbr) && chamber === "house")) { _chamberCache.set(cacheKey, null); return null; }
  const districts = roster.map((d) => projectDistrict(abbr, chamber, d, { targetYear: year }));
  const upDistricts = districts.filter((d) => d.contest !== "not-up");
  if (upDistricts.length === 0) { _chamberCache.set(cacheKey, null); return null; }

  // Holdovers: members whose seat is not on the ballot keep it.
  const holdover = { dem: 0, rep: 0, oth: 0 };
  for (const d of roster) {
    for (const inc of d.incumbents ?? []) {
      const next = inc.nextElection ?? d.nextElection;
      if (next === year) continue;
      if (inc.party === "D") holdover.dem += 1; else if (inc.party === "R") holdover.rep += 1; else holdover.oth += 1;
    }
  }
  const decided = { dem: 0, rep: 0, oth: 0 };
  const sim: { d: DistrictProjection; seats: number }[] = [];
  const indepSim: { d: DistrictProjection; slot: "D" | "R" }[] = [];
  let seatsUp = 0, unprojected = 0;
  for (const d of upDistricts) {
    const seats = d.seats;
    seatsUp += seats;
    if (d.contest === "uncontested-D") decided.dem += seats;
    else if (d.contest === "uncontested-R") decided.rep += seats;
    else if (d.contest === "split") { decided.dem += d.guaranteed.dem; decided.rep += d.guaranteed.rep; unprojected += seats - d.guaranteed.dem - d.guaranteed.rep; }
    else if (d.contest === "contested" && d.margin != null) { decided.dem += d.guaranteed.dem; decided.rep += d.guaranteed.rep; sim.push({ d, seats: d.contestedSeats }); }
    else if (d.contest === "independent" && d.indep) {
      // The party's nominees take a multi-member district's other seats; one is the independent's race.
      if (d.indep.slot === "D") decided.rep += seats - d.indep.seats; else decided.dem += seats - d.indep.seats;
      indepSim.push({ d, slot: d.indep.slot });
    }
    else if (d.contest === "other" && abbr !== "NE") decided.oth += seats;   // no major party on the ballot
    else unprojected += seats;   // nonpartisan Nebraska, no listed candidates, no lean: no projection
  }
  // Control odds mean nothing when the unprojected seats alone could decide them.
  const controlKnown = unprojected < Math.max(1, Math.round(0.1 * (holdover.dem + holdover.rep + holdover.oth + seatsUp)));
  const env = getNationalEnvironment();
  const sigmaE = env.sigmaE;
  const rand = mulberry32(20261103 + abbr.charCodeAt(0) * 7 + (chamber === "house" ? 1 : 2));
  const sims = C.SIMS;
  const counts = new Array<number>(sims);
  const repCounts = new Array<number>(sims);
  let othSum = 0;
  for (let k = 0; k < sims; k += 1) {
    const z = gaussian(rand) * sigmaE;
    // The chamber shock: one draw every seat of the chamber shares, on top of the national one.
    const zc = gaussian(rand) * C.STATE_SHOCK;
    let dem = holdover.dem + decided.dem, rep = holdover.rep + decided.rep, oth = holdover.oth + decided.oth;
    for (const { d, seats } of sim) {
      for (let s = 0; s < seats; s += 1) {
        const m = d.margin! + d.beta * z + zc + gaussian(rand) * C.SIGMA;
        if (m <= 0) dem += 1; else rep += 1;
      }
    }
    // An independent in a party's slot moves with that slot's environment.
    for (const { d, slot } of indepSim) {
      const shared = d.indep!.sameElectorate ? 0 : d.beta * z + zc;
      const m = d.margin! + shared + gaussian(rand) * Math.hypot(C.SIGMA, C.IND_SIGMA);
      const indepWins = slot === "D" ? m <= 0 : m > 0;
      if (indepWins) oth += 1; else if (slot === "D") rep += 1; else dem += 1;
    }
    counts[k] = dem;
    repCounts[k] = rep;
    othSum += oth;
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sims - 1, Math.floor(p * sims))];
  const info = stateLegMapInfo[abbr]?.[chamber];
  const totalSeats = info?.totalSeats ?? stateLegCalendar[abbr]?.[chamber]?.eras.at(-1)?.totalSeats ?? null;
  const majority = totalSeats != null ? Math.floor(totalSeats / 2) + 1 : null;
  const supermajority = info?.supermajoritySeats ?? null;
  const meanDem = counts.reduce((a, b) => a + b, 0) / sims;
  const meanRep = repCounts.reduce((a, b) => a + b, 0) / sims;
  const winners = projectedSeatWinners(roster.map((d, i) => ({ seats: d.seats, incumbents: d.incumbents ?? [], projection: districts[i] })));
  const share = (pred: (k: number) => boolean) => { let n = 0; for (let k = 0; k < sims; k += 1) if (pred(k)) n += 1; return n / sims; };
  const out: ChamberProjection = {
    abbr, chamber, year, districts, totalSeats, seatsUp, holdover, decided,
    expectedDem: meanDem, expectedRep: meanRep, expectedOth: othSum / sims, favored: { dem: winners.D, rep: winners.R, oth: winners.I + winners.O, none: winners.none }, lo80: q(0.1), hi80: q(0.9),
    majority, supermajority,
    pDemControl: majority == null || !controlKnown ? null : share((k) => counts[k] >= majority),
    pRepControl: majority == null || !controlKnown ? null : share((k) => repCounts[k] >= majority),
    pDemSuper: supermajority == null || !controlKnown ? null : share((k) => counts[k] >= supermajority),
    pRepSuper: supermajority == null || !controlKnown ? null : share((k) => repCounts[k] >= supermajority),
    unprojected,
    sims,
  };
  _chamberCache.set(cacheKey, out);
  return out;
}

/** Every chamber on the ballot, for the national board. */
export function projectAllChambers(year: number = electionYear): ChamberProjection[] {
  const out: ChamberProjection[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const p = projectChamber(abbr, chamber, year);
      if (p) out.push(p);
    }
  }
  return out;
}
