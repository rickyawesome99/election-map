import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { resultsPriors } from "@/lib/resultsPriors";
import { normalizeRace } from "@/lib/resultsFeed";
import { projectRace, tallyChamber } from "@/lib/resultsNeedle";
import { SEAT_HOLDOVERS } from "@/lib/forecastTypes";
import { RESULTS_OFFICES, type LiveRace, type SeatSeries } from "@/lib/resultsTypes";

// The needle's expected seats at every snapshot of one archive set, for the Results page's seat
// charts while replaying (dev only, like ../route.ts: the archive is never deployed). Each
// snapshot is projected once per server process and cached.

export const dynamic = "force-dynamic";

const DIR = join(process.cwd(), "data-entry", "results-archive");
const SET_RE = /^(\d{4}-\d{2}-\d{2}|sim-[a-z0-9-]+)$/;
const cache = new Map<string, { t: number; tallies: Record<string, { mean: number; lo: number; hi: number }> }>();

export async function GET(req: Request) {
  const set = new URL(req.url).searchParams.get("set") ?? "";
  if (!SET_RE.test(set) || !existsSync(join(DIR, set))) return NextResponse.json({ error: "unknown set" }, { status: 404 });
  const priors = RESULTS_OFFICES.map((o) => resultsPriors(o));
  const files = readdirSync(join(DIR, set)).filter((f) => f.endsWith(".json.gz")).sort();
  const series: SeatSeries = { senate: [], governor: [], house: [] };
  for (const f of files) {
    const key = `${set}/${f}`;
    let entry = cache.get(key);
    if (!entry) {
      const data = JSON.parse(gunzipSync(readFileSync(join(DIR, set, f))).toString()) as { fetchedAt: string; races: Record<string, unknown> };
      const t = Date.parse(data.fetchedAt);
      const tallies: Record<string, { mean: number; lo: number; hi: number }> = {};
      RESULTS_OFFICES.forEach((office, i) => {
        const rows = priors[i].races.map((prior) => {
          const raw = prior.civicId ? data.races[String(prior.civicId)] : null;
          const live: LiveRace | null = raw ? normalizeRace(prior, raw as never, t) : null;
          return { prior, live, proj: projectRace(prior, live) };
        });
        const e = tallyChamber(rows, SEAT_HOLDOVERS[office]).expectedDem;
        tallies[office] = { mean: e.mean, lo: e.lo80, hi: e.hi80 };
      });
      entry = { t, tallies };
      cache.set(key, entry);
    }
    for (const o of RESULTS_OFFICES) series[o].push({ t: entry.t, ...entry.tallies[o] });
  }
  return NextResponse.json(series, { headers: { "Cache-Control": "no-store" } });
}
