import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import type { RaceEligibility } from "@/data/raceEligibility";
import type { ChamberMarginYear } from "@/lib/stateLegChamberMargin";

// The 2026 election as counted so far, for the TPL model: data/generated/tpl-inputs-2026.json,
// written by scripts/buildTplInputs2026.ts (npm run tpl-inputs-2026; part of prebuild / predev).
//
// 2026 is not yet in the *_past_results.csv files the model reads every other year from (the
// counts are not certified), so it enters through this overlay. The model treats its rows exactly
// as it treats a past year's; nothing else on the site reads this file. When 2026 is certified and
// merged into the historical CSVs this module is retired.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

export interface Tpl2026Race {
  office: "S" | "G" | "H";
  abbr: string;
  /** results CSV race id: "AK", "FL-2" (Senate / governor), "0201" (House). */
  id: string;
  label: string;
  special: boolean;
  /** House: key into data/districtPresidentialData.ts ("201"). */
  districtId?: string;
  demPct: number;
  repPct: number;
  demVotes: number;
  repVotes: number;
  totalVotes: number;
  demCandidate?: string;
  repCandidate?: string;
  /** Set only when the slot's candidate is not of the slot's party ("I", or the other major party). */
  demParty?: string;
  repParty?: string;
  incumbent: "D" | "R" | "Open";
  appointed: boolean;
  eligibility: RaceEligibility;
  countedShare: number;
  called: boolean;
}

export interface Tpl2026Inputs {
  generatedAt: string;
  /** When the results CSV was last fetched. */
  asOf: string;
  races: Tpl2026Race[];
  legislature: Record<string, ChamberMarginYear>;
  /** County FIPS → 2026 votes by office as [dem, rep, total] (party sums; total includes every
   * other candidate). S = Senate, SS = Senate special, G = governor, H = the county's U.S. House
   * district pieces summed, counting only districts the state model treats as a D-vs-R race.
   * An office or county the results files have no row for is absent. */
  counties: Record<string, Partial<Record<"S" | "SS" | "G" | "H", [number, number, number]>>>;
  /** Counties with no D-vs-R House piece: H is then the full sum, and this is the class of the
   * largest piece (unopposed, same-party, independent in a party slot). */
  countyHouseIneligible: Record<string, RaceEligibility>;
  /** National U.S. House margin, R-positive, percent of total: every vote, contested seats, every seat contested. */
  housePv: { raw: number; contested: number; imputed: number; offset: number; imputedSeats: number; seats: number };
}

export const TPL_2026 = 2026;

const FILE = join(process.cwd(), "data", "generated", "tpl-inputs-2026.json");

let cache: { mtimeMs: number; data: Tpl2026Inputs } | null = null;

export function tplInputs2026(): Tpl2026Inputs {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(FILE).mtimeMs;
  } catch {
    throw new Error(`${FILE} is missing: run \`npm run tpl-inputs-2026\` (the prebuild/predev step) first.`);
  }
  if (cache?.mtimeMs !== mtimeMs) cache = { mtimeMs, data: JSON.parse(fs.readFileSync(FILE, "utf8")) as Tpl2026Inputs };
  return cache.data;
}
