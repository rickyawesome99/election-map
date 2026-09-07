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

// Years covered by the state/county TPL aggregation (odd years included since the
// Phase 3 rebuild — VA/NJ/KY/LA/MS odd-year governor races are first-class).
const TPL_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Recency decay: weight(y) ∝ YEAR_DECAY^(ANCHOR_YEAR − y), anchored to the cycle
// being forecast. In aggregation the year weight is additionally scaled by the
// base type-weight coverage of races actually present that year, so a sparse
// year (e.g. an odd-year governor race alone) cannot dominate via redistribution.
// 0.75 chosen by the Phase 4 calibration (scripts/tplCalibrate.ts, 2026-09-07):
// monotone improvement from 1.0 down to 0.75 on both holdout rounds; 0.65–0.70
// no better, 0.80+ worse.
const YEAR_DECAY = 0.75;
const ANCHOR_YEAR = 2026;

export const TPL_GLOBAL_CONSTANTS = {
  // District TPL only — the presidential-only district model keeps the pre-rebuild
  // pipeline until Phase 6 of the TPL rebuild. Not used by the state/county model.
  k_pif: 0.005, // District IF scaling: IF = 1 + presMargin × k_pif × partySign
  CQ_MARGIN_CAP: 15, // Max margin the district CQ term scales against
  DISTRICT_YEAR_WEIGHTS: { 2024: 0.70, 2020: 0.20, 2016: 0.10 } as Record<number, number>,
  DISTRICT_YEARS: [2016, 2020, 2024] as number[],
  // Base race type weights before redistribution among present types.
  // Phase 4 calibration (2026-09-07, scripts/tplCalibrate.ts, leakage-free
  // two-round holdout): adopted the knee of the P-weight curve. The objective
  // marginally preferred P .65 (−0.056) and P .70 (−0.076), but those gains come
  // almost entirely from the 2024 presidential target and erode the multi-office
  // identity; floors (P .20 / H .10 / S .05 / L .03 / G .02) are the hard bounds.
  RACE_TYPE_WEIGHTS: { P: 0.60, S: 0.10, H: 0.20, L: 0.07, G: 0.03 } as Record<string, number>,
  YEAR_WEIGHTS: Object.fromEntries(
    TPL_YEARS.map((y) => [y, YEAR_DECAY ** (ANCHOR_YEAR - y)])
  ) as Record<number, number>,
  YEARS: TPL_YEARS as number[],
  // Environment/elasticity fit (see getTplFit in lib/tplCompute.ts).
  // Phase 4 calibration: HUBER_C 4–10, SPARSE_YEAR_K 2–8, BETA_SHRINK 0.3–0.7 and
  // imputed weight 0.25–1.0 all moved the objective ≤ 0.01 — kept at their
  // designed values. Disabling Huber entirely won ~0.02 on presidential targets
  // by sacrificing Senate accuracy and robustness — rejected by design.
  HUBER_C: 7,          // residual scale (pts) beyond which a race is downweighted
  FIT_ITERATIONS: 4,   // alternating least-squares rounds
  SPARSE_YEAR_K: 4,    // E(y) shrink factor n/(n + K) — reins in thin odd years
  BETA_SHRINK: 0.5,    // β* = 1 + BETA_SHRINK × (β̂ − 1)
  BETA_MIN: 0.5,
  BETA_MAX: 1.6,
};

// ── State Wave Sensitivity Coefficients (SUPERSEDED) ────────────────────────
// Superseded by the fitted elasticity β* (getTplFit in lib/tplCompute.ts) as of
// the Phase 3 rebuild; kept for reference alongside docs/SWSC_CALCULATIONS.md.
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
  const contestedYears = new Set(
    stateResults.filter((r) => r.repPct > 0 && r.demPct > 0).map((r) => r.year)
  );

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
      nationalTo == null ||
      !contestedYears.has(fromYear) ||
      !contestedYears.has(toYear)
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
