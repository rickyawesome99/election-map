import { racePolls, type RacePoll } from "@/data/racePolls";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { pollsterIdOf } from "@/lib/pollsterRatings";

// ── Race polling average (Phase 5 of the forecast revamp) ────────────────────
// The same recipe as the generic-ballot average (lib/genericBallotAverage.ts):
//   1. one survey per pollster — its most recent — so trackers don't win by volume
//      (pollsters are matched by rating id, so "Siena College" and "Siena University" are one);
//   2. recency: full weight for 14 days after the field period, then halving every
//      POLL_HALF_LIFE_DAYS[office] days (House and Governor 45, Senate 14 — the
//      generic ballot keeps 14; fitted 2026-10-23, see data/tplModelData.ts);
//   3. sample: weight ∝ √sample (capped at 3,000; median sample when unpublished).
// On top of that the average reports how much evidence it rests on:
//   nEff = Σ recency weights over the deduped polls (a fresh poll counts 1, a
//   six-week-old one ½, …), which the forecast turns into the poll's share of the
//   final margin, w = min(POLL_W_MAX, nEff / (nEff + POLL_K[office])). POLL_K is fitted by the forward
//   backtest (scripts/forwardBacktest.ts --polls) and falls as the election nears.
// Partisan (campaign / party-sponsored) polls are kept but flagged; the harness
// found no gain from dropping them.
//
// Poll aging: a poll is a reading of the race on its field date, and the national
// environment has moved since. Each poll's margin is shifted by
//   POLL_AGING_SHARE × β*(state) × (generic ballot now − generic ballot on its end date)
// before averaging (the caller supplies that as `shiftFor`), so a June poll taken at
// D+3 nationally is read as if taken at today's D+6. dem/rep stay the raw shares.
//
// Undecided voters: a poll's margin is its raw R% − D% stretched by
//   f = 1 + POLL_UNDECIDED_ALLOCATION × min(100 − D% − R%, POLL_UNDECIDED_CAP) / (D% + R%)
// i.e. up to CAP points of everyone not choosing the two candidates count as undecided, and that
// share of them is split between the two in proportion to their current shares; beyond the cap
// the remainder is a third candidate's vote or non-voters and stays out. At the live full
// allocation capped at 10: a 45–26 poll (29 not choosing) reads R+19 × (1 + 10/71) = R+21.7; a
// 47–41 poll (12 not choosing) reads D+6 × (1 + 10/88) = D+6.7; a 48–46 poll (6 not choosing)
// reads R+2 × (1 + 6/94) = R+2.1. The leader's lead grows, the order never changes, and no
// direction (incumbent, challenger, party) is assumed. dem/rep stay the raw shares.
//
// House effects: each poll's margin is also read net of its pollster's current-cycle lean
// relative to the field (`houseFor`, from lib/pollsterHouseEffects.ts). Pollster quality
// grades (lib/pollsterRatings.ts) are displayed but deliberately NOT a weight — past
// accuracy does not predict next-cycle accuracy (scripts/forwardBacktest.ts --pollsters).

const RECENCY_FULL_WEIGHT_DAYS = 14;
const RECENCY_HALF_LIFE_DAYS = 14; // default when no office half-life is given
const SAMPLE_CAP = 3000;
const MS_PER_DAY = 86400000;

export type WeightedRacePoll = RacePoll & { ageDays: number; recency: number; weight: number; shift: number; house: number; undecided: number };
export interface RacePollAverage {
  diff: number;   // R-positive margin (rep − dem), aging shift and house-effect adjustment included
  aging: number;  // weighted mean aging shift inside diff (0 when no shift is supplied)
  undecided: number; // weighted mean margin added by allocating undecided voters (R-positive)
  house: number;  // weighted mean house effect REMOVED from diff (R-positive; 0 when none is supplied)
  dem: number;
  rep: number;
  nEff: number;   // effective poll count (Σ recency weights, one per pollster)
  n: number;      // distinct pollsters
  polls: WeightedRacePoll[];
}

/** Optional per-call rules on top of the live recipe (backtest experiments; empty = live behavior). */
export interface RaceAverageRules {
  maxAgeDays?: number;        // polls older than this keep their row but get weight 0
  decidedPower?: number;      // weight × ((D + R) / 100) ^ power — less trust in polls with many undecided
  decidedInEvidence?: boolean; // apply that factor to nEff too (so w falls as well)
  noAllocationAbove?: number; // no undecided allocation for polls with more than this share not choosing
}

/** Factor a poll's raw margin is multiplied by when `share` of the voters not choosing either candidate is allocated proportionally. */
export function undecidedFactor(dem: number, rep: number, share: number = F.POLL_UNDECIDED_ALLOCATION, cap: number = F.POLL_UNDECIDED_CAP): number {
  const two = dem + rep;
  // Only up to `cap` points of the non-choosing share count as undecided: beyond that it is a
  // third candidate's vote (Montana Senate's independent polls ~30%), which no allocation should hand out.
  return share > 0 && two >= 20 && two < 100 ? 1 + (share * Math.min(100 - two, cap)) / two : 1;
}
/** The poll with its margin (`diff`) carrying the undecided allocation — what house effects are estimated on. */
export const allocateUndecided = (p: RacePoll, share: number = F.POLL_UNDECIDED_ALLOCATION, cap: number = F.POLL_UNDECIDED_CAP): RacePoll => ({ ...p, diff: (p.rep - p.dem) * undecidedFactor(p.dem, p.rep, share, cap) });

