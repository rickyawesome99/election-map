import { raceShareCard, SHARE_CARD_SIZE } from "@/lib/shareCard";
import { senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";

export const alt = "The race page: its nominees, forecast, polls, fundraising and past results";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

// "GA-2" → "ga2": the page's senateUrlId, repeated here so this route does not import ./page (a
// re-export of its generateStaticParams would pull the whole race page, model and data, in).
const senateUrlId = (id: string) => id.toLowerCase().replace(/-2$/, "2");

export async function generateStaticParams() {
  return [
    ...senateData.map((race) => ({ id: senateUrlId(race.id) })),
    ...senateNoElection.map((e) => ({ id: e.abbr.toLowerCase() })),
    ...senateHoldovers.map((e) => ({ id: `${e.abbr.toLowerCase()}2` })),
  ];
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return raceShareCard("senate", (r) => senateUrlId(r.id) === id.toLowerCase());
}
