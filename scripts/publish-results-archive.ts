// Publishes the 2026 count as it came in, 6 PM ET Tuesday Nov 3 → 6 PM ET Monday Nov 16, to
// public/results-archive-2026/, so /enight replays the real night (and the late count) once the
// live feed is closed (RESULTS_ARCHIVE in lib/resultsTypes.ts).
//
// Source: data-entry/results-archive/2026-11-03-full/ (scripts/merge-results-archive.mjs: civicAPI's
// per-race history joined with our own archiver sets, on a 2-minute grid where something changed).
// Frames are picked on a cadence that thins as the count slows (FRAME_STEPS), each the board as of
// that moment. Every race is normalized at the frame's time (so the late-count rules switch on as
// they did live), and a frame stores only the races whose normalized state changed. Frames are
// grouped into chunks: one keyframe (every race) and the deltas after it, gzipped, so a slider jump
// costs one chunk. Each frame also carries the night model's fit and area swings (so the page
// never refits: the fit is most of a frame's work) and the races whose count moved since the
// previous frame. seats.json holds the chambers' projected seats at every frame (the cards'
// charts) and races.json every race's projected and counted margin (read only when a race opens).
//
//   npx tsx --conditions=react-server scripts/publish-results-archive.ts
//   (npm run publish-results-archive)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { resultsPriors } from "../lib/final2026"; // the election-day priors, frozen
import { normalizeRace } from "../lib/resultsFeed";
import { nightObservations, projectRace, tallyChamber } from "../lib/resultsNeedle";
import { areaSwings, fitNight } from "../lib/resultsNight";
import { SEAT_HOLDOVERS } from "../lib/forecastTypes";
import { RESULTS_ARCHIVE, RESULTS_OFFICES, type ArchiveSeries, type LiveRace, type ResultsArchiveChunk, type ResultsArchiveManifest } from "../lib/resultsTypes";
import { raceHash } from "../lib/resultsFormat";

const SRC = join(process.cwd(), "data-entry", "results-archive", "2026-11-03-full");
const OUT = join(process.cwd(), "public", RESULTS_ARCHIVE.dir);
const FILE_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json\.gz$/;
const START = RESULTS_ARCHIVE.start, END = RESULTS_ARCHIVE.end;
/** Frame cadence: [until, minutes between frames]. Dense while the night moved fast, then thinner. */
const FRAME_STEPS: [number, number][] = [
  [Date.parse("2026-11-04T11:00:00Z"), 5],    // election night, to 6 AM ET Wednesday
  [Date.parse("2026-11-05T11:00:00Z"), 15],   // Wednesday into Thursday morning
  [Date.parse("2026-11-07T05:00:00Z"), 60],   // the late count's first days
  [END, 180],                                 // the long tail to Monday Nov 16
];
const CHUNK = 24;

if (!existsSync(SRC)) throw new Error(`${SRC} missing: run scripts/fetch-civic-history.mjs, then scripts/merge-results-archive.mjs`);
const files = readdirSync(SRC).flatMap((f) => {
  const m = FILE_RE.exec(f);
  return m ? [{ f, t: Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) }] : [];
}).sort((a, b) => a.t - b.t);

// Frame times: the window's start, then every step's end up to END. A frame takes the latest board
// file at or before its time; a frame whose file is the previous frame's is skipped (nothing moved).
const times: number[] = [START];
for (let t = START, s = 0; t < END;) {
  while (t >= FRAME_STEPS[s][0]) s++;
  t = Math.min(t + FRAME_STEPS[s][1] * 60_000, END);
  times.push(t);
}
const picks: { t: number; f: string }[] = [];
for (const t of times) {
  const file = files.filter((x) => x.t <= t).pop();
  if (!file) continue;
  if (picks.length && picks[picks.length - 1].f === file.f && t !== END) continue;
  picks.push({ t, f: file.f });
}

