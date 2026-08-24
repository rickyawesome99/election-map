"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { countyPresidentialData, type CountyYearResult } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { electionCalendar, senateSpecialCalendar, type CountyRaceType } from "@/data/electionCalendar";
import {
  houseData, housePastResults, houseStatewideResults,
  senateData, senateNoElection, senateHoldovers,
  governorData, governorNoElection,
  presPastResults,
  type PastResult,
  type HouseStatewideResult,
} from "@/data/forecastData";
import { getRaceColor, marginToRating, getRatingColors } from "@/lib/colorScale";
import { FIPS_TO_STATE } from "@/lib/fips";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid, withAtLargeAlias } from "@/lib/congressionalDistricts";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";
import { popVoteData } from "@/data/popVoteData";

type RaceType = "president" | CountyRaceType;
type PresYear = 2008 | 2012 | 2016 | 2020 | 2024;
type GeoLevel = "county" | "district" | "state";
type MapView = { center: [number, number]; zoom: number };

const DEFAULT_MAP_CENTER: [number, number] = [-96.6, 38.7];

/** Every senate year where at least one state held BOTH a regular and a special
 * election (per senate_past_results.csv's type="Special" rows — see
 * data/electionCalendar.ts's senateSpecialCalendar). Drives whether the "special
 * elections only" toggle button appears at all for the currently-selected year. */
const SENATE_DOUBLE_YEARS = new Set(Object.values(senateSpecialCalendar).flat());

/** A single normalized result, regardless of which geography/dataset it came from. demPct/
 * repPct are each a SHARE OF totalVotes (D+R+Other all sum to 100), not a two-party share
 * — totalVotes may exceed demVotes+repVotes whenever a third party/other candidate drew
 * real votes. votesKnown is false for uncontested races the source data reports as pct-only
 * (no vote counts) — demVotes/repVotes/totalVotes are 0 in that case (safe to sum, since 0
 * doesn't distort a total), but callers must gate on votesKnown before *displaying* them as
 * if they were real. Absent defaults to known - true for almost all county data, except a
 * handful of House counties whose only district that cycle was a literal 0/0 unopposed
 * race (no source has real vote data for it) - those carry an explicit `votesKnown:
 * false` on their `CountyYearResult` (see data/countyHouseData.ts) so the map can still
 * color them by the known 100/0 outcome without fabricating a vote count. */
type NormalizedResult = {
  demVotes: number; repVotes: number; totalVotes: number;
  demPct: number; repPct: number; margin: number;
  votesKnown?: boolean;
  /** True for a same-party race (see SAME_PARTY_STATEWIDE_RACES) whose "rep slot" candidate
   * is actually a Democrat — repVotes/repPct/repVotes stay that candidate's own real count
   * (never merged into demVotes), but the UI should render that row's LABEL and COLOR as
   * Dem, not Rep, the same way RaceDetailSections.tsx's demParty/repParty override does on
   * /senate/ca. */
  repIsDem?: boolean;
  /** Mirror of repIsDem for the reverse same-party shape (the "dem slot" candidate is
   * actually a Republican, e.g. WA-04's Newhouse-vs-Didier — see applyHouseSamePartyResult).
   * demVotes/demPct stay that candidate's own real count; UI renders that row as Rep. */
  demIsRep?: boolean;
};

/** A geography's data-derived identity + result, independent of geoLevel. */
type GeoResult = {
  label: string;
  stateAbbr: string;
  stateName: string;
  result: NormalizedResult | null;
};

/** What's shown in the hover tooltip / selected panel, unified across geoLevels. */
type Selection = {
  key: string;
  title: string;
  subtitle: string;
  hasElection: boolean;
  result: NormalizedResult | null;
  moreInfoHref: string | null;
};

/** Statewide races where BOTH the "dem" and "rep" slots (per this project's bucket
 * convention — see senate_past_results.csv) were actually Democrats, e.g. CA's top-two
 * primary sending Harris/Sanchez (2016) and Feinstein/de León (2018) to the general. The
 * seat is guaranteed Democratic regardless of which of the two wins a given district,
 * county, or state — matching how the rest of the site treats a same-party race
 * (RaceDetailSections.tsx's PastElectionResultsSection colors/labels BOTH candidates Dem
 * via demParty/repParty, e.g. "Kevin de León (D)" rendered in blue on /senate/ca, while
 * each candidate keeps their OWN separate vote count — the two are never combined into one
 * number there). applySamePartyResult/applySamePartyCountyResult below reproduce that same
 * "second slot becomes another Dem slot" treatment here: repVotes/repPct are left exactly
 * as recorded (that candidate's real, separate count — never merged into demVotes/demPct),
 * only the `repIsDem` flag is set so the UI renders that row's label/color as Dem instead
 * of Rep, and `margin`'s sign is normalized so the map/badge never reads red (it still
 * reflects the real spread between the two Democrats, just always on the blue side).
 * Applies uniformly at State (computeStatewideResult/collectStateAggregateResults),
 * District (buildDistrictResults/collectDistrictAggregateResults), and County
 * (getCountyResult/getAllCountyResults) — all three geo levels store the real
 * per-candidate vote split in their underlying data (forecastData.ts / house_statewide_
 * results.csv / county_senate_results_*.csv via fetch-county-senate-ca-samedem.py), so
 * this is applied purely at display/aggregation time, not baked into any data file. */
const SAME_PARTY_STATEWIDE_RACES: { race: string; year: number; state: string }[] = [
  { race: "Senate", year: 2016, state: "CA" },
  { race: "Senate", year: 2018, state: "CA" },
];

function isSamePartyStatewideRace(raceName: string, year: number, state: string): boolean {
  return SAME_PARTY_STATEWIDE_RACES.some((r) => r.race === raceName && r.year === year && r.state === state);
}

/** Marks a same-party race's "rep slot" as Dem (repIsDem: true) and normalizes margin's
 * sign so the map/badge never reads red — repVotes/repPct are left untouched, still that
 * candidate's own real count. No-op for every non-same-party race/year/state. */
function applySamePartyResult(result: NormalizedResult, raceName: string, year: number, state: string): NormalizedResult {
  if (!isSamePartyStatewideRace(raceName, year, state)) return result;
  return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
}

/** House equivalent of applySamePartyResult — but House has far more jungle-primary
 * districts per cycle than Senate/Governor/President combined (e.g. 6 in CA alone for
 * 2022), too many to hardcode into a SAME_PARTY_STATEWIDE_RACES-style list. Instead reads
 * the PER-DISTRICT repParty/demParty field already recorded directly on the PastResult
 * itself (e.g. CA-15 2022's Mullin-vs-Canepa row is tagged repParty: "D") — the same field
 * RaceDetailSections.tsx already uses to color/label individual district pages correctly.
 * Handles both shapes: repParty "D" (the common CA/WA jungle-primary case, two Democrats)
 * and demParty "R" (the reverse — e.g. WA-04's Newhouse-vs-Didier, two Republicans). */
