import OverviewEditorial, { type OverviewData } from "@/components/OverviewEditorial";
import { statesData } from "@/data/statesData";
import { electionYear } from "@/data/forecastData";
import { otherForecasts } from "@/lib/overviewOtherForecasts";
import { execSync } from "child_process";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";
import { calculateStateTpl } from "@/lib/tplCompute";
import { getForecastHistory } from "@/lib/forecastHistory";
import { pollingCardData } from "@/lib/pollingCardData";
import { forecastsFor, getChamberSimulations, SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecast";

function seatTotals(data: { margin: number }[], holdover: { dem: number; rep: number }) {
  return {
    dem: holdover.dem + data.filter((race) => race.margin <= 0).length,
    rep: holdover.rep + data.filter((race) => race.margin > 0).length,
  };
}

// "Updated" in the header = the date of the latest commit (read at build, so a deploy shows the
// commit it was built from); the build date if git is not available.
function lastCommitDate(): string {
  try {
    return execSync("git log -1 --format=%cs", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const seatRange = (c: { meanDem: number; lo80: number; hi80: number }) => ({ mean: c.meanDem, lo80: c.lo80, hi80: c.hi80 });

// Everything the editorial needs is computed here, on the server, and handed over as a few KB
// of props — the forecasts, the TPL model and the datasets behind them never reach the browser.
export default function OverviewPage() {
  // One moment for every as-of number on the page, handed to the client components too.
  const now = new Date();
  const gb = computeGenericBallotAverage(now);
  const approval = computeTrumpApprovalAverage(now);
  const data: OverviewData = {
    electionYear,
    genericBallot: { diff: gb.diff, dem: gb.dem, rep: gb.rep },
    approval: { diff: approval.diff, approve: approval.approve, disapprove: approval.disapprove },
    seats: {
      house: seatTotals(forecastsFor("house"), SEAT_HOLDOVERS.house),
      senate: seatTotals(forecastsFor("senate"), SEAT_HOLDOVERS.senate),
      governor: seatTotals(forecastsFor("governor"), SEAT_HOLDOVERS.governor),
    },
    totalSeats: TOTAL_SEATS_BY_TYPE,
    sims: getChamberSimulations(),
    stateMargins: Object.fromEntries(statesData.map((state) => [state.name, calculateStateTpl(state.abbr, state.name)])),
    otherForecasts: otherForecasts(),
    updated: lastCommitDate(),
    asOf: now.getTime(),
    pollingCard: pollingCardData(now.getTime()),
    trend: getForecastHistory()?.days.map((d) => ({ date: d.date, house: d.chambers.house.pDemControl ?? 0, senate: d.chambers.senate.pDemControl ?? 0, governors: d.chambers.governor.meanDem,
      seats: { house: seatRange(d.chambers.house), senate: seatRange(d.chambers.senate), governor: seatRange(d.chambers.governor) } })) ?? null,
  };
  return <OverviewEditorial data={data} />;
}
