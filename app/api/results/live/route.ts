import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resultsPriors } from "@/lib/resultsPriors";
import { normalizeRace } from "@/lib/resultsFeed";
import { RESULTS_OFFICES, type LiveRace, type RacePrior } from "@/lib/resultsTypes";

// The Results page's live store: the latest civicAPI payload of every race as
// scripts/results-live.mjs keeps it in data-entry/results-live/ (<id>.json + index.json), normalized
// here to LiveRace. ?since=<ms> returns only the races fetched after it. The directory is gitignored
// and never deployed, so in production this answers { available: false } and the page polls
// civicAPI itself.
export const dynamic = "force-dynamic";

const DIR = join(process.cwd(), "data-entry", "results-live");
let priorsById: Map<string, RacePrior> | null = null;
const normalized = new Map<string, { at: number; live: LiveRace }>();

export async function GET(req: Request) {
  const indexPath = join(DIR, "index.json");
  if (!existsSync(indexPath)) return NextResponse.json({ available: false, now: Date.now(), races: [] });
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  priorsById ??= new Map(RESULTS_OFFICES.flatMap((o) => resultsPriors(o).races).filter((p) => p.civicId).map((p) => [String(p.civicId), p]));
  let index: Record<string, number>;
  try { index = JSON.parse(readFileSync(indexPath, "utf8")); } catch { return NextResponse.json({ available: true, now: since, races: [] }); }
  const races: LiveRace[] = [];
  let now = since;
  for (const [id, at] of Object.entries(index)) {
    now = Math.max(now, at);
    if (at <= since) continue;
    const prior = priorsById.get(id);
    if (!prior) continue;
    let hit = normalized.get(id);
    if (!hit || hit.at !== at) {
      try { hit = { at, live: normalizeRace(prior, JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")), at) }; }
      catch { continue; }
      normalized.set(id, hit);
    }
    races.push(hit.live);
  }
  return NextResponse.json({ available: true, now, races }, { headers: { "Cache-Control": "no-store" } });
}
