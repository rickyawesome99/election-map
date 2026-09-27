import "server-only";

// ── Historical-results map slices ─────────────────────────────────────────────
// One slice = everything the /historical map needs to paint ONE geo level for ONE
// office and ONE year: a result per geography plus the national aggregate. Built here
// on the server from the county / district / state datasets (≈9 MB of TypeScript
// literals) and served as static JSON by app/api/map/[level]/[office]/[year], so
// none of that data reaches the browser bundle. NationalCountyMap.tsx fetches the
// slice for the current selection (~100–350 KB) and only renders.
//
// Everything below was lifted verbatim from NationalCountyMap.tsx — the same-party
// handling, special-election toggle rules and aggregate folding are unchanged.

import { countyPresidentialData, type CountyYearResult } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import {
  houseData, housePastResults, houseStatewideResults,
  senateData, senateNoElection, senateHoldovers,
  governorData, governorNoElection,
  presPastResults,
  type PastResult,
  type HouseStatewideResult,
} from "@/data/forecastData";
import { FIPS_TO_STATE } from "@/lib/fips";
import { withAtLargeAlias } from "@/lib/congressionalDistricts";
import {
  MAP_LEVELS, MAP_OFFICES, yearsForLevel,
  type MapLevel, type MapOffice, type MapSlice, type NormalizedResult, type SliceEntry,
} from "@/lib/mapSliceTypes";
export { MAP_LEVELS, MAP_OFFICES, yearsForLevel };
export type { MapLevel, MapOffice, MapSlice, NormalizedResult, SliceEntry };
type PresYear = 2008 | 2012 | 2016 | 2020 | 2024;

// ── Same-party handling ──────────────────────────────────────────────────────

/** Statewide races where BOTH the "dem" and "rep" slots were actually Democrats (CA's
 * top-two sending Harris/Sanchez in 2016 and Feinstein/de León in 2018 to the general). */
const SAME_PARTY_STATEWIDE_RACES: { race: string; year: number; state: string }[] = [
  { race: "Senate", year: 2016, state: "CA" },
  { race: "Senate", year: 2018, state: "CA" },
];

function isSamePartyStatewideRace(raceName: string, year: number, state: string): boolean {
  return SAME_PARTY_STATEWIDE_RACES.some((r) => r.race === raceName && r.year === year && r.state === state);
}

function applySamePartyResult(result: NormalizedResult, raceName: string, year: number, state: string): NormalizedResult {
  if (!isSamePartyStatewideRace(raceName, year, state)) return result;
  return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
}

/** House equivalent — reads the per-district repParty/demParty recorded on the PastResult. */
function applyHouseSamePartyResult(result: NormalizedResult, pr: PastResult): NormalizedResult {
  if (pr.repParty === "D") return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
  if (pr.demParty === "R") return { ...result, demIsRep: true, margin: Math.abs(result.margin) };
  return result;
}

/** For summing MANY House districts into ONE state-level number the fold has to happen on
 * the raw votes BEFORE combineVotesResults sums them. */
function trueHouseVotes(m: PastResult): Pick<PastResult, "demVotes" | "repVotes"> {
  if (m.demVotes == null || m.repVotes == null) return { demVotes: m.demVotes, repVotes: m.repVotes };
  if (m.repParty === "D") return { demVotes: m.demVotes + m.repVotes, repVotes: 0 };
  if (m.demParty === "R") return { demVotes: 0, repVotes: m.demVotes + m.repVotes };
  return { demVotes: m.demVotes, repVotes: m.repVotes };
}

// ── County level ─────────────────────────────────────────────────────────────

function normalizeCounty(r: CountyYearResult & { votesKnown?: boolean }): NormalizedResult {
  return {
    demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes,
    demPct: r.demPct, repPct: r.repPct, margin: r.margin,
    ...(r.votesKnown === false ? { votesKnown: false } : {}),
  };
}

function applySamePartyCountyResult(
  result: NormalizedResult | null, office: MapOffice, year: number, fips: string,
): NormalizedResult | null {
  if (!result || office !== "senate") return result;
  const stateAbbr = FIPS_TO_STATE[fips.slice(0, 2)]?.abbr;
  if (!stateAbbr || !isSamePartyStatewideRace("Senate", year, stateAbbr)) return result;
  return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
}

