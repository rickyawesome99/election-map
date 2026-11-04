#!/usr/bin/env node
// Election-night intake: one process keeps the latest civicAPI payload of every 2026 Senate,
// governor and House race on disk, and the Results page (in dev) reads that store through
// /api/results/live instead of every browser polling civicAPI on its own.
//
//   - Toplines (`?light`, ~1 KB) loop continuously over the races whose polls have closed, close and still-counting races first (all
//     races every ALL_EVERY_MS), at most once per TOP_EVERY_MS per race (the feed's edge cache is
//     15 s, so faster gains nothing).
//   - A race whose topline changed (votes, % reporting, call) gets its full payload (counties)
//     fetched right away; every race gets one full fetch at startup.
//   - Each full payload is written to data-entry/results-live/<id>.json and listed in index.json
//     ({ id: fetchedAt }), so the page asks only for races newer than what it has.
//   - Every SNAPSHOT_EVERY_MS the whole store is written as an archive snapshot in the same format
//     scripts/archive-results.mjs writes (data-entry/results-archive/<set>/<ISO>.json.gz), so this
//     replaces the Mac archiver without a second round of requests.
//
//   node scripts/results-live.mjs --set 2026-11-03 --until 2026-11-04T17:00:00Z
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BASE = "https://civicapi.org/api/v2/";
const UA = { "User-Agent": "election-map-live/1.0 (+https://github.com/rickyawesome99/election-map)", Accept: "application/json" };
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const set = flag("--set") ?? new Date().toISOString().slice(0, 10);
const until = flag("--until") ? Date.parse(flag("--until")) : Infinity;
const CONCURRENCY = 12;
const TOP_EVERY_MS = 20_000;
const ALL_EVERY_MS = 10 * 60_000;
const SNAPSHOT_EVERY_MS = 2 * 60_000;
const root = process.cwd();
const LIVE = join(root, "data-entry", "results-live");
const ARCHIVE = join(root, "data-entry", "results-archive", set);
mkdirSync(LIVE, { recursive: true });
mkdirSync(ARCHIVE, { recursive: true });

