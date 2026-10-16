import "server-only";

import { electionYear } from "@/data/forecastData";
import { stateLegResults, type StateLegDistrictResult } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegPres2024 } from "@/data/stateLegPres2024";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { compositeShares, projectChamber, projectDistrict, STATE_LEG_FORECAST_CONSTANTS as FC, type DistrictProjection } from "@/lib/stateLegForecast";
import { fieldPersons, personKey } from "@/lib/stateLegAtlas";
import { LIVE_CONFIG, runModel, stateLevelVotes, type ModelConfig, type StateLevel } from "@/lib/turnoutModel";
import { statewideRaces } from "@/lib/turnout";

/**
 * The 2026 popular vote of every state legislative chamber on the ballot: each seat's projected
 * votes cast, split between the parties by the district projection, summed two ways.
 * Specification: /methodology/state-leg#popular-vote. A change here gets an entry in
 * data/methodologyChangelog.ts and a re-run of scripts/stateLegPopularVoteBacktest.ts.
 *
 *   LEVEL     the state's 2026 top-of-the-ticket votes from the turnout estimate
 *             (lib/turnoutModel.ts: CVAP × blended midterm rates, ticket and competitiveness terms).
 *   SPLIT     a district's expected share of that top race = its share of the state's 2024
 *             presidential vote on today's lines.
 *   FACTOR    votes cast in the seat's race per expected top-race vote, per seat: measured in each
 *             basis midterm from the seat's own contested race (leg votes ÷ [seats × top-race votes
 *             × the district's presidential share that cycle]); a race run on a superseded map is
 *             relocated through the population crosswalk (the projection's rule, MIN_COVERAGE);
 *             blended on BASIS_WEIGHTS and shrunk toward the chamber's contested mean with
 *             DROPOFF_SHRINK_VOTES pseudo-votes. A seat with no contested history takes the mean.
 *   VOTES     V = level × share × factor × seats up. A printed unopposed race, or two nominees of
 *             one party, draws UNOPPOSED_TURNOUT of that; a state that prints no count for an
 *             unopposed seat (FL, HI, OK, TX) contributes nothing to the raw sum there.
 *   SHARES    contested: R = (100 − other + margin) / 2, D = (100 − other − margin) / 2 with the
 *             projection's margin (points of the full vote); other = the chamber's recent other
 *             share in races of the same kind (with or without a minor candidate on the ballot).
 *             One party on the ballot: all but the other share to it. A modeled independent takes
 *             the absent party's place on their projected advantage. Multi-member districts put
 *             each seat's share of the vote on its own contest (a post, a guaranteed seat).
 *   RAW       every counted district summed — what the certified aggregate will look like.
 *   ADJUSTED  every seat without both major parties replaced by the race it would have been:
 *             contested turnout and the projection's margin (lean + environment + incumbency),
 *             the rule the corrected past chamber margins use with the presidential vote.
 */

export const STATE_LEG_POPVOTE_CONSTANTS = {
  BASIS_WEIGHTS: { 2022: 0.6, 2018: 0.4 } as Record<number, number>, // the turnout estimate's MIDTERM_WEIGHTS: a seat's turnout factor from the last two midterms
  DROPOFF_SHRINK_VOTES: 2000,   // presidential votes of the chamber mean a seat's own factor is weighed against: the 2022-from-2018 holdout's district-share error is lowest here (7.28% against 7.33% unshrunk and 8.18% chamber mean only)
  UNOPPOSED_TURNOUT: 0.82,      // votes cast per seat in a printed unopposed race relative to a contested one: the median over 267 chamber-years 2018–2024 (scripts/stateLegPopularVoteBacktest.ts)
  OTHER_SHRINK_RACES: 5,        // pseudo-races of the national mean in a chamber's other-share means
};

const C = STATE_LEG_POPVOTE_CONSTANTS;
type PresYear = "2016" | "2020" | "2024";
const WRITE_IN = /write-?in|scatter|blank|void|under ?vote|over ?vote/i;

