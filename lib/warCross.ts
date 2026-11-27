import "server-only";
import fs from "node:fs";
import { join } from "node:path";

// A candidate's state legislative strengths, for the people who also have a federal or statewide WAR
// row: data/generated/war-cross.json, written by scripts/buildWarCross.ts (npm run war-cross; part of
// prebuild / predev, after state-leg-ballot). The federal table (lib/tplCompute.ts attributeWarByRecord)
// reads it to start such a candidate's record from a discounted legislative record instead of zero.
// It is a file, not an import, so lib/tplCompute.ts does not pull the state legislative model into
// every route that uses it. Absent file: no legislative record enters any federal row.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

/** One legislative race of a person: its year and their strength in it (incumbency credit left out). */
export type CrossRace = { year: number; q: number };
type File = { built: string; people: Record<string, CrossRace[]> };

let cached: File | null | undefined;
/** Legislative races of the federal candidate with this warCandidateKey, or undefined. */
export function legislativeRacesOf(key: string): CrossRace[] | undefined {
  if (cached === undefined) {
    const path = join(process.cwd(), "data", "generated", "war-cross.json");
    cached = fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, "utf8")) as File) : null;
  }
  return cached?.people[key];
}
