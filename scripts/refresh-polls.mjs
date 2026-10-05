#!/usr/bin/env node
// Race-poll refresh — one command for the House / Senate / Governor polls:
//
//   npm run refresh              scrape Wikipedia → merge → rebuild → print what moved
//   npm run refresh -- --dry-run scrape and list the new polls only; nothing is written
//
// Steps, in order (any failure stops the run):
//   1. snapshot the live forecast (scripts/forecastSnapshot.ts)
//   2. python3 scripts/fetch-race-polls.py      → data-entry/race_polls.csv (append-only) + race_polls_checked.txt
//   3. node data-entry/build-race-polls.js       → data/racePolls.ts (incl. racePollsMeta for the overview date)
//   4. python3 scripts/build-pollster-ratings.py → data/pollsterRatings.ts + pollsterLookup.ts ("2026 polls" counts,
//                                                  name → rating aliases; prints 2026 pollsters with no rating match)
//   5. snapshot again and print chamber, rating and margin changes
//   6. save today's forecast to data/forecast-history/ (scripts/saveForecastSnapshot.ts)
//   7. rerun the forecast-over-time series (scripts/buildForecastHistory.ts; builds also do this)
// House effects and the poll averages are computed from data/racePolls.ts at build time, so the next
// `next build` / deploy picks everything up. Review the "+" and "?" lines step 2 prints before committing.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dry = process.argv.includes("--dry-run");

function run(cmd, args) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(" ")} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function snapshot() {
  const out = execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/forecastSnapshot.ts"], { cwd: ROOT, maxBuffer: 64 << 20 });
  return JSON.parse(out.toString());
}

const fmt = (m) => (Math.abs(m) < 0.05 ? "EVEN" : `${m < 0 ? "D" : "R"}+${Math.abs(m).toFixed(1)}`);

if (dry) {
  run("python3", ["scripts/fetch-race-polls.py", "--dry-run"]);
  process.exit(0);
}

const before = snapshot();
run("python3", ["scripts/fetch-race-polls.py"]);
run("node", ["data-entry/build-race-polls.js"]);
run("python3", ["scripts/build-pollster-ratings.py"]);
const after = snapshot();

console.log("\n── What moved ─────────────────────────────────────────────");
for (const [k, a] of Object.entries(after.chambers)) {
  const b = before.chambers[k];
  const ctl = a.pDemControl == null ? "" : `  P(D control) ${(100 * b.pDemControl).toFixed(0)}% → ${(100 * a.pDemControl).toFixed(0)}%`;
  console.log(`${k.padEnd(9)} mean D ${b.meanDem.toFixed(1)} → ${a.meanDem.toFixed(1)}${ctl}`);
}
const moved = Object.entries(after.races)
  .map(([k, a]) => ({ a, b: before.races[k] }))
  .filter(({ a, b }) => b && (a.rating !== b.rating || Math.abs(a.margin - b.margin) >= 1 || a.pollCount !== b.pollCount))
  .sort((x, y) => Math.abs(y.a.margin - y.b.margin) - Math.abs(x.a.margin - x.b.margin));
const ratingChanges = moved.filter(({ a, b }) => a.rating !== b.rating);
console.log(`\nRating changes (${ratingChanges.length}):`);
for (const { a, b } of ratingChanges) console.log(`  ${a.name.padEnd(28)} ${b.rating} → ${a.rating}  (${fmt(b.margin)} → ${fmt(a.margin)})`);
const big = moved.filter(({ a, b }) => a.rating === b.rating && Math.abs(a.margin - b.margin) >= 1);
console.log(`\nMargin moves ≥ 1 pt, same rating (${big.length}):`);
for (const { a, b } of big) console.log(`  ${a.name.padEnd(28)} ${fmt(b.margin)} → ${fmt(a.margin)}`);
const newPolls = moved.filter(({ a, b }) => a.pollCount !== b.pollCount).length;
console.log(`\nRaces whose pollster count changed: ${newPolls}`);
run("npx", ["tsx", "--conditions=react-server", "scripts/saveForecastSnapshot.ts"]);
run("npx", ["tsx", "--conditions=react-server", "scripts/buildForecastHistory.ts"]);
console.log("\nDone. Review the scrape's \"+\" / \"?\" lines above, then commit data-entry/race_polls.csv, data/*.ts and data/forecast-history/.");
