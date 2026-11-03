#!/usr/bin/env node
// Election-night archive: every INTERVAL minutes, fetch the full civicAPI payload of every 2026
// Senate, governor and House race (data-entry/civicapi_race_ids.csv) and write one gzipped
// snapshot to data-entry/results-archive/<date>/<ISO time>.json.gz, plus a running CSV of the
// race-level figures (data-entry/results-archive/<date>/timeline.csv) for a quick look at how
// the count came in. The site never reads these; they are for looking back at the night.
//
//   node scripts/archive-results.mjs            # every 5 minutes until Ctrl-C
//   node scripts/archive-results.mjs 2          # every 2 minutes
//   node scripts/archive-results.mjs 1 40       # every minute, 40 snapshots, then exit
//   node scripts/archive-results.mjs once       # one snapshot
//   node scripts/archive-results.mjs 2 --set 2026-11-03 --start 2026-11-03T22:45:00Z --until 2026-11-04T17:00:00Z
//        # election night: one folder for the whole night (the default, the UTC date, splits it at
//        # 7 PM ET), sleeping until --start and stopping at --until
//
// The Results page replays these: /api/results/archive lists them (dev only — the directory is
// not deployed) and the page's Replay control steps through them.
import { createWriteStream, existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BASE = "https://civicapi.org/api/v2/";
const UA = { "User-Agent": "election-map-archive/1.0 (+https://github.com/rickyawesome99/election-map)", Accept: "application/json" };
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const [arg, countArg] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const once = arg === "once";
const intervalMin = once ? 0 : Number(arg) || 5;
const maxCount = Number(countArg) || Infinity;
const set = flag("--set");
const startAt = flag("--start") ? Date.parse(flag("--start")) : null;
const until = flag("--until") ? Date.parse(flag("--until")) : Infinity;
const root = process.cwd();
const ids = parseCsv(readFileSync(join(root, "data-entry", "civicapi_race_ids.csv"), "utf8"));
const dateDir = () => join(root, "data-entry", "results-archive", set ?? new Date().toISOString().slice(0, 10));

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const cells = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; }
    cells.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

async function get(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function snapshot() {
  const started = new Date();
  const out = {};
  let i = 0;
  const missed = [];
  const worker = async () => {
    while (i < ids.length) {
      const row = ids[i++];
      try { out[row.civic_id] = await get(`race/${row.civic_id}`); }
      catch { missed.push(row); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // The feed's 502s come in bursts; races that failed all their tries get one more round after it.
  let failed = 0;
  if (missed.length) await new Promise((r) => setTimeout(r, 5000));
  for (const row of missed) {
    try { out[row.civic_id] = await get(`race/${row.civic_id}`); }
    catch (e) { failed++; console.error(`  ${row.office} ${row.state} ${row.district}: ${e.message}`); }
  }
  const dir = dateDir();
  mkdirSync(dir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `${stamp}.json.gz`);
  createWriteStream(file).end(gzipSync(JSON.stringify({ fetchedAt: started.toISOString(), races: out })));
  const timeline = join(dir, "timeline.csv");
  if (!existsSync(timeline)) appendFileSync(timeline, "fetched_at,office,state,district,civic_id,percent_reporting,called_at,test_data,total_votes,dem_votes,rep_votes,counties,counties_with_votes\n");
  const lines = [];
  for (const row of ids) {
    const r = out[row.civic_id];
    if (!r) continue;
    const cands = r.candidates ?? [];
    const sum = (party) => cands.filter((c) => c.party === party).reduce((a, c) => a + (Number(c.votes) || 0), 0);
    const total = cands.reduce((a, c) => a + (Number(c.votes) || 0), 0);
    const regions = Object.values(r.region_results ?? {}).filter((g) => g.type === "County");
    const withVotes = regions.filter((g) => (g.candidates ?? []).some((c) => Number(c.votes) > 0)).length;
    lines.push([started.toISOString(), row.office, row.state, row.district, row.civic_id, r.percent_reporting ?? "", r.called_at ?? "", r.test_data ? 1 : 0, total, sum("Democratic"), sum("Republican"), regions.length, withVotes].join(","));
  }
  appendFileSync(timeline, lines.join("\n") + "\n");
  console.log(`${started.toISOString()}  ${Object.keys(out).length} races (${failed} failed) → ${file}  ${((Date.now() - started.getTime()) / 1000).toFixed(0)}s`);
}

(async () => {
  if (startAt && startAt > Date.now()) {
    console.log(`${new Date().toISOString()}  waiting until ${new Date(startAt).toISOString()}`);
    while (Date.now() < startAt) await new Promise((r) => setTimeout(r, Math.min(60_000, startAt - Date.now())));
  }
  for (let n = 1; ; n++) {
    // Snapshots start on the interval, however long a fetch takes.
    const next = Date.now() + intervalMin * 60_000;
    try { await snapshot(); } catch (e) { console.error(e); }
    if (once || n >= maxCount || Date.now() >= until) break;
    await new Promise((r) => setTimeout(r, Math.max(0, next - Date.now())));
  }
})();
