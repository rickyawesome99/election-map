import ForecastMap from "@/components/ForecastMap";
import { senateNoElection } from "@/data/forecastData";
import { forecastSummariesFor } from "@/lib/forecast";

export default function SenatePage() {
  return <ForecastMap activeTab="forecast" raceType="senate" races={forecastSummariesFor("senate")} noElection={senateNoElection} />;
}
