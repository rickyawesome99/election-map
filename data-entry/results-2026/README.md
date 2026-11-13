# 2026 official results (first run)

Vote counts for every 2026 general-election race for U.S. Senate, governor, U.S. House, state house
and state senate, by candidate, statewide and by county, and by precinct where the state publishes
precincts. Nothing on the site reads these files yet.

```
npm run results-2026        # fetch.py (raw downloads, ~5 min) then build.py (~20 s)
```

Re-run only when asked: counts keep changing until certification, and each run overwrites the files.

## Where the counts come from

Like Call the Map (callthemap.com/results/sources): every count is an official count. A state marked
`direct` in `sources.csv` is read from its election office's own export. Every other state, and any
race a direct file lacks, comes from [civicAPI](https://civicapi.org), which gathers the states' and
counties' official counts. The NYT/AP state-leg snapshot (`../results_2026_state_leg.csv`)
supplies the roster of expected races and a check column.

**One exception (user's call, 2026-11-12): AP fill-in.** A state-leg race that no official source
has, or that the official feed has at 0 votes while AP has a count, takes AP's counts from that
snapshot. These rows are NOT official counts. They have `source_kind` = `ap`, source
"AP via NYT (unofficial)", the `unofficial_ap` flag, AP's call as `called_winner`, statewide
figures only, and the snapshot time (2026-11-12 05:56Z) as `fetched_at`. The first run filled 756
races: AK 50, DE 52, MA 200, NH 227, VT 125 (no official source read), KY 61 and MI 39 (civicAPI at
0, also flagged `official_count_zero`), AR HD-8 special, LA HD-92 special. Replace them as each
state's own file is read. An official count with votes always wins.

| Adapter | States | Levels |
|---|---|---|
| `enhanced_voting` | AZ, GA, ID, WA (UT: county only) | state, county, precinct |
| `ncsbe` | NC | precinct (summed up) |
| `mn_sos` | MN | precinct (summed up) |
| `hi_oe` | HI | precinct (summed up; county from the House district) |
| `results_export` | MT | state, county |
| `civicapi` | the other 41 states | state, county |
| AP fill-in (unofficial) | state legislatures of AK, DE, MA, NH, VT; KY/MI zeros | state only |

`sources.csv` also lists the direct sources not read yet (from Call the Map's page) with their URLs.

## Files

| File | One row per |
|---|---|
| `races.csv` | race: party totals, percentages, margin, leader, call, source, checks, flags |
| `candidates.csv` | race × candidate, statewide |
| `counties.csv` | race × county × candidate |
| `precincts/ST.csv.gz` | race × precinct × candidate (direct precinct states) |
| `county_senate_results_2026.csv`, `county_senate_special_results_2026.csv`, `county_governor_results_2026.csv`, `county_house_results_2026.csv`, `house_district_county_results_2026.csv` | the same county figures in the layout of the past-year files in `data-entry/` |
| `coverage.csv` | state × office: races expected, found, missing, source (AP fill-in shows as its own source), levels, largest check gap |
| `build_log.txt` | unmatched counties, skipped feed races, the largest check differences |

Keys: `office` (`senate`, `governor`, `house`, `state_house`, `state_senate`), `state`, `seat`, `special`.
House `seat` is the district number (at-large = 1). State-leg `seat` is the district as the state
numbers it, letter suffix kept (`34A`), with separately filed positions as `-P1`/`-P2` (WA).
Nebraska's unicameral is `state_senate`. `race_id` matches `../results_2026_seats.csv` for federal
and governor races, and is `ST-H-seat` / `ST-S-seat` (`-SP` for a special) for state-leg races.

`races.csv` columns follow `../house_past_results.csv`: `dem_votes` / `rep_votes` are party
totals (all candidates of that party, so a multi-member race sums its slate). `oth_votes` includes
write-ins. Percentages are of all candidate votes. `margin` is R−D in points, and `vote_margin` is
R−D in votes. `leader` is the top vote-getter(s), and `called_winner` is civicAPI's call (or AP's
for seats that weren't on the ballot). `contest` is `contested`, `uncontested`, `same_party` or
`not_on_ballot`. `not_on_ballot` marks an unopposed seat that FL, OK and AR don't print, or that
HI settled in its primary. Those rows have no counts, just AP's name.
In the AP-filled chambers, unopposed races that AP doesn't count are at 0 votes, flagged
`ap_no_count` (DE 21, MA 143, NH 32, VT 45). Those states do count them; the official file will.

## Checks and flags

- `check_civicapi_*`: a direct source's total against civicAPI's for the same race.
- `check_ap_*`: the state-leg total against AP's snapshot of 2026-11-12 05:56Z. Positive gaps
  are mostly later counting (CA, OR, MD, UT, WA).
- `flags`:
  - `zero_votes`: the source has the race at 0.
  - `behind_ap`: more than 1% under AP.
  - `county_sum_off(±x%)`: county rows don't add up to the topline.
  - `no_counties`: the topline has votes but no county rows.
  - `feed_counties_all_zero`: civicAPI sent counties at 0, so they were dropped.
  - `precincts_incomplete`: precinct rows cover under 99% of the vote.
  - `differs_from_civicapi`
  - `unofficial_ap`: counts are AP's, not an official source's.
  - `official_count_zero`: the official feed had the race at 0, so AP's counts were used.
  - `ap_no_count`: an unopposed race in an AP-filled chamber that AP didn't count.

## Known gaps (2026-11-12 run)

- **No official source read yet for state legislatures in AK, DE, MA, NH, VT** (civicAPI has
  none; MA's electionstats has only specials so far; NH 403s scripts; AK's results files 404).
  These are AP fill-in for now (see above). Their federal and governor races are official, from civicAPI.
- **civicAPI state-leg counts at 0** in KY (61 races) and MI (39 races), now AP fill-in. They
  need the states' own files.
- AP's DE HD-11 total is 2 votes over its own candidate list. We use the candidate sum.
- civicAPI behind AP in parts of ME and NY (Long Island) state-leg races, and TX SD-22.
- civicAPI county rows short for IN-02 (−40%), OK-02 (−5%), SD (−0.7%). The toplines are right.
  State-leg county rows are missing where civicAPI sends counties at 0 (WI, MO, OK, TN, IL, AL, WY).
- WA precincts: King County's are blank in the state file, and Snohomish and Pierce are partial, so 50
  WA races carry `precincts_incomplete`. WA's county figures are complete.
- AK reports the 2019 census areas Chugach (02063) and Copper River (02066), not Valdez-Cordova
  (02261) as in the past-year files.
- SD and OR run MT's export platform, but SD's postback returns the page, and OR's export is
  statewide XML with no counties, so both stay on civicAPI.
