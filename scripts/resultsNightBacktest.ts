// Replays the election-night needle WITH the night model (lib/resultsNight.ts) over the 2018–2024
// Senate, governor and House results, reported county by county in a simulated order, and scores
// each race's projected margin against the final one — above all for races with nothing counted
// yet, which is where the night model does all the work (the baseline needle leaves them at their
// prior).
//
// Priors: each race's margin is the forward backtest's prediction for it (scripts/forwardBacktest.ts
// --dump, the mid-September structural forecast refit on earlier years) with the state's β from the
// same dump; each county's expected margin is its previous presidential margin shifted so the
// vote-weighted mean equals that prediction; expected votes are the county's actual votes under a
// uniform 0.95 with log-normal county noise (turnout is not what is on trial here).
//
// Reporting order: the state's 2026 poll-closing time, then each county on its own ramp (5–60 min
// after close, longer for bigger counties, batchy), with the votes counted first leaning more
// Democratic than the county's final by a state-level skew (mean +3, sd 4) plus county noise (sd 3),
// fading as the count completes — the mail/early-vote mirage, the hard case for a fit that reads
// half-counted counties. --skew 0 turns it off.
//
//   npx tsx --conditions=react-server scripts/resultsNightBacktest.ts            # baseline vs full vs each term off
//   npx tsx --conditions=react-server scripts/resultsNightBacktest.ts --grid     # grid over the prior sigmas
//   npx tsx --conditions=react-server scripts/resultsNightBacktest.ts --emit     # write data/resultsNightCalibration.ts
//   npx tsx --conditions=react-server scripts/resultsNightBacktest.ts --dump /path/to/forwardBacktest_predictions.csv

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countyPresidentialData } from "../data/countyPresidentialData";
import { parseCsv } from "../lib/turnout";
import { countyLoadings } from "../lib/resultsNightLoadings";
import { DEFAULT_PARAMS, nightObservations, projectRace, tallyChamber, type NeedleParams } from "../lib/resultsNeedle";
import { DEFAULT_NIGHT_PARAMS, fitNight, type NightFit, type NightParams } from "../lib/resultsNight";
import type { LiveRace, RacePrior, ResultsOffice } from "../lib/resultsTypes";

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DUMP = arg("--dump", join(tmpdir(), "forwardBacktest_predictions.csv"));
const SKEW = Number(arg("--skew", "1"));
const STEP = Number(arg("--step", "10"));
const YEARS = arg("--years", "2018,2020,2022,2024").split(",").map(Number);
const SIGMA_ARG = arg("--sigma", "");
const SEED = Number(arg("--seed", "7"));
const ROOT = process.cwd();

let seed = SEED;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => { const u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

type Dump = { year: number; office: "S" | "G" | "H"; race: string; actual: number; beta: number; pred: number };
if (!existsSync(DUMP)) throw new Error(`${DUMP} missing: run \`npx tsx --conditions=react-server scripts/forwardBacktest.ts --env struct --dump\` first`);
const dump: Dump[] = parseCsv(readFileSync(DUMP, "utf8")).map((r) => ({ year: Number(r.year), office: r.office as Dump["office"], race: r.race, actual: Number(r.actual), beta: Number(r.beta), pred: Number(r.pred) }));

// The prior's sigma per office: the dump's own residual sd (the national miss included), so the
// baseline needle starts calibrated and the night model is judged on what it adds. --sigma N overrides.
const SIGMA_BY_OFFICE: Record<Dump["office"], number> = (() => {
  const out = {} as Record<Dump["office"], number>;
  for (const o of ["S", "G", "H"] as const) {
    const xs = dump.filter((d) => d.office === o).map((d) => d.actual - d.pred);
    const m = xs.reduce((a, x) => a + x, 0) / xs.length;
    out[o] = SIGMA_ARG ? Number(SIGMA_ARG) : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  }
  return out;
})();
console.log(`prior sigma by office: S ${SIGMA_BY_OFFICE.S.toFixed(1)} G ${SIGMA_BY_OFFICE.G.toFixed(1)} H ${SIGMA_BY_OFFICE.H.toFixed(1)}`);

const closing = new Map(parseCsv(readFileSync(join(ROOT, "data-entry", "poll_closing_2026.csv"), "utf8")).map((r) => [r.state, r]));
const closeMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return ((h < 12 ? h + 24 : h) - 19) * 60 + m; };

