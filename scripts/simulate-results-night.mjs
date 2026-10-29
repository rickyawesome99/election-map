#!/usr/bin/env node
// A simulated election night for the Results page's Replay control, built from a finished
// snapshot of every race (the archiver's latest file, or a live fetch) so the totals and the
// county margins are plausible. Counties start reporting after their state's polls close, each on
// its own randomized ramp with batchy updates; the votes counted first lean a little more
// Democratic than the county's final (the mail/early skew), fading as the count completes; big
// counties finish last; the race-level percent reporting runs ahead of the vote as the real feed's
// does; a race is called once it is nearly done with a clear margin. Output goes to
// data-entry/results-archive/sim-<name>/ as snapshots the archive route lists under that set.
//
// The night runs 7 PM to 11 AM ET: every `step` minutes to 3 AM, then every 15 (the slow
// late count, where the needle has to hold while the last big counties and mail come in). Every
// county finishes by 10:30 AM, so the final snapshots show the whole count at the real totals.
//
//   node scripts/simulate-results-night.mjs                 # sim-night, every 10 virtual minutes to 3 AM, 15 after, to 11 AM ET
//   node scripts/simulate-results-night.mjs slow 5          # sim-slow, every 5 minutes to 3 AM
//   node scripts/simulate-results-night.mjs night 10 --seed 7
//   node scripts/simulate-results-night.mjs realistic 15 --base data-entry/results-archive/realistic-base.json.gz
//                                                           # sim-realistic: our forecast plus a believable miss
//                                                           # (scripts/build-realistic-results-base.ts), every 15 minutes
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const name = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "night";
const stepMin = Number(process.argv[3]) || 10;
const seedArg = process.argv.indexOf("--seed");
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) || 1 : 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const root = process.cwd();
const ARCHIVE = join(root, "data-entry", "results-archive");

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => { const cells = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; } cells.push(cur); return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""])); });
}

// The finished snapshot: the archiver's latest real-date file.
function latestSnapshot() {
  const dates = readdirSync(ARCHIVE).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const d of dates.reverse()) {
    const files = readdirSync(join(ARCHIVE, d)).filter((f) => f.endsWith(".json.gz")).sort();
    if (files.length) return JSON.parse(gunzipSync(readFileSync(join(ARCHIVE, d, files[files.length - 1]))).toString());
  }
  throw new Error("no archived snapshot: run `node scripts/archive-results.mjs once` first");
}

const ids = parseCsv(readFileSync(join(root, "data-entry", "civicapi_race_ids.csv"), "utf8"));
const closeByState = new Map(parseCsv(readFileSync(join(root, "data-entry", "poll_closing_2026.csv"), "utf8")).map((r) => [r.state, r]));
// --base: replay a finished snapshot other than the archiver's latest (the realistic finals).
const baseArg = process.argv.indexOf("--base");
const base = baseArg > 0 ? JSON.parse(gunzipSync(readFileSync(join(root, process.argv[baseArg + 1]))).toString()) : latestSnapshot();

// Virtual clock: minutes after 7 PM ET on Nov 3, 2026 (00:00 UTC Nov 4).
const T0 = Date.parse("2026-11-04T00:00:00.000Z");
const closeMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return ((h < 12 ? h + 24 : h) - 19) * 60 + m; };
const LATE_MIN = 8 * 60; // 3 AM: snapshots thin out after this
const END_MIN = 16 * 60; // 11 AM
const LATE_STEP = Math.max(15, stepMin);
const DONE_BY = END_MIN - 30; // every county is fully counted by 10:30 AM
let clamped = 0;

// Per-race, per-county reporting plan.
const plans = new Map();
for (const row of ids) {
  const race = base.races[row.civic_id];
  if (!race) continue;
  const close = closeByState.get(row.state);
  const first = close ? closeMin(close.first_close_et) : 60, last = close ? closeMin(close.last_close_et) : first;
  const regions = Object.entries(race.region_results ?? {});
  const finalTotal = (race.candidates ?? []).reduce((a, c) => a + (Number(c.votes) || 0), 0);
  const votesOf = (r) => (r.candidates ?? []).reduce((a, c) => a + (Number(c.votes) || 0), 0);
  // New England races list the same votes at two or three levels (County + Town/Township, and in
  // Connecticut Planning Region too; Rhode Island's towns come typed County, without a FIPS);
  // Virginia's County + City are disjoint. When one level alone carries the race's total, only
  // that level adds into the race's count (County first).
  const byType = new Map();
  for (const [, r] of regions) byType.set(r.type ?? "County", (byType.get(r.type ?? "County") ?? 0) + votesOf(r));
  const near = (v) => finalTotal > 0 && Math.abs(v - finalTotal) <= 0.01 * finalTotal;
  const sumType = byType.size > 1 ? (near(byType.get("County") ?? 0) ? "County" : [...byType].find(([, v]) => near(v))?.[0] ?? null) : null;
  // Within one type, when the rows with a FIPS already carry the whole total and the rows without
  // one hold a large share again, those are a second level (Rhode Island's towns), not a county or
  // two the feed sent without a FIPS (South Carolina's McCormick).
  const ofType = regions.filter(([, r]) => (r.type ?? "County") === (sumType ?? r.type ?? "County"));
  const sumOf = (rs) => rs.reduce((a, [, r]) => a + votesOf(r), 0);
  const fipsOnly = near(sumOf(ofType.filter(([, r]) => r.fips))) && sumOf(ofType.filter(([, r]) => !r.fips)) > 0.25 * finalTotal;
  const counties = regions.map(([key, r]) => {
    const total = votesOf(r);
    const size = finalTotal ? total / finalTotal : 0;
    // Start 5–60 minutes after the (latest) close; bigger counties ramp longer; a few drag on.
    const start = last + 5 + rand() * 55;
    const drawn = 40 + rand() * 120 + Math.sqrt(size) * 400 + (rand() < 0.08 ? 180 : 0);
    // The slowest tails (a whole-district county in a late-closing state) are squeezed to finish by DONE_BY.
    const length = Math.min(drawn, DONE_BY - start);
    if (length < drawn) clamped++;
    const batches = 3 + Math.floor(rand() * 8);
    const earlySkew = (rand() - 0.2) * 12; // points of margin by which the first votes lean more D
    return { key, start, length, batches, earlySkew, total, sums: (!sumType || (r.type ?? "County") === sumType) && (!fipsOnly || !!r.fips) };
  });
  const noRegions = !regions.length;
  plans.set(row.civic_id, { race, row, first, last, counties, finalTotal, noRegions, raceStart: last + 5 + rand() * 40, raceLength: 120 + rand() * 180 });
}

