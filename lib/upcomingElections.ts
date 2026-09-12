import { electionYear, governorData, houseData, senateData, type RaceForecast } from "@/data/forecastData";
import { raceCalendarYears, type RaceClass, type RaceKind } from "@/data/raceCalendar";

/**
 * The cycle the site forecasts — the one column of the Election Calendar that is ahead of the
 * results, built from the forecast data rather than from the *_past_results.csv files.
 *
 * Everything here describes what is *on the ballot*: the seat, who holds it now, and whether
 * its holder is defending it. No forecast margin is carried into the grid, because a column of
 * projections sitting beside thirteen columns of results reads as a result.
 */
export const UPCOMING_YEAR = electionYear;

/** True only while the forecast cycle has no results of its own on the calendar yet. */
export const hasUpcomingCycle = UPCOMING_YEAR > Math.max(...raceCalendarYears);

export type UpcomingSlot = {
  kind: RaceKind;
  raceClass: RaceClass;
  /** Races of this kind on the state's ballot — 1 statewide, the delegation's size for the House. */
  count: number;
  /** Never true: a runoff is a fact about a result, and these races have none yet. */
  runoff: false;
  /** The page covering the race, or the state page for a whole House delegation. */
  href: string;
  /** Which seat it is: "Class 2 seat", "4-year term", "7 seats". */
  detail: string;
  /** Who holds it going in — "Dan Sullivan (R)", or the delegation's split. */
  held: string;
  /** Whether the seat's holder is one of the two candidates the forecast projects; null where
   *  the slot is a whole delegation rather than one race. */
  incumbentRunning: boolean | null;
  /** The forecast's rating for a single race; null for a delegation, which has no one rating. */
  rating: string | null;
  /** Seats held by each party going in, for a House delegation. */
  seats: { d: number; r: number; o: number } | null;
};

/** Senate ids are "AK" or "FL-2" (the state's second seat); governor and House ids are neither. */
function stateOf(race: RaceForecast): string {
  return race.raceType === "house" ? race.name.slice(0, 2) : race.id.split("-")[0];
}

/** Matches the /senate/[id] route, where a state's second seat lives at /senate/fl2. */
function senateHref(id: string): string {
  return `/senate/${id.toLowerCase().replace(/-2$/, "2")}`;
}

/** True when the seat's current holder is one of the two candidates the forecast projects. An
 *  incumbent can be absent from that pair while still running — Texas projects Paxton, not
 *  Cornyn — so this is not the same as the seat being open. */
function defending(race: RaceForecast): boolean | null {
  if (!race.candidates) return null;
  return race.candidates.dem.incumbent || race.candidates.rep.incumbent;
}

function holder(race: RaceForecast): string {
  return race.seatHolder ? `${race.seatHolder} (${race.seatParty})` : "Vacant";
}

const byState: Record<string, UpcomingSlot[]> = {};

function add(state: string, slot: UpcomingSlot) {
  (byState[state] ??= []).push(slot);
}

for (const race of senateData) {
  add(stateOf(race), {
    kind: "S",
    raceClass: (race.electionType ?? "").toLowerCase().includes("special") ? "Special" : "Regular",
    count: 1,
    runoff: false,
    href: senateHref(race.id),
    detail: race.seatClass ? `Class ${race.seatClass} seat` : "Senate seat",
    held: holder(race),
    incumbentRunning: defending(race),
    rating: race.rating,
    seats: null,
  });
}

for (const race of governorData) {
  add(stateOf(race), {
    kind: "G",
    raceClass: "Regular",
    count: 1,
    runoff: false,
    href: `/governor/${race.id.toLowerCase()}`,
    detail: race.termLength ? `${race.termLength}-year term` : "Governorship",
    held: holder(race),
    incumbentRunning: defending(race),
    rating: race.rating,
    seats: null,
  });
}

// The whole House stands every cycle, so a state's row is its delegation: how many seats, and
// how the party split it is defending breaks down.
const delegations: Record<string, { d: number; r: number; o: number }> = {};
for (const race of houseData) {
  const state = stateOf(race);
  const split = (delegations[state] ??= { d: 0, r: 0, o: 0 });
  if (race.seatParty === "D") split.d += 1;
  else if (race.seatParty === "R") split.r += 1;
  else split.o += 1;
}
for (const [state, split] of Object.entries(delegations)) {
  const count = split.d + split.r + split.o;
  add(state, {
    kind: "H",
    raceClass: "Regular",
    count,
    runoff: false,
    href: `/states/${state.toLowerCase()}`,
    detail: `${count} seat${count === 1 ? "" : "s"}`,
    held: `${split.d}D–${split.r}R${split.o > 0 ? `–${split.o}I` : ""}`,
    incumbentRunning: null,
    rating: null,
    seats: split,
  });
}

/** Office order matches the results columns: President, Senate, Governor, House. */
const KIND_ORDER: RaceKind[] = ["P", "S", "G", "H"];
for (const slots of Object.values(byState)) {
  slots.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** What each state puts on the ballot in the forecast cycle, keyed by two-letter abbreviation. */
export const upcomingSlots: Record<string, UpcomingSlot[]> = byState;

export const upcomingTotals = {
  seats: senateData.length + governorData.length + houseData.length,
  senate: senateData.length,
  governor: governorData.length,
  house: houseData.length,
  specials: senateData.filter((race) => (race.electionType ?? "").toLowerCase().includes("special")).length,
};
