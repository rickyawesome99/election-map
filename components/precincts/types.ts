// Shared shapes for the precinct page. Everything here is small: the page shell gets a slim per-state
// summary from the server; tiles, results and names are fetched per state by the browser.

export const OFFICES = ["PRES", "USS", "GOV", "USH", "SLDU", "SLDL"] as const;
export type Office = (typeof OFFICES)[number];

export const OFFICE_LABEL: Record<Office, string> = {
  PRES: "President",
  USS: "U.S. Senate",
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
