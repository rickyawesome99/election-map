import "server-only";
import fs from "node:fs";
import { join } from "node:path";

// Every office a congressional district voted on, by year: data/generated/district-ballot.json,
// written by scripts/buildDistrictBallot.ts (npm run district-ballot; part of prebuild / predev)
// from the precinct results. The rules (which lines, how the legislature is filled) are at the
// top of that script.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

/** [margin (R − D, points of the total vote), total votes] */
export type BallotOffice = [number, number];
export interface DistrictBallotEntry {
  P?: BallotOffice;
  S?: BallotOffice;
  G?: BallotOffice;
  /** The House race as summed from precincts: a check against the certified margin. */
  H?: BallotOffice;
  /** State legislature, both chambers averaged, uncontested and not-up precincts filled. */
  L?: number;
  /** Share of the district's turnout sitting in contested legislative seats. */
  legContested?: number;
  chambers?: number;
  /** The 2016 / 2020 / 2024 presidential vote summed on these lines, by year. */
  pres?: Record<string, BallotOffice>;
}
type Lines = Record<string, Record<string, Record<string, DistrictBallotEntry>>>;
interface DistrictBallotFile { built: string; nowLinesYear: number; legContestedMinShare: number; legMinContested: number; run: Lines; now: Lines }

let cached: DistrictBallotFile | null | undefined;
function file(): DistrictBallotFile | null {
  if (cached === undefined) {
    const path = join(process.cwd(), "data", "generated", "district-ballot.json");
    cached = fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, "utf8")) as DistrictBallotFile) : null;
  }
  return cached;
}

/**
 * What district `number` of `stateAbbr` voted on in `year`.
 *   "run": on the House lines of that year (the turf the year's House race was run on)
 *   "now": on the 2024 House lines, whatever the year
 */
export function districtBallot(lines: "run" | "now", year: number, stateAbbr: string, number: number): DistrictBallotEntry | null {
  return file()?.[lines]?.[String(year)]?.[stateAbbr]?.[String(number)] ?? null;
}

export function districtBallotMeta(): { built: string; nowLinesYear: number; legContestedMinShare: number; legMinContested: number } | null {
  const f = file();
  return f ? { built: f.built, nowLinesYear: f.nowLinesYear, legContestedMinShare: f.legContestedMinShare, legMinContested: f.legMinContested } : null;
}
