// Revision history of every model documented on /methodology.
//
// RULE: any change to how a number is calculated — a constant, a formula, a data rule, a term
// switched on or off — gets an entry here in the same change, newest first. The Methodology
// tabs read their live values straight from the code, so the prose only needs touching when
// the STRUCTURE changes; this file is where the "what changed and why" is kept.
//
//   models   which tabs the entry is listed under
//   kind     change = the model's output moved · tested = evaluated and NOT adopted (kept so
//            the same idea is not re-tested blind) · data = an input fix that moved results
//   effect   measured consequence (backtest error, live seat counts…), when there is one

export type MethodologyModel = "forecast" | "state-tpl" | "district-tpl" | "county-tpl" | "war";

export interface MethodologyChange {
  date: string; // ISO
  models: MethodologyModel[];
  kind: "change" | "tested" | "data";
  title: string;
  detail: string;
  effect?: string;
}

export const METHODOLOGY_CHANGELOG: MethodologyChange[] = [
  {
    date: "2026-09-21", models: ["forecast"], kind: "change",
    title: "Current-cycle pollster house effects removed from every race poll",
    detail: "Each poll is read net of its pollster's lean against the other pollsters in the races they share this cycle (shrunk by 2 pseudo-polls, capped at ±5, 200-day window). Pollster accuracy grades are displayed but are not a weight: past accuracy does not persist into the next cycle, house effects do.",
    effect: "Backtest: Senate poll average 6.64 → 6.27 (mid-Sept), House 5.11 → 4.75; blend gains in the Senate, ±0.07 elsewhere. Live: mean |Δ margin| 0.18 over polled races.",
  },
  {
    date: "2026-09-21", models: ["forecast"], kind: "change",
    title: "Demographic shock added to the chamber simulation; simulation noise aligned to each race's own spread",
    detail: "One zero-mean shock per axis (nonwhite share sd 1.5, college share sd 1.0 pts per 10 pts of share) is shared by demographically similar races, carved out of each race's own noise so no win probability moves. Race noise in the simulation is now the race's own σ² − (β*σ_E)² rather than the office default. No demographic TREND term enters the mean projection — 2025 reversed 2024's nonwhite swing.",
    effect: "House 80% seat range 215–233 → 214–234; Senate P(D control) 36% → 42% from the noise alignment.",
  },
  {
    date: "2026-09-21", models: ["forecast"], kind: "change",
    title: "Poll aging",
    detail: "Each race poll is shifted by POLL_AGING_SHARE (1) × β* × (generic ballot now − generic ballot on the poll's end date) before averaging.",
    effect: "Backtest blend moves < 0.05; poll average alone Senate 6.64 → 6.60, House 5.11 → 5.03. Kept at 1 on principle.",
  },
  {
    date: "2026-09-21", models: ["forecast"], kind: "tested",
    title: "Open-seat carryover and freshman-incumbent terms — not adopted",
    detail: "Leave-one-year-out with year fixed effects: open-seat carryover Senate −0.4 ± 1.2, House −1.1 ± 0.8, Governor −4.2 (unstable); freshman effect Senate −0.9, House −1.0, Governor +4.4 (2018-driven). Neither improves out-of-sample error. The same run swept House incumbency through strip, candidate effects and forward term: optimum 2.5–3, so the fixed 3 stays.",
  },
  {
    date: "2026-09-21", models: ["forecast", "district-tpl", "war"], kind: "data",
    title: "90 House incumbent flags corrected",
    detail: "Returning members whose district NUMBER changed in redistricting (70 in 2022, Pennsylvania's 12 in 2018, plus six same-number cases) had been flagged as open seats in house_past_results.csv.",
    effect: "155 live House margins move by < 1 pt; one rating change (CA-22 Lean → Likely D).",
  },
  {
    date: "2026-09-21", models: ["forecast"], kind: "change",
    title: "Alaska Senate polls: ranked-choice final round only",
    detail: "The S,AK,Senate rows hold only a poll's RCV final round between the two finalists, entered by hand; first-choice toplines and party-summed rows are not ingested. Party-summing assumed every minor-Republican vote transfers, which the RCV polls contradict.",
  },
  {
    date: "2026-09-20", models: ["forecast", "war"], kind: "change",
    title: "Money term moved to the residual gap",
    detail: "Forward money points are paid on the receipts gap BEYOND what a generic pair in the same situation would have: clamp(MONEY_K × (0.9 × gap% − structural gap%), ±MONEY_CAP), k H .04 / S .06 / G .04, cap H 3 / S 4 / G 3. The 0.9 scales a mid-September snapshot to a full-cycle gap. Missing receipts score 0, which now means \"typical gap assumed\". The candidate effects behind the forward Candidates term use the same basis. The backward TPL strip is unchanged (raw gap, k .02, cap 2).",
    effect: "Forward MAE S / G / H: raw gap 5.61 / 9.20 / 4.81 → residual 5.04 / 8.90 / 4.59. \"Impute, never zero\" was tested and rejected (5.93 / 9.50 / 4.94).",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Race polling blended into the projection",
    detail: "margin = (1 − w) × model + w × poll average, w = nEff / (nEff + POLL_K). Fitted k was S 3 / G 0.1 / H 1; set to H 2 / S 3 / G 2 so a single fresh poll carries at most a third of a projection. Race spread becomes (β*σ_E)² + ((1−w)·RACE_SIGMA)² + (w·POLL_SIGMA)². Hand-entered RCP fields no longer enter the forecast.",
    effect: "Backtest (polled races, mid-Sept): Senate 5.40 → 4.65, Governor 9.76 → 7.4 at the chosen k, House 4.28 → 3.65. Senate P(D control) 21% → 37%.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Non-two-party generals",
    detail: "Same-party generals (CA top-two D-v-D, CA-40 R-v-R) and races with one placeholder nominee are decided: probability pinned at 99.5%, rating Safe, margin floored at ±20, no simulation noise. Kevin Kiley is modeled as the R-aligned incumbent. Unaligned independents standing in for a missing party (Osborn and six others) stay contested, scored structurally plus their own record and polls; a win counts for the slot's party.",
  },
  {
    date: "2026-09-16", models: ["forecast", "war"], kind: "change",
    title: "Statewide candidate effects decay more slowly",
    detail: "Senate / Governor / President races fade at 0.9 per year in the candidate-effect solve, House at 0.8. The decay sweep is flat within 0.06 MAE across 0.8–1.0, so 0.9 is a judgment call.",
  },
  {
    date: "2026-09-16", models: ["forecast", "state-tpl"], kind: "change",
    title: "Appointed incumbents receive no incumbency",
    detail: "An incumbent who has never won the seat (R*/D* in the CSVs) gets APPOINTED_INCUMBENCY_SHARE = 0 of the office's advantage, both when TPL strips incumbency and when the forecast adds it. 8 of 9 historical appointees ran behind an open-seat generic even at share 0 (mean −5.6); no penalty is applied either.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "tested",
    title: "Observable prior on candidate quality (prior office, prior win) — built, switched off",
    detail: "Net of the full money gap, prior office carries nothing: legislator coefficient −0.2 to −0.8, no feature set moves pooled MAE by more than 0.02, and the prior-win version raised House error 4.83 → 4.98. The literature's 2–4 pt quality-challenger effect is expressed through receipts, which this model keeps as its own term. OBSERVABLE_PRIOR_FEATURES = []; data and code kept.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Candidate-quality term from ridge track records",
    detail: "Candidates pts = QUALITY_WEIGHT[office] × (effect_R − effect_D), weights H 0.75 / S 1.0 / G 1.5 from a leakage-free sweep. Replaced the manual WQ/LQ quality tiers and the VT/NH governor overrides.",
    effect: "Pooled MAE S 5.96 → 5.69, G 10.95 → 9.38, H 5.18 → 4.83.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Win probability and chamber simulation",
    detail: "P(D) = Φ(−margin / σ), σ² = (β*σ_E)² + RACE_SIGMA², clamped to 0.5–99.5%. Chamber totals from 5,000 seeded simulations sharing one national shock through β*. Replaced the logistic 0.13 curve. Rating remains a band of the MARGIN, not of the probability.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Structural environment term",
    detail: "The generic ballot is converted onto the model's E scale: E = c + s × House vote (fitted from the model's own E), with half the historical mean poll miss applied to the point estimate and the rest of the miss plus September→November drift carried as the shared national error σ_E. Replaced \"margin += generic ballot × β*\".",
    effect: "Pooled MAE vs the raw generic-ballot rule: S 6.30 → 5.96, G 11.29 → 10.95, H 5.87 → 5.18.",
  },
  {
    date: "2026-09-16", models: ["forecast"], kind: "change",
    title: "Forecast fields derived, not entered",
    detail: "lib/forecast.ts became the single source of a race's margin, probability, spread and rating; hand-entered probability / margin / rating fields were removed from the data.",
  },
  {
    date: "2026-09-16", models: ["war", "district-tpl"], kind: "change",
    title: "Year-local anchoring and boundary shift",
    detail: "House races before 2026 are relocated onto today's lines by the presidential delta between the two maps (BS pts) and downweighted by 1 / (1 + (|shift| / 10)²) — replacing the current-era-only filter that discarded 1,700 of 2,154 House rows. WAR expectations add a trend term so an old race is scored against the seat's lean in its own year.",
  },
  {
    date: "2026-09-15", models: ["state-tpl", "district-tpl", "county-tpl"], kind: "data",
    title: "All margins on a full-total-vote basis",
    detail: "District presidential margins and State Legislature aggregates had been two-party shares; both now divide by the full total vote like every other margin in the model. Largest in 2016 (1–2 pts).",
  },
  {
    date: "2026-09-10", models: ["war"], kind: "change",
    title: "WAR scored against the opponent-specific expectation",
    detail: "WAR = actual − (expected − opponent's effect), so a candidate keeps their own effect plus the whole unexplained leftover. The two sides' WARs no longer sum to the residual; two one-race candidates each get ⅔ of it. Replaced the even ε/2 split.",
  },
  {
    date: "2026-09-09", models: ["war"], kind: "change",
    title: "Only structural money in WAR's expected margin",
    detail: "Expected carries clamp(0.02 × structural gap%, ±2), where the structural gap is a per-office regression on incumbency and the pre-money margin. Money raised beyond the situation stays in the residual and is credited to the candidate.",
  },
  {
    date: "2026-09-08", models: ["war"], kind: "change",
    title: "Ridge candidate attribution with recency weighting",
    detail: "A race residual is split into two candidate effects by a ridge fit (λ = 1) pooled across offices by state | party | name, solved as of each race's year with weights decay^|Δyears|.",
  },
  {
    date: "2026-09-08", models: ["state-tpl", "forecast", "war"], kind: "change",
    title: "Senate and Governor incumbency fitted inside the TPL fit",
    detail: "Estimated jointly with lean / β / E from the incumbent-signed residual with the fundraising strip already applied (so it is net of incumbents' money). Replaced hand-set S 2 / G 7. House stays a fixed 3 — a state-level lean cannot separate House incumbency from district lean.",
  },
  {
    date: "2026-09-08", models: ["state-tpl", "district-tpl", "county-tpl"], kind: "change",
    title: "Fundraising strip; type-weighted fit rows; Louisiana jungle rule",
    detail: "FF strip = −clamp(0.02 × gap%, ±2), calibrated on the clean presidential target. Fit rows are weighted RACE_TYPE_WEIGHTS / count(state, year, type) so House rows cannot outvote the presidential row. LA jungle generals decided without a runoff (top-two < 90%) are \"fragmented\" and imputed. District TPL moved onto the state pipeline.",
    effect: "2024 presidential holdout MAE 2.90 → 2.49 — the largest single gain of the rebuild.",
  },
  {
    date: "2026-09-07", models: ["state-tpl", "district-tpl", "county-tpl"], kind: "change",
    title: "TPL rebuild: additive strips, fitted environment and elasticity, eligibility gate",
    detail: "margin = lean + β*·E(year) + incumbency + fundraising + residual, every strip additive and applied once. E(y) and β* from a Huber alternating least-squares fit over 2016–2025 (odd years included). Ineligible races are imputed from the nearest presidential result at half weight. Calibration adopted year decay 0.75 and type weights P .60 / H .20 / S .10 / L .07 / G .03. Deleted: NES table, swing-ratio S, multiplicative wave factor, presidential-approval IF, WQ/LQ quality tiers, the 50-pt competitiveness blend.",
  },
];

export const changesFor = (model: MethodologyModel) => METHODOLOGY_CHANGELOG.filter((c) => c.models.includes(model));