function applyHouseSamePartyResult(result: NormalizedResult, pr: PastResult): NormalizedResult {
  if (pr.repParty === "D") return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
  if (pr.demParty === "R") return { ...result, demIsRep: true, margin: Math.abs(result.margin) };
  return result;
}

/** For summing MANY House districts into ONE state-level number (buildStateResults/
 * collectStateAggregateResults) — unlike applyHouseSamePartyResult (which preserves each
 * candidate's own vote count for per-district display), the state total has no per-district
 * breakdown to preserve, so the fold has to happen on the raw votes themselves, per match,
 * BEFORE combineVotesResults sums them — otherwise a same-party district's votes can't be
 * un-mixed from an ordinary district's real Republican votes after summing. Preserves the
 * null-vs-known distinction (an uncontested race's missing demVotes/repVotes stay missing,
 * not coerced to 0) so combineVotesResults' votesKnown skip logic is unaffected. */
function trueHouseVotes(m: PastResult): Pick<PastResult, "demVotes" | "repVotes"> {
  if (m.demVotes == null || m.repVotes == null) return { demVotes: m.demVotes, repVotes: m.repVotes };
  if (m.repParty === "D") return { demVotes: m.demVotes + m.repVotes, repVotes: 0 };
  if (m.demParty === "R") return { demVotes: 0, repVotes: m.demVotes + m.repVotes };
  return { demVotes: m.demVotes, repVotes: m.repVotes };
}

/** CountyYearResult plus the same repIsDem flag NormalizedResult carries — countySenateData
 * itself never sets it (only applySamePartyCountyResult below does), but getCountyResult/
 * getAllCountyResults need to declare it in their return type so callers (e.g. the National
 * Results aggregate) can read it off a county result the same way they do a district/state
 * NormalizedResult. */
type CountyResult = CountyYearResult & { repIsDem?: boolean; demIsRep?: boolean };

/** applySamePartyResult's equivalent for a raw CountyYearResult (different field shape —
 * has othVotes, no votesKnown) — needed because countySenateData has no built-in
 * same-party awareness of its own. */
function applySamePartyCountyResult(
  result: CountyYearResult | null, raceType: RaceType, year: number, fips: string,
): CountyResult | null {
  if (!result || raceType !== "senate") return result;
  const stateAbbr = FIPS_TO_STATE[fips.slice(0, 2)]?.abbr;
  if (!stateAbbr || !isSamePartyStatewideRace("Senate", year, stateAbbr)) return result;
  return { ...result, repIsDem: true, margin: -Math.abs(result.margin) };
}

/** Single result for one county, for MAP COLORING / the click-to-select panel — respects
 * the "special elections only" toggle. `specialOnly` false (default): regular race
 * preferred, falling back to the special race only if that's the state's ONLY race that
 * year (e.g. AZ 2020, which never had a regular race). `specialOnly` true: special race
 * only — a state with no special that year (the common case) shows no result (greys out),
 * even if it had a regular race. See getAllCountyResults for the DIFFERENT "always sum
 * both" rule the National Results aggregate panel uses. */
function getCountyResult(raceType: RaceType, year: number, fips: string, specialOnly = false): CountyResult | null {
  if (raceType === "president") return countyPresidentialData[fips]?.years[year as PresYear] ?? null;
  if (raceType === "senate") {
    const county = countySenateData[fips];
    const result = specialOnly
      ? (county?.specialYears[year] ?? null)
      : (county?.years[year] ?? county?.specialYears[year] ?? null);
    return applySamePartyCountyResult(result, raceType, year, fips);
  }
  if (raceType === "governor") return countyGovernorData[fips]?.years[year] ?? null;
  if (raceType === "house") return countyHouseData[fips]?.years[year] ?? null;
  return null;
}

/** Every county-level result for the National Results aggregate — for senate, sums BOTH
 * the regular AND special race for a county that had both (e.g. GA 2020's Fulton County
 * contributes twice: once for Ossoff/Perdue, once for Warnock/Loeffler), independent of
 * the map's "special elections only" toggle, which only controls per-county MAP COLORING
 * (see getCountyResult) — the aggregate always reflects every Senate race held that year. */
function getAllCountyResults(raceType: RaceType, year: number): CountyResult[] {
  const results: CountyResult[] = [];
  if (raceType === "senate") {
    for (const fips in countySenateData) {
      const county = countySenateData[fips];
      const reg = applySamePartyCountyResult(county?.years[year] ?? null, raceType, year, fips);
      const spec = applySamePartyCountyResult(county?.specialYears[year] ?? null, raceType, year, fips);
      if (reg) results.push(reg);
      if (spec) results.push(spec);
    }
    return results;
  }
  const store =
    raceType === "president" ? countyPresidentialData
    : raceType === "governor" ? countyGovernorData
    : countyHouseData;
  for (const fips in store) {
    const result = store[fips]?.years[year as PresYear];
    if (result) results.push(result);
  }
  return results;
}

function hasElectionInState(raceType: RaceType, year: number, stateAbbr: string, specialOnly = false): boolean {
  if (raceType === "president") return true;
  if (raceType === "senate") {
    if (specialOnly) return senateSpecialCalendar[stateAbbr]?.includes(year) ?? false;
    return (electionCalendar.senate[stateAbbr]?.includes(year) ?? false) || (senateSpecialCalendar[stateAbbr]?.includes(year) ?? false);
  }
  return electionCalendar[raceType][stateAbbr]?.includes(year) ?? false;
}

// demPct/repPct always come from a real result (caller only invokes this when a race
// happened that year); demVotes/repVotes are missing only for uncontested races the
// source CSV recorded as pct-only, in which case we still color/count the race by margin
// but flag votesKnown: false so displays don't fabricate a "0 votes" line.
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

/** Sums several same-year results into one (e.g. two Senate seats up the same year, or
 * every House district in a state). Matches lacking vote counts (uncontested races) are
 * excluded from the sum — not treated as zero votes cast — but don't null out the whole
 * combined result the way an early bail-out would. demPct/repPct are each a share of the
 * combined totalVotes (not a two-party share), so any Other/third-party votes folded into
 * totalVotes correctly pull both below 100 rather than being silently absorbed. */
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

/** Merges current-cycle district races with redistricted-away districts (housePastResults),
 * keyed by district GEOID (e.g. "0101"). housePastResults wins on overlap, matching how
 * HousePastMap.tsx already resolves the same merge for a single state. */
function mergedHouseResultsById(): Map<string, PastResult[]> {
  const byId = new Map<string, PastResult[]>();
  for (const race of houseData) byId.set(race.id, race.pastResults ?? []);
  for (const [id, results] of Object.entries(housePastResults)) byId.set(id, results);
  return byId;
}

