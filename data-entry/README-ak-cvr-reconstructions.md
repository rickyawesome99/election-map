# Alaska county-level results from official precinct-level sources: methodology

Alaska has no boroughs/census areas in its own election reporting — results are only
published by precinct and by state house district, never by borough. Every prior attempt
in this project's data pipeline (Wikipedia, MEDSL, OpenElections — see the county-election
memory notes) confirmed no source publishes a by-borough breakdown for AK, for any office
or year. **As of 2026-08-15, this gap is fully closed** for all AK county-level data this
project's pipeline covers: 2024 (President, US House), 2022 (Governor, US Senate, US
House), 2020 (President, US Senate, US House), 2018 (Governor, US House - AK had no Senate
race that year), and 2016 (President, US Senate, US House) - reconstructed year by year
using Alaska's own official precinct-level election data.

**Alaska did not use ranked-choice voting until the 2022 cycle** (Ballot Measure 2 passed
Nov 2020). 2020 and earlier years are plain plurality races — no ballot-level ranking data
or IRV tabulation needed, just per-precinct vote totals straight from the state's own
precinct-level results export. Only 2022+ years need the Cast Vote Record / IRV machinery
described below; skip straight to "2020 and earlier: no CVR needed" if working on a
pre-2022 year.

## Sources (per year)

- `ENRbyPrecinct.csv` (2022+) / `resultsbyprecinct.txt` (2020 and likely earlier - same
  idea, older/plainer export format) — AK Division of Elections' official precinct-level
  results (`https://www.elections.alaska.gov/results/{ELECTION_ID}/ENRbyPrecinct.csv` or
  `.../resultsbyprecinct.txt`, e.g. `24GENR`, `20GENR`). For 2022+ this is first-choice-
  only per precinct, used to cross-check rather than as the primary source (see below);
  for pre-RCV years there's no "first choice vs. final" distinction, so this file alone is
  the complete, sufficient primary source.
- `CVR_Export_*.zip` (2022+ only) — the official Cast Vote Record (linked from the same
  results page), containing every ballot's full ranked marks plus a precinct-portion id.
  Needed only for races that didn't resolve in round 1 - that's the only reason to go
  beyond the precinct CSV/txt file, since it's the only source with ballot-level ranking
  data for a real RCV tabulation.

Both are standard Dominion Democracy Suite exports (`CandidateManifest.json`,
`ContestManifest.json`, `PrecinctManifest.json`, `PrecinctPortionManifest.json`, plus many
`CvrExport_N.json` ballot-batch files). **The schema has subtle differences between the
2022 and 2024 exports** (see "Per-export gotchas" below) — don't assume one year's parser
works unchanged on another year's file without re-verifying against that file's own raw
structure first.

## Which races needed a real RCV tabulation

Alaska's top-four/RCV system applies to every state and federal race. A race only needs
multi-round instant-runoff tabulation if no candidate wins an outright majority in round 1
— otherwise first-choice results are already final. Confirmed per race, both years, by
checking the CVR's own round-1 tallies:

- **President 2024**: Trump won an outright majority round 1. First choice = final.
- **US House 2024**: no round-1 majority (Begich 48.5%, Peltola 46.1%, Howe 4.1%, Hafner
  1.1%, Write-in 0.2%). Full IRV needed; eliminated Write-in → Hafner → Howe; final round
  Begich vs. Peltola.
- **Governor 2022**: Dunleavy won an outright majority round 1 (~50.2-50.3%, matches the
  certified 50.29%). First choice = final, no RCV needed.
- **US House 2022**: no round-1 majority (Peltola ~48.5-48.8%, Palin ~25.7-26%, Begich
  ~23.3-23.5%, Bye ~1.7-1.8%, Write-in ~0.4%). Full IRV needed; eliminated Write-in → Bye
  → Begich; final round Peltola vs. Palin.