type CountyFinal = { fips: string; name: string; dem: number; rep: number; oth: number; total: number };
const csvCache = new Map<string, Record<string, string>[]>();
const csv = (file: string) => { let r = csvCache.get(file); if (!r) { r = existsSync(join(ROOT, "data-entry", file)) ? parseCsv(readFileSync(join(ROOT, "data-entry", file), "utf8")) : []; csvCache.set(file, r); } return r; };

function finals(d: Dump): CountyFinal[] | null {
  const y = d.year;
  if (d.office === "H") {
    const [st, dd] = d.race.split("-");
    const rows = csv("house_district_county_results.csv").filter((r) => Number(r.year) === y && r.state === st && Number(r.district) === Number(dd));
    return rows.length ? rows.map((r) => ({ fips: r.county_fips, name: r.county_name, dem: Number(r.dem), rep: Number(r.gop), oth: Number(r.oth), total: Number(r.total) })) : null;
  }
  const st = d.race.slice(0, 2);
  const special = /special/i.test(d.race);
  const file = d.office === "S" ? (special ? `county_senate_special_results_${y}.csv` : `county_senate_results_${y}.csv`) : `county_governor_results_${y}.csv`;
  const rows = csv(file).filter((r) => r.state === st);
  return rows.length ? rows.map((r) => ({ fips: r.county_id, name: r.county_name, dem: Number(r[`dem_${y}`]), rep: Number(r[`gop_${y}`]), oth: Number(r[`oth_${y}`]), total: Number(r[`total_${y}`]) })) : null;
}

type Race = { prior: RacePrior; finals: CountyFinal[]; actual: number; actualTotal: number; plan: { start: number; length: number; batches: number; skew: number }[] };

function buildRace(d: Dump, stateVotes: number): Race | null {
  const fin = finals(d);
  if (!fin || fin.length === 0) return null;
  const total = fin.reduce((a, c) => a + c.total, 0);
  if (total <= 0) return null;
  const st = d.office === "H" ? d.race.slice(0, 2) : d.race.slice(0, 2);
  const office: ResultsOffice = d.office === "S" ? "senate" : d.office === "G" ? "governor" : "house";
  const presYear = d.year <= 2020 ? 2016 : 2020;
  const leanOf = (fips: string) => countyPresidentialData[fips]?.years[presYear]?.margin ?? 0;
  const cells = fin.map((c) => ({ ...c, lean: leanOf(c.fips), votes: Math.max(1, Math.round(c.total * 0.95 * Math.exp(0.12 * gauss()))) }));
  const V = cells.reduce((a, c) => a + c.votes, 0);
  const mean = cells.reduce((a, c) => a + c.votes * c.lean, 0) / V;
  const shift = d.pred - mean;
  const close = closing.get(st);
  const last = close ? closeMin(close.last_close_et) : 60;
  const stateSkew = SKEW * (3 + 4 * gauss());
  const SIGMA_F = SIGMA_BY_OFFICE[d.office];
  const prior: RacePrior = {
    office, id: d.race, civicId: null, label: d.race, state: st, stateName: st, href: "",
    dem: { name: "D", party: "D", incumbent: false, photo: null }, rep: { name: "R", party: "R", incumbent: false, photo: null },
    seatParty: null, seatHolder: null, special: /special/i.test(d.race), rcv: false, jungle: false, tpl: null, beta: d.beta,
    forecast: { margin: d.pred, sigma: SIGMA_F, probability: 0.5, rating: "", contest: "contested", interval80: [d.pred - 1.28 * SIGMA_F, d.pred + 1.28 * SIGMA_F] },
    pollsClose: { first: close?.first_close_et ?? "20:00", last: close?.last_close_et ?? "20:00", note: null },
    votes: V,
    counties: cells.map((c) => { const m = Math.max(-98, Math.min(98, c.lean + shift)); return { fips: c.fips, name: c.name, share: 1, votes: c.votes, margin: m, other: 2, tpl: null, benchmark: null, ...countyLoadings(c.fips, m) }; }),
  };
  const plan = cells.map((c) => {
    const size = c.total / Math.max(1, stateVotes);
    return { start: last + 5 + rand() * 55, length: 40 + rand() * 120 + Math.sqrt(size) * 400 + (rand() < 0.08 ? 180 : 0), batches: 3 + Math.floor(rand() * 8), skew: SKEW * (stateSkew + 3 * gauss()) };
  });
  return { prior, finals: fin, actual: ((fin.reduce((a, c) => a + c.rep, 0) - fin.reduce((a, c) => a + c.dem, 0)) / total) * 100, actualTotal: total, plan };
}

