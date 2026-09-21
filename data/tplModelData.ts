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
// Documented on /methodology/state-tpl (and district-tpl for BS_WEIGHT_K), which reads these values
// live. A NEW key must be added to DOCUMENTED_IN in components/methodology/TplMethodology.tsx (the
// type-check fails otherwise), and any change gets an entry in data/methodologyChangelog.ts.

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
  // (The pre-rebuild district constants — k_pif, CQ_MARGIN_CAP, DISTRICT_YEAR_WEIGHTS —
  // were retired in Phase 6: districts now share the state pipeline and constants.)
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
  // Boundary-shift confidence (District TPL only — see boundaryStripFor in tplCompute).
  // A pre-2026 House race is relocated onto current lines by the presidential delta
  // between the two maps, then weighted 1 / (1 + (|shift| / K)²). At K = 10 a race moved
  // 5 pts (the median for the 2016–2020 eras) enters at 0.80, one moved 10 pts at 0.50,
  // and NC-14's 32-pt rebuild at 0.09; an unmoved race is unaffected at 1.0.
  // NOT CALIBRATED: tplBacktest/tplCalibrate only exercise calculateStateModel, which has
  // no district-level target, so there is nothing for K to be fitted against yet. This is
  // a designed value — fitting it needs a district holdout (predict each district's actual
  // House margin in year Y from its TPL built without that race).
  BS_WEIGHT_K: 10,
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

