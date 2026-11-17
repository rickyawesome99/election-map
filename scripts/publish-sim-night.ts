// Packages the simulated nights (data-entry/results-archive/sim-*, from
// scripts/simulate-results-night.mjs) for replay: per set, the gzipped snapshots as they are and
// series.json (the needle's projected seats and every race's projected and counted margin at every
// snapshot), plus manifest.json listing every snapshot.
//
// Until 2026-11-17 this went to public/results-sim/ for the pre-election preview on the site. The
// page is now a static archive of the real count, so the package is kept locally only, in
// data-entry/results-archive/results-sim-published/ (gitignored, not deployed).
//
//   npm run publish-sim-night
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { resultsPriors } from "../lib/resultsPriors";
import { normalizeRace } from "../lib/resultsFeed";
import { nightObservations, projectRace, tallyChamber } from "../lib/resultsNeedle";
import { fitNight } from "../lib/resultsNight";
import { SEAT_HOLDOVERS } from "../lib/forecastTypes";
import { RESULTS_OFFICES, type ArchiveSeries, type LiveRace } from "../lib/resultsTypes";
import { raceHash } from "../lib/resultsFormat";

const SRC = join(process.cwd(), "data-entry", "results-archive");
const OUT = join(process.cwd(), "data-entry", "results-archive", "results-sim-published");
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
    // Every race's live state first: the night fit reads all of them before any race is projected.
    const pairs = priors.map((slice) => slice.races.map((prior) => {
      const raw = prior.civicId ? data.races[String(prior.civicId)] : null;
      const live: LiveRace | null = raw ? normalizeRace(prior, raw as never, t) : null;
      return { prior, live };
    }));
    const fit = fitNight(pairs.flat().flatMap(({ prior, live }) => nightObservations(prior, live)));
    RESULTS_OFFICES.forEach((office, i) => {
      const rows = pairs[i].map(({ prior, live }) => ({ prior, live, proj: projectRace(prior, live, undefined, fit) }));
      for (const r of rows) (series.races[raceHash(r.prior)] ??= []).push([r1(r.proj.margin), r1(r.proj.sigma), r.proj.currentMargin == null ? null : r1(r.proj.currentMargin)]);
      const e = tallyChamber(rows, SEAT_HOLDOVERS[office]).projectedDem;
      series[office].push({ t, mean: e.seats, lo: e.lo80, hi: e.hi80 });
    });
  }
  writeFileSync(join(OUT, set, "series.json"), JSON.stringify(series));
  console.log(`${set}: ${series.senate.length} snapshots`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ snapshots }));
