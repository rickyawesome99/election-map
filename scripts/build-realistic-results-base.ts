// A realistic finished election for the Results page's second simulated night. civicAPI's test
// data is random against our forecast (a median 7-point miss, 90 contested races off by 20+), so
// the first simulated night is a stress test. This one rewrites every race's final votes from the
// Results page's own priors: our forecast margin plus a believable error, and each county around
// its projected margin, so the replay shows what a normal night looks like to the needle.
//
// The error is layered the way polling misses are: one national miss shared by every race, one per
// state shared by its races, a race-level remainder (what the forecast's own sigma leaves after
// those two), and county noise larger in small counties, re-centred so the counties add up to the
// race's final. Turnout moves by race and by county around the 2026 estimate.
//
// The feed's race shape (candidates, names, parties) is kept from the latest test snapshot; the
// regions are rebuilt one per prior county (the stress night keeps the feed's town-level double
// listings, so the parser's guards are still exercised there). Output:
// data-entry/results-archive/realistic-base.json.gz, read by
//
//   npx tsx --conditions=react-server scripts/build-realistic-results-base.ts [--seed 11]
//   node scripts/simulate-results-night.mjs realistic 15 --base data-entry/results-archive/realistic-base.json.gz
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { resultsPriors } from "../lib/resultsPriors";
import { matchSlots, type RawCandidate } from "../lib/resultsFeed";
import { RESULTS_OFFICES, type RacePrior } from "../lib/resultsTypes";

const ARCHIVE = join(process.cwd(), "data-entry", "results-archive");
const seedArg = process.argv.indexOf("--seed");
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) || 11 : 11;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = (sd: number) => { const u = Math.max(rand(), 1e-12), v = rand(); return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Error layers, in points of margin.
const NATIONAL_SD = 3;
const STATE_SD = 2;
const RACE_FLOOR_SD = 1.5;
const TURNOUT_RACE_SD = 0.07;
const TURNOUT_COUNTY_SD = 0.05;
/** County noise: about 2.5 points in a 100k-vote county, up to 10 in the smallest. */
const countySd = (votes: number) => Math.min(10, 2 + 5 / Math.sqrt(Math.max(votes, 500) / 10_000));

type RawRace = { candidates?: RawCandidate[]; region_results?: Record<string, unknown>; [k: string]: unknown };

function latestTestSnapshot(): { races: Record<string, RawRace> } {
  const dates = readdirSync(ARCHIVE).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  for (const d of dates) {
    const files = readdirSync(join(ARCHIVE, d)).filter((f) => f.endsWith(".json.gz")).sort();
    if (files.length) return JSON.parse(gunzipSync(readFileSync(join(ARCHIVE, d, files[files.length - 1]))).toString());
  }
  throw new Error("no archived snapshot: run `node scripts/archive-results.mjs once` first");
}

const base = latestTestSnapshot();
const priors = RESULTS_OFFICES.flatMap((o) => resultsPriors(o).races);
const national = gauss(NATIONAL_SD);
const stateShift = new Map<string, number>();
const shiftFor = (st: string) => { if (!stateShift.has(st)) stateShift.set(st, gauss(STATE_SD)); return stateShift.get(st)!; };

/** Votes for every feed candidate given the race's D-slot / R-slot / other split. Other votes go to
 *  the remaining candidates in proportion to their test-data votes (evenly when those are zero). */
function splitCandidates(cands: RawCandidate[], demName: string | null, repName: string | null, dem: number, rep: number, oth: number) {
  const rest = cands.filter((c) => c.name !== demName && c.name !== repName);
  const weight = rest.reduce((a, c) => a + (Number(c.votes) || 0), 0);
  const out = cands.map((c) => {
    const votes = c.name === demName ? dem : c.name === repName ? rep
      : rest.length ? Math.round(oth * (weight > 0 ? (Number(c.votes) || 0) / weight : 1 / rest.length)) : 0;
    return { ...c, votes, winner: false };
  });
  const total = out.reduce((a, c) => a + c.votes, 0);
  for (const c of out) c.percent = total ? Math.round((c.votes / total) * 10000) / 100 : 0;
  return out;
}

const races: Record<string, RawRace> = { ...base.races };
let rebuilt = 0, missed = 0;
const misses: number[] = [];
for (const p of priors as RacePrior[]) {
  const raw = p.civicId ? base.races[String(p.civicId)] : null;
  if (!raw || !p.counties.length) { if (raw) missed++; continue; }
  const cands = raw.candidates ?? [];
  const { dem, rep } = matchSlots(p, cands);
  const f = p.forecast;
  const raceSd = Math.max(RACE_FLOOR_SD, Math.sqrt(Math.max(0, f.sigma ** 2 - NATIONAL_SD ** 2 - STATE_SD ** 2)));
  // Same-party and uncontested races have no national D-vs-R miss to share; they get only their own.
  const shared = f.contest === "contested" ? national + shiftFor(p.state) : 0;
  const target = Math.max(-98, Math.min(98, f.margin + shared + gauss(raceSd)));
  misses.push(target - f.margin);
  const turnout = Math.max(0.6, 1 + gauss(TURNOUT_RACE_SD));

  // County finals: the projection moved by the race's own miss, plus county noise, then re-centred
  // so the vote-weighted county margins land exactly on the race's final margin.
  const counties = p.counties.map((c) => {
    const votes = Math.max(20, Math.round(c.votes * turnout * Math.max(0.7, 1 + gauss(TURNOUT_COUNTY_SD))));
    const other = Math.max(0, Math.min(25, c.other + gauss(0.5)));
    return { c, votes, other, margin: c.margin + (target - f.margin) + gauss(countySd(c.votes)) };
  });
  const total = counties.reduce((a, x) => a + x.votes, 0);
  const off = target - counties.reduce((a, x) => a + x.margin * x.votes, 0) / total;
  const regionResults: Record<string, unknown> = {};
  let D = 0, R = 0, O = 0;
  for (const x of counties) {
    const m = Math.max(-99, Math.min(99, x.margin + off));
    const two = x.votes * (1 - x.other / 100);
    const r = Math.round((two + (m / 100) * x.votes) / 2), d = Math.max(0, Math.round(two - r)), o = Math.max(0, x.votes - d - r);
    D += d; R += r; O += o;
    const city = /^(51[5-8]\d\d|24510|29510|32510)$/.test(x.c.fips);
    regionResults[x.c.fips] = { name: x.c.name.replace(/ (County|Parish)$/, ""), type: city ? "City" : "County", fips: x.c.fips, percent_reporting: 100, candidates: splitCandidates(cands, dem?.name ?? null, rep?.name ?? null, d, r, o) };
  }
  races[String(p.civicId)] = { ...raw, candidates: splitCandidates(cands, dem?.name ?? null, rep?.name ?? null, D, R, O), region_results: regionResults, percent_reporting: 100 };
  rebuilt++;
}

const out = join(ARCHIVE, "realistic-base.json.gz");
writeFileSync(out, gzipSync(JSON.stringify({ fetchedAt: new Date().toISOString(), realistic: true, races })));
const sorted = misses.map(Math.abs).sort((a, b) => a - b);
console.log(`${rebuilt} races rebuilt (${missed} with no prior counties kept as test data) → ${out}`);
console.log(`national miss ${national > 0 ? "R" : "D"}+${Math.abs(national).toFixed(1)}; race |final − forecast| median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}, 90th pct ${sorted[Math.floor(sorted.length * 0.9)].toFixed(1)}, max ${sorted[sorted.length - 1].toFixed(1)}`);
