# True Partisan Lean (TPL) Model — Specification

Rebuilt 2026-09-07 (Phases 1–4 of the TPL rebuild). This document matches the
code; when they disagree, the code is right and this file has drifted — fix it.
Design history and rationale: the "TPL Rebuild Spec" artifact and its companion
"TPL Model Review".

> **Current specification: the site's Methodology tab** (`/methodology`, components in
> `components/methodology/`). It reads every constant and fitted value live from the code and
> carries the revision history (`data/methodologyChangelog.ts`). This file is the long-form
> design history and rationale; where the two disagree, the Methodology tab and the code win.

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
- The forward projection does NOT reuse the raw strip (forecast revamp Phase 6,
  2026-09-20). `raceMoneyTerm(race)` — the one lookup the House, Senate and Governor
  pages share with the forecast — pays points on the **residual** gap only:
  `clamp(MONEY_K × (PARTIAL_CYCLE_GAP_SCALE × gap% − structural gap%), ±MONEY_CAP)`,
  where the structural gap is the per-office regression behind WAR's expected margin
  (`getWarMoneyModel`: gap% ~ 1 + incSign + pre-money margin). The same basis
  (`moneyPtsFor`) sits in the full-money expected margins behind the candidate effects.
  Constants and the backtest table live in `FORECAST_CONSTANTS` (data/tplModelData.ts):
  MONEY_K H .04 / S .06 / G .04, MONEY_CAP H 3 / S 4 / G 3, scale 0.9. Forward MAE
  (`forwardBacktest --money`): raw gap S 5.61 / G 9.20 / H 4.81 → residual 5.04 / 8.90 / 4.59;
  raw House money was worse than no money at all (4.76).
- A race with a side's receipts unknown scores 0, which under the residual basis means
  "the typical gap for this situation". Imputing the structural gap under the raw basis
  was tested and rejected (masked receipts: S 5.93 / G 9.50 / H 4.94 vs 5.71 / 9.37 / 4.76 at 0).
- Partial-cycle scaling: 2026 receipts are a mid-September snapshot, past cycles are
  full-cycle. `scripts/fetch-fec-september-snapshot.py` rebuilds the mid-September view of
  2022 and 2024 from OpenFEC report summaries (`data-entry/fundraising_sept_snapshot.csv`,
  cache in `.fec-cache/`): gap_final ≈ 0.90 × gap_sept (R² .94–.96), hence the 0.9.
  `forwardBacktest --sept-money` scores September vs full-cycle receipts.
- Displayed on each 2026 race page: the **Fundraising** section
  (`FundraisingLedgerSection`) shows both candidates' receipts, their share split
  and the resulting points against the typical gap, and the Forecast Calculation card's
  Fundraising row carries the same number (tooltip: filed / typical / beyond-typical gap).
  Races with a side missing render as TBD with the typical-gap note. The generator
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

