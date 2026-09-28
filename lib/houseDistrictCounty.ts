import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// U.S. House results by (district, county), 2016–2024 — data-entry/house_district_county_results.csv,
// built by scripts/build-house-district-county-results.py. Unlike data/countyHouseData.ts (a county's
// SUM across every district touching it, for the county pages) a split county has one row per
// district here. Read with fs on the server so none of its ~20k rows reach the browser.

export type HouseDistrictCountySource = "maine-rcv" | "indiana" | "louisiana" | "openelections" | "wikipedia" | "district" | "aggregate" | "remainder" | "medsl";
export type HouseDistrictCountyStatus = "exact" | "close" | "final-round" | "first-round" | "unverified";

export type HouseDistrictCountyRow = {
  fips: string;
  name: string;
  dem: number;
  gop: number;
  oth: number;
  total: number;
  /** Where the district's rows came from (one source per district, never mixed with estimates):
   *  indiana / louisiana = state canvass, openelections = OpenElections county file, wikipedia =
   *  the race page's By-county table, district = the district lies wholly in this county so the
   *  row is the certified total, aggregate = single-district counties from the county file plus
   *  precinct roll-ups for shared counties, medsl = precinct roll-ups throughout. */
  source: HouseDistrictCountySource;
  /** The county is shared between districts on this year's map. */
  split: boolean;
  /** exact = the district's rows sum to its certified total (within 0.5%); close = within 2.5%,
   *  official county counts that differ slightly from the certified statewide figure; first-round =
   *  ranked-choice race, rows are the first-round counts; unverified = no source came close. */
  status: HouseDistrictCountyStatus;
  /** false when the Census county × district intersection has no piece for this pair. */
  hasGeometry: boolean;
};

/** Split counties the precinct file could not split at all; listed so the page can say so. */
export type HouseDistrictCountyGap = { fips: string; name: string };

type YearIndex = { rows: Map<string, HouseDistrictCountyRow[]>; gaps: Map<string, HouseDistrictCountyGap[]> };

let cache: YearIndex | null = null;

function load(): YearIndex {
  if (cache) return cache;
  const text = readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  const col = (n: string) => header.indexOf(n);
  const iYear = col("year"), iState = col("state"), iDistrict = col("district"), iFips = col("county_fips"),
    iName = col("county_name"), iDem = col("dem"), iGop = col("gop"), iOth = col("oth"), iTotal = col("total"),
    iSource = col("source"), iStatus = col("status"), iGeom = col("geometry"), iSplit = col("split");
  const rows = new Map<string, HouseDistrictCountyRow[]>();
  const gaps = new Map<string, HouseDistrictCountyGap[]>();
  for (let i = 1; i < lines.length; i++) {
    // County names never contain commas in this file (they come from the presidential CSV's
    // county_name column), so a plain split is safe.
    const c = lines[i].split(",");
    const year = c[iYear], state = c[iState], district = c[iDistrict];
    if (c[iStatus] === "missing") {
      // Which district(s) the county belongs to is unknown when the split failed, so the gap is
      // recorded against every district of that state-year; the page filters by its own counties.
      const key = `${year}:${state}`;
      const list = gaps.get(key);
      const gap = { fips: c[iFips], name: c[iName] };
      if (list) list.push(gap); else gaps.set(key, [gap]);
      continue;
    }
    const key = `${year}:${state}:${parseInt(district, 10)}`;
    const row: HouseDistrictCountyRow = {
      fips: c[iFips],
      name: c[iName],
      dem: parseInt(c[iDem], 10) || 0,
      gop: parseInt(c[iGop], 10) || 0,
      oth: parseInt(c[iOth], 10) || 0,
      total: parseInt(c[iTotal], 10) || 0,
      source: (["maine-rcv", "indiana", "louisiana", "openelections", "wikipedia", "district", "aggregate", "remainder", "medsl"].includes(c[iSource]) ? c[iSource] : "medsl") as HouseDistrictCountySource,
      split: c[iSplit] === "yes",
      status: (["exact", "close", "final-round", "first-round", "unverified"].includes(c[iStatus]) ? c[iStatus] : "exact") as HouseDistrictCountyStatus,
      hasGeometry: c[iGeom] !== "no",
    };
    const list = rows.get(key);
    if (list) list.push(row); else rows.set(key, [row]);
  }
  cache = { rows, gaps };
  return cache;
}

export function houseDistrictCountyRows(year: number, stateAbbr: string, district: number): HouseDistrictCountyRow[] {
  return load().rows.get(`${year}:${stateAbbr}:${district}`) ?? [];
}

/** Split counties in this state-year that have no district breakdown at all. */
export function houseDistrictCountyGaps(year: number, stateAbbr: string): HouseDistrictCountyGap[] {
  return load().gaps.get(`${year}:${stateAbbr}`) ?? [];
}