/** Single result for one county, for MAP COLORING — respects the "special elections only"
 * toggle: false prefers the regular race (special only as a fallback, e.g. AZ 2020); true
 * shows the special race only. */
function getCountyResult(office: MapOffice, year: number, fips: string, specialOnly = false): NormalizedResult | null {
  if (office === "president") {
    const r = countyPresidentialData[fips]?.years[year as PresYear];
    return r ? normalizeCounty(r) : null;
  }
  if (office === "senate") {
    const county = countySenateData[fips];
    const raw = specialOnly
      ? (county?.specialYears[year] ?? null)
      : (county?.years[year] ?? county?.specialYears[year] ?? null);
    return applySamePartyCountyResult(raw ? normalizeCounty(raw) : null, office, year, fips);
  }
  if (office === "governor") {
    const r = countyGovernorData[fips]?.years[year];
    return r ? normalizeCounty(r) : null;
  }
  const r = countyHouseData[fips]?.years[year];
  return r ? normalizeCounty(r) : null;
}

/** Every county-level result for the National Results aggregate — for senate, sums BOTH
 * the regular AND special race for a county that had both (GA 2020). */
function getAllCountyResults(office: MapOffice, year: number): NormalizedResult[] {
  const results: NormalizedResult[] = [];
  if (office === "senate") {
    for (const fips in countySenateData) {
      const county = countySenateData[fips];
      const reg = county?.years[year];
      const spec = county?.specialYears[year];
      const regN = applySamePartyCountyResult(reg ? normalizeCounty(reg) : null, office, year, fips);
      const specN = applySamePartyCountyResult(spec ? normalizeCounty(spec) : null, office, year, fips);
      if (regN) results.push(regN);
      if (specN) results.push(specN);
    }
    return results;
  }
  const store =
    office === "president" ? countyPresidentialData
    : office === "governor" ? countyGovernorData
    : countyHouseData;
  for (const fips in store) {
    const result = store[fips]?.years[year as PresYear];
    if (result) results.push(normalizeCounty(result));
  }
  return results;
}

function countyFipsFor(office: MapOffice): string[] {
  const store =
    office === "president" ? countyPresidentialData
    : office === "senate" ? countySenateData
    : office === "governor" ? countyGovernorData
    : countyHouseData;
  return Object.keys(store);
}

// ── Shared normalizers ───────────────────────────────────────────────────────

function normalizeVotesResult(
  demPct: number, repPct: number, demVotes?: number, repVotes?: number, totalVotes?: number,
): NormalizedResult {
  const votesKnown = demVotes != null && repVotes != null;
  return {
    demVotes: votesKnown ? demVotes! : 0,
    repVotes: votesKnown ? repVotes! : 0,
    totalVotes: votesKnown ? (totalVotes ?? demVotes! + repVotes!) : 0,
    demPct, repPct, margin: repPct - demPct, votesKnown,
  };
}

/** Sums several same-year results into one. Matches lacking vote counts are excluded from
 * the sum rather than treated as zero. */
function combineVotesResults(matches: PastResult[]): NormalizedResult | null {
  if (matches.length === 0) return null;
  let demVotes = 0, repVotes = 0, totalVotes = 0, anyVotesKnown = false;
  for (const m of matches) {
    if (m.demVotes == null || m.repVotes == null) continue;
    anyVotesKnown = true;
    demVotes += m.demVotes;
    repVotes += m.repVotes;
    totalVotes += m.totalVotes ?? m.demVotes + m.repVotes;
  }
  if (!anyVotesKnown) return null;
  const demPct = totalVotes > 0 ? (demVotes / totalVotes) * 100 : 0;
  const repPct = totalVotes > 0 ? (repVotes / totalVotes) * 100 : 0;
  return { demVotes, repVotes, totalVotes, demPct, repPct, margin: repPct - demPct, votesKnown: true };
}

