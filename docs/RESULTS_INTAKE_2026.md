# 2026 Results Intake — How It Ran, What We Learned, What to Change

Internal. Written 2026-11-16, when the live intake was shut down and `/results` became an archive.
Covers 6 PM ET Tuesday Nov 3 → 6 PM ET Monday Nov 16.

**Verdict:** the system worked decently. Every race was counted, the needle converged, and
nothing was lost. The archive is more complete than any single source. The biggest problem was
upstream: civicAPI was overloaded from about 7 PM to 12:30 AM ET on election night. Our own
weak spots were (1) every browser polling civicAPI directly, which added to that load,
(2) the needle's late-count remainder leaning the wrong way, and (3) a lot of fixes written live
on election night, with no plan for a feed outage.

---

## 1. What was running

| Piece | Where | Role |
|---|---|---|
| Page | `components/results/ResultsPage.tsx` (+ `RaceDetail`, `ResultsMap`, `ChamberCard`, `NightPanel`) | Dashboard, map, race table, race pages |
| Priors | `lib/resultsPriors.ts` → `/api/results/priors/{office}` (static) | Forecast, nominees, county projection, poll closings, civicAPI ids (`data-entry/civicapi_race_ids.csv`, 506 races) |
| Feed normalizer | `lib/resultsFeed.ts` | civicAPI payload → `LiveRace`: slot matching, county roll-ups (RI towns, CT regions, VA cities, AK boroughs), party blocs for jungle/RCV, `FEED_FIXES`, `heldPct` |
| Needle | `lib/resultsNeedle.ts` | County-level projected final margin; never calls races. Locks when civicAPI calls one |
| Night model | `lib/resultsNight.ts` | Cross-race ridge fit (national × state β, office, state, demographic slopes, early-vote "mirage" term) that moves races with nothing counted |
| Browser feed (prod) | `fetchRaces` in `lib/resultsFeed.ts` | Every open tab: 506 toplines every 2 min, plus county detail for competitive and selected races |
| Local intake (dev) | `scripts/results-live.mjs` → `data-entry/results-live/` + `/api/results/live` | Priority poller (close races every 20 s, wide 60 s, empty 2 min, settled 5 min); the page read it every 10 s |
| Mac archiver | `scripts/archive-results.mjs` → `results-archive/2026-11-03/` | Full board every 2 min. Replaced by the intake at 6:25 PM ET |
| Cloud archiver | `.github/workflows/results-archive.yml` | GitHub Actions chain of 60-min runs plus a watchdog; set `2026-11-03-cloud` |
| civicAPI history | `scripts/fetch-civic-history.mjs` → `results-archive/civic-history/` | After the fact: every vote change civicAPI recorded, per race |

## 2. Timeline

- **Nov 3, 5 PM ET:** replay and sim preview switched off (`SHOW_REPLAY = false`). The Mac archiver
  was restarted, and full fetches already took about 77 s under load.
- **5:45 PM:** civicAPI 502s reached the browser as CORS failures, so 108–282 of 506 races were
  blank. Fixed live: 2 retries, no aborting a running pass, queue in poll-close order, render every 10 races.
- **6:15 PM:** localStorage persistence added so a reload no longer wiped the board.
- **6:25 PM:** local priority intake (`results-live.mjs`) replaced the Mac archiver.
- **6:35 PM:** trend charts limited to real results (sim and test points from before the election removed).
- **7 PM–12:30 AM (00Z–05Z Nov 4):** **civicAPI overloaded.** Throughput fell from about 3,200
  toplines/hour to 300–700/hour. Errors peaked at 3,359/hour (1 AM ET). Across the night: 1,142 HTTP
  502, 79 timeouts, 32 HTTP 500, 4 HTTP 504, and some `CIVICAPI_OVERLOADED` replies. KY Senate
  froze for about an hour. The cloud archiver managed only about one snapshot an hour from 7:45 PM to 12:15 AM ET.
- **Election night, live model changes:** `MIRAGE_ITERATIONS 3` (user's call: big D
  overperformance plus a slight blue mirage), `FEED_DONE_MIN_SHARE 0.5` (VT showed "100%" with 4
  towns in), `settledParty()` for unopposed and same-party seats, matchSlots prefers a surname
  match from the same party (AK had two different Sullivans).
