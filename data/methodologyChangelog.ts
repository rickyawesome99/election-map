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

export type MethodologyModel = "forecast" | "state-tpl" | "district-tpl" | "county-tpl" | "war" | "precinct-district" | "turnout" | "state-leg";

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
    date: "2026-10-17", models: ["forecast"], kind: "data",
    title: "Pollster grades: same-surname nominees no longer graded as a tie",
    detail: "The 2023–24 graded-poll build (scripts/build-pollster-graded-polls.py) keyed each poll's answers by surname alone, so when both nominees shared one the Republican's share overwrote the Democrat's and the poll was recorded as Even. Answers now carry their party, and a shared surname is resolved by party; a unique surname still matches regardless of party, because the results file's Democratic slot sometimes holds an independent. Only SD-01 2024 (Dusty vs Sheryl Johnson) was affected: Emerson's R+36 and Mason-Dixon's R+37 had been stored as ties against an R+44 result.",
    effect: "Display only (grades are shown, not a weight; the live house effects use 2026 polls). Emerson's score −0.58 → −0.79 (still A−); the race's 37-point phantom error also moved the field benchmark everyone is scored against, so 57 of 171 graded rows shifted by a few hundredths and five crossed a band edge: SurveyUSA and Impact Research B → B−, St. Pete Polls C+ → C, McLaughlin C → C−, SoonerPoll C− → D.",
  },
  {
    date: "2026-10-17", models: ["state-leg"], kind: "data",
    title: "Fundraising: 2016 for the Transparency USA states, older cycles and fuller totals from state records",
    detail: "Transparency USA starts in 2018, so the 2016 cycle (Virginia's 2017) now comes from each state's own records: Arizona See The Money, California Cal-Access, Colorado TRACER, Florida's contribution database, Georgia's legacy ethics search, Idaho's archive (itemized over $50 only), Illinois ISBE D-2 totals, Indiana and Iowa bulk files, Michigan MiTN, Minnesota's district viewer, Nevada's 2021 database dump, New Mexico's legacy CFIS, New York's open data, North Carolina's transaction search, Pennsylvania's exports, South Carolina's ethics API, Texas TEC's database, Virginia's legacy reports (2017), Washington PDC, Wisconsin's API and Wyoming's report. Other gaps filled: Kansas 2016 House (the Ethics Commission's published summary), Maine 2016 and Maryland 2018 (The Accountability Project's public copies of the old state exports), West Virginia 2016 (the SOS historical reports; paper filers stay blank) and South Dakota (its filing PDFs; SDCL 12-27-33 bars commercial use). Hawaii and Missouri now use report totals (election-period-to-date; report summaries) instead of itemized gifts only. Rules kept: private contributions only (Arizona's and Minnesota's public funding and transfers from an earlier committee left out; California's loans left out), a committee is matched to a general-election candidate by name, inside the district where the record has one, and a candidate with several committees keeps the largest (leadership funds and PACs excluded). Shared matching gained two committee-name rules: the candidate's first and last name both in the committee name, or the surname alone when the name also says the chamber (\"Moore for House\").",
    effect: "Display only. Money on file: 27,323 → 30,201+ district-cycles; every 2016 Transparency USA state now has a 2016 cycle except New Hampshire (e-filing was voluntary) and Ohio (its records sit behind a Cloudflare check). Spot checks exact against the filings: Corcoran FL $311,908.34, Madigan IL $5,601,837.75, Ralston GA $1,008,793.84, Roem VA $978,781.63, Heastie NY $1,048,882.66, Davis TX $1,046,043.41, Lucas SC $135,349.03, Thibodeau ME $29,424.81, Hunt NE $135,072.26.",
  },
  {
    date: "2026-10-17", models: ["forecast"], kind: "data",
    title: "Generic ballot and Trump approval polls updated through October 15",
    detail: "Polls RealClearPolitics has added since the October 10 export were appended to data-entry/generic_ballot_polls.csv (12, newest RMG Research October 12–13, including back-filled Morning Consult September 28–October 4, Rasmussen October 1–7 and THP/MM October 4–6) and data-entry/trump_approval_polls.csv (9, newest Rasmussen October 11–15, including a back-filled THP/MM September 7–13), and both were rebuilt with their data-entry scripts. Nothing in the method changed.",
    effect: "Generic ballot D+8.0 → D+8.1 (D 49.6 → 49.8, R 41.6 → 41.8; RCP's own average D+8.0); approval net −22.4 → −21.3. Every race moves Democratic by at most 0.2 points. House: expected Democratic seats 224.9 → 225.2, P(Democratic control) 88.6% → 89.4%. Senate 50.8 → 50.9, 59.3% → 60.8%. Governors 25.6 unchanged. Three rating changes, all at a band edge: Iowa Governor and OH-01 Lean D → Likely D (back to where they stood before this week's race polls) and TX-24 Safe R → Likely R.",
  },
  {
    date: "2026-10-17", models: ["forecast"], kind: "data",
    title: "Race polls refreshed through October 16",
    detail: "Weekly `npm run refresh` of every 2026 race's Wikipedia polling tables, append-only as before. One new alias maps \"University of Houston\" to the rated University of Houston Hobby School. A Global Strategy Group PA-01 poll Wikipedia dates October 1–8, 2025 was appended but falls before the 1 January 2026 cut, so the model never reads it. Wikipedia now party-sums four on-file AK-01 polls and the June Alaska Survey Research governor poll differently from the file; the rows on file were left as is. No method change.",
    effect: "93 new polls (35 Governor, 20 House, 38 Senate) in 55 races; 1,059 polls in 164 races, newest ending 2026-10-16. House: expected Democratic seats 224.4 → 224.9, P(Democratic control) 87% → 89%. Senate 50.8 unchanged (59%). Governors 25.5 → 25.6. 9 rating changes: GA-07 and Mississippi Senate Safe R → Likely R, AK-01 and MN-01 Likely R → Lean R, KY-06 Lean R → Tilt R, ME-02 Tilt R → Tilt D, Iowa Senate Tilt R → Lean R, Iowa Governor and OH-01 Likely D → Lean D (both at D+5.0, reversed by the generic-ballot update the same day).",
  },
  {
    date: "2026-10-16", models: ["state-leg"], kind: "data",
    title: "Fundraising (dataset E) extended to 17 more states from their own campaign-finance portals",
    detail: "Dataset E covered the 25 Transparency USA states plus Alaska 2016–2020. It now adds AR (2024, 2026), CT, DE, HI, KY, LA (2019, 2023), MA, MD (2022 from 11/2020, 2026), ME (2018 on), ND (2016–2024), NE, NJ (2017–2025), OK, TN, UT, VT and WV (2018 on) from each state's own disclosure system (scripts/fetch-state-leg-finance-{st}.py), AK 2022–2026, MO 2020–2026 (itemized only), MT, RI and TN 2016–2026, and OR 2016–2020 in part (ORESTAR began refusing requests; the rest resumes from the cache). Portals list every filer, so scripts/assign-state-leg-finance.ts keeps a record only when its name matches a general-election candidate of that cycle, inside the district when the portal gives one. Contributions are PRIVATE money only: Connecticut's Citizens' Election Program and Maine's Clean Election grants are left out. A cycle is the two calendar years ending with the election (four in Louisiana and Maryland, whose terms are four years; a race's own committee in Kentucky, Oklahoma, Tennessee, New Jersey and Maine). Known undercounts: Hawaii and Missouri publish only itemized gifts (over $100), Maryland's 2022 cycle starts in November 2020, Arkansas 2018–2022 has e-filers only. Statewide name matching never accepts an initial alone (it had put Governor Jeff Landry's committee on House candidate Jacob Landry). Each district page's Electoral history names the source of every year's Raised figures. Declined: OpenSecrets' state profiles (needs a headed browser past Cloudflare, CC BY-NC-SA).",
    effect: "Display only — the projection has no money term yet. Money on file: 26 → 47 states, 16,635 → 27,323 district-cycles. A committee with no contribution rows on file is null, never $0. Spot checks against the filings: Mariano MA 2022 $472,192.34, Hanshaw WV 2022 $203,888.77, Lamberth TN 2022 $199,724, Scutari NJ 2023 $2,645,000, Hunt NE 2018 $135,072.26, McCall OK 2022 $463,314.89 (all exact).",
  },
  {
    date: "2026-10-16", models: ["state-leg"], kind: "change",
    title: "Chamber projection headline = the sum of each seat's projected winner",
    detail: "A chamber's 2026 projection headline (its chamber page and the state page) showed the simulation's mean seat count rounded, while the chamber map's counter summed each seat's projected winner, so the two could disagree by a seat or more: a party trailing narrowly in several seats is credited with fractions of them in the mean. The headline now uses the counter's rule, from one shared function (lib/stateLegAtlas.ts projectedSeatWinners): a contested seat to the side of its margin, an uncontested one to the only major party, seats the field decides to their party, a modeled independent's seat to whoever is favored, seats not up to their member. The 80% range and the control odds are still read from the 5,000 draws; /legislatures keeps the simulation means, shown to a decimal.",
    effect: "Pennsylvania Senate D 23 → D 22 (the mean credited Democrats about one seat across SD-6, 16, 24 and 40, each R-favored), Pennsylvania House D 105 → D 104.",
  },
  {
    date: "2026-10-16", models: ["state-leg"], kind: "data",
    title: "2026 popular vote for the 11 states with no 2024 presidential column on today's lines",
    detail: "Dataset A (stateLegPresByEra) carries no 2024 presidential vote on the current map for Alaska, Arkansas, Connecticut, Idaho, Maine, Michigan, New Jersey, North Dakota, Oklahoma, Oregon, Pennsylvania and South Dakota, and the popular vote splits the state level by each district's share of the 2024 presidential vote, so all 22 of those chambers came out blank. The model now falls back to the precinct-exact 2024 file the district pages already read (stateLegPres2024), which covers every district in those chambers.",
    effect: "Chambers with a 2026 popular vote 65 → 87 (New Jersey has no 2026 legislative election). Pennsylvania House D+3.2 adjusted, Senate D+2.4; Michigan House D+2.0, Senate D+3.9. 2024 holdout now 80 chambers (from 59): district votes MAPE 6.33% → 6.21%, share 5.59% → 5.46%, raw chamber margin MAE 2.13 → 2.08. The 2022-from-2018 holdout is unchanged; the unopposed-turnout median (267 chamber-years, from 250) is still 0.82.",
  },
  {
    date: "2026-10-16", models: ["state-leg"], kind: "change",
    title: "2026 chamber popular vote, raw and adjusted",
    detail: "Every seat on a chamber's 2026 ballot gets a projected vote count and a party split, and the chamber's seats are summed two ways on its page beside the corrected chamber margin: raw (the aggregate the certified results will print, unopposed seats at UNOPPOSED_TURNOUT 0.82 of a contested race, none at all where the state prints no count) and adjusted (every seat lacking a major party imputed as the contested race it would have been, on the district projection's margin — the corrected past margins' rule applied with the projection instead of the presidential vote). Votes = the turnout estimate's state level × the district's share of the 2024 presidential vote × a per-seat factor measured from the seat's own 2022 and 2018 races (relocated through the crosswalk across redistricting, shrunk toward the chamber mean with DROPOFF_SHRINK_VOTES 2,000) × seats up. Shares divide the full vote, with the chamber's recent other-party share by kind of race. New: lib/stateLegPopularVote.ts, scripts/stateLegPopularVoteBacktest.ts.",
    effect: "2022 from 2018 (71 chambers on today's lines, 2,581 contested districts): district votes MAPE 11.5% with the turnout estimate's level (+5.9% bias, the estimate's 2018→2022 miss) and 7.8% with the actual level; district share of the chamber 7.3%; chamber totals 2.7%; raw chamber margin MAE 3.5 (bias −2.5, Florida's 2022 chamber shock the worst). 2024 from the live weights with the actual level: votes 6.3%, share 5.6%, margin MAE 2.1. Shrink grid flat from 0 to 5,000; the chamber mean alone is worse on districts (8.2% share). Today's widest raw-to-adjusted gaps: Rhode Island Senate D+70 → D+23, Massachusetts House D+59 → D+32, Kentucky Senate R+54 → R+24.",
  },
  {
    date: "2026-10-16", models: ["state-leg"], kind: "data",
    title: "Delaware and Vermont Senate 2020-era presidential blocks held House districts — rebuilt",
    detail: "Dataset A's 2020-era block for both senates carried 41 (Delaware) and 104 (Vermont) districts against chambers of 21 and 16, so every 2016–2020 senate race on those lines was matched to a House-sized presidential figure, and dataset C's crosswalk for the two chambers was built on the same wrong polygons. Cause: scripts/build-state-leg-pres-by-era.py cached the era file's GeoJSON conversion by file name and mtime, and house/DE-2020.json and senate/DE-2020.json share a name. The cache key now includes the chamber; both blocks and both crosswalks were rebuilt (21/21 and 13/13 districts, sums matching the certified totals). A second Vermont fault surfaced in the rebuild: the Python port of the boundary-code rule stripped only the current map's \"Senatorial District\" suffix, so the 2020-era Senate keys came out as \"Addison State Senate District\" and matched no result; it now mirrors lib/stateLegBoundaryCode.ts. The popular-vote model also ignores any era block with over 1.3× the chamber's districts, and the projection, TPL and popular-vote holdouts were re-run.",
    effect: "Delaware Senate's 2026 turnout factor 1.40 → 1.03 per seat; Vermont Senate's 2018 races now join (11 of 16 districts relocated). Popular-vote holdout chamber totals (actual level) 3.6% → 2.7% MAPE over 71 chambers.",
  },
  {
    date: "2026-10-15", models: ["forecast"], kind: "tested",
    title: "Cash on hand, spending, outside spending and small-dollar share as money terms: not adopted",
    detail: "For 544 House and Senate races in the forward backtest (2018–2024), each nominee's finances were rebuilt as of their Q3 report (coverage ending by September 30, newest amendment of each report), with outside spending from the FEC 24/48-hour independent-expenditure files through September 30 (spending that supports a candidate plus spending that opposes their opponent). Each measure was then fitted, with every year held out in turn (leave-one-year-out), against the residual left before the money term, alone and on top of receipts. Receipts and spending correlate at 0.95–0.98, and receipts and cash on hand at 0.73–0.80.",
    effect: "Nothing beat the live receipts term. House leave-one-year-out MAE: no money 4.53, live receipts term 4.51, cash-on-hand gap alone 4.50 (worse than receipts in 2018/2020/2022, better only in 2024; paired t −1.7). Adding cash on hand, outside spending or small-dollar share to the live term made House and Senate error worse or left it unchanged. Senate: live term 5.76; + outside spending 5.70, but the sign flips by year (paired t −0.5). Small-dollar share has no consistent sign in either chamber. The extra figures are shown on the race pages only.",
  },
  {
    date: "2026-10-15", models: ["forecast"], kind: "data",
    title: "2026 House/Senate receipts refreshed; cash on hand, spending, outside spending and small-dollar share added to race pages",
    detail: "Receipts re-read from the FEC's weball26 summary of October 15 by the new scripts/fetch-fec-race-finance.py, which also pulls each nominee's cash on hand, disbursements and unitemized share of individual contributions (OpenFEC candidate totals, same two-year window), and outside spending from the FEC's daily 24/48-hour independent-expenditure file (superseded filings and junk entries over $100M dropped). Q3 reports (through September 30) are due today; 121 of 874 nominees' latest report already ends September 30, 505 still June 30. The new figures are displayed only. The forecast still reads receipts alone. Maine's Troy Jackson (nominated by convention July 25) has no FEC filing processed yet and stays blank.",
    effect: "100 House/Senate sides changed. 49 races moved, all Safe/Likely, none more than 1.1 points (GA-07 R+21.2 → R+20.1). No rating changes. House expected Democratic seats 224.51 → 224.52, P(control) 87.0% unchanged. Senate and governors unchanged.",
  },
  {
    date: "2026-10-14", models: ["state-leg"], kind: "change",
    title: "The seat's most recent race carries half of its year's lean; chamber shock and independent noise refitted",
    detail: "The State Navigate comparison showed the largest single-seat disagreements in split-ticket districts (Vermont's Rutland Senate, New York's AD-99) where their lean rests on the last legislative result and ours on the presidential rows. Tested two ways on the holdout (scripts/stateLegBacktest.ts --sweep): the seat rows' share of every year's lean from 0.10 to 0.80 (optimum 0.30–0.40 against the live 0.25, a gain of 0.02–0.09 MAE), and the latest seat row's weight × k with the ratio unchanged (×2–×3 best: MAE after incumbency 5.85 → 5.74 in 2022 and 5.39 → 5.18 in 2024, bias +1.16 → +0.76 and +0.92 → +0.55; ×5 worse). RECENT_SEAT_BOOST = 3 adopted: in the latest year with a seat row that row's type weight is 0.6 against the presidential 0.6, so the seat's own last race is half of that year's lean; TYPE_WEIGHTS stay at P 0.6 / L 0.2. Refitted on the new residuals: STATE_SHOCK 4.0 → 3.5 (chamber-mean spread 3.3 / 3.5), INCUMBENCY_PTS stays 3 (fits 3.6 / 1.8), SIGMA stays 7 (7.2 / 6.9); the independent holdout's robust spread falls from 9.6 to 7.1, inside SIGMA and STATE_SHOCK, so IND_SIGMA 5 → 0.",
    effect: "Holdout MAE after incumbency 5.85 → 5.74 (2022), 5.39 → 5.18 (2024). Seats on the ballot projected D 3,029 → 3,013, R 3,073 → 3,090 (the seat rows lean more Republican than the presidential rows in 2024's electorate). Against State Navigate's contested seats the margin correlation rises 0.974 → 0.976 and the mean gap to 3.4 points, ours the more Republican.",
  },
  {
    date: "2026-10-14", models: ["state-leg"], kind: "change",
    title: "Seats a party cannot lose are decided, not drawn; a fusion nominee is one person",
    detail: "Two gaps a comparison with State Navigate's forecast surfaced. (1) Multi-member districts drew every seat on the district's margin even where a party fielded fewer nominees than seats, so a Republican running alone against two Democrats for two seats was given a chance at both. A party now keeps max(0, seats − the other party's nominees) outright, and a post with one party's nominee (Idaho's A/B, Washington's 1/2) is that party's; only the remaining seats are drawn, and a district with none left is \"split\" (ND HD-11: one Democrat, one Republican, two seats). (2) A candidate nominated by both major parties (Oregon and Vermont cross-nominate; New York fuses) was two nominees, so the race scored as contested on a margin with no opponent — Simcha Felder's 2024 line split made NY SD-22 lean R+44 — and the Vermont Senate's Rutland Republicans, each on both lines, read as a D-vs-R race (lean D+2.6 from the presidential rows) instead of three unopposed Republicans. lib/stateLegAtlas.ts fieldPersons() folds a person's lines into one nominee, in the party they sit for (the roster) or, for a newcomer, the party holding the seat; a past result with one person on both lines contributes no seat row.",
    effect: "114 districts carry decided seats (73 Democratic, 68 Republican); 19 fusion fields and 5 past results re-read. Seats on the ballot projected D 3,042 → 3,029, R 3,061 → 3,073. The two-party holdout is unchanged to two decimals.",
  },
  {
    date: "2026-10-13", models: ["state-leg"], kind: "change",
    title: "Independents are forecast: a credible independent on a one-party ballot is a contest, not a decided seat",
    detail: "A field with one major party used to decide the seat for that party, so Alaska's coalition independents (Schrage, Himschoot, Holland), Maine's Sharon Frost, Rhode Island's Jon Brien and Utah's Emily Buss were booked as certain losses, and no seat could go to an independent. Now a credible independent — sitting, ≥ IND_RECORD_SHARE (40%) in their last head-to-head in the seat, or backed by the absent party (data/stateLegIndependents.ts, researched with sources: Alaska Democrats' candidate pages, the Maine Senate GOP's spending for Stephen Carey) — takes the absent party's place: advantage = ± (lean + β*·E) + incumbency + a personal effect, the mean residual of their last two head-to-heads in the seat shrunk toward IND_PRIOR_PTS (14; 0 for a backed newcomer) with K = IND_SHRINK_K (1), and IND_SIGMA (5) more noise. A party backing an independent over its own nominee under ranked choice (Bryce Edgmon, Alaska SD-S) puts the independent in its place; an appointed incumbent (Buss) gets no incumbency, the federal rule; a multi-member district where the party fields a nominee for every seat (Vermont's Chittenden-15) is a race inside one electorate decided by incumbency and noise. A ballot with no major party at all (Galvin, Whipps, Lipsky, Sibilia, Tennessee's write-in-only 93rd) is an independent seat outright; Nebraska stays unprojected. The chamber simulation now counts D, R and other seats separately, so expected Republican seats no longer absorb unprojected ones.",
    effect: "16 independent races modeled, 8 favored (Himschoot 99%, Schrage 99%, Edgmon 99%, Holland 96%, Frost 91%, Headrick 64%, Brien 59%, Johnson 58%); 12 projected independent seats nationally, 3 of them gains from a party. Holdout (16 past head-to-heads 2018–24): winner called 14/16 vs 13/16 with no prior and 12/16 for the generic-nominee rule the forecast used to imply, RMSE 17.3 vs 24.5. The two-party holdout is unchanged.",
  },
  {
    date: "2026-10-13", models: ["state-leg"], kind: "data",
    title: "Hawaii's canceled generals go to the primary winners; Tennessee's 93rd is a write-in independent seat",
    detail: "Hawaii cancels a general when one party's primary was the only contest; scripts/fetch-state-leg-candidates-2026.py only handled a single filer (Oklahoma), so HD 24 (Adrian Tam), HD 37 (Trish La Chica) and SD 25 (Chris Lee) were stored as \"General election canceled\" under party O and left unprojected. The parser now takes the primary winners (Ballotpedia's check mark) when they are all one party. Tennessee's HD 93 has no one on the printed ballot and only independent write-ins (G.A. Hardaway died after a petition error kept him off; the Democratic primary went to a write-in, Britney Thornton, who is not on the general's write-in list); it now reads as an independent seat rather than an empty field.",
    effect: "3 Hawaii seats decided for the Democrats and 1 Tennessee seat to an independent: seats forecast 6,107 → 6,115 together with the four no-major-party seats.",
  },
  {
    date: "2026-10-11", models: ["state-leg"], kind: "data",
    title: "One candidate page per person across spellings, chamber switches and redraws",
    detail: "Spellings of one name were joined only when they shared a seat, so a member who moved from the House to the Senate (Roger A. Nutt, HD 34 → SD 12) or whose district a redraw renumbered (Andy Josephson, HD 17 → HD 13) had two pages. lib/stateLegCandidateIdentity.ts now parses each spelling (nicknames — Bill/William, Deb/Deborah, quoted ones; middle names and initials; surname particles and apostrophes; generational suffixes; New York ballot-line tags) and the index joins two spellings when the names agree and the seats are linked: the same seat; seats whose territory overlaps (data-entry/state-leg-seat-links.json from scripts/build-state-leg-seat-links.py: every House/Senate and old/new-map polygon pair covering ≥ 10% of the smaller one), unless one ran as a Democrat and the other as a Republican; or two seats that both overlap one district, with a party in common. Never joined: disagreeing middle names (not checked on a shared seat, where it is a typo or maiden name), different suffixes (Hanna Sr./Jr.), or two different seats in one year. Groups join only when every spelling in one is compatible with every spelling in the other. Every merged spelling's slug, and its accent-free form, still resolves. Unlinked pairs with agreeing names are listed by scripts/audit-state-leg-candidate-identity.ts for rulings in data/stateLegCandidateIdentityOverrides.ts.",
    effect: "38,407 → 36,914 pages: 426 joins on overlapping seats, 27 on neighbouring ones, and about 1,170 same-seat joins the old exact first-and-last rule missed (nicknames, particles, initials). 6 joins the old rule made are now split: three suffix pairs (Hanna Sr./Jr. in PA, Craven Sr./Jr. in RI, Harold V. Jones II/III in GA — the last probably a source typo), the Buccos in NJ, two SC Luke Rankins, and GA's William Harris vs William C. Harris. 64 pairs are left for review.",
  },
  {
    date: "2026-10-11", models: ["state-leg"], kind: "data",
    title: "State legislative fundraising, cycle by cycle, starting with 2026",
    detail: "Dataset E: every general-election candidate's total contributions per the state filings, from Transparency USA's race pages for its 25 states (2018–2026, Virginia 2017–2025; scripts/fetch-state-leg-finance-tu.py, cached crawl) and FollowTheMoney for the rest and for 2016 (scripts/fetch-state-leg-finance-ftm.py, as the API's quota allows). lib/stateLegMoney.ts joins the filings to the atlas's candidates by name (nicknames canonicalised; a filing that matches nobody is kept as unmatched, a candidate without one is null, not zero) and reduces each race to a two-party money gap. Shown on the district header for the current cycle (with its data-through date), as a Raised column in the electoral history, and on candidate pages. The projection's money term is not yet fitted; that follows once the 2022 and 2024 cycles are in.",
  },
  {
    date: "2026-10-11", models: ["state-leg"], kind: "data",
    title: "Why each open state legislative seat is open: outgoing members with reasons",
    detail: "The English Wikipedia article on each chamber's 2026 election lists members not seeking re-election with the reason (term-limited, retiring, running for another office, resigned, lost renomination). scripts/fetch-state-leg-outgoing-2026.py parses those sections for every chamber on the ballot (968 members, 81 chambers; three line formats; North Dakota and the West Virginia, Pennsylvania, Nevada and New Hampshire Senates carry no list) into data/stateLegOutgoing2026.ts. Shown on the district header as a \"Not running\" line beside the 2026 ballot, and on the member's candidate page. The Ballotpedia field stays the authority on who is running.",
  },
  {
    date: "2026-10-11", models: ["state-leg"], kind: "data",
    title: "Candidate pages for every state legislative candidate, 2016–2026, and redistricting maps on every district",
    detail: "Every person who stood in a state legislative general election since 2016, is on a 2026 ballot or sits in a chamber today has a page at /candidates/[name]-[state] (lib/stateLegCandidateIndex.ts: 38,388 people, 65,428 races), beside the federal candidate pages and merged with them where the same name ran in the same state (366 people). Spellings that share first and last name and a seat are one person; any spelling's slug resolves. Each district's redistricting history now draws before/after maps from the boundary files: the previous map shaded by each old district's share of today's population, today's district outlined, and the new map beside it; New Hampshire floterials draw their base districts.",
  },
  {
    date: "2026-10-11", models: ["state-leg"], kind: "change",
    title: "A chamber-level shock in the state legislative simulation",
    detail: "The chamber simulation drew one national shock shared by every seat and independent SIGMA noise per seat, so a state-wide miss (a governor's race on the same ballot, a state issue, a map the lean has not caught up with) was treated as independent seat noise and chamber ranges were too narrow. The backtest now splits the residual spread into a chamber-level shock τ (method of moments on chamber-mean residuals, chambers with 10+ contested seats: 3.8 in 2024, 3.9 in 2022) and the seat noise after it (7.0 / 7.2). STATE_SHOCK = 4 is one draw shared by every seat of a chamber in each simulation and enters each seat's σ; SIGMA 8 → 7 so a single seat's spread is unchanged (√(7² + 4²) ≈ 8.1).",
    effect: "Per-seat margins and ratings unchanged. Chamber 80% seat ranges widen from 3.6 to 6.2 seats on average; 7 chambers in play (20–80%) instead of 6. New Hampshire House P(D majority) 100% → 83%, Pennsylvania House 92% → 76%, Maine House 100% → 88%, Minnesota House 100% → 93%, Wisconsin Assembly 37% → 45%, Arizona House 6% → 17%, Michigan Senate 77% → 69%.",
  },
  {
    date: "2026-10-11", models: ["state-leg", "state-tpl"], kind: "data",
    title: "New Hampshire floterials recombined from their base districts",
    detail: "The 39 House floterial (overlay) districts have no polygon in any boundary file and so had no presidential figure: no presidential rows in the projection, no imputation in the chamber margin (skipped), no lean trend. On the current map each is the sum of the base districts it sits on (the roster's components), so scripts/build-state-leg-pres-by-era.mjs now writes that sum into the current era (overlayOf marks it). The superseded 2020-map floterials are still absent. The atlas draws the base districts as the floterial's map.",
    effect: "39 districts gain 2016/2020/2024 presidential rows and a fuller 2026 projection; the New Hampshire chamber margin's skipped count on the current map falls to zero (State TPL moves by less than 0.1).",
  },
  {
    date: "2026-10-10", models: ["state-leg"], kind: "change",
    title: "2026 projection for every state legislative district, and the State Legislatures board",
    detail: "lib/stateLegForecast.ts: a district lean from the seat's contested generals (races on a superseded map relocated onto today's lines through the population crosswalk and the presidential delta) and the presidential vote on today's lines, P/L type weights 0.6/0.2, year decay and Huber as in the State TPL; projected with β* × E(2026) and a fitted state-legislative incumbency of 3 points; a field with one major party is decided outright; σ 8 race noise plus the national shock; 5,000-draw chamber simulation with holdovers. Shown as the atlas's default colour mode, a per-district outlook ledger, a chamber header stat and /legislatures.",
    effect: "Holdout (scripts/stateLegBacktest.ts): 2024, 3,348 contested districts on today's lines, MAE 5.5 → 5.4 after incumbency (fitted 2.4), σ 8.0; 2022, 2,615 districts, MAE 6.4 → 5.9, incumbency 4.0, σ 8.2. Today: 88 chambers, 6 in play (Arizona Senate, Michigan House and Senate, New Hampshire Senate, Wisconsin House and Senate).",
  },
  {
    date: "2026-10-10", models: ["state-leg"], kind: "data",
    title: "2026 general-election candidates for every state legislative district on the ballot",
    detail: "Ballotpedia's chamber election pages, read from their \"general election 2026\" candidate tables: Democratic, Republican and Other candidates per district, incumbents marked, multi-member districts' seat counts, write-ins flagged (scripts/fetch-state-leg-candidates-2026.py → data/stateLegCandidates2026.ts). Shown on the district atlas (header line, Open seats and Unopposed filters, a chamber-level field stat) and ready for the 2026 projection's contest rules.",
  },
  {
    date: "2026-10-10", models: ["state-tpl", "state-leg"], kind: "change",
    title: "State Legislature rows rebuilt district by district: a contested pool and an imputed unopposed pool",
    detail: "The State TPL's State Legislature entry was the raw chamber aggregate — every counted district's votes summed — which counted a printed unopposed race as a 100–0 result and omitted an unprinted one, so it reported the margin of whichever seats happened to be contested and overstated the dominant party wherever unopposed races are printed. Each year now carries two rows that share the L weight on their turnout (lib/stateLegChamberMargin.ts): the contested pool (districts where both major parties drew votes, their own margin and votes) and the unopposed pool, imputed district by district from the presidential vote on the map the race was run on (data/stateLegPresByEra.ts, nearest presidential year), weighted by that presidential vote scaled to the chamber's legislative-to-presidential turnout ratio and stripping the environment of the source presidential year — the rule imputed House seats already followed. IMPUTED_LEG_ROW_WEIGHT = 1 (0.5 tested, no better). The environment fit is unchanged in form: imputed rows never enter it, so it now sees the contested pool. TPL_RAW_LEG=1 restores the old row for comparison.",
    effect: "2024 holdout: President 2.46 → 2.24, Senate 5.02 → 4.90, House average 3.06 → 3.41 (the harness references were re-baselined and the validation table re-emitted). 44 of 50 state TPLs move, 24 by half a point or more, mean 0.75, 34 toward Democrats: the states that print unopposed races compress toward their presidential lean — Wyoming R+44.7 → R+42.1, South Dakota R+30.8 → R+28.4, North Dakota R+35.0 → R+33.1, West Virginia R+36.2 → R+34.4, and on the other side Rhode Island D+20.3 → D+17.9 and Massachusetts D+30.0 → D+27.9.",
  },
  {
    date: "2026-10-10", models: ["state-leg"], kind: "data",
    title: "Legislative District Atlas: presidential results on every map era, named candidates, redistricting history",
    detail: "Three datasets behind the new per-chamber district pages (/states/[state]/legislature/[chamber]). (A) 2016, 2020 and 2024 presidential votes inside every state legislative district on the current map and on each superseded map, from Dave's Redistricting 2020-VTD returns area-apportioned onto each era's polygons; the 2024-on-current cell stays the precinct-exact one. (B) Candidate names for every general election 2016–2025: Klarner's candidate file (names, incumbency, winners) for 2016–2022, MEDSL and the state canvasses for 2024, Wikipedia and the Secretaries of State for the odd years; winners, incumbents and unopposed flags derived where a source carried none. (C) Per-district redistricting history from population-weighted overlays of consecutive maps, with generated descriptions and the old-to-new crosswalk the 2026 projection will use.",
    effect: "99 chamber pages. 28,771 of 28,807 district-years named (99.9%). Overlay error on the 2024 holdout: median 0.04 points of margin across 73 chambers, worst Montana House 2.5. No model output changed.",
  },
  {
    date: "2026-10-10", models: ["state-tpl", "state-leg"], kind: "data",
    title: "New Hampshire 2022 House votes corrected from the state's election-database export",
    detail: "The county-PDF parse behind data-entry/new_hampshire_2022_legislature.csv had double-counted 17 districts whose candidate header spanned two groups, tripled Hillsborough 16, mis-assigned Rockingham 13 and 16 and Strafford 15, and omitted Strafford 16. The CSV is now regenerated from the Secretary of State's own tabulation (the NH election database's export), where every district's candidate votes equal its Total Votes Cast row; the statewide row in state_leg.csv follows.",
    effect: "Chamber total 2,275,330 → 2,089,636; Democratic 1,154,052 → 1,044,611, Republican 1,102,958 → 1,033,731; margin D+2.2 → D+0.5. New Hampshire's State TPL moves with its 2022 State Legislature row (5% race-type weight).",
  },
  {
    date: "2026-10-09", models: ["forecast"], kind: "change",
    title: "A ceiling on the poll average's share of a projection",
    detail: "The poll share of a race's projected margin, w = nEff / (nEff + POLL_K), approached 1 as polls piled up: the most heavily polled Senate and Governor races (Michigan, Texas, Maine, Ohio, Iowa) ran 79–86% on their polls. It is now w = min(POLL_W_MAX, nEff / (nEff + POLL_K)) with POLL_W_MAX = 0.75, so the structural model keeps at least a quarter of every projection however many polls a race has (lib/racePollAverage.ts pollWeight, which the forward backtest now calls instead of recomputing the weight). User decision: the polls of 2016, 2018, 2020 and 2024 missed in the same direction across the whole field, which the pollster house effects — measured relative to the field — cannot catch, so no race should run on polls alone. POLL_K is unchanged, so lightly polled races are untouched; the cap binds in 10 races today.",
    effect: "Nine races move, seven toward Republicans: Texas Governor R+2.6 → R+3.4, Ohio Governor D+2.1 → D+1.7, Texas Senate D+2.6 → D+2.3, Iowa Governor D+7.3 → D+6.9, Iowa Senate D+0.3 → EVEN; Maine Senate D+2.9 → D+3.1 the other way (its model is bluer than its polls). No rating changes. Chambers: Governors 26.22 → 26.15 expected Democratic; House 229.7 and Senate 51.2 (P(Democratic control) 95% / 68%) unchanged to the decimal. Forward backtest, blend MAE at the live constants: Senate 4.69 → 4.67 (mid-September), 4.54 → 4.52 (mid-October), 4.60 → 4.59 (November 1); Governor 5.86 → 5.89 (mid-October), 5.40 → 5.44 (November 1); House unchanged. Mean w falls 0.01–0.02 at each horizon.",
  },
  {
    date: "2026-10-10", models: ["forecast"], kind: "data",
    title: "Generic ballot and Trump approval polls updated through October 8",
    detail: "Polls RealClearPolitics has added since the October 4 export were appended to data-entry/generic_ballot_polls.csv (6: Economist/YouGov, Morning Consult, Cygnal, Reuters/Ipsos, Pew and a back-filled September 24–27 Rasmussen) and data-entry/trump_approval_polls.csv (7, newest Rasmussen October 4–8), and both were rebuilt with their data-entry scripts. Every poll already on file matches RCP's table. Nothing in the method changed.",
    effect: "Generic ballot D+8.4 → D+7.9 (D 50.8 → 49.8, R 42.4 → 41.9), matching RCP's own average; approval net −21.4 → −22.3. Every race moves Republican, mean 0.36 pts, max 0.6. House: expected Democratic seats 229.7 → 228.3, P(Democratic control) 95.1% → 92.5%. Senate 51.3 → 51.1, 69.1% → 63.3%. Governors 26.1 → 25.9. 18 rating changes, including Iowa Senate Tilt D → Tilt R, Nevada Governor Tilt D → Tilt R, MI-07 Tilt D → Tilt R, Georgia Governor Tilt R → Lean R and Minnesota Senate Likely D → Lean D.",
  },
  {
    date: "2026-10-10", models: ["forecast"], kind: "data",
    title: "2026 fundraising refreshed",
    detail: "House and Senate receipts re-read from the FEC's weball26 summary of October 10, matched by FEC id. Most candidates' latest report still ends June 30 or at a summer pre-primary date; Q3 reports (through September 30) are due October 15. Six nominees with no filing in September now have one: GA-08 Kelly Esti, MA-08 Robert Burke, MO-08 Christopher Reichard, NY-10 Jennifer Moore, PA-04 Aurora Stuski and South Carolina Senate's Darline Graham. Governor receipts re-read from TransparencyUSA (new filings in Alabama, Minnesota and Texas) and Massachusetts OCPF. The 15 governor races with no state-portal source are still blank. No method change.",
    effect: "50 House/Senate sides and 7 governor sides changed. South Carolina Senate R+6.1 → R+3.9, Likely R → Lean R: Graham's $0.35M through August 5, against Annie Andrews' $10.8M through June 30, is the first money on file for her side. Every other race moved less than 1.2 points. Senate: expected Democratic seats 51.2 → 51.3, P(Democratic control) 67.5% → 69.1%. House 229.7 → 229.7 (94.9% → 95.1%). Governors 26.1 unchanged.",
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