/** Current-cycle district races merged with redistricted-away districts (housePastResults),
 * keyed by district GEOID. housePastResults wins on overlap. */
function mergedHouseResultsById(): Map<string, PastResult[]> {
  const byId = new Map<string, PastResult[]>();
  for (const race of houseData) byId.set(race.id, race.pastResults ?? []);
  for (const [id, results] of Object.entries(housePastResults)) byId.set(id, results);
  return byId;
}

function computeStatewideResult(office: MapOffice, year: number, abbr: string, specialOnly = false): NormalizedResult | null {
  if (office === "president") {
    const r = presPastResults[abbr]?.find((pr) => pr.year === year);
    return r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
  }
  if (office === "governor") {
    const race = governorData.find((r) => r.id === abbr);
    const noEl = !race ? governorNoElection.find((e) => e.abbr === abbr) : null;
    const past = race?.pastResults ?? noEl?.pastResults ?? [];
    const r = past.find((pr) => pr.year === year);
    return r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
  }
  if (office === "senate") {
    const seat1Race = senateData.find((r) => r.id === abbr);
    const seat1NoEl = !seat1Race ? senateNoElection.find((e) => e.abbr === abbr) : null;
    const seat2Race = senateData.find((r) => r.id === `${abbr}-2`);
    const seat2Holdover = !seat2Race ? senateHoldovers.find((e) => e.abbr === abbr) : null;
    const seat1Past = seat1Race?.pastResults ?? seat1NoEl?.pastResults ?? [];
    const seat2Past = seat2Race?.pastResults ?? seat2Holdover?.pastResults ?? [];
    const allMatches = [...seat1Past, ...seat2Past].filter((pr) => pr.year === year);
    const regularMatches = allMatches.filter((pr) => pr.electionType !== "Special");
    const matches = specialOnly
      ? allMatches.filter((pr) => pr.electionType === "Special")
      : regularMatches.length > 0 ? regularMatches : allMatches;
    const result = combineVotesResults(matches);
    return result ? applySamePartyResult(result, "Senate", year, abbr) : null;
  }
  return null;
}

// houseStatewideResults tags non-standard races with a suffix ("Senate Special",
// "Senate (Runoff)", "Senate Special (Runoff)").
const RACE_LABEL_FALLBACKS = ["", " (Runoff)", " Special", " Special (Runoff)"];
const RACE_LABEL_FALLBACKS_SPECIAL_ONLY = [" Special", " Special (Runoff)"];

function findRaceResult(results: HouseStatewideResult[], raceName: string, year: number, specialOnly = false): HouseStatewideResult | undefined {
  const fallbacks = specialOnly ? RACE_LABEL_FALLBACKS_SPECIAL_ONLY : RACE_LABEL_FALLBACKS;
  for (const suffix of fallbacks) {
    const r = results.find((res) => res.race === `${raceName}${suffix}` && res.year === year);
    if (r) return r;
  }
  return undefined;
}

function findAllRaceResults(results: HouseStatewideResult[], raceName: string, year: number): HouseStatewideResult[] {
  const out: HouseStatewideResult[] = [];
  const reg = results.find((r) => (r.race === raceName || r.race === `${raceName} (Runoff)`) && r.year === year);
  if (reg) out.push(reg);
  const spec = results.find((r) => (r.race === `${raceName} Special` || r.race === `${raceName} Special (Runoff)`) && r.year === year);
  if (spec) out.push(spec);
  return out;
}

const OFFICE_RACE_NAME: Record<Exclude<MapOffice, "house">, string> = { president: "President", senate: "Senate", governor: "Governor" };

// ── District level ───────────────────────────────────────────────────────────

type GeoResult = { label: string; stateAbbr: string; stateName: string; result: NormalizedResult | null };

