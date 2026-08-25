"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import OH31MapSimple from "@/components/OH31MapSimple";
import OH31MapSimple2022 from "@/components/OH31MapSimple2022";
import OH31MapSimple2020 from "@/components/OH31MapSimple2020";
import OH31MapSimple2018 from "@/components/OH31MapSimple2018";
import OH31MapSimple2016 from "@/components/OH31MapSimple2016";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016 } from "@/data/oh31PrecinctData2016";
import { type TownshipFilter } from "@/lib/oh31Analysis";
import { useDarkMode } from "@/lib/useDarkMode";

function MapLoadingPlaceholder() {
  return (
    <div
      style={{
        height: 520,
        background: "var(--app-panel)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  );
}

const LeafletMap = dynamic(() => import("@/components/OH31MapLeaflet"), { ssr: false, loading: MapLoadingPlaceholder });
const LeafletMap2022 = dynamic(() => import("@/components/OH31MapLeaflet2022"), { ssr: false, loading: MapLoadingPlaceholder });
const LeafletMap2020 = dynamic(() => import("@/components/OH31MapLeaflet2020"), { ssr: false, loading: MapLoadingPlaceholder });
const LeafletMap2018 = dynamic(() => import("@/components/OH31MapLeaflet2018"), { ssr: false, loading: MapLoadingPlaceholder });
const LeafletMap2016 = dynamic(() => import("@/components/OH31MapLeaflet2016"), { ssr: false, loading: MapLoadingPlaceholder });

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type MapStyle = "satellite" | "simple";
type MapYear = "2024" | "2022" | "2020" | "2018" | "2016";

const YEARS: MapYear[] = ["2024", "2022", "2020", "2018", "2016"];

// Races available per year (2020 has no Senate race)
const YEAR_RACES: Record<MapYear, { key: RaceKey; label: string }[]> = {
  "2024": [
    { key: "stRep",   label: "State Rep" },
    { key: "pres",    label: "President" },
    { key: "senate",  label: "Senate"    },
    { key: "uSHouse", label: "House"     },
  ],
  "2022": [
    { key: "stRep",   label: "State Rep" },
    { key: "pres",    label: "Governor"  },
    { key: "senate",  label: "Senate"    },
    { key: "uSHouse", label: "House"     },
  ],
  "2020": [
    { key: "stRep",   label: "State Rep" },
    { key: "pres",    label: "President" },
    { key: "uSHouse", label: "House"     },
  ],
  "2018": [
    { key: "stRep",   label: "State Rep" },
    { key: "pres",    label: "Governor"  },
    { key: "senate",  label: "Senate"    },
    { key: "uSHouse", label: "House"     },
  ],
  "2016": [
    { key: "stRep",   label: "State Rep" },
    { key: "pres",    label: "President" },
    { key: "senate",  label: "Senate"    },
    { key: "uSHouse", label: "House"     },
  ],
};

const LEGEND = [
  { color: "#1b408c", label: "D 15+" },
  { color: "#587ccc", label: "D 5-15" },
  { color: "#8bafff", label: "D 1-5" },
  { color: "#959bb3", label: "D 0-1" },
  { color: "#cf8980", label: "R 0-1" },
  { color: "#ff8b98", label: "R 1-5" },
  { color: "#ff5864", label: "R 5-15" },
  { color: "#be1c29", label: "R 15+" },
];

function getDataForYear(year: MapYear) {
  switch (year) {
    case "2024": return oh31PrecinctData;
    case "2022": return oh31PrecinctData2022;
    case "2020": return oh31PrecinctData2020;
    case "2018": return oh31PrecinctData2018;
    case "2016": return oh31PrecinctData2016;
  }
}

function sumRace(key: RaceKey, year: MapYear) {
  const data = getDataForYear(year);
  return data.reduce(
    (acc, precinct) => ({
      d: acc.d + precinct[key].dVotes,
      r: acc.r + precinct[key].rVotes,
    }),
    { d: 0, r: 0 }
  );
}

function YearPills({ activeYear, exclude, onSelect }: { activeYear: MapYear; exclude?: MapYear; onSelect: (year: MapYear) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-2.5 scrollbar-none">
      {YEARS.filter((y) => y !== exclude).map((yr) => (
        <button
          key={yr}
          onClick={() => onSelect(yr)}
          aria-pressed={activeYear === yr}
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
          style={
            activeYear === yr
              ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
              : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
          }
        >
          {yr}
        </button>
      ))}
    </div>
  );
}

const TBD_YEARS: MapYear[] = [];

export default function OH31Map({
  townshipFilter,
  activeYear,
  onYearChange,
}: {
  townshipFilter: TownshipFilter;
  activeYear: MapYear;
  onYearChange: (year: MapYear) => void;
}) {
  const darkMode = useDarkMode();
  const [isTouchMobile, setIsTouchMobile] = useState(false);
  const [simpleMobilePopupVisible, setSimpleMobilePopupVisible] = useState(false);
  const [activeRace, setActiveRace] = useState<RaceKey>("stRep");
  const [mapStyle, setMapStyle] = useState<MapStyle>("simple");
  const [swingYear, setSwingYear] = useState<MapYear | null>(null);
  const [swingRace, setSwingRace] = useState<RaceKey>("stRep");
  const [compareOpen, setCompareOpen] = useState(false);
  const resetFnRef = useRef<(() => void) | null>(null);
  const handleReady = useCallback((fn: () => void) => { resetFnRef.current = fn; }, []);

  const swingLookup = useMemo<Record<string, { dPct: number; rPct: number; margin: number }> | null>(() => {
    if (!swingYear) return null;
    const data = getDataForYear(swingYear);
    const result: Record<string, { dPct: number; rPct: number; margin: number }> = {};
    for (const precinct of data) {
      const race = precinct[swingRace];
      if (race.total > 0) result[precinct.precinct] = { dPct: race.dPct, rPct: race.rPct, margin: race.dPct - race.rPct };
    }
    return result;
  }, [swingYear, swingRace]);

  useEffect(() => {
    const syncViewport = () => {
      const mobileViewport = window.matchMedia("(max-width: 767px)").matches;
      const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      setIsTouchMobile(mobileViewport && coarsePointer);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  function handleYearClick(year: MapYear) {
    onYearChange(year);
    // Keep the current race if the new year supports it, otherwise fall back to stRep
    if (!YEAR_RACES[year].some(r => r.key === activeRace)) {
      setActiveRace("stRep");
    }
  }

  function clearCompare() {
    setSwingYear(null);
    setCompareOpen(false);
  }

  const isTbdYear = TBD_YEARS.includes(activeYear);
  const currentRaceLabel = YEAR_RACES[activeYear].find(r => r.key === activeRace)?.label ?? activeRace;
  const activeTotals = sumRace(activeRace, activeYear);
  const totalVotes = activeTotals.d + activeTotals.r;
  // positive = R, negative = D — matches the rest of the site's margin convention
  const margin = totalVotes > 0 ? ((activeTotals.r - activeTotals.d) / totalVotes) * 100 : 0;
  const marginLabel = !isTbdYear
    ? (margin <= 0 ? `D+${Math.abs(margin).toFixed(1)}%` : `R+${margin.toFixed(1)}%`)
    : "TBD";
  const marginColor = margin <= 0 ? "var(--party-dem)" : "var(--party-rep)";

  const baselineTotals = swingYear ? sumRace(swingRace, swingYear) : null;
  const baselineMarginPct = baselineTotals && (baselineTotals.d + baselineTotals.r) > 0
    ? ((baselineTotals.r - baselineTotals.d) / (baselineTotals.d + baselineTotals.r)) * 100
    : 0;
  const swingPct = swingYear ? margin - baselineMarginPct : 0;
  const swingMarginLabel = !isTbdYear
    ? (swingPct <= 0 ? `D+${Math.abs(swingPct).toFixed(1)}%` : `R+${swingPct.toFixed(1)}%`)
    : "TBD";
  const swingColor = swingPct <= 0 ? "var(--party-dem)" : "var(--party-rep)";
  const swingBaselineLabel = swingYear
    ? `${swingYear} ${YEAR_RACES[swingYear].find(r => r.key === swingRace)?.label ?? swingRace}`
    : "";

  const legendHidden = mapStyle === "simple" && isTouchMobile && simpleMobilePopupVisible;
  const legendContainerClass =
    mapStyle === "simple"
      ? "absolute bottom-3 left-3 right-3 md:bottom-4 md:right-3 md:left-auto z-[1] rounded-lg px-2 py-1.5 text-[10px] md:px-3 md:py-2 md:text-xs"
      : isTouchMobile
        ? "absolute bottom-3 left-3 right-3 z-[1] rounded-lg px-2 py-1.5 text-[10px] md:px-3 md:py-2 md:text-xs"
        : "absolute bottom-12 right-3 left-auto z-[1] rounded-lg px-2 py-1.5 text-[10px] md:px-3 md:py-2 md:text-xs";
  const legendContentClass =
    mapStyle === "simple"
      ? "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:block"
      : isTouchMobile
        ? "flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
        : "block";
  const legendItemClass =
    mapStyle === "simple"
      ? "flex items-center gap-1 md:gap-1.5 md:mb-0.5"
      : isTouchMobile
        ? "flex items-center gap-1"
        : "mb-0.5 flex items-center gap-1.5";

  return (
    <div>
      {/* Race tabs (primary) + Year pills (secondary) — mirrors StateMapToggle's tab row */}
      <div
        className="flex flex-wrap items-end justify-between gap-x-5 gap-y-1 min-w-0"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <div className="flex min-w-0 items-end gap-5 overflow-x-auto pb-2.5 scrollbar-none">
          {YEAR_RACES[activeYear].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveRace(key)}
              className="shrink-0 text-sm font-semibold whitespace-nowrap transition-colors"
              style={
                activeRace === key
                  ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                  : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <YearPills activeYear={activeYear} onSelect={handleYearClick} />
      </div>

      {/* Margin readout + secondary controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="tabular-nums font-bold text-lg"
            style={{ color: isTbdYear ? "var(--app-text-muted)" : (swingYear ? swingColor : marginColor) }}
          >
            {swingYear ? swingMarginLabel : marginLabel}
          </span>
          <span className="text-xs truncate" style={{ color: "var(--app-text-muted)" }}>
            {swingYear ? `swing vs ${swingBaselineLabel}` : `absolute margin · ${activeYear} ${currentRaceLabel}`}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {swingYear ? (
            <button onClick={clearCompare} className="text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
              Clear comparison ✕
            </button>
          ) : (
            <button onClick={() => setCompareOpen(v => !v)} className="text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
              {compareOpen ? "Cancel" : "+ Compare to earlier year"}
            </button>
          )}
          <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ border: "1px solid var(--app-border)" }}>
            {(["simple", "satellite"] as MapStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => setMapStyle(style)}
                aria-pressed={mapStyle === style}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
                style={
                  mapStyle === style
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                {style === "satellite" ? "Overlay" : "Simple"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(compareOpen || swingYear) && (
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3 pb-3"
          style={{ borderBottom: "1px dashed var(--app-border)" }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--app-text-very-muted)" }}>
              Baseline Year
            </div>
            <YearPills
              activeYear={swingYear ?? ("" as MapYear)}
              exclude={activeYear}
              onSelect={(yr) => {
                setSwingYear(yr);
                if (!YEAR_RACES[yr].some(r => r.key === swingRace)) setSwingRace("stRep");
              }}
            />
          </div>
          {swingYear && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--app-text-very-muted)" }}>
                Baseline Race
              </div>
              <div className="flex items-center gap-1">
                {YEAR_RACES[swingYear].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSwingRace(key)}
                    aria-pressed={swingRace === key}
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
                    style={
                      swingRace === key
                        ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                        : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden">
        {isTbdYear ? (
          <div
            style={{
              height: 400,
              background: "var(--app-panel)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div style={{ color: "var(--app-text-muted)", fontSize: 15, fontWeight: 600 }}>
              {activeYear} map data coming soon
            </div>
            <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>
              Precinct boundaries and results for {activeYear} will be added when available
            </div>
          </div>
        ) : (
          <>
            {activeYear === "2022"
              ? mapStyle === "satellite"
                ? <LeafletMap2022 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                : <OH31MapSimple2022 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} swingLookup={swingLookup} swingLabel={swingBaselineLabel} />
              : activeYear === "2020"
                ? mapStyle === "satellite"
                  ? <LeafletMap2020 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                  : <OH31MapSimple2020 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} swingLookup={swingLookup} swingLabel={swingBaselineLabel} />
                : activeYear === "2018"
                  ? mapStyle === "satellite"
                    ? <LeafletMap2018 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                    : <OH31MapSimple2018 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} swingLookup={swingLookup} swingLabel={swingBaselineLabel} />
                  : activeYear === "2016"
                    ? mapStyle === "satellite"
                      ? <LeafletMap2016 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                      : <OH31MapSimple2016 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} swingLookup={swingLookup} swingLabel={swingBaselineLabel} />
                    : mapStyle === "satellite"
                      ? <LeafletMap activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                      : <OH31MapSimple activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} swingLookup={swingLookup} swingLabel={swingBaselineLabel} />
            }

            <div
              className={legendContainerClass}
              style={{ background: "var(--oh31-legend-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", display: legendHidden ? "none" : undefined }}
            >
              <div className={legendContentClass}>
                {LEGEND.map(({ color, label }) => (
                  <div key={label} className={legendItemClass}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {!isTbdYear && mapStyle === "satellite" && (
        <div className="mt-3">
          <button
            onClick={() => resetFnRef.current?.()}
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--app-text-muted)" }}
          >
            Reset View
          </button>
        </div>
      )}
    </div>
  );
}
