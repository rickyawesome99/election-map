import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

// The Results page's replay source: the snapshots scripts/archive-results.mjs wrote to
// data-entry/results-archive/<date>/<time>.json.gz. Without a query it lists them; with ?file= it
// returns one, gunzipped. The directory is gitignored and never deployed, so in production the
// list is empty and the page shows no Replay control. Read at request time, not build time.
export const dynamic = "force-dynamic";

const DIR = join(process.cwd(), "data-entry", "results-archive");
// A date directory holds the archiver's snapshots; a sim-* directory a simulated night
// (scripts/simulate-results-night.mjs).
const DIR_RE = /^(\d{4}-\d{2}-\d{2}|sim-[a-z0-9-]+)$/;
const FILE_RE = /^(\d{4}-\d{2}-\d{2}|sim-[a-z0-9-]+)\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json\.gz$/;

export type ArchiveSnapshot = { file: string; fetchedAt: string; set: string };

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file");
  if (!existsSync(DIR)) return NextResponse.json({ snapshots: [] as ArchiveSnapshot[] });
  if (!file) {
    const snapshots: ArchiveSnapshot[] = [];
    for (const date of readdirSync(DIR)) {
      if (!DIR_RE.test(date)) continue;
      for (const name of readdirSync(join(DIR, date))) {
        const f = `${date}/${name}`;
        if (!FILE_RE.test(f)) continue;
        // 2026-10-26T00-40-26-097Z → 2026-10-26T00:40:26.097Z
        const t = name.replace(/\.json\.gz$/, "").replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
        snapshots.push({ file: f, fetchedAt: t, set: date });
      }
    }
    snapshots.sort((a, b) => a.set.localeCompare(b.set) || a.fetchedAt.localeCompare(b.fetchedAt));
    return NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!FILE_RE.test(file)) return NextResponse.json({ error: "bad file" }, { status: 400 });
  const path = join(DIR, file);
  if (!existsSync(path)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(gunzipSync(readFileSync(path)), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
