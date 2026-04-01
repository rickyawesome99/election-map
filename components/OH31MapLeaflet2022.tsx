"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L, { type Layer, type PathOptions, type StyleFunction } from "leaflet";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { getRaceColor } from "@/lib/colorScale";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { oh31PrecinctCodeToName2022, oh31ByPrecinct2022 } from "@/data/oh31PrecinctData2022";
import { matchesTownshipFilter, type TownshipFilter } from "@/lib/oh31Analysis";

type RaceKey = "stRep" | "pres" | "senate" | "uSHouse";
type PrecinctFeature = Feature<Geometry, GeoJsonProperties>;
type GeoData = { type: "FeatureCollection"; features: PrecinctFeature[] };
type PropsMap = Record<string, number>;

function getVotes(props: PropsMap, raceKey: RaceKey): { d: number; r: number } {
  if (raceKey === "pres") {
    return { d: props.G22GOVDWHA ?? 0, r: props.G22GOVRDEW ?? 0 };
  }
  if (raceKey === "senate") {
    return { d: props.G22USSDRYA ?? 0, r: props.G22USSRVAN ?? 0 };
  }
  let d = 0, r = 0;
  for (const [key, val] of Object.entries(props)) {
    if (typeof val !== "number" || val === 0) continue;
    if (raceKey === "uSHouse") {
      if (/^GCON\d+D/.test(key)) d += val;
      else if (/^GCON\d+R/.test(key)) r += val;
    } else {
      // stRep: State House (GSL fields)
      if (/^GSL\d+D/.test(key)) d += val;
      else if (/^GSL\d+R/.test(key)) r += val;
    }
  }
  return { d, r };
}

function getMargin(props: PropsMap, raceKey: RaceKey): number | null {
  const { d, r } = getVotes(props, raceKey);
  const total = d + r;
  return total > 0 ? ((d - r) / total) * 100 : null;
}


function buildTooltipHtml(
  props: PropsMap,
  name: string,
  activeRace: RaceKey,
  raceLabel: string,
  t: typeof DARK_THEME
): string {
  const bg = t.panel, border = t.border, text = t.textPrimary, muted = t.textMuted;
  const dem = t.demText, rep = t.repText;

  const { d, r } = getVotes(props, activeRace);
  const total = d + r;
  const dPct = total > 0 ? (d / total) * 100 : 0;
  const rPct = total > 0 ? (r / total) * 100 : 0;
  const margin = dPct - rPct;
  const marginStr = margin >= 0 ? `D+${margin.toFixed(1)}%` : `R+${Math.abs(margin).toFixed(1)}%`;
  const marginColor = margin >= 0 ? dem : rep;

  const govData = getVotes(props, "pres");
  const ballots = govData.d + govData.r;

  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 12px;min-width:210px;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
      <div style="font-weight:600;font-size:13px;color:${text};margin-bottom:2px">${name}</div>
      <div style="font-size:10px;color:${muted};margin-bottom:8px">${raceLabel} · ${ballots.toLocaleString()} ballots</div>
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="color:${dem}">D ${d.toLocaleString()} (${dPct.toFixed(1)}%)</span>
        <span style="color:${marginColor};font-weight:600">${marginStr}</span>
        <span style="color:${rep}">R ${r.toLocaleString()} (${rPct.toFixed(1)}%)</span>
      </div>
    </div>`;
}

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

export default function OH31MapLeaflet2022({ activeRace, darkMode, onReady, townshipFilter, raceLabel }: Props) {
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const t = darkMode ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    fetch("/oh31_2022_precincts.geojson")
      .then((r) => r.json())
      .then((data: GeoData) => setGeoData(data));
  }, []);

  const tileUrl = darkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const styleFeature: StyleFunction = (feature) => {
    const props = (feature?.properties ?? {}) as PropsMap;
    const code = (feature?.properties?.PRECINCT as string) ?? "";
    const name = oh31PrecinctCodeToName2022[code] ?? code;
    const township = oh31ByPrecinct2022[name]?.township ?? "";
    const matches = !township || matchesTownshipFilter(township, townshipFilter);
    const margin = getMargin(props, activeRace);
    return {
      fillColor: matches && margin !== null ? getRaceColor(margin) : darkMode ? "#3a4455" : "#a8b0ba",
      fillOpacity: matches ? 0.65 : 0.45,
      color: darkMode ? "#0d1117" : "#f6f8fa",
      weight: matches ? 0.8 : 0.3,
    } as PathOptions;
  };

  const onEachFeature = (feature: PrecinctFeature, layer: Layer) => {
    const props = (feature?.properties ?? {}) as PropsMap;
    const code = (feature?.properties?.PRECINCT as string) ?? "";
    const name = oh31PrecinctCodeToName2022[code] ?? code;
    const township = oh31ByPrecinct2022[name]?.township ?? "";
    if (township && !matchesTownshipFilter(township, townshipFilter)) return;

    const pathLayer = layer as L.Path;

    layer.bindTooltip(buildTooltipHtml(props, name, activeRace, raceLabel, t), {
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
            key={`2022-${activeRace}-${darkMode}-${townshipFilter}`}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        </MapContainer>
      </div>
    </>
  );
}
