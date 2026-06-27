// TPL (True Partisan Lean) model — data layer
// Raw election margins are NOT stored here; they are pulled at render time from forecastData.ts.
// This file stores only: model constants, and the per-race adjustment inputs (IF, CQF) that
// are new data added by this feature and do not exist anywhere else in the codebase.

import { houseDelegationHistory } from "./forecastData";
import { popVoteData } from "./popVoteData";
import { statesData } from "./statesData";

export type CQTier = "Elite" | "Strong" | "Generic" | "Weak" | "Sacrificial";

// Winning candidate quality: elite winner suppresses margin, sacrificial inflates it
export const WQ_VALUES: Record<CQTier, number> = {
  Elite: 0.75,
  Strong: 0.88,
  Generic: 1.00,
  Weak: 1.12,
  Sacrificial: 1.25,
};

// Losing candidate quality: inverse — elite opponent inflates the signal, sacrificial suppresses it
export const LQ_VALUES: Record<CQTier, number> = {
  Elite: 1.25,
  Strong: 1.12,
  Generic: 1.00,
  Weak: 0.88,
  Sacrificial: 0.75,
};

export interface RaceModelInputs {
  race: string;        // display label + lookup key (e.g. "President", "Senate", "House IA-01")
  district?: string;   // district name for House races (e.g. "IA-01"), used for data lookup
  raceType: "P" | "S" | "G" | "H" | "L";
  year: number;
  wqTier?: CQTier;   // winning candidate quality tier (default: "Generic")
  lqTier?: CQTier;   // losing candidate quality tier  (default: "Generic")
  FF?: number;         // Fundraising Factor (default: 1.00 → 0 pts)
}

// ── Global TPL model constants (shared across all states) ───────────────────

export const TPL_GLOBAL_CONSTANTS = {
  k_add: 0.35,  // Additive wave scaling: WA_add = NES × SWSC × k_add (placeholder, pending calibration)
  k_mult: 0.05, // Multiplicative wave scaling: WF = 1/(1 + NES × SWSC × k_mult × sign) (placeholder)
  k_pif: 0.005, // Presidential IF scaling: IF = 1 + presMargin × k_pif × partySign for P-type races (placeholder)
  CQ_MARGIN_CAP: 15, // Max margin CQ scales against — limits CQ's absolute effect in structural blowouts
  DISTRICT_YEAR_WEIGHTS: { 2024: 0.70, 2020: 0.20, 2016: 0.10 } as Record<number, number>,
  DISTRICT_YEARS: [2016, 2020, 2024] as number[],
  // NES = National Environment Score (positive = R-favored nationally)
  // Blended President+House popular vote (presidential years) or House alone (midterms)
  NES_BY_YEAR: { 2018: -7.1, 2020: -2.3, 2022: 4.2, 2024: 3.5 } as Record<number, number>,
  // Base race type weights before redistribution among present types
  RACE_TYPE_WEIGHTS: { P: 0.30, S: 0.30, H: 0.30, L: 0.05, G: 0.05 } as Record<string, number>,
  // Year weights (recency-decay). Only even election years are used in the TPL aggregation.
  // Odd-year governor races (NJ, VA: 2017, 2021, 2025) appear in the race table but not in aggregation yet.
  YEAR_WEIGHTS: { 2024: 0.40, 2022: 0.28, 2020: 0.20, 2018: 0.12 } as Record<number, number>,
  YEARS: [2018, 2020, 2022, 2024] as number[],
};

// ── State Wave Sensitivity Coefficients ─────────────────────────────────────
// SWSC is the average of each stable cycle's:
//   state aggregate U.S. House margin swing ÷ national U.S. House margin swing
//
// Margins and swings use a D-positive sign convention. To match the published
// Iowa example, cycle swings are rounded to one decimal and each cycle ratio is
// rounded to two decimals before averaging. A national swing below 1 point is
// excluded because the denominator is too small to produce a reliable ratio.

export const S_MIN_NATIONAL_SWING = 1;
export const S_YEARS = [2016, 2018, 2020, 2022, 2024] as const;

export interface SInterval {
  fromYear: number;
  toYear: number;
  stateSwing: number;
  nationalSwing: number;
  ratio: number | null;
}

