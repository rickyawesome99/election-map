// The list of districts that have a precinct analysis page, and their data. Adding a district is
// one folder under data/precinct-districts/ (see scripts/build-precinct-district.py) plus one
// entry here — the JSON is imported statically so the page renders at build time.

import type { DistrictConfig, DistrictCrosswalk, DistrictDemographics, DistrictResults, PrecinctDistrictData } from "./types";

import oh31Config from "@/data/precinct-districts/oh-hd-31/district.json";
import oh31Results from "@/data/precinct-districts/oh-hd-31/results.json";
import oh31Demographics from "@/data/precinct-districts/oh-hd-31/demographics.json";
import oh31Crosswalk from "@/data/precinct-districts/oh-hd-31/crosswalk.json";

const DISTRICTS: Record<string, PrecinctDistrictData> = {
  "oh-hd-31": {
    config: oh31Config as unknown as DistrictConfig,
    results: oh31Results as unknown as DistrictResults,
    demographics: oh31Demographics as unknown as DistrictDemographics,
    crosswalk: oh31Crosswalk as unknown as DistrictCrosswalk,
  },
};

export function precinctDistrictSlugs(): string[] {
  return Object.keys(DISTRICTS);
}

export function getPrecinctDistrict(slug: string): PrecinctDistrictData | null {
  return DISTRICTS[slug] ?? null;
}

/** Old URLs that should land on a district page. */
export const PRECINCT_DISTRICT_ALIASES: Record<string, string> = {
  "oh-31": "oh-hd-31",
};
