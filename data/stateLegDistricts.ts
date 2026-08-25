// Per-district state legislature data. Infrastructure only for now — populated per state as
// 2026 district shapefiles and results are sourced. Until then, individual legislature pages
// render an empty-state map/table built against these same types.

export type Chamber = "house" | "senate";

export type StateLegDistrict = {
  id: string;                                          // e.g. "oh-house-12"
  chamber: Chamber;
  number: string;                                       // "12", "12A"
  label: string;                                        // "District 12"
  incumbent?: { name: string; party: "D" | "R" | "I" } | null;
  margin?: number | null;                                // most recent result margin, + = R, - = D
  rating?: string | null;
};

// Keyed by state abbreviation, then chamber. Empty until real district data is added.
export const stateLegDistricts: Record<string, Partial<Record<Chamber, StateLegDistrict[]>>> = {};

// Nebraska's Legislature is unicameral and officially nonpartisan.
export const UNICAMERAL_STATES: ReadonlySet<string> = new Set(["NE"]);
