// The night model's county loadings (lib/resultsNight.ts), built into the election-night priors on
// the server and into the replay backtest's: a county's nonwhite share, college share and margin,
// each centered on the national electorate (the 2024 presidential vote-weighted county mean) and in
// units of 10 pts. Server and scripts only — it reads the county demographics table.

import { countyDemographics } from "@/data/countyDemographics";
import { countyPresidentialData } from "@/data/countyPresidentialData";

let centers: { white: number; college: number; margin: number } | null = null;
/** National vote-weighted means (2024 presidential turnout) of white share, college share and margin. */
export function nationalCenters() {
  if (centers) return centers;
  let W = 0, w = 0, c = 0, m = 0, Wc = 0, Wm = 0;
  for (const [fips, r] of Object.entries(countyPresidentialData)) {
    const y = r.years[2024];
    if (!y) continue;
    const d = countyDemographics[fips];
    if (d?.whitePct != null) { W += y.totalVotes; w += y.totalVotes * d.whitePct; }
    if (d?.collegePct != null) { Wc += y.totalVotes; c += y.totalVotes * d.collegePct; }
    Wm += y.totalVotes; m += y.totalVotes * y.margin;
  }
  centers = { white: W ? w / W : 60, college: Wc ? c / Wc : 33, margin: Wm ? m / Wm : 0 };
  return centers;
}

/** A county's loadings given its prior margin (R-positive). Unknown demographics load zero. */
export function countyLoadings(fips: string, margin: number): { nonwhite: number; college: number; lean: number } {
  const d = countyDemographics[fips];
  const c = nationalCenters();
  return {
    nonwhite: d?.whitePct != null ? Math.round(((c.white - d.whitePct) / 10) * 1000) / 1000 : 0,
    college: d?.collegePct != null ? Math.round(((d.collegePct - c.college) / 10) * 1000) / 1000 : 0,
    lean: Math.round(((margin - c.margin) / 10) * 1000) / 1000,
  };
}
