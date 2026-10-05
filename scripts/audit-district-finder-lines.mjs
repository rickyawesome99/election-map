// Audit: does the District Finder put a point in the congressional district the site's own 2026
// map puts it in?
//
// Run (dev server up):  node scripts/audit-district-finder-lines.mjs [baseUrl]
//
// The finder takes its districts from the Census geocoder (app/api/districts/route.ts), whose
// current layer can carry lines that are not on the ballot — it drew Missouri's 2025 redraw after
// the courts threw it out. This samples random points in every multi-district state, asks the
// finder's API for each, and compares the answer with public/congressional-districts-2026.json.
// That file is simplified, so a stray mismatch on a border is noise; a state where many points
// disagree needs an entry in CD_VINTAGE_OVERRIDE (or has one that is no longer right).

import fs from "node:fs";
import { feature } from "topojson-client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const POINTS_PER_STATE = 40;
/** Share of a state's points that may disagree before it is flagged — border noise runs under 5%. */
const TOLERANCE = 0.1;

const topo = JSON.parse(fs.readFileSync("public/congressional-districts-2026.json", "utf8"));
const districts = feature(topo, topo.objects["congressional-districts-2026"]).features;

// Planar even-odd test, so ring winding does not matter.
const inRing = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const polygonsOf = (f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
const contains = (f, p) => polygonsOf(f).some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole)));

const byState = new Map();
for (const f of districts) byState.set(f.properties.STATEFP, [...(byState.get(f.properties.STATEFP) ?? []), f]);

// A fixed seed, so two runs test the same points.
let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

const points = [];
for (const [state, features] of byState) {
  if (features.length < 2) continue;
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const f of features) for (const poly of polygonsOf(f)) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  for (let found = 0, tries = 0; found < POINTS_PER_STATE && tries < 20000; tries++) {
    const p = [x0 + random() * (x1 - x0), y0 + random() * (y1 - y0)];
    const f = features.find((d) => contains(d, p));
    if (f) { points.push({ state, p, map: f.properties.GEOID }); found++; }
  }
}

let next = 0;
async function worker() {
  while (next < points.length) {
    const q = points[next++];
    for (let attempt = 0; attempt < 3 && q.finder === undefined; attempt++) {
      try {
        const res = await fetch(`${BASE}/api/districts?lat=${q.p[1].toFixed(4)}&lng=${q.p[0].toFixed(4)}`);
        if (!res.ok) continue;
        const geo = (await res.json()).result?.geographies ?? {};
        const key = Object.keys(geo).find((k) => k.toLowerCase().includes("congressional district"));
        q.finder = key ? geo[key][0]?.GEOID ?? null : null;
      } catch { /* retried */ }
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

let flagged = 0, unanswered = 0;
for (const state of [...byState.keys()].sort()) {
  const asked = points.filter((q) => q.state === state);
  const answered = asked.filter((q) => q.finder != null);
  unanswered += asked.length - answered.length;
  const off = answered.filter((q) => q.finder !== q.map);
  if (!off.length) continue;
  const bad = off.length / answered.length > TOLERANCE;
  if (bad) flagged++;
  console.log(`${bad ? "FAIL" : "note"}  state ${state}: ${off.length}/${answered.length} points differ`);
  for (const q of off.slice(0, 4)) console.log(`        ${q.p[1].toFixed(4)}, ${q.p[0].toFixed(4)}  map ${q.map}  finder ${q.finder}`);
}
console.log(`\n${points.length} points, ${unanswered} unanswered, ${flagged} state(s) off the 2026 map`);
process.exit(flagged || unanswered > points.length * 0.05 ? 1 : 0);