`P` is the election contemporaneous with that map; a **midterm uses both
neighbours** weighted by distance (2018 = ½·[2016 delta] + ½·[2020 delta], 2022 =
½·[2020] + ½·[2024]). Each term stays a same-election, two-map difference. The
old-lines figures are `data/presByBoundaryVintage.ts` (per map, per presidential
year); the 2026 side is `districtPresidentialData`. Two of those cells had no
published source and were built from precinct returns
(`scripts/build-pres-on-old-lines-from-precincts.py`): 2020 president on NC's
2018 map, and 2024 president on the 2022 maps of AL/GA/LA/NC/NY. Everywhere else a
midterm map equals the map two years later, so the contemporaneous in-repo rows
serve. What transfers is performance **relative to the
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
  House vs the district's lean **in that year, on that year's lines** (slight
  self-influence, noted in the UI); Osborn-class races vs their imputed
  presidential baseline; same-party generals are excluded (no R-vs-D margin to sign).
  House anchor (2026-09-16): `TPL + trend(Y) + shift + β*·E(Y) − IF`, where
  `trend(Y)` = that year's neutral presidential NM minus the aggregation-weighted
  presidential average TPL embodies, and `shift` is the boundary shift. Both are
  needed: District TPL is on 2026 lines (shift) and is a single recency-weighted
  lean dominated by ~2024 politics (trend). Without shift, Doyle's 2016 Pittsburgh
  PA-14 was scored against today's rural PA-14 (WAR +50.8); without trend, Grace
  Meng's 2016 NY-06 race was scored against a district that has since swung 34 pts
  right (+22.0 → +2.9), and Curbelo's Clinton+16 Miami seat read as below
  replacement (−6.9 → +18.7). Non-presidential years interpolate the trend
  between the bracketing presidential years (`presInterpWeights`; 2025 clamps to 2024).
  **State anchors** (Senate/Governor) get the same trend term against the state's fitted
  lean — median 2016→2024 state trend 2.8 pts, 10 states over 5 (FL 10.1, CA 8.0, NY 7.8)
  — with one difference: the fitted lean has no recency decay, so its presidential
  average is EQUAL-year, whereas the district anchor's is recency-weighted to match
  District TPL. Presidential rows are not trend-anchored (their own margin is the
  trend input, so the residual would be circular).
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

## Candidate-effect recency by office (2026-09-16)

`recencyDecayFor(office)`: Senate / Governor / President races decay at
`WAR_RECENCY_DECAY_STATEWIDE` = 0.9 per year, House at `WAR_RECENCY_DECAY` = 0.8
(the decay belongs to the past race being weighted; applies to the WAR tab and
the forward candidate term alike). `forwardBacktest --decay-sweep` is flat within
0.06 MAE across 0.8–1.0 (Senate best 0.85, Governor 0.95), so 0.9 is a judgment
call (user decision) that the data neither reward nor punish. Appointed
incumbents: `APPOINTED_INCUMBENCY_SHARE` stays 0 — no bonus and no penalty.
Final harness this round: S 5.65 / G 9.21 / H 4.82; RACE_SIGMA H 5.3 / S 6.0 / G 9.4.

## Forward forecast — Layer B observable prior (office tier), 2026-09-16

`data-entry/candidate_office_history.csv` → `node data-entry/build-candidate-offices.js` → `data/candidateOffices.ts`: every elected office held by each of the 3,501 candidates in the WAR table and the 2026 nominee lists, from the Wikipedia officeholder infobox of the article linked on their election page (1,528 have one). Tiers: 5 Senate/Governor · 4 U.S. House/statewide · 3 state legislature · 2 local · 1 other public office · 0 none.

`buildObservablePrior()` regresses race residuals (full-money expected) on the R−D difference of observable features — `legislator`, `federalStatewide`, `local`, `priorWin`, `openLegislator` — with the incumbent's features zeroed; the fitted value is the ridge shrinkage target and the whole quality term for a nominee with no record. `forwardBacktest --prior-sweep` / `--tier-diag`: net of the full money gap, prior office carries nothing (legislator coefficient −0.2 to −0.8; House challengers with a state-legislative background run −0.78 vs −0.77 for novices; no feature set moves pooled MAE by more than 0.02). The literature's 2–4 pt quality-challenger effect is expressed through receipts, which this model keeps as its own term. `FORECAST_CONSTANTS.OBSERVABLE_PRIOR_FEATURES` is therefore `[]`; the data stays for display and later use.

## Forward forecast — Phase 5 (race polling), 2026-09-16

**Data.** `data-entry/race_polls.csv` (2026: 752 general-election polls, 137 races, scraped from the polling tables on the Wikipedia election pages; a table is used only when its header names both nominees) → `node data-entry/build-race-polls.js` → `data/racePolls.ts`, keyed `"{H|S|G}:{ST}:{race label}"` with the past-results race labels. History for the fit: `scripts/build-race-polls-history.py` → `data-entry/race_polls_history.csv` (6,698 polls, 677 race-years, 2018–2024) from the FiveThirtyEight archive via the Wayback Machine (general stage, no hypotheticals, top DEM/REP share per question; a Senate special is the class not regularly up that year).