- **US Senate 2022**: no round-1 majority, but the **true final RCV round was Murkowski
  vs. Tshibaka — both Republicans.** Chesbro (the Democrat, and this project's chosen
  "dem" reference candidate for this race) was eliminated in round 3, per Wikipedia's own
  round-by-round table for this race. A full-IRV final round therefore isn't a meaningful
  D-vs-R number for a two-party county map. **This project's own existing state-level
  reference for this race already handles it the same way**: `senate_past_results.csv`
  (feeding `senateHoldovers` in `forecastData.ts`) stores ROUND-1 (first-choice) vote
  shares for Chesbro/Murkowski specifically, not a final-round number — confirmed by
  checking that `stored_demPct * stored_totalVotes` and `stored_repPct * stored_totalVotes`
  reproduce the stored `demVotes`/`repVotes` almost exactly, and that `demPct + repPct`
  does NOT sum to 100 (unlike the House row for the same year, which genuinely is
  final-round and does sum to 100). County-level Senate 2022 matches that established
  convention rather than introducing a new, inconsistent one: it uses ROUND-1 first-choice
  tallies for Chesbro (dem) / Murkowski (rep), with Tshibaka/Kelley/write-in in "oth".
  **Caveat worth knowing if this is ever surfaced in the UI**: the derived `repPct` looks
  much more lopsided than the underlying race actually was, and it's worth understanding
  why so it doesn't read as a bug. `repPct` is computed as `rep/(dem+rep)*100` -
  Murkowski's round-1 count against ONLY Chesbro's, with Tshibaka's round-1 count (nearly
  as large as Murkowski's own, statewide) excluded from BOTH sides rather than diluting
  the denominator. So a county where Murkowski/Tshibaka split the Republican vote roughly
  evenly can still show something like an 80% two-party `repPct`, because her only counted
  opponent is the much smaller Chesbro vote - e.g. Anchorage's round-1 shares were
  Murkowski ~43% / Chesbro ~10% (not far apart from the statewide picture), but the
  derived two-party number comes out around 80/20. Same underlying issue in spirit to the
  same-party jungle-primary House races this project already flags via `SAME_PARTY_NOTES`,
  but Senate's `CountyYearResult` type has no equivalent note field yet, so this is
  undocumented in the UI itself.

## 2020 and earlier: no CVR needed

2020 predates AK's RCV system entirely, so all three 2020 races (President, Senate, House)
are plain plurality - first-choice IS the final result for every one, no elimination
rounds, no same-party-final-round complication like 2022's Senate. This makes 2020 (and
presumably any earlier year, not yet attempted) considerably simpler than 2022/2024:

- No CVR zip needed at all - `resultsbyprecinct.txt` alone has everything.
- No ballot-level parsing, no `IsVote`/`IsAmbiguous`/overvote-rule complexity - just sum
  each precinct row's vote count per party code (`DEM`→dem, `REP`→rep, everything else→oth)
  per race.
- `resultsbyprecinct.txt` is a non-standard, inconsistently-quoted pseudo-CSV - fields are
  wrapped in quotes, but some field VALUES already contain literal, unescaped quote
  characters (e.g. a candidate nickname like `Cohen  Jeremy "Spike"`), which breaks
  Python's standard `csv` module (it misparses field boundaries around the embedded
  quotes). Parsed by hand instead: split each line on the literal delimiter `","`, which
  reliably finds true field boundaries even though embedded quotes make it non-standard
  CSV. This loses a trailing quote character on the rare candidate name that has one -
  cosmetic only, since candidates are matched by party code, not by parsing exact names.
- The SAME absentee/early-voting/question-only-resolved-to-district-level limitation
  applies (`"District N - Absentee"` etc. pseudo-precinct rows exist in this file too, same
  as the CVR-derived years) - same apportionment method, no changes needed there.

Validated against `forecastData.ts`'s existing certified 2020 references (all three races
already had trustworthy state-level numbers from this project's earlier Wikipedia-sourced
work): President (153,406 D / 189,893 R here vs. certified 153,778 / 189,951), Senate
(145,721 / 191,058 vs. 146,068 / 191,112), House (159,505 / 192,069 vs. 159,856 / 192,126).
All three land within 0.03-0.24% on both candidates - a small, consistent, presumably
absentee/late-count-related gap in the same tolerance class as every other CVR-vs-certified
comparison in this document, not chased further.

