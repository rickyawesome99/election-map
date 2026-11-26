import ForecastMap from "@/components/ForecastMap";
import { electionYear, governorNoElection, senateNoElection } from "@/data/forecastData";
import { forecastSummariesFor, outlookData } from "@/lib/final2026";
import { OutlookHero, OutlookSections } from "@/components/ForecastOutlook";

export const metadata = {
  title: `${electionYear} Forecast — House, Senate and Governor`,
  description: `The final ${electionYear} forecast: the projected margin, win probability and rating of every House, Senate and governor race, on one map.`,
};

// The 2026 forecast, all three chambers on one page (user, 2026-11-25): the map's House / Senate /
// Governor toggle switches in place, and ?chamber= opens on one of them. /house, /senate and
// /governor, which used to be this page's three tabs, are now the chamber pages
// (components/ChamberPage.tsx).
export default function ForecastPage() {
  const outlook = outlookData();
  return (
    <ForecastMap
      activeTab="forecast"
      forecast={{
        house: { races: forecastSummariesFor("house"), noElection: [] },
        senate: { races: forecastSummariesFor("senate"), noElection: senateNoElection },
        governor: { races: forecastSummariesFor("governor"), noElection: governorNoElection },
      }}
      outlookHero={<OutlookHero key="outlook-hero" data={outlook} />}
      outlookSections={<OutlookSections key="outlook-sections" data={outlook} />}
    />
  );
}
