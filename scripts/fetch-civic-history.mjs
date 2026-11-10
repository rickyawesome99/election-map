#!/usr/bin/env node
// Download civicAPI's own per-race history of the 2026 count: for every race in
// data-entry/civicapi_race_ids.csv, list `race/{id}/history` and fetch each snapshot
// (`race/{id}/history/{timestamp}` → { timestamp, data }) taken from --from on, into
// data-entry/results-archive/civic-history/<id>/<timestamp>.json.gz. Resumable: snapshots
// already on disk are skipped, so re-run it to pick up the count's later updates.
// scripts/merge-results-archive.mjs then joins these with our own archiver snapshots.
//
//   node scripts/fetch-civic-history.mjs                      # from Nov 3 12:00Z
//   node scripts/fetch-civic-history.mjs --from 2026-11-06T00:00:00Z --workers 3
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BASE = "https://civicapi.org/api/v2/";
const UA = { "User-Agent": "election-map-archive/1.0 (+https://github.com/rickyawesome99/election-map)", Accept: "application/json" };
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const from = flag("--from") ?? "2026-11-03T12:00:00Z";
const workers = Number(flag("--workers")) || 4;
const root = process.cwd();
const outRoot = join(root, "data-entry", "results-archive", "civic-history");

const [head, ...lines] = readFileSync(join(root, "data-entry", "civicapi_race_ids.csv"), "utf8").trim().split(/\r?\n/);
const idCol = head.split(",").indexOf("civic_id");
const ids = lines.map((l) => l.split(",")[idCol]);

async function get(path, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

const fileFor = (id, ts) => join(outRoot, id, `${ts.replace(/[:.]/g, "-")}.json.gz`);
const jobs = [];
let listed = 0;
await Promise.all(Array.from({ length: workers }, async () => {
  while (listed < ids.length) {
    const id = ids[listed++];
    const { timestamps } = await get(`race/${id}/history`);
    mkdirSync(join(outRoot, id), { recursive: true });
    for (const ts of timestamps) if (Date.parse(ts) >= Date.parse(from) && !existsSync(fileFor(id, ts))) jobs.push([id, ts]);
  }
}));
console.log(`${new Date().toISOString()}  ${ids.length} races listed, ${jobs.length} snapshots to fetch (from ${from})`);

let next = 0, done = 0, failed = 0;
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < jobs.length) {
    const [id, ts] = jobs[next++];
    try {
      const snap = await get(`race/${id}/history/${ts}`);
      writeFileSync(fileFor(id, ts), gzipSync(JSON.stringify(snap)));
    } catch (e) { failed++; console.error(`  ${id} ${ts}: ${e.message}`); }
    if (++done % 500 === 0) console.log(`${new Date().toISOString()}  ${done}/${jobs.length} (${failed} failed)`);
  }
}));
console.log(`${new Date().toISOString()}  done: ${done - failed} fetched, ${failed} failed${failed ? " — re-run to retry" : ""}`);
