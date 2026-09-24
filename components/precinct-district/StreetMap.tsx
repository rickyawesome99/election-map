"use client";

// The street-context renderer: the same units and colors as ExplorerMap, drawn over a CARTO
// basemap with Leaflet so a reader can see roads, subdivisions and landmarks under the precincts.
// Loaded on demand by the explorer (dynamic import, no SSR).

import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L, { type Layer, type PathOptions } from "leaflet";
import type { Feature, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import type { PrecinctFC, PrecinctFeatureProps } from "./ExplorerMap";

function FitBounds({ fc }: { fc: PrecinctFC }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.geoJSON(fc as never).getBounds(), { padding: [24, 24] });
  }, [fc, map]);
  return null;
}

export interface StreetMapProps {
  fc: PrecinctFC;
  unitOf: (p: PrecinctFeatureProps) => string;
  colorFor: (unit: string) => string | null;
  isDimmed: (unit: string) => boolean;
  selectedUnit: string | null;
  onSelect: (unit: string | null) => void;
  tooltipHtml: (unit: string) => string;
  darkMode: boolean;
  styleKey: string;
  height?: number | string;
}

export default function StreetMap({ fc, unitOf, colorFor, isDimmed, selectedUnit, onSelect, tooltipHtml, darkMode, styleKey, height }: StreetMapProps) {
  const tileUrl = darkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const baseStroke = darkMode ? "#0d1117" : "#f6f8fa";

  const styleFeature = (feature?: Feature<Geometry, PrecinctFeatureProps>): PathOptions => {
    const unit = feature ? unitOf(feature.properties) : "";
    const dimmed = isDimmed(unit);
    const color = colorFor(unit);
    const selected = unit === selectedUnit;
    return {
      fillColor: !dimmed && color ? color : darkMode ? "#3a4455" : "#a8b0ba",
      fillOpacity: dimmed ? 0.35 : selected ? 0.85 : 0.62,
      color: selected ? "#ffffff" : baseStroke,
      weight: selected ? 2 : dimmed ? 0.3 : 0.8,
    };
  };

  const onEach = (feature: Feature<Geometry, PrecinctFeatureProps>, layer: Layer) => {
    const unit = unitOf(feature.properties);
    if (isDimmed(unit)) return;
    const path = layer as L.Path;
    layer.bindTooltip(tooltipHtml(unit), { sticky: true, opacity: 1, className: "precinct-street-tooltip" });
    layer.on({
      mouseover: () => { path.setStyle({ fillOpacity: 0.85, weight: 2, color: "#ffffff" }); path.bringToFront(); },
      mouseout: () => { path.setStyle(styleFeature(feature)); },
      click: () => onSelect(selectedUnit === unit ? null : unit),
    });
  };

  return (
    <>
      <style>{`
        .precinct-street-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .precinct-street-tooltip::before { display: none !important; }
        .leaflet-container { font-family: inherit; z-index: 0; }
        .leaflet-pane, .leaflet-top, .leaflet-bottom { z-index: 1; }
      `}</style>
      <div className="overflow-hidden rounded-xl" style={{ height: height ?? "min(70vh, 560px)", position: "relative", zIndex: 0, border: "1px solid var(--app-border)" }}>
        <MapContainer center={[41.13, -81.57]} zoom={11} style={{ height: "100%", width: "100%" }} zoomControl scrollWheelZoom doubleClickZoom={false}>
          <FitBounds fc={fc} />
          <TileLayer url={tileUrl} attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <GeoJSON key={`${styleKey}-${darkMode}-${selectedUnit ?? ""}`} data={fc as never} style={styleFeature as never} onEachFeature={onEach as never} />
        </MapContainer>
      </div>
    </>
  );
}
