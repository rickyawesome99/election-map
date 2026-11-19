import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import type { EnvironmentModel, TplFitStateBeta } from "@/lib/tplCompute";

// The TPL fit the final 2026 forecast was built on: information through 2025, per-state
// elasticity β*, E centered on the 2016–2025 average. Dumped once on 2026-11-19 from the code as
// committed, immediately before 2026 was added to the model's years, the elasticity was removed
// and the neutral point was pinned to the House vote. The pages that document the 2026 forecast
// read it, so they keep describing the forecast as it ran; the live fit (getTplFit) is a later model.
// Never regenerate: the code that produced it is gone from the working tree.
//
// The path is spelled out (not passed through a helper) so Vercel's file tracing includes the file.

export interface LockedTplFit2026 {
  note: string;
  fit: {
    E: Record<number, number>;
    beta: Record<string, TplFitStateBeta>;
    lean: Record<string, number>;
    incumbency: Record<string, number>;
    incumbencyN: Record<string, number>;
    years: number[];
    rowsUsed: number;
  };
  environmentModel: EnvironmentModel;
  medianStateTpl: number;
  /** State TPL by postal abbreviation and District TPL by district code, as locked. */
  stateTpl: Record<string, number>;
  districtTpl: Record<string, number>;
}

/** The locked model's elasticity constants (removed from TPL_GLOBAL_CONSTANTS on 2026-11-19). */
export const LOCKED_BETA = { SHRINK: 0.5, MIN: 0.5, MAX: 1.6 } as const;

const FILE = join(process.cwd(), "data", "forecast-final-2026", "tpl-fit-locked.json");
let cache: LockedTplFit2026 | null = null;

export function lockedTplFit2026(): LockedTplFit2026 {
  cache ??= JSON.parse(fs.readFileSync(FILE, "utf8")) as LockedTplFit2026;
  return cache;
}
