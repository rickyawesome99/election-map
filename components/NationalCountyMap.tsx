"use client";

import { useMapTooltip } from "@/lib/useMapTooltip";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { Theme } from "./ForecastMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { electionCalendar, senateSpecialCalendar } from "@/data/electionCalendar";
import {
  MAP_LEVELS, MAP_OFFICES, mapSliceUrl, yearsForLevel,
  type MapLevel, type MapOffice, type MapSlice, type NormalizedResult,
} from "@/lib/mapSliceTypes";
import { useStaticJson } from "@/lib/useStaticJson";
import { getRaceColor, marginToRating, getRatingColors } from "@/lib/colorScale";
import { FIPS_TO_STATE } from "@/lib/fips";
import { getCongressionalDistrictsGeoUrl, isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";
import { popVoteData } from "@/data/popVoteData";

type RaceType = MapOffice;
type GeoLevel = MapLevel;
type MapView = { center: [number, number]; zoom: number };

const DEFAULT_MAP_CENTER: [number, number] = [-96.6, 38.7];

/** Every senate year where at least one state held BOTH a regular and a special
 * election (per senate_past_results.csv's type="Special" rows — see
 * data/electionCalendar.ts's senateSpecialCalendar). Drives whether the "special
 * elections only" toggle button appears at all for the currently-selected year. */
const SENATE_DOUBLE_YEARS = new Set(Object.values(senateSpecialCalendar).flat());

// Results arrive per (level, office, year) as a static JSON slice built by lib/mapSlices.ts —
// the county / district / state datasets behind them (≈9 MB of literals) never enter this
// bundle. NormalizedResult, the same-party flags and the special-election rules are documented
// there.
/** What's shown in the hover tooltip / selected panel, unified across geoLevels. */
type Selection = {
  key: string;
  title: string;
  subtitle: string;
  hasElection: boolean;
  result: NormalizedResult | null;
  moreInfoHref: string | null;
};

function hasElectionInState(raceType: RaceType, year: number, stateAbbr: string, specialOnly = false): boolean {
  if (raceType === "president") return true;
  if (raceType === "senate") {
    if (specialOnly) return senateSpecialCalendar[stateAbbr]?.includes(year) ?? false;
    return (electionCalendar.senate[stateAbbr]?.includes(year) ?? false) || (senateSpecialCalendar[stateAbbr]?.includes(year) ?? false);
  }
  return electionCalendar[raceType][stateAbbr]?.includes(year) ?? false;
}

const RACE_TYPE_LABEL: Record<RaceType, string> = { president: "President", governor: "Governor", senate: "Senate", house: "House" };
const RACE_TYPES: { key: RaceType; label: string }[] = MAP_OFFICES.map((key) => ({ key, label: RACE_TYPE_LABEL[key] }));

const getYearsForLevel = yearsForLevel;

const GEO_LEVEL_LABEL: Record<GeoLevel, string> = { state: "State", district: "District", county: "County" };
const GEO_LEVELS: { key: GeoLevel; label: string }[] = [...MAP_LEVELS].reverse().map((key) => ({ key, label: GEO_LEVEL_LABEL[key] }));

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
const EMPTY_ENTRIES: MapSlice["entries"] = {};
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

// Hoisted so its identity is stable: react-simple-maps re-fetches, re-parses and re-projects the
// whole boundary file whenever `parseGeographies` changes identity — an inline arrow did that on
// every render, i.e. on every hover.
const parseDistrictGeographies = (geographies: DistrictGeoFeature[]) => geographies.map(normalizeGeographyWinding);

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
const StateOutlines = memo(function StateOutlines({ t }: { t: Theme }) {
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
});

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

// ── Memoized geography layer ─────────────────────────────────────────────────
// One <Geography> per feature, rendered through React.memo so that the parent's hover /
// selection / pan state changes do not re-render 3,100 county paths: the layer only redraws
// when the slice, the toggle, the selected key or the theme changes. Handlers are stable
// callbacks from the parent; the touch bookkeeping lives here so the layer owns its refs.
type LayerLevel = GeoLevel;

const GeoLayer = memo(function GeoLayer({
  level, geographies, entries, specialOnly, raceType, year, isPresident, selectedKey, t, onHover, onSelect,
}: {
  level: LayerLevel;
  geographies: (GeoFeature | DistrictGeoFeature)[];
  entries: MapSlice["entries"];
  specialOnly: boolean;
  raceType: RaceType;
  year: number;
  isPresident: boolean;
  selectedKey: string | null;
  t: Theme;
  onHover: (sel: Selection | null) => void;
  onSelect: (sel: Selection) => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const resultOf = (key: string): NormalizedResult | null => {
    const e = entries[key];
    if (!e) return null;
    return specialOnly ? (e.special ?? null) : e.result;
  };
  const handlers = (sel: Selection | null, clickable: boolean) => ({
    onClick: () => {
      if (!clickable || !sel) return;
      if (Date.now() < ignoreClickUntilRef.current) return;
      onSelect(sel);
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
      onSelect(sel);
    },
  });
  const strokeW = level === "county" ? { base: 0.3, hover: 0.5, sel: 1.75 } : level === "district" ? { base: 0.4, hover: 0.8, sel: 1.75 } : { base: 0.5, hover: 1, sel: 2 };

  return (
    <>
      {geographies.map((geo) => {
        let key: string;
        let sel: Selection | null = null;
        let result: NormalizedResult | null = null;
        let hasElection = false;
        if (level === "county") {
          key = String((geo as GeoFeature).id ?? "");
          const stateInfo = FIPS_TO_STATE[key.slice(0, 2)];
          result = resultOf(key);
          hasElection = hasElectionInState(raceType, year, stateInfo?.abbr ?? "", specialOnly);
          sel = {
            key,
            title: `${(geo as GeoFeature).properties?.name ?? ""} ${getAreaLabel(stateInfo?.abbr ?? "")}`,
            subtitle: `${stateInfo?.name ?? ""} · FIPS ${key}`,
            hasElection,
            result,
            moreInfoHref: `/historical/${key}`,
          };
        } else if (level === "district") {
          const geoId = (geo as DistrictGeoFeature).properties?.GEOID;
          if (!isCongressionalDistrictGeoid(geoId)) return null;
          key = geoId;
          const gr = entries[key];
          result = gr ? resultOf(key) : null;
          hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr ?? "", specialOnly) : false;
          sel = gr ? { key, title: gr.label ?? key, subtitle: gr.stateName ?? "", hasElection, result, moreInfoHref: gr.moreInfoHref ?? null } : null;
        } else {
          key = String((geo as GeoFeature).id ?? "").padStart(2, "0");
          const gr = entries[key];
          result = gr ? resultOf(key) : null;
          hasElection = gr ? hasElectionInState(raceType, year, gr.stateAbbr ?? "", specialOnly) : false;
          sel = gr ? { key, title: gr.stateName ?? key, subtitle: "", hasElection, result, moreInfoHref: gr.moreInfoHref ?? null } : null;
        }
        const isSelected = selectedKey === key;
        const clickable = result !== null;
        const fill = result ? getRaceColor(result.margin) : (hasElection ? t.mapUnfilled : t.noElection);
        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            onMouseEnter={() => sel && onHover(sel)}
            onMouseLeave={() => onHover(null)}
            {...handlers(sel, clickable)}
            style={{
              default: { fill, stroke: isSelected ? t.hoverStroke : t.mapStroke, strokeWidth: isSelected ? strokeW.sel : strokeW.base, outline: "none" },
              hover: {
                // hoverUnfilled is a subtle "selectable but empty" highlight, only meaningful
                // where every county is normally clickable (president); other race types have
                // plenty of non-clickable units by design and shouldn't flash on hover.
                fill: level === "county" && isPresident && !result ? t.hoverUnfilled : fill,
                stroke: t.hoverStroke, strokeWidth: strokeW.hover, outline: "none", cursor: clickable ? "pointer" : "default",
              },
              pressed: { fill, stroke: t.hoverStroke, strokeWidth: strokeW.sel, outline: "none" },
            }}
          />
        );
      })}
    </>
  );
});

