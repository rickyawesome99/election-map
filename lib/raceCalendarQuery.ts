import { houseData } from "@/data/forecastData";
import { raceCalendar, type CalendarRace } from "@/data/raceCalendar";
import {
  ALL, PAGE_SIZE, CALENDAR_PATH, RACE_TABLE_ID, RACE_KINDS, RACE_KIND_LABEL, RACE_KIND_COLOR,
  parseFilter, pageCount, pageOf, filterHref, type RaceCalendarFilter,
} from "@/lib/raceCalendarFilter";
export { ALL, PAGE_SIZE, CALENDAR_PATH, RACE_TABLE_ID, RACE_KINDS, RACE_KIND_LABEL, RACE_KIND_COLOR, parseFilter, pageCount, pageOf, filterHref };
export type { RaceCalendarFilter };

/** Districts that still exist on the current map — only those have a race page to link to.
 *  Seven districts in the results history (CA-53, IL-18, MI-14, NY-27, OH-16, PA-18, WV-03)
 *  were dissolved in redistricting and deliberately get no link. */
const CURRENT_HOUSE_DISTRICTS = new Set(houseData.map((race) => race.name));

/** The site page covering this seat, or null when nothing on the site covers it. */
export function raceHref(race: CalendarRace): string | null {
  const abbr = race.state.toLowerCase();
  switch (race.kind) {
    case "P":
      return `/states/${abbr}`;
    case "S":
      // Seat 2 of a state's delegation lives at /senate/xx2 — see senateHoldovers routing.
      return `/senate/${abbr}${race.seatSlot === "seat2" ? "2" : ""}`;
    case "G":
      return `/governor/${abbr}`;
    case "H":
      return CURRENT_HOUSE_DISTRICTS.has(race.seat) ? `/house/${race.seat.toLowerCase()}` : null;
  }
}

export function filterRaces(filter: RaceCalendarFilter): CalendarRace[] {
  return raceCalendar.filter((race) =>
    (filter.state === ALL || race.state === filter.state) &&
    (filter.kind === ALL || race.kind === filter.kind) &&
    (filter.year === ALL || race.year === Number(filter.year)) &&
    (filter.cls === ALL ||
      (filter.cls === "Runoff" ? race.runoff : race.raceClass === filter.cls))
  );
}

/** The 50 states plus DC, in name order — every jurisdiction the calendar covers. */
export const calendarStates: { abbr: string; name: string }[] = Object.values(
  raceCalendar.reduce<Record<string, { abbr: string; name: string }>>((acc, race) => {
    acc[race.state] ??= { abbr: race.state, name: race.stateName };
    return acc;
  }, {})
).sort((a, b) => a.name.localeCompare(b.name));

/** Headline counts for the page hero. */
export const calendarTotals = {
  races: raceCalendar.length,
  specials: raceCalendar.filter((race) => race.raceClass === "Special").length,
  runoffs: raceCalendar.filter((race) => race.runoff).length,
};
