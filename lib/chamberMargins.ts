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
/** How the unopposed seats enter: "pres" = presidential margin alone (until 2026-11-19), "gap" = plus the contested seats' gap. */
export type UnopposedMode = "pres" | "gap";

function estimatedPool(nu: NotUpPool | null | undefined, mode: NotUpMode, slopeK: number): ChamberPool | null {
  if (mode === "off" || !nu?.gap) return null;
  const { a, b, n, center } = nu.gap;
  const slope = mode === "slope" ? (b * n) / (n + slopeK) : 0;
  return { margin: nu.presMargin + a + slope * (nu.presMarginClamped - center), weight: nu.weight, districts: nu.districts };
}

/** The not-up seats of one chamber as a pool, or null when there are none to estimate. */
export function notUpPool(d: ChamberMarginDetail, mode: NotUpMode, slopeK: number): ChamberPool | null {
  return estimatedPool(d.notUp, mode, slopeK);
}

/**
 * The unopposed seats of one chamber as a pool estimated the same way (presidential margin plus
 * the contested seats' gap), or null when there are none or no gap could be fitted. The gap's
 * shape follows the not-up setting; with not-up estimation off it is the flat mean gap.
 */
export function unopposedPool(d: ChamberMarginDetail, unopposed: UnopposedMode, mode: NotUpMode, slopeK: number): ChamberPool | null {
  if (unopposed !== "gap") return null;
  return estimatedPool(d.unopposed, mode === "off" ? "flat" : mode, slopeK);
}

/**
 * The unopposed seats NOT estimated with a gap: every chamber's when the mode is "pres", else
 * only a chamber's that has no gap to borrow (fewer than five contested seats in either chamber).
 * They stay at the presidential margin and strip the source presidential year's environment.
 */
export function unopposedPresPool(cm: ChamberMarginYear, unopposed: UnopposedMode): ChamberPool & { srcYear: number | null } {
  const rest = cm.chambers.filter((d) => d.imputed.weight > 0 && d.imputed.margin != null && !(unopposed === "gap" && d.unopposed?.gap));
  const weight = rest.reduce((a, d) => a + d.imputed.weight, 0);
  const srcYear = [...rest].sort((a, b) => b.imputed.weight - a.imputed.weight)[0]?.srcYear ?? null;
  return { margin: weight > 0 ? rest.reduce((a, d) => a + d.imputed.margin! * d.imputed.weight, 0) / weight : null, weight, districts: rest.reduce((a, d) => a + d.imputed.districts, 0), srcYear };
}

/**
 * The State TPL's "State Legislature" row: the contested pool plus the estimated seats — every
 * staggered chamber's seats not up, and (2026-11-19) the unopposed seats — so the row measures the
 * whole chamber rather than the seats that happened to draw two candidates. All three carry the
 * year's own environment (an estimate is the contested seats' gap carried onto the seat's
 * presidential margin), which is why they share a row.
 */
export function legislatureRowPool(cm: ChamberMarginYear, mode: NotUpMode, slopeK: number, unopposed: UnopposedMode = "gap"): ChamberPool & { notUp: number; unopposed: number } {
  let { margin, weight, districts } = cm.contested;
  let sum = (margin ?? 0) * weight;
  const counts = { notUp: 0, unopposed: 0 };
  // With no contested seats there is no row to join: the unopposed seats stay presidential.
  for (const d of cm.contested.margin == null ? [] : cm.chambers) {
    for (const [kind, p] of [["notUp", notUpPool(d, mode, slopeK)], ["unopposed", unopposedPool(d, unopposed, mode, slopeK)]] as const) {
      if (!p || p.margin == null) continue;
      sum += p.margin * p.weight; weight += p.weight; districts += p.districts; counts[kind] += p.districts;
    }
  }
  margin = weight > 0 && (cm.contested.margin != null) ? sum / weight : cm.contested.margin;
  return { margin, weight, districts, ...counts };
}