export interface StateSCalculation {
  S: number;
  intervals: SInterval[];
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

const NATIONAL_HOUSE_D_MARGIN = Object.fromEntries(
  popVoteData
    .filter((row) => row.type === "House")
    .map((row) => [row.year, row.demPct - row.repPct])
) as Record<number, number>;

export function calculateStateS(stateName: string): StateSCalculation | null {
  const stateResults = houseDelegationHistory[stateName] ?? [];
  const stateDMargins = Object.fromEntries(
    stateResults.map((result) => [result.year, result.demPct - result.repPct])
  ) as Record<number, number>;

  const intervals: SInterval[] = [];

  for (let i = 1; i < S_YEARS.length; i += 1) {
    const fromYear = S_YEARS[i - 1];
    const toYear = S_YEARS[i];
    const stateFrom = stateDMargins[fromYear];
    const stateTo = stateDMargins[toYear];
    const nationalFrom = NATIONAL_HOUSE_D_MARGIN[fromYear];
    const nationalTo = NATIONAL_HOUSE_D_MARGIN[toYear];

    if (
      stateFrom == null ||
      stateTo == null ||
      nationalFrom == null ||
      nationalTo == null
    ) {
      continue;
    }

    const stateSwing = roundTo(stateTo - stateFrom, 1);
    const nationalSwing = roundTo(nationalTo - nationalFrom, 1);
    const ratio =
      Math.abs(nationalSwing) < S_MIN_NATIONAL_SWING
        ? null
        : roundTo(stateSwing / nationalSwing, 2);

    intervals.push({ fromYear, toYear, stateSwing, nationalSwing, ratio });
  }

  const stableRatios = intervals.flatMap((interval) =>
    interval.ratio == null ? [] : [interval.ratio]
  );

  if (stableRatios.length === 0) return null;

  return {
    S: roundTo(
      stableRatios.reduce((sum, ratio) => sum + ratio, 0) / stableRatios.length,
      2
    ),
    intervals,
  };
}

export const STATE_S_CALCULATIONS: Record<string, StateSCalculation> =
  Object.fromEntries(
    statesData.flatMap((state) => {
      const calculation = calculateStateS(state.name);
      return calculation ? [[state.abbr, calculation]] : [];
    })
  );

export const STATE_MODEL_CONSTANTS: Record<string, { S?: number }> =
  Object.fromEntries(
    Object.entries(STATE_S_CALCULATIONS).map(([abbr, calculation]) => [
      abbr,
      { S: calculation.S },
    ])
  );

// ── Iowa per-race adjustment inputs (2018–2024) ─────────────────────────────
// wqTier = winning candidate quality, lqTier = losing candidate quality.
// Omitted tiers default to "Generic" → CQ = 1.00, no CF adjustment.

export const IOWA_RACE_INPUTS: RaceModelInputs[] = [
  // President (Generic/Generic → both default)
  { race: "President", raceType: "P", year: 2020 },
  // Strong(Trump)/Weak(Harris)
  { race: "President", raceType: "P", year: 2024, wqTier: "Strong", lqTier: "Weak" },

  // Senate
  // Generic/Weak (Greenfield)
  { race: "Senate", raceType: "S", year: 2020, lqTier: "Weak" },
  // Generic/Strong (Franken)
  { race: "Senate", raceType: "S", year: 2022, lqTier: "Strong" },

  // Governor (Generic/Generic → both default)
  { race: "Governor", raceType: "G", year: 2018 },
  // Generic/Weak
  { race: "Governor", raceType: "G", year: 2022, lqTier: "Weak" },

  // House IA-01
  // Strong(Finkenauer)/Generic
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2018, wqTier: "Strong" },
  // Strong(Hinson)/Generic
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2020, wqTier: "Strong" },
  // Generic/Strong
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2022, lqTier: "Strong" },
  // Generic/Strong
  { race: "House IA-01", district: "IA-01", raceType: "H", year: 2024, lqTier: "Strong" },

  // House IA-02
  // Generic/Weak
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2018, lqTier: "Weak" },
  // Strong/Strong
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2020, wqTier: "Strong", lqTier: "Strong" },
  // Generic/Strong
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2022, lqTier: "Strong" },
  // Generic/Weak
  { race: "House IA-02", district: "IA-02", raceType: "H", year: 2024, lqTier: "Weak" },

  // House IA-03
  // Strong(Axne)/Generic
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2018, wqTier: "Strong" },
  // Generic/Weak
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2020, lqTier: "Weak" },
  // Strong(Nunn)/Generic
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2022, wqTier: "Strong" },
  // Generic/Strong
  { race: "House IA-03", district: "IA-03", raceType: "H", year: 2024, lqTier: "Strong" },

  // House IA-04
  // Weak(King)/Strong(Scholten)
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2018, wqTier: "Weak", lqTier: "Strong" },
  // Strong(Feenstra)/Generic
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2020, wqTier: "Strong" },
  // Generic/Weak
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2022, lqTier: "Weak" },
  // Generic/Weak
  { race: "House IA-04", district: "IA-04", raceType: "H", year: 2024, lqTier: "Weak" },

  // State Legislature (no candidate-level quality adjustment)
  { race: "State Legislature", raceType: "L", year: 2022 },
  { race: "State Legislature", raceType: "L", year: 2024 },
];

// ── Global presidential race inputs by year ─────────────────────────────────
// WQ/LQ tiers for presidential races that apply uniformly across all 50 states.
// State-specific entries in STATE_RACE_INPUTS override these if present.

export const PRESIDENTIAL_INPUTS_BY_YEAR: Record<number, Pick<RaceModelInputs, "wqTier" | "lqTier" | "FF">> = {
  2024: { wqTier: "Strong", lqTier: "Weak" }, // Trump (Strong) / Harris (Weak)
};

// ── Per-state race inputs lookup ────────────────────────────────────────────
// Maps stateAbbr → array of per-race model inputs with real IF/CQF values.
// States not listed here use all-defaults (IF=1, CQF=1) for every race.

export const STATE_RACE_INPUTS: Record<string, RaceModelInputs[]> = {
  IA: IOWA_RACE_INPUTS,
  GA: [
    { race: "Senate Special", raceType: "S", year: 2020, wqTier: "Generic", lqTier: "Weak" },
  ],
};
