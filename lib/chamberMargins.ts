import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import type { ChamberMarginDetail, ChamberMarginYear, ChamberPool } from "@/lib/stateLegChamberMargin";

// The corrected state legislative chamber margins the State TPL and the chamber summaries read,
// precomputed for every state by scripts/buildChamberMargins.ts (npm run chamber-margins; part of
// the prebuild / predev chain) into data/generated/chamber-margins.json.
//
// Computing them live (lib/stateLegChamberMargin.ts) needs data/stateLegResults.ts and
// data/stateLegPresByEra.ts, 20 MB of source that every route importing the model would then
// carry in its server bundle and parse on each cold start. The file is a few hundred KB and holds
// exactly getChamberMargins(abbr) for each state; the live function stays the source of truth for
// the generator and the audit page.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

export type ChamberMarginsFile = {
  generatedAt: string;
  states: Record<string, Record<number, ChamberMarginYear>>;
};

const FILE = join(process.cwd(), "data", "generated", "chamber-margins.json");

let cache: { mtimeMs: number; data: ChamberMarginsFile } | null = null;

function load(): ChamberMarginsFile {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(FILE).mtimeMs;
  } catch {
    throw new Error(`${FILE} is missing: run \`npm run chamber-margins\` (the prebuild/predev step) first.`);
  }
  if (cache?.mtimeMs !== mtimeMs) cache = { mtimeMs, data: JSON.parse(fs.readFileSync(FILE, "utf8")) as ChamberMarginsFile };
  return cache.data;
}

/** Same shape as lib/stateLegChamberMargin's getChamberMargins: year → corrected chamber margin. */
export function getChamberMargins(abbr: string): Record<number, ChamberMarginYear> {
  return load().states[abbr] ?? {};
}

/**
 * A staggered chamber's seats NOT up in a year, summarized so the State TPL can estimate them:
 *   seat estimate = P + a + b̃·(clamp(P) − center),  b̃ = b·n/(n + k)  (flat: b̃ = 0)
 * where P is the seat's presidential margin on the year's lines and (a, b) the vote-weighted fit
 * of the contested seats' gap (legislative − presidential margin) on their presidential margin.
 * The pool's margin is that estimate averaged over the seats on their scaled presidential votes,
 * so only the averages need storing.
 */
export interface NotUpPool {
  districts: number;
  /** Their presidential votes × the chamber's legislative/presidential turnout ratio. */
  weight: number;
  /** Presidential-vote-weighted mean presidential margin, and the same with each seat clamped. */
  presMargin: number;
  presMarginClamped: number;
  /** a = mean gap, b = its slope on presidential margin, centered on the contested seats' mean. */
  gap: { a: number; b: number; n: number; center: number; min: number; max: number; from: "own" | "other" } | null;
}

export type NotUpMode = "off" | "flat" | "slope";

/** The not-up seats of one chamber as a pool, or null when there are none to estimate. */
export function notUpPool(d: ChamberMarginDetail, mode: NotUpMode, slopeK: number): ChamberPool | null {
  const nu = d.notUp;
  if (mode === "off" || !nu?.gap) return null;
  const { a, b, n, center } = nu.gap;
  const slope = mode === "slope" ? (b * n) / (n + slopeK) : 0;
  return { margin: nu.presMargin + a + slope * (nu.presMarginClamped - center), weight: nu.weight, districts: nu.districts };
}

/**
 * The State TPL's "State Legislature" row: the contested pool plus every staggered chamber's
 * estimated not-up seats, so the row measures the whole chamber rather than the seat class that
 * happened to be on the ballot. Both carry the year's own environment (the estimate is the
 * contested seats' gap carried onto the rest), which is why they share a row.
 */
export function legislatureRowPool(cm: ChamberMarginYear, mode: NotUpMode, slopeK: number): ChamberPool {
  let { margin, weight, districts } = cm.contested;
  let sum = (margin ?? 0) * weight;
  for (const d of cm.chambers) {
    const p = notUpPool(d, mode, slopeK);
    if (!p || p.margin == null) continue;
    sum += p.margin * p.weight; weight += p.weight; districts += p.districts;
  }
  margin = weight > 0 && (cm.contested.margin != null) ? sum / weight : cm.contested.margin;
  return { margin, weight, districts };
}