- **Nov 4, ~1 AM on:** feed recovered. Zero failures from 2 AM ET.
- **Nov 4 8 AM:** Mac poller stopped; cloud only. Cloud window extended to Nov 6 05:00Z (30-min snapshots).
- **Nov 4 evening:** county-done rule. A county counts as done when the feed says 100% *and* the
  count is ≥ 0.9 of expected (Utah County was at feed 100% with 68% of its votes in).
- **Nov 5:** τ fix to that rule (MS Senate: 7,963 phantom R votes → R+0.41 became D+0.03). TX
  Senate `FEED_FIXES` override added (civicAPI froze Paxton's Dallas and Guadalupe counts at
  inflated numbers). Feed re-served Indiana at older counts. NY races once showed exactly 3× the real count.
- **Nov 6–7:** civicAPI changed what `percent_reporting` means. 6,408 of 8,410 county rows fell
  from 100% with almost no new votes. Late-count mode added: `heldPct`, and `lateLean` replaced the
  early-vote skew from `LATE_COUNT_FROM`. The TX feed repaired itself, our estimates were within
  about 260 votes, and the override switched itself off.
- **Nov 6 05:00Z:** both archivers ended. Cloud workflow disabled on Nov 9.
- **Nov 9–16:** civicAPI history pulled twice (21,797, then 24,326 snapshots) and merged.
- **Nov 16, 6 PM ET:** live intake ended. `/results` became the archive (this document).

## 3. How the needle did

Scored on the published archive. Each race's projection at a checkpoint is compared with its
counted margin at the final frame (Nov 16, 6 PM ET; unofficial). The sample is 347 races with a
final margin inside 30 points. "Counted" means the raw counted margin at the same moment.

| ET | Needle MAE | 80% band covers | Wrong side | Counted MAE (n) |
|---|---|---|---|---|
| Nov 3 8 PM | 5.04 | 83% | 29 | 10.35 (84) |
| 10 PM | 4.22 | 85% | 34 | 6.68 (259) |
| 11 PM | 3.23 | 84% | 25 | 3.63 (288) |
| Nov 4 12 AM | 2.08 | 85% | 21 | 2.63 (337) |
| 2 AM | 1.27 | 84% | 16 | **1.08** (342) |
| 6 AM | 0.99 | 84% | 12 | **0.82** (347) |
| 6 PM | 0.81 | 83% | 9 | **0.61** |
| Nov 5 6 PM | 0.64 | 84% | 7 | **0.50** |
| Nov 10 6 PM | 0.37 | 95% | 2 | **0.18** |

- **Good:** large gains over the raw count early in the night (5.0 vs 10.4 at 8 PM, 4.2 vs 6.7 at
  10 PM). Calibration was steady at 83–86% for an 80% band. Senate and governor seat projections
  were never off by more than 2 seats (Senate dipped to 54 against a final 56; governor ran 29–31
  against a final 30).
- **Bad:** **from about 2 AM the raw count beat the needle,** and it stayed that way through the
  late count. At 6 AM the needle leaned 0.41 pts R of the final on average, against 0.22 for the
  raw count. The early-vote term said the votes counted first lean D, so it projected the remainder
  more R. But the remainder was late mail and provisionals, which broke D (KS late votes D+31,
  MS D+34). `lateLean` (Nov 6) fixed the direction only after the fact.
- **House seats overshot at 10 PM:** 269 D against a final of about 259. The night model's national
  term chased early D-heavy counties. It had settled to 258–263 by midnight.
