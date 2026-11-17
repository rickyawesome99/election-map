"use client";

// The state view of /precincts: ONE state's precincts on a clean background, nothing else on the map.
// MapLibre draws the state's PMTiles archive from /public. Tiles carry only the precinct id: results
// are joined in the browser through feature-state, so one geometry serves every year and office and a
// data fix never re-tiles. Roads and place names stay hidden until the reader zooms in far enough to
// need them. Loaded on demand (dynamic import, no SSR); the parent remounts it per state and per theme.

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import CountyTooltip, { type CountyTooltipProps } from "@/components/CountyTooltip";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { resultCard } from "./cards";
import { MARGIN_STEPS, marginOf, type Office, type StateIndex, type StateResults, type StateShell } from "./types";

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";
const LAYER = "precincts"; // source-layer name written by scripts/precincts/build_tiles.py
const SRC = "state";
const STREETS_ZOOM = 9; // roads and place names appear from here in

let protocolRegistered = false;
function registerPmtiles() {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

const ratingColor = (input: ExpressionSpecification): ExpressionSpecification => ["step", input, ...MARGIN_STEPS] as unknown as ExpressionSpecification;

export interface PrecinctMapProps {
  shell: StateShell;
  year: number;
  office: Office;
  darkMode: boolean;
  results: StateResults | null;
  index: StateIndex | null;
  selectedPid: number | null;
  onSelect: (pid: number | null) => void;
  onMoved: (moved: boolean) => void;
  resetNonce: number;
}

export default function PrecinctMap(props: PrecinctMapProps) {
  const { shell, darkMode } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const live = useRef(props);
  useEffect(() => { live.current = props; });
  const [ready, setReady] = useState(false);
  // The hover box is the site's shared county card, placed by useMapTooltip (no re-render per mouse move).
  const [card, setCard] = useState<CountyTooltipProps | null>(null);
  const tip = useMapTooltip(14, 8);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPmtiles();
    const bounds: [[number, number], [number, number]] = [[shell.bbox[0], shell.bbox[1]], [shell.bbox[2], shell.bbox[3]]];
    const padX = (shell.bbox[2] - shell.bbox[0]) * 0.6 + 0.5, padY = (shell.bbox[3] - shell.bbox[1]) * 0.6 + 0.5;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMode ? DARK_STYLE : LIGHT_STYLE,
      bounds,
      fitBoundsOptions: { padding: 24 },
      // The map is this state only: panning stops a little way past its edges.
      maxBounds: [[shell.bbox[0] - padX, Math.max(-85, shell.bbox[1] - padY)], [shell.bbox[2] + padX, Math.min(85, shell.bbox[3] + padY)]],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      maxZoom: 15,
    });
    mapRef.current = map;
    // The whole-state view is as far out as the map goes: readers can zoom in, never out past it.
    // (Re-fitted on resize, so rotating a phone or widening the window keeps the state in frame.)
    // Never below the archive's own min zoom either: MapLibre draws nothing there, so a state too big
    // for the window (Alaska, or Texas on a phone) would go blank instead of staying in view, cropped.
    let tileMin = 0;
    const lockOut = () => {
      const cam = map.cameraForBounds(bounds, { padding: 24 });
      if (cam?.zoom === undefined) return;
      const min = Math.max(0, cam.zoom - 0.01, tileMin);
      map.setMinZoom(min);
      if (map.getZoom() < min) map.setZoom(min);
    };
    lockOut();
    map.on("resize", lockOut);
    const onSource = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId !== SRC || !e.isSourceLoaded) return;
      tileMin = (map.getSource(SRC) as maplibregl.VectorTileSource | undefined)?.minzoom ?? 0;
      map.off("sourcedata", onSource);
      lockOut();
    };
    map.on("sourcedata", onSource);
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    const neutral = darkMode ? "#39424f" : "#c9ced6";
    const outline = darkMode ? "#0d1117" : "#faf9f6";

    map.on("load", () => {
      // Clean background: the basemap's land, water, roads and labels stay hidden until the reader is
      // close enough to need them for orientation, then show through the precincts.
      const pageBg = getComputedStyle(document.documentElement).getPropertyValue("--app-bg").trim() || (darkMode ? "#0d1117" : "#faf9f6");
      for (const l of map.getStyle().layers) {
        if (l.type === "background") map.setPaintProperty(l.id, "background-color", pageBg);
        else map.setLayerZoomRange(l.id, Math.max(l.minzoom ?? 0, STREETS_ZOOM), l.maxzoom ?? 24);
      }
      const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addSource(SRC, { type: "vector", url: `pmtiles://${window.location.origin}/precincts/tiles/${shell.abbr}.pmtiles` });
      map.addLayer({
        id: "precinct-fill", type: "fill", source: SRC, "source-layer": LAYER,
        paint: {
          "fill-color": ["case", ["boolean", ["feature-state", "has"], false], ratingColor(["number", ["feature-state", "m"], 0]), neutral],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 0.85, 13, 0.62],
          "fill-antialias": false,
        },
      }, before);
      map.addLayer({
        id: "precinct-line", type: "line", source: SRC, "source-layer": LAYER, minzoom: 7,
        paint: { "line-color": outline, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.15, 10, 0.5, 13, 1.1], "line-opacity": 0.8 },
      }, before);
      map.addLayer({
        id: "precinct-highlight", type: "line", source: SRC, "source-layer": LAYER,
        paint: {
          "line-color": darkMode ? "#ffffff" : "#111111",
          "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.6, 1.8],
          "line-opacity": ["case", ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "sel"], false]], 1, 0],
        },
      }, before);
      setReady(true);
    });

    let hoverId: number | null = null;
    const setHover = (id: number | null) => {
      if (hoverId !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id: hoverId }, { hover: false });
      hoverId = id;
      if (id !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id }, { hover: true });
    };
    map.on("mousemove", "precinct-fill", (e) => {
      const f = e.features?.[0];
      if (!f || f.id === undefined) return;
      const pid = Number(f.id);
      if (pid !== hoverId) {
        setHover(pid);
        const { index, results, office } = live.current;
        const i = pid - shell.first;
        const county = index ? index.counties[index.county[i]]?.[1] : "";
        setCard(resultCard(index?.names[i] || `Precinct ${pid}`, county ? `${county}, ${shell.abbr}` : shell.name, results?.offices[office]?.[i], office));
      }
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "precinct-fill", () => { setHover(null); setCard(null); map.getCanvas().style.cursor = ""; });
    map.on("click", (e) => {
      const f = map.getLayer("precinct-fill") ? map.queryRenderedFeatures(e.point, { layers: ["precinct-fill"] })[0] : undefined;
      live.current.onSelect(f && f.id !== undefined ? Number(f.id) : null);
    });
    // Only reader gestures (they carry an originalEvent) count as moving away from the fitted view.
    map.on("moveend", (e) => { if ((e as { originalEvent?: Event }).originalEvent) live.current.onMoved(true); });

    return () => { setReady(false); map.remove(); mapRef.current = null; };
    // One map per state and theme (the parent keys on both); everything else arrives through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colour the precincts: on first data, and whenever the office (or the year's results) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.removeFeatureState({ source: SRC, sourceLayer: LAYER });
    const rows = props.results?.offices[props.office];
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        const m = marginOf(rows[i]);
        if (m !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id: shell.first + i }, { m, has: true });
      }
    }
    if (props.selectedPid !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id: props.selectedPid }, { sel: true });
    // selectedPid is re-applied here after a repaint; its own changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.results, props.office, shell.first]);

  // Selection outline.
  const prevSel = useRef<number | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (prevSel.current !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id: prevSel.current }, { sel: false });
    if (props.selectedPid !== null) map.setFeatureState({ source: SRC, sourceLayer: LAYER, id: props.selectedPid }, { sel: true });
    prevSel.current = props.selectedPid;
  }, [ready, props.selectedPid]);

  // "Reset view".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || props.resetNonce === 0) return;
    map.fitBounds([[shell.bbox[0], shell.bbox[1]], [shell.bbox[2], shell.bbox[3]]], { padding: 24, duration: 400 });
    live.current.onMoved(false);
  }, [props.resetNonce, ready, shell.bbox]);

  return (
    <div className="relative h-full w-full" onMouseMove={tip.onMouseMove} onMouseLeave={() => setCard(null)}>
      {card && <CountyTooltip {...card} boxRef={tip.tooltipRef} className="absolute z-20 hidden md:block" />}
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