const stepped = (t, start, length, batches) => {
  if (t <= start) return 0;
  const x = Math.min(1, (t - start) / length);
  const s = 1 / (1 + Math.exp(-7 * (x - 0.5)));
  const scaled = (s - 1 / (1 + Math.exp(3.5))) / (1 / (1 + Math.exp(-3.5)) - 1 / (1 + Math.exp(3.5)));
  return x >= 1 ? 1 : Math.floor(scaled * batches) / batches;
};

function candidatesAt(cands, frac, skew) {
  // Scale every candidate; move margin between the two biggest by `skew` points at the start, fading.
  const sorted = [...cands].sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
  const total = cands.reduce((a, c) => a + (Number(c.votes) || 0), 0) * frac;
  const dem = sorted.find((c) => c.party === "Democratic"), rep = sorted.find((c) => c.party === "Republican");
  const out = cands.map((c) => ({ ...c, votes: Math.round((Number(c.votes) || 0) * frac), winner: false }));
  if (dem && rep && total > 0 && frac < 1) {
    const shift = Math.round((total * skew * (1 - frac)) / 200);
    const d = out.find((c) => c.name === dem.name), r = out.find((c) => c.name === rep.name);
    d.votes = Math.max(0, d.votes + shift); r.votes = Math.max(0, r.votes - shift);
  }
  const sum = out.reduce((a, c) => a + c.votes, 0);
  for (const c of out) c.percent = sum ? Math.round((c.votes / sum) * 10000) / 100 : 0;
  return out;
}

const outDir = join(ARCHIVE, `sim-${name}`);
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
let n = 0;
const times = [];
for (let t = 0; t <= LATE_MIN; t += stepMin) times.push(t);
for (let t = LATE_MIN + LATE_STEP; t <= END_MIN; t += LATE_STEP) times.push(t);
for (const t of times) {
  const at = new Date(T0 + t * 60_000);
  const races = {};
  for (const [cid, p] of plans) {
    const r = p.race;
    const regionOut = {};
    let sumFrac = 0, allDone = !p.noRegions;
    const partCands = new Map();
    if (!p.noRegions) {
      for (const c of p.counties) {
        const frac = stepped(t, c.start, c.length, c.batches);
        if (frac < 1) allDone = false;
        const reg = r.region_results[c.key];
        const cands = candidatesAt(reg.candidates ?? [], frac, c.earlySkew);
        regionOut[c.key] = { ...reg, candidates: cands, percent_reporting: Math.round(Math.min(100, frac * 100 + (frac > 0 && frac < 1 ? 15 : 0)) * 10) / 10 };
        if (!c.sums) continue;
        sumFrac += frac * c.total;
        for (const cd of cands) partCands.set(cd.name, (partCands.get(cd.name) ?? 0) + cd.votes);
      }
    }
    // Once every county is in, the race shows the feed's own final totals: where a state lists two
    // levels (New England counties and towns) the summed level can fall a little short of them.
    const raceFrac = allDone ? 1 : p.noRegions ? stepped(t, p.raceStart, p.raceLength, 6) : p.finalTotal ? sumFrac / p.finalTotal : 0;
    const candidates = p.noRegions
      ? candidatesAt(r.candidates ?? [], raceFrac, 4)
      : allDone ? (r.candidates ?? []).map((c) => ({ ...c, votes: Number(c.votes) || 0, winner: false }))
      : (r.candidates ?? []).map((c) => ({ ...c, votes: partCands.get(c.name) ?? 0, winner: false }));
    const total = candidates.reduce((a, c) => a + c.votes, 0);
    for (const c of candidates) c.percent = total ? Math.round((c.votes / total) * 10000) / 100 : 0;
    const top = [...candidates].sort((a, b) => b.votes - a.votes);
    const lead = top.length > 1 && total ? ((top[0].votes - top[1].votes) / total) * 100 : 0;
    const called = raceFrac >= 1 || (raceFrac > 0.85 && lead > 8) || (raceFrac > 0.6 && lead > 20);
    if (called && top[0]) top[0].winner = true;
    const pr = Math.round(Math.min(100, raceFrac * 100 + (raceFrac > 0 && raceFrac < 1 ? 20 * (1 - raceFrac) : 0)) * 10) / 10;
    races[cid] = { ...r, candidates, region_results: p.noRegions ? r.region_results : regionOut, percent_reporting: t < p.first ? 0 : pr, called_at: called ? at.toISOString() : null, last_updated: at.toISOString(), test_data: true };
  }
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(outDir, `${stamp}.json.gz`), gzipSync(JSON.stringify({ fetchedAt: at.toISOString(), simulated: true, races })));
  n++;
}
console.log(`wrote ${n} snapshots → ${outDir} (${plans.size} races, ${clamped} county ramps squeezed to finish by 10:30 AM; open /results and use Replay archive)`);