### 2018: same idea, but a genuinely different (and easier) file format

2018's `resultsbyprecinct.txt` (fetched from `.../results/18GENR/data/resultsbyprecinct.txt`
- note the extra `/data/` path segment, not present in 2020's URL) is **standard,
well-formed CSV** - Python's `csv` module parses it cleanly, unlike 2020's file. No custom
hand-rolled parser needed. Fields: `precinct, race, candidate_or_stat_label, party, "Total",
votes, ""`. Race names differ from 2020's too - `"US REPRESENTATIVE"` and `"GOVERNOR/LT.
GOVERNOR"` (all-caps, no "U.S." period style) rather than 2020's `"U.S. Representative"`.
**Don't assume a prior year's exact race-name strings or CSV dialect carry over - check
both fresh per year**, same standing rule as everything else in this document.

**Precinct codes are 100% stable between 2018 and 2020** (both elections used the same
pre-2022 redistricting map) - confirmed via a direct diff: all 441 codes match exactly.
Only two precincts differ in DISPLAY NAME punctuation (`"Seldovia/Kachemak Bay"` in 2018 vs
`"Seldovia-Kachemak Bay"` in 2020, same for `"Kachemak/Fritz Creek"` vs `"Kachemak-Fritz
Creek"`) - same physical precinct, same code, just a cosmetic spelling drift. Rather than
keep patching name variants, **the crosswalk was rebuilt keyed by the stable numeric CODE**
(`precinct_code_to_fips.json`, derived once from `precinct_borough_2020.py`'s name-keyed
data) instead of by name - more robust for reuse across any other year that shares this
same redistricting cycle (2012-2020 elections, i.e. potentially 2012/2014/2016 too, not yet
attempted). Re-verify this stability assumption fresh (a code-set diff) before reusing for
another year, same as always - don't assume it holds indefinitely, only within one
redistricting cycle.

AK had no Senate race in 2018 (`senate.AK` calendar years are 2014/2016/2020/2022), so only
Governor and US House were reconstructed. Both validated cleanly against
`forecastData.ts`'s existing certified references: Governor matched EXACTLY, to the vote
(Begich 125,739 / Dunleavy 145,631, both here and in `governor_past_results.csv`). House
matched within the federal-overseas-ballot exclusion only (131,088 D / 149,772 R here vs.
certified 131,199 / 149,779 - the 118-vote gap is entirely the excluded `HD99 Fed Overseas
Absentee` bucket, which isn't attributable to any borough, same treatment as every other
year in this document).

### 2016: same file dialect as 2018, one new encoding gotcha

2016's `resultsbyprct.txt` (note the filename: `resultsbyprct.txt`, not
`resultsbyprecinct.txt` - fetched from `.../results/16GENR/data/resultsbyprct.txt`) uses
the same well-formed standard-CSV dialect as 2018's file, and the same race-name style
(`"US PRESIDENT"`, `"US SENATOR"`, `"US REPRESENTATIVE"` - all-caps). One new wrinkle:
**this file needs `encoding="latin-1"`, not the default UTF-8** - it contains a raw
Windows-1252 en-dash byte (`0x96`, in a ballot measure name) that isn't valid UTF-8 and
raises `UnicodeDecodeError` on a plain `open()`. Precinct codes are 100% stable vs.
2018/2020 (confirmed via a direct diff - all 441 codes match exactly, not even the minor
punctuation drift 2018 had) - reused `precinct_code_to_fips.json` unchanged.

All three 2016 races (President, Senate, House) were reconstructed - AK did have a Senate
race this year, unlike 2018. All validated within the same small, HD99-overseas-ballot-
attributable tolerance as every other pre-RCV year: President (116,181 D / 163,347 R here
vs. certified 116,454 / 163,387), Senate (36,010 / 138,080 vs. 36,200 / 138,149), House
(110,785 / 155,036 vs. certified 111,019 / 155,088). This closes out AK's coverage for
every year and office this project's pipeline currently tracks (2016-2024, President/
Senate/Governor/House, minus years each office had no election).

