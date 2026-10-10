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

export type MethodologyModel = "forecast" | "state-tpl" | "district-tpl" | "county-tpl" | "war" | "precinct-district" | "turnout";

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
    date: "2026-10-09", models: ["forecast"], kind: "change",
    title: "A ceiling on the poll average's share of a projection",
    detail: "The poll share of a race's projected margin, w = nEff / (nEff + POLL_K), approached 1 as polls piled up: the most heavily polled Senate and Governor races (Michigan, Texas, Maine, Ohio, Iowa) ran 79–86% on their polls. It is now w = min(POLL_W_MAX, nEff / (nEff + POLL_K)) with POLL_W_MAX = 0.75, so the structural model keeps at least a quarter of every projection however many polls a race has (lib/racePollAverage.ts pollWeight, which the forward backtest now calls instead of recomputing the weight). User decision: the polls of 2016, 2018, 2020 and 2024 missed in the same direction across the whole field, which the pollster house effects — measured relative to the field — cannot catch, so no race should run on polls alone. POLL_K is unchanged, so lightly polled races are untouched; the cap binds in 10 races today.",
    effect: "Nine races move, seven toward Republicans: Texas Governor R+2.6 → R+3.4, Ohio Governor D+2.1 → D+1.7, Texas Senate D+2.6 → D+2.3, Iowa Governor D+7.3 → D+6.9, Iowa Senate D+0.3 → EVEN; Maine Senate D+2.9 → D+3.1 the other way (its model is bluer than its polls). No rating changes. Chambers: Governors 26.22 → 26.15 expected Democratic; House 229.7 and Senate 51.2 (P(Democratic control) 95% / 68%) unchanged to the decimal. Forward backtest, blend MAE at the live constants: Senate 4.69 → 4.67 (mid-September), 4.54 → 4.52 (mid-October), 4.60 → 4.59 (November 1); Governor 5.86 → 5.89 (mid-October), 5.40 → 5.44 (November 1); House unchanged. Mean w falls 0.01–0.02 at each horizon.",
  },
  {
    date: "2026-10-09", models: ["forecast"], kind: "data",
    title: "Race polls refreshed through October 8",
    detail: "Weekly `npm run refresh` of every 2026 race's Wikipedia polling tables, append-only as before. Two new aliases map Wikipedia's spellings to rated pollsters (UMass Lowell/YouGov → UMass Lowell Center for Public Opinion; The Washington Post/SSPG → Washington Post/GMU Schar School). The scraper reads Wikipedia's June Alaska Survey Research governor poll as D 47.8 / R 52.2 party-summed where the file has 42.2 / 57.8; the row on file was left as is. No method change.",
    effect: "90 new polls (44 Governor, 12 House, 34 Senate) in 46 races; 967 polls in 159 races, newest ending 2026-10-08. Senate: expected Democratic seats 51.1 → 51.2, P(Democratic control) 66% → 68%. House 229.1 → 229.7 (94% → 95%). Governors 26.2 unchanged. 6 rating changes: NC-01 Tilt R → Lean D, KY-06 Lean R → Tilt R, Nevada Governor Lean D → Tilt D, New Mexico Governor Safe D → Likely D, Vermont Governor Safe R → Likely R, FL-16 Lean R → Likely R.",
  },
  {
    date: "2026-10-05", models: ["forecast"], kind: "change",
    title: "Forecast over time: the model rerun once per day since January",
    detail: "Every build reruns the whole forecast for each day from January 12 (the first day the generic-ballot average has five pollsters) to today: forecastAsOf(day) sets the forecast clock to that day, so only polls whose field period had ended count, poll aging and pollster house effects are measured from that day, and the national environment's horizon is that day's distance to the election. The Overview charts the House and Senate control odds and expected Democratic governorships from it. It is today's model on each day's polls, not a record of what the site published: a later model change, map correction or candidate fix applies to every day, nominees are the eventual ones even before their primaries, fundraising is the latest filing, and a poll counts from its field end date even if it was published later. Fixed along the way: the generic-ballot average took each pollster's latest poll whatever the as-of date; it now ignores polls that end after it (no effect on today's number).",
    effect: "Today's point equals the live forecast. House P(Democratic control) runs from 41% on January 12 to 94% today, the Senate from 9% to 68%; the largest one-day move is the Senate's +6 pts on September 9. Polls entered later (the October 4 generic-ballot update) land on the days they were fielded, not the day they were added. 267 days in about 20 s of build time (scripts/buildForecastHistory.ts, four worker processes).",
  },
  {
    date: "2026-10-04", models: ["war"], kind: "change",
    title: "WAR: heavy-tailed penalty, so a star's opponents stop absorbing the star's margin",
    detail: "The ridge's squared penalty made one +43 candidate and five −15 opponents cheaper than one +75 candidate, so every Democrat who faced Phil Scott took part of his popularity as their own negative effect, and — since each side also books the whole unexplained leftover — a WAR of −30 or worse. The WAR solve now uses a pseudo-Huber penalty, λ·2τ²(√(1 + (a/τ)²) − 1): the same ridge near zero, linear beyond τ, strictly convex. WAR_TAIL τ = 10; WAR_TAIL_INCUMBENT τ = 5 for a candidate who ran as the incumbent at least once in the window, because the tail is theirs (races with |residual| > 30: 9 favor the incumbent, 1 against, 2 open) — which also decides a one-race pair such as Baker and Gonzalez, while a pair with no incumbent (Justice and Cole) still splits evenly. The definition of WAR, Expected and Incumb. are unchanged. The forecast's candidate effects stay on the plain ridge: the heavy tail has not been through the forward backtest. Not fixed: a candidate gets one pooled effect per solve, so where their strength moved inside the window (Scott 2016 → 2024) the early opponents read too high.",
    effect: "145 of 4,442 down-ballot rows move by more than 1 pt (77 statewide, 68 House), 23 by more than 5; rows below −20 fall from 9 to 4. Charlestin −36.0 → −17.6, Siegel −30.6 → −13.0, Zuckerman −29.8 → −12.6, Gonzalez −42.8 → −10.7, Jealous −27.0 → −17.5; Scott 2024 +65.8 → +73.4, Baker +47.8 → +63.4, Beshear 2023 +27.6 → +33.0. The other direction: Minter 2016 +3.3 → +21.1, Hallquist −6.0 → +11.2. 10-fold held-out error on repeat candidates' races 3.91 → 3.87 (statewide 6.35 → 6.01, House 3.60 → 3.59). No forecast number moves.",
  },
  {
    date: "2026-10-04", models: ["forecast"], kind: "data",
    title: "Generic ballot and Trump approval polls updated through October 2",
    detail: "New RealClearPolitics exports replace data-entry/generic_ballot_polls.csv (219 polls, January 2 – October 2) and data-entry/trump_approval_polls.csv (319 polls); both rebuilt with their data-entry scripts. The generic ballot feeds the national environment, so every race's structural margin and the race-poll aging shift move with it; nothing in the method changed.",
    effect: "Generic ballot D+6.4 → D+8.4 (D 48.1 → 50.7, R 41.7 → 42.3); approval net −18.1 → −21.4. Every race moves Democratic, mean 1.35 pts, max 2.1. House: expected Democratic seats 224.5 → 229.4, P(Democratic control) 81% → 94%. Senate 50.5 → 51.3, 52% → 68%. Governors 25.5 → 26.3. 46 rating changes, including Iowa Senate Tilt R → Tilt D, Nevada Governor Tilt R → Lean D, FL-14, FL-22 Tilt R → Lean D, and IA-02, MI-07, MI-10, NC-01 Tilt R → Tilt D.",
  },
  {
    date: "2026-10-04", models: ["forecast"], kind: "data",
    title: "Race polls refreshed through October 3, and the refresh is now one command",
    detail: "The Senate, Governor and House poll file had last been scraped in mid-September. `npm run refresh` now re-scrapes every 2026 race's Wikipedia polling tables (scripts/fetch-race-polls.py, the same table rules as before: both nominees named in the header, first row per poll, full-field matchup preferred, top-four fields party-summed), appends only polls not already on file so hand-entered rows survive, skips Alaska Senate (RCV final rounds, hand-entered) and same-party generals, rebuilds data/racePolls.ts and the pollster-rating counts, and prints what moved. The scraper reproduces 634 of the 649 2026 polls already on file; the other 15 come from tables Wikipedia has since removed and stay in the file. Eight new aliases map Wikipedia's spellings to rated pollsters (New York Times/Siena University → NYT/Siena, DCCC, UMass/YouGov, Braun/Vermont Public). The overview now shows how current the race polls are.",
    effect: "223 new polls (80 Governor, 51 House, 92 Senate); 877 polls in 154 races, newest ending 2026-10-03; 15 races polled for the first time. Senate: expected Democratic seats 50.1 → 50.5, P(Democratic control) 41% → 52%. House 223.7 → 224.5 (80% → 81%). Governors 24.9 → 25.5. 21 rating changes, including Ohio Governor Lean R → Tilt D, ME-02 and PA-07 Lean R → Tilt D, Kansas Senate Likely R → Lean R, Iowa Senate Lean R → Tilt R.",
  },
  {
    date: "2026-10-04", models: ["forecast", "district-tpl", "turnout"], kind: "data",
    title: "Missouri back on its 2022 congressional map",
    detail: "The Missouri Supreme Court struck down the 2025 mid-decade map on Sept. 3, 2026, and the state votes on its 2022 lines in November. Every 2026 layer now carries those lines for Missouri: the boundary files (from the Census 119th-Congress districts), the district PVI (recomputed by the column's 30/70 formula on 2022-line presidential results), the presidential results District TPL reads (2020 from The Downballot, 2024 from the official district cuts, 2016 from an overlay of Dave's Redistricting VTD data that reproduces the published 2020 and 2024 figures within 0.07 and 0.04 points), the demographics (the published ACS figures, which already describe these lines, replace the tract estimate), the turnout model's county shares and the House pages' county pieces. Missouri no longer counts as redrawn, so its eight seats also re-enter the forward backtest's stable-lines House set.",
    effect: "MO-05 R+9.7 Likely R → D+28.7 Safe D; MO-04 R+20.2 → R+39.8, MO-06 R+24.0 → R+35.4, MO-03 R+18.0 → R+24.5, MO-02 R+10.8 → R+7.7. House: expected Democratic seats 222.6 → 223.7, P(Democratic control) 75.2% → 80.0%. Backtest House MAE (all years) 4.58 → 4.51 on 465 races instead of 449; 2026 turnout estimate 110.40M → 110.36M House votes.",
  },
  {
    date: "2026-09-29", models: ["turnout", "forecast"], kind: "change",
    title: "Projected results by county on every race page, and the implied generic ballot",
    detail: "Senate and governor pages' county map and a new default tab on the House page's district map show the 2026 projected result by county: the race's forecast margin, unchanged, spread over its counties by county TPL — a House district's piece of a split county adds the piece's 2024 deviation from its county, from the district-by-county results, where the lines are unchanged and every piece was contested — plus one shift solved so the turnout-weighted mean equals the forecast (lib/countyProjection.ts; House on the 2026 county pieces, cut from the site's 2026 boundary file by scripts/build-house-county-pieces.py 2026). Decided races paint 100% for the side that has them. Adding every race back up gives the implied generic ballot on /analysis/turnout, with the House figure decomposed into the forecast's shrunk expectation, decided seats, turnout weighting and third parties. No forecast margin changes.",
    effect: "Implied 2026 ballot: House D+4.6 (contested races only D+2.4; equal-weighted D+4.4), Senate D+1.0 over 35 races, governor D+6.5 over 36, all three D+4.3; polling generic ballot D+6.4, the forecast's expected House vote D+5.7.",
  },
  {
    date: "2026-09-28", models: ["turnout"], kind: "change",
    title: "Turnout page and the 2026 turnout estimate",
    detail: "New /analysis/turnout: votes cast in every general election since 2016 (President, Senate, governor, House) by state, House district and county as a share of citizen voting-age population (ACS B05003, one five-year release per election year; scripts/fetch-cvap.py), with the U.S. Elections Project's VEP and total ballots as a statewide cross-check. Runoff and ranked-choice races count at their first round (data-entry/turnout_first_round.csv, 15 races; by-district figures scaled from the runoff round); unopposed House seats are shown as recorded and flagged. The 2026 estimate is a level × distribution model (lib/turnoutModel.ts): a state's top-of-the-ticket votes = CVAP(2024) × a 60/40 blend of its 2022 and 2018 top-race turnout rates, × 0.92 when its ticket gains or loses a statewide race, × exp(−0.0028 × the change in the top race's |margin|, the site's forecast margin for 2026); counties split it by 2024 presidential share × midterm propensity (shrunk with 20,000 pseudo-votes); House districts take their county pieces (2024 pieces, or tract CVAP in the ten redrawn states) × the district's contested-seat drop-off from the top race, so unopposed seats are imputed as contested.",
    effect: "Backtest, 2022 from 2018 alone: state top-race MAE 8.1% (bias +6.2%, the 2018→2022 swing; 9.0% / +7.4% without the competitiveness term), county share of the state 4.4% vote-weighted with the level known, contested House districts 11.5%. 2026: 110.4M House votes (106.3–116.4M), 45.9% of CVAP, against 113.7M in 2018 and 107.7M in 2022.",
  },
  {
    date: "2026-09-28", models: ["county-tpl"], kind: "change",
    title: "County TPL: unopposed House years are imputed instead of entering at ±100",
    detail: "County House rows were hard-coded eligible, so an unopposed race (stored as a 100/0 placeholder, or counted with one party at zero votes) entered County TPL as a ±100 margin — while State and District TPL impute the same seat from its presidential lean. A county House year is now ineligible when one party drew no votes in the county (same-party when the county carries a top-two same-party note), and is imputed from the county's nearest presidential result like any other ineligible row. A county split between a contested and an unopposed district stays eligible: the county aggregate has no per-district breakdown. The Raw ≥50 rule is not involved — it was removed in the rebuild; lopsided presidential margins enter County TPL as is.",
    effect: "689 of 3,142 counties move (mean |Δ| 3.5 pts, median 2.5; 308 by more than 3). Largest: Noxubee MS D+28.6 → D+48.9; Madison AL R+25.1 → R+9.2; Jefferson Davis MS D+0.1 → D+15.7; Louisiana parishes under unopposed 2022/2024 House races move 12–15 pts toward their presidential lean.",
  },
  {
    date: "2026-09-28", models: ["precinct-district"], kind: "change",
    title: "Precinct-district pages: average Republican share and a Priority ranking in Targeting",
    detail: "Two targeting metrics, after rtpwin.us's precinct analysis. Average R: the mean, over every year on file, of the year's mean two-party Republican share across its races (on today's lines, ≈ for crosswalked years). Priority: net votes available = split-ticket votes + max(0, turnout votes), turnout votes = midterm drop-off ballots × average margin; units ranked by it, colored by five categories cut on average R (Base ≥58, Turnout 52–58, Contested 48–52, Persuasion 42–48, Opponent base <42). rtpwin's average of per-column ranks was not used: its columns (average R%, high R%, average R vote) largely measure the same thing, so it counts Republican strength several times. Priority is the explorer's default Targeting metric. Nothing in the 2026 outlook changes.",
    effect: "OH-31, 85 precincts: Base 18, Turnout 14, Contested 16, Persuasion 24, Opponent base 13; 6,147 net votes available (Base 2,256). Top priority Bath Twp H (Contested, 222 split-ticket votes), then nine Base precincts in Norton, Richfield and Bath.",
  },
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
