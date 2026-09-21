import { racePolls, type RacePoll } from "@/data/racePolls";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { pollsterIdOf } from "@/lib/pollsterRatings";

// ── Race polling average (Phase 5 of the forecast revamp) ────────────────────
// The same recipe as the generic-ballot average (lib/genericBallotAverage.ts):
//   1. one survey per pollster — its most recent — so trackers don't win by volume
//      (pollsters are matched by rating id, so "Siena College" and "Siena University" are one);
//   2. recency: full weight for 14 days after the field period, then halving every
//      14 days;
//   3. sample: weight ∝ √sample (capped at 3,000; median sample when unpublished).
// On top of that the average reports how much evidence it rests on:
//   nEff = Σ recency weights over the deduped polls (a fresh poll counts 1, a
//   six-week-old one ½, …), which the forecast turns into the poll's share of the
//   final margin, w = nEff / (nEff + POLL_K[office]). POLL_K is fitted by the forward
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
// House effects: each poll's margin is also read net of its pollster's current-cycle lean
// relative to the field (`houseFor`, from lib/pollsterHouseEffects.ts). Pollster quality
// grades (lib/pollsterRatings.ts) are displayed but deliberately NOT a weight — past
// accuracy does not predict next-cycle accuracy (scripts/forwardBacktest.ts --pollsters).

const RECENCY_FULL_WEIGHT_DAYS = 14;
const RECENCY_HALF_LIFE_DAYS = 14;
const SAMPLE_CAP = 3000;
const MS_PER_DAY = 86400000;

export type WeightedRacePoll = RacePoll & { ageDays: number; recency: number; weight: number; shift: number; house: number };
export interface RacePollAverage {
  diff: number;   // R-positive margin (rep − dem), aging shift and house-effect adjustment included
  aging: number;  // weighted mean aging shift inside diff (0 when no shift is supplied)
  house: number;  // weighted mean house effect REMOVED from diff (R-positive; 0 when none is supplied)
  dem: number;
  rep: number;
  nEff: number;   // effective poll count (Σ recency weights, one per pollster)
  n: number;      // distinct pollsters
  polls: WeightedRacePoll[];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 800;
  const s = [...nums].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Weighted average of `polls` completed on or before `asOf`; null when none qualify. `shiftFor` = R-positive aging shift per poll; `houseFor` = the pollster's R-positive house effect, subtracted. */
export function computeRacePollAverage(polls: RacePoll[], asOf: Date, shiftFor?: (p: RacePoll) => number, houseFor?: (p: RacePoll) => number): RacePollAverage | null {
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
    const recency = ageDays <= RECENCY_FULL_WEIGHT_DAYS ? 1 : 0.5 ** ((ageDays - RECENCY_FULL_WEIGHT_DAYS) / RECENCY_HALF_LIFE_DAYS);
    return { ...p, ageDays, recency, weight: recency * Math.sqrt(Math.min(p.sample ?? fallback, SAMPLE_CAP)), shift: shiftFor?.(p) ?? 0, house: houseFor?.(p) ?? 0 };
  });
  const total = weighted.reduce((s, p) => s + p.weight, 0);
  const mean = (pick: (p: WeightedRacePoll) => number) => weighted.reduce((s, p) => s + p.weight * pick(p), 0) / total;
  const dem = mean((p) => p.dem), rep = mean((p) => p.rep), aging = mean((p) => p.shift), house = mean((p) => p.house);
  return { diff: rep - dem + aging - house, aging, house, dem, rep, nEff: weighted.reduce((s, p) => s + p.recency, 0), n: weighted.length, polls: weighted.sort((a, b) => b.endDate.localeCompare(a.endDate)) };
}

/** Share of the final margin the poll average gets, given its evidence and the office's k. */
export function pollWeight(nEff: number, office: "H" | "S" | "G"): number {
  const k = F.POLL_K[office];
  return k <= 0 ? 1 : nEff / (nEff + k);
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
export function getRacePollAverage(office: "H" | "S" | "G", stateAbbr: string, raceLabel: string, asOf: Date = new Date(), shiftFor?: (p: RacePoll) => number, houseFor?: (p: RacePoll) => number): RacePollAverage | null {
  const polls = racePolls[racePollKey(office, stateAbbr, raceLabel)];
  return polls ? computeRacePollAverage(polls, asOf, shiftFor, houseFor) : null;
}
