"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L, { type Layer, type PathOptions, type StyleFunction } from "leaflet";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { getRaceColor } from "@/lib/colorScale";
import { oh31ByPrecinct, OH31Precinct } from "@/data/oh31PrecinctData";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctFeature = Feature<Geometry, GeoJsonProperties>;
type GeoData = { type: "FeatureCollection"; features: PrecinctFeature[] };

// Inner component: registers the reset function with the parent via onReady
function FitBoundsControl({ geoData, onReady }: { geoData: GeoData; onReady: (fn: () => void) => void }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(geoData).getBounds();
    onReady(() => map.fitBounds(bounds, { padding: [80, 80] }));
  }, [geoData, map, onReady]);
  return null;
}

interface Props {
  activeRace: RaceKey;
  darkMode: boolean;
  onReady: (resetFn: () => void) => void;
}

function precinctNameFromGeoid(geoid: string): string {
  const idx = geoid.indexOf("-");
  return idx >= 0 ? geoid.slice(idx + 1) : geoid;
}

function formatMargin(dPct: number, rPct: number): string {
  const margin = dPct - rPct;
  return margin >= 0
    ? `D+${margin.toFixed(1)}%`
    : `R+${Math.abs(margin).toFixed(1)}%`;
}

function buildTooltipHtml(precinct: OH31Precinct, activeRace: RaceKey, t: typeof DARK_THEME): string {
  const bg      = t.panel;
  const border  = t.border;
  const text    = t.textPrimary;
  const muted   = t.textMuted;
  const dem     = t.demText;
  const rep     = t.repText;
  const raceRows: { key: RaceKey; label: string; dPct: number; rPct: number }[] = [
    { key: "stRep", label: "State Rep", dPct: precinct.stRep.dPct, rPct: precinct.stRep.rPct },
    { key: "pres", label: "President", dPct: precinct.pres.dPct, rPct: precinct.pres.rPct },
    { key: "senate", label: "U.S. Senate", dPct: precinct.senate.dPct, rPct: precinct.senate.rPct },
    { key: "uSHouse", label: "U.S. House", dPct: precinct.uSHouse.dPct, rPct: precinct.uSHouse.rPct },
  ];
  const orderedRows = [...raceRows].sort((a, b) => Number(b.key === activeRace) - Number(a.key === activeRace));

  const row = (label: string, dPct: number, rPct: number, isActive: boolean) => {
    const margin = dPct - rPct;
    const color = margin >= 0 ? dem : rep;
    return `
      <div style="margin-bottom:5px">
        <div style="font-size:10px;color:${muted};margin-bottom:1px;display:flex;justify-content:space-between;gap:8px">
          <span>${label}</span>
          ${isActive ? `<span style="font-weight:700;color:${text}">Active</span>` : ""}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span style="color:${dem}">${dPct.toFixed(1)}%</span>
          <span style="color:${color};font-weight:600">${formatMargin(dPct, rPct)}</span>
          <span style="color:${rep}">${rPct.toFixed(1)}%</span>
        </div>
      </div>`;
  };

  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 12px;min-width:210px;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
      <div style="font-weight:600;font-size:13px;color:${text};margin-bottom:3px">${precinct.precinct}</div>
      <div style="font-size:10px;color:${muted};margin-bottom:8px">
        ${precinct.ballotsCast.toLocaleString()} ballots · ${precinct.regVoters.toLocaleString()} registered
      </div>
      ${orderedRows.map((race) => row(race.label, race.dPct, race.rPct, race.key === activeRace)).join("")}
    </div>`;
}

export default function OH31MapLeaflet({ activeRace, darkMode, onReady }: Props) {
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const t = darkMode ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    fetch("/oh31_precincts.geojson")
      .then((r) => r.json())
      .then((data: GeoData) => setGeoData(data));
  }, []);

  const tileUrl = darkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const styleFeature: StyleFunction = (feature) => {
    const name = precinctNameFromGeoid(feature?.properties?.GEOID ?? "");
    const precinct = oh31ByPrecinct[name];
    const race = precinct?.[activeRace];
    return {
      fillColor: race ? getRaceColor(race.dPct - race.rPct) : "#999",
      fillOpacity: 0.65,
      color: darkMode ? "#0d1117" : "#f6f8fa",
      weight: 0.8,
    } as PathOptions;
  };

  const onEachFeature = (feature: PrecinctFeature, layer: Layer) => {
    const name = precinctNameFromGeoid(feature?.properties?.GEOID ?? "");
    const precinct = oh31ByPrecinct[name];
    if (!precinct) return;

    const pathLayer = layer as L.Path;

    layer.bindTooltip(buildTooltipHtml(precinct, activeRace, t), {
      sticky: true,
      opacity: 1,
      className: "oh31-tooltip",
    });

    layer.on({
      mouseover: () => {
        pathLayer.setStyle({ fillOpacity: 0.85, weight: 2, color: t.hoverStroke });
        pathLayer.bringToFront();
      },
      mouseout: () => {
        pathLayer.setStyle({
          fillOpacity: 0.65,
          weight: 0.8,
          color: darkMode ? "#0d1117" : "#f6f8fa",
        });
      },
    });
  };

  if (!geoData) {
    return (
      <div
        style={{ height: 520, display: "flex", alignItems: "center", justifyContent: "center",
          background: t.mapUnfilled, borderRadius: 12, border: `1px solid ${t.border}` }}
      >
        <span style={{ color: t.textMuted, fontSize: 14 }}>Loading map…</span>
      </div>
    );
  }

  return (
    <>
      {/* Remove default Leaflet tooltip styles and apply ours */}
      <style>{`
        .oh31-tooltip { background: transparent !important; border: none !important;
          box-shadow: none !important; padding: 0 !important; }
        .oh31-tooltip::before { display: none !important; }
        .leaflet-container { font-family: inherit; }
      `}</style>

      <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, height: 520 }}>
        <MapContainer
          center={[41.1295, -81.5692]}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <FitBoundsControl geoData={geoData} onReady={onReady} />
          <TileLayer
            url={tileUrl}
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {/* key forces remount when race or theme changes so styles update */}
          <GeoJSON
            key={`${activeRace}-${darkMode}`}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        </MapContainer>
      </div>
    </>
  );
}
