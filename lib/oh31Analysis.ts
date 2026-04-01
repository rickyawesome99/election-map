import type { OH31Precinct } from "@/data/oh31PrecinctData";

export type OH31RaceKey = "pres" | "senate" | "uSHouse" | "stRep";

export const TOWNSHIP_OPTIONS = [
  { value: "all", label: "All precincts" },
  { value: "barberton", label: "Barberton" },
  { value: "bath", label: "Bath" },
  { value: "boston_heights", label: "Boston Heights" },
  { value: "boston_twp", label: "Boston Twp" },
  { value: "copley", label: "Copley" },
  { value: "cuyahoga_falls", label: "Cuyahoga Falls" },
  { value: "norton", label: "Norton" },
  { value: "peninsula", label: "Peninsula" },
  { value: "richfield_township", label: "Richfield Township" },
  { value: "richfield_village", label: "Richfield Village" },
] as const;

export type TownshipFilter = (typeof TOWNSHIP_OPTIONS)[number]["value"];

/** Match a canonical township name (from precinct.township) against a filter value. */
export function matchesTownshipFilter(township: string, filter: TownshipFilter): boolean {
  if (filter === "all") return true;
  return township.toLowerCase().replace(/\s+/g, "_") === filter;
}

export function filterPrecincts(data: OH31Precinct[], filter: TownshipFilter): OH31Precinct[] {
  return data.filter((p) => matchesTownshipFilter(p.township, filter));
}

export function sumRace(data: OH31Precinct[], key: OH31RaceKey) {
  return data.reduce(
    (acc, precinct) => ({
      d: acc.d + precinct[key].dVotes,
      r: acc.r + precinct[key].rVotes,
    }),
    { d: 0, r: 0 }
  );
}
