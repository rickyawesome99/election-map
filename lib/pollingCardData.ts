import "server-only";
import { genericBallotPolls, type GenericBallotPoll } from "@/data/genericBallotPolls";
import { trumpApprovalPolls, type TrumpApprovalPoll } from "@/data/trumpApprovalPolls";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";

// The national polling card's numbers (components/PollingAverageCard), built on the server: the
// daily trend reruns the weighted average once per day of the cycle, which on a phone was a third
// of a second of main-thread work on every Overview load. The card gets only the results.

const MS_PER_DAY = 86400000;
const TREND_STEP_DAYS = 1;
// The card prints one decimal; two keep the props small without moving any shown figure.
const r2 = (v: number) => Math.round(v * 100) / 100;

/** One poll in either series; a/b follow each file's diff convention (diff = b − a). */
export type NormalizedPoll = {
  pollster: string;
  startDate: string;
  endDate: string;
  sample: number | null;
  population: string | null;
  a: number;
  b: number;
  diff: number;
};
export type TrendPoint = { x: number; a: number; b: number; diff: number };

export type PollSeries = {
  polls: NormalizedPoll[];
  /** includedKeys: `${pollster}::${endDate}` of the polls in today's average. */
  average: { diff: number; a: number; b: number; includedKeys: string[] };
  trend: TrendPoint[];
};
export type PollingCardData = { genericBallot: PollSeries; approval: PollSeries };

export const pollKey = (p: { pollster: string; endDate: string }) => `${p.pollster}::${p.endDate}`;

// Trend line: at each daily checkpoint, the weighted average computed from only the
// polls available as of that date — i.e. "what the average would have shown that day,"
// using the same dedupe/recency/sample-weight methodology throughout (§lib/genericBallotAverage,
// §lib/trumpApprovalAverage).
function buildTrend<P extends { endDate: string }>(
  polls: P[],
  computeAverage: (asOf: Date, polls: P[]) => { a: number; b: number; diff: number },
  nowMs: number,
): TrendPoint[] {
  if (polls.length === 0) return [];
  const sorted = [...polls].sort((x, y) => x.endDate.localeCompare(y.endDate));
  const firstMs = new Date(sorted[0].endDate).getTime();
  const lastMs = Math.max(new Date(sorted[sorted.length - 1].endDate).getTime(), nowMs);
  const points: TrendPoint[] = [];
  for (let t = firstMs; t <= lastMs; t += TREND_STEP_DAYS * MS_PER_DAY) {
    const available = sorted.filter((p) => new Date(p.endDate).getTime() <= t);
    if (available.length === 0) continue;
    const { a, b, diff } = computeAverage(new Date(t), available);
    points.push({ x: t, a: r2(a), b: r2(b), diff: r2(diff) });
  }
  const last = computeAverage(new Date(lastMs), sorted);
  const lastPoint = { x: lastMs, a: r2(last.a), b: r2(last.b), diff: r2(last.diff) };
  if (points.length === 0 || points[points.length - 1].x !== lastMs) points.push(lastPoint);
  return points;
}

function genericBallotSeries(nowMs: number): PollSeries {
  const avg = computeGenericBallotAverage(new Date(nowMs));
  return {
    polls: genericBallotPolls.map((p) => ({
      pollster: p.pollster, startDate: p.startDate, endDate: p.endDate,
      sample: p.sample, population: p.population, a: p.dem, b: p.rep, diff: p.diff,
    })),
    average: { diff: avg.diff, a: avg.dem, b: avg.rep, includedKeys: avg.polls.map(pollKey) },
    trend: buildTrend<GenericBallotPoll>(genericBallotPolls, (asOf, ps) => {
      const r = computeGenericBallotAverage(asOf, ps);
      return { a: r.dem, b: r.rep, diff: r.diff };
    }, nowMs),
  };
}

function approvalSeries(nowMs: number): PollSeries {
  const avg = computeTrumpApprovalAverage(new Date(nowMs));
  return {
    polls: trumpApprovalPolls.map((p) => ({
      pollster: p.pollster, startDate: p.startDate, endDate: p.endDate,
      sample: p.sample, population: p.population, a: p.approve, b: p.disapprove, diff: p.diff,
    })),
    average: { diff: avg.diff, a: avg.approve, b: avg.disapprove, includedKeys: avg.polls.map(pollKey) },
    trend: buildTrend<TrumpApprovalPoll>(trumpApprovalPolls, (asOf, ps) => {
      const r = computeTrumpApprovalAverage(asOf, ps);
      return { a: r.approve, b: r.disapprove, diff: r.diff };
    }, nowMs),
  };
}

/** Both series as of `asOf` (epoch ms). */
export function pollingCardData(asOf: number): PollingCardData {
  return { genericBallot: genericBallotSeries(asOf), approval: approvalSeries(asOf) };
}
