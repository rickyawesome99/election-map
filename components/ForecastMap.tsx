"use client";

import { memo, useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor, getRatingColors, marginToRating } from "@/lib/colorScale";
import type { RaceType, NoElectionEntry } from "@/data/forecastData";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE, type ForecastSummary } from "@/lib/forecastTypes";
import { RaceTypeHeader, ForecastHero, ForecastRaceCards, KeyRaces } from "./ForecastLedger";

// Non-2026 seats already held by each party (Senate classes not up this cycle, Governor terms not up) —
// added to projected win counts to get full chamber totals.
export { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import Sidebar from "./Sidebar";
import StatesOverviewMap, { type MapMode, type StateRow } from "./StatesOverviewMap";
import StatesCartogramGrid from "./StatesCartogramGrid";
import StatesLedgerList from "./StatesLedgerList";
import StatesSelectedCard from "./StatesSelectedCard";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useTopo } from "@/lib/useTopology";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";

// Each tab body is its own chunk, loaded only when that tab is the active one — the county
// map and the district finder are the heaviest pieces of client
// code on the site and none of them is needed on the forecast tabs.
const tabLoading = () => <div className="py-10 text-center text-xs" style={{ color: "var(--app-text-muted)" }}>Loading…</div>;
const NationalCountyMap = dynamic(() => import("./NationalCountyMap"), { loading: tabLoading });
const DistrictFinder = dynamic(() => import("./DistrictFinder"), { loading: tabLoading });

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
// The shoreline-clipped, simplified 2026 district file the TPL hub map uses (see the header comment
// in components/tpl/TplMaps.tsx): no runtime SVG land mask and a quarter of the path data —
// the full file under a mask made House panning and tab switches lag, worst on phones.
const HOUSE_DISTRICTS_2026_URL = "/congressional-districts-2026-lite.json";
// State borders drawn over the districts: the lite file's interior state lines, so they match
// the district edges and are ~25 KB instead of the 10m state polygons. Both files are built by
// scripts/build-display-district-maps.mjs.
const HOUSE_STATE_LINES_URL = "/congressional-districts-2026-lite-state-lines.json";

type GeoFeature = {
  rsmKey: string;
  id?: string | number;
  properties?: Record<string, string | undefined>;
};

const LEGEND = [
  { color: "#1a4480", label: "Safe D" },
  { color: "#4275b5", label: "Likely D" },
  { color: "#82b4f0", label: "Lean D" },
  { color: "#aecef5", label: "Tilt D" },
  { color: "#f5aeae", label: "Tilt R" },
  { color: "#f08282", label: "Lean R" },
  { color: "#c04040", label: "Likely R" },
  { color: "#8b1a1a", label: "Safe R" },
];

export const DARK_THEME = {
  bg: "#0d1117",
  panel: "#161b22",
  border: "#30363d",
  tabBg: "#21262d",
  textPrimary: "#ffffff",
  textMuted: "#8b949e",
  textVeryMuted: "#484f58",
  hoverUnfilled: "#2a3441",
  mapUnfilled: "#1e2530",
  noElection: "#454c56",
  mapStroke: "#0d1117",
  hoverStroke: "#ffffff",
  legendBg: "rgba(22,27,34,0.90)",
  badgeBg: "rgba(22,27,34,0.90)",
  candidateDemBg: "#1b3a5c",
  candidateRepBg: "#5c1b1b",
  demText: "#8bafff",
  repText: "#ff8b98",
  demMuted: "#8bafff99",
  repMuted: "#ff8b9899",
};

export const LIGHT_THEME = {
  bg: "#f6f8fa",
  panel: "#ffffff",
  border: "#d0d7de",
  tabBg: "#eaeef2",
  textPrimary: "#1f2328",
  textMuted: "#656d76",
  textVeryMuted: "#949ea6",
  hoverUnfilled: "#dde2e7",
  mapUnfilled: "#c8cdd3",
  noElection: "#8b929b",
  mapStroke: "#f6f8fa",
  hoverStroke: "#000000",
  legendBg: "rgba(255,255,255,0.92)",
  badgeBg: "rgba(255,255,255,0.92)",
  candidateDemBg: "#dbeafe",
  candidateRepBg: "#fee2e2",
  demText: "#1b408c",
  repText: "#be1c29",
  demMuted: "#1b408c99",
  repMuted: "#be1c2999",
};

export type Theme = typeof DARK_THEME;