export interface DistrictVote {
  key: string;
  label: string;
  seats: number;
  contest: DistrictProjection["contest"];
  /** Votes cast per seat per expected top-race vote, and where it came from. */
  factor: number;
  factorBasis: "own" | "relocated" | "chamber" | "none";
  /** The district's share of the chamber's 2024 presidential vote (0 where none is on file). */
  presShare: number;
  /** Raw: the race as it stands on the ballot. `votes` is 0 where the state prints no count. */
  votes: number;
  dem: number;
  rep: number;
  oth: number;
  margin: number | null;
  counted: boolean;
  /** The seat as a contested two-party race: the adjusted figure (equal to the raw one when it already is). Null without a lean. */
  adjusted: { votes: number; dem: number; rep: number; oth: number; margin: number } | null;
  imputed: boolean;
  otherShare: number;
}

export interface PopularVotePool {
  dem: number;
  rep: number;
  oth: number;
  votes: number;
  /** R-positive, share of the full vote; null when the pool is empty. */
  margin: number | null;
  districts: number;
}

export interface ChamberPopularVote {
  abbr: string;
  chamber: Chamber;
  year: number;
  /** The state's top-of-the-ticket estimate the district votes are cut from. */
  level: { votes: number; low: number; high: number };
  /** Raw votes ÷ level: the chamber's turnout relative to the top of the ticket. */
  chamberFactor: number;
  /** Votes cast per seat per expected top-race vote across the chamber's contested seats (the shrink target). */
  chamberMeanFactor: number;
  printsUnopposed: boolean;
  otherShares: OtherShares;
  districts: DistrictVote[];
  raw: PopularVotePool & { uncounted: number };
  adjusted: PopularVotePool & { imputed: number; skipped: number };
  /** The raw total on the level's low and high basis midterms. */
  low: number;
  high: number;
}

export interface OtherShares {
  /** Contested D-vs-R races with a minor-party or independent candidate on the ballot. */
  contestedWithO: number;
  /** Contested races with none (write-ins and scattering). */
  contestedNoO: number;
  /** One-party races with a minor candidate. */
  onePartyWithO: number;
  races: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function eraOf(abbr: string, chamber: Chamber, year: number): string {
  const v = stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)];
  return v == null ? "current" : String(v);
}

/** The presidential election whose district split a year's electorate is cut from. */
const presYearFor = (year: number): PresYear => String(year - (year % 4 === 2 ? 2 : year % 4)) as PresYear;

/** The state's top-of-the-ticket votes that year: the president, else the top statewide race, else the House. */
function topVotes(state: string, year: number): number | null {
  if (year % 4 === 0) return statewideRaces(state, year).races.president?.votes ?? null;
  return stateLevelVotes(state, year)?.votes ?? null;
}

const contested = (r: StateLegDistrictResult) => !r.noCount && (r.demVotes ?? 0) > 0 && (r.repVotes ?? 0) > 0 && (r.totalVotes ?? 0) > 0;

/** Seats the race filled: the winners it names, else the fallback. */
function seatsOf(r: StateLegDistrictResult, fallback: number): number {
  const w = (r.candidates ?? []).filter((c) => c.winner).length;
  return w > 0 ? w : fallback;
}

/** Whether a minor-party or independent candidate (not a write-in line) stood in the race. */
function hadO(r: StateLegDistrictResult): boolean {
  if (r.candidates?.length) return r.candidates.some((c) => c.party === "O" && (c.votes ?? 0) > 0 && !WRITE_IN.test(c.name));
  return (r.totalVotes ?? 0) > 0 && (r.othVotes ?? 0) / r.totalVotes! > 0.01;
}

/**
 * The chamber's presidential vote per district on an era's lines, with the chamber total (overlays
 * excluded). An era block holding far more districts than the chamber has (a senate era built from
 * the house boundary file: Delaware's and Vermont's 2020-era senates) is no use and reads as empty.
 */
