# U.S. House results by district, 2012 and 2014 (from MIT Election Data + Science Lab)

Source: "U.S. House 1976–2024", MIT Election Data and Science Lab, Harvard Dataverse
doi:10.7910/DVN/IG0UN2, file id 13592823 (1976-2024-house.tab, version 20250910). The file sits behind a
Dataverse guestbook, so it was downloaded by hand on 2026-11-03 (user's ~/Downloads) and parsed by a
one-off script in that session; the raw file is NOT in the repo (4 MB, re-downloadable). The file is
comma-separated despite its .tab name.

house_past_results_2012_2014.csv follows data-entry/house_past_results.csv's layout and conventions:
- one row per district (435 each year), general election only, specials and write-ins dropped;
- fusion lines (NY, CT, SC…) summed per candidate; Minnesota DFL and North Dakota Dem-NPL read as Democrats;
- dem/rep = the top Democrat and top Republican; margin = rep_pct − dem_pct (R-positive, percent of total vote);
- California/Washington same-party top-two finals: the second finalist sits in the other column tagged "(D)"/"(R)";
- a missing major party: the strongest other candidate stands in, tagged "(I)" or by party initial (our file's convention);
- Louisiana: the MIT file has NO December runoff rows, so LA rows are the November jungle (3 per year; flagged in `note`).
  Our main file stores runoff results, so LA 2012-03, 2014-05 and 2014-06 differ from the seated result's basis;
- incumbent: "D"/"R" if a candidate with the same first initial + surname won a House seat in that STATE at the previous
  general (any district — redistricting moved members), else "None"; member-vs-member races → "None" (flagged).

Validation (same parser run on 2016 against data-entry/house_past_results.csv): 435 districts, 430 within 2,000 votes on
both sides; the rest are LA-03 (runoff), NY-03/NY-19 (fusion/scattering lines, ≤ 4,000 votes) and SC-03/SC-05 (≤ 14,000,
South Carolina's multi-line fusion). Incumbency agrees in 419 of 435 (appointees, specials and name variants are the rest).

Counts: 2012 — 406 D-vs-R contests, 24 stand-ins, 8 same-party finals; 2014 — 378, 37, 8.

Intended use: House rows for 2012-cycle-map district leans in the 2018/2020 House backtest, with
data-entry/pres_by_cd_downballot/ (presidential by district on those lines) and data-entry/fec_weball_pre2016/
(receipts). The same parser covers 2010 if 2012 leans ever want a third House cycle.
