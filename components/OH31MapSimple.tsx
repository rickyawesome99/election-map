"use client";

import { useEffect, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { oh31ByPrecinct, OH31Precinct } from "@/data/oh31PrecinctData";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";

const GEO_URL = "/oh31_precincts.geojson";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctGeography = {
  rsmKey: string;
  properties?: GeoJsonProperties & { GEOID?: string };
  geometry?: Geometry;
};

interface Props {
  activeRace: RaceKey;
  darkMode: boolean;
}

function precinctNameFromGeoid(geoid: string): string {
  const idx = geoid.indexOf("-");
  return idx >= 0 ? geoid.slice(idx + 1) : geoid;
}

function RaceRow({
  label,
  dPct,
  rPct,
  t,
  active = false,
}: {
  label: string;
  dPct: number;
  rPct: number;
  t: typeof DARK_THEME;
  active?: boolean;
}) {
  const margin = dPct - rPct;
  const leader = margin >= 0 ? "D" : "R";
  const marginStr = `${leader}+${Math.abs(margin).toFixed(1)}%`;
  return (
    <div className="text-xs" style={{ marginBottom: 4 }}>
      <div className="font-semibold flex justify-between gap-2" style={{ color: t.textMuted, marginBottom: 1 }}>
        <span>{label}</span>
        {active && <span style={{ color: t.textPrimary }}>Active</span>}
      </div>
      <div className="flex justify-between">
        <span style={{ color: t.demText }}>{dPct.toFixed(1)}%</span>
        <span style={{ color: margin >= 0 ? t.demText : t.repText, fontWeight: 600 }}>{marginStr}</span>
        <span style={{ color: t.repText }}>{rPct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function OH31MapSimple({ activeRace, darkMode }: Props) {
  const [hovered, setHovered] = useState<OH31Precinct | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const raceRows: { key: RaceKey; label: string; dPct: number; rPct: number }[] = hovered
    ? [
        { key: "stRep", label: "State Rep", dPct: hovered.stRep.dPct, rPct: hovered.stRep.rPct },
        { key: "pres", label: "President", dPct: hovered.pres.dPct, rPct: hovered.pres.rPct },
        { key: "senate", label: "U.S. Senate", dPct: hovered.senate.dPct, rPct: hovered.senate.rPct },
        { key: "uSHouse", label: "U.S. House", dPct: hovered.uSHouse.dPct, rPct: hovered.uSHouse.rPct },
      ].sort((a, b) => Number(b.key === activeRace) - Number(a.key === activeRace))
    : [];

  const tipW = 240;
  const tipH = 214;
  const offset = 16;
  const edgePad = 8;
  const mapHeight = isMobile ? 520 : "min(72vh, 520px)";
  const mapScale = isMobile ? 110000 : 65000;
  const stateRepMargin = hovered
    ? hovered.stRep.dPct >= hovered.stRep.rPct
      ? `D+${(hovered.stRep.dPct - hovered.stRep.rPct).toFixed(1)}%`
      : `R+${(hovered.stRep.rPct - hovered.stRep.dPct).toFixed(1)}%`
    : null;
  const stateRepMarginColor = hovered
    ? hovered.stRep.dPct >= hovered.stRep.rPct
      ? t.demText
      : t.repText
    : t.textMuted;
  let tipLeft = mousePos.x + offset;
  let tipTop  = mousePos.y + offset;
  if (tipLeft + tipW + edgePad > mapSize.w) tipLeft = mousePos.x - tipW - offset;
  if (tipTop  + tipH + edgePad > mapSize.h) tipTop  = mousePos.y - tipH - offset;
  if (tipLeft < edgePad) tipLeft = edgePad;
  if (tipTop  < edgePad) tipTop  = edgePad;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{ border: `1px solid ${t.border}`, background: t.mapUnfilled, height: mapHeight }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setHovered(null)}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-81.5692, 41.1295], scale: mapScale }}
        width={800}
        height={520}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: PrecinctGeography[] }) =>
            geographies.map((geo) => {
              const name = precinctNameFromGeoid(geo.properties?.GEOID ?? "");
              const precinct = oh31ByPrecinct[name];
              const race = precinct?.[activeRace];
              const isHovered = hovered?.precinct === name;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={race ? getRaceColor(race.dPct - race.rPct) : t.mapUnfilled}
                  stroke={t.mapStroke}
                  strokeWidth={isHovered ? 1.5 : 0.4}
                  style={{
                    default: { outline: "none" },
                    hover:   { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={() => precinct && setHovered(precinct)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Hover tooltip */}
      {hovered && !isMobile && (
        <div
          className="absolute z-20 pointer-events-none rounded-lg"
          style={{
            left: tipLeft, top: tipTop, width: tipW,
            padding: "10px 12px",
            background: t.panel,
            border: `1px solid ${t.border}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div className="font-semibold text-sm mb-2" style={{ color: t.textPrimary }}>
            {hovered.precinct}
          </div>
          <div className="text-xs mb-2" style={{ color: t.textMuted }}>
            {hovered.ballotsCast.toLocaleString()} ballots · {hovered.regVoters.toLocaleString()} registered
          </div>
          {raceRows.map((race) => (
            <RaceRow
              key={race.key}
              label={race.label}
              dPct={race.dPct}
              rPct={race.rPct}
              t={t}
              active={race.key === activeRace}
            />
          ))}
        </div>
      )}

      {hovered && isMobile && (
        <div
          className="absolute left-3 right-3 bottom-3 z-20 pointer-events-none rounded-lg"
          style={{
            padding: "10px 12px",
            background: t.panel,
            border: `1px solid ${t.border}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          }}
        >
          <div className="text-xs font-semibold mb-1 truncate" style={{ color: t.textPrimary }}>
            {hovered.precinct}
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span style={{ color: t.textMuted }}>
              {hovered.ballotsCast.toLocaleString()} ballots
            </span>
            <span className="font-semibold" style={{ color: stateRepMarginColor }}>
              State Rep {stateRepMargin}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