function presOn(abbr: string, chamber: Chamber, era: string, p: PresYear) {
  let block = stateLegPresByEra[abbr]?.[chamber]?.[era] ?? {};
  // stateLegPresByEra carries no 2024 column on today's lines for a dozen states (PA, MI, OR…),
  // which left them with no 2026 popular vote at all. The precinct-exact 2024 file the district
  // pages read covers every chamber, so it stands in for that column.
  if (era === "current" && p === "2024" && !Object.values(block).some((d) => d["2024"]?.totalVotes)) {
    const pres2024 = stateLegPres2024[abbr]?.[chamber];
    if (pres2024) block = Object.fromEntries(Object.entries(pres2024).map(([k, v]) => [k, { "2024": v }])) as typeof block;
  }
  const index = indexByNormalizedKey(block);
  const districts = Object.values(block).filter((d) => !d.overlayOf);
  const roster = (stateLegDistricts[abbr]?.[chamber] ?? []).filter((d) => !d.overlay).length;
  let total = 0;
  if (roster === 0 || districts.length <= roster * 1.3) for (const d of districts) total += d[p]?.totalVotes ?? 0;
  return { index, total, get: (key: string) => lookupByDistrictCode(index, abbr, chamber, key)?.[p]?.totalVotes ?? null };
}

// ── other shares ─────────────────────────────────────────────────────────────

type OtherAcc = { cO: [number, number, number]; cN: [number, number, number]; uO: [number, number, number] };
const acc = (): OtherAcc => ({ cO: [0, 0, 0], cN: [0, 0, 0], uO: [0, 0, 0] });
function addOther(a: OtherAcc, r: StateLegDistrictResult) {
  if (r.noCount || !r.totalVotes) return;
  const slot = contested(r) ? (hadO(r) ? a.cO : a.cN) : (r.demVotes ?? 0) > 0 || (r.repVotes ?? 0) > 0 ? (hadO(r) ? a.uO : null) : null;
  if (!slot) return;
  slot[0] += r.othVotes ?? 0; slot[1] += r.totalVotes; slot[2] += 1;
}
function chamberYears(abbr: string, chamber: Chamber, maxYear: number, n: number): number[] {
  return (stateLegCalendar[abbr]?.[chamber]?.electionYears ?? []).filter((y) => y <= maxYear && stateLegResults[abbr]?.[String(y)]?.[chamber]).sort((a, b) => b - a).slice(0, n);
}

const _nationalOther = new Map<number, OtherAcc>();
function nationalOther(maxYear: number): OtherAcc {
  const cached = _nationalOther.get(maxYear);
  if (cached) return cached;
  const a = acc();
  for (const abbr of Object.keys(stateLegResults)) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      for (const y of chamberYears(abbr, chamber, maxYear, 2)) {
        for (const [k, r] of Object.entries(stateLegResults[abbr][String(y)][chamber]!.districts)) if (!isUnassignedResultKey(k)) addOther(a, r);
      }
    }
  }
  _nationalOther.set(maxYear, a);
  return a;
}

/** The chamber's other-vote share by kind of race over its last two elections, shrunk toward the national figure. */
export function otherShares(abbr: string, chamber: Chamber, maxYear: number = electionYear - 1): OtherShares {
  const own = acc();
  for (const y of chamberYears(abbr, chamber, maxYear, 2)) {
    for (const [k, r] of Object.entries(stateLegResults[abbr][String(y)][chamber]!.districts)) if (!isUnassignedResultKey(k)) addOther(own, r);
  }
  const nat = nationalOther(maxYear);
  const blend = (o: [number, number, number], n: [number, number, number]) => {
    const natPct = n[1] > 0 ? (n[0] / n[1]) * 100 : 0;
    const ownPct = o[1] > 0 ? (o[0] / o[1]) * 100 : natPct;
    return (o[2] * ownPct + C.OTHER_SHRINK_RACES * natPct) / (o[2] + C.OTHER_SHRINK_RACES);
  };
  return { contestedWithO: blend(own.cO, nat.cO), contestedNoO: blend(own.cN, nat.cN), onePartyWithO: blend(own.uO, nat.uO), races: own.cO[2] + own.cN[2] + own.uO[2] };
}