// ── Forward forecast constants (Phases 2–3 of the 2026 forecast revamp) ──────
// ENV_MISS_SHRINK: share of the historical mean generic-ballot miss (House vote −
//   final generic ballot, R-positive) applied to the point estimate. The rest of the
//   miss, and its variance, live in the shared national error σ_E — polling error is
//   uncertainty, not a prediction (decision 2026-09-16).
// ENV_DAYS_MID_SEPT_TO_ELECTION: the September→November drift variance observed in
//   the history table is for this horizon; it scales linearly with days remaining.
// RACE_SIGMA: per-office race-level error (pts) beyond the shared national shock —
//   robust within-year spread from scripts/forwardBacktest.ts (see its "recommended
//   constants" block; re-run after any model change).
// Documented on /methodology, which reads these values live. A NEW key must be added to
// DOCUMENTED_IN in components/methodology/ForecastMethodology.tsx (the type-check fails otherwise);
// any change gets an entry in data/methodologyChangelog.ts, and `npx tsx scripts/forwardBacktest.ts
// --env struct --emit` regenerates the page's Calibration tables.
export const FORECAST_CONSTANTS = {
  ENV_MISS_SHRINK: 0.5,
  ENV_DAYS_MID_SEPT_TO_ELECTION: 49,
  RACE_SIGMA: { H: 5.3, S: 6.0, G: 9.4 } as Record<"H" | "S" | "G", number>, // forwardBacktest 2026-09-16 (env=struct + quality, robust within-year)
  // 2026-09-20, after the residual money basis: the robust within-year spread fell to
  // H 5.0 / S 4.9 / G 9.0, but those values under-cover (80% interval: S 74% · H 77%) and the
  // harness scores with full-cycle receipts, a mild optimism. The values above cover
  // S 83% · G 81% · H 79%, so they stay.
  // Multiplier on the nominees' ridge track-record effects (effect_R − effect_D) in the
  // forward model, per office. forwardBacktest --quality (2026-09-16, leakage-free
  // sweep): House error bottoms near 0.75, Senate at 1.0, Governor keeps improving past
  // 1.5 (persistent personal brands — Scott, Sununu, Hogan); 1.5 kept off the sweep edge.
  QUALITY_WEIGHT: { H: 0.75, S: 1.0, G: 1.5 } as Record<"H" | "S" | "G", number>,
  // Share of the office's incumbency advantage an appointed/successor incumbent (has
  // never won the seat; "R*"/"D*" in the CSVs) receives — both when the backward model
  // strips incumbency and when the forward model adds it. forwardBacktest --appointed
  // (2026-09-16): of the 9 historical cases (Smith, Hyde-Smith, McSally, Loeffler,
  // Padilla; Ivey, Reynolds, McMaster, Hochul) 8 ran BEHIND an open-seat generic
  // nominee even at share 0 (mean −5.6, −4.0 without Hochul), so no advantage is
  // credited; a negative value would be an extrapolation from n=9.
  APPOINTED_INCUMBENCY_SHARE: 0,
  // Layer B observable prior on candidate effects: the ridge shrinkage target (and the
  // forward term for a nominee with no track record) is an OLS of race residuals on
  // these features — see buildObservablePrior in lib/tplCompute.ts. Empty = off.
  // Candidates: legislator · federalStatewide · local · priorWin.
  OBSERVABLE_PRIOR_FEATURES: [] as string[],
  // ── Money (Phase 6 of the forecast revamp, 2026-09-20) ──────────────────────────────
  // The forward money term — and the expected margins behind the candidate effects — read
  // the RESIDUAL gap: receipts gap% minus the gap a generic pair in this situation would
  // have (getWarMoneyModel: gap% ~ 1 + incSign + pre-money margin, per office).
  //   pts = clamp(MONEY_K × (PARTIAL_CYCLE_GAP_SCALE × gap% − structural gap%), ±MONEY_CAP)
  // The structural part is a function of lean and incumbency, which the model already
  // carries; only the part beyond it is information. forwardBacktest --money (env=struct,
  // pooled 2018–24, Senate / Governor / House MAE):
  //   raw gap, k .02 cap 2 (old rule)            5.61 / 9.20 / 4.81
  //   no money at all                            5.71 / 9.37 / 4.76   (raw House money HURT)
  //   structural gap imputed for every race      5.93 / 9.50 / 4.94   ("impute, never zero" fails)
  //   residual gap, k .02 cap 2                  5.41 / 9.08 / 4.65   (better in every year × office)
  //   residual gap, the constants below          5.04 / 8.91 / 4.59
  // A race with a side's receipts unknown therefore scores 0 — which now MEANS "the typical
  // gap for this situation", not "no money": the 15 Governor races without state filings
  // need no separate imputation. The backward TPL strip is unchanged (FF_K / FF_MAX, raw gap).
  // k / cap: Senate keeps improving to the sweep edge (k .08 cap 6 → 4.94) and the September
  // snapshot agrees (below); kept one step inside. House is flat across k .04–.06 (4.57–4.59).
  // Governor has no September snapshot to confirm on, so it takes the conservative pair.
  MONEY_BASIS: "residual" as "raw" | "residual",
  MONEY_K: { H: 0.04, S: 0.06, G: 0.04 } as Record<"H" | "S" | "G", number>,
  MONEY_CAP: { H: 3, S: 4, G: 3 } as Record<"H" | "S" | "G", number>,
  // Partial-cycle scaling. The live cycle's receipts are a mid-September snapshot; every
  // past cycle on file is full-cycle. scripts/fetch-fec-september-snapshot.py rebuilt the
  // snapshot for 2022 and 2024 from FEC report summaries (1,744 nominees; the full-cycle sum
  // of the same reports matches weball within 2% for 1,645 of 1,675): the trailing side
  // closes part of the gap late, gap_final = 0.91 × gap_sept (Senate, n 63, R² .96) and
  // 0.90 × (House, n 380, R² .94). forwardBacktest --sept-money, residual basis, 2022+24:
  // House 4.49 (September × 1) vs 4.45 (× 0.9) vs 4.39 (full-cycle receipts) vs 4.59 (none);
  // Senate 4.27 vs 4.25 vs 4.28 vs 4.98. Governor receipts (state filings) have no
  // per-report history on file; the House/Senate value is borrowed.
  PARTIAL_CYCLE_GAP_SCALE: { H: 0.9, S: 0.9, G: 0.9 } as Record<"H" | "S" | "G", number>,
  // Race polling (Phase 5): the poll average's share of the final margin is
  //   w = nEff / (nEff + POLL_K[office]),  nEff = effective poll count (lib/racePollAverage.ts)
  // scripts/forwardBacktest.ts --polls (2026-09-16, 677 polled race-years 2018–24, k by
  // leave-one-year-out MAE, mid-September horizon) puts the optimum at Senate 3 (5.40 → 4.65),
  // Governor ≤ 0.1 (9.76 → 6.1 — polls carry the race) and House 1 (4.28 → 3.57); k is flat
  // across horizons. User decision 2026-09-16: a single fresh poll may carry at most a third
  // of the projection (a one-poll Governor race was swinging 15 pts), so Governor and House
  // use k = 2 (one poll 33%, four polls 67%) at a backtest cost of Gov 6.1 → 7.4 and House
  // 3.57 → 3.65; Senate keeps its fitted 3 (one poll 25%). Partisan polls kept: dropping
  // or shifting them costs House coverage and error.
  POLL_K: { H: 2, S: 3, G: 2 } as Record<"H" | "S" | "G", number>,
  // Robust spread of actual − poll average over the polled races (same run); the blend's
  // spread is (1 − w)² × RACE_SIGMA² + w² × POLL_SIGMA² on top of the national shock, which
  // reproduces the measured blend rsd (S 4.3 · G 5.8 · H 4.0) to within 0.2.
  POLL_SIGMA: { H: 6.4, S: 5.5, G: 6.8 } as Record<"H" | "S" | "G", number>,
  // Poll aging: each race poll is moved by POLL_AGING_SHARE × β*(state) × (generic ballot
  // now − generic ballot on the poll's end date) before it is averaged. 1 = a race moves
  // point-for-point (through β*) with the national ballot; 0 = polls are never aged.
  // scripts/forwardBacktest.ts --polls (2026-09-21, generic ballot as of each poll date from
  // the 538 archive): the mean shift is small (0.4–1.2 pts) because old polls carry little
  // weight; the poll average alone improves up to share ≈ 1 for Senate (6.64 → 6.60) and
  // House (5.11 → 5.03) and is flat for Governor; the blend moves by < 0.05 at any share.
  // So the data do not reject point-for-point and 1 is kept as the principled value.
  POLL_AGING_SHARE: 1,
  // House effects (lib/pollsterHouseEffects.ts): each race poll is read net of its pollster's
  // current-cycle lean relative to the other pollsters in the races they share, shrunk with
  // HOUSE_EFFECT_K pseudo-polls toward 0 (toward ±HOUSE_EFFECT_PARTISAN_PRIOR for a party or
  // campaign poll), from polls of the last HOUSE_EFFECT_WINDOW_DAYS days.
  // scripts/forwardBacktest.ts --pollsters (2026-09-21, 677 polled race-years 2018–24, house
  // effects from each cycle's own polls up to the as-of date): the poll average alone improves
  // at every horizon — Senate 6.64 → 6.27 (mid-Sept) / 6.02 → 5.82 (Nov 1), House 5.11 → 4.75 /
  // 5.13 → 4.59, Governor 5.37 → 5.19 (Nov 1) — and the blend gains in the Senate (4.57 → 4.52,
  // 4.46 → 4.34, 4.50 → 4.41) and is within ±0.07 for Governor and House (the House model's own
  // R-ward bias was being offset by un-adjusted Democratic internals). k 1–5 and windows of
  // 120–300 days are within 0.03 of each other. Rejected by the same run: weighting polls by
  // the pollster's historical accuracy rating (no gain at any strength — past accuracy does not
  // persist, see /analysis/pollsters), the historical house effect carried over from earlier
  // cycles (no gain; the within-cycle lean supersedes it), and a fixed partisan-poll prior
  // (helps the House poll average, hurts its blend). HOUSE_EFFECT_CAP bounds any one lean:
  // two pollsters 30 pts apart in a single race (a three-way question against a head-to-head,
  // ID-Sen 2026) is not a house effect; capping at 5 is neutral in the backtest (±0.02).
  HOUSE_EFFECTS: true,
  HOUSE_EFFECT_K: 2,
  HOUSE_EFFECT_WINDOW_DAYS: 200,
  HOUSE_EFFECT_PARTISAN_PRIOR: 0,
  HOUSE_EFFECT_CAP: 5,
  // Demographic swing (Phase 7): a zero-mean shock shared by demographically similar races in
  // the chamber simulation — sd of the per-cycle slope, in pts of margin per 10 pts of the
  // share (nonwhite = 100 − White alone, not Hispanic; college = adults 25+ with a BA).
  // Evidence (2026-09-21, forwardBacktest --dump residuals joined to the ACS shares): House
  // forward residuals tilt with nonwhite share by +1.3 (2022) and +1.6 (2024) per 10 pts, net
  // of lean and in competitive seats too; college ≈ 0 (−0.7, 0.0). It is a SHOCK, not a trend:
  // the county presidential swing slope on nonwhite share ran −1.2, −2.6, +0.8, +1.2 over
  // 2008→2024, and the 2025 NJ/VA Governor results reversed 2024's (−2.6, −1.4). So the mean
  // projection carries no demographic term (carrying 2022's slope into 2024 would have cut
  // House MAE 4.72 → 4.55, but 2025 contradicts the extrapolation). nonwhite 1.5 = rms of the
  // two House residual slopes; college 1.0 sits between the 0.5 those residuals show and the
  // 3.0 rms of county presidential swings (2012→16 alone was −5.5). Each race's TOTAL spread is
  // unchanged — the shock is carved out of its race-level noise — so win probabilities do not
  // move; only how seats move together does (House 80% seat range 215–233 → 214–234, P(D control)
  // 79% → 77%; Senate unchanged). Loadings are centered on the 435 districts / 50 states, not the
  // nation: σ_E is the mean miss across those races, so it already holds the average effect.
  DEMOGRAPHIC_SHOCK: { nonwhite: 1.5, college: 1.0 },
};
