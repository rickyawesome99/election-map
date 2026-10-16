import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import type { ChamberMarginYear } from "@/lib/stateLegChamberMargin";

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
