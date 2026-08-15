# Historical Election Data Audit Log

Audit of past-election data in `data-entry/*.csv`, verified against official state results /
Wikipedia race articles. One entry per correction: file, row, field, old → new, source.

Started: 2026-07-26

## Structural fixes

- **senate_past_results.csv** L244–L2176 (1,933 rows): removed junk rows — all had blank
  state_abbr/year/seat; most were stray House candidate-name pairs (e.g. "Andy Millard /
  Patrick McHenry", "Rick Bryson / Mark Meadows") apparently pasted from a House dataset.
  build.js ignored them (no state/seat key), so generated output is unchanged. Backup at
  scratchpad/senate_past_results.backup.csv.

## Corrections

### senate_past_results.csv — 2024 cycle

Verified all 34 rows against Wikipedia year page + per-state race pages. All candidate
names (identity), pcts, margins, and D/R vote counts correct. `total_votes` in several rows
used total-ballots-cast instead of the file's dominant convention (sum of candidate votes =
pct denominator); normalized:

- HI 2024: total_votes 522236 → 501763 (https://en.wikipedia.org/wiki/2024_United_States_Senate_election_in_Hawaii)
- ME 2024: total_votes 842447 → 820782 (https://en.wikipedia.org/wiki/2024_United_States_Senate_election_in_Maine)
- VT 2024: total_votes 372885 → 363253 (https://en.wikipedia.org/wiki/2024_United_States_Senate_election_in_Vermont)
- WY 2024: total_votes 271123 → 264162 (https://en.wikipedia.org/wiki/2024_United_States_Senate_election_in_Wyoming)

Notes:
- ME/VT/NE 2024: Angus King, Bernie Sanders, Dan Osborn entered in dem column with "(I)"
  party override — intentional site convention, left alone.
- MA 2024: CSV Warren 2,041,693 votes; one Wikipedia render showed 2,041,668 — pcts
  (59.81/40.00) match either way. Pending exact-count recheck. [resolved below — see MA note]
- Name normalizations queued (see Name Normalization section at end).

### senate_past_results.csv — 2022 cycle

Verified all 35 rows against Wikipedia year page + per-state pages. Corrections:

- **AK 2022**: CSV had pre-certification counts. Fixed to certified first-choice-round
  results: Chesbro 11.20%/29,134 → 10.37%/27,145; Murkowski 44.49%/115,759 → 43.37%/113,495;
  margin 33.29 → 33.00; vote_margin 86,625 → 86,350; total 260,203 → 261,705.
  (Final RCV round Murkowski 53.70/46.30 vs Tshibaka not represented — file convention keeps
  first-choice D vs R.) https://en.wikipedia.org/wiki/2022_United_States_Senate_election_in_Alaska
- **NH 2022**: election-night counts → certified: Hassan 53.50%/332,193 → 53.54%/332,490;
  Bolduc 44.43%/275,928 → 44.39%/275,631; margin -9.06 → -9.15; vote_margin -56,265 → -56,859.
  total 620,975 already correct. https://en.wikipedia.org/wiki/2022_United_States_Senate_election_in_New_Hampshire
- **UT 2022**: race showed only Mike Lee (dem blank, margin 53.15) even though Evan McMullin (I,
  Dem-endorsed) was the main challenger. Added per site convention for independents
  (matches Angus King/Bernie Sanders/Dan Osborn handling): dem_candidate "Evan McMullin (I)",
  42.74%/459,958; margin 53.15 → 10.41; vote_margin → 112,016.
  https://en.wikipedia.org/wiki/2022_United_States_Senate_election_in_Utah
- GA 2022 row uses Dec runoff result (51.40/48.60) rather than the Nov general (49.44/48.49) —
  seat-deciding result, left as-is (noted for consistency review).
- MD/OR/NY/HI 2022 flagged by summary-table rounding — per-state pages confirm CSV correct.

### senate_past_results.csv — 2020 cycle

Verified all 35 rows against Wikipedia year page + per-state pages. Corrections:

- **AR 2020**: no Democratic nominee (Mahony withdrew); race showed only Cotton with margin
  66.53. Added main challenger per independent convention: dem_candidate
  "Ricky Dale Harrington Jr. (I)" (Libertarian), 33.47%/399,390; margin → 33.06;
  vote_margin → 394,481. https://en.wikipedia.org/wiki/2020_United_States_Senate_election_in_Arkansas
- **WY 2020**: total_votes 278,503 (ballots cast) → 271,937 (Wikipedia results-table total).
  https://en.wikipedia.org/wiki/2020_United_States_Senate_election_in_Wyoming
- GA 2020 regular & special rows use Jan 2021 runoff results (Ossoff 50.61/49.39,
  Warnock 51.04/48.96) — consistent with GA 2022 handling, left as-is.
- AK 2020 (Gross 41.19), RI 2020 (66.48/33.35), and all other 2020 rows confirmed correct.

### senate_past_results.csv — 2018 cycle

Verified all 35 rows against Wikipedia year page + per-state pages. Corrections:

- **CA 2018**: rep column was blank (top-two race, two Democrats), margin -54.16. Added
  runner-up "Kevin de León (D)" 45.84%/5,093,942; margin → -8.32; vote_margin → -925,480.
  https://en.wikipedia.org/wiki/2018_United_States_Senate_election_in_California
- **ME 2018**: dem_pct (Angus King) 53.41 → 54.31 (digit transposition); margin -18.18 → -19.08;
  total_votes 646,064 (ballots cast) → 634,345 (sum of the three candidates; Wikipedia table).
  https://en.wikipedia.org/wiki/2018_United_States_Senate_election_in_Maine
- **VT 2018**: dem column was blank, margin 27.44 vs Zupan only. Added "Bernie Sanders (I)"
  67.44%/183,649 (incumbent → D-col); rep_pct 27.44 → 27.47 (certified); margin → -39.97;
  vote_margin → -108,834; total_votes 278,013 → 272,330 (Wikipedia table total).
  https://en.wikipedia.org/wiki/2018_United_States_Senate_election_in_Vermont
- **WY 2018**: total_votes 205,275 → 203,420 (Wikipedia table total).
- IN/ND/RI 2018 confirmed correct per per-state pages (summary-table rounding).
- VA 2018: CSV Stewart 41.01 vs Wikipedia 41.00 — within rounding tolerance, left as-is.

### senate_past_results.csv — 2016 cycle

Verified all 34 rows against Wikipedia year page + per-state pages. Corrections:

- **CA 2016**: rep column blank (top-two, two Democrats), margin -61.60. Added runner-up
  "Loretta Sanchez (D)" 38.40%/4,701,417; margin → -23.20; also Harris votes 7,542,759 →
  7,542,753 and total 12,244,176 → 12,244,170 (certified).
  https://en.wikipedia.org/wiki/2016_United_States_Senate_election_in_California
- **NY 2016**: CSV had Schumer's Democratic-line-only votes (5,116,696/70.18%) instead of
  all-lines total. Fixed: Schumer 70.60%/5,221,967; Long 27.17%/2,009,380; margin -42.62 →
  -43.43; total 7,695,473 → 7,231,347.
  https://en.wikipedia.org/wiki/2016_United_States_Senate_election_in_New_York
- AR/MO/NH/OR/WI 2016 confirmed correct per per-state pages.
- PA 2016: CSV internally consistent (votes match certified; pcts = votes/candidate-sum);
  Wikipedia infobox uses a slightly larger denominator (48.72 vs 48.77) — left as-is.

### senate_past_results.csv — 2014 cycle

Verified all 36 rows against Wikipedia year page + per-state pages. Corrections:

- **KS 2014**: dem blank (Dem nominee Taylor withdrew), margin 53.15. Added "Greg Orman (I)"
  42.53%/368,372; margin → 10.62. https://en.wikipedia.org/wiki/2014_United_States_Senate_election_in_Kansas
- **SC 2014 special**: rep_votes 727,215 → 757,215 (digit transposition); pcts 38.01/60.15 →
  37.09/61.12 (certified); margin 22.14 → 24.03; vote_margin 267,632 → 297,632; total
  1,208,982 → 1,238,982. https://en.wikipedia.org/wiki/2014_United_States_Senate_special_election_in_South_Carolina
- **WY 2014**: total_votes 171,153 → 168,390 (Wikipedia table total).
- AL 2014: Sessions ran unopposed (97.25%, dem blank) — factual, left as-is.
- LA 2014 row uses Dec runoff (Cassidy 55.93/Landrieu 44.07) — consistent with runoff convention.
- MA 2014 votes/pcts confirmed (1,289,944/791,950); total still ballots-cast type (pending).

### senate_past_results.csv — 2012 cycle

Verified all 33 rows against Wikipedia year page + per-state pages. Corrections:

- **ME 2012**: winner Angus King (I, 52.89%) was entirely missing — row showed Dill (D) 13.26
  vs Summers (R) 30.74, margin +17.48 R. Replaced dem col with "Angus King (I)"
  52.89%/370,580 (Dill dropped, matching ME 2018 convention); rep_pct 30.74 → 30.75;
  margin → -22.14; vote_margin → -155,181; total 724,720 → 678,879.
  https://en.wikipedia.org/wiki/2012_United_States_Senate_election_in_Maine
- **VT 2012**: Sanders missing (dem blank, margin 24.90). Added "Bernie Sanders (I)"
  71.00%/207,848; margin → -46.10; total 292,762 → 292,746.
  https://en.wikipedia.org/wiki/2012_United_States_Senate_election_in_Vermont
- **MA 2012**: pcts computed against ballots-cast denominator: 53.27/45.79 → official
  53.74/46.19; margin -7.48 → -7.55. Votes correct (1,696,346/1,458,048).
  https://en.wikipedia.org/wiki/2012_United_States_Senate_election_in_Massachusetts
- **NY 2012**: pcts 72.21/26.34 → certified 72.19/26.33; margin → -45.86. Votes correct.
- **WY 2012**: rep_pct 75.65 → 75.66; margin → 54.01; total 250,700 → 244,862.

### senate_past_results.csv — incumbent flags

- **MA 2014**: incumbent None → D (Ed Markey won the 2013 special; was incumbent in 2014).
- **AL 2020**: incumbent None → D (Doug Jones won the 2017 special; was incumbent in 2020).

### Candidate name normalization — Senate

62 replacements in senate_past_results.csv (formal/legal names → common names), e.g.
Gordon Douglas Jones → Doug Jones, Elizabeth Ann Warren → Elizabeth Warren, Timothy Michael
Kaine → Tim Kaine, Charles Schumer → Chuck Schumer, Thomas Roland Tillis → Thom Tillis,
Mary Jennings Hegar → MJ Hegar, Herschel Junior Walker → Herschel Walker, Kathleen Alana
McGinty → Katie McGinty, Charles Bradley Hutto → Brad Hutto, etc. Full list in git diff.
Names verified against the lead sentence of each candidate's Wikipedia article.

senate_seats.csv (2026): "Dan Osborne (I)" → "Dan Osborn (I)" (spelling), "Ben Ray Lujan" →
"Ben Ray Luján" (also current_incumbent field). No matchup changes.

### governor_past_results.csv — all cycles (2014–2025)

Verified all 149 rows against Wikipedia year pages (2014–2025) + per-state pages. The file
holds the 3 most recent elections per state by design (NH/VT 2-yr terms → 2020/2022/2024 only,
etc.). Corrections:

- **AR 2022**: rep_pct 63 → 62.96; margin 27.8 → 27.76 (571,105/907,037 = 62.96).
- **UT 2024**: dem_pct (Brian King) 28.63 → 28.46; margin 24.26 → 24.43; total_votes
  1,473,185 → 1,477,457 (Lyman write-in 200,551 included in certified total).
  https://en.wikipedia.org/wiki/2024_Utah_gubernatorial_election
- **TX 2022**: curly apostrophe "O’Rourke" → "O'Rourke".
- Names: "Thomas Foley" → "Tom Foley" (CT 2014), "Christopher Peterson" → "Chris Peterson"
  (UT 2020), "J.B. Pritzker" → "JB Pritzker" (IL 2018/2022, matches Wikipedia styling).
- Incumbent flags spot-checked across all rows — all correct (incl. appointed/succeeded cases:
  Ivey 2018, Holcomb 2016 open, Brown OR 2016 special-D).
- governor_seats.csv 2026 names already normalized — no changes.

### president_past_results.csv — 2016/2020/2024

Verified all 168 rows (56 jurisdictions × 3 cycles, incl. ME/NE districts + DC) against
Wikipedia year and per-state pages. **No corrections needed.** Percentages match certified
results (PA rows use Wikipedia's turnout-based denominators, consistent across cycles);
electoral_votes correctly reflect pre/post-2020-census apportionment; incumbent flags correct
(2016 None, 2020 R-incumbent Trump, 2024 None); names already normalized.
Spot-verified exactly: MS 2024 (38.00/60.89), PA 2020 (49.85/48.69).

### house_past_results.csv — targeted fixes (scan flags + top-two races)

- **AK-01 2024**: dem_votes/rep_votes were swapped (Begich won 51.22% but had fewer votes
  listed). Fixed: dem 156,985 / rep 164,861; vote_margin -7,876 → +7,876. Final-RCV-round
  convention (matches AK-01 2022 row). https://en.wikipedia.org/wiki/2024_United_States_House_of_Representatives_election_in_Alaska
- **AR-03 2024**: total_votes 310,084 → 301,084 (digit typo); dem_pct 31.8 → 31.77; margin → 32.03.
- **AZ-05 2024**: rep_votes 225,628 → 255,628 (digit typo); vote_margin → 87,948.
- **WI-08 2022**: phantom candidate "Julie Hancock" 1.03%/3,160 (no such candidate in results;
  no Dem ran). Replaced with actual runner-up "Paul Boucher (I)" 15.76%/48,896; rep_pct
  72.67 → 72.21; margin → 56.45; total 308,229 → 310,196.
- **WA-08 2018**: "Dino Rossi (G)" → "Dino Rossi" (Rossi was the Republican nominee; (G) was
  a data error making him render as Green/wrong party).
- **VT-01 2024**: "Mark Coester Republican (L)" → "Mark Coester" (garbled; Coester was the R
  nominee).
- **Top-two same-party races**: 32 rows (CA/WA 2016–2024) listed only the winner with the
  runner-up column blank, producing absurd margins (e.g. CA-17 2016 margin -61.01 for
  Khanna vs Honda). Added runner-ups with party overrides and recomputed margins/vote_margins
  from Wikipedia state-year page results tables (exact votes). Full list: CA-17/29/32/34/37/44/46
  + WA-04/07 (2016); CA-06/08/27/44 + WA-09 (2018); CA-12/18/29/34/38/44/53 + WA-10 (2020);
  CA-15/16/29/30/34/37 (2022); CA-20/34 + WA-04/09 (2024).
- **Third-party markers**: 53 candidates carried markers build.js can't parse — (L), (G),
  (Con), (NPP), etc. — causing them to render under the default column party (D or R).
  Converted all to "(I)" (the only supported non-major party code). Party detail preserved in
  this log/git history.
- **Curly apostrophes**: 14 occurrences (e.g. "O'Rourke") normalized to straight quotes.

### house_past_results.csv — full-file verification (all 2,175 rows, 2016–2024)

Built an automated comparator against all 250 Wikipedia state-year House election pages
(wikitext parsed locally; results tables extracted per district). Final state: **2,097 rows
verify exactly**; the remaining 78 are documented conventions/parser artifacts (below).
Corrections beyond the targeted fixes above:

- **NY (all 26 districts × 5 cycles, ~125 rows)**: CSV systematically used major-party-line
  votes only, omitting fusion lines (Conservative/WFP/Independence). Adopted certified
  all-lines candidate totals from Wikipedia results tables; pcts recomputed as
  votes/table-total; margins/vote_margins recomputed. (Same error class as NY Senate 2016,
  fixed earlier.)
- **CT (2016–2024, ~20 rows)** and **SC 2016 (5 rows)**: same fusion-line issue; same fix.
- **NY-17 2020**: dem votes 183,975 → 197,354 (certified), rep name "Maureen
  McArdle-Schulman" → "Maureen McArdle Schulman"; margins recomputed.
- **Certified-count adoption** (CSV had pre-certification counts; wiki cites state canvass,
  e.g. TX SOS results.texas-election.com accessed Jan 2025): OH-08 2016 (dem was 1 vote/0% —
  actual Steven Fought 87,794/26.97%), OH-04 2018, ID-01 2018, TX-36 2020, VA-01 2020,
  GA-07 2022, TX-14 2022, TX-07/10/12/19/28/29/31/33/35/36 2024, WI-08 2024.
- **LA jungle-primary rows** replaced with decisive-round (runoff) results, consistent with
  LA Senate/Governor handling: LA-03 2016 (was Hebert 19.71 vs "Gus Rantz" 17.82 — actual
  runoff Higgins (R) 56.11 vs Angelle (R) 43.89), LA-04 2016 (was "Trey Baucum"/Jones-3-votes
  garbage — actual runoff Mike Johnson 65.23 vs Marshall Jones 34.77), LA-05 2020 (was
  Christophe 32.62 vs "Scotty Robinson" 15.33 — actual runoff Letlow 62.02 vs Harris (R) 37.98).
- **Name fixes**: Hank Johnson Jr.→Hank Johnson, Madeleine Dean Cunnane→Madeleine Dean,
  Monica De La Cruz-Hernandez→Monica De La Cruz, Michael Turner→Mike Turner, Vincent
  Caveleri→Cavaleri, Lynnette GreyBull→Lynnette Grey Bull, Irene Armendariz Jackson→
  Armendariz-Jackson, Sydney Kamlager→Sydney Kamlager-Dove, Antonio Daza→Daza-Fernandez,
  Gerhard Gressman→Gressmann.

**Accepted conventions (not changed, verified intentional):**
- AK-01 2022/2024 and ME-02 2018/2022 use the final RCV round (validated manually).
- Unopposed races where the state records no votes (OK-03 2024, FL-20 2024, FL uncontested
  2016–2020) carry 100%/0 votes; TX-25/31 2022 unopposed with recorded votes carry 100%.
- total_votes = sum of listed candidates; Wikipedia "Total" rows sometimes add blanks/
  scattered (MA/WI/VT/VA/GA rows) — CSV left internally consistent.
- CSV names that are correct despite wiki variants: Kimberlin Brown Pelzer (campaign name),
  Marc Friedenberg (wiki typo "Friedenburg"), Alfeia Goodwin, Charlotte Bergmann.

### house_del_history.csv — all 250 rows

Checked seat counts against national year-page tables + winners computed from the verified
district file, and party vote totals against sums of verified district rows. Corrections:

- **Maine 2024**: seats D0/R2 → D2/R0 (Pingree and Golden both won); total_votes
  1,234,099 → 817,126 (sum of district totals; pcts were already computed on the correct base).
- **New York 2016**: seats D1/R22 → D18/R9. **New York 2018**: D24/R3 → D21/R6.
  **New York 2022**: D18/R8 → D15/R11.
- **Washington 2018**: rep_votes 899,744 → 1,048,712 (sum of verified district results);
  rep_pct 29.77 → 34.7; margin -32.73 → -27.8.

Accepted conventions: LA rows aggregate all candidates per party across jungle primaries
(differs from district file's decisive-round convention); NC 2018 excludes the invalidated
NC-09 race; NY/CT/SC vote totals follow the House Clerk's party-line convention.
Unverified (minor): CA 2024 rep_votes 5,928,084 vs district sum 6,056,977 (~2%) — likely a
CA SOS rollup difference; left as-is.

### house_past_results.csv — IA-02 2020

Tie-display fix: both pcts were 49.91 with margin 0 (6-vote race). Set 49.910/49.912,
margin 0.002, so Miller-Meeks correctly reads as the winner.

### house_statewide_results.csv (4,167 rows)

Internal scan: 348 margin-column flags are 0.1 rounding artifacts — build.js does not read
the margin or total_votes columns of this file (output carries only pcts + D/R votes), so
these are cosmetic; left as-is. CA 2018 Governor rows carried totals 2–17 votes below
dem+rep (immaterial, column unused).

Aggregate validation (sum of district-level entries vs verified statewide results, 474
race-groups): all pass except —
- **CT 2022 Senate & Governor (10 rows)**: vote counts were ~33% below certified levels
  (correct two-party shares, partial-count source). Blanked dem/rep/total vote columns;
  percentages retained.
- **NY 2024 Senate (26 rows)**: UNVERIFIED/SUSPECT — district sums give R 3,435,349 vs
  certified statewide R 3,246,114 and skew ~4pp too Republican (e.g. NY-01 Gillibrand 40.3%
  where she should run ahead of Harris's ~41%). Could not locate a primary source for
  senate-by-CD; left unchanged, recommend re-pulling from Daily Kos/DRA.
- GA 2022 Senate district data = November general while statewide row = runoff (both
  correct); LA rows = jungle-primary party aggregates; NJ 2024 Senate sums within 1.6%
  (data vintage) — all left as-is.

### senate_past_results.csv — NY follow-ups

- **NY 2022**: row already had all-lines candidate votes but ballots-cast total; total_votes
  5,965,684 → 5,852,707 (Wikipedia table total).
- **NY 2018**: total 6,250,886 → 6,055,151. **NY 2024**: total 8,380,426 → 8,010,317.
  **NY 2012**: total 7,116,628 → 6,679,678. (Candidate votes verified all-lines certified.)

### state_leg.csv (472 rows — lower priority per scope)

- **Montana House 2020**: dem_pct+rep_pct summed to 102.1 (42.8+59.3). Recomputed from the
  vote counts: 41.9/58.1, margin 16.2, total 570,553 → 582,554 (two-party sum).
- Six "Estimate" rows (GA Senate 2024/2020/2018, IL Senate 2024, IA Senate 2018, OH Senate
  2016) had rounded totals slightly below dem+rep; set total = dem+rep.
- 113 margin-column flags are 0.1-rounding artifacts — build.js does not read this file's
  margin column; left as-is.
- Seat counts spot-verified for a dozen recent chambers (PA 102–101, MI flips, VA 2025 64–36,
  WI, TX, FL, NE) — all correct. Note: Nebraska's nonpartisan unicameral is stored under
  type "House" with members' party affiliations — intentional design, not an error.

**Remaining pending total_votes normalization** (senate rows whose total_votes is total
ballots cast rather than the candidate-sum denominator; candidate votes and pcts verified
correct, and totalVotes is not rendered anywhere in the UI, so this is cosmetic):
HI 2022/2018/2016/2014/2012, MA 2020/2018/2014, ME 2014, VT 2022/2016, IA 2022/2020.
NY (all years) and WY/ME/VT others were fixed above.

MA 2024 note (resolved): CSV Warren 2,041,693/Deaton 1,365,445 vs one Wikipedia render
showing 2,041,668/1,365,440 — 25-vote variance, below materiality; pcts identical. Left as-is.

**Reviewer note on diff size**: house_past_results.csv and house_statewide_results.csv were
rewritten by audit scripts, which normalized CRLF line endings to LF — git shows every line
changed, but non-listed rows are content-identical (verified by field-level diff).

## Final state

`node data-entry/build.js` runs clean after every change. Final internal-consistency scan:
573 remaining flags, all accounted for as (a) margin-column rounding in columns build.js
does not read (house_statewide, state_leg), (b) legitimate third-party/RCV/jungle vote gaps,
(c) the cosmetic ballots-cast totals listed above, (d) documented aggregate conventions
(LA jungle party totals, NC-09 2018 exclusion, Clerk line-vote convention for fusion states).

## data/county_presidential_results_2008_2024.csv — 2016 column (2026-08-14)

Discovered while cross-checking summed county results against `pop_vote.csv`'s national
Popular Vote totals (see [[project-data-audit]] for that comparison thread). This file's
2016 column came from the `tonmcg/US_County_Level_Election_Results_08-24` compilation,
whose README documents 2016 as scraped from Townhall.com election-night reporting —
uncertified. Verified against this project's own certified `presPastResults` state totals:
near-universal ~1-2% undercount everywhere, plus much larger gaps in slow-counting states
(CA -32%, UT -25%, AZ -20%, WA -17%, MD -11%, NY -9%, plus NJ/OH/PA/OR/VA/CO/IL at 4-8%).
2008/2012/2020/2024 in the same file are unaffected.

Replaced dem_2016/gop_2016/oth_2016/total_2016 for all 3,112 counties (AK + Kalawao County,
HI remain blank, as with every other year) using MIT Election Data & Science Lab's
`countypres_2000-2016.csv`, saved to `data-entry/medsl/president_2000-2016_county.csv`
(codebook and full fix writeup: `president_2000-2016_county_codebook.md` /
`president_2000-2016_county_notes.md` in the same folder). Two FIPS remaps were needed:
Shannon County, SD → Oglala Lakota County (46113 → 46102, 2015 rename) and Kansas City, MO
folded into Jackson County (36000 → 29095, matching how every other year in this file
already handles KC). `countyPresidentialData.ts` regenerated via
`scripts/generate-county-pres-data.py`.

Post-fix validation against `presPastResults`: every state matches certified dem/rep totals
exactly except ME (-3,017 dem/-648 rep — overseas UOCAVA ballots MEDSL reports statewide,
not by county) and NY (-8,562 dem/-4,945 rep, ~0.2% — likely fusion-line aggregation), both
consistent with gaps already accepted elsewhere in this project. National county-summed 2016
President margin moved from -0.56 to -2.26 (two-party), now within 0.03 points of
`pop_vote.csv`'s -2.23, down from a 1.67-point gap.