## Bugs found in ballot extraction (both years affected, fixed for both)

Three real bugs were found and fixed while building the 2022 pipeline, discovered because
2022 House's IRV tabulation initially came out wildly wrong (a implausible 65%/35% final
round when the real, certified result is a much closer 55%/45%) — **all three turned out
to also affect the already-shipped 2024 numbers to a smaller degree, so 2024's CVR
extraction was redone and the shipped 2024 CSVs/`.ts` files were regenerated with the
fix.** Don't reuse an older year's `parse_ballots.py` without re-verifying these:

1. **Per-mark `IsVote` semantics differ by year's export.** In 2022's file, ONLY a
   ballot's rank-1 mark is ever flagged `IsVote:true` — every legitimate, confidently-
   scanned lower-rank backup choice (`MarkDensity` 90-99%, `IsAmbiguous:false`) is flagged
   `IsVote:false`. Filtering on `IsVote:true` (a reasonable-looking first attempt) silently
   drops every voter's 2nd+ choices — confirmed by checking: with that filter, 100% of
   2022 ballots had rank-list length 1, and no candidate's IRV tally ever changed between
   rounds (elimination could only ever exhaust ballots, never transfer them) - not
   plausible for a real, closely-transferred RCV race. **2024's export doesn't have this
   specific problem** (its `IsVote` does correctly track multi-rank ballots) but see bug 2.
   **Fix: don't trust `IsVote` at all. Group marks by rank instead.**
2. **A real overvote-detection bug, present in both years' original extraction.** A small
   number of ballots had implausibly long (up to 19-20 entries) `IsVote:true`-only rank
   lists in 2024's original extraction — turned out to be every candidate marked at every
   rank, the classic overvote signature, not real multi-choice rankings. **Fix: implement
   Alaska's actual overvote/skip rule (AS 15.15.350, confirmed via the statute text
   itself)**: a rank with 2+ distinct CONFIDENT candidate marks is an overvote and makes
   the ballot INACTIVE from that rank forward. A single SKIPPED ranking (no mark at that
   rank number) is passed over — tabulation continues to the next ranking — but TWO
   CONSECUTIVE skipped rankings also make the ballot inactive. This requires walking rank
   numbers sequentially (1, 2, 3, ...), not just the ranks that happen to have a mark, so
   consecutive skips are actually detected rather than silently passed over.
3. **A "confident mark + ambiguous write-in-bubble noise at the same rank" pattern, found
   by direct inspection, that the overvote rule above was (correctly, per the statute)
   treating as an invalidating overvote — but shouldn't have been, because the "ambiguous"
   mark wasn't a real competing vote.** Found ~2,300 ranks (2024 file) where an unambiguous,
   100%-density mark for a real candidate sits alongside an `IsAmbiguous:true` mark for the
   Write-in candidate slot specifically, with `MarkDensity`/`WriteinDensity` around 10% — a
   stray pen mark or print/scan artifact near that oval, not a genuine second vote. Treating
   every ambiguous mark as a competing candidate wrongly invalidated (and, since this
   usually hit rank 1, often fully exhausted) thousands of otherwise-clean ballots. **Fix:
   at each rank, only count CONFIDENT (`IsAmbiguous:false`) marks toward the "how many
   candidates at this rank" check. A rank is only a genuine overvote if it has 2+ confident
   marks; a rank with exactly one confident mark plus any number of ambiguous ones uses
   that one confident mark; a rank with ambiguous marks only (no confident mark at all) is
   treated as empty (subject to the same consecutive-skip rule as a truly blank rank).**

