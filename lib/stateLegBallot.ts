import "server-only";
import fs from "node:fs";
import { join } from "node:path";

// Every office a state legislative seat voted on, by year, on the lines the seat was run on:
// data/generated/state-leg-ballot.json, written by scripts/buildStateLegBallot.ts
// (npm run state-leg-ballot; part of prebuild / predev). The rules are at the top of that script.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

/** [margin (R − D, points of the total vote), total votes] */
export type SeatOffice = [number, number];
/** [filled margin, share of the seat's turnout inside contested districts] */
export type SeatFilled = [number, number];
export interface SeatBallot {
  P?: SeatOffice; S?: SeatOffice; G?: SeatOffice;
  /** U.S. House, uncontested parts filled. */
  H?: SeatFilled;
  /** The other legislative chamber, uncontested and not-up parts filled. */
  O?: SeatFilled;
  /** The seat's own race as summed from precincts: [margin, total, D, R]. A check, never a baseline. */
  L?: [number, number, number, number];
  pres?: Record<string, SeatOffice>;
}
type File = { built: string; seats: Record<string, Record<string, Record<string, Record<string, SeatBallot>>>> };

let cached: File | null | undefined;
function file(): File | null {
  if (cached === undefined) {
    const path = join(process.cwd(), "data", "generated", "state-leg-ballot.json");
    cached = fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, "utf8")) as File) : null;
  }
  return cached;
}

/** Every seat of a chamber in a year, keyed by the precinct file's seat code ("193", "BE1", "A"). */
export function chamberBallots(year: number, abbr: string, chamber: "house" | "senate"): Record<string, SeatBallot> | null {
  return file()?.seats?.[String(year)]?.[abbr]?.[chamber] ?? null;
}