/** Whether the state prints a vote count for an unopposed seat (its last two elections decide). */
export function printsUnopposed(abbr: string, chamber: Chamber, maxYear: number = electionYear - 1, elections: number = 2): boolean {
  let noCount = 0, counted = 0;
  for (const y of chamberYears(abbr, chamber, maxYear, elections)) {
    for (const [k, r] of Object.entries(stateLegResults[abbr][String(y)][chamber]!.districts)) {
      if (isUnassignedResultKey(k) || contested(r)) continue;
      if (r.noCount) noCount += 1; else if ((r.totalVotes ?? 0) > 0) counted += 1;
    }
  }
  return counted >= noCount;
}

// ── turnout factors ──────────────────────────────────────────────────────────

/**
 * Every seat's votes-per-seat-per-expected-top-vote in one election of the chamber, keyed by the
 * district of that election's lines, plus the chamber's contested mean (vote-weighted). A race is
 * measured only when both major parties drew votes; a printed unopposed race is kept separately
 * for the UNOPPOSED_TURNOUT measurement.
 */
export function yearFactors(abbr: string, chamber: Chamber, year: number, seatsFallback: (key: string) => number) {
  const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
  const top = topVotes(abbr, year);
  const era = eraOf(abbr, chamber, year);
  const p = presYearFor(year);
  const pres = presOn(abbr, chamber, era, p);
  const own = new Map<string, number>();
  const unopposed = new Map<string, number>();
  let num = 0, den = 0;
  if (!block || !top || pres.total <= 0) return { era, own, unopposed, mean: null as number | null };
  for (const [key, r] of Object.entries(block.districts)) {
    if (isUnassignedResultKey(key) || r.noCount || !r.totalVotes) continue;
    const pv = pres.get(key);
    if (!pv) continue;
    const expTop = (top * pv) / pres.total;
    const seats = seatsOf(r, seatsFallback(key));
    const f = r.totalVotes / (seats * expTop);
    if (contested(r)) { own.set(key, f); num += r.totalVotes; den += seats * expTop; }
    else if ((r.demVotes ?? 0) > 0 || (r.repVotes ?? 0) > 0) unopposed.set(key, f);
  }
  return { era, own, unopposed, mean: den > 0 ? num / den : null };
}

// ── the ballot ───────────────────────────────────────────────────────────────

/** What is on a district's ballot, as the vote split needs it: live from the 2026 field, or from a past result in the backtest. */
export interface Ballot {
  contest: DistrictProjection["contest"];
  seats: number;
  contestedSeats: number;
  guaranteed: { dem: number; rep: number };
  /** A minor-party or independent candidate stands besides the majors (not a modeled independent). */
  hasO: boolean;
  /** One party fields more than one nominee for a single seat (California's top-two): a real race, not an unopposed one. */
  sameParty: boolean;
  /** The projection's R-positive margin (lean + environment + incumbency); for an independent contest, the independent's advantage is separate. */
  margin: number | null;
  lean: number | null;
  indep: { slot: "D" | "R"; advantage: number } | null;
}

