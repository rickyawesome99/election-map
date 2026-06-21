// TPL (True Partisan Lean) model — data layer
// Raw election margins are NOT stored here; they are pulled at render time from forecastData.ts.
// This file stores only: model constants, and the per-race adjustment inputs (IF, CQF) that
// are new data added by this feature and do not exist anywhere else in the codebase.

export interface RaceModelInputs {
  race: string;        // display label + lookup key (e.g. "President", "Senate", "House IA-01")
  district?: string;   // district name for House races (e.g. "IA-01"), used for data lookup
  raceType: "P" | "S" | "G" | "H" | "L";
  year: number;
  incumbent: string;
  IF: number;
  CQFMatchup: string;
  CQF: number;
}

// ── Global TPL model constants (shared across all states) ───────────────────

export const TPL_GLOBAL_CONSTANTS = {
  k: 0.05,      // Wave scaling constant (placeholder, pending backtesting)
  // NES = National Environment Score (positive = D-favored nationally)
  // Blended President+House popular vote (presidential years) or House alone (midterms)
  NES_BY_YEAR: { 2018: 7.1, 2020: 2.3, 2022: -4.2, 2024: -3.5 } as Record<number, number>,
  // Base race type weights before redistribution among present types
  RACE_TYPE_WEIGHTS: { P: 0.30, S: 0.25, H: 0.20, L: 0.15, G: 0.10 } as Record<string, number>,
  // Year weights (recency-decay). Only even election years are used in the Pre-TPL aggregation.
  // Odd-year governor races (NJ, VA: 2017, 2021, 2025) appear in the race table but not in aggregation yet.
  YEAR_WEIGHTS: { 2024: 0.40, 2022: 0.28, 2020: 0.20, 2018: 0.12 } as Record<number, number>,
  YEARS: [2018, 2020, 2022, 2024] as number[],
};

// ── Per-state model constants ───────────────────────────────────────────────
// Add a state here once its SWSC has been empirically derived.
// Without SWSC, WF defaults to 1.00 for that state.

export const STATE_MODEL_CONSTANTS: Record<string, { SWSC?: number }> = {
  IA: { SWSC: 1.43 },
};

// ── Iowa model constants (kept for backward compatibility) ──────────────────

export const IOWA_MODEL_CONSTANTS = {
  stateAbbr: "IA",
  stateName: "Iowa",
  SWSC: 1.43,
  k: TPL_GLOBAL_CONSTANTS.k,
  NES_BY_YEAR: TPL_GLOBAL_CONSTANTS.NES_BY_YEAR,
  RACE_TYPE_WEIGHTS: TPL_GLOBAL_CONSTANTS.RACE_TYPE_WEIGHTS,
  YEAR_WEIGHTS: TPL_GLOBAL_CONSTANTS.YEAR_WEIGHTS,
  YEARS: TPL_GLOBAL_CONSTANTS.YEARS,
};

// ── Iowa per-race adjustment inputs (2018–2024) ─────────────────────────────
// Raw margins come from forecastData.ts at render time; only IF/CQF are stored here.

export const IOWA_RACE_INPUTS: RaceModelInputs[] = [
  // President
  { race: "President", raceType: "P", year: 2020, incumbent: "Trump (R)", IF: 0.935, CQFMatchup: "Generic/Generic", CQF: 1.00 },
  { race: "President", raceType: "P", year: 2024, incumbent: "Open seat", IF: 1.00, CQFMatchup: "Strong(Trump)/Weak(Harris)", CQF: 0.88 },

  // Senate
  { race: "Senate", raceType: "S", year: 2020, incumbent: "Ernst (R)", IF: 0.875, CQFMatchup: "Generic/Weak", CQF: 0.94 },
  { race: "Senate", raceType: "S", year: 2022, incumbent: "Grassley (R)", IF: 0.875, CQFMatchup: "Generic/Strong", CQF: 1.06 },

  // Governor
  { race: "Governor", raceType: "G", year: 2018, incumbent: "Reynolds (R, succession)", IF: 0.835, CQFMatchup: "Generic/Generic", CQF: 1.00 },
  { race: "Governor", raceType: "G", year: 2022, incumbent: "Reynolds (R)", IF: 0.835, CQFMatchup: "Generic/Weak", CQF: 0.92 },

  // House IA-01
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2018, incumbent: "Blum (R), lost", IF: 1.00, CQFMatchup: "Strong(Finkenauer)/Generic", CQF: 0.94 },
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2020, incumbent: "Finkenauer (D), lost", IF: 1.00, CQFMatchup: "Strong(Hinson)/Generic", CQF: 0.92 },
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2022, incumbent: "Miller-Meeks (R), won", IF: 0.80, CQFMatchup: "Generic/Strong", CQF: 1.06 },
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2024, incumbent: "Miller-Meeks (R), won", IF: 0.80, CQFMatchup: "Generic/Strong", CQF: 1.10 },

  // House IA-02
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2018, incumbent: "Loebsack (D), won", IF: 0.80, CQFMatchup: "Generic/Weak", CQF: 0.94 },
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2020, incumbent: "Open seat (Loebsack retired)", IF: 1.00, CQFMatchup: "Strong/Strong", CQF: 1.00 },
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2022, incumbent: "Hinson (R), won", IF: 0.80, CQFMatchup: "Generic/Strong", CQF: 1.06 },
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2024, incumbent: "Hinson (R), won", IF: 0.80, CQFMatchup: "Generic/Weak", CQF: 0.92 },

  // House IA-03
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2018, incumbent: "Young (R), lost", IF: 1.00, CQFMatchup: "Strong(Axne)/Generic", CQF: 0.92 },
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2020, incumbent: "Axne (D), won", IF: 0.80, CQFMatchup: "Generic/Weak", CQF: 0.92 },
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2022, incumbent: "Axne (D), lost", IF: 1.00, CQFMatchup: "Strong(Nunn)/Generic", CQF: 0.92 },
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2024, incumbent: "Nunn (R), won", IF: 0.80, CQFMatchup: "Generic/Strong", CQF: 1.06 },

  // House IA-04
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2018, incumbent: "King (R), won", IF: 0.80, CQFMatchup: "Weak(King)/Strong(Scholten)", CQF: 1.10 },
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2020, incumbent: "Open seat (King lost primary)", IF: 1.00, CQFMatchup: "Strong(Feenstra)/Generic", CQF: 0.94 },
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2022, incumbent: "Feenstra (R), won", IF: 0.80, CQFMatchup: "Generic/Weak", CQF: 0.94 },
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2024, incumbent: "Feenstra (R), won", IF: 0.80, CQFMatchup: "Generic/Weak", CQF: 0.94 },

  // State Legislature (aggregate — IF/CQF not tracked at this level, both 1.00 by design)
  { race: "State Legislature", raceType: "L", year: 2022, incumbent: "—", IF: 1.00, CQFMatchup: "—", CQF: 1.00 },
  { race: "State Legislature", raceType: "L", year: 2024, incumbent: "—", IF: 1.00, CQFMatchup: "—", CQF: 1.00 },
];

// ── Per-state race inputs lookup ────────────────────────────────────────────
// Maps stateAbbr → array of per-race model inputs with real IF/CQF values.
// States not listed here use all-defaults (IF=1, CQF=1) for every race.

export const STATE_RACE_INPUTS: Record<string, RaceModelInputs[]> = {
  IA: IOWA_RACE_INPUTS,
};
