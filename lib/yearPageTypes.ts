// Client-safe shapes for the Years page (/years, /years/[year]); built by lib/yearPage.ts.
import type { LegChamberResult, PostElectionRow } from "@/lib/postElectionTypes";

/** Every year with a page, newest first: the even years and the odd-year elections between them. */
export const YEAR_PAGE_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];

/** The page for a year: the newest at /years, the rest at /years/[year]. */
export const yearPagePath = (year: number) => (year === YEAR_PAGE_YEARS[0] ? "/years" : `/years/${year}`);

export const yearKind = (year: number) => (year % 4 === 0 ? "Presidential election" : year % 2 === 0 ? "Midterm elections" : "Off-year elections");

export type YearParty = "D" | "R" | "I";
export type Tally = { dem: number; rep: number; oth: number };

export type YearOfficeKey = "president" | "senate" | "house" | "governor" | "legislature";

/** How a map shape is filled: a party, a state whose two seats or chambers went different ways, or a race not yet called. */
export type YearUnitClass = YearParty | "split" | "open";

/** One shape on an office's map: a state (by name) or a House district (by GEOID). */
export type YearMapUnit = {
  title: string;
  cls: YearUnitClass;
  flipped: boolean;
  /** The hover card's blocks, one per race or chamber: a serif figure (`head`) over a line of text (`sub`). */
  lines: { label?: string; head: string; sub?: string; party: YearParty | null; note?: string }[];
  /** A closing line under the blocks (a state's electoral votes). */
  foot?: string;
  href: string | null;
};

export type YearFlip = { label: string; /** Null: to a tie or a coalition. */ to: YearParty | null; name: string | null; href: string | null };

export type YearVote = { raw: number | null; adjusted: number | null };

export type YearOfficeSummary = {
  key: YearOfficeKey;
  title: string;
  /** Right of the heading: "35 seats up". */
  meta: string;
  headline: string;
  /** What the bar counts: "seats", "electoral votes", "governorships", "chambers". */
  unit: string;
  beforeLabel: string;
  before: Tally | null;
  after: Tally;
  /** Seats not yet called (2026), drawn grey. */
  open: number;
  total: number;
  /** Where the bar's tick sits; null for no threshold (chambers). */
  majority: number | null;
  /** A second before/after line under the bar (the legislatures' seats beside their chambers). */
  second?: { unit: string; before: Tally | null; after: Tally };
  map: { level: "state" | "district"; geoUrl: string; units: Record<string, YearMapUnit>; /** Races drawn as small boxes in the map's corner: the Senate's special elections, by state abbreviation. */ insets?: { key: string; abbr: string; unit: YearMapUnit }[]; legend: { cls: YearUnitClass; label: string }[]; unfilledLabel: string | null };
  flips: YearFlip[];
  flipsLabel: string;
  vote: YearVote;
  notes: string[];
  more: { href: string; label: string } | null;
};

export type YearEnvironmentOffice = {
  key: "P" | "H" | "S" | "L" | "G";
  label: string;
  /** The national popular vote as cast, R-positive. */
  raw: number | null;
  rawVotes: { dem: number; rep: number; total: number } | null;
  /** The TPL model's neutralized margin, the environment left in. */
  adjusted: number | null;
  /** Share of the year's blended vote. */
  share: number | null;
  /** How many states the adjusted figure rests on. */
  states: number | null;
};

export type YearEnvironment = {
  blended: number | null;
  /** The TPL model's fitted environment E(year). */
  env: number | null;
  offices: YearEnvironmentOffice[];
  president: { name: string; party: "D" | "R"; approve: number; disapprove: number } | null;
};

export type YearStates = {
  rows: PostElectionRow[];
  legislature: Record<string, LegChamberResult[]>;
  housePvPrev: Record<string, number>;
  nationalPvPrev: number | null;
  stateNames: Record<string, string>;
};

export type YearPageData = {
  year: number;
  /** "As of …" for the year still being counted; null for final results. */
  asOf: number | null;
  environment: YearEnvironment;
  offices: YearOfficeSummary[];
  states: YearStates;
};
