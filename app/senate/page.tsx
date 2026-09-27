import ForecastMap from "@/components/ForecastMap";
import { senateNoElection } from "@/data/forecastData";
import { forecastSummariesFor } from "@/lib/forecast";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";

export default function SenatePage() {
  return <ForecastMap activeTab="forecast" raceType="senate" races={forecastSummariesFor("senate")} noElection={senateNoElection} genericBallotDiff={computeGenericBallotAverage().diff} />;
}
