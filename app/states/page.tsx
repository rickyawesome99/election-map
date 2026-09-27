import ForecastMap from "@/components/ForecastMap";
import { buildStateRows } from "@/lib/stateRows";

export default function StatesPage() {
  return <ForecastMap activeTab="states" stateRows={buildStateRows()} />;
}
