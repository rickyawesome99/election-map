import "server-only";
import { presPastResults } from "@/data/forecastData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { getTplFit } from "@/lib/tplCompute";

// Trend: which way a place has been moving, published BESIDE its True Partisan Lean and never
// inside it (user decision 2026-11-19). TPL says where a place stands and moves only as results
// come in; extrapolating a trend inside it was tested over six holdout rounds and helped only in
// presidential years (a quarter of the last shift: 3.83 against 3.93 overall, worse in 2018,
// nothing in 2026), so the lean stays steady and the direction of travel is its own figure.
//
//   trend = (presidential margin 2024 − 2020) − (E(2024) − E(2020))                  R-positive
//
// E is the national environment TPL itself removes (getTplFit), so the trend is the change in the
// place's environment-neutral presidential margin, on today's lines for a district. Until
// 2026-11-19 (later the same day) the reference was the national popular-vote swing instead. The
// popular vote is vote-weighted, so the 2024 swings of California, New York, Texas and Florida
// set it (R+5.9) well above what the typical state did (median R+3.4; E moved R+4.0), and most
// states then read as trending Democratic for having moved right by less than the big ones. E is
// fitted with every state counting equally, so no handful of states moves anyone else's figure.
// `prior` is the same figure for 2016 → 2020, so a reader can tell a sustained move (Florida, the
// Rio Grande Valley) from a one-cycle one.

export interface LeanTrend {
  /** 2020 → 2024, beyond the national environment's change. Positive = moved toward Republicans. */
  last: number;
  /** 2016 → 2020 on the same basis; null where 2016 is not on file. */
  prior: number | null;
  /** The place's presidential margins behind `last` (R − D, percent of all votes). */
  from: number;
  to: number;
  /** E(2024) − E(2020): what the national environment did between them. */
  env: number;
}

function trendOf(m: Partial<Record<2016 | 2020 | 2024, number | null | undefined>>): LeanTrend | null {
  const E = getTplFit().E;
  if (m[2024] == null || m[2020] == null || E[2020] == null || E[2024] == null) return null;
  const env = E[2024] - E[2020];
  return { last: m[2024]! - m[2020]! - env, prior: m[2016] != null && E[2016] != null ? m[2020]! - m[2016]! - (E[2020] - E[2016]) : null, from: m[2020]!, to: m[2024]!, env };
}

export function stateLeanTrend(abbr: string): LeanTrend | null {
  const of = (y: number) => { const r = (presPastResults[abbr] ?? []).find((x) => x.year === y); return r ? r.repPct - r.demPct : null; };
  return trendOf({ 2016: of(2016), 2020: of(2020), 2024: of(2024) });
}

/** `districtId` as data/districtPresidentialData.ts keys it ("3714"); zero-padded ids are accepted. */
export function districtLeanTrend(districtId: string): LeanTrend | null {
  const d = districtPresidentialData[parseInt(districtId, 10).toString()];
  if (!d) return null;
  return trendOf({ 2016: d.pres16RepPct - d.pres16DemPct, 2020: d.pres20RepPct - d.pres20DemPct, 2024: d.pres24RepPct - d.pres24DemPct });
}

export function countyLeanTrend(fips: string): LeanTrend | null {
  const y = countyPresidentialData[fips]?.years;
  if (!y) return null;
  return trendOf({ 2016: y[2016]?.margin, 2020: y[2020]?.margin, 2024: y[2024]?.margin });
}
