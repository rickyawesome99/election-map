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

export type MethodologyModel = "forecast" | "state-tpl" | "district-tpl" | "county-tpl" | "war" | "precinct-district";

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
    date: "2026-09-26", models: ["precinct-district"], kind: "change",
    title: "Precinct-district pages: a campaign-money term, calibrated per state",
    detail: "The outlook adds money = clamp(K × (0.9 × gap% − typical gap%), ±CAP), the site's residual money basis re-fitted on the state's own House races (scripts/fitStateLegMoney.ts → data/precinct-districts/money/<ST>.json). gap% is the nominees' gross receipts gap (cash + in-kind, net of refunds; data/precinct-districts/<slug>/finance.json); typical gap% = a + b × incSign + c × presidential margin; 0.9 is the U.S. House partial-cycle scale. Ohio, 76 contested 2024 House races (Transparency USA receipts, 2024 President by district): typical gap = −0.8 + 55.0 × incSign + 0.91 × pres; K = 0.073 ± 0.011 → 0.07; CAP 3 (the congressional House cap); fit error 4.26 → 3.37, leave-one-out MAE 3.36 (no money) → 2.72 at K 0.08. Past State House rows with receipts on file are stripped of the same term (full-cycle, scale 1) before the lean and down-ballot gap, so an incumbent's money edge is not counted twice. σ unchanged. The OH-31 finance file nets a $16,615.50 refunded excess contribution out of Kahoe's listed receipts.",
    effect: "OH-31: money R+3.0 (Kahoe $246,203 vs Spinner $66,516 through 2026-06-30, gap R+57.5%, typical −0.2%, uncapped R+3.6); Roemer's 2024 row stripped 0.56 (down-ballot gap R+1.15 → R+0.87). Margin D+4.8 → D+2.1, P(D) 0.72 → 0.60.",
  },
  {
    date: "2026-09-25", models: ["precinct-district"], kind: "change",
    title: "Precinct-district pages: one 2026 turnout estimate replaces the turnout scenarios",
    detail: "The outlook's three turnout scenarios (latest presidential ballots as cast, and each past midterm's precinct turnout rate on today's registration) showed nearly identical margins, because they could only move the margin through which precincts turn out, and midterm drop-off is spread almost evenly across precincts (OH-31 composition effect: +0.25 pts 2016→2018, +0.08 pts 2020→2022). They are replaced by a single estimate: each precinct's mean midterm turnout rate on today's lines × today's registration, with each basis midterm alone shown as the range. The explorer's Projection mode uses the estimate and loses its scenario pills. The district margin and σ are unchanged.",
    effect: "OH-31: 53,967 ballots (60.0% of registration; range 52,564 at 2022 rates to 55,369 at 2018 rates, vs 69,282 in 2024). The Republican trails by 2,274 net votes (2,194–2,354).",
  },
  {
    date: "2026-09-24", models: ["war"], kind: "change",
    title: "WAR is measured against a non-incumbent replacement",
    detail: "The replacement-level nominee was implicitly a generic nominee of the same incumbency status, so an incumbent was scored against a generic incumbent. A freely available nominee never holds the seat, so the incumbent's row now adds back Incumb. = Expected − the same expectation with no incumbent in the race (the office's incumbency term plus the incumbent share of the structural money term, re-priced on the open-seat margin). Vs. Opponent becomes generic non-incumbent vs this opponent; WAR = Effect + leftover + Incumb. Challengers and open seats are unchanged; appointed incumbents get only the money share. The ridge still solves on the incumbency-stripped residual, so Effect, the forecast's Candidates term and the structural money model are untouched.",
    effect: "1,872 incumbent rows credited: Senate 3.1–3.3, House 3.0–3.8, Governor 4.5–5.0 pts (appointed 0.3–0.5). Mean incumbent WAR Senate +0.2 → +3.3, House −0.3 → +3.4, Governor +3.7 → +8.5; challengers and open seats unchanged. No forecast number moves.",
  },
  {
    date: "2026-09-24", models: ["precinct-district"], kind: "change",
    title: "Precinct-district pages: 2026 outlook and a block-population crosswalk between precinct eras",
    detail: "The OH-31 page became the first instance of a generic precinct-district page (/analysis/districts/[slug]; lib/precinctDistrict/). Its 2026 outlook is a district TPL built from the district's own precinct sums: each statewide race-year, and each House / State House year in which the footprint was a single race, is stripped of incumbency and of β*(state) × E(year) from the shared TPL fit, then aggregated with RACE_TYPE_WEIGHTS, YEAR_WEIGHTS and a two-pass Huber (HUBER_C). The projection adds β* × E(2026), no incumbency for an open seat, and a down-ballot gap (mean State House NM minus same-year top-of-ticket NM, shrunk n/(n+1)); σ² = (β* σ_E)² + (1.5 × RACE_SIGMA.H)². Precinct results from before Summit County's 2024 re-precincting are carried onto today's lines by 2020 census-block population (Bath Twp H, outside the 2024 district, is dropped from that view), so every year sits on one footprint.",
    effect: "OH-31: lean D+2.2, environment D+3.7, gap R+1.1 → D+4.7 ± 8.4, P(D) 0.71. Township totals unchanged from the old page (530-check regression, 0 mismatches); precinct-level 2024-vs-earlier swings change materially because the old page joined re-precincted names.",
  },
  {
    date: "2026-09-23", models: ["forecast"], kind: "change",
    title: "Race polls are kept only from 1 January 2026",
    detail: "A poll counts toward a race's average, and appears in its table, only if it went into the field on or after 2026-01-01; data-entry/race_polls.csv keeps the earlier polls as archive and data-entry/build-race-polls.js no longer emits them (118 of 772 rows). Recency weighting already left an off-year poll effectively weightless, but it could still be a pollster's latest survey — and so the row that firm contributed to the table — or give a race with no 2026 polling a polling average of its own. The generic-ballot and Trump-approval files are already 2026-only, and the historical archive the poll weight is fitted on (race_polls_history.csv) is untouched. The 2026 poll counts on the Pollster Ratings page use the same window.",
    effect: "654 polls across 139 races remain. Illinois Governor, NY-01 and VA-01 had only pre-2026 polls and are now Model-only; 32 other races show fewer pollsters. Nothing else moves: largest margin change 0.0003 (California Governor), no rating changes, chamber simulations identical.",
  },
  {
    date: "2026-09-22", models: ["state-tpl"], kind: "change",
    title: "Imputed House rows keep their full turnout share",
    detail: "With the state's House year taken as a turnout-weighted sum of its districts, an uncontested or same-party district entering at half weight dropped half of that district's voters out of the state's total. Imputed House rows now enter at IMPUTED_HOUSE_ROW_WEIGHT = 1 × their source presidential year's turnout share; their value is the district's own presidential lean, which is a better estimate of that share than a missing race. Imputed statewide rows stay at IMPUTED_RACE_WEIGHT = 0.5.",
    effect: "Calibration objective 4.656 → 4.681 (0.75 would be 4.670); accepted so the districts still sum to the state.",
  },
  {
    date: "2026-09-21", models: ["state-tpl"], kind: "change",
    title: "House rows turnout-weighted, with one Huber check per House year instead of one per district",
    detail: "A state's House rows no longer carry the per-row Huber factor against the state's fitted lean. A packed D+60 district is a district, not an outlier, and the factor handed every packed-map state's House aggregate to the party with more middling seats (Georgia 2024: House aggregate R+10.1 against a presidential NM of R+0.3; 76% of all House rows were downweighted). House rows now enter their year's House mean weighted by total votes cast — the districts sum to the state's House vote — with imputed rows weighted by the turnout of the presidential result they borrow, not their own depressed turnout. The Huber check is applied once to the whole House year: its base type weight is multiplied by min(1, HUBER_C / |House NM − fitted lean|) before redistribution and coverage. Statewide rows, the environment fit, District TPL and County TPL are unchanged. Equal-weighting the districts was 0.08 worse on the standard calibration rounds than turnout weighting; two-party votes and total votes were within 0.01.",
    effect: "2024 holdout: P 2.49 → 2.40, S 4.88 → 4.94, H 2.94 → 3.08 (H is scored against an equal-weighted target). Calibration objective 4.645 → 4.656; on added 2018/2020 Democratic-swing rounds the cost is 0.04. Live: mean |Δ TPL| 0.60, 13 states move ≥ 1 pt, nearly all toward D (LA −2.2, MS −2.1, GA −1.9, AL −1.5, MO −1.5); GA 2024 House NM R+10.1 → R+2.2. 19 of 250 House years are Huber-downweighted.",
  },
  {
    date: "2026-09-21", models: ["state-tpl"], kind: "tested",
    title: "No Huber on House rows at all, and district-anchored Huber",
    detail: "Dropping the House Huber factor outright (equal-weighted plain mean, no year-level check) was tested first, as was anchoring each House row's Huber residual on its own district's presidential lean rather than the state's. Both remove the packed-district skew but give up the shrinkage the year-level check keeps.",
    effect: "Calibration objective 4.645 → 4.751 (no Huber) and 4.784 (district-anchored), worse on all five targets; on the 2018/2020 Democratic-swing rounds no-Huber cost only 0.025, so part of the standard-round loss is the two Republican-swing holdout years flattering an R-leaning House aggregate. Not adopted; the House-year Huber above ties the old objective within 0.011.",
  },
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