const stepped = (t: number, start: number, length: number, batches: number) => {
  if (t <= start) return 0;
  const x = Math.min(1, (t - start) / length);
  const s = 1 / (1 + Math.exp(-7 * (x - 0.5)));
  const scaled = (s - 1 / (1 + Math.exp(3.5))) / (1 / (1 + Math.exp(-3.5)) - 1 / (1 + Math.exp(3.5)));
  return x >= 1 ? 1 : Math.floor(scaled * batches) / batches;
};

function liveAt(r: Race, t: number): LiveRace | null {
  let dem = 0, rep = 0, oth = 0, total = 0, done = 0;
  const counties = r.finals.map((c, i) => {
    const p = r.plan[i];
    const frac = stepped(t, p.start, p.length, p.batches);
    if (frac >= 1) done++;
    const n = Math.round(c.total * frac);
    const margin = c.total > 0 ? ((c.rep - c.dem) / c.total) * 100 - p.skew * (1 - frac) : 0;
    const dr = Math.round((c.dem + c.rep) * frac);
    const rv = Math.max(0, Math.min(dr, Math.round((dr + (margin / 100) * n) / 2)));
    const dv = dr - rv, ov = n - dr;
    dem += dv; rep += rv; oth += ov; total += n;
    return { fips: c.fips, name: c.name, pct: frac >= 1 ? 100 : null, type: "County", dem: dv, rep: rv, oth: ov, total: n };
  });
  if (total <= 0) return null;
  return { civicId: 0, fetchedAt: t, lastUpdated: null, percentReporting: done === r.finals.length ? 100 : (done / r.finals.length) * 100, called: false, calledAt: null, winner: null, testData: false, dem, rep, oth, total, candidates: [], counties };
}

// ── Build the years ───────────────────────────────────────────────────────────
const years = YEARS.map((y) => {
  const rows = dump.filter((d) => d.year === y);
  const stateVotes = new Map<string, number>();
  for (const d of rows) { const f = finals(d); if (f) stateVotes.set(`${d.office}|${d.race.slice(0, 2)}`, (stateVotes.get(`${d.office}|${d.race.slice(0, 2)}`) ?? 0) + f.reduce((a, c) => a + c.total, 0)); }
  const races = rows.map((d) => buildRace(d, stateVotes.get(`${d.office}|${d.race.slice(0, 2)}`) ?? 1)).filter((r): r is Race => !!r);
  const skipped = rows.length - races.length;
  return { year: y, races, skipped };
});
for (const y of years) console.log(`${y.year}: ${y.races.length} races (${y.races.filter((r) => r.prior.office === "senate").length} S, ${y.races.filter((r) => r.prior.office === "governor").length} G, ${y.races.filter((r) => r.prior.office === "house").length} H), ${y.skipped} without county results`);

