// Client-safe half of lib/mapSlices.ts: the slice shapes plus the office/year/level tables the
// /historical map's controls are built from. The builders (and the datasets) stay server-side.
import type { CountyRaceType } from "@/data/electionCalendar";

export type MapOffice = "president" | CountyRaceType;
export type MapLevel = "county" | "district" | "state";

export type NormalizedResult = {
  demVotes: number; repVotes: number; totalVotes: number;
  demPct: number; repPct: number; margin: number;
  votesKnown?: boolean;
  repIsDem?: boolean;
  demIsRep?: boolean;
};

export type SliceEntry = {
  result: NormalizedResult | null;
  special?: NormalizedResult | null;
  label?: string;
  stateAbbr?: string;
  stateName?: string;
  moreInfoHref?: string | null;
};

export type MapSlice = {
  level: MapLevel;
  office: MapOffice;
  year: number;
  entries: Record<string, SliceEntry>;
  aggregate: { demVotes: number; repVotes: number; totalVotes: number; demUnits: number; repUnits: number };
};

// President's underlying county data also has 2008 and 2012 — omitted to keep the year
// picker to one row; those years still show on individual county pages.
export const YEARS_BY_OFFICE: Record<MapOffice, number[]> = {
  president: [2024, 2020, 2016],
  governor: [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
  senate: [2024, 2022, 2020, 2018, 2016],
  house: [2024, 2022, 2020, 2018, 2016],
};

// District/State views are built from house_statewide_results.csv, president_past_results.csv,
// etc., which only go back to 2016.
const DISTRICT_STATE_MIN_YEAR: Partial<Record<MapOffice, number>> = { president: 2016 };

export function yearsForLevel(office: MapOffice, level: MapLevel): number[] {
  const years = YEARS_BY_OFFICE[office];
  if (level === "county") return years;
  const minYear = DISTRICT_STATE_MIN_YEAR[office];
  return minYear ? years.filter((y) => y >= minYear) : years;
}

export const MAP_LEVELS: MapLevel[] = ["county", "district", "state"];
export const MAP_OFFICES: MapOffice[] = ["president", "governor", "senate", "house"];

export const mapSliceUrl = (level: MapLevel, office: MapOffice, year: number) => `/api/map/${level}/${office}/${year}`;
