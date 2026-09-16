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

**Margin basis.** Every margin in the model is `repPct − demPct` where each share is
a **percent of the full total vote**, third parties included — never a two-party
share. This is what `presPastResults`, the House/Senate/Governor `pastResults` and the
county datasets have always carried, and what the `fragmented` eligibility test
(`demPct + repPct < 90`) depends on. Two places used to diverge and were corrected
(2026-09-15): `districtPresidentialData`, whose generator divided by `dem + rep`, and
the State Legislature chamber aggregate, which divided by summed `demVotes + repVotes`
instead of summed `totalVotes`. Both now use the full total. The change is largest in
2016, where a ~6% third-party vote compresses margins 1–2 points versus two-party.

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

Points the incumbent's party is worth on the margin, stripped in the incumbent
party's direction (R incumbent → −pts) and added back when forecasting via the
same table (`incumbentAdvantage()` in `lib/tplCompute.ts`). Zero for open
seats, presidential races (national approval effects belong to E), state
legislature aggregates, and imputed rows.

- **Senate and Governor are fitted** inside `getTplFit()` (since 2026-09-08):
  each round, after lean/β/E are updated, inc(office) is the Huber-weighted
  regression of the incumbency-free residual `margin + FF strip − lean − β·E`
  on the incumbent sign (±1) over that office's incumbent-held rows. Because
  the fundraising strip is applied first, the estimate is the advantage **net
  of the money incumbents raise**, so IF and FF cannot double-count. Current
  values: **Senate ≈ 2.6 (139 rows) · Governor ≈ 4.0 (68 rows)**; converged
  by round 4. The hand-set Governor prior of 7 overstated it by ~3 pts
  (surfaced by the FL Gov 2022 WAR check: DeSantis's expected margin was
  R+19.1, leaving him at replacement level).
- **House stays a fixed prior of 3** (`INCUMBENT_ADVANTAGE_FIXED`): against a
  state-level lean, R incumbents sit in R districts and D incumbents in D
  districts, so the incumbent-signed residual measures district lean (~20 pts),
  not incumbency. A district-anchored estimate is future work.
- These are deliberately **not** tuned by the calibration harness objective:
  the Senate/House targets are raw margins that still contain incumbency, so
  that objective structurally rewards under-stripping. `tplCalibrate.ts`
  mirrors the in-fit estimation (`inc: { S: null, G: null }`) inside each
  leakage-free window instead.

## Step 3 — Fundraising (FF pts)

Live for House and Senate (Phase 5). The advantage present in the margin is
`clamp(FF_K × moneyGapPct, ±FF_MAX)` with `moneyGapPct = (R$ − D$)/(R$ + D$) × 100`;
the strip is its negative. **FF_K = 0.02, FF_MAX = 2** — calibrated on the clean
President target (S/H targets contain the fundraising effect and are biased
against any strip); larger k overcorrects because the receipts gap partly
double-counts incumbency; the fitted Senate/Governor incumbency (Step 2) is
estimated with this strip already applied, so the two terms partition cleanly.

- Data: FEC candidate-committee total receipts per cycle, 2016–2026, from the
  bulk `webl`/`weball` files name-matched to each race's general-election
  candidates (`data-entry/fundraising_2016_2026.csv` →
  `scripts/generate-fundraising-data.py` → `data/fundraisingData.ts`).
- Applies only where **both** candidates' receipts are known ($0 = candidate
  never crossed the FEC's $5k filing threshold; null = unknown → FF skipped).
- Excluded for President by design; 0 for imputed rows. Governor rows come from
  state filings (TransparencyUSA / FollowTheMoney / OCPF) since gubernatorial
  money is not filed with the FEC; 15 of the 36 2026 races are still uncollected.
- The forward projection (`computeProjectedMargin`) adds the same
  `computeFundraisingPts` for 2026 races using live receipts, via
  `computeRaceFundraisingPts(raceType, raceId)` — the one lookup the House,
  Senate and Governor pages share with the forecast.
