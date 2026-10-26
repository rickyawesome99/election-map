// Publishes the simulated nights (data-entry/results-archive/sim-*, from
// scripts/simulate-results-night.mjs) to public/results-sim/ so the Results page's pre-election
// preview works on the deployed site, where the archive directory and its API routes are empty.
// Writes, per set, the gzipped snapshots as they are (the page gunzips them in the browser) and
// series.json (the needle's expected seats and every race's projected margin at every snapshot, as /api/results/archive/series
// computes it), plus manifest.json listing every snapshot in the archive route's shape.
//
//   npm run publish-sim-night
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { resultsPriors } from "../lib/resultsPriors";
import { normalizeRace } from "../lib/resultsFeed";
import { projectRace, tallyChamber } from "../lib/resultsNeedle";
import { SEAT_HOLDOVERS } from "../lib/forecastTypes";
import { RESULTS_OFFICES, type ArchiveSeries, type LiveRace } from "../lib/resultsTypes";
import { raceHash } from "../lib/resultsFormat";

const SRC = join(process.cwd(), "data-entry", "results-archive");
const OUT = join(process.cwd(), "public", "results-sim");
const FILE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json\.gz$/;

const sets = existsSync(SRC) ? readdirSync(SRC).filter((d) => /^sim-[a-z0-9-]+$/.test(d)).sort() : [];
if (!sets.length) throw new Error("no sim-* set: run `node scripts/simulate-results-night.mjs` first");
rmSync(OUT, { recursive: true, force: true });
const priors = RESULTS_OFFICES.map((o) => resultsPriors(o));
const snapshots: { file: string; fetchedAt: string; set: string }[] = [];

for (const set of sets) {
  mkdirSync(join(OUT, set), { recursive: true });
  const series: Required<ArchiveSeries> = { senate: [], governor: [], house: [], races: {} };
  const r1 = (v: number) => Math.round(v * 10) / 10;
  for (const name of readdirSync(join(SRC, set)).filter((f) => FILE_RE.test(f)).sort()) {
    copyFileSync(join(SRC, set, name), join(OUT, set, name));
    const data = JSON.parse(gunzipSync(readFileSync(join(SRC, set, name))).toString()) as { fetchedAt: string; races: Record<string, unknown> };
    const t = Date.parse(data.fetchedAt);
    snapshots.push({ file: `${set}/${name}`, fetchedAt: new Date(t).toISOString(), set });
    RESULTS_OFFICES.forEach((office, i) => {
      const rows = priors[i].races.map((prior) => {
        const raw = prior.civicId ? data.races[String(prior.civicId)] : null;
        const live: LiveRace | null = raw ? normalizeRace(prior, raw as never, t) : null;
        return { prior, live, proj: projectRace(prior, live) };
      });
      for (const r of rows) (series.races[raceHash(r.prior)] ??= []).push([r1(r.proj.margin), r1(r.proj.sigma)]);
      const e = tallyChamber(rows, SEAT_HOLDOVERS[office]).expectedDem;
      series[office].push({ t, mean: e.mean, lo: e.lo80, hi: e.hi80 });
    });
  }
  writeFileSync(join(OUT, set, "series.json"), JSON.stringify(series));
  console.log(`${set}: ${series.senate.length} snapshots`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ snapshots }));
