import ForecastMap from "@/components/ForecastMap";
import { governorNoElection } from "@/data/forecastData";
import { forecastSummariesFor } from "@/lib/forecast";
import { outlookData } from "@/lib/outlookData";
import { OutlookHero, OutlookSections } from "@/components/ForecastOutlook";

export default function GovernorPage() {
  const outlook = outlookData();
  return <ForecastMap activeTab="forecast" raceType="governor" races={forecastSummariesFor("governor")} noElection={governorNoElection} outlookHero={<OutlookHero key="outlook-hero" data={outlook} />} outlookSections={<OutlookSections key="outlook-sections" data={outlook} />} />;
}
