import ForecastMap from "@/components/ForecastMap";
import { forecastSummariesFor } from "@/lib/forecast";

export default function HousePage() {
  return <ForecastMap activeTab="forecast" raceType="house" races={forecastSummariesFor("house")} />;
}
