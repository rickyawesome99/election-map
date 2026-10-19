"use client";

import { memo, useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor, marginToRating } from "@/lib/colorScale";
import type { RaceType, NoElectionEntry } from "@/data/forecastData";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE, isProjectedFlip, type ForecastSummary } from "@/lib/forecastTypes";
import { FlipPatternDefs, FlipSwatch, flipFill } from "./FlipStripes";
import { RaceTypeHeader, ForecastHero, ForecastRaceCards, KeyRaces } from "./ForecastLedger";

// Non-2026 seats already held by each party (Senate classes not up this cycle, Governor terms not up) —
// added to projected win counts to get full chamber totals.
export { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import Sidebar, { ForecastCardBox, ForecastRatingPill, forecastCard, noElectionCard, raceHref } from "./Sidebar";
import CountyTooltip, { CountyCardClose, CountyCardLink } from "./CountyTooltip";
import StatesOverviewMap, { type MapMode, type StateRow } from "./StatesOverviewMap";
import StatesCartogramGrid from "./StatesCartogramGrid";
import StatesLedgerList from "./StatesLedgerList";
import StatesSelectedCard from "./StatesSelectedCard";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useTopo } from "@/lib/useTopology";
import { startPendingNav } from "@/lib/navPending";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_HERO_BG } from "@/lib/pageLayout";

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

