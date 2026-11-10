#!/usr/bin/env node
// Join every record of the 2026 count into one archive set: civicAPI's own per-race history
// (data-entry/results-archive/civic-history/, from scripts/fetch-civic-history.mjs) and our
// archiver snapshots (the 2026-11-03 Mac set and the 2026-11-03-cloud GitHub Actions set).
//
// Each race's distinct states are keyed by the payload's last_updated, so the same update seen
// by several sources is kept once. Board snapshots are then written on a STEP-minute grid: at
// the end of every step in which some race changed, one file with every race's latest state
// as of that moment, in the archiver's format ({ fetchedAt, races: { [civic_id]: payload } }),
// into data-entry/results-archive/<out>/. sources.csv there counts each race's states by source.
//
//   node scripts/merge-results-archive.mjs                 # → 2026-11-03-full, 2-minute grid
//   node scripts/merge-results-archive.mjs --step 5 --out 2026-11-03-full5
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const STEP = (Number(flag("--step")) || 2) * 60_000;
const ARCHIVE = join(process.cwd(), "data-entry", "results-archive");
const OUT = join(ARCHIVE, flag("--out") ?? "2026-11-03-full");
const OUR_SETS = ["2026-11-03", "2026-11-03-cloud"];

// race id → Map(last_updated ms → { gz, sources: Set })
const states = new Map();
const add = (id, payload, fallbackAt, source) => {
  if (!payload) return;
  const t = Date.parse(payload.last_updated ?? "") || fallbackAt;
  let m = states.get(id);
  if (!m) states.set(id, (m = new Map()));
  const have = m.get(t);
  if (have) have.sources.add(source);
  else m.set(t, { gz: gzipSync(JSON.stringify(payload)), sources: new Set([source]) });
};

const histDir = join(ARCHIVE, "civic-history");
let histFiles = 0;
for (const id of existsSync(histDir) ? readdirSync(histDir) : []) {
  for (const f of readdirSync(join(histDir, id))) {
    if (!f.endsWith(".json.gz")) continue;
    const { timestamp, data } = JSON.parse(gunzipSync(readFileSync(join(histDir, id, f))));
    add(id, data, Date.parse(timestamp), "civic");
    histFiles++;
  }
}
let ourFiles = 0, firstAt = Infinity;
for (const set of OUR_SETS) {
  const dir = join(ARCHIVE, set);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json.gz")) continue;
    const snap = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    const at = Date.parse(snap.fetchedAt);
    firstAt = Math.min(firstAt, at);
    for (const [id, payload] of Object.entries(snap.races)) add(id, payload, at, set);
    ourFiles++;
  }
}
console.log(`read ${histFiles} civicAPI history snapshots, ${ourFiles} archiver snapshots; ${states.size} races`);

// Every race's states in time order; the grid starts at our first board snapshot (every race
// present), and each step that saw a change gets a snapshot at its end.
const ordered = new Map([...states].map(([id, m]) => [id, [...m].sort((a, b) => a[0] - b[0])]));
const change = new Set();
let lastAt = firstAt;
for (const list of ordered.values()) for (const [t] of list) {
  if (t > firstAt) change.add(Math.ceil((t - firstAt) / STEP));
  lastAt = Math.max(lastAt, t);
}
const steps = [0, ...[...change].sort((a, b) => a - b)];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const cursor = new Map([...ordered.keys()].map((id) => [id, -1]));
const current = new Map();
for (const k of steps) {
  const at = Math.min(firstAt + k * STEP, lastAt);
  for (const [id, list] of ordered) {
    let i = cursor.get(id);
    while (i + 1 < list.length && list[i + 1][0] <= at) i++;
    if (i >= 0 && i !== cursor.get(id)) { cursor.set(id, i); current.set(id, gunzipSync(list[i][1].gz).toString()); }
  }
  const iso = new Date(at).toISOString();
  const body = `{"fetchedAt":${JSON.stringify(iso)},"races":{${[...current].map(([id, s]) => `${JSON.stringify(id)}:${s}`).join(",")}}}`;
  writeFileSync(join(OUT, `${iso.replace(/[:.]/g, "-")}.json.gz`), gzipSync(body));
}

const csv = ["civic_id,states,civic_only,ours_only,both,first_update,last_update"];
for (const [id, list] of ordered) {
  const civic = list.filter(([, s]) => s.sources.has("civic")).length;
  const ours = list.filter(([, s]) => [...s.sources].some((x) => x !== "civic")).length;
  const both = list.filter(([, s]) => s.sources.has("civic") && s.sources.size > 1).length;
  csv.push([id, list.length, civic - both, ours - both, both, new Date(list[0][0]).toISOString(), new Date(list.at(-1)[0]).toISOString()].join(","));
}
writeFileSync(join(OUT, "sources.csv"), csv.join("\n") + "\n");
console.log(`wrote ${steps.length} snapshots, ${new Date(firstAt).toISOString()} → ${new Date(lastAt).toISOString()}, to ${OUT}`);