// ── Score one configuration ───────────────────────────────────────────────────
type Config = { name: string; night: NightParams | null; needle?: NeedleParams };
const BUCKETS: [number, number, string][] = [[-1, 0.0001, "0% (nothing in)"], [0.0001, 0.1, "<10%"], [0.1, 0.3, "10–30%"], [0.3, 0.6, "30–60%"], [0.6, 0.9, "60–90%"], [0.9, 0.995, "90–99%"]];
type Row = { bucket: string; office: ResultsOffice; hour: string; err: number; z: number; covered: number; logs: number };
const HOURS: [number, string][] = [[120, "by 9 PM"], [240, "9–11 PM"], [600, "after 11 PM"]];
type Agg = { n: number; mae: number; cover: number; rmsz: number; logs: number };
const agg = (xs: Row[]): Agg => ({ n: xs.length, mae: xs.reduce((a, x) => a + x.err, 0) / Math.max(1, xs.length), cover: xs.reduce((a, x) => a + x.covered, 0) / Math.max(1, xs.length), rmsz: Math.sqrt(xs.reduce((a, x) => a + x.z * x.z, 0) / Math.max(1, xs.length)), logs: xs.reduce((a, x) => a + x.logs, 0) / Math.max(1, xs.length) });

function run(cfg: Config) {
  const rows: Row[] = [];
  const seatErr: { office: ResultsOffice; err: number }[] = [];
  const fits: { t: number; year: number; fit: NightFit }[] = [];
  for (const y of years) {
    for (let t = 0; t <= 600; t += STEP) {
      const pairs = y.races.map((r) => ({ r, live: liveAt(r, t) }));
      if (!pairs.some((p) => p.live)) continue;
      const fit = cfg.night ? fitNight(pairs.flatMap(({ r, live }) => nightObservations(r.prior, live)), cfg.night) : null;
      if (fit) fits.push({ t, year: y.year, fit });
      // The same rows for every configuration: steps at which some county anywhere has finished.
      const anyFinished = pairs.some(({ live }) => live && live.counties!.some((c) => c.pct === 100));
      const byOffice: Record<ResultsOffice, { prior: RacePrior; live: LiveRace | null; proj: ReturnType<typeof projectRace>; actual: number }[]> = { senate: [], governor: [], house: [] };
      for (const { r, live } of pairs) {
        const proj = projectRace(r.prior, live, cfg.needle ?? DEFAULT_PARAMS, fit);
        byOffice[r.prior.office].push({ prior: r.prior, live, proj, actual: r.actual });
        const share = live ? live.total / r.actualTotal : 0;
        if (share > 0.995) continue;
        if (share === 0 && !anyFinished) continue; // the trivial case: nothing in anywhere
        const bucket = BUCKETS.find(([lo, hi]) => share > lo && share < hi)?.[2];
        if (!bucket) continue;
        const z = (r.actual - proj.margin) / proj.sigma;
        rows.push({ bucket, office: r.prior.office, hour: HOURS.find(([lim]) => t <= lim)![1], err: Math.abs(r.actual - proj.margin), z, covered: Math.abs(z) <= 1.2816 ? 1 : 0, logs: -0.5 * z * z - Math.log(proj.sigma) });
      }
      if (anyFinished) for (const o of ["senate", "governor", "house"] as ResultsOffice[]) {
        const rs = byOffice[o];
        if (rs.length < 10) continue;
        const projected = tallyChamber(rs, { dem: 0, rep: 0 }).projected.dem;
        const actual = rs.filter((x) => x.actual <= 0).length;
        seatErr.push({ office: o, err: Math.abs(projected - actual) });
      }
    }
  }
  const buckets = BUCKETS.map(([, , b]) => ({ bucket: b, ...agg(rows.filter((x) => x.bucket === b)) })).filter((b) => b.n > 0);
  const offices = (["senate", "governor", "house"] as ResultsOffice[]).map((o) => ({ office: o, ...agg(rows.filter((x) => x.office === o && x.bucket === BUCKETS[0][2])) }));
  const hours = HOURS.map(([, h]) => ({ hour: h, ...agg(rows.filter((x) => x.hour === h && x.bucket === BUCKETS[0][2])) }));
  const seats = (["senate", "governor", "house"] as ResultsOffice[]).map((o) => { const xs = seatErr.filter((s) => s.office === o); return { office: o, n: xs.length, mae: xs.reduce((a, x) => a + x.err, 0) / Math.max(1, xs.length) }; }).filter((s) => s.n > 0);
  return { name: cfg.name, all: agg(rows), buckets, offices, hours, seats, fits };
}

