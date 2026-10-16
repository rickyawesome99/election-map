// Every candidate page's data → data/generated/candidate-pages/{ST}.json.gz + federal.json.gz (gitignored;
// read by lib/candidatePages.ts). Runs before every `next build` and `next dev` (npm's prebuild /
// predev hooks, after the chamber margins the model needs), or by hand:
//   npx tsx --conditions=react-server scripts/buildCandidatePages.ts
//
// The page used to compute all of this per request, which meant carrying the whole state
// legislative model in its server function and building both candidate indexes (~40,000 people)
// on the first request after each deploy. The numbers are unchanged; only where they are computed.

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { allCandidateSlugs, buildCandidatePayload } from "@/lib/candidatePageBuild";
import type { CandidatePageShard } from "@/lib/candidatePagePayload";

const DIR = path.join(process.cwd(), "data", "generated", "candidate-pages");
const t0 = performance.now();

const shards = new Map<string, CandidatePageShard>();
let pages = 0;
for (const { slug, shard } of allCandidateSlugs()) {
  const payload = buildCandidatePayload(slug);
  if (!payload) continue;
  let s = shards.get(shard);
  if (!s) { s = {}; shards.set(shard, s); }
  s[slug] = payload;
  pages++;
}

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
let bytes = 0;
for (const [name, s] of shards) {
  // Gzipped (~5×): the shards ship inside the route's serverless function, whose size sets its
  // cold-start download; one shard inflates in a few ms on first use.
  const file = path.join(DIR, `${name}.json.gz`);
  fs.writeFileSync(file, gzipSync(JSON.stringify(s), { level: 9 }));
  bytes += fs.statSync(file).size;
}
const biggest = [...shards].map(([n, s]) => [n, JSON.stringify(s).length] as const).sort((a, b) => b[1] - a[1])[0];
console.log(`Candidate pages: ${pages} pages in ${shards.size} shards, ${(bytes / 1048576).toFixed(1)} MB gzipped (largest ${biggest[0]} ${(biggest[1] / 1048576).toFixed(1)} MB raw) in ${((performance.now() - t0) / 1000).toFixed(0)}s → ${path.relative(process.cwd(), DIR)}/`);