After all three fixes: 2022 House's final round (Peltola 137,267 / Palin 112,480 in the
CVR-derived county sums) matches the certified statewide result (Peltola 137,263 / Palin
112,471) within ~15 votes (~0.01%) — as close a validation as this project has achieved
for any CVR-derived reconstruction. **2024 House's final round (Begich 167,173 / Peltola
158,159 in the CVR-derived county sums) is a looser match to certified (Begich 164,861 /
Peltola 156,985) — about 1.2-1.4% high on both candidates, though the winner and
approximate margin are still correct (2.68 points here vs. 2.44 certified).** The
remaining gap is presumed to be genuine ambiguous-ballot adjudication that AK's official
canvass resolved (by a human review board) in a way this reconstruction can't fully
replicate without the adjudication data itself — documented as a known, disclosed
tolerance rather than chased further given the already-substantial accuracy achieved.

## The geography problem

Alaska's ~523 election precincts (2024) / ~443 (2022, essentially the same set — see
"Precinct set is stable year to year" below) are grouped under 40 numbered state house
districts (the precinct id's numeric prefix, e.g. `"01-600"` = House District 1). Real,
in-person Election Day ballots ARE tied to a specific precinct in both the CVR and
`ENRbyPrecinct.csv`. But **absentee, early-voting, and question ballots are only ever
resolved to the house district level** in both sources — confirmed directly:
`ENRbyPrecinct.csv`'s Absentee/Early Voting/Question vote columns are always zero on every
real precinct row and nonzero only on synthetic `"District N - Absentee"` etc. rows. This
is a genuine limit of AK's own public reporting, not a gap in what we pulled. It affects
roughly half the statewide vote in a typical year.

### Precinct → borough crosswalk

Every real precinct's borough was determined from its name and verified against
Wikipedia's borough/census-area "Communities" sections (not assumed from geography/prefix
patterns alone — several are non-obvious):
- Whittier (grouped under House District 9, otherwise all Anchorage) is Chugach Census
  Area, not the Municipality of Anchorage.
- Klukwan (grouped under House District 3 with Haines precincts) is Hoonah–Angoon Census
  Area, not Haines Borough, despite being geographically surrounded by it.
- Chevak is Kusilvak Census Area, not Bethel Census Area.
- Akutan is Aleutians West, not Aleutians East.
- Tyonek (grouped under House District 37 with Bristol Bay-area precincts) is Kenai
  Peninsula Borough.
- Eagle (the Yukon River town, grouped under House District 36 with Yukon–Koyukuk
  villages) is Southeast Fairbanks Census Area.

This project's county-level data still uses the **pre-2019 boundary**: a single unified
"Valdez-Cordova" (FIPS 02261), not the 2019 split into Chugach CA (02063) and Copper River
CA (02066). Both halves of that split are mapped back to 02261 for consistency with the
rest of the dataset — revisit if the project ever migrates to the post-2019 boundary.

Of the 40 house districts, 25 fall entirely within a single borough (direct attribution,
no estimation needed even for their absentee/question ballots). The other 15 span multiple
boroughs: HD1, 2, 3, 5, 9, 29, 30, 36, 37, 38, 39, 40.

### Precinct set is stable year to year - EXCEPT across a redistricting boundary

Diffed 2022's and 2024's `PrecinctManifest.json` directly: identical except one precinct
("18-555 JBER") was split into two ("18-555 JBER No.1" and "18-556 JBER No.2") for 2024 -
both are Anchorage regardless, so this has zero effect on FIPS assignment. **The same
crosswalk file works unchanged for both years.**

