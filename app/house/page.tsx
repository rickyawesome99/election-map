import ForecastMap from "@/components/ForecastMap";
import { forecastSummariesFor } from "@/lib/forecast";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";

export default function HousePage() {
  return <ForecastMap activeTab="forecast" raceType="house" races={forecastSummariesFor("house")} genericBallotDiff={computeGenericBallotAverage().diff} />;
}
