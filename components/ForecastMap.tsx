"use client";

import { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";
import { senateData, governorData, houseData, RaceForecast, RaceType } from "@/data/forecastData";
import Sidebar from "./Sidebar";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const DISTRICTS_URL = "/congressional-districts.json";

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
  mapStroke: "#0d1117",
  hoverStroke: "#ffffff",
  legendBg: "rgba(22,27,34,0.90)",
  badgeBg: "rgba(22,27,34,0.90)",
  candidateDemBg: "#1b3a5c",
  candidateRepBg: "#5c1b1b",
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
  mapStroke: "#f6f8fa",
  hoverStroke: "#555555",
  legendBg: "rgba(255,255,255,0.92)",
  badgeBg: "rgba(255,255,255,0.92)",
  candidateDemBg: "#dbeafe",
  candidateRepBg: "#fee2e2",
};

export type Theme = typeof DARK_THEME;

export default function ForecastMap() {
  const [raceType, setRaceType] = useState<RaceType>("senate");
  const [selected, setSelected] = useState<RaceForecast | null>(null);
  const [hovered, setHovered] = useState<RaceForecast | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [darkMode, setDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem("darkMode") === "true";
    setDarkMode(stored);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("darkMode", String(next));
  }

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const isHouse = raceType === "house";
  const geoUrl = isHouse ? DISTRICTS_URL : STATES_URL;
  const data = raceType === "house" ? houseData : raceType === "senate" ? senateData : governorData;

  // Seats not up for election in 2026 (holdovers with known party)
  // Senate: 65 holdovers (100 total - 35 Class 2 races); current split 34D/31R
  // Governor: 14 states not voting in 2026; current split 6D/8R
  // House: all 435 seats up every cycle, no holdovers
  const HOLDOVERS = {
    senate:   { dem: 34, rep: 31 },
    governor: { dem: 6,  rep: 8  },
    house:    { dem: 0,  rep: 0  },
  };
  const TOTAL_SEATS = { senate: 100, governor: 50, house: 435 };

  const ratedDem = data.filter((d) => d.margin >= 0).length;
  const ratedRep = data.filter((d) => d.margin < 0).length;
  const demSeats = HOLDOVERS[raceType].dem + ratedDem;
  const repSeats = HOLDOVERS[raceType].rep + ratedRep;
  const totalSeats = TOTAL_SEATS[raceType];
  const demPct = (demSeats / totalSeats) * 100;

  function findMatch(geo: any): RaceForecast | undefined {
    if (isHouse) {
      const geoId = geo.properties?.GEOID as string | undefined;
      return geoId ? data.find((d) => d.id === geoId) : undefined;
    }
    return data.find((d) => d.state === geo.properties?.name);
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: t.bg }}>

      {/* ── Top bar ── */}
      <header
        className="flex items-center justify-between px-6 h-14 shrink-0 z-10"
        style={{ background: t.panel, borderBottom: `1px solid ${t.border}` }}
      >
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg tracking-tight" style={{ color: t.textPrimary }}>
            CT Strategies
          </span>
          <span className="hidden sm:block text-xs" style={{ color: t.textMuted }}>
            Updated Mar 15, 2026
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Dark / Light mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: t.tabBg, color: t.textMuted }}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? (
              /* Sun icon */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Map ── */}
        <div
          className="relative shrink-0 overflow-hidden pb-16"
          style={{ height: "calc(100vh - 56px - 200px)" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
        >
          {/* Hover tooltip */}
          {hovered && (() => {
            const demPct = Math.max(0, Math.min(100, 50 + hovered.margin / 2));
            const repPct = Math.max(0, Math.min(100, 50 - hovered.margin / 2));
            const marginAbs = Math.abs(hovered.margin);
            const marginLabel = hovered.margin >= 0
              ? `D+${marginAbs.toFixed(1)}`
              : `R+${marginAbs.toFixed(1)}`;
            const { bg: badgeColor, text: badgeText } = getRatingColors(hovered.rating);

            const tipW = 185;
            const tipH = hovered.candidates ? 108 : 80;
            const offset = 16;
            let left = mousePos.x + offset;
            let top = mousePos.y + offset;
            if (left + tipW > (typeof window !== "undefined" ? window.innerWidth * 0.75 : 800)) {
              left = mousePos.x - tipW - offset;
            }
            if (top + tipH > (typeof window !== "undefined" ? window.innerHeight - 80 : 600)) {
              top = mousePos.y - tipH - offset;
            }

            return (
              <div
                className="absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
                style={{
                  left,
                  top,
                  width: tipW,
                  padding: "8px 10px",
                  background: t.panel,
                  border: `1px solid ${t.border}`,
                  color: t.textPrimary,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="font-bold text-sm">{hovered.name}</span>
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: badgeColor, color: badgeText, whiteSpace: "nowrap" }}
                  >
                    {hovered.rating}
                  </span>
                </div>
                {hovered.candidates && (
                  <div className="mb-1.5">
                    <div className="text-xs font-medium leading-tight" style={{ color: "#5b9bd5" }}>
                      {hovered.candidates.dem.name}
                    </div>
                    <div className="text-xs font-medium leading-tight" style={{ color: "#d9534f" }}>
                      {hovered.candidates.rep.name}
                    </div>
                  </div>
                )}
                <div className="text-xs leading-tight mb-0.5">
                  <span style={{ color: "#5b9bd5" }}>D {demPct.toFixed(1)}%</span>
                  <span style={{ color: t.textMuted }}> · </span>
                  <span style={{ color: "#d9534f" }}>R {repPct.toFixed(1)}%</span>
                </div>
                <div className="text-xs leading-tight" style={{ color: t.textMuted }}>
                  Margin: {marginLabel}
                </div>
              </div>
            );
          })()}

          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies }: any) =>
                geographies.map((geo: any) => {
                  const match = findMatch(geo);
                  const fill = match ? getRaceColor(match.margin) : t.mapUnfilled;
                  const isSelected = selected && match && selected.id === match.id;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => {
                        if (match) setHovered(match);
                      }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        if (match) setSelected(match);
                      }}
                      style={{
                        default: {
                          fill,
                          stroke: isSelected ? t.hoverStroke : t.mapStroke,
                          strokeWidth: isSelected ? 1.5 : (isHouse ? 0.25 : 0.6),
                          outline: "none",
                        },
                        hover: {
                          fill: match ? fill : t.hoverUnfilled,
                          stroke: t.hoverStroke,
                          strokeWidth: isHouse ? 0.6 : 1.2,
                          outline: "none",
                          cursor: match ? "pointer" : "default",
                        },
                        pressed: {
                          fill,
                          stroke: t.hoverStroke,
                          strokeWidth: 1.5,
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* ── Race-type toggle ── */}
          <div
            className="absolute rounded-xl p-2 backdrop-blur-sm"
            style={{
              bottom: "calc(73px + 144px + 8px)",
              left: "1rem",
              background: t.legendBg,
              border: `1px solid ${t.border}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <nav className="flex rounded-lg p-1 gap-0.5" style={{ background: t.tabBg }}>
              {([["house", "H"], ["senate", "S"], ["governor", "G"]] as [RaceType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => { setRaceType(type); setSelected(null); }}
                  className="w-8 py-1.5 rounded-md text-sm font-medium transition-all text-center"
                  style={
                    raceType === type
                      ? { background: "#388bfd", color: "#ffffff" }
                      : { color: t.textMuted }
                  }
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* ── Seat Scorecard ── */}
          <div
            className="absolute bottom-[73px] left-4 rounded-xl p-3 backdrop-blur-sm"
            style={{
              background: t.legendBg,
              border: `1px solid ${t.border}`,
              width: 180,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            }}
          >
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-2 text-center" style={{ color: t.textMuted }}>
              {raceType === "house" ? "House" : raceType === "senate" ? "Senate" : "Governors"} Seats
            </div>

            {/* Dem | Rep side by side */}
            <div className="flex gap-2 mb-2">
              {/* Dem */}
              <div className="flex-1 flex flex-col items-center rounded-lg py-2" style={{ background: "rgba(26,68,128,0.18)" }}>
                <span className="text-2xl font-bold leading-none" style={{ color: "#1a4480" }}>{demSeats}</span>
                <span className="text-[10px] font-semibold mt-1" style={{ color: "#1a4480" }}>Dem</span>
              </div>
              {/* Rep */}
              <div className="flex-1 flex flex-col items-center rounded-lg py-2" style={{ background: "rgba(139,26,26,0.18)" }}>
                <span className="text-2xl font-bold leading-none" style={{ color: "#8b1a1a" }}>{repSeats}</span>
                <span className="text-[10px] font-semibold mt-1" style={{ color: "#8b1a1a" }}>Rep</span>
              </div>
            </div>

            {/* Split bar */}
            <div className="flex h-2 rounded-full overflow-hidden">
              <div style={{ width: `${demPct}%`, background: "#1a4480" }} />
              <div style={{ width: `${100 - demPct}%`, background: "#8b1a1a" }} />
            </div>

            <div className="mt-2 text-center text-[9px]" style={{ color: t.textVeryMuted }}>
              of {totalSeats} total seats
            </div>
          </div>

          {/* ── Legend ── */}
          <div
            className="absolute bottom-3 left-5 rounded-lg p-2 backdrop-blur-sm"
            style={{ background: t.legendBg, border: `1px solid ${t.border}` }}
          >
            <div className="flex items-center gap-1">
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <div style={{ background: color }} className="w-5 h-2.5 rounded-sm" />
                  <span className="text-[8px] whitespace-nowrap" style={{ color: t.textMuted }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <Sidebar selected={selected} raceType={raceType} onClose={() => setSelected(null)} theme={t} />
      </div>
    </div>
  );
}