function buildDistrictResults(office: MapOffice, year: number, specialOnly = false): Map<string, GeoResult> {
  const map = new Map<string, GeoResult>();
  if (office === "house") {
    for (const [id, results] of mergedHouseResultsById()) {
      const stateInfo = FIPS_TO_STATE[id.slice(0, 2)];
      if (!stateInfo) continue;
      const r = results.find((pr) => pr.year === year);
      let result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
      if (result && r) result = applyHouseSamePartyResult(result, r);
      map.set(id, { label: `${stateInfo.abbr}-${id.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  } else {
    const raceName = OFFICE_RACE_NAME[office];
    for (const [geoid, results] of Object.entries(houseStatewideResults)) {
      const stateInfo = FIPS_TO_STATE[geoid.slice(0, 2)];
      if (!stateInfo) continue;
      const r = findRaceResult(results, raceName, year, specialOnly);
      let result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
      if (result) result = applySamePartyResult(result, raceName, year, stateInfo.abbr);
      map.set(geoid, { label: `${stateInfo.abbr}-${geoid.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  }
  return map;
}

function collectDistrictAggregateResults(office: MapOffice, year: number): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  if (office === "house") {
    for (const [, results] of mergedHouseResultsById()) {
      const r = results.find((pr) => pr.year === year);
      if (r) out.push(applyHouseSamePartyResult(normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes), r));
    }
    return out;
  }
  const raceName = OFFICE_RACE_NAME[office];
  for (const [geoid, results] of Object.entries(houseStatewideResults)) {
    const stateInfo = FIPS_TO_STATE[geoid.slice(0, 2)];
    if (!stateInfo) continue;
    for (const r of findAllRaceResults(results, raceName, year)) {
      const result = normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes);
      out.push(applySamePartyResult(result, raceName, year, stateInfo.abbr));
    }
  }
  return out;
}

// ── State level ──────────────────────────────────────────────────────────────

function stateHouseMatches(fips: string, name: string, year: number): PastResult[] {
  const resultsById = new Map<string, PastResult[]>();
  for (const r of houseData) if (r.state === name) resultsById.set(r.id, r.pastResults ?? []);
  for (const [id, results] of Object.entries(housePastResults)) if (id.startsWith(fips)) resultsById.set(id, results);
  const matches: PastResult[] = [];
  for (const results of resultsById.values()) {
    const r = results.find((pr) => pr.year === year);
    if (r) matches.push(r);
  }
  return matches;
}

function buildStateResults(office: MapOffice, year: number, specialOnly = false): Map<string, GeoResult> {
  const map = new Map<string, GeoResult>();
  for (const [fips, info] of Object.entries(FIPS_TO_STATE)) {
    const { abbr, name } = info;
    const result = office === "house"
      // Fold each district's own repParty/demParty BEFORE summing (see trueHouseVotes).
      ? combineVotesResults(stateHouseMatches(fips, name, year).map((m) => ({ ...m, ...trueHouseVotes(m) })))
      : computeStatewideResult(office, year, abbr, specialOnly);
    map.set(fips, { label: name, stateAbbr: abbr, stateName: name, result });
  }
  return map;
}

function collectStateAggregateResults(office: MapOffice, year: number): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const [fips, info] of Object.entries(FIPS_TO_STATE)) {
    const { abbr, name } = info;
    if (office === "house") {
      const result = combineVotesResults(stateHouseMatches(fips, name, year).map((m) => ({ ...m, ...trueHouseVotes(m) })));
      if (result) out.push(result);
    } else if (office === "senate") {
      const seat1Race = senateData.find((r) => r.id === abbr);
      const seat1NoEl = !seat1Race ? senateNoElection.find((e) => e.abbr === abbr) : null;
      const seat2Race = senateData.find((r) => r.id === `${abbr}-2`);
      const seat2Holdover = !seat2Race ? senateHoldovers.find((e) => e.abbr === abbr) : null;
      const seat1Past = seat1Race?.pastResults ?? seat1NoEl?.pastResults ?? [];
      const seat2Past = seat2Race?.pastResults ?? seat2Holdover?.pastResults ?? [];
      for (const m of [...seat1Past, ...seat2Past].filter((pr) => pr.year === year)) {
        if (m.demVotes == null || m.repVotes == null) continue;
        const result = normalizeVotesResult(m.demPct, m.repPct, m.demVotes, m.repVotes, m.totalVotes);
        out.push(applySamePartyResult(result, "Senate", year, abbr));
      }
    } else {
      const result = computeStatewideResult(office, year, abbr);
      if (result) out.push(result);
    }
  }
  return out;
}

