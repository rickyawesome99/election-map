// Shared shapes for the precinct page. Everything here is small: the page shell gets a slim per-state
// summary from the server; tiles, results and names are fetched per state by the browser.

export const OFFICES = ["PRES", "USS", "USSS", "GOV", "USH", "SLDU", "SLDL"] as const;
export type Office = (typeof OFFICES)[number];

export const OFFICE_LABEL: Record<Office, string> = {
  PRES: "President",
  USS: "U.S. Senate",
  USSS: "U.S. Senate (special)",
  GOV: "Governor",
  USH: "U.S. House",
  SLDU: "State Senate",
  SLDL: "State House",
};

export type OfficeSummary = { d: number; r: number; o: number; status: "reconciled" | "explained" | "loaded"; note?: string };

export type StateShell = {
  abbr: string;
  name: string;
  fips: string;
  n: number;
  first: number;
  bbox: [number, number, number, number];
  // year → office → statewide sums; an office absent from a year has no precinct data for it.
  years: Record<string, Partial<Record<Office, OfficeSummary>>>;
};

// public/precincts/results/{ST}/{year}.json
export type StateResults = {
  year: number;
  st: string;
  n: number;
  first_pid: number;
  offices: Partial<Record<Office, [number, number, number][]>>;
  districts: Partial<Record<Office, string[]>>;
  basis?: Partial<Record<Office, "slot" | "party">>;
  // Precincts that voted in more than one district's race for an office: the `offices` row is their sum
  // and `districts` names the larger part, so each district's own share is listed here as
  // [precinct index, district, D, R, other]. Absent when no precinct is split.
  split?: Partial<Record<Office, [number, string, number, number, number][]>>;
  // Percent (0-100) of each precinct's vote that was fitted from other boundaries or spread from a larger unit.
  est?: Partial<Record<Office, number[]>>;
};

// public/precincts/index/{ST}.json
export type StateIndex = { first: number; names: string[]; county: number[]; counties: [string, string][] };

export type Selection = { abbr: string; pid: number } | null;

/** R-positive margin in points, or null when nobody voted. */
export function marginOf(row: [number, number, number] | undefined): number | null {
  if (!row) return null;
  const total = row[0] + row[1] + row[2];
  return total > 0 ? ((row[1] - row[0]) / total) * 100 : null;
}

// The site's rating colours (lib/colorScale getRaceColor): Tilt under 1 point, Lean 1-5, Likely 5-15,
// Safe 15 and up, on each side. MARGIN_STEPS is the same scale as a MapLibre "step" expression body.
export const RATING_SCALE: { label: string; color: string }[] = [
  { label: "Safe D", color: "#1b408c" },
  { label: "Likely D", color: "#587ccc" },
  { label: "Lean D", color: "#8bafff" },
  { label: "Tilt D", color: "#959bb3" },
  { label: "Tilt R", color: "#cf8980" },
  { label: "Lean R", color: "#ff8b98" },
  { label: "Likely R", color: "#ff5864" },
  { label: "Safe R", color: "#be1c29" },
];
export const MARGIN_STEPS: (string | number)[] = ["#1b408c", -15, "#587ccc", -5, "#8bafff", -1, "#959bb3", 0, "#cf8980", 1, "#ff8b98", 5, "#ff5864", 15, "#be1c29"];

// public/precincts/demographics/{ST}.json: 2020 Census block counts summed to each 2024 precinct.
// Every column is a count by pid order, except medage (median age × 10; -1 where nobody lives).
export const DEMOGRAPHIC_FIELDS = ["pop", "vap", "white", "black", "hisp", "asian", "aian", "nhpi", "a18_34", "a35_49", "a50_64", "a65",
  "medage", "female", "hu", "occ", "own", "hhpop", "married", "alone", "kids"] as const;
export type DemographicField = (typeof DEMOGRAPHIC_FIELDS)[number];
/** public/precincts/locale/{ST}.json (scripts/precincts/build_locale.py): area type per precinct. */
export type StateLocale = {
  st: string; n: number; first_pid: number; labels: string[];
  rules: { metroMin: number; urbanDensity: number; urbanRel: number; radius: [number, number][] };
  cls: number[]; // 0 urban, 1 suburban, 2 exurban, 3 rural, -1 none
  dens: number[]; // housing units / sq mi where the residents live
  dist: number[]; // miles × 10 to the nearest metro urban area, 0 inside one
};
export type StateDemographics = { st: string; n: number; first_pid: number; cols: Record<DemographicField, number[]> };
