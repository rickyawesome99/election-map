import { siteShareCard, SHARE_CARD_SIZE } from "@/lib/shareCard";

export const alt = "CT Strategies 2026 midterm forecast: projected control of the House, Senate and governorships";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return siteShareCard();
}
