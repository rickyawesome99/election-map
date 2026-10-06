// Display helpers for the 2026 market board on /analysis/markets, shared by the server page and
// its client component. Client-safe: no data or compute imports.

import type { RaceType } from "@/data/forecastData";

export type MarketBoardRace = {
  id: string;
  office: RaceType;
  /** "Alaska", "Florida (special)", "AL-01". */
  name: string;
  /** Full state name — the key the state map joins on. */
  state: string;
  href: string;
  /** Polymarket's price on the Democratic side, 0–1. */
  pDem: number;
  /** This site's forecast probability on the Democratic side, 0–1. */
  modelPDem: number;
  demName: string | null;
  repName: string | null;
};

export type MarketBoardOffice = { office: RaceType; label: string; races: MarketBoardRace[] };

/** Price buckets left to right: the most Republican first, the most Democratic last. */
export type Bucket = { side: "R" | "D"; lo: number; hi: number; label: string; color: string };

// Each side runs 50–60 → 90+ in the site's rating colors (lib/colorScale), with one step added
// between Likely and Safe so five bands fit; the pair at the middle is the desaturated Tilt pair.
const D_COLORS = ["#959bb3", "#8bafff", "#587ccc", "#3a5fb0", "#1b408c"];
const R_COLORS = ["#cf8980", "#ff8b98", "#ff5864", "#e03a48", "#be1c29"];
const BANDS: [number, number, string][] = [[50, 60, "50–60%"], [60, 70, "60–70%"], [70, 80, "70–80%"], [80, 90, "80–90%"], [90, 100, "90%+"]];

export const BUCKETS: Bucket[] = [
  ...BANDS.map(([lo, hi, label], i) => ({ side: "R" as const, lo, hi, label, color: R_COLORS[i] })).reverse(),
  ...BANDS.map(([lo, hi, label], i) => ({ side: "D" as const, lo, hi, label, color: D_COLORS[i] })),
];

/** The race's favorite and that side's price. A price at exactly 50% is read as the Democratic side, as on the race pages. */
export function favoriteOf(pDem: number): { side: "D" | "R"; prob: number } {
  return pDem >= 0.5 ? { side: "D", prob: pDem } : { side: "R", prob: 1 - pDem };
}

/** Index into BUCKETS. Prices are quoted to the cent, so 0.60 lands in 60–70. */
export function bucketIndex(pDem: number): number {
  const { side, prob } = favoriteOf(pDem);
  const band = Math.min(4, Math.max(0, Math.floor(Math.round(prob * 100) / 10) - 5));
  return side === "D" ? 5 + band : 4 - band;
}

export const bucketColor = (pDem: number) => BUCKETS[bucketIndex(pDem)].color;

/** "73% D" */
export const fmtPrice = (pDem: number) => {
  const { side, prob } = favoriteOf(pDem);
  return `${Math.round(prob * 100)}% ${side}`;
};

export const sideColor = (pDem: number) => `var(--party-${pDem >= 0.5 ? "dem" : "rep"})`;
