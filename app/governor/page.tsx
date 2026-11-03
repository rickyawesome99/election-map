import ForecastMap from "@/components/ForecastMap";
import { governorNoElection } from "@/data/forecastData";
import { forecastSummariesFor } from "@/lib/forecast";

export default function GovernorPage() {
  return <ForecastMap activeTab="forecast" raceType="governor" races={forecastSummariesFor("governor")} noElection={governorNoElection} />;
}
