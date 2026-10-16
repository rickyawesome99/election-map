import { raceShareCard, SHARE_CARD_SIZE } from "@/lib/shareCard";
import { houseData } from "@/data/forecastData";

export const alt = "The race page: its nominees, forecast, polls, fundraising and past results";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

// The same ids as the page's generateStaticParams, listed here rather than re-exported from
// ./page: a re-export would pull the whole race page (the model and its data) into this route.
export async function generateStaticParams() {
  return houseData.map((race) => ({ id: race.name.toLowerCase() }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return raceShareCard("house", (r) => r.name.toLowerCase() === id.toLowerCase());
}
