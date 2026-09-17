import { racePolls, type RacePoll } from "@/data/racePolls";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";

// ── Race polling average (Phase 5 of the forecast revamp) ────────────────────
// The same recipe as the generic-ballot average (lib/genericBallotAverage.ts):
//   1. one survey per pollster — its most recent — so trackers don't win by volume;
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

const RECENCY_FULL_WEIGHT_DAYS = 14;
const RECENCY_HALF_LIFE_DAYS = 14;
const SAMPLE_CAP = 3000;
const MS_PER_DAY = 86400000;

export type WeightedRacePoll = RacePoll & { ageDays: number; recency: number; weight: number };
export interface RacePollAverage {
  diff: number;   // R-positive margin (rep − dem)
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

/** Weighted average of `polls` completed on or before `asOf`; null when none qualify. */
export function computeRacePollAverage(polls: RacePoll[], asOf: Date): RacePollAverage | null {
  const cutoff = asOf.toISOString().slice(0, 10);
  const latest = new Map<string, RacePoll>();
  for (const p of polls) {
    if (p.endDate > cutoff) continue;
    const cur = latest.get(p.pollster);
    if (!cur || p.endDate > cur.endDate) latest.set(p.pollster, p);
  }
  const deduped = [...latest.values()];
  if (deduped.length === 0) return null;
  const fallback = median(deduped.map((p) => p.sample).filter((s): s is number => s != null));
  const weighted: WeightedRacePoll[] = deduped.map((p) => {
    const ageDays = Math.max(0, (asOf.getTime() - new Date(p.endDate).getTime()) / MS_PER_DAY);
    const recency = ageDays <= RECENCY_FULL_WEIGHT_DAYS ? 1 : 0.5 ** ((ageDays - RECENCY_FULL_WEIGHT_DAYS) / RECENCY_HALF_LIFE_DAYS);
    return { ...p, ageDays, recency, weight: recency * Math.sqrt(Math.min(p.sample ?? fallback, SAMPLE_CAP)) };
  });
  const total = weighted.reduce((s, p) => s + p.weight, 0);
  const mean = (pick: (p: WeightedRacePoll) => number) => weighted.reduce((s, p) => s + p.weight * pick(p), 0) / total;
  const dem = mean((p) => p.dem), rep = mean((p) => p.rep);
  return { diff: rep - dem, dem, rep, nEff: weighted.reduce((s, p) => s + p.recency, 0), n: weighted.length, polls: weighted.sort((a, b) => b.endDate.localeCompare(a.endDate)) };
}

/** Share of the final margin the poll average gets, given its evidence and the office's k. */
export function pollWeight(nEff: number, office: "H" | "S" | "G"): number {
  const k = F.POLL_K[office];
  return k <= 0 ? 1 : nEff / (nEff + k);
}

export const racePollKey = (office: "H" | "S" | "G", stateAbbr: string, raceLabel: string) => `${office}:${stateAbbr}:${raceLabel}`;

/** The live 2026 average for a race (data/racePolls.ts), as of `asOf`. */
export function getRacePollAverage(office: "H" | "S" | "G", stateAbbr: string, raceLabel: string, asOf: Date = new Date()): RacePollAverage | null {
  const polls = racePolls[racePollKey(office, stateAbbr, raceLabel)];
  return polls ? computeRacePollAverage(polls, asOf) : null;
}