export function ballotFromProjection(pr: DistrictProjection, district: StateLegDistrict): Ballot {
  const persons = pr.candidates2026 ? fieldPersons(pr.candidates2026, district.incumbents ?? []).filter((x) => !x.writeIn) : [];
  const indepName = pr.indep ? personKey(pr.indep.name) : null;
  const hasO = persons.some((x) => x.party === "O" && personKey(x.name) !== indepName);
  const sole = pr.contest === "uncontested-D" ? "D" : pr.contest === "uncontested-R" ? "R" : null;
  const sameParty = sole != null && pr.seats === 1 && persons.filter((x) => x.party === sole).length > 1;
  return {
    contest: pr.contest, seats: pr.seats, contestedSeats: pr.contestedSeats, guaranteed: pr.guaranteed, hasO, sameParty,
    // For an independent contest the projection's margin is the independent's; the two-party margin is rebuilt from the lean.
    margin: pr.indep ? (pr.lean == null ? null : pr.lean + pr.envPts) : pr.margin,
    lean: pr.lean,
    indep: pr.indep ? { slot: pr.indep.slot, advantage: pr.indep.advantage } : null,
  };
}

/** The ballot a past race was run on, from its result: who drew votes, how many seats, whether a minor candidate stood. */
export function ballotFromResult(r: StateLegDistrictResult, pr: DistrictProjection, seatsFallback: number): Ballot {
  const seats = seatsOf(r, seatsFallback);
  const hasD = (r.demVotes ?? 0) > 0, hasR = (r.repVotes ?? 0) > 0;
  const contest: Ballot["contest"] = r.noCount ? (r.candidates?.some((c) => c.party === "D") ? "uncontested-D" : r.candidates?.some((c) => c.party === "R") ? "uncontested-R" : "none")
    : hasD && hasR ? "contested" : hasD ? "uncontested-D" : hasR ? "uncontested-R" : "other";
  const sole = contest === "uncontested-D" ? "D" : contest === "uncontested-R" ? "R" : null;
  const sameParty = sole != null && seats === 1 && (r.candidates ?? []).filter((c) => c.party === sole && (c.votes ?? 0) > 0).length > 1;
  return { contest, seats, contestedSeats: contest === "contested" ? seats : 0, guaranteed: { dem: 0, rep: 0 }, hasO: hadO(r), sameParty, margin: pr.margin, lean: pr.lean, indep: null };
}

// ── the split ────────────────────────────────────────────────────────────────

type Split = { votes: number; dem: number; rep: number; oth: number };
const clamp = (m: number, other: number) => Math.max(-(100 - other), Math.min(100 - other, m));

/** D/R/other votes of `v` votes on an R-positive margin with `other` points to minor candidates. */
function twoWay(v: number, margin: number, other: number): Split {
  const m = clamp(margin, other);
  const rep = (v * (100 - other + m)) / 200, dem = (v * (100 - other - m)) / 200;
  return { votes: v, dem, rep, oth: v - dem - rep };
}
const add = (a: Split, b: Split): Split => ({ votes: a.votes + b.votes, dem: a.dem + b.dem, rep: a.rep + b.rep, oth: a.oth + b.oth });
const ZERO: Split = { votes: 0, dem: 0, rep: 0, oth: 0 };

/**
 * The raw split of a district whose full contested turnout would be `full` votes (all seats),
 * seat by seat: contested seats on the margin, guaranteed and unopposed seats to their party at
 * UNOPPOSED_TURNOUT, an independent's seat on their advantage. Null where the state would print nothing.
 */
