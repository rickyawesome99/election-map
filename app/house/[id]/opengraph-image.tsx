import { raceShareCard, SHARE_CARD_SIZE } from "@/lib/shareCard";

export const alt = "The race's 2026 forecast: projected margin, rating and win probability";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";
export { generateStaticParams } from "./page";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return raceShareCard("house", (r) => r.name.toLowerCase() === id.toLowerCase());
}