export default function NationalCountyMap({ theme: t }: { theme: Theme }) {
  const [geoLevel, setGeoLevel] = useState<GeoLevel>("county");
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const tip = useMapTooltip(14, 8);
  const [mapView, setMapView] = useState<MapView>({ center: DEFAULT_MAP_CENTER, zoom: 1 });
  const [viewChanged, setViewChanged] = useState(false);
  const [raceType, setRaceType] = useState<RaceType>("president");
  const [year, setYear] = useState<number>(2024);
  // "Special elections only" toggle — only meaningful for senate on a year where at
  // least one state held both a regular and a special race (SENATE_DOUBLE_YEARS).
  const [specialOnly, setSpecialOnly] = useState(false);
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

  // One static slice per (level, office, year); the browser caches each once fetched, so
  // flipping back to a previous selection is instant. Until it arrives every unit paints as
  // unfilled and the aggregate reads as pending.
  const { data: slice, loading: sliceLoading } = useStaticJson<MapSlice>(mapSliceUrl(geoLevel, raceType, year));
  const entries = slice?.entries ?? EMPTY_ENTRIES;

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
    const { demVotes, repVotes, totalVotes, demUnits, repUnits } = slice?.aggregate ?? { demVotes: 0, repVotes: 0, totalVotes: 0, demUnits: 0, repUnits: 0 };
    const demPct = totalVotes > 0 ? (demVotes / totalVotes) * 100 : 0;
    const repPct = totalVotes > 0 ? (repVotes / totalVotes) * 100 : 0;
    return { demVotes, repVotes, totalVotes, demPct, repPct, margin: repPct - demPct, demUnits, repUnits };
  }, [slice]);

  const districtGeoUrl = getCongressionalDistrictsGeoUrl(year);

  const onHover = useCallback((sel: Selection | null) => setHovered(sel), []);
  const onSelect = useCallback((sel: Selection) => setSelected((cur) => (cur?.key === sel.key ? null : sel)), []);
  const selectedKey = selected?.key ?? null;

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
        onMouseMove={tip.onMouseMove}
      >
        {/* Hover tooltip */}
        {hovered && (() => {
          const tipW = hovered.result ? 168 : 180;
          return (
            <div ref={tip.tooltipRef}
              className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
              style={{
                width: tipW,
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
            // Default view sits at zoom 1; allow a little headroom below it so the whole
            // country can breathe, but not enough to shrink the map into the frame.
            minZoom={0.8}
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
                  {({ geographies }: { geographies: GeoFeature[] }) => (
                    <GeoLayer level="county" geographies={geographies} entries={entries} specialOnly={specialOnly} raceType={raceType} year={year} isPresident={isPresident} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />
                  )}
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
                  parseGeographies={parseDistrictGeographies}
                >
                  {({ geographies }: { geographies: DistrictGeoFeature[] }) => (
                    <GeoLayer level="district" geographies={geographies} entries={entries} specialOnly={specialOnly} raceType={raceType} year={year} isPresident={isPresident} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />
                  )}
                </Geographies>
              </NationalLandMask>
              <StateOutlines t={t} />
              </>
            )}

            {geoLevel === "state" && (
              <>
              <Geographies geography={STATES_URL}>
                {({ geographies }: { geographies: GeoFeature[] }) => (
                  <GeoLayer level="state" geographies={geographies} entries={entries} specialOnly={specialOnly} raceType={raceType} year={year} isPresident={isPresident} selectedKey={selectedKey} t={t} onHover={onHover} onSelect={onSelect} />
                )}
              </Geographies>
              <StateOutlines t={t} />
              </>
            )}
          </ZoomableGroup>
        </ComposableMap>

        {/* ── Desktop overlay toolbar (top-left) ── */}
        <div
          className="hidden md:flex absolute z-10 items-center gap-2.5 rounded-xl px-3 py-2 backdrop-blur-sm"
          style={{ top: 0, left: 0, background: t.legendBg, border: `1px solid ${t.border}` }}
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
          style={{ top: 0, right: 0, background: t.legendBg, border: `1px solid ${t.border}` }}
        >
          <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>{sliceLoading ? "Loading results…" : "National margin"}</div>
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
