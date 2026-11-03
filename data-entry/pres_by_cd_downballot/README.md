# Presidential results by congressional district, by map (The Downballot / Daily Kos Elections)

Downloaded 2026-11-03 for the 2018–2020 House backtest expansion. Four workbooks exported from The
Downballot's public Google Sheets (linked from https://www.the-downballot.com/p/the-downballots-calculations-of-presidential):

| file | map (lines in force) | presidential years | sheet id |
|---|---|---|---|
| pres_by_cd_2012_lines.csv | 2012 and 2014 elections | 2008, 2012 | 1xn6nCNM97oFDZ4M-HQgoUT3X4paOiSDsRMSuxbaOBdg |
| pres_by_cd_2016_lines.csv | 2016 election (FL/VA/NC redrawn) | 2008, 2012, 2016 | 1VfkHtzBTP5gf4jAu8tcVQgsBJ1IDvXEHjuMqYlOgYbA |
| pres_by_cd_2018_lines.csv | 2018 election (PA redrawn) | 2008, 2012, 2016, 2020 | 1zLNAuRqPauss00HDz4XbTH2HqsCzMe0pR8QmD1K8jk8 |
| pres_by_cd_2020_lines.csv | 2020 election (NC redrawn) | 2008, 2012, 2016, 2020 | 1XbUXnI9OyfAuhP5P3vWtMuGc5UJlrhXbzZo3AwMuHtk |

Columns: map, district (AL-01 style; at-large = 01), pres_year, dem_pct, rep_pct (percent of total vote,
as the Results sheet gives them), margin (rep − dem, R-positive), dem_votes, rep_votes (from the Vote
totals sheet where present). 2008 and 2012 are missing for some districts on later maps (the sheets
leave them blank where the publisher did not recompute them), so counts are 382/435 and 344–408.

Check: 2016 results on the 2018 map agree with data/presByBoundaryVintage.ts (electindex basis) to a
mean absolute difference of 0.18 points over 435 districts, worst 1.6 (MO-05).

Not yet wired into anything. Intended use: district leans on the 2012-cycle lines for scoring 2018 and
2020 House races in scripts/forwardBacktest.ts (see memory note project_backtest_2018_expansion).
