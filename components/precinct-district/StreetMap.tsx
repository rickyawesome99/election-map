"use client";

// The street-context renderer: the same units and colors as ExplorerMap, drawn over a CARTO
// basemap with MapLibre (continuous zoom, same engine as DistrictFinderMap) so a reader can see
// roads, subdivisions and landmarks under the precincts.
// Loaded on demand by the explorer (dynamic import, no SSR).

import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry, Position } from "geojson";
import type { PrecinctFC, PrecinctFeatureProps } from "./ExplorerMap";

// OpenFreeMap vector styles: free, no API key (CARTO's raster basemaps now watermark keyless requests).
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";
const SOURCE = "precincts";
const PRECINCT_LAYERS = ["precinct-fill", "precinct-line", "precinct-highlight"];

// Per-feature paint values, baked into the GeoJSON so the layers can read them with ["get", …].
type StyledProps = { unit: string; dimmed: boolean; fill: string; fillOpacity: number; stroke: string; strokeWidth: number; selected: boolean };

// Precinct layers go under the basemap's first label layer so street and place names stay readable.
function firstSymbolLayer(style: StyleSpecification): string | undefined {
  return style.layers.find((l) => l.type === "symbol" && !PRECINCT_LAYERS.includes(l.id))?.id;
}

function boundsOf(fc: PrecinctFC): maplibregl.LngLatBoundsLike | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (typeof (c as Position)[0] === "number") {
      const [x, y] = c as Position;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else (c as unknown[]).forEach(visit);
  };
  for (const f of fc.features) {
    const g = f.geometry as Geometry;
    if (g && "coordinates" in g) visit(g.coordinates);
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Handlers are registered once on the map; they read the latest props through this ref.
  const live = useRef({ onSelect, tooltipHtml, selectedUnit });
  live.current = { onSelect, tooltipHtml, selectedUnit };

  const styled = useMemo<FeatureCollection<Geometry, StyledProps>>(() => {
    const baseStroke = darkMode ? "#0d1117" : "#f6f8fa";
    return {
      type: "FeatureCollection",
      features: fc.features.map((f, i) => {
        const unit = unitOf(f.properties);
        const dimmed = isDimmed(unit);
        const color = colorFor(unit);
        const selected = unit === selectedUnit;
        return {
          type: "Feature",
          id: i,
          geometry: f.geometry,
          properties: {
            unit,
            dimmed,
            fill: !dimmed && color ? color : darkMode ? "#3a4455" : "#a8b0ba",
            fillOpacity: dimmed ? 0.35 : selected ? 0.85 : 0.62,
            stroke: selected ? "#ffffff" : baseStroke,
            strokeWidth: selected ? 2 : dimmed ? 0.3 : 0.8,
            selected,
          },
        };
      }),
    };
    // styleKey stands in for the inputs baked into colorFor/isDimmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, styleKey, darkMode, selectedUnit]);
  const styledRef = useRef(styled);
  styledRef.current = styled;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMode ? DARK_STYLE : LIGHT_STYLE,
      center: [-81.57, 41.13],
      zoom: 9,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      doubleClickZoom: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "precinct-street-tooltip", maxWidth: "none", offset: 12 });
    let hoverId: number | null = null;
    const setHover = (id: number | null) => {
      if (hoverId !== null) map.setFeatureState({ source: SOURCE, id: hoverId }, { hover: false });
      hoverId = id;
      if (id !== null) map.setFeatureState({ source: SOURCE, id }, { hover: true });
    };

    map.on("load", () => {
      map.addSource(SOURCE, { type: "geojson", data: styledRef.current });
      const before = firstSymbolLayer(map.getStyle());
      map.addLayer({
        id: "precinct-fill", type: "fill", source: SOURCE,
        paint: {
          "fill-color": ["get", "fill"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, ["get", "fillOpacity"]],
        },
      }, before);
      map.addLayer({
        id: "precinct-line", type: "line", source: SOURCE,
        paint: { "line-color": ["get", "stroke"], "line-width": ["get", "strokeWidth"] },
      }, before);
      // Hovered + selected outlines drawn last so they sit on top of neighbours' strokes.
      map.addLayer({
        id: "precinct-highlight", type: "line", source: SOURCE,
        paint: {
          "line-color": "#ffffff",
          "line-width": 2,
          "line-opacity": ["case", ["any", ["boolean", ["feature-state", "hover"], false], ["get", "selected"]], 1, 0],
        },
      }, before);
      const b = boundsOf(fc);
      if (b) map.fitBounds(b, { padding: 24, duration: 0 });
    });

    map.on("mousemove", "precinct-fill", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const props = f?.properties as StyledProps | undefined;
      if (!f || !props || props.dimmed) {
        setHover(null); popup.remove(); map.getCanvas().style.cursor = "";
        return;
      }
      if (f.id !== hoverId) {
        setHover(f.id as number);
        popup.setHTML(live.current.tooltipHtml(props.unit));
      }
      popup.setLngLat(e.lngLat).addTo(map);
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "precinct-fill", () => {
      setHover(null); popup.remove(); map.getCanvas().style.cursor = "";
    });
    map.on("click", "precinct-fill", (e: MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties as StyledProps | undefined;
      if (!props || props.dimmed) return;
      const { onSelect: select, selectedUnit: current } = live.current;
      select(current === props.unit ? null : props.unit);
    });

    return () => { popup.remove(); map.remove(); mapRef.current = null; };
    // The map instance is created once; data, tiles and bounds are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(styled);
  }, [styled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE)) return;
    const b = boundsOf(fc);
    if (b) map.fitBounds(b, { padding: 24, duration: 0 });
  }, [fc]);

  // Swapping the basemap style would drop the precinct source/layers, so carry them across.
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(darkMode ? DARK_STYLE : LIGHT_STYLE, {
      transformStyle: (prev, next) => {
        if (!prev?.sources[SOURCE]) return next;
        const ours = prev.layers.filter((l) => PRECINCT_LAYERS.includes(l.id)) as LayerSpecification[];
        const at = next.layers.findIndex((l) => l.type === "symbol");
        const layers = at < 0 ? [...next.layers, ...ours] : [...next.layers.slice(0, at), ...ours, ...next.layers.slice(at)];
        return { ...next, sources: { ...next.sources, [SOURCE]: { type: "geojson", data: styledRef.current } }, layers };
      },
    });
  }, [darkMode]);

  return (
    <>
      <style>{`
        .precinct-street-tooltip .maplibregl-popup-content { background: transparent; box-shadow: none; padding: 0; }
        .precinct-street-tooltip .maplibregl-popup-tip { display: none; }
        .precinct-street-tooltip { pointer-events: none; }
      `}</style>
      <div className="overflow-hidden rounded-xl" style={{ height: height ?? "min(70vh, 560px)", position: "relative", zIndex: 0, border: "1px solid var(--app-border)" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </div>
    </>
  );
}