**Average** (`lib/racePollAverage.ts`): the generic-ballot recipe — one survey per pollster (its latest), full weight for 14 days after the field period then halving every 14 days, weight ∝ √sample (cap 3,000) — plus `nEff` = Σ recency weights, the evidence behind the average.

**Blend.** `projectRace()` returns model, polling and `margin = (1 − w) × model + w × pollAvg`, `w = nEff / (nEff + POLL_K[office])`. `forwardBacktest --polls` fits k by leave-one-year-out MAE over the polled races at three horizons; k is flat across horizons, so one value per office:

| office | polled / all | MAE model | MAE poll | k | MAE blend (LOO) | mean w |
|---|---|---|---|---|---|---|
| Senate | 105 / 133 | 5.40 | 6.64 | 3 | 4.65 (4.93) | .40 |
| Governor | 80 / 94 | 9.76 | 5.77 | 0.1 | 6.1 (6.2) | .93 |
| House | 104 / 449 | 4.28 | 5.11 | 1 | 3.57 (3.68) | .29 |

**User decision (2026-09-16):** a single fresh poll may carry at most a third of the projection — at the fitted Governor k a one-poll race (Oregon: model D+13.4, one poll R+2.1) swung 15 pts. `POLL_K` is therefore H 2 · S 3 · G 2 (one poll 33% / 25% / 33%; four polls 67% / 57% / 67%), at a backtest cost of Governor 6.1 → 7.4 and House 3.57 → 3.65 (both still well under model-only).

Dropping partisan polls costs House coverage (104 → 68 polled) and its LOO error (3.68 → 4.16); shifting them 3 or 6 pts toward the sponsor's opponent also hurts (`--no-partisan`, `--partisan-shift`). Polls are used as published, flagged (D)/(R) on the page.