function persistRaceType(type: RaceType) {
  localStorage.setItem("raceType", type);
  document.cookie = `raceType=${type}; path=/; max-age=31536000; SameSite=Lax`;
}

type TopLevelTab = "forecast" | "states" | "historical" | "district-finder";


export type ForecastMapProps = {
  activeTab: TopLevelTab;
  raceType?: RaceType;
  /** Forecast tab: this chamber's races (lib/forecast.forecastSummariesFor) and the states with no
   * race this cycle, both computed by the server page. */
  races?: ForecastSummary[];
  noElection?: NoElectionEntry[];
  genericBallotDiff?: number;
  /** States tab (lib/stateRows.buildStateRows). */
  stateRows?: StateRow[];
};

const NO_RACES: ForecastSummary[] = [];
const NO_ENTRIES: NoElectionEntry[] = [];
const NO_ROWS: StateRow[] = [];

// ── Memoized forecast layer ──────────────────────────────────────────────────
// The 435 district (or 50 state) paths re-render only when the races, the selection or the
// theme change — not on every hover, and not on every pan/zoom frame. Lookups are indexed once
// instead of scanning the race list per feature (435 × 435 comparisons per render before).
const ForecastGeoLayer = memo(function ForecastGeoLayer({
  geographies, isHouse, races, noElection, selectedId, selectedNoElAbbr, t, onHover, onSelect,
}: {
  geographies: GeoFeature[];
  isHouse: boolean;
  races: ForecastSummary[];
  noElection: NoElectionEntry[];
  selectedId: string | null;
  selectedNoElAbbr: string | null;
  t: Theme;
  onHover: (race: ForecastSummary | null, noEl: NoElectionEntry | null) => void;
  onSelect: (race: ForecastSummary | null, noEl: NoElectionEntry | null) => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const byId = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const byState = useMemo(() => new Map(races.map((r) => [r.state, r])), [races]);
  const noElByState = useMemo(() => new Map(noElection.map((e) => [e.state, e])), [noElection]);

  const matchFor = (geo: GeoFeature): ForecastSummary | undefined => {
    if (isHouse) {
      const geoId = geo.properties?.GEOID as string | undefined;
      if (!geoId) return undefined;
      // Census at-large GEOIDs end in "00"; our ids end in "01" — try both
      return byId.get(geoId) ?? (geoId.endsWith("00") ? byId.get(geoId.slice(0, -2) + "01") : undefined);
    }
    return byState.get(geo.properties?.name ?? "");
  };

  return (
    <>
      {geographies.map((geo) => {
        if (isHouse && !isCongressionalDistrictGeoid(geo.properties?.GEOID)) return null;
        const match = matchFor(geo);
        const noElMatch = !match && !isHouse ? noElByState.get(geo.properties?.name ?? "") : undefined;
        const fill = match ? getRaceColor(match.margin) : t.mapUnfilled;
        const isSelected = !!(match && selectedId === match.id);
        const isSelectedNoEl = !!(noElMatch && selectedNoElAbbr === noElMatch.abbr);
        const isInteractive = !!(match || noElMatch);
        const selectGeography = () => {
          if (match) onSelect(match, null);
          else if (noElMatch) onSelect(null, noElMatch);
        };
        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            onMouseEnter={() => {
              if (match) onHover(match, null);
              else if (noElMatch) onHover(null, noElMatch);
            }}
            onMouseLeave={() => onHover(null, null)}
            onClick={selectGeography}
            onPointerDown={(e: React.PointerEvent) => {
              if (e.pointerType !== "touch") { touchStartRef.current = null; return; }
              touchStartRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e: React.PointerEvent) => {
              if (e.pointerType !== "touch") return;
              const start = touchStartRef.current;
              touchStartRef.current = null;
              if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
              selectGeography();
            }}
            style={{
              default: {
                fill,
                stroke: (isSelected || isSelectedNoEl) ? t.hoverStroke : t.mapStroke,
                strokeWidth: (isSelected || isSelectedNoEl) ? (isHouse ? 2 : 3.5) : (isHouse ? 0.4 : 1.0),
                outline: "none",
              },
              hover: {
                fill: match ? fill : t.hoverUnfilled,
                stroke: t.hoverStroke,
                strokeWidth: isHouse ? 0.7 : 1.5,
                outline: "none",
                cursor: isInteractive ? "pointer" : "default",
              },
              pressed: { fill, stroke: t.hoverStroke, strokeWidth: isHouse ? 2 : 3.5, outline: "none" },
            }}
          />
        );
      })}
    </>
  );
});