function median(nums: number[]): number {
  if (nums.length === 0) return 800;
  const s = [...nums].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Weighted average of `polls` completed on or before `asOf`; null when none qualify. `shiftFor` = R-positive aging shift per poll; `houseFor` = the pollster's R-positive house effect, subtracted; `halfLife` = recency half-life in days (the office's POLL_HALF_LIFE_DAYS). */
export function computeRacePollAverage(polls: RacePoll[], asOf: Date, shiftFor?: (p: RacePoll) => number, houseFor?: (p: RacePoll) => number, halfLife: number = RECENCY_HALF_LIFE_DAYS, undecidedShare: number = F.POLL_UNDECIDED_ALLOCATION, undecidedCap: number = F.POLL_UNDECIDED_CAP, rules: RaceAverageRules = {}): RacePollAverage | null {
  const cutoff = asOf.toISOString().slice(0, 10);
  const latest = new Map<string, RacePoll>();
  for (const p of polls) {
    if (p.endDate > cutoff) continue;
    const id = pollsterIdOf(p.pollster), cur = latest.get(id);
    if (!cur || p.endDate > cur.endDate) latest.set(id, p);
  }
  const deduped = [...latest.values()];
  if (deduped.length === 0) return null;
  const fallback = median(deduped.map((p) => p.sample).filter((s): s is number => s != null));
  const weighted: WeightedRacePoll[] = deduped.map((p) => {
    const ageDays = Math.max(0, (asOf.getTime() - new Date(p.endDate).getTime()) / MS_PER_DAY);
    const agedOut = rules.maxAgeDays != null && ageDays > rules.maxAgeDays;
    const recency = agedOut ? 0 : ageDays <= RECENCY_FULL_WEIGHT_DAYS ? 1 : 0.5 ** ((ageDays - RECENCY_FULL_WEIGHT_DAYS) / halfLife);
    const notChoosing = 100 - p.dem - p.rep;
    const decided = rules.decidedPower ? Math.min(1, Math.max(0, (p.dem + p.rep) / 100)) ** rules.decidedPower : 1;
    const allocate = rules.noAllocationAbove == null || notChoosing <= rules.noAllocationAbove;
    return { ...p, ageDays, recency: rules.decidedInEvidence ? recency * decided : recency, weight: recency * decided * Math.sqrt(Math.min(p.sample ?? fallback, SAMPLE_CAP)), shift: shiftFor?.(p) ?? 0, house: houseFor?.(p) ?? 0, undecided: allocate ? (p.rep - p.dem) * (undecidedFactor(p.dem, p.rep, undecidedShare, undecidedCap) - 1) : 0 };
  });
  const total = weighted.reduce((s, p) => s + p.weight, 0);
  if (!(total > 0)) return null; // every poll aged out: the race runs on the Model alone
  const mean = (pick: (p: WeightedRacePoll) => number) => weighted.reduce((s, p) => s + p.weight * pick(p), 0) / total;
  const dem = mean((p) => p.dem), rep = mean((p) => p.rep), aging = mean((p) => p.shift), house = mean((p) => p.house), undecided = mean((p) => p.undecided);
  return { diff: rep - dem + undecided + aging - house, aging, house, undecided, dem, rep, nEff: weighted.reduce((s, p) => s + p.recency, 0), n: weighted.length, polls: weighted.sort((a, b) => b.endDate.localeCompare(a.endDate)) };
}

/** Share of the final margin the poll average gets, given its evidence and the office's k. */
export function pollWeight(nEff: number, office: "H" | "S" | "G"): number {
  const k = F.POLL_K[office];
  return Math.min(F.POLL_W_MAX, k <= 0 ? 1 : nEff / (nEff + k));
}

export const racePollKey = (office: "H" | "S" | "G", stateAbbr: string, raceLabel: string) => `${office}:${stateAbbr}:${raceLabel}`;

/**
 * The aging shift for polls of a race in a state with elasticity `beta`, as of `asOf`:
 * share × β* × (GB on asOf − GB on the poll's end date), R-positive. `gbAt` is a
 * genericBallotSeries(); a date it cannot price shifts by 0.
 */
export function pollAgingShift(gbAt: (isoDate: string) => number | null, beta: number, asOf: Date, share: number = F.POLL_AGING_SHARE): (p: RacePoll) => number {
  const now = gbAt(asOf.toISOString().slice(0, 10));
  return (p) => {
    const then = gbAt(p.endDate);
    return now == null || then == null ? 0 : share * beta * (now - then);
  };
}

/** The live 2026 average for a race (data/racePolls.ts), as of `asOf`. */
export function getRacePollAverage(office: "H" | "S" | "G", stateAbbr: string, raceLabel: string, asOf: Date = new Date(), shiftFor?: (p: RacePoll) => number, houseFor?: (p: RacePoll) => number, halfLife: number = F.POLL_HALF_LIFE_DAYS[office]): RacePollAverage | null {
  const polls = racePolls[racePollKey(office, stateAbbr, raceLabel)];
  return polls ? computeRacePollAverage(polls, asOf, shiftFor, houseFor, halfLife) : null;
}
