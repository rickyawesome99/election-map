"use client";

import { useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { countyPresidentialData, type CountyYearResult } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { electionCalendar, type CountyRaceType } from "@/data/electionCalendar";
import {
  houseData, housePastResults, houseStatewideResults,
  senateData, senateNoElection, senateHoldovers,
  governorData, governorNoElection,
  presPastResults,
  type PastResult,
} from "@/data/forecastData";
import { getRaceColor } from "@/lib/colorScale";
import { FIPS_TO_STATE } from "@/lib/fips";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid, withAtLargeAlias } from "@/lib/congressionalDistricts";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";

type RaceType = "president" | CountyRaceType;
type PresYear = 2008 | 2012 | 2016 | 2020 | 2024;
type GeoLevel = "county" | "district" | "state";
type MapView = { center: [number, number]; zoom: number };

const DEFAULT_MAP_CENTER: [number, number] = [-96.6, 38.7];

/** A single normalized two-party result, regardless of which geography/dataset it came from.
 * votesKnown is false for uncontested races the source data reports as pct-only (no vote
 * counts) — demVotes/repVotes/totalVotes are 0 in that case (safe to sum, since 0 doesn't
 * distort a total), but callers must gate on votesKnown before *displaying* them as if
 * they were real. Absent defaults to known - true for almost all county data, except a
 * handful of House counties whose only district that cycle was a literal 0/0 unopposed
 * race (no source has real vote data for it) - those carry an explicit `votesKnown:
 * false` on their `CountyYearResult` (see data/countyHouseData.ts) so the map can still
 * color them by the known 100/0 outcome without fabricating a vote count. */
