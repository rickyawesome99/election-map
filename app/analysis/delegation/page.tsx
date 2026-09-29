import ForecastMap from "@/components/ForecastMap";
import { electionYear } from "@/data/forecastData";
import { buildStateRows } from "@/lib/stateRows";

export const metadata = {
  title: `Current Seat Delegation — ${electionYear} Forecast`,
  description: "Which party holds each state's governorship, Senate seats, House seats, and legislative chambers today.",
};

export default function CurrentSeatDelegationPage() {
  return <ForecastMap activeTab="states" stateRows={buildStateRows()} />;
}
