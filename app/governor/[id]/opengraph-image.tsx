import { raceShareCard, SHARE_CARD_SIZE } from "@/lib/shareCard";
import { governorData, governorNoElection } from "@/data/forecastData";

export const alt = "The race page: its nominees, forecast, polls, fundraising and past results";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

// The same ids as the page's generateStaticParams, listed here rather than re-exported from
// ./page: a re-export would pull the whole race page (the model and its data) into this route.
export async function generateStaticParams() {
  return [
    ...governorData.map((race) => ({ id: race.id.toLowerCase() })),
    ...governorNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
  ];
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return raceShareCard("governor", (r) => r.id.toLowerCase() === id.toLowerCase());
}
