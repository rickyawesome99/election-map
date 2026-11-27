/**
 * A conditional test of County TPL (lib/tplCompute.ts calculateCountyModel), written 2026-11-27 to decide the U.S.
 * House candidate-terms variant (COUNTY_HOUSE_STRIPS). For every county and every eligible statewide race
 * (President, Senate, Governor) of year Y:
 *
 *   county margin = County TPL built from years before Y + the race's environment + leftover
 *
 * with ONE environment per state race (solved so the median county leftover is zero): the race's candidates, money
 * and national mood are the same in every county of the state, so what is left measures how well TPL places the
 * counties against each other. Reported as the mean absolute leftover, by county and weighted by the county's votes.
 *
 *   npx tsx --conditions=react-server scripts/countyTplValidation.ts [--house-strips | --no-house-strips]
 */
import { countyPresidentialData } from "../data/countyPresidentialData";
import { calculateCountyModel, countyHouseAnchor, leanAsOf, setCountyHouseStrips } from "../lib/tplCompute";

const arg = process.argv.includes("--house-strips") ? true : process.argv.includes("--no-house-strips") ? false : null;
setCountyHouseStrips(arg);
type Pred = { year: number; race: string; st: string; actual: number; lean: number; votes: number };
const preds: Pred[] = [];
const YEARS = [2018, 2020, 2022, 2024, 2026];
for (const [fips, c] of Object.entries(countyPresidentialData)) {
  const calc = calculateCountyModel(fips);
  if (!calc) continue;
  const votes = c.years[2024]?.totalVotes ?? c.years[2020]?.totalVotes ?? 0;
  for (const Y of YEARS) {
    const before = calc.races.filter((r) => r.year < Y);
    if (!before.some((r) => r.raceType === "P" && r.NM != null)) continue;
    const lean = leanAsOf(before, Y - 1, countyHouseAnchor(before));
    if (lean == null) continue;
    for (const r of calc.races) {
      if (r.year !== Y || r.raceType === "H" || r.imputed || r.rawMargin == null) continue;
      preds.push({ year: Y, race: r.race, st: c.state, actual: r.rawMargin, lean, votes });
    }
  }
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const groups = new Map<string, Pred[]>();
for (const p of preds) { const k = `${p.st}|${p.year}|${p.race}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
const byYear = new Map<number, { n: number; abs: number; wAbs: number; w: number }>();
for (const g of groups.values()) {
  const E = median(g.map((p) => p.actual - p.lean));
  for (const p of g) {
    const left = Math.abs(p.actual - p.lean - E);
    const a = byYear.get(p.year) ?? { n: 0, abs: 0, wAbs: 0, w: 0 };
    a.n++; a.abs += left; a.wAbs += left * p.votes; a.w += p.votes; byYear.set(p.year, a);
  }
}
console.log(`County TPL conditional test (House terms ${arg == null ? "default" : arg ? "on" : "off"}): mean |leftover|, by county / vote-weighted`);
let N = 0, A = 0, WA = 0, W = 0;
for (const [y, a] of [...byYear].sort((x, z) => x[0] - z[0])) {
  console.log(`  ${y}  n ${String(a.n).padStart(5)}  ${(a.abs / a.n).toFixed(3)}  /  ${(a.wAbs / a.w).toFixed(3)}`);
  N += a.n; A += a.abs; WA += a.wAbs; W += a.w;
}
console.log(`  all   n ${String(N).padStart(5)}  ${(A / N).toFixed(3)}  /  ${(WA / W).toFixed(3)}`);