- **Remaining wrong-side races are mostly structural:** CA top-two same-party seats (CA-04, CA-11,
  CA-34, CA-40: the margin between two same-party candidates leans on the forecast);
  TN-04 (the feed's pct stuck at 76%); AK Senate and governor (RCV final round, slow count);
  MS Senate (D+0.8 final; the needle read R+0.6 → 0.0 on the night).

## 4. Data problems in the feed (civicAPI)

- Under load, 502 error pages carry no CORS header, so browsers report a CORS failure, not a 502.
- `percent_reporting` is precinct-based (70% reporting ≈ 42% of the vote), is measured only over
  the regions sent so far (VT "100%" with 4 towns), and **changed meaning on Nov 6**.
- Counts went backward (IN-03 re-served at old numbers). A candidate jumped while the others froze
  (TX Senate Paxton). NY showed 3× the real count once.
- Geography differs by state: the same votes at several levels (ME, MA, NH, VT, CT, RI), cities
  without FIPS (VA), Chicago separate from Cook, AK boroughs, MS-01–04 State row only.
- `last_updated` bumps on every race every few minutes with no new votes.
- Names: GA-08 "Etsi"; AK's two Sullivans.
- Upside: free, no key, open CORS, county FIPS in 2026 payloads, and a `/history` endpoint that
  records every vote change. That endpoint is the best record of the night we have.

## 5. Takeaways

1. **One fetcher, many readers.** Each open tab polled 506 races every 2 minutes, so our own viewers
   added to the overload that hurt us. The local intake (one poller, priority queue, store) was the
   right design. It just only ran in dev.
2. **The provider is the risk.** Most of the night's pain was civicAPI's capacity and data quirks,
   not our code. We had no second source to cross-check against or fail over to.
3. **Record everything, then merge.** Running three archivers plus civicAPI's own history meant no
   gaps. Our archive alone had 1,086 states civicAPI's history didn't; civicAPI had about 19.5k
   distinct states to our 9k.
4. **Model the remainder by vote type, not by when it was counted.** The early-vote term was right
   at 9 PM and wrong at 2 AM. The late count's direction depends on each state's mix of election-day
   votes, mail and provisionals, and that should be a prior, not something learned live.
5. **Most live fixes were about meaning, not code:** what "100% reporting" means, which county
   level to count, when a county is done. A pre-election intake audit (the one run on Nov 3, 2:30 AM)
   caught the geography issues; nothing caught semantic changes.
6. **Too much was decided live.** Several needle rules (county-done, τ fix, late-count mode,
   FEED_FIXES) were written under pressure with little backtest. They held up, but each was tuned on
   the same days it was applied.

## 6. Improvements for next time (ranked)

1. **Server-side intake in prod.** Run `results-live.mjs` (or a Vercel cron/edge function) as the
   only civicAPI reader. Write normalized boards to a store (KV/blob/static JSON with a short CDN
   TTL). The page reads only our endpoint. That cuts upstream load from N tabs to one and gives one
   place for retries, holds and fixes.
2. **Second source and failover.** Adapters for a few state election feeds (Clarity/ENR, enhanced
   voting, NC SBE; `scripts/results_2026/` already has some), compared live with civicAPI. Flag when
   they disagree, and switch per race when civicAPI stalls.
3. **Feed health checks as code, run on every board:** counts going backward, one candidate frozen
   while another jumps, pct falling without new votes, county sum ≠ topline, pct at 100% below
   expected votes. Raise flags on the page and in a log instead of finding them in screenshots.
4. **A vote-type prior for the remainder:** per state, the expected order of election-day, mail and
   provisional votes and how each leans, fit on the 2026 archive (we now have the full sequence).
   Replace the mirage/late-lean switch at a fixed time (`LATE_COUNT_FROM`) with a smooth handoff.
5. **Backtest on the 2026 archive.** `public/results-archive-2026/` and `results-archive/2026-11-03-full/`
   are the real sequence. Re-tune `SIGMA_*`, `MIN_COMPLETE`, `MIRAGE_*`, the county-done threshold and
   the night model's national term on it (the 10 PM House overshoot).
6. **A plan for outages:** a visible "feed degraded" state with per-race staleness, a server-side
   fallback to the last good board, and no client retry storms (back off with jitter on errors).
7. **Same-party and RCV races:** project CA top-two D-vs-D and R-vs-R from candidate-level
   priors instead of the forecast margin. Show the AK/ME RCV final round once it is published.
8. **Freeze rules before the night.** A short list of switches decided in advance (replay off,
   intake mode, cadence), plus a runbook with times. The many uncommitted live edits made Nov 3–7
   hard to reconstruct.
9. **The archiver should be the intake, not a third copy.** Write snapshots from the same store
   the page reads.
10. **Cloud workflow:** cron dates recur every year, so its schedule was removed (see the workflow
    comment). Next time, add that year's dates and remove them afterwards.

## 7. The archive (what exists and how to rebuild)

| Path | What | In git? |
|---|---|---|
| `data-entry/results-archive/civic-history/<id>/` | civicAPI per-race history, 24,326 snapshots to Nov 17 | no (111 MB) |
| `data-entry/results-archive/2026-11-03/` | Mac archiver plus intake snapshots | no (721 MB) |
| `data-entry/results-archive/2026-11-03-cloud/` | GitHub Actions archiver | no (273 MB) |
| `data-entry/results-archive/2026-11-03-full/` | All of the above merged: 2,233 boards on a 2-min grid where something changed, Nov 3 22:03Z → Nov 17 03:44Z, plus `sources.csv` | no (~1.3 GB) |
| `public/results-archive-2026/` | What `/results` replays: 338 frames from 6 PM ET Nov 3 to 6 PM ET Nov 16 (5-min frames to 6 AM Nov 4, 15-min to Nov 5, hourly to Nov 7, then 3-hourly), 15 chunk files (keyframe plus changed races; each frame's night fit, area swings and moved races), `seats.json`, `races.json` (needle at every frame), `manifest.json`; 16 MB | yes |
| `data-entry/results-archive/live-2026-11-03.log` | Intake log (throughput and errors by hour) | no |

Rebuild:

```
node scripts/fetch-civic-history.mjs --from 2026-11-09T00:00:00Z   # resumable
node --max-old-space-size=8192 scripts/merge-results-archive.mjs    # ~4 min → 2026-11-03-full
npm run publish-results-archive                                     # ~45 s → public/results-archive-2026
```

`publish-results-archive` normalizes every race at each frame's time, so the late-count rules
switch on as they did live. The diff ignores `fetchedAt` and `lastUpdated` (civicAPI's
timestamp-only bumps would otherwise make it 34 MB instead of 13, before the per-frame fits brought it to 16). The frames show
today's needle code, not the exact code that ran at each moment on the night.

## 8. Shutdown and the archive page (2026-11-16/17)

- `/results` is now a **static page with a time slider**. It reads no live feed and no clock: it
  always opens on the final frame (6 PM ET Nov 16). The browser feed, intake store, localStorage
  restore, simulated-night replay and the dev-only routes `/api/results/live`,
  `/api/results/archive`, `/api/results/archive/series` were removed (the last two also made
  `next build` trace the 2.4 GB local archive folder and run out of memory). The live code is in git
  history (before this change) for the next cycle.
- Controls: first / previous / play-pause / next / final buttons, a slider, ←/→ (Shift = 12
  frames), Home/End, and space to play. The time bar sticks to the top while scrolling. Race pages
  keep the bar, so a race can be replayed too.
- Trend charts (`TREND_WINDOW`) run to the end of the archive instead of stopping at Nov 5 (user).
- Latest updates shows the races whose count moved since the previous frame (`moved` in each
  frame), always 8 rows with blank fillers and a one-line note, so stepping never shifts the page (user).
- Race pages show the poll closing time beside the date (user).
- Overview box and post-election page text updated. The cloud workflow's cron schedule was removed.

### Performance (the goal: click through all 338 frames as if live)

Measured on a local production build, 30 steps from the first frame:

| | Desktop step | Phone-speed step (4× CPU) | Longest main-thread block (phone) |
|---|---|---|---|
| First archive version | 71 ms | 345 ms | ~190 ms |
| Now | **36 ms** | **132 ms** | **< 50 ms** |

What made the difference:
1. **Night fit precomputed per frame** in the archive (`NightFitData`, `reviveNightFit` in
   `lib/resultsNight.ts`): the fit was about 75% of a frame's projection math. Every race-frame was
   checked against the publish script's own numbers: 171,028 match within display rounding.
2. **Boards built once per chunk and cached.** Unchanged races keep the same object from frame to
   frame, and since the needle only checks the timestamp against `LATE_COUNT_FROM`, races are
   stamped with that side of the line instead of the exact frame time.
3. **Stable rows plus memoized children:** a race whose figures didn't change keeps its row
   object, so memoized table rows (`RaceRow`), map shapes (`Region`) and race cards skip redrawing.
4. **The seat and margin charts were rewritten in plain SVG** (`SeatTrendChart.tsx`, same props and
   look). Recharts' internal store was about a third of a step's work on a phone.
5. **The heavy render trails the slider** (`useDeferredValue`): the slider and time label move at
   once. Neighbouring chunks are prefetched when the browser is idle.
6. **Load splitting:** first view = priors (~550 KB gz) + manifest + seat series (20 KB gz) + last
   chunk (~0.25 MB). The race margin series (150 KB gz) loads only when a race opens.
7. `fmtInt` reuses one `Intl.NumberFormat` (it built one per call; ~40 ms a step in dev).

Left on the table: projection math is still about 25 ms a step on desktop (it could move to a web
worker); the step into a not-yet-prefetched chunk costs about 0.5 s on a phone; the priors slices
could be trimmed for this page.
