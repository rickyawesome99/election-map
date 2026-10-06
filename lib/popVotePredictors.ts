// Popular-vote predictors: how presidential approval, direction of country and Gallup's
// quarterly party ID lined up with the national House popular vote (the realized generic
// ballot) and the presidential popular vote in 2016–2024, and what each would imply for 2026.
//
// Sign conventions. Vote margins and party ID are R-positive (R − D), matching the rest of the
// site. Approval and direction of country are a verdict on the sitting president, so they are
// compared with the president's party's margin: a D-president year has its margins flipped
// (incumbentSigned) so that 2016/2022/2024 and 2018/2020 sit on the same axis. The projection
// for 2026 is then turned back into an R − D margin, which under a Republican president is the
// same number.
//
// Pure math and small data: safe to import from client components.

import { popVotePredictorYears, type PopVotePredictorYear, type PredictorKey, type OutcomeKey } from "@/data/popVotePredictors";

export type { PredictorKey, OutcomeKey };

// shiftable: the marker is itself a margin in vote-share units, so "result minus marker" (how far the
// president's party ran ahead of its approval, or the vote ran ahead of party ID) is a meaningful
// shift to carry forward. Direction of country sits 30 points underwater in every year, so it is not.
export const PREDICTORS: { key: PredictorKey; label: string; short: string; axis: string; incumbentSigned: boolean; shiftable: boolean }[] = [
  { key: "approval", label: "Presidential approval", short: "Approval", axis: "Net approval (approve − disapprove)", incumbentSigned: true, shiftable: true },
  { key: "direction", label: "Direction of country", short: "Direction", axis: "Right direction − wrong track", incumbentSigned: true, shiftable: false },
  { key: "partyId", label: "Gallup Q3 party ID", short: "Party ID", axis: "Party ID with leaners (R − D)", incumbentSigned: false, shiftable: true },
];

export const OUTCOMES: { key: OutcomeKey; label: string; short: string }[] = [
  { key: "house", label: "House popular vote", short: "House" },
  { key: "president", label: "Presidential popular vote", short: "President" },
];

export type CycleFilter = "all" | "midterm" | "presidential";

/** The predictor's raw reading for a year (R-positive for party ID, pro-president for the rest). */
export function predictorValue(y: PopVotePredictorYear, key: PredictorKey): number | null {
  if (key === "approval") return y.approval == null ? null : y.approval.approve - y.approval.disapprove;
  if (key === "direction") return y.direction == null ? null : y.direction.right - y.direction.wrong;
  return y.partyId == null ? null : y.partyId.rep - y.partyId.dem;
}

/** Flip an R − D margin into the president's party's margin (identity under a Republican). */
export function toIncumbentSigned(y: { presidentParty: "D" | "R" }, rMinusD: number): number {
  return y.presidentParty === "R" ? rMinusD : -rMinusD;
}
export const fromIncumbentSigned = toIncumbentSigned;

/** The outcome for a year, in the predictor's sign space. */
export function outcomeValue(y: PopVotePredictorYear, key: OutcomeKey, incumbentSigned: boolean): number | null {
  const raw = key === "house" ? y.housePv : y.presPv;
  if (raw == null) return null;
  return incumbentSigned ? toIncumbentSigned(y, raw) : raw;
}

export type FitPoint = { year: number; x: number; y: number; cycle: "midterm" | "presidential"; presidentParty: "D" | "R"; president: string };

export type Fit = {
  n: number;
  slope: number;
  intercept: number;
  r: number | null;   // Pearson correlation; null when the slope is borrowed
  mae: number;        // mean absolute in-sample residual
  borrowedSlope: boolean; // true when the subset was too small for its own slope (see fitSubset)
  points: (FitPoint & { fitted: number; residual: number })[];
};

export function fitLine(points: FitPoint[]): Fit | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  const fitted = points.map((p) => ({ ...p, fitted: intercept + slope * p.x, residual: p.y - (intercept + slope * p.x) }));
  const mae = fitted.reduce((s, p) => s + Math.abs(p.residual), 0) / n;
  return { n, slope, intercept, r, mae, borrowedSlope: false, points: fitted };
}

