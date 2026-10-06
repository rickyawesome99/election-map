import OverviewEditorial, { type OverviewData } from "@/components/OverviewEditorial";
import { statesData } from "@/data/statesData";
import { electionYear } from "@/data/forecastData";
import { racePollsMeta } from "@/data/racePolls";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";
import { calculateStateTpl } from "@/lib/tplCompute";
import { getForecastHistory } from "@/lib/forecastHistory";
import { governorForecasts, houseForecasts, senateForecasts, getChamberSimulations, SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecast";

function seatTotals(data: { margin: number }[], holdover: { dem: number; rep: number }) {
  return {
    dem: holdover.dem + data.filter((race) => race.margin <= 0).length,
    rep: holdover.rep + data.filter((race) => race.margin > 0).length,
  };
}

const seatRange = (c: { meanDem: number; lo80: number; hi80: number }) => ({ mean: c.meanDem, lo80: c.lo80, hi80: c.hi80 });

// Everything the editorial needs is computed here, on the server, and handed over as a few KB
// of props — the forecasts, the TPL model and the datasets behind them never reach the browser.
export default function OverviewPage() {
  // One moment for every as-of number on the page, handed to the client components too.
  const now = new Date();
  const gb = computeGenericBallotAverage(now);
  const approval = computeTrumpApprovalAverage(now);
  const withType = [
    ...senateForecasts.map((race) => ({ race, type: "senate" as const })),
    ...governorForecasts.map((race) => ({ race, type: "governor" as const })),
    ...houseForecasts.map((race) => ({ race, type: "house" as const })),
  ];
  const keyRaces = withType
    .sort((a, b) => Math.abs(a.race.margin) - Math.abs(b.race.margin))
    .slice(0, 5)
    .map(({ race, type }) => ({ type, id: race.id, name: race.name, state: race.state, margin: race.margin }));

  const data: OverviewData = {
    electionYear,
    genericBallot: { diff: gb.diff, dem: gb.dem, rep: gb.rep },
    approvalDiff: approval.diff,
    seats: {
      house: seatTotals(houseForecasts, SEAT_HOLDOVERS.house),
      senate: seatTotals(senateForecasts, SEAT_HOLDOVERS.senate),
      governor: seatTotals(governorForecasts, SEAT_HOLDOVERS.governor),
    },
    totalSeats: TOTAL_SEATS_BY_TYPE,
    sims: getChamberSimulations(),
    stateMargins: Object.fromEntries(statesData.map((state) => [state.name, calculateStateTpl(state.abbr, state.name)])),
    keyRaces,
    racePolls: { through: racePollsMeta.newestPollEnd, checked: racePollsMeta.checked },
    asOf: now.getTime(),
    trend: getForecastHistory()?.days.map((d) => ({ date: d.date, house: d.chambers.house.pDemControl ?? 0, senate: d.chambers.senate.pDemControl ?? 0, governors: d.chambers.governor.meanDem,
      seats: { house: seatRange(d.chambers.house), senate: seatRange(d.chambers.senate), governor: seatRange(d.chambers.governor) } })) ?? null,
  };
  return <OverviewEditorial data={data} />;
}
