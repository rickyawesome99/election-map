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

export function matchesTownship(precinctName: string, township: TownshipFilter): boolean {
  if (township === "all") return true;
  if (township === "barberton") return precinctName.startsWith("BARBERTON ");
  if (township === "bath") return precinctName.startsWith("BATH TWP ");
  if (township === "boston_heights") return precinctName.startsWith("BOSTON HTS ");
  if (township === "boston_twp") return precinctName === "BOSTON TWP";
  if (township === "copley") return precinctName.startsWith("COPLEY TWP ");
  if (township === "cuyahoga_falls") return precinctName.startsWith("CUY FALLS ");
  if (township === "norton") return precinctName.startsWith("NORTON ");
  if (township === "peninsula") return precinctName.startsWith("PENINSULA ");
  if (township === "richfield_township") return precinctName.startsWith("RICHFIELD TWP ");
  if (township === "richfield_village") return precinctName.startsWith("RICHFIELD VILL ");
  return true;
}

export function filterPrecincts(data: OH31Precinct[], township: TownshipFilter): OH31Precinct[] {
  return data.filter((precinct) => matchesTownship(precinct.precinct, township));
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
