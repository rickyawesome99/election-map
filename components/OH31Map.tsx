"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import OH31MapSimple from "@/components/OH31MapSimple";
import OH31MapSimple2022 from "@/components/OH31MapSimple2022";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import { oh31PrecinctData2022 } from "@/data/oh31PrecinctData2022";
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

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type MapStyle = "satellite" | "simple";
type MapYear = "2024" | "2022";

const RACE_LABELS: Record<RaceKey, string> = {
  stRep:   "State Rep",
  pres:    "President",
  senate:  "Senate",
  uSHouse: "House",
};

// In 2022, "pres" slot holds the Governor race
const RACE_LABELS_2022: Record<RaceKey, string> = {
  stRep:   "State Rep",
  pres:    "Governor",
  senate:  "Senate",
  uSHouse: "House",
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

function sumRace(key: RaceKey, year: MapYear) {
  const data = year === "2022" ? oh31PrecinctData2022 : oh31PrecinctData;
  return data.reduce(
    (acc, precinct) => ({
      d: acc.d + precinct[key].dVotes,
      r: acc.r + precinct[key].rVotes,
    }),
    { d: 0, r: 0 }
  );
}

export default function OH31Map({ townshipFilter }: { townshipFilter: TownshipFilter }) {
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);
  const [isTouchMobile, setIsTouchMobile] = useState(false);
  const [simpleMobilePopupVisible, setSimpleMobilePopupVisible] = useState(false);
  const [activeYear, setActiveYear] = useState<MapYear>("2024");
  const [activeRace, setActiveRace] = useState<RaceKey>("stRep");
  const [mapStyle, setMapStyle] = useState<MapStyle>("simple");
  const resetFnRef = useRef<(() => void) | null>(null);
  const handleReady = useCallback((fn: () => void) => { resetFnRef.current = fn; }, []);

  useEffect(() => {
    const syncDarkMode = () => {
      setDarkMode(document.documentElement.classList.contains("dark"));
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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const raceLabels = activeYear === "2022" ? RACE_LABELS_2022 : RACE_LABELS;
  const activeTotals = sumRace(activeRace, activeYear);
  const totalVotes = activeTotals.d + activeTotals.r;
  const margin = totalVotes > 0 ? ((activeTotals.d - activeTotals.r) / totalVotes) * 100 : 0;
  const marginLabel = margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`;
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
      {/* Race selector tabs — 2024 row */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="text-xs md:text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
          2024
        </div>
        <div
          className="flex items-center gap-1 flex-wrap rounded-lg px-1 py-1"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          {(Object.keys(RACE_LABELS) as RaceKey[]).map((key) => (
            <button
              key={key}
              onClick={() => { setActiveYear("2024"); setActiveRace(key); }}
              aria-pressed={activeYear === "2024" && activeRace === key}
              className="px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors"
              style={
                activeYear === "2024" && activeRace === key
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {RACE_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Race selector tabs — 2022 row */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-xs md:text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
          2022
        </div>
        <div
          className="flex items-center gap-1 flex-wrap rounded-lg px-1 py-1"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          {(Object.keys(RACE_LABELS_2022) as RaceKey[]).map((key) => (
            <button
              key={key}
              onClick={() => { setActiveYear("2022"); setActiveRace(key); }}
              aria-pressed={activeYear === "2022" && activeRace === key}
              className="px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors"
              style={
                activeYear === "2022" && activeRace === key
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {RACE_LABELS_2022[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Map style toggle */}
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

      {/* Map */}
      <div className="relative">
        {activeYear === "2022"
          ? mapStyle === "satellite"
            ? <LeafletMap2022 activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={raceLabels[activeRace]} />
            : <OH31MapSimple2022 activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={raceLabels[activeRace]} onMobilePopupChange={setSimpleMobilePopupVisible} />
          : mapStyle === "satellite"
            ? <LeafletMap activeRace={activeRace} darkMode={darkMode} onReady={handleReady} townshipFilter={townshipFilter} raceLabel={raceLabels[activeRace]} />
            : <OH31MapSimple activeRace={activeRace} darkMode={darkMode} townshipFilter={townshipFilter} raceLabel={raceLabels[activeRace]} onMobilePopupChange={setSimpleMobilePopupVisible} />
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
            {activeYear} {raceLabels[activeRace]}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
            District Margin
          </div>
          <div className="text-sm font-semibold tabular-nums" style={{ color: margin >= 0 ? t.demText : t.repText }}>
            {marginLabel}
          </div>
        </div>
        {mapStyle === "satellite" && (
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