/**
 * A line for a subset of the elections. Three or more points get their own least-squares line.
 * Fewer cannot support a slope (a line through two midterms is exact and wild), so the subset
 * borrows the slope fitted to every election and only moves the line to pass through its own
 * centroid: the subset says where the relationship sits, the full record says how steep it is.
 */
export function fitSubset(points: FitPoint[], all: FitPoint[]): Fit | null {
  if (points.length >= 3) return fitLine(points);
  const base = fitLine(all);
  if (!base || points.length === 0) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const intercept = my - base.slope * mx;
  const fitted = points.map((p) => ({ ...p, fitted: intercept + base.slope * p.x, residual: p.y - (intercept + base.slope * p.x) }));
  return { n, slope: base.slope, intercept, r: null, mae: fitted.reduce((s, p) => s + Math.abs(p.residual), 0) / n, borrowedSlope: true, points: fitted };
}

export function cycleOf(y: PopVotePredictorYear): "midterm" | "presidential" {
  return y.year % 4 === 0 ? "presidential" : "midterm";
}

/** The (predictor, outcome) pairs for the completed elections, in the predictor's sign space. */
export function fitPoints(predictor: PredictorKey, outcome: OutcomeKey, cycle: CycleFilter = "all", years: PopVotePredictorYear[] = popVotePredictorYears): FitPoint[] {
  const spec = PREDICTORS.find((p) => p.key === predictor)!;
  const out: FitPoint[] = [];
  for (const y of years) {
    if (!y.complete) continue;
    const c = cycleOf(y);
    if (cycle !== "all" && c !== cycle) continue;
    const x = predictorValue(y, predictor);
    const v = outcomeValue(y, outcome, spec.incumbentSigned);
    if (x == null || v == null) continue;
    out.push({ year: y.year, x, y: v, cycle: c, presidentParty: y.presidentParty, president: y.president });
  }
  return out;
}

export type Projection = {
  predictor: PredictorKey;
  outcome: OutcomeKey;
  reading: number;                 // 2026 reading in the predictor's sign space
  readingRMinusD: number;          // the same as an R − D margin
  fit: Fit | null;                 // fitted line over the chosen cycles
  fitted: number | null;           // implied outcome (R − D)
  shift: number | null;            // average (outcome − predictor) over the chosen cycles
  shifted: number | null;          // reading + shift (R − D)
  shiftN: number;
};

/**
 * What a predictor's 2026 reading implies for an outcome, two ways: the fitted line (the usual
 * regression read; a subset with fewer than three elections borrows the all-election slope, see
 * fitSubset) and the average shift (how far the president's party ran
 * ahead of or behind the marker, added to this year's reading). There is no presidential vote in
 * 2026, so the presidential projection is what that vote would be at this reading.
 */
export function project(predictor: PredictorKey, outcome: OutcomeKey, target: PopVotePredictorYear, cycle: CycleFilter = "all", years: PopVotePredictorYear[] = popVotePredictorYears): Projection | null {
  const spec = PREDICTORS.find((p) => p.key === predictor)!;
  const reading = predictorValue(target, predictor);
  if (reading == null) return null;
  const pts = fitPoints(predictor, outcome, cycle, years);
  const fit = fitSubset(pts, fitPoints(predictor, outcome, "all", years));
  const back = (v: number) => (spec.incumbentSigned ? fromIncumbentSigned(target, v) : v);
  const shift = spec.shiftable && pts.length ? pts.reduce((s, p) => s + (p.y - p.x), 0) / pts.length : null;
  return {
    predictor,
    outcome,
    reading,
    readingRMinusD: back(reading),
    fit,
    fitted: fit ? back(fit.intercept + fit.slope * reading) : null,
    shift,
    shifted: shift == null ? null : back(reading + shift),
    shiftN: pts.length,
  };
}

export function projectHouse(predictor: PredictorKey, target: PopVotePredictorYear, cycle: CycleFilter = "all", years: PopVotePredictorYear[] = popVotePredictorYears): Projection | null {
  return project(predictor, "house", target, cycle, years);
}
