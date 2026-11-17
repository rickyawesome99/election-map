import ForecastMap from "@/components/ForecastMap";
import { forecastSummariesFor } from "@/lib/forecast";
import { outlookData } from "@/lib/outlookData";
import { OutlookHero, OutlookSections } from "@/components/ForecastOutlook";

export default function HousePage() {
  const outlook = outlookData();
  return <ForecastMap activeTab="forecast" raceType="house" races={forecastSummariesFor("house")} outlookHero={<OutlookHero key="outlook-hero" data={outlook} />} outlookSections={<OutlookSections key="outlook-sections" data={outlook} />} />;
}
