"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L, { type Layer, type PathOptions, type StyleFunction } from "leaflet";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { getRaceColor } from "@/lib/colorScale";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31ByPrecinct2020 } from "@/data/oh31PrecinctData2020";
import { OH31Precinct } from "@/data/oh31PrecinctData";
import { matchesTownshipFilter, type TownshipFilter } from "@/lib/oh31Analysis";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctFeature = Feature<Geometry, GeoJsonProperties>;
type GeoData = { type: "FeatureCollection"; features: PrecinctFeature[] };

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
  townshipFilter: TownshipFilter;
  raceLabel: string;
}

function buildTooltipHtml(precinct: OH31Precinct, activeRace: RaceKey, raceLabel: string, t: typeof DARK_THEME): string {
  const bg = t.panel, border = t.border, text = t.textPrimary, muted = t.textMuted;
  const dem = t.demText, rep = t.repText;
  const race = precinct[activeRace];
  const margin = race.dPct - race.rPct;
  const marginStr = margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`;
  const marginColor = margin >= 0 ? dem : rep;
  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:12px;min-width:210px;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
      <div style="font-weight:700;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${text};margin-bottom:8px">${precinct.precinct}</div>
      <div style="font-size:11px;color:${muted};margin-bottom:12px">${raceLabel} · ${precinct.ballotsCast.toLocaleString()} ballots</div>
      <div style="display:inline-grid;grid-template-columns:auto auto auto;align-items:start;column-gap:8px">
        <div>
          <div style="color:${dem};font-size:12px;font-weight:600">D ${race.dVotes.toLocaleString()}</div>
          <div style="color:${dem};opacity:0.9;font-size:11px">(${race.dPct.toFixed(1)}%)</div>
        </div>
        <div>
          <div style="color:${rep};font-size:12px;font-weight:600">R ${race.rVotes.toLocaleString()}</div>
          <div style="color:${rep};opacity:0.9;font-size:11px">(${race.rPct.toFixed(1)}%)</div>
        </div>
        <div style="color:${marginColor};font-size:14px;line-height:1;font-weight:700;padding-top:1px;white-space:nowrap">${marginStr}</div>
      </div>
    </div>`;
}

export default function OH31MapLeaflet2020({ activeRace, darkMode, onReady, townshipFilter, raceLabel }: Props) {
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const t = darkMode ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    fetch("/oh31_2020_precincts.geojson")
      .then((r) => r.json())
      .then((data: GeoData) => setGeoData(data));
  }, []);

  const tileUrl = darkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const styleFeature: StyleFunction = (feature) => {
    const name = (feature?.properties?.NAME20 as string) ?? "";
    const precinct = oh31ByPrecinct2020[name];
    const race = precinct?.[activeRace];
    const matches = !precinct || matchesTownshipFilter(precinct.township, townshipFilter);
    return {
      fillColor: matches && race ? getRaceColor(race.dPct - race.rPct) : darkMode ? "#3a4455" : "#a8b0ba",
      fillOpacity: matches ? 0.65 : 0.45,
      color: darkMode ? "#0d1117" : "#f6f8fa",
      weight: matches ? 0.8 : 0.3,
    } as PathOptions;
  };

  const onEachFeature = (feature: PrecinctFeature, layer: Layer) => {
    const name = (feature?.properties?.NAME20 as string) ?? "";
    const precinct = oh31ByPrecinct2020[name];
    if (!precinct) return;
    if (!matchesTownshipFilter(precinct.township, townshipFilter)) return;

    const pathLayer = layer as L.Path;

    layer.bindTooltip(buildTooltipHtml(precinct, activeRace, raceLabel, t), {
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
      <div style={{ height: 520, display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--oh31-map-unfilled)", borderRadius: 12, border: "1px solid var(--app-border)" }}>
        <span style={{ color: t.textMuted, fontSize: 14 }}>Loading map…</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .oh31-tooltip { background: transparent !important; border: none !important;
          box-shadow: none !important; padding: 0 !important; }
        .oh31-tooltip::before { display: none !important; }
        .leaflet-container { font-family: inherit; z-index: 0; }
        .leaflet-pane,
        .leaflet-top,
        .leaflet-bottom { z-index: 1; }
      `}</style>

      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--app-border)", height: 520, position: "relative", zIndex: 0 }}>
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
          <GeoJSON
            key={`2020-${activeRace}-${darkMode}-${townshipFilter}`}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        </MapContainer>
      </div>
    </>
  );
}