const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2), pc = (v: number) => `${Math.round(v * 100)}%`;
function show(res: ReturnType<typeof run>) {
  console.log(`\n${res.name}`);
  console.log("  race counted    n     MAE   80% cover  RMS z   log score");
  for (const b of res.buckets) console.log(`  ${b.bucket.padEnd(14)} ${String(b.n).padStart(5)}  ${f1(b.mae).padStart(5)}  ${pc(b.cover).padStart(6)}     ${f2(b.rmsz).padStart(5)}   ${f2(b.logs).padStart(6)}`);
  console.log(`  ${"all".padEnd(14)} ${String(res.all.n).padStart(5)}  ${f1(res.all.mae).padStart(5)}  ${pc(res.all.cover).padStart(6)}     ${f2(res.all.rmsz).padStart(5)}   ${f2(res.all.logs).padStart(6)}`);
  console.log(`  nothing-in by office: ${res.offices.map((o) => `${o.office} MAE ${f1(o.mae)} cover ${pc(o.cover)} (n ${o.n})`).join(" · ")}`);
  console.log(`  nothing-in by hour:   ${res.hours.map((h) => `${h.hour} MAE ${f1(h.mae)} cover ${pc(h.cover)} (n ${h.n})`).join(" · ")}`);
  console.log(`  projected-seat MAE: ${res.seats.map((s) => `${s.office} ${f2(s.mae)} (${s.n} steps)`).join(" · ")}`);
}

const off = (p: Partial<NightParams>): NightParams => ({ ...DEFAULT_NIGHT_PARAMS, ...p });
const CONFIGS: Config[] = [
  { name: "baseline needle (no night model)", night: null },
  { name: "night model, live constants", night: DEFAULT_NIGHT_PARAMS },
  { name: "  without the national term", night: off({ sigmaNational: 0.01 }) },
  { name: "  without the state terms", night: off({ sigmaState: 0.01 }) },
  { name: "  without the office offsets", night: off({ sigmaOffice: 0.01 }) },
  { name: "  without the demographic slopes", night: off({ sigmaNonwhite: 0.01, sigmaCollege: 0.01, sigmaLean: 0.01 }) },
  { name: "  without the lean slope only", night: off({ sigmaLean: 0.01 }) },
  { name: "  night share 1 (all of the prior)", night: DEFAULT_NIGHT_PARAMS, needle: { ...DEFAULT_PARAMS, nightShare: 1 } },
  { name: "  night share 0.25", night: DEFAULT_NIGHT_PARAMS, needle: { ...DEFAULT_PARAMS, nightShare: 0.25 } },
  { name: "  counties from 20% counted", night: off({ minComplete: 0.2 }) },
  { name: "  counties from 80% counted", night: off({ minComplete: 0.8 }) },
];

