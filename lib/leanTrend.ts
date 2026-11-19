import "server-only";
import { presPastResults } from "@/data/forecastData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { countyPresidentialData } from "@/data/countyPresidentialData";

// Trend: which way a place has been moving, published BESIDE its True Partisan Lean and never
// inside it (user decision 2026-11-19). TPL says where a place stands and moves only as results
// come in; extrapolating a trend inside it was tested over six holdout rounds and helped only in
// presidential years (a quarter of the last shift: 3.83 against 3.93 overall, worse in 2018,
// nothing in 2026), so the lean stays steady and the direction of travel is its own figure.
//
//   trend = (presidential margin 2024 − 2020) − (national margin 2024 − 2020)        R-positive
//
// i.e. how much further the place moved than the country did between the last two presidential
// elections, on today's lines for a district. `prior` is the same figure for 2016 → 2020, so a
// reader can tell a sustained move (Florida, the Rio Grande Valley) from a one-cycle one.

export interface LeanTrend {
  /** 2020 → 2024, relative to the nation. Positive = moved toward Republicans. */
  last: number;
  /** 2016 → 2020, relative to the nation; null where 2016 is not on file. */
  prior: number | null;
}

let national: Record<number, number> | null = null;
/** National presidential margin (R − D, percent of all votes) summed from the state results. */
export function nationalPresMargin(year: number): number | null {
  if (!national) {
    national = {};
    for (const y of [2016, 2020, 2024]) {
      let d = 0, r = 0, t = 0;
      for (const [abbr, rows] of Object.entries(presPastResults)) {
        if (abbr.length !== 2) continue; // statewide rows only (Maine and Nebraska districts are separate keys)
        const row = rows.find((x) => x.year === y);
        if (!row?.totalVotes) continue;
        d += row.demVotes ?? 0; r += row.repVotes ?? 0; t += row.totalVotes;
      }
      if (t > 0) national[y] = ((r - d) / t) * 100;
    }
  }
  return national[year] ?? null;
}

function trendOf(m: Partial<Record<2016 | 2020 | 2024, number | null | undefined>>): LeanTrend | null {
  const n16 = nationalPresMargin(2016), n20 = nationalPresMargin(2020), n24 = nationalPresMargin(2024);
  if (m[2024] == null || m[2020] == null || n20 == null || n24 == null) return null;
  return { last: m[2024]! - m[2020]! - (n24 - n20), prior: m[2016] != null && n16 != null ? m[2020]! - m[2016]! - (n20 - n16) : null };
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