// One sample margin inside each rating band, Safe D → Safe R. The legend and the flip-stripe
// patterns both come from getRaceColor / marginToRating, so they can't drift from the map.
const BAND_MARGINS = [-20, -10, -3, -0.5, 0.5, 3, 10, 20];
const RACE_COLORS = BAND_MARGINS.map(getRaceColor);
const LEGEND = BAND_MARGINS.map((m) => ({ color: getRaceColor(m), label: marginToRating(m) }));

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
  bg: "#f9f8f5",
  panel: "#ffffff",
  border: "#d0d7de",
  tabBg: "#efede8",
  textPrimary: "#1f2328",
  textMuted: "#656d76",
  textVeryMuted: "#949ea6",
  hoverUnfilled: "#dde2e7",
  mapUnfilled: "#c8cdd3",
  noElection: "#8b929b",
  mapStroke: "#f9f8f5",
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
        const fill = !match ? t.mapUnfilled : isProjectedFlip(match) ? flipFill(getRaceColor(match.margin)) : getRaceColor(match.margin);
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
  const statesMapBoxRef = useRef<HTMLDivElement>(null);
  const [statesMapBoxHeight, setStatesMapBoxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (activeTab === "forecast") persistRaceType(raceType);
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
    // Keep the reader where they are: the map and the toggle sit below the fold on phones.
    startPendingNav(`/${type}`);
    router.push(`/${type}`, { scroll: false });
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
    () => data.filter(isProjectedFlip).length,
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
    <div className="min-h-screen overflow-x-clip" style={{ background: t.bg }}>

      {/* ── Page content ── */}
      {/* Historical and Forecast use the detail pages' content column (PAGE_CONTAINER) instead of
          the full-width padding; Historical's NationalCountyMap brings its own. */}
      <div className={activeTab === "historical" ? "pb-10" : activeTab === "forecast" ? `${PAGE_CONTAINER} pt-1 pb-5` : "px-3 pt-1 pb-3 sm:px-4 sm:pt-1 sm:pb-4 md:px-6 md:pt-1 md:pb-5"}>

        {/* ── Forecast hero + flat race-type header (forecast tab only) ── */}
        {activeTab === "forecast" && (
          // Bleeds the tint to the viewport edges from inside the content column; the padding puts
          // the hero's text back on the column (the root's overflow-x-clip absorbs a scrollbar).
          <div
            className={`-mt-1 mb-3 ${PAGE_HERO_TOP} pb-px`}
            style={{
              marginInline: "calc(50% - 50vw)",
              paddingInline: "calc(50vw - 50%)",
              background: PAGE_HERO_BG,
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

        {/* ── Delegation: map (2/3) + ledger (1/3) on desktop. Forecast: the map runs the full
            column with Key Races beneath it, since a third of PAGE_CONTAINER is too narrow. ── */}
        <div className={activeTab === "states" ? "md:grid md:grid-cols-3 md:gap-8 md:items-start" : ""}>
        <div className={activeTab === "states" ? "md:col-span-2" : ""}>

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
          className="relative aspect-[8/5] w-full overflow-hidden rounded-xl"
          onMouseMove={tip.onMouseMove}
        >
          {/* Hover tooltips: the county maps' card (CountyTooltip), rating pill beside the name */}
          {hovered && (
            <CountyTooltip {...forecastCard(hovered)} boxRef={tip.tooltipRef} className="absolute z-20 hidden md:block" aside={<ForecastRatingPill margin={hovered.margin} />} />
          )}
          {hoveredNoElection && (
            <CountyTooltip {...noElectionCard(hoveredNoElection)} boxRef={tip.tooltipRef} className="absolute z-20 hidden md:block" />
          )}

          {/* A 960×600 frame in the box's own 8:5 shape at every width: the old 800×600 frame was
              narrower than the drawing, so a phone's squarer box cut off both coasts. */}
          <ComposableMap
            key={forecastMapKey}
            width={960}
            height={600}
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1200 }}
            style={{ width: "100%", height: "100%" }}
          >
            <FlipPatternDefs colors={RACE_COLORS} />
            <ZoomableGroup
              key={mapKey}
              filterZoomEvent={filterMapZoomEvent}
              onMoveEnd={() => setViewChanged(true)}
            >
            {/* The AK/HI insets pull the drawing left of the frame's center; shift it back. */}
            <g transform="translate(18 0)">
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
            </g>
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

          {/* ── No-Election card (desktop floating) ── */}
          {selectedNoElection && (
            <ForecastCardBox theme={t}>
              <CountyTooltip
                {...noElectionCard(selectedNoElection)}
                variant="card"
                aside={<CountyCardClose onClick={() => setSelectedNoElection(null)} label="Close" />}
                footer={<CountyCardLink href={`/${raceType}/${selectedNoElection.abbr.toLowerCase()}`}>Seat page →</CountyCardLink>}
              />
            </ForecastCardBox>
          )}

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
            <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: t.textMuted }}>
              <FlipSwatch size={8} />
              Projected flip
            </span>
          </div>
        )}

        </div>
        {activeTab === "forecast" && (
          <div className="mt-8 hidden md:block">
            <KeyRaces races={data} basePath={`/${raceType}`} showSpecialBadge={raceType === "senate"} twoColumn />
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
        {/* Owns the historical hero (title + controls) as well as the dashboard, map and results */}
        {activeTab === "historical" && <NationalCountyMap theme={t} />}

        {/* ── Mobile selected panels (below map): the county maps' panel layout ── */}
        {selected && (
          <div className="mt-3 md:hidden">
            <CountyTooltip
              {...forecastCard(selected)}
              variant="panel"
              size="wide"
              aside={<><ForecastRatingPill margin={selected.margin} /><CountyCardClose onClick={() => setSelected(null)} label="Close selected race" small /></>}
              footer={<CountyCardLink href={raceHref(raceType, selected)}>Race page →</CountyCardLink>}
            />
          </div>
        )}
        {selectedNoElection && (
          <div className="mt-3 md:hidden">
            <CountyTooltip
              {...noElectionCard(selectedNoElection)}
              variant="panel"
              size="wide"
              aside={<CountyCardClose onClick={() => setSelectedNoElection(null)} label="Close" small />}
              footer={<CountyCardLink href={`/${raceType}/${selectedNoElection.abbr.toLowerCase()}`}>Seat page →</CountyCardLink>}
            />
          </div>
        )}

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
