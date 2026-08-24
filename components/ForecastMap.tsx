"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor, getRatingColors, marginToRating } from "@/lib/colorScale";
import { senateData, governorData, houseData, senateNoElection, governorNoElection, RaceForecast, RaceType, NoElectionEntry, electionYear, senateCurrent, pres2024, statePvi, houseDelegationHistory, stateLegData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { computeProjectedMargin } from "@/lib/tplCompute";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { RaceTypeHeader, ForecastHero, ForecastRaceCards, KeyRaces } from "./ForecastLedger";

// Both computeProjectedMargin and forecastData.margin are now R-positive — no negation needed
export const projectedSenateData = senateData.map(r => ({ ...r, margin: computeProjectedMargin(r) }));
export const projectedGovernorData = governorData.map(r => ({ ...r, margin: computeProjectedMargin(r) }));
export const projectedHouseData = houseData.map(r => ({ ...r, margin: computeProjectedMargin(r) }));

// Non-2026 seats already held by each party (Senate classes not up this cycle, Governor terms not up) —
// added to projected win counts to get full chamber totals.
export const SEAT_HOLDOVERS = {
  senate: { dem: 34, rep: 31 },
  governor: { dem: 6, rep: 8 },
  house: { dem: 0, rep: 0 },
};
export const TOTAL_SEATS_BY_TYPE = { senate: 100, governor: 50, house: 435 };
import Sidebar from "./Sidebar";
import StatesTable, { StateRow } from "./StatesTable";
import NationalCountyMap from "./NationalCountyMap";
import StatesOverviewMap, { type MapMode } from "./StatesOverviewMap";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import TplModelPage from "./TplModelPage";
import DistrictFinder from "./DistrictFinder";
import PollingAverageCard from "./PollingAverageCard";
import OverviewDashboard from "./OverviewDashboard";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const HOUSE_DISTRICTS_2026_URL = "/congressional-districts-2026.json";

type GeoFeature = {
  rsmKey: string;
  id?: string | number;
  properties?: Record<string, string | undefined>;
};

function racePartyOverview(race: RaceForecast): "D" | "R" | "I" {
  if (race.seatParty) return race.seatParty;
  if (race.candidates?.dem.incumbent) return "D";
  if (race.candidates?.rep.incumbent) return "R";
  return race.margin <= 0 ? "D" : "R";
}

const stateRows: StateRow[] = statesData.map((state) => {
  const govRace = governorData.find((r) => r.id === state.abbr);
  const govNoEl = !govRace ? governorNoElection.find((e) => e.abbr === state.abbr) : null;
  const govParty: "D" | "R" | "I" | null = govRace ? racePartyOverview(govRace) : (govNoEl?.party ?? null);
  const [senSeat1, senSeat2] = senateCurrent[state.abbr] ?? ["R", "R"];
  const seats = [senSeat1, senSeat2];
  const senateDem = seats.filter((p) => p === "D").length;
  const senateRep = seats.filter((p) => p === "R").length;
  const senateInd = seats.filter((p) => p === "I").length;
  const houseRaces = houseData.filter((r) => r.state === state.name);
  const del2024 = (houseDelegationHistory[state.name] ?? []).find((e) => e.year === 2024);
  const houseDem = del2024 ? del2024.demSeats : houseRaces.filter((r) => racePartyOverview(r) === "D").length;
  const houseRep = del2024 ? del2024.repSeats : houseRaces.filter((r) => racePartyOverview(r) === "R").length;
  const legEntries = stateLegData[state.name] ?? [];
  const latestLegHouse = legEntries.filter(e => e.type === "House" && e.demSeats != null && e.repSeats != null).sort((a, b) => b.year - a.year)[0];
  const latestLegSenate = legEntries.filter(e => e.type === "Senate" && e.demSeats != null && e.repSeats != null).sort((a, b) => b.year - a.year)[0];
  return {
    id: state.id,
    name: state.name,
    abbr: state.abbr,
    govParty,
    senateDem,
    senateRep,
    senateInd,
    houseDem,
    houseRep,
    houseTotal: houseRaces.length,
    pres2024: pres2024[state.abbr] ?? null,
    pvi2026: statePvi[state.abbr] ?? null,
    stateLegHouseDem: latestLegHouse?.demSeats ?? null,
    stateLegHouseRep: latestLegHouse?.repSeats ?? null,
    stateLegSenateDem: latestLegSenate?.demSeats ?? null,
    stateLegSenateRep: latestLegSenate?.repSeats ?? null,
  };
});

const abbrByStateName: Record<string, string> = Object.fromEntries(
  statesData.map((s) => [s.name, s.abbr])
);

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

type TopLevelTab = "forecast" | "overview" | "states" | "historical" | "model" | "district-finder";

type ModelSubTab = "state" | "district" | "table" | "districtTable";

export default function ForecastMap({ activeTab, raceType = "senate", modelSubTab }: { activeTab: TopLevelTab; raceType?: RaceType; modelSubTab?: ModelSubTab }) {
  const router = useRouter();
  const [selected, setSelected] = useState<RaceForecast | null>(null);
  const [selectedNoElection, setSelectedNoElection] = useState<NoElectionEntry | null>(null);
  const [selectedStateRow, setSelectedStateRow] = useState<StateRow | null>(null);
  const [selectedStateMode, setSelectedStateMode] = useState<MapMode>("default");
  const [hovered, setHovered] = useState<RaceForecast | null>(null);
  const [hoveredNoElection, setHoveredNoElection] = useState<NoElectionEntry | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; containerW: number; containerH: number }>({ x: 0, y: 0, containerW: 800, containerH: 520 });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const darkMode = useDarkMode();
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const mapColRef = useRef<HTMLDivElement>(null);
  const [mapColHeight, setMapColHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (activeTab === "forecast") persistRaceType(raceType);
  }, [activeTab, raceType]);

  // Keep the "Key Races" column capped to the height of the map+legend column
  // (its own content scrolls past that instead of stretching the row).
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

  function selectRaceType(type: RaceType) {
    persistRaceType(type);
    router.push(`/${type}`);
  }

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isHouse = activeTab === "forecast" && raceType === "house";
  const geoUrl = isHouse ? HOUSE_DISTRICTS_2026_URL : STATES_URL;
  const data = raceType === "house" ? projectedHouseData : raceType === "senate" ? projectedSenateData : projectedGovernorData;
  const forecastMapKey = `${geoUrl}:${raceType}:${mapKey}`;
  const demSeats = SEAT_HOLDOVERS[raceType].dem + data.filter((race) => race.margin <= 0).length;
  const repSeats = SEAT_HOLDOVERS[raceType].rep + data.filter((race) => race.margin > 0).length;
  const totalSeats = TOTAL_SEATS_BY_TYPE[raceType];
  const genericBallot = useMemo(() => computeGenericBallotAverage(), []);
  const tossUps = useMemo(() => data.filter((race) => Math.abs(race.margin) < 1).length, [data]);
  const flipped = useMemo(
    () => data.filter((race) => race.seatParty && race.seatParty !== (race.margin <= 0 ? "D" : "R")).length,
    [data]
  );

  function findMatch(geo: GeoFeature): RaceForecast | undefined {
    if (isHouse) {
      const geoId = geo.properties?.GEOID as string | undefined;
      if (!geoId) return undefined;
      // Census at-large GEOIDs end in "00"; our ids end in "01" — try both
      return data.find((d) => d.id === geoId)
          ?? (geoId.endsWith("00") ? data.find((d) => d.id === geoId.slice(0, -2) + "01") : undefined);
    }
    return data.find((d) => d.state === geo.properties?.name);
  }

  function findNoElection(geo: GeoFeature): NoElectionEntry | undefined {
    if (isHouse) return undefined;
    const noElData = raceType === "senate" ? senateNoElection : governorNoElection;
    return noElData.find((d) => d.state === geo.properties?.name);
  }

  return (
    <div className="min-h-screen" style={{ background: t.bg }}>

      {/* ── Page content ── */}
      <div className="px-3 pt-1 pb-3 sm:px-4 sm:pt-1 sm:pb-4 md:px-6 md:pt-1 md:pb-5">

        {/* ── Forecast hero + flat race-type header (forecast tab only) ── */}
        {activeTab === "forecast" && (
          <>
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
          </>
        )}

        {/* ── Map (2/3) + Key Races (1/3) on desktop, forecast tab only ── */}
        <div className={activeTab === "forecast" ? "md:grid md:grid-cols-3 md:gap-8 md:items-start" : ""}>
        <div ref={mapColRef} className={activeTab === "forecast" ? "md:col-span-2" : ""}>

        {/* ── Map card (forecast/states only — counties renders its own layout below) ── */}
        {(activeTab === "forecast" || activeTab === "states") && <div
          className={
            activeTab === "forecast"
              ? "relative h-[320px] overflow-hidden rounded-xl sm:h-[400px] md:h-auto md:aspect-[8/5]"
              : "relative h-[320px] overflow-hidden rounded-xl sm:h-[400px] md:h-[520px]"
          }
          style={
            activeTab === "forecast"
              ? {}
              : { border: `1px solid ${t.border}`, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }
          }
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top, containerW: rect.width, containerH: rect.height });
          }}
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
            const tipH = hovered.candidates ? 115 : 88;
            const offset = 16;
            const edgePad = 8;
            let left = mousePos.x + offset;
            let top = mousePos.y + offset;
            if (left + tipW + edgePad > mousePos.containerW) {
              left = mousePos.x - tipW - offset;
            }
            if (top + tipH + edgePad > mousePos.containerH) {
              top = mousePos.y - tipH - offset;
            }
            if (left < edgePad) left = edgePad;
            if (top < edgePad) top = edgePad;
            const marginColor = hovered.margin <= 0 ? t.demText : t.repText;

            return (
              <div
                className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
                style={{
                  left,
                  top,
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
            const tipH = 70;
            const offset = 16;
            const edgePad = 8;
            let left = mousePos.x + offset;
            let top = mousePos.y + offset;
            if (left + tipW + edgePad > mousePos.containerW) {
              left = mousePos.x - tipW - offset;
            }
            if (top + tipH + edgePad > mousePos.containerH) {
              top = mousePos.y - tipH - offset;
            }
            if (left < edgePad) left = edgePad;
            if (top < edgePad) top = edgePad;
            return (
              <div
                className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
                style={{
                  left, top, width: tipW,
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

          {activeTab === "states"
            ? <StatesOverviewMap rows={stateRows} theme={t} onSelect={setSelectedStateRow} onModeChange={setSelectedStateMode} />
            : <ComposableMap
            key={forecastMapKey}
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1200 }}
            style={{ width: "100%", height: "100%" }}
          >
            {isHouse && <NationalLandMaskDefinition />}
            <ZoomableGroup
              key={mapKey}
              filterZoomEvent={filterMapZoomEvent}
              onMoveEnd={() => setViewChanged(true)}
            >
            <NationalLandMask enabled={isHouse}>
            <Geographies geography={geoUrl}>
              {({ geographies }: { geographies: GeoFeature[] }) =>
                geographies.map((geo) => {
                  if (isHouse && !isCongressionalDistrictGeoid(geo.properties?.GEOID)) return null;
                  const match = findMatch(geo);
                  const noElMatch = !match ? findNoElection(geo) : undefined;
                  const fill = match ? getRaceColor(match.margin) : t.mapUnfilled;
                  const isSelected = selected && match && selected.id === match.id;
                  const isSelectedNoEl = selectedNoElection && noElMatch && selectedNoElection.abbr === noElMatch.abbr;
                  const isInteractive = !!(match || noElMatch);
                  const selectGeography = () => {
                    if (match) { setSelected(match); setSelectedNoElection(null); }
                    else if (noElMatch) { setSelectedNoElection(noElMatch); setSelected(null); }
                  };

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => {
                        if (match) { setHovered(match); setHoveredNoElection(null); }
                        else if (noElMatch) { setHoveredNoElection(noElMatch); setHovered(null); }
                      }}
                      onMouseLeave={() => { setHovered(null); setHoveredNoElection(null); }}
                      onClick={selectGeography}
                      onPointerDown={(e: React.PointerEvent) => {
                        if (e.pointerType !== "touch") {
                          touchStartRef.current = null;
                          return;
                        }
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
                        pressed: {
                          fill,
                          stroke: t.hoverStroke,
                          strokeWidth: isHouse ? 2 : 3.5,
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
            {isHouse && (
              <Geographies geography={STATES_URL}>
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
            )}
            </NationalLandMask>
            </ZoomableGroup>
          </ComposableMap>}

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

          {/* ── Legend (bottom-left, states tab only — forecast gets a quiet one below the map) ── */}
          {activeTab !== "forecast" && (
            <div
              className="hidden md:flex absolute items-center gap-1 p-1"
              style={{ bottom: "12px", left: "1rem" }}
            >
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <div style={{ background: color }} className="w-5 h-2.5 rounded-sm" />
                  <span className="text-[8px] whitespace-nowrap" style={{ color: t.textMuted }}>{label}</span>
                </div>
              ))}
            </div>
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
            style={{ maxHeight: mapColHeight }}
          >
            <KeyRaces races={data} basePath={`/${raceType}`} showSpecialBadge={raceType === "senate"} />
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

        {/* ── Mobile states panel (below map) ── */}
        {activeTab === "states" && selectedStateRow && (() => {
          return (
            <div
              className="mt-3 overflow-hidden rounded-xl md:hidden"
              style={{ border: `1px solid ${t.border}`, background: t.legendBg, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 p-3 pb-2.5" style={{ borderBottom: `1px solid ${t.border}` }}>
                <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: t.textPrimary }}>{selectedStateRow.name}</span>
                <button
                  onClick={() => setSelectedStateRow(null)}
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
              <div className="grid grid-cols-2 gap-2 p-3">
                {selectedStateMode === "default" && (
                  <div className="col-span-2 rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>PVI</div>
                    <div
                      className="text-sm font-bold"
                      style={{
                        color: selectedStateRow.pvi2026 == null
                          ? t.textVeryMuted
                          : selectedStateRow.pvi2026 > 0
                            ? t.repText
                            : selectedStateRow.pvi2026 < 0
                              ? t.demText
                              : t.textMuted,
                      }}
                    >
                      {selectedStateRow.pvi2026 == null
                        ? "—"
                        : selectedStateRow.pvi2026 === 0
                          ? "EVEN"
                          : selectedStateRow.pvi2026 > 0
                            ? `R+${selectedStateRow.pvi2026}`
                            : `D+${Math.abs(selectedStateRow.pvi2026)}`}
                    </div>
                  </div>
                )}
                {selectedStateMode === "governor" && (
                  <div className="col-span-2 rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Governor</div>
                    {(() => {
                      const p = selectedStateRow.govParty;
                      const colors: Record<string, { bg: string; text: string; label: string }> = {
                        D: { bg: "rgba(26,68,128,0.18)", text: t.demText, label: "Democrat" },
                        R: { bg: "rgba(139,26,26,0.18)", text: t.repText, label: "Republican" },
                        I: { bg: "rgba(120,106,26,0.18)", text: "#b8a020", label: "Independent" },
                      };
                      const c = p ? colors[p] : null;
                      return c ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{c.label}</span>
                      ) : <span className="text-[10px]" style={{ color: t.textVeryMuted }}>Unknown</span>;
                    })()}
                  </div>
                )}
                {selectedStateMode === "senate" && (
                  <div className="col-span-2 rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Senate Seats</div>
                    <div className="text-sm font-bold">
                      <span style={{ color: t.demText }}>{selectedStateRow.senateDem}D</span>
                      <span style={{ color: t.textVeryMuted }}> / </span>
                      <span style={{ color: t.repText }}>{selectedStateRow.senateRep}R</span>
                      {selectedStateRow.senateInd > 0 && <><span style={{ color: t.textVeryMuted }}> / </span><span style={{ color: "#b8a020" }}>{selectedStateRow.senateInd}I</span></>}
                    </div>
                  </div>
                )}
                {selectedStateMode === "house" && (
                  <div className="col-span-2 rounded-md p-2" style={{ background: t.tabBg }}>
                    <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>House Delegation</div>
                    <div className="text-sm font-bold">
                      <span style={{ color: t.demText }}>{selectedStateRow.houseDem}D</span>
                      <span style={{ color: t.textVeryMuted }}> / </span>
                      <span style={{ color: t.repText }}>{selectedStateRow.houseRep}R</span>
                    </div>
                  </div>
                )}
                {selectedStateMode === "legislature" && (
                  <>
                    <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                      <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>State House</div>
                      <div className="text-sm font-bold">
                        <span style={{ color: t.demText }}>{selectedStateRow.stateLegHouseDem ?? "—"}D</span>
                        <span style={{ color: t.textVeryMuted }}> / </span>
                        <span style={{ color: t.repText }}>{selectedStateRow.stateLegHouseRep ?? "—"}R</span>
                      </div>
                    </div>
                    <div className="rounded-md p-2" style={{ background: t.tabBg }}>
                      <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>State Senate</div>
                      <div className="text-sm font-bold">
                        <span style={{ color: t.demText }}>{selectedStateRow.stateLegSenateDem ?? "—"}D</span>
                        <span style={{ color: t.textVeryMuted }}> / </span>
                        <span style={{ color: t.repText }}>{selectedStateRow.stateLegSenateRep ?? "—"}R</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* More Info */}
              <div className="px-3 pb-3">
                <a
                  href={`/states/${selectedStateRow.id}`}
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
            {activeTab === "overview" && (
              <div className="mt-5 flex flex-col items-center gap-3">
                <div className="w-full" style={{ maxWidth: 720 }}>
                  <OverviewDashboard theme={t} />
                </div>
                <div className="w-full" style={{ maxWidth: 720 }}>
                  <PollingAverageCard theme={t} />
                </div>
              </div>
            )}
            {activeTab === "states" && (
              <div className="mt-4 md:mt-5">
                <div className="mb-3">
                  <h2 className="text-xl font-bold sm:text-2xl" style={{ color: t.textPrimary }}>States</h2>
                  <p className="text-sm mt-0.5" style={{ color: t.textMuted }}>{electionYear} Election Forecast by State · All 50 States</p>
                </div>
                <StatesTable rows={stateRows} />
              </div>
            )}
            {activeTab === "forecast" && (
              <div className="mt-6 md:mt-8">
                {raceType === "house" && <ForecastRaceCards races={projectedHouseData} basePath="/house" />}
                {raceType === "senate" && <ForecastRaceCards races={projectedSenateData} basePath="/senate" showSpecialBadge />}
                {raceType === "governor" && <ForecastRaceCards races={projectedGovernorData} basePath="/governor" />}
              </div>
            )}
            {activeTab === "model" && <TplModelPage initialSubTab={modelSubTab} />}
            {activeTab === "district-finder" && <DistrictFinder />}
          </>
        ), [activeTab, raceType, modelSubTab, t])}

      </div>
    </div>
  );
}
