"use client";

import { useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

interface Props {
  darkMode: boolean;
  pinPosition: [number, number] | null;  // where the pin sits (search + map click)
  flyTarget: [number, number] | null;    // where to animate to (search only)
  statesGeoJSON: FeatureCollection | null;
  congressionalGeoJSON: FeatureCollection | null;
  highlightCdGEOID: string | null;
  resetTrigger: number;
  onMoved: (moved: boolean) => void;
  onMapClick: (lat: number, lng: number) => void;
}

function MapController({
  flyTarget,
  resetTrigger,
  onMoved,
}: {
  flyTarget: [number, number] | null;
  resetTrigger: number;
  onMoved: (moved: boolean) => void;
}) {
  const map = useMap();
  const lastFlyKey = useRef("");
  const lastResetTrigger = useRef(resetTrigger);

  // Fly to search result
  useEffect(() => {
    if (!flyTarget) return;
    const key = flyTarget.join(",");
    if (key === lastFlyKey.current) return;
    lastFlyKey.current = key;
    map.flyTo(flyTarget, 10, { duration: 1 });
  }, [flyTarget, map]);

  // Reset to default US view
  useEffect(() => {
    if (resetTrigger === lastResetTrigger.current) return;
    lastResetTrigger.current = resetTrigger;
    map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
  }, [resetTrigger, map]);

  const handleMoveEnd = useCallback(() => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const defaultLatLng = L.latLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    const hasMoved =
      center.distanceTo(defaultLatLng) > 80_000 || Math.abs(zoom - DEFAULT_ZOOM) > 0.6;
    onMoved(hasMoved);
  }, [map, onMoved]);

  useEffect(() => {
    map.on("moveend", handleMoveEnd);
    return () => { map.off("moveend", handleMoveEnd); };
  }, [map, handleMoveEnd]);

  return null;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const HIGHLIGHT = {
  color: "#3b82f6",
  weight: 2.5,
  fillColor: "#3b82f6",
  fillOpacity: 0.22,
};

export default function DistrictFinderMap({
  darkMode,
  pinPosition,
  flyTarget,
  statesGeoJSON,
  congressionalGeoJSON,
  highlightCdGEOID,
  resetTrigger,
  onMoved,
  onMapClick,
}: Props) {
  const tileUrl = darkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const pinIcon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#ef4444;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    className: "",
  });

  const borderColor = darkMode ? "#4b5563" : "#9ca3af";
  const faintBorder = darkMode ? "#374151" : "#cbd5e1";

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: "100%", height: "100%", cursor: "crosshair" }}
      attributionControl={false}
    >
      <TileLayer url={tileUrl} />

      {statesGeoJSON && (
        <GeoJSON
          key="states"
          data={statesGeoJSON}
          style={() => ({
            color: faintBorder,
            weight: 0.6,
            fillColor: "transparent",
            fillOpacity: 0,
          })}
        />
      )}

      {congressionalGeoJSON && (
        <GeoJSON
          key={`cd-${highlightCdGEOID}`}
          data={congressionalGeoJSON}
          style={(feat?: Feature) => {
            if (feat?.properties?.GEOID === highlightCdGEOID) return HIGHLIGHT;
            return { color: borderColor, weight: 0.8, fillColor: "transparent", fillOpacity: 0 };
          }}
        />
      )}

      {pinPosition && <Marker position={pinPosition} icon={pinIcon} />}
      <MapController flyTarget={flyTarget} resetTrigger={resetTrigger} onMoved={onMoved} />
      <MapClickHandler onClick={onMapClick} />
    </MapContainer>
  );
}