type NormalizedResult = {
  demVotes: number; repVotes: number; totalVotes: number;
  demPct: number; repPct: number; margin: number;
  votesKnown?: boolean;
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

function getCountyResult(raceType: RaceType, year: number, fips: string): CountyYearResult | null {
  if (raceType === "president") return countyPresidentialData[fips]?.years[year as PresYear] ?? null;
  if (raceType === "senate") return countySenateData[fips]?.years[year] ?? null;
  if (raceType === "governor") return countyGovernorData[fips]?.years[year] ?? null;
  if (raceType === "house") return countyHouseData[fips]?.years[year] ?? null;
  return null;
}

function getAllCountyResults(raceType: RaceType, year: number): CountyYearResult[] {
  const store =
    raceType === "president" ? countyPresidentialData
    : raceType === "senate" ? countySenateData
    : raceType === "governor" ? countyGovernorData
    : countyHouseData;
  const results: CountyYearResult[] = [];
  for (const fips in store) {
    const result = store[fips]?.years[year as PresYear];
    if (result) results.push(result);
  }
  return results;
}

function hasElectionInState(raceType: RaceType, year: number, stateAbbr: string): boolean {
  if (raceType === "president") return true;
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
 * combined result the way an early bail-out would. */
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
  const twoParty = demVotes + repVotes;
  const demPct = twoParty > 0 ? (demVotes / twoParty) * 100 : 0;
  const repPct = twoParty > 0 ? (repVotes / twoParty) * 100 : 0;
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

/** Computes a state's statewide two-party result for president/governor/senate (house is
 * built differently — by summing real district-level results — so this returns null for
 * it). */
function computeStatewideResult(raceType: RaceType, year: number, abbr: string): NormalizedResult | null {
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
    const matches = [...seat1Past, ...seat2Past].filter((pr) => pr.year === year);
    return combineVotesResults(matches);
  }
  return null;
}

/** Builds one GeoResult per real congressional district (keyed by the data's own GEOID
 * convention — "XX01" for at-large, not the Census "XX00"), for the given race+year. */
function buildDistrictResults(raceType: RaceType, year: number): Map<string, GeoResult> {
  const map = new Map<string, GeoResult>();
  if (raceType === "house") {
    for (const [id, results] of mergedHouseResultsById()) {
      const stateFips = id.slice(0, 2);
      const stateInfo = FIPS_TO_STATE[stateFips];
      if (!stateInfo) continue;
      const r = results.find((pr) => pr.year === year);
      const result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes, r.totalVotes) : null;
      map.set(id, { label: `${stateInfo.abbr}-${id.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  } else {
    const raceName = raceType === "president" ? "President" : raceType === "senate" ? "Senate" : "Governor";
    for (const [geoid, results] of Object.entries(houseStatewideResults)) {
      const stateFips = geoid.slice(0, 2);
      const stateInfo = FIPS_TO_STATE[stateFips];
      if (!stateInfo) continue;
      const r = results.find((res) => res.race === raceName && res.year === year);
      const result = r ? normalizeVotesResult(r.demPct, r.repPct, r.demVotes, r.repVotes) : null;
      map.set(geoid, { label: `${stateInfo.abbr}-${geoid.slice(-2)}`, stateAbbr: stateInfo.abbr, stateName: stateInfo.name, result });
    }
  }
  return map;
}

/** Builds one GeoResult per state (keyed by 2-digit state FIPS, matching states-10m.json). */
function buildStateResults(raceType: RaceType, year: number): Map<string, GeoResult> {
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
      result = combineVotesResults(matches);
    } else {
      result = computeStatewideResult(raceType, year, abbr);
    }

    map.set(fips, { label: name, stateAbbr: abbr, stateName: name, result });
  }
  return map;
}

function collectResults(map: Map<string, GeoResult>): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const gr of map.values()) if (gr.result) out.push(gr.result);
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
  return (
    <>
      <div>
        <div className="flex justify-between items-baseline">
          <span style={{ color: t.demText, fontSize: 10 }}>Dem</span>
          <span className="font-semibold" style={{ color: t.demText, fontSize: 10 }}>
            {showVotesInRows && votesKnown ? `${result.demVotes.toLocaleString()} · ` : ""}{result.demPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span style={{ color: t.repText, fontSize: 10 }}>Rep</span>
          <span className="font-semibold" style={{ color: t.repText, fontSize: 10 }}>
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

  const isPresident = raceType === "president";
  const raceLabel = RACE_TYPES.find((r) => r.key === raceType)!.label;
  const unitLabel = UNIT_LABEL[geoLevel];

  // Only the active geoLevel's lookup is built — county view uses direct object lookups
  // (getCountyResult) instead, so it needs no upfront map.
  const districtResults = useMemo(
    () => (geoLevel === "district" ? buildDistrictResults(raceType, year) : null),
    [geoLevel, raceType, year],
  );
  const districtRenderMap = useMemo(() => {
    if (!districtResults) return null;
    const m = new Map<string, GeoResult>();
    for (const [geoid, value] of districtResults) withAtLargeAlias(m, geoid, value);
    return m;
  }, [districtResults]);
  const stateResults = useMemo(
    () => (geoLevel === "state" ? buildStateResults(raceType, year) : null),
    [geoLevel, raceType, year],
  );

  const stats = useMemo(() => {
    const results =
      geoLevel === "county" ? getAllCountyResults(raceType, year)
      : geoLevel === "district" ? collectResults(districtResults ?? new Map())
      : collectResults(stateResults ?? new Map());
    let demVotes = 0, repVotes = 0, totalVotes = 0, demUnits = 0, repUnits = 0;
    for (const r of results) {
      demVotes += r.demVotes;
      repVotes += r.repVotes;
      totalVotes += r.totalVotes;
      if (r.margin <= 0) demUnits++;
      else repUnits++;
    }
    const twoParty = demVotes + repVotes;
    const demPct = twoParty > 0 ? (demVotes / twoParty) * 100 : 0;
    const repPct = twoParty > 0 ? (repVotes / twoParty) * 100 : 0;
    return { demVotes, repVotes, totalVotes, demPct, repPct, margin: repPct - demPct, demUnits, repUnits };
  }, [geoLevel, raceType, year, districtResults, stateResults]);

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
    <div className="flex w-full flex-col md:grid md:h-[min(680px,calc(100vh-150px))] md:min-h-[520px] md:grid-cols-[minmax(0,4fr)_minmax(220px,1fr)]">
      <aside
        className="order-1 min-w-0 flex flex-col md:order-2 md:h-full md:min-h-0 md:overflow-y-auto md:border-l"
        style={{ background: t.panel, borderColor: t.border }}
      >
        <div className="p-2 md:p-3" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="mb-1.5 md:mb-2">
            <div className="text-xs font-bold md:text-sm" style={{ color: t.textPrimary }}>Map Controls</div>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3 md:grid-cols-1 md:gap-2">
            <div>
              <div className="mb-0.5 text-[7px] font-bold uppercase tracking-wider md:mb-1 md:text-[8px]" style={{ color: t.textMuted }}>Geography</div>
              <nav className="grid grid-cols-3 rounded-md p-0.5 gap-0.5" style={{ background: t.tabBg }}>
          {GEO_LEVELS.map((gl) => (
            <button
              key={gl.key}
              onClick={() => selectGeoLevel(gl.key)}
                    className="rounded px-1 py-0.5 text-[9px] font-semibold transition-colors md:py-1 md:text-[10px]"
              style={
                gl.key === geoLevel
                  ? { background: t.panel, color: t.textPrimary }
                  : { color: t.textMuted }
              }
            >
              {gl.label}
            </button>
          ))}
        </nav>
            </div>

            <div>
              <div className="mb-0.5 text-[7px] font-bold uppercase tracking-wider md:mb-1 md:text-[8px]" style={{ color: t.textMuted }}>Office</div>
              <nav className="grid grid-cols-4 rounded-md p-0.5 gap-0.5" style={{ background: t.tabBg }}>
          {RACE_TYPES.map((rt) => (
            <button
              key={rt.key}
              onClick={() => selectRaceType(rt.key)}
                    className="rounded px-1 py-0.5 text-[8px] font-semibold transition-colors md:py-1 md:text-[9px]"
              style={
                rt.key === raceType
                  ? { background: t.panel, color: t.textPrimary }
                  : { color: t.textMuted }
              }
            >
              {rt.key === "president" ? "Pres" : rt.key === "governor" ? "Gov" : rt.key === "senate" ? "Sen" : "House"}
            </button>
          ))}
        </nav>
            </div>

            <div>
              <div className="mb-0.5 text-[7px] font-bold uppercase tracking-wider md:mb-1 md:text-[8px]" style={{ color: t.textMuted }}>Election year</div>
              <nav className="grid h-6 grid-flow-col auto-cols-[minmax(40px,1fr)] gap-0.5 overflow-x-auto rounded-md p-0.5 scrollbar-none md:h-[28px]" style={{ background: t.tabBg }}>
          {getYearsForLevel(raceType, geoLevel).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
                    className="rounded px-1 py-0.5 text-[8px] font-semibold transition-colors md:py-1 md:text-[9px]"
              style={
                y === year
                  ? { background: t.panel, color: t.textPrimary }
                  : { color: t.textMuted }
              }
            >
              {y}
            </button>
          ))}
        </nav>
            </div>
          </div>
        </div>

        <div className="p-2 md:flex-1 md:p-4">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-xs font-bold md:text-sm" style={{ color: t.textPrimary }}>National Results</div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums md:px-2.5 md:py-1 md:text-xs"
              style={{ background: t.tabBg, color: stats.margin <= 0 ? t.demText : t.repText }}
            >
              {marginLabel(stats.margin)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 md:grid-cols-1 md:gap-1.5">
            {[
              { label: "Votes", dem: stats.demVotes.toLocaleString(), rep: stats.repVotes.toLocaleString(), total: null },
              { label: "Share", dem: `${stats.demPct.toFixed(1)}%`, rep: `${stats.repPct.toFixed(1)}%`, total: null },
              { label: unitLabel, dem: stats.demUnits.toLocaleString(), rep: stats.repUnits.toLocaleString(), total: `${stats.totalVotes.toLocaleString()} total votes` },
            ].map((row) => (
              <div key={row.label} className="text-center">
                <div className="mb-0.5 text-[7px] font-bold uppercase tracking-wide md:text-[8px]" style={{ color: t.textMuted }}>{row.label}</div>
                <div className="flex flex-col items-center justify-center leading-tight md:flex-row md:items-baseline md:gap-2 md:leading-normal">
                  <span className="min-w-0 text-[10px] tabular-nums font-bold md:text-sm" style={{ color: t.demText }}>{row.dem}</span>
                  <span className="hidden text-[10px] md:inline" style={{ color: t.textVeryMuted }}>–</span>
                  <span className="min-w-0 text-[10px] tabular-nums font-bold md:text-sm" style={{ color: t.repText }}>{row.rep}</span>
                </div>
                {row.total && <div className="mt-0.5 text-[7px] font-medium tabular-nums md:text-[10px]" style={{ color: t.textMuted }}>{row.total}</div>}
              </div>
            ))}
          </div>
          {selected && (
            <div className="mt-2 hidden pt-2 md:block" style={{ borderTop: `1px solid ${t.border}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold leading-tight" style={{ color: t.textPrimary }}>
                    {selected.title}
                  </div>
                  {selected.subtitle && (
                    <div className="text-[9px] mt-0.5" style={{ color: t.textMuted }}>
                      {selected.subtitle}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selected.result && (
                    <span className="font-bold" style={{ fontSize: 13, color: selected.result.margin <= 0 ? t.demText : t.repText }}>
                      {marginLabel(selected.result.margin)}
                    </span>
                  )}
                  <button onClick={() => setSelected(null)} className="-m-1.5 p-1.5" style={{ color: t.textVeryMuted }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-1">
                <ResultDetails sel={selected} isPresident={isPresident} raceLabel={raceLabel} year={year} t={t} showVotesInRows />
              </div>
              {selected.moreInfoHref && (
                <a
                  href={selected.moreInfoHref}
                  className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-semibold"
                  style={{ color: t.textMuted }}
                >
                  More Info
                  <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="order-2 h-[360px] min-h-0 min-w-0 w-full overflow-hidden md:order-1 md:h-full">
        <div
          className="relative h-full w-full"
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
                    const result = getCountyResult(raceType, year, fips);
                    const hasElection = hasElectionInState(raceType, year, stateInfo?.abbr ?? "");
                    const sel: Selection = {
                      key: fips,
                      title: `${geo.properties?.name ?? ""} ${getAreaLabel(stateInfo?.abbr ?? "")}`,
                      subtitle: `${stateInfo?.name ?? ""} · FIPS ${fips}`,
                      hasElection,
                      result,
                      moreInfoHref: `/counties/${fips}`,
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
                    const hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr) : false;
                    const sel: Selection | null = gr ? {
                      key: geoId,
                      title: gr.label,
                      subtitle: gr.stateName,
                      hasElection,
                      result: gr.result,
                      moreInfoHref: raceType === "house" ? `/house/${gr.label.toLowerCase()}` : `/states/${gr.stateAbbr.toLowerCase()}`,
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
                  const hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr) : false;
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

      {/* Reset zoom */}
      {viewChanged && (
        <div
          className="absolute rounded-xl p-1.5 backdrop-blur-sm z-10"
          style={{ top: "1rem", left: "1rem", background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
        >
          <nav className="flex rounded-lg p-1" style={{ background: t.tabBg }}>
            <button
              onClick={() => {
                const reset = { center: DEFAULT_MAP_CENTER, zoom: 1 };
                settledViewRef.current = reset;
                setMapView(reset);
                setViewChanged(false);
              }}
              className="px-2 py-1 rounded-md text-xs font-medium"
              style={{ color: t.textMuted }}
            >
              Reset
            </button>
          </nav>
        </div>
      )}

      {/* Margin key */}
      <div
        className="hidden md:block absolute z-10 pointer-events-none"
        style={{
          bottom: "10px",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <div className="grid grid-cols-8 gap-0.5" style={{ width: 140 }}>
          {MAP_LEGEND.map(({ color, label }) => (
            <div key={label} title={label} className="h-1.5 first:rounded-l-sm last:rounded-r-sm" style={{ background: color }} />
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-[7px] font-semibold" style={{ color: t.textMuted }}>
          <span>Safe D</span><span>Tossup</span><span>Safe R</span>
        </div>
      </div>

      </div>
    </div>

      {selected && (
        <div
          className="order-3 p-3 md:hidden"
          style={{ background: t.panel, borderTop: `1px solid ${t.border}` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.title}</div>
              {selected.subtitle && <div className="mt-0.5 text-[9px]" style={{ color: t.textMuted }}>{selected.subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selected.result && (
                <span className="text-sm font-bold" style={{ color: selected.result.margin <= 0 ? t.demText : t.repText }}>
                  {marginLabel(selected.result.margin)}
                </span>
              )}
              <button onClick={() => setSelected(null)} className="-m-1 p-1" style={{ color: t.textVeryMuted }} aria-label="Close selection">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-2">
            <ResultDetails sel={selected} isPresident={isPresident} raceLabel={raceLabel} year={year} t={t} showVotesInRows />
          </div>
          {selected.moreInfoHref && (
            <a
              href={selected.moreInfoHref}
              className="mt-2 flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold"
              style={{ background: t.tabBg, color: t.textMuted }}
            >
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