const priors = RESULTS_OFFICES.map((o) => resultsPriors(o));
const allPriors = priors.flatMap((s) => s.races);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const series: Required<ArchiveSeries> = { senate: [], governor: [], house: [], races: {} };
const r1 = (v: number) => Math.round(v * 10) / 10;
const manifest: ResultsArchiveManifest = { start: START, end: END, frames: [], chunks: [] };
const prevKey = new Map<number, string>();
const prevTotal = new Map<number, number>();
let chunk: ResultsArchiveChunk | null = null;
let rawBytes = 0;
const flush = () => {
  if (!chunk) return;
  const name = `chunk-${String(manifest.chunks.length).padStart(3, "0")}.json.gz`;
  const body = gzipSync(JSON.stringify(chunk), { level: 9 });
  writeFileSync(join(OUT, name), body);
  manifest.chunks.push({ file: name, first: chunk.first, size: body.length });
  chunk = null;
};

for (const [i, { t, f }] of picks.entries()) {
  const data = JSON.parse(gunzipSync(readFileSync(join(SRC, f))).toString()) as { fetchedAt: string; races: Record<string, unknown> };
  const lives: LiveRace[] = [];
  const pairs = priors.map((slice) => slice.races.map((prior) => {
    const raw = prior.civicId ? data.races[String(prior.civicId)] : null;
    const live: LiveRace | null = raw ? normalizeRace(prior, raw as never, t) : null;
    if (live) lives.push(live);
    return { prior, live };
  }));
  // Changed races. fetchedAt is left out (the page stamps every race with the frame's time), and so
  // is lastUpdated: civicAPI bumped it on every race every few minutes with no new votes, and no
  // page reads it, so a stored race keeps the lastUpdated of its last real change.
  const keyframe = i % CHUNK === 0;
  if (keyframe) { flush(); chunk = { first: i, frames: [] }; }
  const races: LiveRace[] = [];
  for (const l of lives) {
    const k = JSON.stringify({ ...l, fetchedAt: 0, lastUpdated: null });
    if (keyframe || prevKey.get(l.civicId) !== k) races.push({ ...l, fetchedAt: 0 });
    prevKey.set(l.civicId, k);
  }
  // Races whose vote total moved since the previous frame, most votes added first.
  const moved: [number, number][] = [];
  for (const l of lives) {
    const before = prevTotal.get(l.civicId) ?? 0;
    if (!l.testData && l.total > 0 && l.total !== before) moved.push([l.civicId, l.total - before]);
    prevTotal.set(l.civicId, l.total);
  }
  moved.sort((a, b) => b[1] - a[1]);
  const obs = pairs.flat().flatMap(({ prior, live }) => nightObservations(prior, live));
  const fit = fitNight(obs);
  rawBytes += JSON.stringify(races).length;
  // The fit as data, the covariance to 6 significant figures (it only feeds standard errors).
  const fitData = { ...fit.data, covUpper: fit.data.covUpper.map((v) => Number(v.toPrecision(6))) };
  chunk!.frames.push({ t, races, fit: fitData, areas: areaSwings(obs), moved });
  manifest.frames.push({ t, changed: keyframe ? -1 : races.length });

  RESULTS_OFFICES.forEach((office, oi) => {
    const rows = pairs[oi].map(({ prior, live }) => ({ prior, live, proj: projectRace(prior, live, undefined, fit) }));
    for (const r of rows) (series.races[raceHash(r.prior)] ??= []).push([r1(r.proj.margin), r1(r.proj.sigma), r.proj.currentMargin == null ? null : r1(r.proj.currentMargin)]);
    const e = tallyChamber(rows, SEAT_HOLDOVERS[office]).projectedDem;
    series[office].push({ t, mean: e.seats, lo: e.lo80, hi: e.hi80 });
  });
  if (i % 25 === 0) console.log(`${new Date(t).toISOString()}  frame ${i + 1}/${picks.length} ← ${f}  (${races.length} races stored)`);
}
flush();
const { races: raceSeries, ...seats } = series;
writeFileSync(join(OUT, "seats.json"), JSON.stringify(seats));
writeFileSync(join(OUT, "races.json"), JSON.stringify(raceSeries));
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
const total = manifest.chunks.reduce((a, c) => a + c.size, 0);
console.log(`${picks.length} frames (${new Date(START).toISOString()} → ${new Date(END).toISOString()}), ${manifest.chunks.length} chunks, ${(total / 1e6).toFixed(1)} MB gz (${(rawBytes / 1e6).toFixed(0)} MB raw); ${allPriors.length} races → ${OUT}`);
