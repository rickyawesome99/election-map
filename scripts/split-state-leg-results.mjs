#!/usr/bin/env node
/**
 * Splits the per-district state legislative election results into one file per state for the
 * browser to fetch: public/state-leg-results/{ABBR}.json.
 *
 * data/stateLegResults.ts is ~3.6 MB of every state's districts for every year, so it can only be
 * used on the server (see lib/stateLegAggregateAudit.ts). The year selector on a state legislature
 * page is a client interaction that needs one state's rows, and only once the reader asks for a
 * past year - so those rows are served as a static file and fetched on demand instead of being
 * embedded in every legislature page's payload.
 *
 * Input is the same data-entry/state-leg-results/{ABBR}-{year}.json the TS build reads, so the two
 * cannot drift; output is minified and keyed year -> chamber, mirroring the TS shape.
 *
 * Usage: node scripts/split-state-leg-results.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const SRC_DIR = "data-entry/state-leg-results";
const OUT_DIR = "public/state-leg-results";

const byState = {};
for (const file of readdirSync(SRC_DIR).sort()) {
  const m = file.match(/^([A-Z]{2})-(\d{4})\.json$/);
  if (!m) continue;
  const [, abbr, year] = m;
  (byState[abbr] ??= {})[year] = JSON.parse(readFileSync(join(SRC_DIR, file), "utf8"));
}

// Rebuild from scratch so a state dropped from the source doesn't leave a stale file behind.
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

let bytes = 0;
for (const [abbr, byYear] of Object.entries(byState)) {
  const json = JSON.stringify(byYear);
  bytes += json.length;
  writeFileSync(join(OUT_DIR, `${abbr}.json`), json);
}
console.log(
  `Wrote ${Object.keys(byState).length} files to ${OUT_DIR}/ (${(bytes / 1e6).toFixed(2)} MB total, ` +
  `${(bytes / Object.keys(byState).length / 1024).toFixed(0)} KB average)`
);
