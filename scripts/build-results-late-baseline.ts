// The late-count baseline behind lib/resultsFeed.ts (percents held) and lib/resultsNeedle.ts (late
// lean): each race's and county's percent and total from the archive's last snapshot before civicAPI
// changed what percent_reporting means, and each race's count from the snapshot the late lean is
// measured from. The archive is gitignored, so the output is committed and this only reruns by hand.
//
//   npx tsx --conditions=react-server scripts/build-results-late-baseline.ts
//
// Writes data-entry/results_2026_late_baseline.csv. A row with no fips is the race's.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { resultsPriors } from "@/lib/resultsPriors";
import { normalizeRace } from "@/lib/resultsFeed";
import { RESULTS_OFFICES } from "@/lib/resultsTypes";

const ARCHIVE = join(process.cwd(), "data-entry", "results-archive", "2026-11-03");
const OUT = join(process.cwd(), "data-entry", "results_2026_late_baseline.csv");
/** The feed's last snapshot in the archive, with the old percents. */
const HOLD_FILE = "2026-11-06T05-00-00-943Z.json.gz";
/** Where the late lean starts: the night's chaos over (Illinois's Nov 4 batches ran 50 points off). */
const LEAN_FILE = "2026-11-05T13-15-20-319Z.json.gz";

type Snap = { fetchedAt: string; races: Record<string, unknown> };
const read = (f: string) => JSON.parse(gunzipSync(readFileSync(join(ARCHIVE, f))).toString()) as Snap;
const hold = read(HOLD_FILE), lean = read(LEAN_FILE);

const rows = ["office,race_id,fips,pct,total,lean_total,lean_net_r"];
for (const office of RESULTS_OFFICES) for (const prior of resultsPriors(office).races) {
  const rawHold = prior.civicId ? hold.races[prior.civicId] : null, rawLean = prior.civicId ? lean.races[prior.civicId] : null;
  if (!rawHold || !rawLean) continue;
  const h = normalizeRace(prior, rawHold as never, Date.parse(hold.fetchedAt)), l = normalizeRace(prior, rawLean as never, Date.parse(lean.fetchedAt));
  rows.push([office, prior.id, "", h.percentReporting, l.total, l.total, l.rep - l.dem].join(","));
  // The total is the lean snapshot's, so a county that was still growing by the feed's last old percent
  // (California's false 100%s, CA-23 up 16% in the day before it) doesn't count as finished.
  const leanTotals = new Map((l.counties ?? []).map((c) => [c.fips, c.total]));
  for (const c of h.counties ?? []) if (c.fips && c.pct != null) rows.push([office, prior.id, c.fips, c.pct, leanTotals.get(c.fips) ?? c.total, "", ""].join(","));
}
writeFileSync(OUT, rows.join("\n") + "\n");
console.log(`Wrote ${rows.length - 1} rows to ${OUT}`);