function rawSplit(b: Ballot, full: number, o: OtherShares, prints: boolean, unopposedFactor: number): Split | null {
  const perSeat = full / Math.max(1, b.seats);
  const oneParty = (seats: number, party: "D" | "R", withO: boolean): Split => {
    const v = perSeat * seats * unopposedFactor;
    const other = withO ? o.onePartyWithO : o.contestedNoO;
    const theirs = (v * (100 - other)) / 100;
    return { votes: v, dem: party === "D" ? theirs : 0, rep: party === "R" ? theirs : 0, oth: v - theirs };
  };
  switch (b.contest) {
    case "contested": {
      if (b.margin == null) return null;
      let s = twoWay(perSeat * b.contestedSeats, b.margin, b.hasO ? o.contestedWithO : o.contestedNoO);
      if (b.guaranteed.dem) s = add(s, oneParty(b.guaranteed.dem, "D", false));
      if (b.guaranteed.rep) s = add(s, oneParty(b.guaranteed.rep, "R", false));
      return s;
    }
    case "split":
      return add(oneParty(b.guaranteed.dem, "D", false), oneParty(b.guaranteed.rep, "R", false));
    case "uncontested-D":
    case "uncontested-R": {
      // Two nominees of one party (California's top-two) are counted everywhere, but roll off like an unopposed race.
      if (!prints && !b.sameParty) return null;
      return oneParty(b.seats, b.contest === "uncontested-D" ? "D" : "R", b.hasO);
    }
    case "independent": {
      if (!b.indep) return null;
      // The independent's seat: their advantage over the party they face, the absent party at zero.
      const v = perSeat;
      const other = o.contestedNoO;
      const a = clamp(b.indep.advantage, other);
      const party = (v * (100 - other - a)) / 200;
      let s: Split = { votes: v, dem: b.indep.slot === "D" ? 0 : party, rep: b.indep.slot === "R" ? 0 : party, oth: v - party };
      const rest = b.seats - 1;
      if (rest > 0) s = add(s, oneParty(rest, b.indep.slot === "D" ? "R" : "D", false));
      return s;
    }
    case "other":
      if (!prints) return null;
      return { votes: perSeat * b.seats * unopposedFactor, dem: 0, rep: 0, oth: perSeat * b.seats * unopposedFactor };
    default:
      return null;
  }
}

// ── the chamber ──────────────────────────────────────────────────────────────

export interface PopularVoteOptions {
  targetYear?: number;
  /** The level per state in place of the live turnout estimate (the backtest's). */
  levels?: Map<string, StateLevel>;
  basisWeights?: Record<number, number>;
  shrinkVotes?: number;
  unopposedFactor?: number;
  /** The projection's holdout options and a ballot built from the target year's own result. */
  backtest?: { E: number; incumbencyPts?: number };
}

let _liveRun: ReturnType<typeof runModel> | null = null;
function liveLevels(): Map<string, StateLevel> {
  if (!_liveRun) _liveRun = runModel(LIVE_CONFIG);
  return _liveRun.levels;
}

/** The turnout estimate's state levels for a backtest year: from the one midterm before the basis, as the turnout backtest does. */
export function backtestLevels(target: number, basis: number): Map<string, StateLevel> {
  const config: ModelConfig = { ...LIVE_CONFIG, electionYear: target, basePresYear: target - 2, midterms: { [basis]: 1 } };
  return runModel(config).levels;
}

const _cache = new Map<string, ChamberPopularVote | null>();

export function projectChamberPopularVote(abbr: string, chamber: Chamber, opts: PopularVoteOptions = {}): ChamberPopularVote | null {
  const year = opts.targetYear ?? electionYear;
  const live = !opts.backtest && !opts.levels && !opts.basisWeights && opts.shrinkVotes == null && opts.unopposedFactor == null;
  const cacheKey = `${abbr}:${chamber}:${year}`;
  if (live && _cache.has(cacheKey)) return _cache.get(cacheKey)!;
  const out = build(abbr, chamber, year, opts);
  if (live) _cache.set(cacheKey, out);
  return out;
}