// ── Slice assembly ───────────────────────────────────────────────────────────

/** National aggregate with same-party rows folded into their true party — the ONE place
 * the two slots get combined (the per-unit tooltip keeps them on separate rows). */
function aggregate(results: NormalizedResult[]): MapSlice["aggregate"] {
  let demVotes = 0, repVotes = 0, totalVotes = 0, demUnits = 0, repUnits = 0;
  for (const r of results) {
    demVotes += r.repIsDem ? r.demVotes + r.repVotes : r.demIsRep ? 0 : r.demVotes;
    repVotes += r.repIsDem ? 0 : r.demIsRep ? r.demVotes + r.repVotes : r.repVotes;
    totalVotes += r.totalVotes;
    if (r.margin <= 0) demUnits++;
    else repUnits++;
  }
  return { demVotes, repVotes, totalVotes, demUnits, repUnits };
}

const houseDistrictNames = new Set(houseData.map((r) => r.name.toLowerCase()));

export function buildMapSlice(level: MapLevel, office: MapOffice, year: number): MapSlice {
  const entries: Record<string, SliceEntry> = {};
  const withSpecial = office === "senate";

  if (level === "county") {
    for (const fips of countyFipsFor(office)) {
      const result = getCountyResult(office, year, fips, false);
      const special = withSpecial ? getCountyResult(office, year, fips, true) : null;
      if (!result && !special) continue;
      entries[fips] = withSpecial ? { result, special } : { result };
    }
    return { level, office, year, entries, aggregate: aggregate(getAllCountyResults(office, year)) };
  }

  if (level === "district") {
    const regular = buildDistrictResults(office, year, false);
    const special = withSpecial ? buildDistrictResults(office, year, true) : null;
    // The boundary files use the Census "XX00" at-large GEOID; the data uses "XX01".
    const aliased = new Map<string, GeoResult>();
    for (const [geoid, value] of regular) withAtLargeAlias(aliased, geoid, value);
    const specialAliased = new Map<string, GeoResult>();
    if (special) for (const [geoid, value] of special) withAtLargeAlias(specialAliased, geoid, value);
    for (const [geoid, gr] of aliased) {
      entries[geoid] = {
        result: gr.result,
        ...(withSpecial ? { special: specialAliased.get(geoid)?.result ?? null } : {}),
        label: gr.label,
        stateAbbr: gr.stateAbbr,
        stateName: gr.stateName,
        // A district's "More Info" points at /house/[id] whenever that district has current
        // House race data, regardless of the office being viewed; else the state page.
        moreInfoHref: houseDistrictNames.has(gr.label.toLowerCase()) ? `/house/${gr.label.toLowerCase()}` : `/states/${gr.stateAbbr.toLowerCase()}`,
      };
    }
    return { level, office, year, entries, aggregate: aggregate(collectDistrictAggregateResults(office, year)) };
  }

  const regular = buildStateResults(office, year, false);
  const special = withSpecial ? buildStateResults(office, year, true) : null;
  for (const [fips, gr] of regular) {
    entries[fips] = {
      result: gr.result,
      ...(withSpecial ? { special: special?.get(fips)?.result ?? null } : {}),
      label: gr.label,
      stateAbbr: gr.stateAbbr,
      stateName: gr.stateName,
      moreInfoHref: `/states/${gr.stateAbbr.toLowerCase()}`,
    };
  }
  return { level, office, year, entries, aggregate: aggregate(collectStateAggregateResults(office, year)) };
}

/** Every (level, office, year) combination the map can show — the static params for the
 * route handler, so each slice is written once at build time. */
export function allMapSliceParams(): { level: MapLevel; office: MapOffice; year: string }[] {
  const out: { level: MapLevel; office: MapOffice; year: string }[] = [];
  for (const level of MAP_LEVELS) {
    for (const office of MAP_OFFICES) {
      for (const year of yearsForLevel(office, level)) out.push({ level, office, year: String(year) });
    }
  }
  return out;
}
