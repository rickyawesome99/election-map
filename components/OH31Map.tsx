"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import OH31MapSimple from "@/components/OH31MapSimple";
import OH31MapSimple2022 from "@/components/OH31MapSimple2022";
import OH31MapSimple2020 from "@/components/OH31MapSimple2020";
import OH31MapSimple2018 from "@/components/OH31MapSimple2018";
import OH31MapSimple2016 from "@/components/OH31MapSimple2016";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
import { oh31PrecinctData2020 } from "@/data/oh31PrecinctData2020";
import { oh31PrecinctData2018 } from "@/data/oh31PrecinctData2018";
import { oh31PrecinctData2016 } from "@/data/oh31PrecinctData2016";
import { type TownshipFilter } from "@/lib/oh31Analysis";

const LeafletMap = dynamic(() => import("@/components/OH31MapLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, background: "var(--app-panel)", borderRadius: 12,
      border: "1px solid var(--app-border)", display: "flex", alignItems: "center",
      justifyContent: "center" }}>
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  ),
});

const LeafletMap2022 = dynamic(() => import("@/components/OH31MapLeaflet2022"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, background: "var(--app-panel)", borderRadius: 12,
      border: "1px solid var(--app-border)", display: "flex", alignItems: "center",
      justifyContent: "center" }}>
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  ),
});

const LeafletMap2020 = dynamic(() => import("@/components/OH31MapLeaflet2020"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, background: "var(--app-panel)", borderRadius: 12,
      border: "1px solid var(--app-border)", display: "flex", alignItems: "center",
      justifyContent: "center" }}>
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  ),
});

const LeafletMap2018 = dynamic(() => import("@/components/OH31MapLeaflet2018"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, background: "var(--app-panel)", borderRadius: 12,
      border: "1px solid var(--app-border)", display: "flex", alignItems: "center",
      justifyContent: "center" }}>
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  ),
});

const LeafletMap2016 = dynamic(() => import("@/components/OH31MapLeaflet2016"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, background: "var(--app-panel)", borderRadius: 12,
      border: "1px solid var(--app-border)", display: "flex", alignItems: "center",
      justifyContent: "center" }}>
      <span style={{ color: "var(--app-text-muted)", fontSize: 14 }}>Loading map…</span>
    </div>
  ),
});

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type MapStyle = "satellite" | "simple";
type MapYear = "2024" | "2022" | "2020" | "2018" | "2016";

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

function readDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark")
    || localStorage.getItem("darkMode") === "true";
}

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
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);
  const [isTouchMobile, setIsTouchMobile] = useState(false);
  const [simpleMobilePopupVisible, setSimpleMobilePopupVisible] = useState(false);
  const [activeRace, setActiveRace] = useState<RaceKey>("stRep");
  const [mapStyle, setMapStyle] = useState<MapStyle>("simple");
  const resetFnRef = useRef<(() => void) | null>(null);
  const handleReady = useCallback((fn: () => void) => { resetFnRef.current = fn; }, []);

  useEffect(() => {
    const syncDarkMode = () => {
      setDarkMode(readDarkMode());
    };

    syncDarkMode();

    const observer = new MutationObserver(syncDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isTbdYear = TBD_YEARS.includes(activeYear);
  const currentRaceLabel = YEAR_RACES[activeYear].find(r => r.key === activeRace)?.label ?? activeRace;
  const activeTotals = sumRace(activeRace, activeYear);
  const totalVotes = activeTotals.d + activeTotals.r;
  const margin = totalVotes > 0 ? ((activeTotals.d - activeTotals.r) / totalVotes) * 100 : 0;
  const marginLabel = !isTbdYear
    ? (margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`)
    : "TBD";
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
    <div style={{ color: t.textPrimary }}>
      {/* Year selector */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="text-xs md:text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>Year</div>
        <div
          className="flex items-center gap-1 flex-wrap rounded-lg px-1 py-1"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          {(["2024", "2022", "2020", "2018", "2016"] as MapYear[]).map((yr) => (
            <button
              key={yr}
              onClick={() => handleYearClick(yr)}
              aria-pressed={activeYear === yr}
              className="px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors"
              style={
                activeYear === yr
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Race selector — options depend on selected year */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-xs md:text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>Race</div>
        <div
          className="flex items-center gap-1 flex-wrap rounded-lg px-1 py-1"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          {YEAR_RACES[activeYear].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveRace(key)}
              aria-pressed={activeRace === key}
              className="px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors"
              style={
                activeRace === key
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Map style toggle — shown only for 2024/2022 */}
      {!isTbdYear && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
            Design
          </div>
          <div
            className="flex items-center gap-1 flex-wrap rounded-lg px-1 py-1"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
          >
            {(["simple", "satellite"] as MapStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => setMapStyle(style)}
                aria-pressed={mapStyle === style}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={
                  mapStyle === style
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                    : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                }
              >
                {style === "satellite" ? "Overlay Map" : "Simple Map"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="relative">
        {isTbdYear ? (
          <div
            style={{
              height: 400,
              background: "var(--app-panel)",
              borderRadius: 12,
              border: "1px solid var(--app-border)",
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
                : <OH31MapSimple2022 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} />
              : activeYear === "2020"
                ? mapStyle === "satellite"
                  ? <LeafletMap2020 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                  : <OH31MapSimple2020 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} />
                : activeYear === "2018"
                  ? mapStyle === "satellite"
                    ? <LeafletMap2018 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                    : <OH31MapSimple2018 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} />
                  : activeYear === "2016"
                    ? mapStyle === "satellite"
                      ? <LeafletMap2016 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                      : <OH31MapSimple2016 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} />
                    : mapStyle === "satellite"
                  ? <LeafletMap activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} />
                  : <OH31MapSimple activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={currentRaceLabel} onMobilePopupChange={setSimpleMobilePopupVisible} />
            }

            {/* Legend */}
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

      <div
        className="mt-4 mb-4 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
      >
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
            Showing
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
            {activeYear} {currentRaceLabel}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
            District Margin
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: isTbdYear ? "var(--app-text-muted)" : (margin >= 0 ? t.demText : t.repText) }}
          >
            {marginLabel}
          </div>
        </div>
        {!isTbdYear && mapStyle === "satellite" && (
          <button
            onClick={() => resetFnRef.current?.()}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={{ color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
          >
            Reset View
          </button>
        )}
      </div>
    </div>
  );
}
