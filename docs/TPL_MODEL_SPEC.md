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
