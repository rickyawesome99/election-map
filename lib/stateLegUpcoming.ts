import type { StateLegDistrict } from "@/data/stateLegDistricts";

/** What a chamber puts on the ballot in one cycle, summarised for the map and its card. */
export type UpcomingChamber = {
  year: number;
  seatsUp: number;
  /** Verified chamber size, or null where it isn't known — the card then omits the denominator. */
  totalSeats: number | null;
  districtsUp: number;
  totalDistricts: number;
  /** True when every seat in the chamber stands this cycle. */
  wholeChamber: boolean;
  /**
   * Set only where the districts on the ballot are exactly one parity and the ones sitting out are
   * exactly the other — the clean odd/even stagger most 4-year senates use. Null for the many
   * chambers whose classes were assigned by lot (TX, WA, IL, IN, CO, MT, NV, OR, UT, AR, DE, HI),
   * where naming a parity would be wrong.
   */
  parity: "odd" | "even" | null;
  termYears: number | null;
};

/**
 * How many of a district's seats are on the ballot in `year`.
 *
 * Per-incumbent years take precedence over the district's, which matters for WV Senate: its two
 * senators per shared boundary alternate even years, so such a district has exactly one seat up
 * each cycle rather than both or neither.
 *
 * Where every seat is on the district's shared cycle the statutory seat count wins, because it
 * includes seats that are currently VACANT and so have no incumbent row to count — without that,
 * NH's 7 vacancies would silently drop out of the tally.
 */
export function seatsUpIn(district: StateLegDistrict, year: number): number {
  const incumbents = district.incumbents ?? [];
  if (incumbents.length === 0) return district.nextElection === year ? district.seats ?? 1 : 0;
  const up = incumbents.filter((inc) => (inc.nextElection ?? district.nextElection) === year).length;
  if (up === incumbents.length && district.seats != null) return district.seats;
  return up;
}

/** Whether anything on these lines is on the ballot — what the map shades. */
export function isDistrictUp(district: StateLegDistrict, year: number): boolean {
  return seatsUpIn(district, year) > 0;
}

function parityOf(numbers: string[]): "odd" | "even" | null {
  const parsed = numbers.map((n) => parseInt(n, 10));
  if (parsed.some((n) => Number.isNaN(n))) return null;
  if (parsed.every((n) => n % 2 === 1)) return "odd";
  if (parsed.every((n) => n % 2 === 0)) return "even";
  return null;
}

/**
 * Null when the chamber has nothing on the ballot that year — the 11 chambers sitting out 2026
 * (LA/MS/VA/NJ entirely, plus the KS/NM/SC senates) get no card and no map view.
 */
export function summarizeUpcoming(
  districts: StateLegDistrict[],
  year: number,
  totalSeats: number | null,
  termYears: number | null,
): UpcomingChamber | null {
  if (districts.length === 0) return null;
  let seatsUp = 0;
  const upNumbers: string[] = [];
  const downNumbers: string[] = [];
  for (const d of districts) {
    const n = seatsUpIn(d, year);
    seatsUp += n;
    (n > 0 ? upNumbers : downNumbers).push(d.number);
  }
  if (seatsUp === 0) return null;

  // A parity label has to describe the split, not just the half on the ballot: "odd-numbered
  // districts" is only true if the even ones are the class sitting out.
  const upParity = parityOf(upNumbers);
  const parity =
    downNumbers.length > 0 && upParity && parityOf(downNumbers) === (upParity === "odd" ? "even" : "odd")
      ? upParity
      : null;

  return {
    year,
    seatsUp,
    totalSeats,
    districtsUp: upNumbers.length,
    totalDistricts: districts.length,
    wholeChamber: totalSeats != null && seatsUp >= totalSeats,
    parity,
    termYears,
  };
}