**Poll aging (2026-09-21).** A poll reads the race on its field date, and the national environment has moved since. Before averaging, each poll's margin is shifted by `POLL_AGING_SHARE × β*(state) × (GB now − GB on the poll's end date)` (`pollAgingShift` in `lib/racePollAverage.ts`; GB on a past date = `genericBallotSeries()` in `lib/genericBallotAverage.ts`, the live recipe over the polls completed by that date, read at the series' first five-pollster date for anything older). The average's `aging` field is the weighted mean shift inside `diff`; `dem`/`rep` stay raw. Backtest (`forwardBacktest --polls`, GB history from `scripts/build-generic-ballot-history.py` → `data-entry/generic_ballot_polls_history.csv`, 4,832 polls from the 538 archive): the mean shift is only 0.4–1.2 pts because old polls already carry little weight; the poll average alone improves up to share ≈ 1 for Senate (6.64 → 6.60) and House (5.11 → 5.03), Governor is flat, and the blend moves < 0.05 at any share — so point-for-point (`POLL_AGING_SHARE = 1`) is kept as the principled value. Live: 142 polled races, mean shift 0.8 pts D-ward (GB has moved toward the Democrats since the spring), mean effect on the projected margin 0.12, largest ≈ 0.5 (NY-Gov, IA-Sen).

**Rating basis (user decision 2026-09-21).** The rating is a bucket of the projected MARGIN (`marginToRating`: Tilt < 1, Lean < 5, Likely < 15, Safe), not of the win probability. Probability is shown beside it, never used to set it.

**Pollster ratings and house effects (2026-09-21).** Two questions, tested forward (each cycle scored only with what was known before it):

- *Ratings.* `scripts/build-pollster-graded-polls.py` → `data-entry/pollster_graded_polls.csv` (14,877 general-election polls from the final 60 days, 2008–2024: 538's `raw_polls.csv` through 2022, and the 538 archive graded against this site's results for 2023–24 — president, Senate, governor, House, generic ballot). `scripts/build-pollster-ratings.py` grades the 7,039 polls of the final 21 days: `excess = |error| − benchmark`, the benchmark blending the other pollsters' mean miss in the same race with the expected miss for the race type × year, sample and days out; `score = Σ w·excess / (Σ w + 12)`, `w = 0.84^years / √(polls by that pollster in the race)`; letter grade = band of the score (≥ 5 graded polls); bias (vs the result) and house effect (vs the other pollsters in the race) shrunk by 8; regional scores (National, Northeast, Rust Belt, Sun Belt, South, Plains & Mountain, Pacific) shrink toward the pollster's overall score with k 10. Outputs: `data/pollsterRatings.ts` (page), `data/pollsterLookup.ts` (name → id aliases + grades, small enough for the race pages; this cycle's spellings are hand-mapped in `data-entry/pollster_aliases.csv`), `data-entry/pollster_ratings_vintages.csv` (ratings as of 2018/20/22/24/26 for the backtest). Page: `/analysis/pollsters`.
- *What persists* (`build-pollster-ratings.py --validate`, and `POLLSTER_RATING_META.persistence`): a pollster's accuracy vs the field does **not** carry into the next cycle (correlation 0.00 over 110 pollster-cycles; out-of-sample R² of the score for a poll's excess error is ≤ 0 at every decay and shrinkage), nor does its raw bias (−0.04) — whether a pollster looks good in a year depends on whether its lean pointed the way that year's shared miss went. Its **house effect** does persist (+0.36, slope 0.47). Regional scores predict no better than the overall score (squared error 100–103% of overall-only).
- *In the average* (`forwardBacktest --pollsters`, poll average alone / blend at the live `POLL_K`): weighting polls by `exp(−λ × score)` moves nothing (λ 0.5–2: within ±0.1 everywhere); subtracting the *historical* house effect moves nothing; subtracting the **current-cycle** house effect helps — `lib/pollsterHouseEffects.ts` fits `margin = race level + house effect(pollster, partisan flag)` over every race at least two pollsters have polled in the last `HOUSE_EFFECT_WINDOW_DAYS` (200), alternating means, each effect shrunk by `HOUSE_EFFECT_K` (2) pseudo-polls and capped at `HOUSE_EFFECT_CAP` (5). Mid-Sept / mid-Oct / Nov 1: Senate poll average 6.64 → 6.27 / 6.51 → 6.19 / 6.02 → 5.82 and blend 4.57 → 4.52 / 4.46 → 4.34 / 4.50 → 4.41; House poll average 5.11 → 4.75 / 5.14 → 4.79 / 5.13 → 4.59, blend ±0.05 (the un-adjusted Democratic internals had been offsetting the House model's R-ward bias); Governor ±0.07. Adding president and generic-ballot polls to the overlap set, or a fixed partisan-poll prior, did not help. So `HOUSE_EFFECTS: true`, and pollster grades are displayed (polls table "Grade" column) but are not a weight. `computeRacePollAverage(polls, asOf, shiftFor, houseFor)`; the average carries `house` (the mean lean removed), each poll `house`; pollsters are deduplicated by rating id, so "Siena College" and "Siena University" are one.
- Live effect (2026-09-21): 143 pollster keys estimated; mean |Δ projected margin| 0.18 over the polled races, largest KS R+10.2 → R+9.1 and NH-Gov R+8.5 → R+7.6; two toss-ups cross zero (FL-22 D+0.5 → R+0.1, NV-Gov D+0.2 → EVEN); Senate P(D control) 42% → 44%, House 77% → 75%, expected seats within 0.4. Data fix on the way: the scrape had flagged bipartisan pairs (Beacon/Shaw = Fox News, Fabrizio Ward/Impact = AARP) with one firm's party; `build-race-polls.js` now clears the flag (24 polls).

**Spread.** `raceSigma(office, state, w)² = (β* σ_E)² + ((1 − w) RACE_SIGMA)² + (w POLL_SIGMA)²`, `POLL_SIGMA` = robust sd of actual − poll average over the polled races (H 6.4 · S 5.5 · G 6.8). The independent-error formula reproduces the measured spread of the blend (S 4.3 · G 5.8 · H 4.0) within 0.2. The national shock is kept in full: polls miss nationally too.

**Site.** Calculation card "Polling Avg" row (pollsters, effective polls, fitted weight), hero "Polling Avg." stat, and a per-race polls table (`RacePollsSection`) on the Senate, Governor and House pages. The hand-entered RCP fields no longer enter the forecast. The ledger card groups the five structural rows under a "= Model · N% weight" subtotal, shows the Polling Avg as a separate weighted estimate, and spells out the combination under the Projected Margin. Live: House 223.4 D (P control 80%), Senate 49.9 D (P control 37%, up from 21%), Governor 24.7 D.

## Forward forecast — non-two-party generals (2026-09-16)

Rules for the 2026 races that are not a Democrat against a Republican (user decisions 2026-09-16):

- **Same-party generals** (`contestOf` → `same-party-D` / `same-party-R`): both slots belong to one party after alignment — the CA top-two D-vs-D seats (CA-04/07/11/12/14/29/34/37) and the CA-40 Calvert-vs-Kim incumbent pairing. Decided like an unopposed race: probability pinned, rating Safe, displayed margin floored at ±20, no simulation noise. CA-11's second slot was corrected to Scott Wiener (the audit had duplicated Connie Chan).
- **Aligned independents** (`ALIGNED_INDEPENDENTS`, `alignedParty()` in data/raceEligibility.ts): Kevin Kiley (CA-06) is modeled as the Republican-aligned incumbent — House incumbency applied, his Republican track record used for the candidate term, a win counted as R. King and Sanders remain the Democratic entries.
- **Unaligned independents standing in for a missing party** (Osborn NE-Sen; Achilles ID-Sen, Bengs SD-Sen, Hill AK-01, Milleron MA-01, Eliopoulos NJ-08, Mahoney PA-03): stay `contested`, scored on the structural D-vs-R margin plus their own record (Osborn's 2024 ridge effect, which was measured against the same imputed baseline) and the polls; a win counts toward the slot's party in the seat totals (Osborn → Democratic control, as King/Sanders). The poll scrape fills an empty major-party slot with the independent, so NE-Sen polls (Ricketts–Osborn) now enter.
- **Multi-candidate ballots** (AK top-four RCV, LA jungle, pre-primary top-two polls): when a poll table lists more than one candidate of a party, the scrape sums each party's candidates and normalises to a two-party share — the final RCV round / runoff is the quantity the margin describes. Two-candidate tables stay raw, matching the 538 history the poll weight was fitted on. AK past results are already stored as final-round margins.
- **Alaska Senate polls — RCV final round only** (user decision 2026-09-21): the `S,AK,Senate` rows of `race_polls.csv` hold ONLY a poll's ranked-choice final round between Sullivan and Peltola, entered by hand from the pollster's release; first-choice / first-past-the-post toplines, head-to-head questions and party-summed rows are not ingested, and a poll that publishes no two-candidate final round is left out. Reason: party-summing a first-choice table assumes every minor-Republican vote transfers to Sullivan, which the RCV polls of the same field contradict (Fabrizio/Impact and DFP: Sullivan 43→47, Peltola 50→53, the rest exhausts) — Rasmussen's 39–39 tie (Sept 13–14) had been entered as R+14.2 and moved the average from D+1 to R+7. A re-scrape must not overwrite these rows.
- **Louisiana House**: on the post-*Callais* map (SB 121, signed 2026-05-29) all six seats go to an all-party primary on Nov 3 with a Dec 12 runoff, so no seat has a nominee. Geometry, presidential data and District TPL are on the new lines (verified 2026-09-17/20: LA-06 Trump +32, LA-02 Harris +48; an old-lines House result enters only through the boundary strip). The modelled margin is the party-summed R-vs-D quantity, so an R-vs-R runoff is still the modelled Republican win. LA-05 (Letlow running for Senate) and LA-06 (Fields withdrew) are open with both slots blank → `contested`, scored structurally with no incumbency or candidate term (≈ R+30 each). LA-01/03/04 list the incumbent against one declared Democrat as a display stand-in for a multi-candidate field; LA-02 has no Republican in the field → `uncontested-D`. The one LA-06 field poll (Rigamer, Aug 12–13, 40% undecided) is not ingested — the scrape requires two named nominees, and a 40%-undecided all-party poll is not a two-party margin. The Senate race is an ordinary closed-primary D-vs-R general (Letlow v Davis).

Live after these rules: NE-Sen R+8.0 (Osborn, polls tied at 44% weight), CA-06 D+10.4, CA-40 Safe R; House 223.4 D (P control 80%), Senate 49.8 D (35%), Governors 24.7 D.

## Forward forecast — Phase 7 seat status: open-seat carryover and freshman effect (2026-09-21)

**Question.** Does the party that held an open seat keep an advantage the model misses, and do
first-term incumbents run differently from veterans? And, with the same design, what is House
incumbency actually worth?

**Method.** `npx tsx scripts/forwardBacktest.ts --env struct --seat-status`. Every scored race gets a
seat status: `veteran` / `freshman` / `appointed` incumbent, or `open` with the outgoing holder's
party. Freshman = won the seat as a non-incumbent within one term before the election (from the
results on file; pre-2016 first elections and special-election entrants from a hand list in the
script); House open-seat holder = the party that won the same-numbered district two years earlier
(approximate across the 2022 renumbering); Senate/Governor open-seat holders are a hand table (the
file starts in 2016). Residuals are taken under the full model, with year fixed effects, signed
toward the incumbent's / holder's party, and each coefficient is fitted leave-one-year-out.

| term | Senate | Governor | House | out-of-sample MAE (S / G / H; base 5.05 / 8.91 / 4.58) |
|---|---|---|---|---|
| open-seat carryover | −0.4 ± 1.2 | −4.2 (folds −0.7…−6.4) | −1.1 ± 0.8 | 5.08 / 9.08 / 4.56 |
| freshman effect | −0.9 ± 1.0 | +4.4 (folds +1.9…+8.1) | −1.0 ± 0.7 | 5.09 / 8.99 / 4.58 |
| any elected incumbent | −0.5 | +4.1 | −0.7 | 5.07 / 9.05 / 4.57 |

**Verdict: neither term is adopted.** Where there is a sign it is a retirement *slump* for the
outgoing party, not a carryover, and nothing improves out-of-sample error beyond noise. The Governor
numbers are large but unstable: 2018 drives them, when popular incumbents (Baker, Hogan, Scott) had
no track record on file for the candidate term to read — in 2022, with records on file, freshman
governors sit at +1.2. Removing the candidate-quality term leaves every conclusion unchanged.

**House incumbency is now an estimate.** Sweeping the fixed value through the district-lean strip,
the candidate effects and the forward term together: pooled House MAE 4.87 (0) · 4.59 (2) ·
4.58 (2.5) · 4.58 (3) · 4.60 (3.5) · 4.64 (4) · 4.81 (5), same optimum in 2022 and 2024. The
fixed 3 stays. (The Phase 1 finding that House incumbency "slightly hurts" predates the candidate
and money terms and the flag fix below; the ablation now reads 4.58 with it, 5.01 without.)

**Data fix found on the way.** 90 rows of `data-entry/house_past_results.csv` had a returning
member flagged as no incumbent — members whose district NUMBER changed in redistricting (70 in
2022, Pennsylvania's 12 in 2018) plus same-numbered KY-06, TX-23, UT-04, VA-05, NY-18, PA-04.
All are now flagged; left open by judgment: the 2022 member-vs-member races (FL-02, TX-34) and
Boebert's 2024 move to CO-04. Effect: 155 live House margins move, all by < 1 pt, one rating
change (CA-22 Lean → Likely D), no side flips; tplBacktest PASS, tplCalibrate baseline 4.248 → 4.255.

## Forward forecast — Phase 7 demographic swing (2026-09-21)

**Question.** Do races with similar electorates miss together, and is any of it predictable?

**Evidence.** `forwardBacktest --env struct --dump` residuals (actual − pred, R-positive) joined to the ACS shares: House residuals tilt with nonwhite share (100 − White alone, not Hispanic) by **+1.3 (2022) and +1.6 (2024) pts per 10 pts**, R² .14 / .24, surviving a control for lean and holding in competitive seats (≈ +1.0); college share ≈ 0 (−0.7, 0.0). Statewide races show no college slope in 2020–24 (the large 2018 one is a candidate artifact of a 2016-only fit window: Baker/Hogan/Scott/Sununu in high-college states, Manchin/Tester in low-college ones). A district β = f(college) cannot be tested — the only wave year with House rows on current lines is 2018, with 5.

**Shock, not trend.** Carrying 2022's slope into 2024 would have cut House MAE 4.72 → 4.55 (2024 → 2022: 4.85 → 4.48), but the slope is not stable: the vote-weighted county presidential swing on nonwhite share ran −1.2 (2008→12), −2.6 (12→16), +0.8 (16→20), +1.2 (20→24), college +0.2, −5.5, −2.4, −0.6; and the 2025 Governor results against the 2024 presidential reversed 2024's nonwhite swing (NJ −2.6 after +1.7, VA −1.4 after +0.9). **No demographic term enters the mean projection.**

**What is built.** `simulateChamber` draws one shock per axis per run, `FORECAST_CONSTANTS.DEMOGRAPHIC_SHOCK = { nonwhite: 1.5, college: 1.0 }` (sd of the slope, pts per 10 pts of share), loaded on each race's distance from the average electorate of its kind (the 435 districts for House, the 50 states for Senate/Governor — not the nation, because σ_E is the mean miss across those races and already holds the average effect). The shock is carved **out of** the race's own noise (floor: half of it), so each race's total spread and win probability are unchanged; only co-movement changes. Effect: House 80% seat range 215–233 → 214–234, P(D control) 79% → 77%; Senate and Governor unchanged (the shock is zero-sum across seats).

**Simulation noise fix (same change).** The simulation drew race noise from `RACE_SIGMA[office]` while each race's probability used `raceSigma()`'s model/poll blend, so simulated seat means disagreed with Σp (House 224.1 vs 223.4, Senate 49.8 vs 50.1). Race noise is now the race's own `sigma² − (β*σ_E)²`; means match Σp (223.6 / 50.1 / 24.9). This moved more than the shock did: House P(D control) 82% → 79%, Senate 36% → 42% (polled toss-ups carry less noise than the office default).

**District demographics on the 2026 lines.** The ACS publishes districts on 119th-Congress lines only. `scripts/build-cd-demographics-2026-lines.py` re-aggregates ACS 2020–24 tracts (internal-point assignment) onto the 2026 map for the 10 redrawn states → `data-entry/demographics_cd_2026_lines.csv`; `generate-demographics-data.py` overlays the 143 redrawn districts (`TRACT_ESTIMATED_DISTRICTS`), keeps the published figure for the 38 a redraw left alone, and the district page footnotes the estimate. Check on those 38: shares within 0.1–0.2 pts on average (max 1.3), median income ≈ $400. Redrawn districts can only use the site's simplified drawing file, which is looser (0.2–0.3 avg, max 2.3 on the same check); `pop_dev_pct` flags the worst (CA-48/CA-50 ≈ ±10%).
