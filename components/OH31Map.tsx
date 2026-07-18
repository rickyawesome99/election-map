"use client";

import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from "react";
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
import { useDarkMode } from "@/lib/useDarkMode";

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

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="min-h-7 whitespace-nowrap rounded-md px-1.5 text-xs font-semibold transition-colors"
      style={
        active
          ? {
              background: "var(--app-tab-bg)",
              color: "var(--app-text-primary)",
              border: "1px solid var(--app-border)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }
          : {
              color: "var(--app-text-muted)",
              border: "1px solid transparent",
            }
      }
    >
      {children}
    </button>
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-text-very-muted)" }}
      >
        {label}
      </div>
      <div
        className="flex w-full flex-wrap items-center gap-0.5 rounded-lg p-0.5 lg:flex-nowrap"
        style={{ border: "1px solid var(--app-border)", background: "var(--app-bg)" }}
      >
        {children}
      </div>
    </div>
  );
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
  const darkMode = useDarkMode();
  const [isTouchMobile, setIsTouchMobile] = useState(false);
  const [simpleMobilePopupVisible, setSimpleMobilePopupVisible] = useState(false);
  const [activeRace, setActiveRace] = useState<RaceKey>("stRep");
  const [mapStyle, setMapStyle] = useState<MapStyle>("simple");
  const [swingYear, setSwingYear] = useState<MapYear | null>(null);
  const [swingRace, setSwingRace] = useState<RaceKey>("stRep");
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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isTbdYear = TBD_YEARS.includes(activeYear);
  const currentRaceLabel = YEAR_RACES[activeYear].find(r => r.key === activeRace)?.label ?? activeRace;
  const activeTotals = sumRace(activeRace, activeYear);
  const totalVotes = activeTotals.d + activeTotals.r;
  const margin = totalVotes > 0 ? ((activeTotals.d - activeTotals.r) / totalVotes) * 100 : 0;
  const marginLabel = !isTbdYear
    ? (margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`)
    : "TBD";

  const baselineTotals = swingYear ? sumRace(swingRace, swingYear) : null;
  const baselineMarginPct = baselineTotals && (baselineTotals.d + baselineTotals.r) > 0
    ? ((baselineTotals.d - baselineTotals.r) / (baselineTotals.d + baselineTotals.r)) * 100
    : 0;
  const swingPct = swingYear ? margin - baselineMarginPct : 0;
  const swingMarginLabel = !isTbdYear
    ? (swingPct >= 0 ? `D+${swingPct.toFixed(1)}%` : `R+${Math.abs(swingPct).toFixed(1)}%`)
    : "TBD";
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

  const statusCard = (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg text-right" style={{ border: "1px solid var(--app-border)" }}>
      <div className="px-2 py-1.5 text-left" style={{ borderRight: "1px solid var(--app-border)" }}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>
          Mode
        </div>
        <div
          className="mt-0.5 flex items-center gap-1 rounded-md p-0.5"
          style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
        >
          {(["simple", "satellite"] as MapStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              aria-pressed={mapStyle === style}
              className="min-h-6 flex-1 rounded px-2 text-xs font-semibold transition-colors"
              style={
                mapStyle === style
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {style === "satellite" ? "Overlay" : "Simple"}
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>
          {swingYear ? "Swing" : "Margin"}
        </div>
        <div
          className="mt-0.5 text-sm font-bold tabular-nums"
          style={{ color: isTbdYear ? "var(--app-text-muted)" : swingYear ? (swingPct >= 0 ? t.demText : t.repText) : (margin >= 0 ? t.demText : t.repText) }}
        >
          {swingYear ? swingMarginLabel : marginLabel}
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="grid gap-2">
      <ControlGroup label="Year">
        {(["2024", "2022", "2020", "2018", "2016"] as MapYear[]).map((yr) => (
          <SegmentedButton key={yr} active={activeYear === yr} onClick={() => handleYearClick(yr)}>
            {yr}
          </SegmentedButton>
        ))}
      </ControlGroup>

      <ControlGroup label="Race">
        {YEAR_RACES[activeYear].map(({ key, label }) => (
          <SegmentedButton key={key} active={activeRace === key} onClick={() => setActiveRace(key)}>
            {label}
          </SegmentedButton>
        ))}
      </ControlGroup>

      <ControlGroup label="Swing">
        <SegmentedButton active={swingYear === null} onClick={() => setSwingYear(null)}>
          Off
        </SegmentedButton>
        {(["2024", "2022", "2020", "2018", "2016"] as MapYear[]).map((yr) => (
          <SegmentedButton
            key={yr}
            active={swingYear === yr}
            onClick={() => {
              setSwingYear(yr);
              if (!YEAR_RACES[yr].some(r => r.key === swingRace)) setSwingRace("stRep");
            }}
          >
            {yr}
          </SegmentedButton>
        ))}
      </ControlGroup>

      {swingYear !== null && (
        <ControlGroup label="Swing Race">
          {YEAR_RACES[swingYear].map(({ key, label }) => (
            <SegmentedButton key={key} active={swingRace === key} onClick={() => setSwingRace(key)}>
              {label}
            </SegmentedButton>
          ))}
        </ControlGroup>
      )}
    </div>
  );

  const mapView = (
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
  );

  return (
    <div style={{ color: t.textPrimary }}>
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
      >
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className="order-2 border-t p-2 md:p-3 lg:order-1 lg:border-t-0 lg:pr-1.5"
            style={{ borderColor: "var(--app-border)" }}
          >
            {mapView}
          </div>

          <div
            className="order-1 flex flex-col gap-3 p-2 md:p-3 lg:order-2 lg:border-l lg:pl-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div>
              <div className="text-base font-bold leading-tight md:text-lg" style={{ color: "var(--app-text-primary)" }}>
                Precinct Map
              </div>
              <div className="mt-0.5 text-xs md:text-sm" style={{ color: "var(--app-text-muted)" }}>
                {activeYear} {currentRaceLabel}
                {swingYear ? ` · swing vs ${swingBaselineLabel}` : ""}
              </div>
            </div>

            {statusCard}
            {controls}

            <div className="mt-auto flex flex-col gap-2 text-xs md:text-sm" style={{ color: "var(--app-text-muted)" }}>
              <div>
                {swingYear ? (
                  <>
                    {swingBaselineLabel} → {activeYear} {currentRaceLabel}
                  </>
                ) : (
                  <>
                    Showing absolute precinct margins for {activeYear} {currentRaceLabel}
                  </>
                )}
              </div>
              {!isTbdYear && mapStyle === "satellite" && (
                <button
                  onClick={() => resetFnRef.current?.()}
                  className="self-start rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
                  style={{ color: "var(--app-text-muted)", border: "1px solid var(--app-border)", background: "var(--app-bg)" }}
                >
                  Reset View
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
