"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import OH31MapSimple from "@/components/OH31MapSimple";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";

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

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type MapStyle = "satellite" | "simple";

const RACE_LABELS: Record<RaceKey, string> = {
  stRep:   "OH State Rep (HD-31)",
  pres:    "President",
  senate:  "U.S. Senate",
  uSHouse: "U.S. House",
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
  return localStorage.getItem("darkMode") === "true";
}

function sumRace(key: RaceKey) {
  return oh31PrecinctData.reduce(
    (acc, precinct) => ({
      d: acc.d + precinct[key].dVotes,
      r: acc.r + precinct[key].rVotes,
    }),
    { d: 0, r: 0 }
  );
}

export default function OH31Map() {
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);
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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const activeTotals = sumRace(activeRace);
  const totalVotes = activeTotals.d + activeTotals.r;
  const margin = totalVotes > 0 ? ((activeTotals.d - activeTotals.r) / totalVotes) * 100 : 0;
  const marginLabel = margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`;

  return (
    <div style={{ color: t.textPrimary }}>
      {/* Map style toggle */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {(["simple", "satellite"] as MapStyle[]).map((style) => (
          <button
            key={style}
            onClick={() => setMapStyle(style)}
            aria-pressed={mapStyle === style}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={
              mapStyle === style
                ? { background: t.tabBg, color: t.textPrimary, border: `1px solid ${t.border}` }
                : { color: t.textMuted, border: "1px solid transparent" }
            }
          >
            {style === "satellite" ? "Overlay Map" : "Simple Map"}
          </button>
        ))}
      </div>

      {/* Race selector tabs + reset button */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {(Object.keys(RACE_LABELS) as RaceKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveRace(key)}
            aria-pressed={activeRace === key}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={
              activeRace === key
                ? { background: t.tabBg, color: t.textPrimary, border: `1px solid ${t.border}` }
                : { color: t.textMuted, border: "1px solid transparent" }
            }
          >
            {RACE_LABELS[key]}
          </button>
        ))}
        {mapStyle === "satellite" && (
          <button
            onClick={() => resetFnRef.current?.()}
            className="ml-auto px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={{ color: t.textMuted, border: `1px solid ${t.border}` }}
          >
            Reset View
          </button>
        )}
      </div>

      <div
        className="mb-4 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ background: t.panel, border: `1px solid ${t.border}` }}
      >
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: t.textMuted }}>
            Showing
          </div>
          <div className="text-sm font-semibold" style={{ color: t.textPrimary }}>
            {RACE_LABELS[activeRace]}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-medium mb-1" style={{ color: t.textMuted }}>
            District Margin
          </div>
          <div className="text-sm font-semibold tabular-nums" style={{ color: margin >= 0 ? t.demText : t.repText }}>
            {marginLabel}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative">
        {mapStyle === "satellite"
          ? <LeafletMap activeRace={activeRace} darkMode={darkMode} onReady={handleReady} />
          : <OH31MapSimple activeRace={activeRace} darkMode={darkMode} />
        }

        {/* Legend */}
        <div
          className="absolute bottom-3 left-3 md:bottom-4 md:right-3 md:left-auto z-[1] rounded-lg px-3 py-2 text-xs"
          style={{ background: t.legendBg, border: `1px solid ${t.border}`, color: t.textMuted }}
        >
          {LEGEND.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 mb-0.5">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
