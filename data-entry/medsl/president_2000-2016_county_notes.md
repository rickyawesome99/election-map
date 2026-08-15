# Notes: 2016 county presidential data fix (2026-08-14)

Source: `president_2000-2016_county.csv` = MIT Election Data & Science Lab's
`countypres_2000-2016.csv` (github.com/MEDSL/county-returns, DOI 10.7910/DVN/VOQCHQ).
See `president_2000-2016_county_codebook.md` for the column reference.

## Why this file exists

`data/county_presidential_results_2008_2024.csv`'s 2016 column came from the
`tonmcg/US_County_Level_Election_Results_08-24` compilation, whose README documents 2016 as
"scraped from Townhall.com" — an election-night, uncertified snapshot. That produced a
near-universal ~1-2% undercount plus much larger gaps in slow-counting states: CA -32%,
UT -25%, AZ -20%, WA -17%, MD -11%, NY -9%, plus NJ/OH/PA/OR/VA/CO/IL in the 4-8% range
(verified against this project's own certified `presPastResults` state totals in
forecastData.ts). 2008/2012/2020/2024 in that same file are not affected — only 2016.

## Fix applied

`data/county_presidential_results_2008_2024.csv`'s dem_2016/gop_2016/oth_2016/total_2016
columns were replaced with this MEDSL file's county sums (total_2016 recomputed as
dem+gop+oth, matching the convention already used by every other year-column in that file).
Two FIPS remaps were required to align MEDSL's codes with this project's county keys
(which match `public/us-counties.json`):

- **46113 -> 46102**: Shannon County, SD was renamed Oglala Lakota County with a new FIPS
  code in 2015; MEDSL's 2016 file still uses the old code.
- **36000 -> 29095**: MEDSL reports Kansas City, MO as its own pseudo-county (FIPS 36000)
  separate from Jackson County. Every other year in `county_presidential_results_2008_2024.csv`
  folds KC into Jackson County (confirmed by trend: Jackson County totals ~301k-333k across
  2012/2016/2020 once KC is included, vs. an anomalous ~173k for 2016 standalone) - folded
  in to match.

Rows with FIPS = "NA" (state-level "statewide writein"/UOCAVA overseas-ballot buckets not
attributable to any county - CT, ME, AK) were dropped, same as this project's existing
convention of not backfilling county-unattributable votes.

## Validation

Post-fix, summed by state and checked against `presPastResults`: every state matches its
certified dem/rep totals exactly except ME (-3,017 dem/-648 rep, the dropped UOCAVA rows)
and NY (-8,562 dem/-4,945 rep, ~0.2%, likely fusion-line aggregation) - both accepted as
known small gaps consistent with this project's existing conventions elsewhere. A handful of
states (AZ, IL, MA, PA, WA, RI, WI) have exact dem/rep matches but a small total/other-party
mismatch (MEDSL's per-county "Other" bucket doesn't always sum to the certified write-in
total) - doesn't affect two-party margin or map coloring.

National result: county-summed 2016 President margin moved from -0.56 (R-leaning) to -2.26
(D-leaning) two-party, now matching `data-entry/pop_vote.csv`'s -2.23 to within 0.03 points,
down from a 1.67-point gap.