- Displayed on each 2026 race page: the **Fundraising** section
  (`FundraisingLedgerSection`) shows both candidates' receipts, their share split
  and the resulting FF points, and the Forecast Calculation card's Fundraising row
  carries the same number. Races with a side missing render as TBD. The generator
  also emits `fundraisingSources` (current cycle only) for the attribution line.

## Step 3b — Boundary shift (BS pts, District TPL only)

A House margin is a fact about the map that race was run on; District TPL is a
property of the 2026 map. Reconstructing the race on today's lines is impossible
in principle — today's NC-14 is assembled from pieces of three 2022 districts,
each of which held a *different* contest — so the race is relocated by the
presidential delta between the two maps instead:

```
BS  = pres_P(2026 lines) − pres_P(lines used in year Y)   (same election P, two maps)
NM  = Raw + IF + FF + BS + ENV
```

`P` is the election contemporaneous with that map: 2016 and 2018 House races are
scored against 2016, 2020 and 2022 against 2020, 2024 against 2024. The old-lines
figures are `data/presByBoundaryVintage.ts`; the 2026 side is
`districtPresidentialData`. What transfers is performance **relative to the
presidential baseline**, not the margin — Jackson's D+15.4 on D+16.4 turf becomes
R+17.1 on today's R+16.1 NC-14.

Relocated rows are downweighted by how far they moved,
`weight = 1 / (1 + (|shift| / BS_WEIGHT_K)²)` with `BS_WEIGHT_K = 10`, multiplied
into the Huber factor. The uniform shift assumes performance-vs-baseline is
constant across the district's territory, which fails hardest where the shift is
largest (a member's home-county overperformance does not transfer to voters they
never represented). Unmoved races — 266 of 435 in the 2022 era, 301 in 2024 —
keep full weight. **`BS_WEIGHT_K` is a designed value, not calibrated**:
`tplBacktest`/`tplCalibrate` exercise only `calculateStateModel`, so there is no
district-level target to fit it against; doing so needs a district holdout.

