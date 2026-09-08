# True Partisan Lean (TPL) Model — Specification

Rebuilt 2026-09-07 (Phases 1–4 of the TPL rebuild). This document matches the
code; when they disagree, the code is right and this file has drifted — fix it.
Design history and rationale: the "TPL Rebuild Spec" artifact and its companion
"TPL Model Review".

## Purpose

TPL estimates each state's structural partisan lean: the margin a **generic
Republican vs. generic Democrat** race would produce in a **neutral national
year**. It is an absolute margin (not a lean relative to the nation), built by
stripping three additive distortions from every eligible race and aggregating
across offices and years.

```
margin(state, race, year) = lean(state) + β*(state)·E(year) + incumbency + FF + residual

NM  = Adjusted Margin + IF pts + FF pts − β*·E(year)      (each strip additive, applied once)
TPL = recency- and coverage-weighted aggregate of NMs, 2016–2025, odd years included
Centered TPL = TPL − median of the 50 state TPLs
```

Candidate quality is deliberately **not** a term: outlier candidates are
Huber-downweighted (see Robustness), and their residuals are the raw material
for the future WAR layer.

## Sign convention

R-positive throughout: positive = Republican advantage. `Raw = repPct − demPct`.
State Legislature = aggregate `(repVotes − demVotes) / (repVotes + demVotes) × 100`.

## Step 0 — Eligibility (`data/raceEligibility.ts`)

A margin is usable only if a genuine (or caucus-aligned) nominee of **each**
major party was on the general ballot. Classification uses the data's own
party-override fields (`demParty` / `repParty` mark a slot whose occupant isn't
the slot party):

| Class | Meaning | Examples |
|---|---|---|
| `eligible` | Real R vs. real D | — |
| `no-dem` / `no-rep` | Major party absent (nobody, or a minor-party/independent stand-in) | KY-05 unopposed; Osborn NE-Sen 2024; McMullin UT-Sen 2022 |
| `same-party` | Top-two / runoff same-party general | CA-34 2022 (D–D); LA jungle runoffs |

| `fragmented` | Louisiana jungle general decided without a runoff — the stored top-two margins understate the split party fields (Kennedy 2022: 61.6% vs the top Dem's 17.9% while the Dem vote split three ways). Detected as `demPct + repPct < 90` in a `JUNGLE_STATES` state. | LA Sen 2020/2022, Gov 2023, most LA House |

`ALIGNED_INDEPENDENTS` (Bernie Sanders, Angus King) count as Democratic
nominees; every other independent does not. There is no margin threshold — the
old `|margin| ≥ 50` rule, 60/40 blend, and ×0.8 blanket are gone.

## Step 1 — Adjusted Margin & imputation

- Eligible race → `Adjusted = Raw`, untouched.
- Ineligible race (`⊘` in the ledger) → `Adjusted` is **imputed** from the
  seat's nearest presidential result: district-level for House
  (`houseStatewideResults`, restricted to the boundary vintage
  `[minValidYear, next redistricting)`), statewide otherwise, county-level in
  the county model. Imputed rows skip IF/FF, strip the environment of the
  **source** presidential year, and carry `IMPUTED_RACE_WEIGHT = 0.5` in
  aggregation.

## Step 2 — Incumbency (IF pts, additive)

`INCUMBENT_ADVANTAGE` (in `lib/tplCompute.ts`, shared verbatim with the forward
projection): **House 3 · Senate 2 · Governor 7**. Stripped in the incumbent
party's direction (R incumbent → −pts), added back when forecasting. Zero for
open seats, presidential races (national approval effects belong to E), state
legislature aggregates, and imputed rows.

These constants are deliberately **not** tuned by the calibration harness: the
Senate/House targets are raw margins that still contain incumbency, so that
objective structurally rewards under-stripping. Proper estimation is via
retirement natural experiments (same seat, incumbent leaves vs. stays) — open.

## Step 3 — Fundraising (FF pts)

Live for House and Senate (Phase 5). The advantage present in the margin is
`clamp(FF_K × moneyGapPct, ±FF_MAX)` with `moneyGapPct = (R$ − D$)/(R$ + D$) × 100`;
the strip is its negative. **FF_K = 0.02, FF_MAX = 2** — calibrated on the clean
President target (S/H targets contain the fundraising effect and are biased
against any strip); larger k overcorrects because the receipts gap partly
double-counts incumbency, which is already stripped separately.

- Data: FEC candidate-committee total receipts per cycle, 2016–2026, from the
  bulk `webl`/`weball` files name-matched to each race's general-election
  candidates (`data-entry/fundraising_2016_2026.csv` →
  `scripts/generate-fundraising-data.py` → `data/fundraisingData.ts`).
- Applies only where **both** candidates' receipts are known ($0 = candidate
  never crossed the FEC's $5k filing threshold; null = unknown → FF skipped).
- Excluded for President by design; 0 for imputed rows; Governor pending —
  gubernatorial money is filed with the states, not the FEC.
- The forward projection (`computeProjectedMargin`) adds the same
  `computeFundraisingPts` for 2026 races using live receipts.

## Step 4 — Environment & elasticity (`getTplFit()` in `lib/tplCompute.ts`)

Huber-weighted alternating least squares over the full eligible panel
(~2,600 races, 50 states, 2016–2025 including odd years):

```
adj = margin + IF pts + FF pts  ≈  lean(state) + β(state)·E(year)
row base weight = RACE_TYPE_WEIGHTS[type] / count(state, year, type)
   — a state-year's House rows share the House weight instead of outvoting its
     presidential row, so the fitted lean answers the same question TPL does
w   = base × min(1, HUBER_C / |residual|)                HUBER_C = 7
E(y) additionally shrunk by n/(n + SPARSE_YEAR_K)         SPARSE_YEAR_K = 4
β*  = clamp(1 + BETA_SHRINK·(β̂ − 1), BETA_MIN, BETA_MAX)  = clamp(1 + 0.5(β̂−1), 0.5, 1.6)
```

- **E(y)** is one national number per year, identified from within-state
  changes — which seats happen to be up, uncontested seats, and big-state
  swings cannot skew it. Centered so the period average ≈ 0. Odd years
  (2017/2019/2021/2023/2025) get their own E from the VA/NJ/KY/LA/MS races.
- **β*** is the state's elasticity (fit range ≈ 0.59 MA … 1.51 WV; no negative
  values possible). The forward model uses the same number:
  `effectiveGenericBallot = GENERIC_BALLOT × β*`.
