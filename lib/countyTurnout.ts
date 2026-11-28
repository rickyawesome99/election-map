import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "@/lib/turnout";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { countyRaces2026 } from "@/lib/raceResults2026";
import type { CountyTurnoutYear, TurnoutRace } from "@/lib/countyTurnoutTypes";

/**
 * A county's turnout by election year, for the graph on its page: each year is represented by
 * the race with the most votes cast in the county that year (every candidate's votes, not just
 * the two parties'), over the county's citizen voting-age population (CVAP).
 *
 * CVAP: data-entry/cvap.csv (ACS 5-year release ending in the election year, 2016–2024; 2025
 * reuses 2024) and data-entry/cvap_county_early.csv for 2008 (2005-09 release, the first) and
 * 2012. 2026 has no release yet and uses the 2024 one, as the turnout model does. CT's 2022+
 * county figures are scaled from 2021 (see scripts/fetch-cvap.py).
 *
 * A House total sums every district piece in the county; a county whose whole House vote was an
 * unopposed race with no count doesn't offer one. Runoffs stored in the county files (GA 2020/22
 * Senate, LA 2016 Senate, LA 2019 governor) count as they are stored; in each case another race
 * that year, or the runoff itself, is the real largest count.
 */

let cvapCache: Map<string, { cvap: number; release: number }> | null = null;

function cvapTable() {
  if (cvapCache) return cvapCache;
  cvapCache = new Map();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "cvap.csv"), "utf8"))) {
    if (r.level !== "county") continue;
    const year = Number(r.year), cvap = Number(r.cvap);
    if (cvap > 0) cvapCache.set(`${r.geoid}|${year}`, { cvap, release: year === 2025 ? 2024 : year });
  }
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "cvap_county_early.csv"), "utf8"))) {
    const cvap = Number(r.cvap);
    if (cvap > 0) cvapCache.set(`${r.geoid}|${Number(r.year)}`, { cvap, release: Number(r.acs_release) });
  }
  return cvapCache;
}

/** The ACS 5-year release a year's CVAP comes from; 2026 borrows the latest (2024). */
function cvapFor(fips: string, year: number): { cvap: number; release: number } | null {
  const t = cvapTable();
  return t.get(`${fips}|${year}`) ?? (year === 2026 ? t.get(`${fips}|2024`) ?? null : null);
}

// The graph starts in 2016 by choice (the user's call, 2026-11-28), though 2008/2012 votes and CVAP
// are on file and correct since scripts/fix-county-pres-2008-2012.py.
const FIRST_YEAR = 2016;

export function countyTurnoutHistory(fips: string): CountyTurnoutYear[] {
  const best = new Map<number, { votes: number; race: TurnoutRace }>();
  const offer = (year: number, votes: number | undefined, race: TurnoutRace) => {
    if (!votes || votes <= 0) return;
    const cur = best.get(year);
    if (!cur || votes > cur.votes) best.set(year, { votes, race });
  };

  for (const [y, r] of Object.entries(countyPresidentialData[fips]?.years ?? {})) offer(Number(y), r?.totalVotes, "President");
  const sen = countySenateData[fips];
  for (const [y, r] of Object.entries(sen?.years ?? {})) offer(Number(y), r?.totalVotes, "Senate");
  for (const [y, r] of Object.entries(sen?.specialYears ?? {})) offer(Number(y), r?.totalVotes, "Senate Special");
  for (const [y, r] of Object.entries(countyGovernorData[fips]?.years ?? {})) offer(Number(y), r?.totalVotes, "Governor");
  for (const [y, r] of Object.entries(countyHouseData[fips]?.years ?? {})) {
    if (r && r.votesKnown !== false) offer(Number(y), r.totalVotes, "House");
  }

  // 2026: the saved county counts. House pieces add up to one county total, like the past years.
  const r26 = countyRaces2026(fips);
  for (const r of r26) {
    if (r.office !== "house") offer(2026, r.total, r.office === "governor" ? "Governor" : r.special ? "Senate Special" : "Senate");
  }
  offer(2026, r26.filter((r) => r.office === "house").reduce((a, r) => a + r.total, 0), "House");

  return [...best.entries()]
    .filter(([year]) => year >= FIRST_YEAR)
    .sort((a, b) => a[0] - b[0])
    .map(([year, { votes, race }]) => {
      const c = cvapFor(fips, year);
      return {
        year,
        votes,
        race,
        cvap: c?.cvap ?? null,
        cvapRelease: c?.release ?? null,
        rate: c ? Math.round((votes / c.cvap) * 1000) / 10 : null,
      };
    });
}
