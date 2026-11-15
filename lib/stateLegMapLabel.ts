import type { Chamber } from "@/data/stateLegDistricts";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegCalendar } from "@/data/stateLegCalendar";

/**
 * A superseded state-legislative map is named for the first general election held on it: the
 * 2011 redraw first used in 2012 is the "2012" map, even though the results window only shows its
 * 2016–2020 elections. The year is data/stateLegCalendar.ts's era firstYear (an assumed 2011/2012
 * where the calendar marks it unverified). The calendar's eras run in the same order as the
 * vintages in data/stateLegHistoricalMaps.ts, current map last, so they are matched by position
 * from the end (the atlas builder does the same).
 */
export function stateLegOldMapYear(abbr: string, chamber: Chamber, vintage: string | number): number | null {
  const map = stateLegHistoricalMaps[abbr]?.[chamber];
  if (!map) return null;
  const vintages = [...new Set(Object.values(map).map(String))].sort((a, b) => Number(a) - Number(b));
  const i = vintages.indexOf(String(vintage));
  if (i < 0) return null;
  const eras = stateLegCalendar[abbr]?.[chamber]?.eras ?? [];
  return eras[eras.length - 1 - (vintages.length - i)]?.firstYear ?? null;
}

/** "2012" for a superseded map (see stateLegOldMapYear); `fallback` where the calendar has no era. */
export function stateLegOldMapLabel(abbr: string, chamber: Chamber, vintage: string | number, fallback: string): string {
  const y = stateLegOldMapYear(abbr, chamber, vintage);
  return y == null ? fallback : String(y);
}