- Fit runs lazily once per process and is cached. Iterations: 4.

Environment strip per race: `ENV pts = −β*(state) × E(year)` (imputed rows use
their source year). This replaces the old NES table, SWSC swing-ratios, the
multiplicative WA/WF term, the presidential-approval IF, and the global
candidate-quality tiers — all deleted.

## Step 5 — Robustness (the Manchin/Scott/Hogan mechanism)

Huber weights act twice:
1. **In the fit** (above), so crossover outliers don't drag lean/β/E.
2. **In aggregation**: each race's weight is
   `aggWeight = (imputed ? 0.5 : 1) × min(1, HUBER_C / |NM − fitted lean|)`,
   shown as the ledger's `Wt` column (e.g. Phil Scott's VT-Gov rows ≈ 0.09–0.18,
   Manchin 2018 ≈ 0.29). County rows skip the Huber part — a county deviating
   from its *state's* lean is not an outlier.

## Step 6 — Aggregation

Per year: type means (aggWeight-weighted) → WRS via base type weights
redistributed among types present. Per state: year weights = recency decay ×
**coverage** (the sum of base type weights present that year), so a sparse
odd-year cannot dominate through redistribution.

```
RACE_TYPE_WEIGHTS: P .60 · H .20 · S .10 · L .07 · G .03    (floors P .20/H .10/S .05/L .03/G .02)
YEAR_WEIGHTS:      ∝ 0.75^(2026 − y), years 2016–2025
TPL      = Σ normalized(yearWeight) × WRS
Centered = TPL − median(50 state TPLs)
```

## Calibration provenance (Phase 4, 2026-09-07)

`scripts/tplCalibrate.ts` — leakage-free coordinate search: refits E/β from
scratch inside each holdout window (fit ≤2022 → predict 2024 P/S/H; fit ≤2020 →
predict 2022 S/H), objective = mean MAE after removing a uniform national shift.

- **Adopted**: decay λ 0.87 → **0.75** (monotone gain on both rounds; 0.65–0.70
  no better); type weights → **P.60/S.10/H.20/L.07/G.03** (knee of the P-weight
  curve — the objective marginally preferred P.65/P.70, driven almost entirely
  by the 2024 presidential target; declined to protect multi-office identity).
- **Kept** (effects ≤ 0.01): HUBER_C 7, imputed weight 0.5, BETA_SHRINK 0.5,
  SPARSE_YEAR_K 4.
- **Rejected by design**: disabling Huber (small P-target gain, Senate loss,
  robustness loss); tuning IF constants against these targets (biased, above).

## Validation (`scripts/tplBacktest.ts`)