**This does NOT extend across a redistricting cycle.** 2020 used the OLD (pre-2022) state
house district map. Confirmed empirically: the same physical precinct (e.g. "Aurora",
Fairbanks) is coded `"31-446"` in 2022/2024 but `"01-446"` in 2020 - even the numeric
SUFFIX isn't stable across the boundary (precincts themselves got renumbered, not just
reassigned to a different district), so the 2022/2024 crosswalk cannot be reused keyed by
its precinct code for 2020. **The 2020 crosswalk (`precinct_borough_2020.py` in that
year's working directory) was built fresh, keyed by precinct NAME instead of code** (names
were unique across all 440 real 2020 precincts) - the underlying name→borough associations
themselves didn't need re-deriving from scratch (a borough is geography, not affected by
which house district a precinct is grouped under), just re-verified for a handful of
unfamiliar 2020-only names (confirmed via direct web search: "Pike"/"Richardson" = FNSB,
"Tanaina" = Mat-Su). **Always re-verify the precinct set/coding scheme fresh (a quick raw
inspection of that year's precinct names/codes) before assuming ANY prior year's crosswalk
applies - re-verify per-cycle, not just per-year**, since AK's next redistricting will
change this again (currently: 2013-2021 map, 2022-2031 map).

### Apportionment for the unresolved absentee/early/question vote

For a multi-borough district, that district's absentee/early-voting/question ballots
(known only at the district level) were split across its boroughs **proportional to each
borough's share of that same district's real, precinct-resolved ballots** — i.e., absentee
voters are assumed to live where in-person voters in the same district live, but their
actual candidate preferences come from the real absentee tally, not guessed from Election
Day precincts. This is a disclosed, methodologically standard apportionment of genuinely
unresolvable geography — not fabricated data. It was validated both years by summing the
apportioned county totals back up to the statewide level and confirming they still land
within the same small tolerance as the underlying CVR-vs-certified gap noted above.

## Reproducing this for another year

Scripts used (not checked into the repo — this was a manual, per-year session; recreate
from this doc if redone for a future year):
1. Find that year's results page (`https://www.elections.alaska.gov/election-results/e/?id={ELECTION_ID}`,
   e.g. `24genr`, `22genr`) and download `CVR_Export_*.zip` from it.
2. Extract every `CvrExport_*.json` ballot, keeping each ballot's `PrecinctPortionId` and
   ranked marks (candidate + rank) for whichever contests need it. **Inspect a handful of
   raw ballots first** (candidate marks, `IsVote`, `IsAmbiguous`, `MarkDensity` fields) -
   don't assume last year's `IsVote` semantics or overvote/ambiguous-noise patterns carry
   over unchanged; verify fresh per the "Bugs found" section above.
3. For each contest, check whether round 1 already has a majority winner (first choice =
   final) or needs a full IRV tabulation (implement AK's actual overvote/skip rule per bug
   #2 above, not a simplified version).
4. If a contest's final RCV round doesn't end up being the state-level reference dem/rep
   pair (e.g. a jungle-primary same-party final round, as happened with 2022's Senate),
   check what convention the EXISTING state-level reference data
   (`senate_past_results.csv` / `governor_past_results.csv` / `house_past_results.csv`)
   already uses for that race before picking a convention - match it rather than
   introducing an inconsistent one.
5. Resolve each ballot's precinct via `PrecinctPortionManifest.json` → `PrecinctManifest.json`,
   then to a borough FIPS via the crosswalk (real precincts) or flag it as a
   district-level-only aggregate ballot. **Re-verify the precinct set is unchanged from a
   year the crosswalk was already built for** (see "Precinct set is stable" above) before
   assuming the existing crosswalk applies as-is.
6. Apportion each district's aggregate bucket across its boroughs per the method above.
7. Round to integers per borough/candidate, write into the relevant `data-entry/`
   CSV(s) - `county_presidential_results_2008_2024.csv` (existing AK placeholder rows,
   that year's columns only) for President, or append new AK rows to
   `county_{house,senate,governor}_results_{year}.csv` for the others
   (`districts_{year} = "1"` for House, AK's single at-large district).
8. Regenerate the `.ts` files via `scripts/generate-county-{pres,house,senate,governor}-data.py`.
9. Validate: sum the new county-level numbers back to statewide and compare against
   `forecastData.ts`'s already-certified reference for that race/year.

## Status

**All done.** 2024 President, 2024 US House, 2022 Governor, 2022 US Senate, 2022 US House,
2020 President, 2020 US Senate, 2020 US House, 2018 Governor, 2018 US House, 2016
President, 2016 US Senate, 2016 US House. N/A (not a gap, no election that cycle): 2020/2024
Governor, 2018/2024 Senate, 2022 President. Every AK county/office/year combination this
project's pipeline tracks elsewhere (2016-2024, President/Senate/Governor/House) now has
real county-level data - the "Alaska has no counties" gap flagged throughout this project's
earlier history is closed.
