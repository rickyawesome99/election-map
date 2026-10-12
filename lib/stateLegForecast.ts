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
import { contest2026 } from "@/lib/stateLegAtlas";
import { marginToRating } from "@/lib/colorScale";

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
 *                present), years on YEAR_WEIGHTS × coverage, two-pass Huber (HUBER_C) on seat rows.
 *   4. Forward   margin = lean + β* × E(2026) + INCUMBENCY_PTS × incumbent sign (the 2026 field's
 *                incumbent); no Democrat or no Republican in the field decides the seat outright.
 *   5. Spread    σ² = SIGMA² + STATE_SHOCK² + (β* σ_E)²; P(D) is the normal tail.
 *   6. Chamber   5,000 draws of a shared national shock, a shared chamber shock (STATE_SHOCK) and
 *                independent SIGMA noise per seat;
 *                seats not on the ballot hold their sitting member's party.
 */

export const STATE_LEG_FORECAST_CONSTANTS = {
  TYPE_WEIGHTS: { P: 0.6, L: 0.2 } as Record<"P" | "L", number>, // the District TPL's P/H ratio: a seat's own race is to its district what a House race is to a congressional district
  INCUMBENCY_PTS: 3.0,   // fitted by scripts/stateLegBacktest.ts (2026-10-10): see methodology
  SIGMA: 7.0,            // seat-level noise beyond the national and chamber shocks, fitted by the backtest (holdout residual spread after τ: 7.0 / 7.2)
  STATE_SHOCK: 4.0,      // chamber-level shock τ shared by every seat of a chamber in a year, fitted by the backtest (chamber-mean residual spread: 3.8 / 3.9)
  MIN_COVERAGE: 0.5,     // a relocated row needs contested old districts covering this share of today's population
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
  contest: "contested" | "uncontested-D" | "uncontested-R" | "none" | "other" | "not-up";
  seats: number;
  candidates2026: StateLegDistrictCandidates2026 | null;
}