This replaced the old `r.year >= eraStart` filter, which discarded 1,700 of 2,154
House rows and left 183 districts presidential-only. `eraStart` is now display-only.

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
  results (2016/2020/2024, current boundaries) + **every** House race 2016–2024,
  with additive IF/FF/**BS** strips, the parent state's
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
  **structural** money advantage. Anchors: S/G/P races vs the state's Huber-fitted lean;
  House vs the district TPL (slight self-influence, noted in the UI); Osborn-
  class races vs their imputed presidential baseline; same-party generals are
  excluded (no R-vs-D margin to sign).
- **Structural money (2026-09-09):** the TPL strips the full fundraising gap
  because it wants the seat's lean, but for a quality metric money is partly
  the candidate. WAR therefore splits the gap. Per office, `gap ≈ a + b·incSign
  + c·base` is fitted in-sample (OLS over races with both receipts known; base =
  R-positive expected margin before money = anchor + β*·E + incumbency), giving
  the gap a generic pair in that situation would have — R² .67 S (n 166) / .50 G
  (n 48) / .81 H (n 453); incumbency alone is worth 16 / 17 / 34 gap points.
  `expected` carries only `clamp(FF_K × structuralGap, ±FF_MAX)`; the
  idiosyncratic remainder (money raised beyond the situation) stays in the
  residual and is credited to the candidate. The prediction needs no receipts,
  so every race gets the structural term (imputed-baseline rows excepted).
  Evidence behind the choice: 53–81% of the gap is structural; the idiosyncratic
  part correlates with pre-money performance (r .58 S / .37 H / .26 G) but the
  strip removes only ~a fifth of it; persistence of a candidate's residuals
  across races is unchanged (slope .366 with the full strip vs .347 without).
  Exposed as `getWarMoneyModel()` and per-row `moneyGapPct / structuralGapPct /
  ffStructuralPts` (Expected-cell tooltip). DeSantis 2022: gap R+72%, structural
  R+38% → 0.76 pts in expected (was 1.44); expected R+15.5, residual +3.9.
- **Candidate attribution** (2026-09-08): a residual is the net of two candidate
  effects, r = a_R − a_D + ε, and a single race cannot split it. `attributeWar()`
  fits ridge candidate effects over all residuals (coordinate descent on
  Σ(r − a_R + a_D)² + λ·Σa_c², `WAR_LAMBDA` = 1, effects keyed
  state|party|normalized name and pooled across offices). The penalty is the
  "unseen candidate = replacement level" prior: one-race candidates keep what is
  left after a known opponent's effect, shrunk by 1/(1+λ); two one-race
  candidates split the residual evenly (±r/3 each, leaving ε = r/3).
  **Opponent-specific expectation (2026-09-10):** WAR is scored against what a
  generic nominee would do *against this opponent*: `expectedVsOpponent` =
  expected − s·a_opp (s = +1 R, −1 D; a_opp signed toward the opponent), and
  per-race WAR = s·(actual − expectedVsOpponent) = a_c + s·ε. The candidate keeps
  their own effect plus the whole unexplained leftover, so the two sides' WARs
  no longer sum to the residual (each absorbs ε, as a batter and pitcher both
  book the same hit); two one-race candidates each get ⅔·r. Superseded: the
  earlier a_c + s·ε/2 split, which made R-WAR − D-WAR = r but meant no
  displayable "expected" column could reconcile Actual and WAR. Evidence for persistent effects:
  leave-one-out correlation of repeat candidates' residuals r = 0.66 (0.38
  excluding |r| > 25), slope 0.68 → λ ≈ 1.
  **Recency (2026-09-08):** effects are estimated *as of each race's year*. For
  target year Y the ridge is weighted, Σ w_j (r_j − a_R + a_D)² + λ·Σa_c² with
  w_j = `WAR_RECENCY_DECAY`^|year_j − Y| (0.8: 2 yrs 0.64 · 4 yrs 0.41 · 6 yrs
  0.26 · 8 yrs 0.17), so the race being scored always carries full weight and a
  candidate's other races fade with distance; one solve per distinct year, warm-
  started. Measured persistence of repeat candidates' residuals (|r| < 25) by
  gap: slope ≈ 0.45 at 1–4 yrs, 0.26 at 5–6, ≈ 0 at 7–9 — the curve 0.8 tracks.
  `effectW` (Σ weights) is the effective race count shown in the Effect tooltip.
  Example (pre-structural-money numbers): DeSantis 2022 residual +3.2; his 2018
  open-seat race (−1.4) enters at 0.41 instead of 1, lifting his 2022 WAR from
  +1.16 to +1.32 (effect +0.68, Crist −1.28, leftover split evenly), while his
  2018 row is scored against a 2018-weighted effect (+0.14). The remaining gap
  to the residual is the ridge's even split with a one-race opponent, not
  recency. With structural money (above) the same row is residual +3.9 / WAR +1.8. Refinements deferred: λ and decay via
  harness leave-one-race-out, pre-2016 track records (Baker/Manchin/Justice are
  n=1 in the window). Surfaced as the model page's WAR sub-tab (`/model/war`):
  Expected / vs Opp / Residual / Effect (n) / WAR columns (vs Opp tooltip shows
  the opponent's effect). Under the opponent-specific rule: Scott 2022 expected
  R−25.3, vs Siegel R−10.1, actual R+47.0 → WAR +57.1 (Siegel −30.3);
  DeSantis 2022 vs Crist R+16.7 → WAR +2.7 (Crist −3.1).
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
| `components/RaceDetailSections.tsx` | Race page sections, incl. Fundraising + Forecast Calculation |
| `components/TplModelPage.tsx` | Ledger UI (β* popup, E strip, Wt column) |
| `components/CountyTplCard.tsx` | County ledger card |

## Forward forecast (2026) — Phase 0 and Phase 1 of the revamp (2026-09-16)

- **Derived forecast fields.** `lib/forecast.ts` (`forecastRace`, `senateForecasts` /
  `governorForecasts` / `houseForecasts`, `seatTotals`) is the single source of a
  2026 race's projected margin, win probability and rating. `data/forecastData.ts`
  no longer carries `probability`, `margin`, `rating` or `history`; the CSV
  `prob_dem` / `proj_*` columns are ignored by `data-entry/build.js`. Rating =
  `marginToRating(margin)`; probability = `marginToProbability(margin)` (interim
  logistic, to be replaced by per-office spreads from the forward backtest).
  Overview seat tiles show the called count and the expected count (Σ P(D)).
- **Forward backtest.** `scripts/forwardBacktest.ts` predicts every eligible
  Senate / Governor race (and House races on stable lines) in 2018 / 2020 / 2022 /
  2024 from a fit on years ≤ Y−1 (`scripts/tplWindowFit.ts`, shared with
  `tplCalibrate.ts`), with no shift removal. Environment modes: `fitted` (oracle),
  `gb` (the site's current rule), `mapped` (E = a + b·GB_mid_sept, leave-one-year-out),
  `final`. Inputs in `data-entry/national_environment_history.csv` (mid-September
  values approximate, flagged). First run: E ≈ +3.6 + 1.05 × GB_sept (R² .91);
  pooled total sd Senate ≈ 8, House ≈ 7.4, Governor ≈ 20 (in-sample); the raw-GB
  rule is R-biased in every year (actual more R than predicted by 0.7–5 pts).

## Forward forecast — Phase 2 (environment) and Phase 3 (uncertainty), 2026-09-16

- **Environment term** (`getEnvironmentModel` / `getNationalEnvironment` /
  `effectiveEnvironment` in `lib/tplCompute.ts`). The generic ballot is converted
  onto E's scale structurally: `E = c + s × PV` fitted from the model's own E(y)
  against the House popular vote (2016–2024: c ≈ +0.6, s ≈ 0.73 — E is centered
  on the period mean and damped across offices). Polling error is uncertainty,
  not a prediction: `PV_hat = GB + ENV_MISS_SHRINK (0.5) × mean(PV − GB_final)`
  (mean miss ≈ R+1.3), and `σ_E = |s| × sqrt(sd(miss)² + (horizon × rms(drift))²)`
  with horizon = days to election / 49. Race term = β* × E_hat. Inputs:
  `data-entry/national_environment_history.csv` → `data/nationalEnvironmentHistory.ts`
  (`node data-entry/build-national-environment.js`); mid-September values are
  approximate and flagged.
- **Uncertainty** (`raceSigma`, `winProbabilityD`; constants in
  `FORECAST_CONSTANTS`). `σ_race² = (β* × σ_E)² + RACE_SIGMA[office]²`, RACE_SIGMA =
  robust within-year spread from the forward backtest (H 5.7 / S 6.6 / G 9.2).
  P(D) = Φ(−margin / σ_race), clamped 0.5–99.5 %; 80 % interval = margin ± 1.28 σ.
  The old logistic (`marginToProbability`) survives only as the harness baseline.
- **Chambers** (`simulateChamber` / `getChamberSimulations` in `lib/forecast.ts`):
  5,000 seeded simulations, one national shock per run (β* × σ_E) plus
  independent race noise; expected seats, 80 % seat interval and control
  probability (House ≥ 218 D, Senate ≥ 51 D since the tie goes to the vice
  president). Shown on the overview seat tiles; race pages show P(D) and the
  80 % range under the Forecast Calculation ledger.
- **Backtest of the rule** (`scripts/forwardBacktest.ts --env struct`, leave-one-
  year-out): pooled MAE S 5.96 / G 10.95 / H 5.18 (raw-GB rule: 6.30 / 11.29 / 5.87
  on the same rows); 80 % coverage under the Phase 3 spreads S 76 % / G 73 % /
  H 78 %, i.e. slightly overconfident. Known gap: House shows an R-ward bias of
  +1.8 (2022) / +3.1 (2024) under the structural rule — House-specific national
  offset and the fixed incumbency prior are the suspects (Phase 7).

## Forward forecast — Phase 4 (candidate quality), 2026-09-16

- **Term.** `candidateQuality(race)` in `lib/tplCompute.ts`: quality pts (R-positive)
  = `QUALITY_WEIGHT[office] × (effect_R − effect_D)`, where each nominee's effect is
  their ridge track record from `computeCandidateEffects()` — solved "as of 2026"
  over every scorable race through 2025 (recency decay 0.8/yr, λ = 1, pooled
  across offices by state|party|exact normalized name), against an expected margin
  that includes the **full** money gap, so money stays a separate forward term
  (decision 2026-09-16). No record = replacement level (0). Nominee names must match
  the historical spelling exactly; surname fallback was rejected (it paired John E.
  Sununu with Chris Sununu's races). Coverage: 52 of 71 Senate/Governor races and
  346 of 435 House races have a non-zero term.
- **Removed.** The manual WQ/LQ quality tiers, and `data/manualOverrides.ts`
  (VT +60 / NH +20 governor overrides — Phil Scott's effect is now +35.6 from his
  own record).
- **Weights** (`FORECAST_CONSTANTS.QUALITY_WEIGHT` H 0.75 / S 1.0 / G 1.5) from the
  leakage-free sweep in `scripts/forwardBacktest.ts --quality` (effects rebuilt as
  of each test year from races ≤ Y−1 on the window fit). Pooled MAE with quality:
  S 5.69 / G 9.38 / H 4.83 (without: 5.96 / 10.95 / 5.18). RACE_SIGMA re-estimated
  to H 5.3 / S 6.1 / G 8.7; 80 % coverage 75–77 % (spreads ~7 % tight).
- **Open.** Appointed incumbents (Husted OH) get the full fitted incumbency;
  Layer B observable priors (prior office, idiosyncratic money) not built; the
  WAR tab still uses structural money for display.

## Forward forecast — appointed incumbents, uncontested races, observable prior (2026-09-16)

- **Appointed / successor incumbents.** `incumbent` = `R*` / `D*` in the past-results
  and seat CSVs marks an incumbent who has never won the seat (Candidate.appointed,
  PastResult.demAppointed/repAppointed). Both directions scale that seat's incumbency
  by `FORECAST_CONSTANTS.APPOINTED_INCUMBENCY_SHARE`, now **0**: in
  `forwardBacktest --appointed` 8 of the 9 historical cases (Smith, Hyde-Smith,
  McSally, Loeffler, Padilla; Ivey, Reynolds, McMaster, Hochul) ran behind an
  open-seat generic nominee even with no incumbency credited (mean −5.6, −4.0
  without Hochul). 2026: Husted OH, Moody FL, Graham SC. Tracking harness PASS.
- **Uncontested races** (`contestOf` in `lib/forecast.ts`): one placeholder nominee
  and one real one → the race is decided: P = 0.995/0.005, rating Safe, displayed
  margin floored at ±20 toward the unopposed party, no simulation noise. Both
  placeholders (LA-05/06 jungle) stay structural. 7 races today, all Democratic.
- **Observable prior (Layer B, mechanism only).** `buildObservablePrior` fits race
  residuals on the R−D difference of "won a general before while not the incumbent
  here" and feeds the fitted value into the ridge as each candidate's shrinkage
  target (`solveCandidateEffects(..., prior)`). Coefficient ≈ +1.3 / +2.1 in the
  2022/2024 windows but on only 24/52 identifying races, and it raised pooled House
  error 4.83→4.98, so `OBSERVABLE_PRIOR` is **false** until outside observables
  (prior-office tier, state-legislative records) exist. Prior-loss flipped sign and
  is not used.
- Harness after this round (env=struct, LOO): pooled MAE S 5.65 / G 9.26 / H 4.83;
  RACE_SIGMA H 5.3 / S 6.1 / G 9.0. Ohio Senate now R+2.4 (Brown 35 %).
