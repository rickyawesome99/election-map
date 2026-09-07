import type { StateLegEntry } from "@/data/forecastData";

export type ChamberSeats = { dem: number; rep: number; oth: number; total: number; year: number };

// Most recent seat count on record for one chamber, drawn from the existing composition
// history (stateLegData) rather than fabricated — used to give the legislature page's hero
// stat row real numbers before per-district data exists.
export function latestChamberSeats(entries: StateLegEntry[], type: "House" | "Senate"): ChamberSeats | null {
  const matches = entries.filter((e) => e.type === type && e.demSeats != null && e.repSeats != null);
  if (matches.length === 0) return null;
  const latest = matches.reduce((a, b) => (b.year > a.year ? b : a));
  const oth = latest.othSeats ?? 0;
  return { dem: latest.demSeats!, rep: latest.repSeats!, oth, total: latest.demSeats! + latest.repSeats! + oth, year: latest.year };
}
