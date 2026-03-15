"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import { senateData, governorData, houseData, RaceForecast, RaceType } from "@/data/forecastData";
import Sidebar from "./Sidebar";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const DISTRICTS_URL = "/congressional-districts.json";

const LEGEND = [
  { color: "#1a4480", label: "Safe D" },
  { color: "#4275b5", label: "Likely D" },
  { color: "#82b4f0", label: "Lean D" },
  { color: "#c8a800", label: "Toss-up" },
  { color: "#f08282", label: "Lean R" },
  { color: "#c04040", label: "Likely R" },
  { color: "#8b1a1a", label: "Safe R" },
];

export default function ForecastMap() {
  const [raceType, setRaceType] = useState<RaceType>("senate");
  const [selected, setSelected] = useState<RaceForecast | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const isHouse = raceType === "house";
  const geoUrl = isHouse ? DISTRICTS_URL : STATES_URL;
  const data = raceType === "house" ? houseData : raceType === "senate" ? senateData : governorData;

  function findMatch(geo: any): RaceForecast | undefined {
    if (isHouse) {
      const geoId = geo.properties?.GEOID as string | undefined;
      return geoId ? data.find((d) => d.id === geoId) : undefined;
    }
    return data.find((d) => d.state === geo.properties?.name);
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 h-14 bg-[#161b22] border-b border-[#30363d] shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-white font-bold text-lg tracking-tight">
            2026 Election Forecast
          </span>
          <span className="hidden sm:block text-[#8b949e] text-xs">
            Updated Mar 14, 2026
          </span>
        </div>

        {/* Race-type tabs */}
        <nav className="flex bg-[#21262d] rounded-lg p-1 gap-0.5">
          {(["house", "senate", "governor"] as RaceType[]).map((type) => (
            <button
              key={type}
              onClick={() => { setRaceType(type); setSelected(null); }}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                raceType === type
                  ? "bg-[#388bfd] text-white shadow"
                  : "text-[#8b949e] hover:text-white hover:bg-[#30363d]"
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Map ── */}
        <div className="relative flex-1 overflow-hidden">
          {/* Hovered name badge */}
          {hovered && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none
                            bg-[#161b22]/90 text-white text-xs font-medium px-3 py-1.5 rounded-full
                            border border-[#30363d] backdrop-blur-sm">
              {hovered}
            </div>
          )}

          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies }: any) =>
                geographies.map((geo: any) => {
                  const match = findMatch(geo);
                  const fill = match ? getRaceColor(match.probability) : "#1e2530";
                  const isSelected = selected && match && selected.id === match.id;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => {
                        if (match) {
                          setHovered(match.name);
                        } else if (isHouse) {
                          const namelsad = geo.properties?.NAMELSAD as string | undefined;
                          const statefp = geo.properties?.STATEFP as string | undefined;
                          if (namelsad && statefp) setHovered(namelsad);
                        }
                      }}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        if (match) setSelected(match);
                      }}
                      style={{
                        default: {
                          fill,
                          stroke: isSelected ? "#ffffff" : (isHouse ? "#0d1117" : "#0d1117"),
                          strokeWidth: isSelected ? 1.5 : (isHouse ? 0.25 : 0.6),
                          outline: "none",
                        },
                        hover: {
                          fill: match ? fill : "#2a3441",
                          stroke: "#ffffff",
                          strokeWidth: isHouse ? 0.6 : 1.2,
                          outline: "none",
                          cursor: match ? "pointer" : "default",
                        },
                        pressed: {
                          fill,
                          stroke: "#ffffff",
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

          {/* ── Legend ── */}
          <div className="absolute bottom-5 left-5 bg-[#161b22]/90 rounded-xl p-3 border border-[#30363d] backdrop-blur-sm">
            <div className="text-[10px] text-[#8b949e] mb-2 font-semibold uppercase tracking-wider">
              Win Probability
            </div>
            <div className="flex items-center gap-1.5">
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <div style={{ background: color }} className="w-7 h-3.5 rounded-sm" />
                  <span className="text-[9px] text-[#8b949e] whitespace-nowrap">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <Sidebar selected={selected} raceType={raceType} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}
