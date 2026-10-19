import type { StateLegEntry } from "@/data/forecastData";
import type { Chamber } from "@/data/stateLegDistricts";
import { stateLegComposition, stateLegCompositionAsOf } from "@/data/stateLegComposition";

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

export type CurrentChamberSeats = ChamberSeats & { vacant: number; other: Record<string, number>; asOf: string };

/** The chamber's seats today (data/stateLegComposition.ts): third parties by label and vacancies included. */
export function currentChamberSeats(abbr: string, chamber: Chamber): CurrentChamberSeats | null {
  const c = stateLegComposition[abbr]?.[chamber];
  if (!c) return null;
  return { dem: c.dem, rep: c.rep, oth: c.oth, total: c.dem + c.rep + c.oth, year: Number(stateLegCompositionAsOf.slice(0, 4)), vacant: c.vacant, other: c.other, asOf: stateLegCompositionAsOf };
}