`npx tsx scripts/tplBacktest.ts` — tracking holdout vs. baselines with an
acceptance test against reference numbers (re-baselined after each intentional
model change; history in the file header). `--matrix` prints the cross-office
predictiveness matrix; `--fit` prints fitted E and β* extremes. Current
reference (post-Phase-4): 2024-President NM MAE 3.02 (pres-only baseline 1.93),
2024-Senate 4.81 (beats pres-only 4.95), 2024-House 3.04.

## Scope notes

- **District TPL** (Phase 6) shares the state pipeline: district presidential
  results (2016/2020/2024, current boundaries) + the district's House races from
  its current boundary era only (a district redrawn for 2026 is presidential-only
  until new-map results exist), with additive IF/FF strips, the parent state's
  β*, the calibrated decay/coverage aggregation and two-pass Huber weighting.
  Ineligible House races are skipped (the presidential rows already carry the
  district's lean). Same scale as State TPL — House and Senate/Governor
  forecasts read off one consistent lean (review F9 closed).
- **County TPL** shares the state pipeline (parent state's β*, county-level
  imputation, no state-lean Huber weighting).
- **State Legislature** aggregates still contain unopposed-seat skew; per-
  district imputation via the pres-by-leg-district data is future work.
- **Governor fundraising** is the open Phase 5 item (state filings; OpenSecrets/
  Transparency USA cover it only partially and only via rendered pages).
- **WAR** (Phase 6): `computeWarTable()` — each race yields one residual
  r = actual − expected, where expected = lean + β*·E(year) + incumbency +
  fundraising advantages. Anchors: S/G/P races vs the state's Huber-fitted lean;
  House vs the district TPL (slight self-influence, noted in the UI); Osborn-
  class races vs their imputed presidential baseline; same-party generals are
  excluded (no R-vs-D margin to sign).
- **Candidate attribution** (2026-09-08): a residual is the net of two candidate
  effects, r = a_R − a_D + ε, and a single race cannot split it. `attributeWar()`
  fits ridge candidate effects over all residuals (coordinate descent on
  Σ(r − a_R + a_D)² + λ·Σa_c², `WAR_LAMBDA` = 1, effects keyed
  state|party|normalized name and pooled across offices). The penalty is the
  "unseen candidate = replacement level" prior: one-race candidates keep what is
  left after a known opponent's effect, shrunk by 1/(1+λ); two one-race
  candidates split the residual evenly (±r/2). Per-race WAR = a_c + s·ε/2 (s = +1
  R, −1 D), so R-WAR − D-WAR = r exactly. Evidence for persistent effects:
  leave-one-out correlation of repeat candidates' residuals r = 0.66 (0.38
  excluding |r| > 25), slope 0.68 → λ ≈ 1. Result: Scott effect +42 over 5 races
  (per-race WAR 42–50), his opponents −24…+2 instead of −74…−40. Refinements
  deferred: λ via harness leave-one-race-out, recency decay on effects, pre-2016
  track records (Baker/Manchin/Justice are n=1 in the window). Surfaced as the
  model page's WAR sub-tab (`/model/war`): Residual / Effect (n) / WAR columns.
- **Eligibility refinement** (Phase 6): a slot polling < 5% while the opponent
  clears 90% is a write-in-scale candidacy, not a ballot nominee (AZ-08/AZ-09
  2022) — treated as unfilled.
- The rebuild's six phases are complete. Open items: governor fundraising gaps
  (92 races), state-leg per-district imputation, IF retirement-experiment
  estimation, strict refit-per-holdout in the tracking harness.

## Key files

| File | Role |
|---|---|
| `lib/tplCompute.ts` | Fit (`getTplFit`), pipeline, aggregation, forward projection |
| `data/raceEligibility.ts` | Eligibility classification + aligned-independent crosswalk |
| `data/tplModelData.ts` | Constants (calibrated values + provenance comments); superseded SWSC code kept for reference |
| `data/forecastData.ts` | Raw margins, party overrides, incumbent flags |
| `data/fundraisingData.ts` | Generated FEC receipts per race (edit the CSV, not this) |
| `data-entry/fundraising_2016_2026.csv` | Fundraising source of truth + match notes |
| `scripts/generate-fundraising-data.py` | CSV → fundraisingData.ts generator |
| `scripts/tplBacktest.ts` | Tracking harness (holdout / matrix / fit modes) |
| `scripts/tplCalibrate.ts` | Leakage-free calibration search (adopted values in header) |
| `components/TplModelPage.tsx` | Ledger UI (β* popup, E strip, Wt column) |
| `components/CountyTplCard.tsx` | County ledger card |