/** Computes a state's statewide result for president/governor/senate (house is
 * built differently — by summing real district-level results — so this returns null for
 * it), for MAP COLORING / the click-to-select panel — respects the "special elections
 * only" toggle the same way getCountyResult does: `specialOnly` false (default) prefers
 * the regular seat's race, falling back to the special seat's only if that's the state's
 * sole race that year (AZ 2020); `specialOnly` true shows the special race only. See
 * collectStateAggregateResults for the DIFFERENT "always sum both" rule the National
 * Results aggregate panel uses. */
function computeStatewideResult(raceType: RaceType, year: number, abbr: string, specialOnly = false): NormalizedResult | null {
  if (raceType === "president") {
    const r = presPastResults[abbr]?.find((pr) => pr.year === year);
    return r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
  }
  if (raceType === "governor") {
    const race = governorData.find((r) => r.id === abbr);
    const noEl = !race ? governorNoElection.find((e) => e.abbr === abbr) : null;
    const past = race?.pastResults ?? noEl?.pastResults ?? [];
    const r = past.find((pr) => pr.year === year);
    return r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
  }
  if (raceType === "senate") {
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

/** houseStatewideResults tags non-standard races with a suffix instead of the plain
 * "President"/"Senate"/"Governor" label (e.g. AZ 2020's only Senate race was a special
 * election, so it's "Senate Special"; GA 2020 had both a regular and a special Senate
 * race up at once — "Senate (Runoff)" and "Senate Special (Runoff)"). For MAP COLORING:
 * `specialOnly` false (default) tries the regular-family labels first, falling back to a
 * special-family label only if no regular race exists that year (AZ); `specialOnly` true
 * tries only the special-family labels. See findAllRaceResults for the district-level
 * National Results aggregate, which needs BOTH regardless of this toggle. */
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

/** For the district-level National Results aggregate — returns EVERY matching race for a
 * geoid+year (a regular-family match AND a special-family match, if both exist), unlike
 * findRaceResult (used for map coloring) which only ever returns one. */
function findAllRaceResults(results: HouseStatewideResult[], raceName: string, year: number): HouseStatewideResult[] {
  const out: HouseStatewideResult[] = [];
  const reg = results.find((r) => (r.race === raceName || r.race === `${raceName} (Runoff)`) && r.year === year);
  if (reg) out.push(reg);
  const spec = results.find((r) => (r.race === `${raceName} Special` || r.race === `${raceName} Special (Runoff)`) && r.year === year);
  if (spec) out.push(spec);
  return out;
}

/** Builds one GeoResult per real congressional district (keyed by the data's own GEOID
 * convention — "XX01" for at-large, not the Census "XX00"), for the given race+year — for
 * MAP COLORING, so respects the "special elections only" toggle (see findRaceResult). */
function buildDistrictResults(raceType: RaceType, year: number, specialOnly = false): Map<string, GeoResult> {
  const map = new Map<string, GeoResult>();
  if (raceType === "house") {
    for (const [id, results] of mergedHouseResultsById()) {
      const stateFips = id.slice(0, 2);
      const stateInfo = FIPS_TO_STATE[stateFips];
      if (!stateInfo) continue;
      const r = results.find((pr) => pr.year === year);
      let result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
      if (result && r) result = applyHouseSamePartyResult(result, r);
      map.set(id, { label: `${stateInfo.abbr}-${id.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  } else {
    const raceName = raceType === "president" ? "President" : raceType === "senate" ? "Senate" : "Governor";
    for (const [geoid, results] of Object.entries(houseStatewideResults)) {
      const stateFips = geoid.slice(0, 2);
      const stateInfo = FIPS_TO_STATE[stateFips];
      if (!stateInfo) continue;
      const r = findRaceResult(results, raceName, year, specialOnly);
      let result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
      if (result) result = applySamePartyResult(result, raceName, year, stateInfo.abbr);
      map.set(geoid, { label: `${stateInfo.abbr}-${geoid.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  }
  return map;
}

/** For the district-level National Results aggregate — sums EVERY district's race(s) for
 * the year, both regular AND special where a state had both (e.g. every GA district
 * contributes both its Ossoff/Perdue AND its Warnock/Loeffler numbers), independent of
 * the map's "special elections only" toggle. Returns a flat array rather than a
 * geoid-keyed Map since a double state's district contributes two separate results. */
function collectDistrictAggregateResults(raceType: RaceType, year: number): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  if (raceType === "house") {
    for (const [, results] of mergedHouseResultsById()) {
      const r = results.find((pr) => pr.year === year);
      if (r) out.push(applyHouseSamePartyResult(normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes), r));
    }
    return out;
  }
  const raceName = raceType === "president" ? "President" : raceType === "senate" ? "Senate" : "Governor";
  for (const [geoid, results] of Object.entries(houseStatewideResults)) {
    const stateFips = geoid.slice(0, 2);
    const stateInfo = FIPS_TO_STATE[stateFips];
    if (!stateInfo) continue;
    for (const r of findAllRaceResults(results, raceName, year)) {
      const result = normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes);
      out.push(applySamePartyResult(result, raceName, year, stateInfo.abbr));
    }
  }
  return out;
}

/** Builds one GeoResult per state (keyed by 2-digit state FIPS, matching states-10m.json)
 * — for MAP COLORING, so respects the "special elections only" toggle (see
 * computeStatewideResult). */
function buildStateResults(raceType: RaceType, year: number, specialOnly = false): Map<string, GeoResult> {
  const map = new Map<string, GeoResult>();
  for (const [fips, info] of Object.entries(FIPS_TO_STATE)) {
    const { abbr, name } = info;
    let result: NormalizedResult | null = null;

    if (raceType === "house") {
      const resultsById = new Map<string, PastResult[]>();
      for (const r of houseData) if (r.state === name) resultsById.set(r.id, r.pastResults ?? []);
      for (const [id, results] of Object.entries(housePastResults)) if (id.startsWith(fips)) resultsById.set(id, results);
      const matches: PastResult[] = [];
      for (const results of resultsById.values()) {
        const r = results.find((pr) => pr.year === year);
        if (r) matches.push(r);
      }
      // Fold each district's own repParty/demParty BEFORE summing (see trueHouseVotes) —
      // once combined into one state total there's no way to un-mix a jungle-primary
      // district's votes from an ordinary district's real Republican votes after the fact.
      result = combineVotesResults(matches.map((m) => ({ ...m, ...trueHouseVotes(m) })));
    } else {
      result = computeStatewideResult(raceType, year, abbr, specialOnly);
    }

    map.set(fips, { label: name, stateAbbr: abbr, stateName: name, result });
  }
  return map;
}

/** For the state-level National Results aggregate — sums EVERY state's race(s) for the
 * year. Senate pushes each seat's match as its OWN entry (not combined into one, unlike
 * the old pre-toggle behavior) so a double state (e.g. MN 2018) contributes both
 * Klobuchar's and Smith's results separately to the total, same "always both" rule
 * collectDistrictAggregateResults/getAllCountyResults use — independent of the map's
 * "special elections only" toggle. President/governor/house never have a special-election
 * concept in this dataset, so their aggregate is just the normal single result. */
function collectStateAggregateResults(raceType: RaceType, year: number): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const [fips, info] of Object.entries(FIPS_TO_STATE)) {
    const { abbr, name } = info;
    if (raceType === "house") {
      const resultsById = new Map<string, PastResult[]>();
      for (const r of houseData) if (r.state === name) resultsById.set(r.id, r.pastResults ?? []);
      for (const [id, results] of Object.entries(housePastResults)) if (id.startsWith(fips)) resultsById.set(id, results);
      const matches: PastResult[] = [];
      for (const results of resultsById.values()) {
        const r = results.find((pr) => pr.year === year);
        if (r) matches.push(r);
      }
      const result = combineVotesResults(matches.map((m) => ({ ...m, ...trueHouseVotes(m) })));
      if (result) out.push(result);
    } else if (raceType === "senate") {
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
      const result = computeStatewideResult(raceType, year, abbr);
      if (result) out.push(result);
    }
  }
  return out;
}

const RACE_TYPES: { key: RaceType; label: string }[] = [
  { key: "president", label: "President" },
  { key: "governor", label: "Governor" },
  { key: "senate", label: "Senate" },
  { key: "house", label: "House" },
];

// President's underlying county data (countyPresidentialData.ts) also has 2008 and 2012 —
// omitted here to keep the year picker to one row; those years still show on individual
// county pages.
const YEARS_BY_TYPE: Record<RaceType, number[]> = {
  president: [2024, 2020, 2016],
  governor: [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
  senate: [2024, 2022, 2020, 2018, 2016],
  house: [2024, 2022, 2020, 2018, 2016],
};

// District/State views are built from house_statewide_results.csv, president_past_results.csv,
// etc., which only go back to 2016.
const DISTRICT_STATE_MIN_YEAR: Partial<Record<RaceType, number>> = { president: 2016 };

function getYearsForLevel(raceType: RaceType, geoLevel: GeoLevel): number[] {
  const years = YEARS_BY_TYPE[raceType];
  if (geoLevel === "county") return years;
  const minYear = DISTRICT_STATE_MIN_YEAR[raceType];
  return minYear ? years.filter((y) => y >= minYear) : years;
}

const GEO_LEVELS: { key: GeoLevel; label: string }[] = [
  { key: "state", label: "State" },
  { key: "district", label: "District" },
  { key: "county", label: "County" },
];

const MAP_LEGEND = [
  { color: "#1a4480", label: "Safe D" },
  { color: "#4275b5", label: "Likely D" },
  { color: "#82b4f0", label: "Lean D" },
  { color: "#aecef5", label: "Tilt D" },
  { color: "#f5aeae", label: "Tilt R" },
  { color: "#f08282", label: "Lean R" },
  { color: "#c04040", label: "Likely R" },
  { color: "#8b1a1a", label: "Safe R" },
];

const UNIT_LABEL: Record<GeoLevel, string> = {
  county: "Counties",
  district: "Districts",
  state: "States",
};

const COUNTIES_URL = "/us-counties.json";
const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type GeoFeature = {
  rsmKey: string;
  id?: string | number;
  properties?: Record<string, string | undefined>;
};

type DistrictGeoFeature = WindableGeography & {
  rsmKey: string;
  properties?: { GEOID?: string };
};

function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

function marginLabel(margin: number): string {
  return margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}` : `R+${margin.toFixed(1)}`;
}

/** Bold state-line overlay, non-interactive, shared across all three geoLevels for a
 * consistent look — county/district fills sit below the actual state boundaries. */
function StateOutlines({ t }: { t: Theme }) {
  return (
    <Geographies geography={STATES_URL}>
      {({ geographies }: { geographies: GeoFeature[] }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            style={{
              default: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
              hover:   { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
              pressed: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
            }}
          />
        ))
      }
    </Geographies>
  );
}

/** Dem/Rep rows + votes line (or a no-data message). Margin itself is rendered by the
 * caller, since the hover tooltip and selected panel put it in different spots. */
function ResultDetails({
  sel, isPresident, raceLabel, year, t, showVotesInRows,
}: {
  sel: Selection; isPresident: boolean; raceLabel: string; year: number; t: Theme; showVotesInRows: boolean;
}) {
  const { result, hasElection } = sel;
  if (!result) {
    const msg = isPresident ? `No ${year} data` : hasElection ? `${raceLabel} data coming soon` : `No ${raceLabel} election in ${year}`;
    return <div className="text-[9px]" style={{ color: t.textVeryMuted }}>{msg}</div>;
  }
  const votesKnown = result.votesKnown !== false;
  // A same-party race (see SAME_PARTY_STATEWIDE_RACES / applyHouseSamePartyResult) means
  // one slot's candidate is actually the OTHER party — that row keeps its own real vote
  // count (never merged into the other row), but reads/colors as its true party instead,
  // matching how /senate/ca colors/labels both Feinstein and de León blue.
  const demColor = result.demIsRep ? t.repText : t.demText;
  const demLabel = result.demIsRep ? "Rep" : "Dem";
  const repColor = result.repIsDem ? t.demText : t.repText;
  const repLabel = result.repIsDem ? "Dem" : "Rep";
  return (
    <>
      <div>
        <div className="flex justify-between items-baseline">
          <span style={{ color: demColor, fontSize: 10 }}>{demLabel}</span>
          <span className="font-semibold" style={{ color: demColor, fontSize: 10 }}>
            {showVotesInRows && votesKnown ? `${result.demVotes.toLocaleString()} · ` : ""}{result.demPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span style={{ color: repColor, fontSize: 10 }}>{repLabel}</span>
          <span className="font-semibold" style={{ color: repColor, fontSize: 10 }}>
            {showVotesInRows && votesKnown ? `${result.repVotes.toLocaleString()} · ` : ""}{result.repPct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="mt-0.5 text-[9px]" style={{ color: votesKnown ? t.textMuted : t.textVeryMuted }}>
        {votesKnown
          ? `${result.totalVotes.toLocaleString()} ${showVotesInRows ? "total " : ""}votes (${year})`
          : `Uncontested — vote count not available (${year})`}
      </div>
    </>
  );
}

export default function NationalCountyMap({ theme: t }: { theme: Theme }) {
  const [geoLevel, setGeoLevel] = useState<GeoLevel>("county");
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [mapView, setMapView] = useState<MapView>({ center: DEFAULT_MAP_CENTER, zoom: 1 });
  const [viewChanged, setViewChanged] = useState(false);
  const [raceType, setRaceType] = useState<RaceType>("president");
  const [year, setYear] = useState<number>(2024);
  // "Special elections only" toggle — only meaningful for senate on a year where at
  // least one state held both a regular and a special race (SENATE_DOUBLE_YEARS).
  const [specialOnly, setSpecialOnly] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  // Last intentionally-settled pan/zoom (as opposed to whatever react-simple-maps'
  // internal d3-zoom transform currently is, which can drift by a pixel or two from a
  // plain click — see gestureRef below).
  const settledViewRef = useRef<MapView>({ center: DEFAULT_MAP_CENTER, zoom: 1 });
  // Tracks pixel translate + zoom across a single zoom/pan gesture (mousedown..mouseup),
  // populated via onMove. d3-zoom has no click/drag distance tolerance of its own — any
  // pointer movement during a click, even 1-2px of natural hand jitter, gets committed as
  // a real pan and never snaps back. We detect that case in onMoveEnd and revert it.
  const gestureRef = useRef<{ startX: number; startY: number; startK: number; lastX: number; lastY: number; lastK: number } | null>(null);

  function selectRaceType(rt: RaceType) {
    setRaceType(rt);
    const years = getYearsForLevel(rt, geoLevel);
    if (!years.includes(year)) setYear(years[0]);
    setSelected(null);
  }

  function selectGeoLevel(level: GeoLevel) {
    setGeoLevel(level);
    const years = getYearsForLevel(raceType, level);
    if (!years.includes(year)) setYear(years[0]);
    setSelected(null);
    setHovered(null);
  }

  function selectYear(y: number) {
    setYear(y);
    setSelected(null);
  }

  function resetView() {
    const reset = { center: DEFAULT_MAP_CENTER, zoom: 1 };
    settledViewRef.current = reset;
    setMapView(reset);
    setViewChanged(false);
  }

  const isPresident = raceType === "president";
  const raceLabel = RACE_TYPES.find((r) => r.key === raceType)!.label;
  const unitLabel = UNIT_LABEL[geoLevel];
  const hasSpecialThisYear = raceType === "senate" && SENATE_DOUBLE_YEARS.has(year);
  const seatCount = popVoteData.find(
    (row) => row.year === year && row.type.toLowerCase() === raceType,
  );
  const seatLabel = raceType === "president" ? "Electoral votes" : `${raceLabel} seats`;

  // The toggle button disappears whenever it wouldn't apply (wrong office, or a senate
  // year with no double election) — reset its state too so it doesn't come back silently
  // pre-toggled if the user navigates back to a double year later.
  useEffect(() => {
    if (!hasSpecialThisYear) setSpecialOnly(false);
  }, [hasSpecialThisYear]);

  // District's "More Info" link should point at its /house/[id] page (the closest thing
  // to a dedicated district page) whenever that district has current House race data,
  // regardless of which raceType is being viewed — falls back to the state page otherwise.
  const houseDistrictNames = useMemo(() => new Set(houseData.map((r) => r.name.toLowerCase())), []);

  // Only the active geoLevel's lookup is built — county view uses direct object lookups
  // (getCountyResult) instead, so it needs no upfront map.
  const districtResults = useMemo(
    () => (geoLevel === "district" ? buildDistrictResults(raceType, year, specialOnly) : null),
    [geoLevel, raceType, year, specialOnly],
  );
  const districtRenderMap = useMemo(() => {
    if (!districtResults) return null;
    const m = new Map<string, GeoResult>();
    for (const [geoid, value] of districtResults) withAtLargeAlias(m, geoid, value);
    return m;
  }, [districtResults]);
  const stateResults = useMemo(
    () => (geoLevel === "state" ? buildStateResults(raceType, year, specialOnly) : null),
    [geoLevel, raceType, year, specialOnly],
  );

  // The National Results aggregate ALWAYS sums every Senate race held that year (regular
  // + special where a state had both) regardless of the toggle above, which only controls
  // per-unit MAP COLORING — see getAllCountyResults/collectDistrictAggregateResults/
  // collectStateAggregateResults's own docs. demPct/repPct are each a share of the summed
  // totalVotes (D+R+Other all sum to 100), not a two-party share, so Other/third-party
  // votes nationally reduce both rather than being silently folded into D or R. A
  // same-party result (r.repIsDem/r.demIsRep — see SAME_PARTY_STATEWIDE_RACES for
  // Senate/Governor/President, applyHouseSamePartyResult for House) folds its "wrong slot"
  // votes into the true-party total here, unlike the per-unit tooltip (ResultDetails),
  // which keeps that candidate's own count on a separate row — this is the ONE place the
  // two get combined, since the national total should count every vote by its candidate's
  // real party regardless of which data slot it's recorded in; an ordinary Dem-vs-Rep race
  // is untouched (neither flag is set, so dem stays dem and rep stays rep as always).
  const stats = useMemo(() => {
    const results =
      geoLevel === "county" ? getAllCountyResults(raceType, year)
      : geoLevel === "district" ? collectDistrictAggregateResults(raceType, year)
      : collectStateAggregateResults(raceType, year);
    let demVotes = 0, repVotes = 0, totalVotes = 0, demUnits = 0, repUnits = 0;
    for (const r of results) {
      demVotes += r.repIsDem ? r.demVotes + r.repVotes : r.demIsRep ? 0 : r.demVotes;
      repVotes += r.repIsDem ? 0 : r.demIsRep ? r.demVotes + r.repVotes : r.repVotes;
      totalVotes += r.totalVotes;
      if (r.margin <= 0) demUnits++;
      else repUnits++;
    }
    const demPct = totalVotes > 0 ? (demVotes / totalVotes) * 100 : 0;
    const repPct = totalVotes > 0 ? (repVotes / totalVotes) * 100 : 0;
    return { demVotes, repVotes, totalVotes, demPct, repPct, margin: repPct - demPct, demUnits, repUnits };
  }, [geoLevel, raceType, year]);

  const districtGeoUrl = getCongressionalDistrictsGeoUrl(year);

  function geoHandlers(sel: Selection | null, clickable: boolean, isSelected: boolean) {
    return {
      onClick: () => {
        if (!clickable || !sel) return;
        if (Date.now() < ignoreClickUntilRef.current) return;
        setSelected(isSelected ? null : sel);
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") { touchStartRef.current = null; return; }
        touchStartRef.current = { x: e.clientX, y: e.clientY };
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (!clickable || !sel) return;
        if (e.pointerType !== "touch") return;
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
        ignoreClickUntilRef.current = Date.now() + 500;
        setSelected(isSelected ? null : sel);
      },
    };
  }

  return (
    <div className="flex w-full flex-col gap-3">

      {/* ── Mobile summary — the page title is owned by the historical hero above ── */}
      <div className="md:hidden">
        <div className="text-xs" style={{ color: t.textMuted }}>
          {stats.totalVotes.toLocaleString()} votes counted · {year} {raceLabel}
        </div>
      </div>

      {/* ── Mobile control bar (above the map) ── */}
      <div
        className="flex items-center gap-2.5 overflow-x-auto rounded-xl px-3 py-2 scrollbar-none md:hidden"
        style={{ background: t.legendBg, border: `1px solid ${t.border}` }}
      >
        <nav className="flex shrink-0 items-center gap-1.5">
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Geo</span>
          {GEO_LEVELS.map((gl) => (
            <button
              key={gl.key}
              onClick={() => selectGeoLevel(gl.key)}
              className="shrink-0 pb-0.5 text-xs font-semibold"
              style={gl.key === geoLevel ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
            >
              {gl.label}
            </button>
          ))}
        </nav>
        <span className="h-4 w-px shrink-0" style={{ background: t.border }} />
        <nav className="flex shrink-0 items-center gap-1.5">
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Office</span>
          {RACE_TYPES.map((rt) => (
            <button
              key={rt.key}
              onClick={() => selectRaceType(rt.key)}
              className="shrink-0 pb-0.5 text-xs font-semibold"
              style={rt.key === raceType ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
            >
              {rt.key === "president" ? "Pres" : rt.key === "governor" ? "Gov" : rt.key === "senate" ? "Sen" : "House"}
            </button>
          ))}
        </nav>
        <span className="h-4 w-px shrink-0" style={{ background: t.border }} />
        <nav className="flex shrink-0 items-center gap-1.5">
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Year</span>
          {getYearsForLevel(raceType, geoLevel).map((y) => (
            <button
              key={y}
              onClick={() => selectYear(y)}
              className="shrink-0 pb-0.5 text-xs font-semibold"
              style={y === year ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
            >
              {y}
            </button>
          ))}
        </nav>
        {hasSpecialThisYear && (
          <button
            onClick={() => setSpecialOnly((v) => !v)}
            aria-pressed={specialOnly}
            title={specialOnly ? "Showing special elections only — click to show all" : "Show special elections only"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold"
            style={
              specialOnly
                ? { background: t.textPrimary, color: t.panel }
                : { background: t.tabBg, color: t.textMuted, border: `1px solid ${t.border}` }
            }
          >
            Sp
          </button>
        )}
      </div>

      {/* ── Aggregate national results ── */}
      <div className="hidden items-start gap-4 pb-4 pt-1 md:flex xl:gap-6" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-4 xl:gap-6">
          {[
            { label: "Votes", dem: stats.demVotes.toLocaleString(), rep: stats.repVotes.toLocaleString() },
            { label: "Share", dem: `${stats.demPct.toFixed(1)}%`, rep: `${stats.repPct.toFixed(1)}%` },
            { label: `${unitLabel} won`, dem: stats.demUnits.toLocaleString(), rep: stats.repUnits.toLocaleString() },
            ...(seatCount ? [{ label: seatLabel, dem: seatCount.seatsD.toLocaleString(), rep: seatCount.seatsR.toLocaleString() }] : []),
          ].map((row, index) => (
            <div key={row.label} className="contents">
              {index > 0 && <span className="h-8 w-px" style={{ background: t.border }} />}
              <div className="shrink-0 whitespace-nowrap">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: t.textMuted }}>{row.label}</div>
                <div className="flex items-baseline gap-1.5 tabular-nums text-sm font-bold xl:text-base">
                  <span style={{ fontFamily: "var(--font-serif)", color: t.demText }}>{row.dem}</span>
                  <span className="text-xs font-normal" style={{ color: t.textVeryMuted }}>–</span>
                  <span style={{ fontFamily: "var(--font-serif)", color: t.repText }}>{row.rep}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-[1.35rem] shrink-0 whitespace-nowrap text-right text-sm tabular-nums" style={{ color: t.textVeryMuted }}>
          {stats.totalVotes.toLocaleString()} total votes
        </div>
      </div>

      <div className="md:hidden">
        <div className="flex items-baseline justify-between pb-2" style={{ borderBottom: `2px solid ${t.textPrimary}` }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>National Results</span>
          <span className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1rem", color: stats.margin <= 0 ? t.demText : t.repText }}>
            {marginLabel(stats.margin)}
          </span>
        </div>
        <div className="flex justify-between py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
          {[
            { label: "Votes", dem: stats.demVotes.toLocaleString(), rep: stats.repVotes.toLocaleString() },
            { label: "Share", dem: `${stats.demPct.toFixed(1)}%`, rep: `${stats.repPct.toFixed(1)}%` },
            { label: unitLabel, dem: stats.demUnits.toLocaleString(), rep: stats.repUnits.toLocaleString() },
            ...(seatCount ? [{ label: seatLabel, dem: seatCount.seatsD.toLocaleString(), rep: seatCount.seatsR.toLocaleString() }] : []),
          ].map((row) => (
            <div key={row.label} className="flex-1 text-center">
              <div className="mb-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: t.textMuted }}>{row.label}</div>
              <div className="tabular-nums text-sm font-bold">
                <span style={{ fontFamily: "var(--font-serif)", color: t.demText }}>{row.dem}</span>
                <span className="mx-1 font-normal" style={{ color: t.textVeryMuted }}>–</span>
                <span style={{ fontFamily: "var(--font-serif)", color: t.repText }}>{row.rep}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Map ── */}
      <div
        className="relative h-[380px] w-full overflow-hidden rounded-xl md:h-[min(660px,calc(100vh-180px))] md:min-h-[520px] md:w-[96%] md:self-center"
        style={{ background: t.bg }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMapSize({ w: rect.width, h: rect.height });
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      >
        {/* Hover tooltip */}
        {hovered && (() => {
          const tipW = hovered.result ? 168 : 180;
          const tipH = hovered.result ? 92 : 66;
          const offset = 14;
          const pad = 8;
          let left = mousePos.x + offset;
          let top = mousePos.y + offset;
          const cW = mapSize.w || 800;
          const cH = mapSize.h || 520;
          if (left + tipW + pad > cW) left = mousePos.x - tipW - offset;
          if (top + tipH + pad > cH) top = mousePos.y - tipH - offset;
          if (left < pad) left = pad;
          if (top < pad) top = pad;
          return (
            <div
              className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
              style={{
                left, top, width: tipW,
                padding: "6px 8px",
                background: t.panel,
                border: `1px solid ${t.border}`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              }}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-bold text-[11px]">{hovered.title}</span>
                {hovered.result && (
                  <span className="font-bold shrink-0" style={{ fontSize: 15, color: hovered.result.margin <= 0 ? t.demText : t.repText }}>
                    {marginLabel(hovered.result.margin)}
                  </span>
                )}
              </div>
              {hovered.subtitle && (
                <div className="text-[9px] mt-0.5" style={{ color: t.textMuted }}>{hovered.subtitle}</div>
              )}
              <div className="mt-1">
                <ResultDetails sel={hovered} isPresident={isPresident} raceLabel={raceLabel} year={year} t={t} showVotesInRows={false} />
              </div>
            </div>
          );
        })()}

        <ComposableMap
          width={975}
          height={610}
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1200 }}
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <NationalLandMaskDefinition />
          <ZoomableGroup
            center={mapView.center}
            zoom={mapView.zoom}
            filterZoomEvent={filterMapZoomEvent}
            onMoveStart={() => { gestureRef.current = null; }}
            onMove={({ x, y, zoom: k }: { x: number; y: number; zoom: number }) => {
              if (!gestureRef.current) gestureRef.current = { startX: x, startY: y, startK: k, lastX: x, lastY: y, lastK: k };
              else { gestureRef.current.lastX = x; gestureRef.current.lastY = y; gestureRef.current.lastK = k; }
            }}
            onMoveEnd={({ coordinates, zoom }: { coordinates: [number, number] | null; zoom: number }) => {
              const validCenter = coordinates
                && coordinates.length === 2
                && coordinates.every(Number.isFinite);
              const gesture = gestureRef.current;
              gestureRef.current = null;
              if (!validCenter || !Number.isFinite(zoom)) return;

              // A plain click still nudges d3-zoom's internal transform by a pixel or two
              // (it has no click/drag tolerance of its own). Detect that here by pixel
              // distance + zoom delta over the gesture, and snap back to rest instead of
              // committing it as a real pan.
              const pixelDist = gesture ? Math.hypot(gesture.lastX - gesture.startX, gesture.lastY - gesture.startY) : 0;
              const zoomDelta = gesture ? Math.abs(gesture.lastK - gesture.startK) : 0;
              if (pixelDist < 4 && zoomDelta < 0.001) {
                setMapView({ center: coordinates, zoom });
                requestAnimationFrame(() => setMapView(settledViewRef.current));
                return;
              }

              const next = { center: coordinates, zoom };
              settledViewRef.current = next;
              setMapView(next);
              setViewChanged(
                zoom !== 1
                || Math.abs(coordinates[0] - DEFAULT_MAP_CENTER[0]) > 0.001
                || Math.abs(coordinates[1] - DEFAULT_MAP_CENTER[1]) > 0.001
              );
            }}
          >
            {geoLevel === "county" && (
              <>
                <Geographies geography={COUNTIES_URL}>
                  {({ geographies }: { geographies: GeoFeature[] }) =>
                    geographies.map((geo) => {
                      const fips = String(geo.id ?? "");
                      const statePrefix = fips.slice(0, 2);
                      const stateInfo = FIPS_TO_STATE[statePrefix];
                      const result = getCountyResult(raceType, year, fips, specialOnly);
                      const hasElection = hasElectionInState(raceType, year, stateInfo?.abbr ?? "", specialOnly);
                      const sel: Selection = {
                        key: fips,
                        title: `${geo.properties?.name ?? ""} ${getAreaLabel(stateInfo?.abbr ?? "")}`,
                        subtitle: `${stateInfo?.name ?? ""} · FIPS ${fips}`,
                        hasElection,
                        result,
                        moreInfoHref: `/historical/${fips}`,
                      };
                      const isSelected = selected?.key === fips;
                      const clickable = result !== null;
                      const fill = result
                        ? getRaceColor(result.margin)
                        : (hasElection ? t.mapUnfilled : t.noElection);
                      const handlers = geoHandlers(sel, clickable, isSelected);

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onMouseEnter={() => setHovered(sel)}
                          onMouseLeave={() => setHovered(null)}
                          {...handlers}
                          style={{
                            default: {
                              fill,
                              stroke: isSelected ? t.hoverStroke : t.mapStroke,
                              strokeWidth: isSelected ? 1.75 : 0.3,
                              outline: "none",
                            },
                            hover: {
                              // hoverUnfilled is a subtle "selectable but empty" highlight, only
                              // meaningful where every county is normally clickable (president);
                              // other race types have plenty of non-clickable counties by design
                              // (pending data, no election that cycle) and shouldn't flash on hover.
                              fill: isPresident && !result ? t.hoverUnfilled : fill,
                              stroke: t.hoverStroke,
                              strokeWidth: 0.5,
                              outline: "none",
                              cursor: clickable ? "pointer" : "default",
                            },
                            pressed: {
                              fill,
                              stroke: t.hoverStroke,
                              strokeWidth: 1.75,
                              outline: "none",
                            },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>

                <StateOutlines t={t} />
              </>
            )}

            {geoLevel === "district" && (
              <>
              <NationalLandMask enabled>
                <Geographies
                  key={districtGeoUrl}
                  geography={districtGeoUrl}
                  parseGeographies={(geographies: DistrictGeoFeature[]) => geographies.map(normalizeGeographyWinding)}
                >
                  {({ geographies }: { geographies: DistrictGeoFeature[] }) =>
                    geographies.map((geo) => {
                      const geoId = geo.properties?.GEOID;
                      if (!isCongressionalDistrictGeoid(geoId)) return null;
                      const gr = districtRenderMap?.get(geoId);
                      const hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr, specialOnly) : false;
                      const sel: Selection | null = gr ? {
                        key: geoId,
                        title: gr.label,
                        subtitle: gr.stateName,
                        hasElection,
                        result: gr.result,
                        moreInfoHref: houseDistrictNames.has(gr.label.toLowerCase()) ? `/house/${gr.label.toLowerCase()}` : `/states/${gr.stateAbbr.toLowerCase()}`,
                      } : null;
                      const isSelected = selected?.key === geoId;
                      const clickable = !!gr?.result;
                      const fill = gr?.result
                        ? getRaceColor(gr.result.margin)
                        : (hasElection ? t.mapUnfilled : t.noElection);
                      const handlers = geoHandlers(sel, clickable, isSelected);

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onMouseEnter={() => sel && setHovered(sel)}
                          onMouseLeave={() => setHovered(null)}
                          {...handlers}
                          style={{
                            default: { fill, stroke: isSelected ? t.hoverStroke : t.mapStroke, strokeWidth: isSelected ? 1.75 : 0.4, outline: "none" },
                            hover: { fill, stroke: t.hoverStroke, strokeWidth: 0.8, outline: "none", cursor: clickable ? "pointer" : "default" },
                            pressed: { fill, stroke: t.hoverStroke, strokeWidth: 1.75, outline: "none" },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </NationalLandMask>
              <StateOutlines t={t} />
              </>
            )}

            {geoLevel === "state" && (
              <>
              <Geographies geography={STATES_URL}>
                {({ geographies }: { geographies: GeoFeature[] }) =>
                  geographies.map((geo) => {
                    const fips = String(geo.id ?? "").padStart(2, "0");
                    const gr = stateResults?.get(fips);
                    const hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr, specialOnly) : false;
                    const sel: Selection | null = gr ? {
                      key: fips,
                      title: gr.stateName,
                      subtitle: "",
                      hasElection,
                      result: gr.result,
                      moreInfoHref: `/states/${gr.stateAbbr.toLowerCase()}`,
                    } : null;
                    const isSelected = selected?.key === fips;
                    const clickable = !!gr?.result;
                    const fill = gr?.result
                      ? getRaceColor(gr.result.margin)
                      : (hasElection ? t.mapUnfilled : t.noElection);
                    const handlers = geoHandlers(sel, clickable, isSelected);

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => sel && setHovered(sel)}
                        onMouseLeave={() => setHovered(null)}
                        {...handlers}
                        style={{
                          default: { fill, stroke: isSelected ? t.hoverStroke : t.mapStroke, strokeWidth: isSelected ? 2 : 0.5, outline: "none" },
                          hover: { fill, stroke: t.hoverStroke, strokeWidth: 1, outline: "none", cursor: clickable ? "pointer" : "default" },
                          pressed: { fill, stroke: t.hoverStroke, strokeWidth: 2, outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
              <StateOutlines t={t} />
              </>
            )}
          </ZoomableGroup>
        </ComposableMap>

        {/* ── Desktop overlay toolbar (top-left) ── */}
        <div
          className="hidden md:flex absolute z-10 items-center gap-2.5 rounded-xl px-3 py-2 backdrop-blur-sm"
          style={{ top: 0, left: "1rem", background: t.legendBg, border: `1px solid ${t.border}` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Geo</span>
            {GEO_LEVELS.map((gl) => (
              <button
                key={gl.key}
                onClick={() => selectGeoLevel(gl.key)}
                className="pb-0.5 text-xs font-semibold"
                style={gl.key === geoLevel ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
              >
                {gl.label}
              </button>
            ))}
          </div>
          <span className="h-4 w-px" style={{ background: t.border }} />
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Office</span>
            {RACE_TYPES.map((rt) => (
              <button
                key={rt.key}
                onClick={() => selectRaceType(rt.key)}
                className="pb-0.5 text-xs font-semibold"
                style={rt.key === raceType ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
              >
                {rt.key === "president" ? "Pres" : rt.key === "governor" ? "Gov" : rt.key === "senate" ? "Sen" : "House"}
              </button>
            ))}
          </div>
          <span className="h-4 w-px" style={{ background: t.border }} />
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>Year</span>
            {getYearsForLevel(raceType, geoLevel).map((y) => (
              <button
                key={y}
                onClick={() => selectYear(y)}
                className="pb-0.5 text-xs font-semibold"
                style={y === year ? { color: t.textPrimary, borderBottom: `2px solid ${t.textPrimary}` } : { color: t.textMuted }}
              >
                {y}
              </button>
            ))}
          </div>
          {hasSpecialThisYear && (
            <>
              <span className="h-4 w-px" style={{ background: t.border }} />
              <button
                onClick={() => setSpecialOnly((v) => !v)}
                aria-pressed={specialOnly}
                title={specialOnly ? "Showing special elections only — click to show all" : "Show special elections only"}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold"
                style={
                  specialOnly
                    ? { background: t.textPrimary, color: t.panel }
                    : { background: t.tabBg, color: t.textMuted, border: `1px solid ${t.border}` }
                }
              >
                Sp
              </button>
            </>
          )}
          {viewChanged && (
            <>
              <span className="h-4 w-px" style={{ background: t.border }} />
              <button onClick={resetView} className="text-xs font-semibold" style={{ color: t.textMuted }}>
                Reset
              </button>
            </>
          )}
        </div>

        {/* ── Mobile reset (standalone — controls above the map handle everything else) ── */}
        {viewChanged && (
          <button
            onClick={resetView}
            className="md:hidden absolute z-10 rounded-lg px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm"
            style={{ top: "0.6rem", left: "0.6rem", background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted }}
          >
            Reset
          </button>
        )}

        {/* ── Desktop chyron (top-right) ── */}
        <div
          className="hidden md:block absolute z-10 rounded-xl px-3 py-2 text-right backdrop-blur-sm"
          style={{ top: 0, right: "1rem", background: t.legendBg, border: `1px solid ${t.border}` }}
        >
          <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>National margin</div>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.15, color: stats.margin <= 0 ? t.demText : t.repText }}>
            {marginLabel(stats.margin)}
          </div>
        </div>

        {/* ── Desktop floating selected panel (bottom-right) ── */}
        {selected && (
          <div
            className="hidden md:block absolute z-20 rounded-xl p-2.5 backdrop-blur-sm"
            style={{ bottom: "1rem", right: "1rem", width: 220, background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 12px 28px rgba(0,0,0,0.25)" }}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2 pb-1.5" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.title}</div>
                {selected.subtitle && <div className="mt-0.5 truncate text-[10px]" style={{ color: t.textMuted }}>{selected.subtitle}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {selected.result && (() => {
                  const rating = marginToRating(selected.result.margin);
                  const { bg, text } = getRatingColors(rating);
                  return (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: bg, color: text }}>
                      {rating}
                    </span>
                  );
                })()}
                <button onClick={() => setSelected(null)} aria-label="Close selection" style={{ color: t.textVeryMuted }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {selected.result && (
              <div className="mb-1 text-lg font-extrabold leading-tight" style={{ fontFamily: "var(--font-serif)", color: selected.result.margin <= 0 ? t.demText : t.repText }}>
                {marginLabel(selected.result.margin)}
              </div>
            )}
            <ResultDetails sel={selected} isPresident={isPresident} raceLabel={raceLabel} year={year} t={t} showVotesInRows />
            {selected.moreInfoHref && (
              <a href={selected.moreInfoHref} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: t.textPrimary }}>
                More Info
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Map legend ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:gap-x-4">
        {MAP_LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1 md:gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5" style={{ background: color }} />
            <span className="whitespace-nowrap text-[9px] font-medium md:text-[10px]" style={{ color: t.textMuted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Mobile selected geography (compact) ── */}
      {selected && (
        <div className="md:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.title}</div>
              {selected.subtitle && <div className="mt-0.5 truncate text-[9px]" style={{ color: t.textMuted }}>{selected.subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {selected.result && (
                <span className="text-sm font-bold" style={{ fontFamily: "var(--font-serif)", color: selected.result.margin <= 0 ? t.demText : t.repText }}>
                  {marginLabel(selected.result.margin)}
                </span>
              )}
              <button onClick={() => setSelected(null)} className="-m-1 p-1" style={{ color: t.textVeryMuted }} aria-label="Close selection">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-1.5">
            <ResultDetails sel={selected} isPresident={isPresident} raceLabel={raceLabel} year={year} t={t} showVotesInRows={false} />
          </div>
          {selected.moreInfoHref && (
            <a href={selected.moreInfoHref} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: t.textPrimary }}>
              More Info
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      )}

    </div>
  );
}
