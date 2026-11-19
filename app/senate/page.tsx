import ForecastMap from "@/components/ForecastMap";
import { senateNoElection } from "@/data/forecastData";
import { forecastSummariesFor, outlookData } from "@/lib/final2026";
import { OutlookHero, OutlookSections } from "@/components/ForecastOutlook";

export default function SenatePage() {
  const outlook = outlookData();
  return <ForecastMap activeTab="forecast" raceType="senate" races={forecastSummariesFor("senate")} noElection={senateNoElection} outlookHero={<OutlookHero key="outlook-hero" data={outlook} />} outlookSections={<OutlookSections key="outlook-sections" data={outlook} />} />;
}