const results = CONFIGS.map(run);
show(results[0]); show(results[1]);
console.log("\nEvery configuration — races with nothing counted: MAE / 80% cover, by hour; then all rows MAE / cover / log score; projected-seat MAE S · G · H");
for (const r of results) {
  const z = r.buckets[0];
  console.log(`  ${r.name.padEnd(36)} ${f1(z.mae)} / ${pc(z.cover).padStart(3)}   ${r.hours.map((h) => `${f1(h.mae)}/${pc(h.cover)}`).join("  ")}   ·  ${f1(r.all.mae)} / ${pc(r.all.cover)} / ${f2(r.all.logs)}   ·  ${r.seats.map((s) => f2(s.mae)).join(" · ")}`);
}

// How the fitted national swing tracks the real one (the actual mean miss across the year's races, β-weighted) over the night.
{
  const full = results[1];
  console.log("\nFitted national swing vs the year's actual mean miss (per unit β), by hour after 7 PM ET:");
  for (const y of years) {
    const w = y.races.reduce((a, r) => a + r.prior.beta ** 2, 0);
    const truth = y.races.reduce((a, r) => a + r.prior.beta * (r.actual - r.prior.forecast.margin), 0) / w;
    const line = [60, 120, 180, 240, 300, 420].map((t) => { const f = full.fits.find((x) => x.year === y.year && x.t === t); return f ? `${t / 60}h ${f1(f.fit.national.value)}±${f1(f.fit.national.se)} (${Math.round(f.fit.n)} cos)` : `${t / 60}h —`; });
    console.log(`  ${y.year} truth ${f1(truth)}: ${line.join(" · ")}`);
  }
}

if (argv.includes("--grid")) {
  console.log("\nGrid (nothing-in MAE / cover / log score · all MAE / cover / log score · seat MAE S·G·H):");
  for (const nightShare of [0.25, 0.5, 1]) for (const sigmaState of [1.5, 2.5, 4]) for (const demo of [0, 0.5, 1]) {
    const r = run({ name: "", night: off({ sigmaState, sigmaNonwhite: demo ? 1.5 * demo : 0.01, sigmaCollege: demo || 0.01, sigmaLean: demo || 0.01 }), needle: { ...DEFAULT_PARAMS, nightShare } });
    const z = r.buckets[0];
    console.log(`  share ${nightShare} state ${sigmaState} demo×${demo}:  ${f1(z.mae)} / ${pc(z.cover)} / ${f2(z.logs)}  ·  ${f1(r.all.mae)} / ${pc(r.all.cover)} / ${f2(r.all.logs)}  ·  ${r.seats.map((s) => f2(s.mae)).join(" · ")}`);
  }
}

if (argv.includes("--emit")) {
  const strip = (r: ReturnType<typeof run>) => ({ name: r.name.trim(), all: r.all, buckets: r.buckets, offices: r.offices, hours: r.hours, seats: r.seats });
  const round = (o: unknown): unknown => typeof o === "number" ? Math.round(o * 1000) / 1000 : Array.isArray(o) ? o.map(round) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)])) : o;
  const out = `// Generated by scripts/resultsNightBacktest.ts --emit — do not edit. The election-night needle with the
// night model (lib/resultsNight.ts) replayed over the 2018–2024 Senate, governor and House county results
// in a simulated reporting order, scored against the final margins; shown on /analysis/internal-methodology/turnout#results-night.
export const NIGHT_BACKTEST = ${JSON.stringify(round({
    generated: new Date().toISOString().slice(0, 10),
    years: years.map((y) => ({ year: y.year, races: y.races.length, senate: y.races.filter((r) => r.prior.office === "senate").length, governor: y.races.filter((r) => r.prior.office === "governor").length, house: y.races.filter((r) => r.prior.office === "house").length })),
    params: DEFAULT_NIGHT_PARAMS, sigmaForecast: SIGMA_BY_OFFICE, skew: SKEW, stepMinutes: STEP,
    configs: results.map(strip),
  }), null, 2)} as const;\n`;
  writeFileSync(join(ROOT, "data", "resultsNightCalibration.ts"), out);
  console.log("wrote data/resultsNightCalibration.ts");
}
