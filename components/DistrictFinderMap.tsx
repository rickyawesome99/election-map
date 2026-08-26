"use client";

import { useCallback, useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker, RasterTileSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";

const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const LIGHT_TILES = "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const DARK_TILES = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

interface Props {
  darkMode: boolean;
  pinPosition: [number, number] | null;
  flyTarget: [number, number] | null;
  statesGeoJSON: FeatureCollection | null;
  districtsGeoJSON: FeatureCollection | null;
  highlightCdGEOID: string | null;
  resetTrigger: number;
  onMoved: (moved: boolean) => void;
  onMapClick: (lat: number, lng: number) => void;
}

function makeStyle(darkMode: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [darkMode ? DARK_TILES : LIGHT_TILES],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    // "congressional-districts" source + its layers are added once districtsGeoJSON is ready
    // (see the districts-source effect below) — the source file is TopoJSON, converted to
    // GeoJSON client-side by DistrictFinder.tsx's loadDistrictsGeoJSON, so it can't be handed to
    // MapLibre as a plain source URL the way it used to be.
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

export default function DistrictFinderMap({
  darkMode,
  pinPosition,
  flyTarget,
  statesGeoJSON,
  districtsGeoJSON,
  highlightCdGEOID,
  resetTrigger,
  onMoved,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const lastFlyKey = useRef("");
  const lastResetTrigger = useRef(resetTrigger);
  const onMovedRef = useRef(onMoved);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => { onMovedRef.current = onMoved; }, [onMoved]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const reportMoved = useCallback((map: MapLibreMap) => {
    const center = map.getCenter();
    const defaultCenter = new maplibregl.LngLat(DEFAULT_CENTER[1], DEFAULT_CENTER[0]);
    const hasMoved = center.distanceTo(defaultCenter) > 80_000 || Math.abs(map.getZoom() - DEFAULT_ZOOM) > 0.6;
    onMovedRef.current(hasMoved);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(darkMode),
      center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]],
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.getCanvas().style.cursor = "crosshair";

    map.on("click", (event) => onMapClickRef.current(event.lngLat.lat, event.lngLat.lng));
    map.on("moveend", () => reportMoved(map));

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map instance must be created only once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMoved]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateTiles = () => {
      const source = map.getSource("carto") as RasterTileSource | undefined;
      source?.setTiles([darkMode ? DARK_TILES : LIGHT_TILES]);
    };
    if (map.isStyleLoaded()) updateTiles();
    else map.once("load", updateTiles);
  }, [darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !statesGeoJSON) return;

    const addOrUpdateStates = () => {
      const source = map.getSource("states") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(statesGeoJSON);
        return;
      }
      map.addSource("states", { type: "geojson", data: statesGeoJSON });
      map.addLayer({
        id: "state-outlines",
        type: "line",
        source: "states",
        paint: {
          "line-color": darkMode ? "#374151" : "#cbd5e1",
          "line-width": 0.6,
        },
      });
    };

    if (map.isStyleLoaded()) addOrUpdateStates();
    else map.once("load", addOrUpdateStates);
  }, [statesGeoJSON, darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !districtsGeoJSON) return;

    const addOrUpdateDistricts = () => {
      const source = map.getSource("congressional-districts") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(districtsGeoJSON);
        return;
      }
      map.addSource("congressional-districts", { type: "geojson", data: districtsGeoJSON });
      // Inserted below "state-outlines" (added by the states effect above) when it already
      // exists, so state boundaries keep drawing on top of district lines regardless of which
      // of the two datasets happens to finish loading first.
      const beforeLayer = map.getLayer("state-outlines") ? "state-outlines" : undefined;
      map.addLayer({
        id: "district-outlines",
        type: "line",
        source: "congressional-districts",
        paint: {
          "line-color": darkMode ? "#6b7280" : "#64748b",
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 7, 1.15, 12, 1.75],
        },
      }, beforeLayer);
      map.addLayer({
        id: "selected-district-fill",
        type: "fill",
        source: "congressional-districts",
        filter: ["==", ["get", "GEOID"], highlightCdGEOID ?? ""],
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.22 },
      }, beforeLayer);
      map.addLayer({
        id: "selected-district-outline",
        type: "line",
        source: "congressional-districts",
        filter: ["==", ["get", "GEOID"], highlightCdGEOID ?? ""],
        paint: { "line-color": "#3b82f6", "line-width": 2.5 },
      }, beforeLayer);
    };

    if (map.isStyleLoaded()) addOrUpdateDistricts();
    else map.once("load", addOrUpdateDistricts);
    // darkMode/highlightCdGEOID are applied by their own effects below once the layers exist;
    // this effect only needs to (re-)run when the data itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtsGeoJSON]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("state-outlines")) {
      map.setPaintProperty("state-outlines", "line-color", darkMode ? "#374151" : "#cbd5e1");
    }
    if (map.getLayer("district-outlines")) {
      map.setPaintProperty("district-outlines", "line-color", darkMode ? "#6b7280" : "#64748b");
    }
  }, [darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const filter: maplibregl.FilterSpecification = ["==", ["get", "GEOID"], highlightCdGEOID ?? ""];
    if (map.getLayer("selected-district-fill")) map.setFilter("selected-district-fill", filter);
    if (map.getLayer("selected-district-outline")) map.setFilter("selected-district-outline", filter);
  }, [highlightCdGEOID]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    const key = flyTarget.join(",");
    if (key === lastFlyKey.current) return;
    lastFlyKey.current = key;
    map.flyTo({ center: [flyTarget[1], flyTarget[0]], zoom: 10, duration: 1000 });
  }, [flyTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetTrigger === lastResetTrigger.current) return;
    lastResetTrigger.current = resetTrigger;
    map.flyTo({ center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]], zoom: DEFAULT_ZOOM, duration: 800 });
  }, [resetTrigger]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!pinPosition) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const element = document.createElement("div");
      element.style.cssText = "width:14px;height:14px;background:#ef4444;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)";
      markerRef.current = new maplibregl.Marker({ element }).setLngLat([pinPosition[1], pinPosition[0]]).addTo(map);
    } else {
      markerRef.current.setLngLat([pinPosition[1], pinPosition[0]]);
    }
  }, [pinPosition]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