export interface ChamberProjection {
  abbr: string;
  chamber: Chamber;
  year: number;
  districts: DistrictProjection[];
  totalSeats: number | null;
  seatsUp: number;
  holdover: { dem: number; rep: number; oth: number };
  decided: { dem: number; rep: number };
  expectedDem: number;
  expectedRep: number;
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

function contestedMargin(r: { demVotes: number | null; repVotes: number | null; totalVotes: number | null; noCount?: boolean }): number | null {
  if (r.noCount || !r.totalVotes || !r.demVotes || !r.repVotes) return null;
  if (r.demVotes <= 0 || r.repVotes <= 0) return null;
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
}

export function projectDistrict(abbr: string, chamber: Chamber, district: StateLegDistrict, opts: ProjectOptions = {}): DistrictProjection {
  const fit = getTplFit();
  const beta = fit.beta[abbr]?.shrunk ?? 1;
  const key = district.number;
  const maxYear = opts.maxYear ?? Number.POSITIVE_INFINITY;
  const incPts = opts.incumbencyPts ?? C.INCUMBENCY_PTS;
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
      const base = present.reduce((s, t) => s + C.TYPE_WEIGHTS[t], 0);
      const wrs = present.reduce((s, t) => s + (C.TYPE_WEIGHTS[t] / base) * (typeNM[t]! / typeW[t]!), 0);
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
      const base = present.reduce((s, t) => s + C.TYPE_WEIGHTS[t], 0);
      r.weight = ((yearShare[y] ?? 0) / den) * (C.TYPE_WEIGHTS[r.kind] / base) * ((r.coverage * r.huber) / (typeW || 1));
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
  const c26 = contest2026(field ?? undefined);
  const up = seatsUpIn(district, targetYear) > 0;
  let incSign = opts.targetIncSign ?? 0;
  if (opts.targetIncSign == null && field) {
    const inc = field.candidates.filter((x) => x.incumbent && !x.writeIn);
    const parties = new Set(inc.map((x) => x.party));
    incSign = parties.size === 1 ? ([...parties][0] === "R" ? 1 : [...parties][0] === "D" ? -1 : 0) : 0;
  }
  const envPts = beta * E;
  const incFwd = incPts * incSign;
  const sigma = Math.sqrt((opts.sigma ?? C.SIGMA) ** 2 + C.STATE_SHOCK ** 2 + (beta * sigmaE) ** 2);
  const contest: DistrictProjection["contest"] = !up ? "not-up" : c26 ? c26.status : "contested";
  const margin = lean == null ? null : lean + envPts + incFwd;
  const pD = margin == null || contest === "not-up" ? null
    : contest === "uncontested-D" ? 1 : contest === "uncontested-R" ? 0
    : contest === "contested" ? winProbabilityD(margin, sigma) : null;
  // Seats on the ballot in this district: the roster's per-seat cycle (West Virginia's Senate
  // puts one of a district's two seats up each cycle), falling back to the field's seat count.
  const seats = up ? Math.max(1, seatsUpIn(district, targetYear)) : (field?.seats ?? district.seats ?? 1);
  return {
    key, label: district.label, rows, lean, beta, envPts, incSign, incPts: incFwd, margin, sigma, pD,
    rating: margin == null || contest !== "contested" ? null : marginToRating(margin),
    contest, seats, candidates2026: field,
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
  const decided = { dem: 0, rep: 0 };
  const sim: { d: DistrictProjection; seats: number }[] = [];
  let seatsUp = 0, unprojected = 0;
  for (const d of upDistricts) {
    const seats = d.seats;
    seatsUp += seats;
    if (d.contest === "uncontested-D") decided.dem += seats;
    else if (d.contest === "uncontested-R") decided.rep += seats;
    else if (d.contest === "contested" && d.margin != null) sim.push({ d, seats });
    else unprojected += seats;   // nonpartisan Nebraska, no listed candidates, no lean: no projection
  }
  // Control odds mean nothing when the unprojected seats alone could decide them.
  const controlKnown = unprojected < Math.max(1, Math.round(0.1 * (holdover.dem + holdover.rep + holdover.oth + seatsUp)));
  const env = getNationalEnvironment();
  const sigmaE = env.sigmaE;
  const rand = mulberry32(20261103 + abbr.charCodeAt(0) * 7 + (chamber === "house" ? 1 : 2));
  const sims = C.SIMS;
  const counts = new Array<number>(sims);
  for (let k = 0; k < sims; k += 1) {
    const z = gaussian(rand) * sigmaE;
    // The chamber shock: one draw every seat of the chamber shares, on top of the national one.
    const zc = gaussian(rand) * C.STATE_SHOCK;
    let dem = holdover.dem + decided.dem;
    for (const { d, seats } of sim) {
      for (let s = 0; s < seats; s += 1) {
        const m = d.margin! + d.beta * z + zc + gaussian(rand) * C.SIGMA;
        if (m <= 0) dem += 1;
      }
    }
    counts[k] = dem;
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sims - 1, Math.floor(p * sims))];
  const info = stateLegMapInfo[abbr]?.[chamber];
  const totalSeats = info?.totalSeats ?? stateLegCalendar[abbr]?.[chamber]?.eras.at(-1)?.totalSeats ?? null;
  const majority = totalSeats != null ? Math.floor(totalSeats / 2) + 1 : null;
  const supermajority = info?.supermajoritySeats ?? null;
  const meanDem = counts.reduce((a, b) => a + b, 0) / sims;
  const projectedTotal = holdover.dem + holdover.rep + holdover.oth + seatsUp;
  const repOf = (dem: number) => projectedTotal - holdover.oth - dem;
  const out: ChamberProjection = {
    abbr, chamber, year, districts, totalSeats, seatsUp, holdover, decided,
    expectedDem: meanDem, expectedRep: repOf(meanDem), lo80: q(0.1), hi80: q(0.9),
    majority, supermajority,
    pDemControl: majority == null || !controlKnown ? null : counts.filter((c) => c >= majority).length / sims,
    pRepControl: majority == null || !controlKnown ? null : counts.filter((c) => repOf(c) >= majority).length / sims,
    pDemSuper: supermajority == null || !controlKnown ? null : counts.filter((c) => c >= supermajority).length / sims,
    pRepSuper: supermajority == null || !controlKnown ? null : counts.filter((c) => repOf(c) >= supermajority).length / sims,
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