function build(abbr: string, chamber: Chamber, year: number, opts: PopularVoteOptions): ChamberPopularVote | null {
  if (UNICAMERAL_STATES.has(abbr)) return null;   // nonpartisan: no D/R vote to project
  const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
  if (roster.length === 0) return null;
  const levels = opts.levels ?? liveLevels();
  const lvl = levels.get(abbr);
  if (!lvl || lvl.votes <= 0) return null;
  const weights = opts.basisWeights ?? C.BASIS_WEIGHTS;
  const K = opts.shrinkVotes ?? C.DROPOFF_SHRINK_VOTES;
  const unopposedFactor = opts.unopposedFactor ?? C.UNOPPOSED_TURNOUT;
  const maxYear = year - 1;
  const bt = opts.backtest;

  // Projections (and, in the backtest, the year's own results as the ballot).
  const targetBlock = bt ? stateLegResults[abbr]?.[String(year)]?.[chamber] : undefined;
  if (bt && (!targetBlock || eraOf(abbr, chamber, year) !== "current")) return null;
  const targetIndex = targetBlock ? indexByNormalizedKey(targetBlock.districts) : null;
  const liveChamber = bt ? null : projectChamber(abbr, chamber, year);
  if (!bt && !liveChamber) return null;
  const liveProjection = liveChamber ? new Map(liveChamber.districts.map((p) => [p.key, p])) : null;
  const seatsFallback = new Map<string, number>();
  const items: { d: StateLegDistrict; pr: DistrictProjection; ballot: Ballot }[] = [];
  for (const d of roster) {
    if (bt) {
      const r = targetIndex ? lookupByDistrictCode(targetIndex, abbr, chamber, d.number) : undefined;
      if (!r) continue;
      const inc = (r.candidates ?? []).filter((c) => c.incumbent);
      const parties = new Set(inc.map((c) => c.party));
      const incSign = parties.size === 1 ? ([...parties][0] === "R" ? 1 : [...parties][0] === "D" ? -1 : 0) : 0;
      const pr = projectDistrict(abbr, chamber, d, { maxYear, targetYear: year, targetE: bt.E, targetIncSign: incSign, incumbencyPts: bt.incumbencyPts });
      const ballot = ballotFromResult(r, pr, 1);
      seatsFallback.set(d.number, ballot.seats);
      items.push({ d, pr, ballot });
    } else {
      const pr = liveProjection?.get(d.number);
      if (!pr || pr.contest === "not-up") continue;
      seatsFallback.set(d.number, pr.seats);
      items.push({ d, pr, ballot: ballotFromProjection(pr, d) });
    }
  }
  if (items.length === 0) return null;

  // Turnout factors from the basis years, each on its own lines, relocated to today's.
  const presNow = presOn(abbr, chamber, "current", presYearFor(year));
  if (presNow.total <= 0) return null;
  const fallbackFor = (key: string) => seatsFallback.get(key) ?? 1;
  const bases = Object.entries(weights).map(([y, w]) => ({ year: Number(y), weight: w })).filter((b) => b.year < year && b.weight > 0);
  const yearData = bases.map((b) => ({ ...b, ...yearFactors(abbr, chamber, b.year, fallbackFor) }));
  let meanNum = 0, meanDen = 0;
  for (const y of yearData) if (y.mean != null) { meanNum += y.weight * y.mean; meanDen += y.weight; }
  const chamberMean = meanDen > 0 ? meanNum / meanDen : null;
  if (chamberMean == null) return null;

  const factorOf = (key: string, presVotes: number): { factor: number; basis: DistrictVote["factorBasis"] } => {
    let num = 0, den = 0, relocated = false;
    for (const y of yearData) {
      if (y.mean == null) continue;
      let f: number | null = null;
      if (y.era === "current") f = y.own.get(key) ?? null;
      else {
        const shares = compositeShares(abbr, chamber, key, y.era);
        let w = 0, s = 0;
        for (const [oldKey, share] of Object.entries(shares)) { const fo = y.own.get(oldKey); if (fo != null) { w += share; s += share * fo; } }
        if (w >= FC.MIN_COVERAGE) { f = s / w; relocated = true; }
      }
      if (f != null) { num += y.weight * f; den += y.weight; }
    }
    if (den <= 0) return { factor: chamberMean, basis: "chamber" };
    const own = num / den;
    return { factor: (presVotes * own + K * chamberMean) / (presVotes + K), basis: relocated ? "relocated" : "own" };
  };

  const o = otherShares(abbr, chamber, maxYear);
  // Whether the state prints unopposed races is law, not a forecast: the backtest reads it from the year itself.
  const prints = bt ? printsUnopposed(abbr, chamber, year, 1) : printsUnopposed(abbr, chamber, maxYear);
  const districts: DistrictVote[] = [];
  let raw: Split = ZERO, adj: Split = ZERO, rawN = 0, adjN = 0, uncounted = 0, imputed = 0, skipped = 0;
  for (const { d, ballot } of items) {
    const pv = presNow.get(d.number);
    const presShare = pv ? pv / presNow.total : 0;
    const { factor, basis } = pv ? factorOf(d.number, pv) : { factor: 0, basis: "none" as const };
    const full = lvl.votes * presShare * factor * ballot.seats;   // contested turnout, all seats
    const fullyContested = ballot.contest === "contested" && ballot.guaranteed.dem === 0 && ballot.guaranteed.rep === 0;
    const rs = pv ? rawSplit(ballot, full, o, prints, unopposedFactor) : null;
    const counted = rs != null && rs.votes > 0;
    // Adjusted: the seat as a contested two-party race on the projection's margin.
    let adjusted: DistrictVote["adjusted"] = null;
    if (pv && ballot.margin != null && full > 0) {
      const s = fullyContested && rs ? rs : twoWay(full, ballot.margin, ballot.hasO && fullyContested ? o.contestedWithO : o.contestedNoO);
      adjusted = { ...s, margin: s.votes > 0 ? ((s.rep - s.dem) / s.votes) * 100 : 0 };
    }
    const other = ballot.hasO ? (ballot.contest === "contested" ? o.contestedWithO : o.onePartyWithO) : o.contestedNoO;
    const row: DistrictVote = {
      key: d.number, label: d.label, seats: ballot.seats, contest: ballot.contest, factor, factorBasis: basis, presShare,
      votes: counted ? rs!.votes : 0, dem: counted ? rs!.dem : 0, rep: counted ? rs!.rep : 0, oth: counted ? rs!.oth : 0,
      margin: counted && rs!.votes > 0 ? ((rs!.rep - rs!.dem) / rs!.votes) * 100 : null,
      counted, adjusted, imputed: adjusted != null && !fullyContested, otherShare: other,
    };
    districts.push(row);
    if (counted) { raw = add(raw, rs!); rawN += 1; } else if (pv) uncounted += 1;
    if (adjusted) { adj = add(adj, adjusted); adjN += 1; if (row.imputed) imputed += 1; }
    else if (counted) { adj = add(adj, rs!); adjN += 1; }   // no lean to impute with: the raw race stands
    else skipped += 1;
  }
  const pool = (s: Split, districts: number): PopularVotePool => ({ ...s, margin: s.votes > 0 ? ((s.rep - s.dem) / s.votes) * 100 : null, districts });
  return {
    abbr, chamber, year,
    level: { votes: lvl.votes, low: lvl.low, high: lvl.high },
    chamberFactor: lvl.votes > 0 ? raw.votes / lvl.votes : 0,
    chamberMeanFactor: chamberMean,
    printsUnopposed: prints,
    otherShares: o,
    districts,
    raw: { ...pool(raw, rawN), uncounted },
    adjusted: { ...pool(adj, adjN), imputed, skipped },
    low: lvl.votes > 0 ? (raw.votes * lvl.low) / lvl.votes : raw.votes,
    high: lvl.votes > 0 ? (raw.votes * lvl.high) / lvl.votes : raw.votes,
  };
}

/** Every chamber on the ballot, for the board and the methodology tab. */
export function projectAllChamberPopularVotes(year: number = electionYear): ChamberPopularVote[] {
  const out: ChamberPopularVote[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const p = projectChamberPopularVote(abbr, chamber, { targetYear: year });
      if (p) out.push(p);
    }
  }
  return out;
}
