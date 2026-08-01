import { trumpApprovalPolls, TrumpApprovalPoll } from "@/data/trumpApprovalPolls";

export const APPROVE_COLOR = "#22c55e";
export const DISAPPROVE_COLOR = "#ef4444";

// ── Methodology ──────────────────────────────────────────────────────────────
// Same approach as §lib/genericBallotAverage.ts:
// 1. Dedupe: keep only each pollster's single most recent survey, so high-frequency
//    pollsters (e.g. weekly Economist/YouGov or Morning Consult trackers) don't
//    dominate the average purely through volume.
// 2. Recency weight: full weight for polls completed in the last 14 days; beyond
//    that the weight halves every additional 14 days (exponential decay), so the
//    average tracks the current environment while still incorporating older data.
// 3. Sample-size weight: weight ∝ sqrt(sample size), capped at 3,000 respondents so
//    a single very large tracking poll can't swamp everyone else. Polls that don't
//    publish a sample size fall back to the median sample size among the dedup set.
// 4. aggregate = Σ(weight_i × diff_i) / Σ(weight_i), where diff = disapprove - approve.

const RECENCY_FULL_WEIGHT_DAYS = 14;
const RECENCY_HALF_LIFE_DAYS = 14;
const SAMPLE_CAP = 3000;

const MS_PER_DAY = 86400000;

function median(nums: number[]): number {
  if (nums.length === 0) return 1000;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type WeightedTrumpApprovalPoll = TrumpApprovalPoll & {
  ageDays: number;
  weight: number;
};

export type TrumpApprovalAverage = {
  diff: number;
  approve: number;
  disapprove: number;
  polls: WeightedTrumpApprovalPoll[];
};

export function computeTrumpApprovalAverage(
  asOf: Date = new Date(),
  polls: TrumpApprovalPoll[] = trumpApprovalPolls
): TrumpApprovalAverage {
  const latestByPollster = new Map<string, TrumpApprovalPoll>();
  for (const poll of polls) {
    const existing = latestByPollster.get(poll.pollster);
    if (!existing || poll.endDate > existing.endDate) {
      latestByPollster.set(poll.pollster, poll);
    }
  }
  const deduped = Array.from(latestByPollster.values());

  const knownSamples = deduped
    .map((p) => p.sample)
    .filter((s): s is number => s != null);
  const fallbackSample = median(knownSamples);

  const weighted: WeightedTrumpApprovalPoll[] = deduped.map((poll) => {
    const ageDays = Math.max(0, (asOf.getTime() - new Date(poll.endDate).getTime()) / MS_PER_DAY);
    const recencyWeight =
      ageDays <= RECENCY_FULL_WEIGHT_DAYS
        ? 1
        : Math.pow(0.5, (ageDays - RECENCY_FULL_WEIGHT_DAYS) / RECENCY_HALF_LIFE_DAYS);
    const sample = Math.min(poll.sample ?? fallbackSample, SAMPLE_CAP);
    const sampleWeight = Math.sqrt(sample);
    return { ...poll, ageDays, weight: recencyWeight * sampleWeight };
  });

  const totalWeight = weighted.reduce((sum, p) => sum + p.weight, 0);
  const weightedMean = (pick: (p: WeightedTrumpApprovalPoll) => number) =>
    totalWeight > 0 ? weighted.reduce((sum, p) => sum + p.weight * pick(p), 0) / totalWeight : 0;

  const approve = weightedMean((p) => p.approve);
  const disapprove = weightedMean((p) => p.disapprove);

  return {
    diff: parseFloat((disapprove - approve).toFixed(1)),
    approve: parseFloat(approve.toFixed(1)),
    disapprove: parseFloat(disapprove.toFixed(1)),
    polls: weighted,
  };
}