// State borders drawn over the House districts — static, so memoized on the theme alone.
const HouseStateOutlines = memo(function HouseStateOutlines({ t, topo }: { t: Theme; topo: object }) {
  return (
    <Geographies geography={topo}>
      {({ geographies }: { geographies: GeoFeature[] }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            style={{
              default: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
              hover: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
              pressed: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
            }}
          />
        ))
      }
    </Geographies>
  );
});

export default function ForecastMap({
  activeTab, raceType = "senate",
  races = NO_RACES, noElection = NO_ENTRIES, genericBallotDiff = 0, stateRows = NO_ROWS,
}: ForecastMapProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ForecastSummary | null>(null);
  const [selectedNoElection, setSelectedNoElection] = useState<NoElectionEntry | null>(null);
  const [selectedStateRow, setSelectedStateRow] = useState<StateRow | null>(null);
  const [statesMode, setStatesMode] = useState<MapMode>("legislature");
  const [statesView, setStatesView] = useState<"map" | "cartogram">("map");
  const [hovered, setHovered] = useState<ForecastSummary | null>(null);
  const [hoveredNoElection, setHoveredNoElection] = useState<NoElectionEntry | null>(null);
  const tip = useMapTooltip(16, 8);
  const darkMode = useDarkMode();
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const mapColRef = useRef<HTMLDivElement>(null);
  const [mapColHeight, setMapColHeight] = useState<number | undefined>(undefined);
  const statesMapBoxRef = useRef<HTMLDivElement>(null);
  const [statesMapBoxHeight, setStatesMapBoxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (activeTab === "forecast") persistRaceType(raceType);
  }, [activeTab, raceType]);

  // Keep the "Key Races" column capped to the height of the map column (forecast tab only).
  useEffect(() => {
    const el = mapColRef.current;
    if (!el || activeTab !== "forecast") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMapColHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab, raceType]);

  // States tab: the list scrollbox is capped to the map/cartogram box's own height —
  // deliberately excludes the legend below it.
  useEffect(() => {
    const el = statesMapBoxRef.current;
    if (!el || activeTab !== "states") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setStatesMapBoxHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab, statesView]);

  function selectRaceType(type: RaceType) {
    persistRaceType(type);
    router.push(`/${type}`);
  }

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isHouse = activeTab === "forecast" && raceType === "house";
  const geoUrl = isHouse ? HOUSE_DISTRICTS_2026_URL : STATES_URL;
  // Both start loading on mount and stay cached across Senate/House/Governor navigation.
  const statesTopo = useTopo(STATES_URL);
  const districtsTopo = useTopo(HOUSE_DISTRICTS_2026_URL);
  const stateLinesTopo = useTopo(HOUSE_STATE_LINES_URL);
  const geoTopo = isHouse ? districtsTopo : statesTopo;
  const data = races;
  const forecastMapKey = `${geoUrl}:${raceType}:${mapKey}`;
  const demSeats = SEAT_HOLDOVERS[raceType].dem + data.filter((race) => race.margin <= 0).length;
  const repSeats = SEAT_HOLDOVERS[raceType].rep + data.filter((race) => race.margin > 0).length;
  const totalSeats = TOTAL_SEATS_BY_TYPE[raceType];
  const genericBallot = { diff: genericBallotDiff };
  const tossUps = useMemo(() => data.filter((race) => Math.abs(race.margin) < 1).length, [data]);
  const flipped = useMemo(
    () => data.filter((race) => race.seatParty && race.seatParty !== (race.margin <= 0 ? "D" : "R")).length,
    [data]
  );

  const onHover = useCallback((race: ForecastSummary | null, noEl: NoElectionEntry | null) => {
    setHovered(race);
    setHoveredNoElection(noEl);
  }, []);
  const onSelect = useCallback((race: ForecastSummary | null, noEl: NoElectionEntry | null) => {
    setSelected(race);
    setSelectedNoElection(noEl);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: t.bg }}>

      {/* ── Page content ── */}
      <div className="px-3 pt-1 pb-3 sm:px-4 sm:pt-1 sm:pb-4 md:px-6 md:pt-1 md:pb-5">

        {/* ── Forecast hero + flat race-type header (forecast tab only) ── */}
        {activeTab === "forecast" && (
          <div
            className="-mx-3 -mt-1 mb-3 px-3 pt-1 pb-px sm:-mx-4 sm:px-4 md:-mx-6 md:px-6"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, var(--app-bg) 100%), linear-gradient(105deg, color-mix(in srgb, var(--party-rep) 7%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 6%, var(--app-bg)) 100%)",
            }}
          >
            <ForecastHero
              raceType={raceType}
              demSeats={demSeats}
              repSeats={repSeats}
              totalSeats={totalSeats}
              seatsUp={data.length}
              genericBallotDiff={genericBallot.diff}
              tossUps={tossUps}
              flipped={flipped}
            />
            <RaceTypeHeader raceType={raceType} onSelect={selectRaceType} count={data.length} />
          </div>
        )}

        {/* ── Historical hero ── */}
        {activeTab === "historical" && (
          <div
            className="-mx-3 -mt-1 px-3 pb-2 pt-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, var(--app-bg) 100%), linear-gradient(105deg, color-mix(in srgb, var(--party-rep) 7%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 6%, var(--app-bg)) 100%)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              Election Archive
            </div>
            <h1
              className="mt-1 text-2xl font-bold tracking-tight md:text-[1.65rem]"
              style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}
            >
              Historical Results
            </h1>
          </div>
        )}

        {/* ── States hero ── */}
        {activeTab === "states" && (
          <div
            className="-mx-3 -mt-1 px-3 pb-1 pt-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, var(--app-bg) 100%), linear-gradient(105deg, color-mix(in srgb, var(--party-rep) 7%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 6%, var(--app-bg)) 100%)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              Analysis
            </div>
            <h1
              className="mt-1 text-2xl font-bold tracking-tight md:text-[1.65rem]"
              style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}
            >
              Current Seat Delegation
            </h1>
          </div>
        )}

        {/* ── States tab controls: mode tabs + map/cartogram toggle ── */}
        {activeTab === "states" && (
          <div
            className="mb-4 flex items-end justify-between gap-2"
            style={{ borderBottom: "1px solid var(--app-border)" }}
          >
            <nav className="flex min-w-0 gap-3 sm:gap-5">
              {(["governor", "senate", "house", "legislature"] as MapMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setStatesMode(m)}
                  className="-mb-px pb-2.5 text-[10px] uppercase tracking-wider sm:text-[11px]"
                  style={{
                    color: statesMode === m ? "var(--app-text-primary)" : "var(--app-text-muted)",
                    fontWeight: statesMode === m ? 700 : 600,
                    borderBottom: statesMode === m ? "2px solid var(--app-text-primary)" : "2px solid transparent",
                  }}
                >
                  {m === "governor" ? "Governor" : m === "senate" ? "Senate" : m === "house" ? "House" : "Legislature"}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => setStatesView((view) => view === "map" ? "cartogram" : "map")}
              className="mb-1.5 shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold transition-colors sm:text-[11px]"
              style={{ border: "1px solid var(--app-border)", background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}
              aria-label={`Switch to ${statesView === "map" ? "cartogram" : "map"} view`}
            >
              {statesView === "map" ? "Cartogram" : "Map"}
            </button>
          </div>
        )}

        {/* ── Map (2/3) + Key Races (1/3) on desktop, forecast tab only ── */}
        <div className={activeTab === "forecast" || activeTab === "states" ? "md:grid md:grid-cols-3 md:gap-8 md:items-start" : ""}>
        <div ref={mapColRef} className={activeTab === "forecast" || activeTab === "states" ? "md:col-span-2" : ""}>

        {/* ── States map/cartogram (its own block — decoupled from the forecast map's hover/zoom state) ── */}
        {activeTab === "states" && (
          <div ref={statesMapBoxRef}>
            {statesView === "map" ? (
              <div className="relative h-[280px] overflow-hidden rounded-lg sm:h-[360px] md:h-[460px]">
                <StatesOverviewMap rows={stateRows} theme={t} mode={statesMode} selected={selectedStateRow} onSelect={setSelectedStateRow} />
              </div>
            ) : (
              <StatesCartogramGrid rows={stateRows} mode={statesMode} selected={selectedStateRow} onSelect={setSelectedStateRow} />
            )}
          </div>
        )}

        {/* ── Mobile selected-state popup (below map, hidden on desktop where the list column shows selection inline) ── */}
        {activeTab === "states" && selectedStateRow && (
          <div className="md:hidden mt-3">
            <StatesSelectedCard row={selectedStateRow} mode={statesMode} onClose={() => setSelectedStateRow(null)} />
          </div>
        )}

        {/* ── Map card (forecast only — counties renders its own layout below) ── */}
        {activeTab === "forecast" && <div
          className="relative h-[320px] overflow-hidden rounded-xl sm:h-[400px] md:h-auto md:aspect-[8/5]"
          onMouseMove={tip.onMouseMove}
        >
          {/* Hover tooltip */}
          {hovered && (() => {
            const demPct = Math.max(0, Math.min(100, 50 - hovered.margin / 2));
            const repPct = Math.max(0, Math.min(100, 50 + hovered.margin / 2));
            const marginAbs = Math.abs(hovered.margin);
            const marginLabel = hovered.margin <= 0
              ? `D+${marginAbs.toFixed(1)}`
              : `R+${marginAbs.toFixed(1)}`;
            const hoveredRating = marginToRating(hovered.margin);
            const { bg: badgeColor, text: badgeText } = getRatingColors(hoveredRating);

            const tipW = 190;
            const marginColor = hovered.margin <= 0 ? t.demText : t.repText;

            return (
              <div ref={tip.tooltipRef}
                className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
                style={{
                  width: tipW,
                  padding: "6px 8px",
                  background: t.panel,
                  border: `1px solid ${t.border}`,
                  color: t.textPrimary,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                }}
              >
                {/* Header: district name + rating badge + margin top-right */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs">{hovered.name}</span>
                    <span
                      className="font-semibold px-1 py-0.5 rounded"
                      style={{ background: badgeColor, color: badgeText, whiteSpace: "nowrap", fontSize: 10 }}
                    >
                      {hoveredRating}
                    </span>
                  </div>
                  <span className="font-bold shrink-0" style={{ fontSize: 15, color: marginColor }}>
                    {marginLabel}
                  </span>
                </div>
                {/* Candidate rows: name left, percentage right */}
                {hovered.candidates ? (
                  <div className="mb-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="truncate mr-1" style={{ color: t.demText, fontSize: 11 }}>{hovered.candidates.dem.name}{hovered.candidates.dem.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}</span>
                      <span className="font-semibold shrink-0" style={{ color: t.demText, fontSize: 11 }}>{demPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="truncate mr-1" style={{ color: t.repText, fontSize: 11 }}>{hovered.candidates.rep.name}{hovered.candidates.rep.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}</span>
                      <span className="font-semibold shrink-0" style={{ color: t.repText, fontSize: 11 }}>{repPct.toFixed(1)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mb-1.5">
                    <span className="font-semibold" style={{ color: t.demText, fontSize: 11 }}>D {demPct.toFixed(1)}%</span>
                    <span className="font-semibold" style={{ color: t.repText, fontSize: 11 }}>R {repPct.toFixed(1)}%</span>
                  </div>
                )}
                {/* D/R split bar */}
                <div className="flex rounded-full overflow-hidden" style={{ height: 3 }}>
                  <div style={{ width: `${demPct}%`, background: t.demText }} />
                  <div style={{ width: `${repPct}%`, background: t.repText }} />
                </div>
              </div>
            );
          })()}

          {/* No-election hover tooltip */}
          {hoveredNoElection && (() => {
            const tipW = 185;
            return (
              <div ref={tip.tooltipRef}
                className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
                style={{
                  width: tipW,
                  padding: "8px 10px",
                  background: t.panel,
                  border: `1px solid ${t.border}`,
                  color: t.textPrimary,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                }}
              >
                <div className="font-bold text-sm mb-1">{hoveredNoElection.state}</div>
                <div className="text-xs font-semibold" style={{ color: t.textMuted }}>
                  No Election in 2026
                </div>
                <div className="text-xs mt-0.5" style={{ color: t.textVeryMuted }}>
                  Click for incumbent info
                </div>
              </div>
            );
          })()}

          <ComposableMap
            key={forecastMapKey}
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1200 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ZoomableGroup
              key={mapKey}
              filterZoomEvent={filterMapZoomEvent}
              onMoveEnd={() => setViewChanged(true)}
            >
            {geoTopo && (
            <Geographies geography={geoTopo}>
              {({ geographies }: { geographies: GeoFeature[] }) => (
                <ForecastGeoLayer
                  geographies={geographies}
                  isHouse={isHouse}
                  races={races}
                  noElection={noElection}
                  selectedId={selected?.id ?? null}
                  selectedNoElAbbr={selectedNoElection?.abbr ?? null}
                  t={t}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              )}
            </Geographies>
            )}
            {isHouse && stateLinesTopo && <HouseStateOutlines t={t} topo={stateLinesTopo} />}
            </ZoomableGroup>
          </ComposableMap>

          {/* ── Reset zoom button ── */}
          {viewChanged && (
            <button
              onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
              className="absolute z-10 bottom-3 left-2 md:bottom-auto md:top-4 md:left-4 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-sm"
              style={{ background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
            >
              Reset
            </button>
          )}

          {/* ── Sidebar (floating panel) ── */}
          <Sidebar selected={selected} raceType={raceType} onClose={() => setSelected(null)} theme={t} />

          {/* ── No-Election Panel (desktop floating) ── */}
          {selectedNoElection && (() => {
            const noElColor = selectedNoElection.party === "D" ? t.demText : selectedNoElection.party === "R" ? t.repText : t.textPrimary;
            const noElBg = selectedNoElection.party === "D" ? t.candidateDemBg : selectedNoElection.party === "R" ? t.candidateRepBg : t.tabBg;
            return (
              <div
                className="absolute z-30 hidden flex-col overflow-hidden rounded-xl backdrop-blur-sm md:flex"
                style={{
                  right: "1.25rem",
                  bottom: "12px",
                  width: 172,
                  background: t.legendBg,
                  border: `1px solid ${t.border}`,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
                  color: t.textPrimary,
                }}
              >
                {/* Header */}
                <div className="shrink-0 p-2 pb-1.5" style={{ borderBottom: `1px solid ${t.border}` }}>
                  <div className="flex items-center justify-between gap-1.5">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-bold leading-tight" style={{ color: t.textPrimary }}>
                      {selectedNoElection.state}
                    </h2>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0"
                      style={{ background: t.tabBg, color: t.textMuted }}
                    >
                      No Election
                    </span>
                    <button
                      onClick={() => setSelectedNoElection(null)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
                      style={{ color: t.textVeryMuted, background: t.tabBg }}
                      aria-label="Close"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Body */}
                <div className="p-2 flex flex-col gap-1.5">
                  {/* Incumbent card */}
                  <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>
                      Incumbent
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate text-[10px] font-bold leading-tight" style={{ color: noElColor }}>
                        {selectedNoElection.incumbent}
                      </div>
                      <span
                        className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded"
                        style={{ background: noElBg, color: noElColor }}
                      >
                        {selectedNoElection.party}
                      </span>
                    </div>
                  </div>
                  {/* Next election card */}
                  <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>
                      Next Election
                    </div>
                    <div className="text-base font-bold leading-none" style={{ color: t.textPrimary }}>
                      {selectedNoElection.nextElection}
                    </div>
                  </div>
                  {/* More info link */}
                  <a
                    href={`/${raceType}/${selectedNoElection.abbr.toLowerCase()}`}
                    className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
                    style={{ background: t.tabBg, color: t.textMuted }}
                  >
                    More Info
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })()}

        </div>}

        {/* ── Quiet map legend (forecast tab only — sits under the map, not floating over it) ── */}
        {activeTab === "forecast" && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {LEGEND.map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: t.textMuted }}>
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        )}

        </div>
        {activeTab === "forecast" && (
          <div
            className="hidden md:block md:overflow-y-auto md:pr-1"
            style={{ height: mapColHeight, maxHeight: mapColHeight }}
          >
            <KeyRaces races={data} basePath={`/${raceType}`} showSpecialBadge={raceType === "senate"} />
          </div>
        )}
        {activeTab === "states" && (
          <div
            className="mt-5 md:mt-0 md:pr-1"
            style={{ "--states-map-height": `${statesMapBoxHeight}px` } as CSSProperties}
          >
            <StatesLedgerList rows={stateRows} mode={statesMode} selected={selectedStateRow} onSelect={setSelectedStateRow} />
          </div>
        )}
        </div>

        {/* ── Counties (owns its own hero/controls/map/results layout) ── */}
        {activeTab === "historical" && <NationalCountyMap theme={t} />}

        {/* ── Mobile selected-race panel (below map) ── */}
        {selected && (() => {
          const demPct = (100 - selected.margin) / 2;
          const repPct = (100 + selected.margin) / 2;
          const selectedRating = marginToRating(selected.margin);
          const { bg: rBg, text: rText } = getRatingColors(selectedRating);
          const marginIsD = selected.margin <= 0;
          return (
            <div
              className="mt-3 overflow-hidden rounded-xl md:hidden"
              style={{ border: `1px solid ${t.border}`, background: t.legendBg, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 p-3 pb-2.5" style={{ borderBottom: `1px solid ${t.border}` }}>
                <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: t.textPrimary }}>{selected.name}</span>
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: rBg, color: rText }}>{selectedRating}</span>
                <button
                  onClick={() => setSelected(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors"
                  style={{ color: t.textVeryMuted, background: t.tabBg }}
                  aria-label="Close"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Body */}
              <div className="grid grid-cols-[1fr_auto] gap-2 p-3">
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Candidates</div>
                  {selected.candidates ? (
                    <>
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span className="truncate text-[10px] font-bold" style={{ color: t.textPrimary }}>
                          {selected.candidates.dem.name}{selected.candidates.dem.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums" style={{ color: t.demText }}>{demPct.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[10px] font-bold" style={{ color: t.textPrimary }}>
                          {selected.candidates.rep.name}{selected.candidates.rep.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums" style={{ color: t.repText }}>{repPct.toFixed(1)}%</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-3">
                      <span className="text-[10px] font-bold" style={{ color: t.demText }}>D {demPct.toFixed(1)}%</span>
                      <span className="text-[10px] font-bold" style={{ color: t.repText }}>R {repPct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Margin</div>
                  <div className="text-base font-bold leading-none tabular-nums" style={{ color: marginIsD ? t.demText : t.repText }}>
                    {marginIsD ? "D+" : "R+"}{Math.abs(selected.margin).toFixed(1)}
                  </div>
                </div>
              </div>
              {/* More Info */}
              <div className="px-3 pb-3">
                <a
                  href={`/${raceType}/${(raceType === "house" ? selected.name : selected.id).toLowerCase().replace(/-2$/, "2")}`}
                  className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
                  style={{ background: t.tabBg, color: t.textMuted }}
                >
                  More Info
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          );
        })()}

        {/* ── Mobile no-election panel (below map) ── */}
        {selectedNoElection && (() => {
          const noElColor = selectedNoElection.party === "D" ? t.demText : selectedNoElection.party === "R" ? t.repText : t.textPrimary;
          const noElBg = selectedNoElection.party === "D" ? t.candidateDemBg : selectedNoElection.party === "R" ? t.candidateRepBg : t.tabBg;
          return (
            <div
              className="mt-3 overflow-hidden rounded-xl md:hidden"
              style={{ border: `1px solid ${t.border}`, background: t.legendBg, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 p-3 pb-2.5" style={{ borderBottom: `1px solid ${t.border}` }}>
                <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: t.textPrimary }}>{selectedNoElection.state}</span>
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: t.tabBg, color: t.textMuted }}>No Election</span>
                <button
                  onClick={() => setSelectedNoElection(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors"
                  style={{ color: t.textVeryMuted, background: t.tabBg }}
                  aria-label="Close"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Body */}
              <div className="grid grid-cols-[1fr_auto] gap-2 p-3">
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Incumbent</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-bold" style={{ color: noElColor }}>{selectedNoElection.incumbent}</span>
                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: noElBg, color: noElColor }}>{selectedNoElection.party}</span>
                  </div>
                </div>
                <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                  <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Next Election</div>
                  <div className="text-base font-bold leading-none" style={{ color: t.textPrimary }}>{selectedNoElection.nextElection}</div>
                </div>
              </div>
              {/* More Info */}
              <div className="px-3 pb-3">
                <a
                  href={`/${raceType}/${selectedNoElection.abbr.toLowerCase()}`}
                  className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
                  style={{ background: t.tabBg, color: t.textMuted }}
                >
                  More Info
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          );
        })()}

        {/* ── Below-map table (memoized — stable across mouse-move re-renders) ── */}
        {useMemo(() => (
          <>
            {activeTab === "forecast" && (
              <div className="mt-4 md:mt-3">
                <ForecastRaceCards races={races} basePath={`/${raceType}`} showSpecialBadge={raceType === "senate"} />
              </div>
            )}
            {activeTab === "district-finder" && <DistrictFinder />}
          </>
        ), [activeTab, raceType, races])}

      </div>
    </div>
  );
}
