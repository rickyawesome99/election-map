import "server-only";
import { externalForecasts } from "@/data/externalForecasts";
import { POLLSTER_RATING_META as META, pollsterRatings } from "@/data/pollsterRatings";
import { popVotePredictorYears, popVoteTargetYear } from "@/data/popVotePredictors";
import { raceCalendarYears } from "@/data/raceCalendar";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { CHAMBERS, comparisonFor } from "@/lib/forecastComparison";
import { forecastNow } from "@/lib/forecastClock";
import { marketBoard } from "@/lib/marketBoard";
import { pollingMisses } from "@/lib/pollingMisses";
import { PREDICTORS, projectHouse } from "@/lib/popVotePredictors";
import { fmtPct, worstMiss } from "@/lib/predictionMarketDisplay";
import { marketRaceRows, scoredMarkets, tally } from "@/lib/predictionMarkets";
import { calendarTotals } from "@/lib/raceCalendarQuery";
import { redistrictingTotals } from "@/lib/redistrictingCalendar";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";
import { nationalRows } from "@/lib/turnout";
import { projectionNational } from "@/lib/turnoutModel";
import { upcomingTotals } from "@/lib/upcomingElections";

// The figures the /analysis hub rows quote, each taken from the same source as the page it links
// to, so the hub never drifts from the standfirst the reader lands on. Computed once per build
// (the hub is prerendered); every value is already a display string.
export type AnalysisHubFigures = {
  forecasts: { models: string; raters: string; races: string };
  markets: { races: string; favoriteWon: string; missed: string };
  pollsters: { graded: string; polls: string; firstYear: string; active: string };
  misses: { polls: string; races: string; states: string; firstYear: string; party: string; miss: string; missColor: string };
  popularVote: { low: string; high: string; lowColor: string; highColor: string } | null;
  turnout: { presYear: string; presRate: string; midYear: string; midRate: string; votes: string };
  calendar: { firstYear: string; lastYear: string; races: string; redraws: string; seats: string };
};

let cache: AnalysisHubFigures | null = null;

export function analysisHubFigures(): AnalysisHubFigures {
  if (cache) return cache;

  // Forecast Comparison: the forecasters read and the races with at least one outside call.
  const racesCompared = CHAMBERS.reduce((n, c) => n + comparisonFor(c).rows.filter((r) => Object.keys(r.calls).length).length, 0);

  // Prediction Markets: this year's board, and the scored election-eve record.
  const total = tally(scoredMarkets);
  const missed = marketRaceRows(scoredMarkets).filter((r) => worstMiss(r) > 0).length;

  // Polling Misses by State.
  const miss = pollingMisses();
  const overall = miss.races.reduce((s, r) => s + r.miss, 0) / miss.races.length;

  // Popular Vote: the three predictors' House-vote projections, as the page's standfirst reads them.
  const now = forecastNow();
  const approval = computeTrumpApprovalAverage(now);
  const years = popVotePredictorYears.map((y) =>
    y.year === popVoteTargetYear ? { ...y, approval: { approve: approval.approve, disapprove: approval.disapprove, asOf: now.toISOString().slice(0, 10) } } : y
  );
  const target = years.find((y) => y.year === popVoteTargetYear)!;
  const lines = PREDICTORS.map((p) => projectHouse(p.key, target, "all", years)?.fitted).filter((v): v is number => v != null);
  const spread = lines.length ? [Math.min(...lines), Math.max(...lines)] : null;

  // Turnout.
  const national = nationalRows();
  const lastPres = national.filter((r) => r.rate.president != null).at(-1)!;
  const lastMidterm = national.filter((r) => r.year % 4 === 2 && r.rate.house != null).at(-1)!;
  const proj = projectionNational();

  cache = {
    forecasts: {
      models: String(externalForecasts.filter((f) => f.kind === "model").length),
      raters: String(externalForecasts.filter((f) => f.kind === "ratings").length),
      races: String(racesCompared),
    },
    markets: {
      races: String(marketBoard.reduce((n, o) => n + o.races.length, 0)),
      favoriteWon: total.n ? fmtPct(total.right / total.n) : "—",
      missed: String(missed),
    },
    pollsters: {
      graded: String(META.graded),
      polls: META.gradedPolls.toLocaleString("en-US"),
      firstYear: String(META.firstYear),
      active: String(pollsterRatings.filter((r) => r.racePolls2026 + r.genericPolls2026 > 0).length),
    },
    misses: {
      polls: miss.races.reduce((n, r) => n + r.polls, 0).toLocaleString("en-US"),
      races: String(miss.races.length),
      states: String(new Set(miss.races.map((r) => r.abbr)).size),
      firstYear: String(miss.years[0]),
      party: overall > 0 ? "Republicans" : "Democrats",
      miss: Math.abs(overall).toFixed(1),
      missColor: overall > 0 ? "var(--party-rep)" : "var(--party-dem)",
    },
    // Margins are R-positive; the page prints the more Democratic end first, so low = spread[1].
    popularVote: spread ? { low: fmtMargin(spread[1]), high: fmtMargin(spread[0]), lowColor: marginColor(spread[1]), highColor: marginColor(spread[0]) } : null,
    turnout: {
      presYear: String(lastPres.year),
      presRate: `${lastPres.rate.president!.toFixed(1)}%`,
      midYear: String(lastMidterm.year),
      midRate: `${lastMidterm.rate.house!.toFixed(1)}%`,
      votes: `${(proj.houseVotes / 1e6).toFixed(0)} million`,
    },
    calendar: {
      firstYear: String(Math.min(...raceCalendarYears)),
      lastYear: String(Math.max(...raceCalendarYears)),
      races: calendarTotals.races.toLocaleString("en-US"),
      redraws: String(redistrictingTotals.events),
      seats: String(upcomingTotals.seats),
    },
  };
  return cache;
}