const ids = parseCsv(readFileSync(join(root, "data-entry", "civicapi_race_ids.csv"), "utf8"));
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
      const res = await fetch(BASE + path, { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

// The store: full payload per race (restored from disk on a restart), its fetch time, and the
// topline signature it was fetched at.
const full = new Map();
const index = existsSync(join(LIVE, "index.json")) ? JSON.parse(readFileSync(join(LIVE, "index.json"), "utf8")) : {};
for (const id of Object.keys(index)) {
  try { full.set(id, JSON.parse(readFileSync(join(LIVE, `${id}.json`), "utf8"))); } catch { delete index[id]; }
}
const sigOf = (r) => JSON.stringify([r.percent_reporting, r.called_at ?? null, (r.candidates ?? []).map((c) => [c.name, Number(c.votes) || 0, !!c.winner])]);
const fullSig = new Map([...full].map(([id, r]) => [id, sigOf(r)]));
const topAt = new Map();
let indexDirty = false;

function writeAtomic(path, text) { writeFileSync(path + ".tmp", text); renameSync(path + ".tmp", path); }

const stats = { top: 0, full: 0, failed: 0, changed: 0 };
async function fetchFull(row) {
  const r = await get(`race/${row.civic_id}`);
  const id = String(row.civic_id);
  full.set(id, r);
  fullSig.set(id, sigOf(r));
  index[id] = Date.now();
  writeAtomic(join(LIVE, `${id}.json`), JSON.stringify(r));
  indexDirty = true;
  stats.full++;
}

// One pool of workers: full fetches (changed races) jump the queue ahead of toplines.
const fullQueue = [];
const queued = new Set();
const enqueueFull = (row) => { if (!queued.has(row.civic_id)) { queued.add(row.civic_id); fullQueue.push(row); } };
const byClose = [...ids].sort((a, b) => Date.parse(a.polls_close_utc) - Date.parse(b.polls_close_utc));
for (const row of byClose) if (!full.has(String(row.civic_id))) enqueueFull(row);
let lastAll = 0;
let topQueue = [];

// Under election-night load the feed answers a few requests a second at best, so toplines go where
// the count can still move a call: a closed race still counting within CLOSE_MARGIN every
// TOP_EVERY_MS, one counting at a wider margin every WIDE_EVERY_MS, one with nothing in yet every
// EMPTY_EVERY_MS, a race with a winner or a single candidate every SETTLED_EVERY_MS. Each batch is
// only the most overdue few, so the close races come round again before the rest of the list is
// worked through.
const CLOSE_MARGIN = 20;
const WIDE_EVERY_MS = 60_000;
const EMPTY_EVERY_MS = 2 * 60_000;
const SETTLED_EVERY_MS = 5 * 60_000;
const BATCH = CONCURRENCY * 2;
function intervalOf(row) {
  const r = full.get(String(row.civic_id));
  if (!r) return TOP_EVERY_MS;
  const cands = (r.candidates ?? []).map((c) => Number(c.votes) || 0).sort((a, b) => b - a);
  if (cands.length < 2 || (r.candidates ?? []).some((c) => c.winner)) return SETTLED_EVERY_MS;
  const total = cands.reduce((a, v) => a + v, 0);
  if (total <= 0) return EMPTY_EVERY_MS;
  return ((cands[0] - cands[1]) / total) * 100 <= CLOSE_MARGIN ? TOP_EVERY_MS : WIDE_EVERY_MS;
}
function nextTopBatch() {
  const now = Date.now();
  const all = now - lastAll > ALL_EVERY_MS;
  if (all) lastAll = now;
  return ids
    .filter((row) => all || Date.parse(row.polls_close_utc) <= now + 5 * 60_000)
    .map((row) => ({ row, overdue: (now - (topAt.get(row.civic_id) ?? 0)) / (all && Date.parse(row.polls_close_utc) > now ? ALL_EVERY_MS : intervalOf(row)) }))
    .filter((x) => x.overdue >= 1)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, BATCH)
    .map((x) => x.row);
}

async function worker() {
  while (Date.now() < until) {
    const row = fullQueue.shift();
    if (row) {
      try { await fetchFull(row); } catch (e) { stats.failed++; setTimeout(() => enqueueFull(row), 10_000); console.error(`  full ${row.state} ${row.district || row.office}: ${e.message}`); }
      queued.delete(row.civic_id);
      continue;
    }
    if (!topQueue.length) topQueue = nextTopBatch();
    const top = topQueue.shift();
    if (!top) { await new Promise((r) => setTimeout(r, 1000)); continue; }
    topAt.set(top.civic_id, Date.now());
    try {
      const r = await get(`race/${top.civic_id}?light`, 2);
      stats.top++;
      if (sigOf(r) !== fullSig.get(String(top.civic_id))) { stats.changed++; enqueueFull(top); }
    } catch { stats.failed++; }
  }
}

// The index is written at most once a second; the page polls it.
setInterval(() => { if (indexDirty) { indexDirty = false; writeAtomic(join(LIVE, "index.json"), JSON.stringify(index)); } }, 1000);

function snapshot() {
  const at = new Date();
  const races = Object.fromEntries(full);
  const file = join(ARCHIVE, `${at.toISOString().replace(/[:.]/g, "-")}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify({ fetchedAt: at.toISOString(), races })));
  console.log(`${at.toISOString()}  snapshot ${full.size} races → ${file} · since last: ${stats.top} toplines, ${stats.changed} changed, ${stats.full} full, ${stats.failed} failed · queue ${fullQueue.length}`);
  stats.top = stats.full = stats.failed = stats.changed = 0;
}
const snapTimer = setInterval(snapshot, SNAPSHOT_EVERY_MS);

console.log(`${new Date().toISOString()}  live intake: ${ids.length} races, ${full.size} restored, set ${set}, until ${new Date(until).toISOString()}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
clearInterval(snapTimer);
snapshot();
process.exit(0);
